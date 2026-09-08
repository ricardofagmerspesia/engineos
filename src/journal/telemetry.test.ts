import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { relocatedRoot, tempRoot } from '../testing/harness';
import {
  appendEvent,
  jqCompact,
  parseAppendArgs,
  TelemetryError,
  TelemetryUsageError,
  usage,
  validateTelemetry,
} from './telemetry';

const TS = '2026-08-06T00:00:00Z';

// One root per test, carrying a copy of the checkout's registries: the event ids
// and the value pattern under test are the ones the hooks really append against,
// so a registry change that would break a hook breaks a case here first.
function root(t: TestContext): string {
  return relocatedRoot(tempRoot(t));
}

function target(t: TestContext, name = 'events.jsonl'): string {
  return join(tempRoot(t), name);
}

function append(dir: string, file: string, options: { event: string; data: string; session?: string }): void {
  appendEvent(dir, file, { session: options.session ?? 's1', event: options.event, data: options.data, ts: TS });
}

function refuses(fn: () => void, message: string): void {
  assert.throws(fn, (e: unknown) => e instanceof TelemetryError && e.message === message);
}

test('append writes the exact line jq -c wrote, keys in construction order', (t) => {
  const dir = root(t);
  const file = target(t);
  append(dir, file, { event: 'route', data: '{"escalate":true,"intents":["backend","mobile"]}' });
  assert.equal(
    readFileSync(file, 'utf8'),
    '{"ts":"2026-08-06T00:00:00Z","session_id":"s1","event":"route","data":{"escalate":true,"intents":["backend","mobile"]}}\n',
  );
});

test('append preserves the data object\'s own key order rather than sorting it', (t) => {
  const dir = root(t);
  const file = target(t);
  append(dir, file, { event: 'route', data: '{"agents":["a"],"escalate":true,"intents":["b"]}' });
  assert.match(readFileSync(file, 'utf8'), /"data":\{"agents":\["a"\],"escalate":true,"intents":\["b"\]\}/u);
});

test('append accepts booleans, numbers, strings and arrays of strings', (t) => {
  const dir = root(t);
  const file = target(t);
  append(dir, file, { event: 'verify', data: '{"failed":false,"targets":3}' });
  append(dir, file, { event: 'verify', data: '{"targets":["apps/api","apps/web"]}' });
  append(dir, file, { event: 'route', data: '{"reasons":[],"intents":[]}' });
  const lines = readFileSync(file, 'utf8').trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0] ?? '', /"data":\{"failed":false,"targets":3\}/u);
  assert.match(lines[1] ?? '', /"data":\{"targets":\["apps\/api","apps\/web"\]\}/u);
  assert.match(lines[2] ?? '', /"data":\{"reasons":\[\],"intents":\[\]\}/u);
});

test('append appends rather than truncating', (t) => {
  const dir = root(t);
  const file = target(t);
  append(dir, file, { event: 'route', data: '{}' });
  append(dir, file, { event: 'hitl', data: '{"required":true}' });
  assert.equal(readFileSync(file, 'utf8').split('\n').length, 3);
});

test('the --ts override round-trips and the default is a whole-second UTC stamp', (t) => {
  const dir = root(t);
  const file = target(t);
  append(dir, file, { event: 'route', data: '{}' });
  assert.match(readFileSync(file, 'utf8'), /^\{"ts":"2026-08-06T00:00:00Z"/u);

  const auto = target(t, 'auto.jsonl');
  appendEvent(dir, auto, { session: 's1', event: 'route', data: '{}' });
  assert.match(readFileSync(auto, 'utf8'), /^\{"ts":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"/u);
});

test('append refuses an event id the registry does not carry', (t) => {
  const dir = root(t);
  const file = target(t);
  refuses(() => { append(dir, file, { event: 'bogus', data: '{}' }); }, 'unknown event: bogus');
});

test('append refuses a data key outside the event\'s keys', (t) => {
  const dir = root(t);
  const file = target(t);
  refuses(
    () => { append(dir, file, { event: 'route', data: '{"bogus_key":"x"}' }); },
    'data failed schema/value_pattern check for event route: {"bogus_key":"x"}',
  );
  // The key is valid for another event; membership is per event, not global.
  refuses(
    () => { append(dir, file, { event: 'route', data: '{"failed":true}' }); },
    'data failed schema/value_pattern check for event route: {"failed":true}',
  );
});

test('append refuses values the anti-prompt-text pattern rejects', (t) => {
  const dir = root(t);
  const file = target(t);
  for (const data of [
    '{"intents":["two words"]}',
    '{"agents":["ok","also fine but not"]}',
    '{"agents":[""]}',
    '{"intents":{"a":1}}',
    '{"escalate":null}',
  ]) {
    refuses(
      () => { append(dir, file, { event: 'route', data }); },
      `data failed schema/value_pattern check for event route: ${data}`,
    );
  }
});

test('append refuses a data payload that is not an object', (t) => {
  const dir = root(t);
  const file = target(t);
  refuses(() => { append(dir, file, { event: 'route', data: '[]' }); }, 'data failed schema/value_pattern check for event route: []');
  refuses(() => { append(dir, file, { event: 'route', data: '0' }); }, 'data failed schema/value_pattern check for event route: 0');
});

// jq -e exits 1 on `false` and on `null`, so scripts/telemetry.sh reports both as
// invalid JSON. The port keeps the message rather than the truth.
test('append reports unparseable --data, and `false`/`null`, as not valid JSON', (t) => {
  const dir = root(t);
  const file = target(t);
  for (const data of ['not json', 'false', 'null']) {
    refuses(() => { append(dir, file, { event: 'route', data }); }, `--data is not valid JSON: ${data}`);
  }
});

test('append checks the event before it parses --data', (t) => {
  const dir = root(t);
  const file = target(t);
  refuses(() => { append(dir, file, { event: 'bogus', data: 'not json' }); }, 'unknown event: bogus');
});

test('a root with no policy.json is refused by name', (t) => {
  const dir = tempRoot(t);
  refuses(() => { append(dir, join(dir, 'x.jsonl'), { event: 'route', data: '{}' }); }, 'policy.json missing');
  refuses(() => { validateTelemetry(dir, __filename); }, 'policy.json missing');
});

test('append refuses a target it cannot write', (t) => {
  const dir = root(t);
  const file = join(dir, 'no', 'such', 'dir', 'events.jsonl');
  refuses(() => { append(dir, file, { event: 'route', data: '{}' }); }, `cannot append to ${file}`);
});

// ---------------------------------------------------------------- arg parsing

test('parseAppendArgs binds every flag and treats --ts as optional', () => {
  const parsed = parseAppendArgs(['/tmp/f', '--session', 's', '--event', 'route', '--data', '{}', '--ts', TS]);
  assert.deepEqual(parsed, { file: '/tmp/f', options: { session: 's', event: 'route', data: '{}', ts: TS } });
  const withoutTs = parseAppendArgs(['/tmp/f', '--session', 's', '--event', 'route', '--data', '{}']);
  assert.deepEqual(withoutTs.options, { session: 's', event: 'route', data: '{}' });
});

test('parseAppendArgs refuses a missing file, a missing flag, a dangling flag and an unknown flag', () => {
  const cases: string[][] = [
    [],
    ['/tmp/f', '--event', 'route', '--data', '{}'],
    ['/tmp/f', '--session', 's', '--data', '{}'],
    ['/tmp/f', '--session', 's', '--event', 'route'],
    ['/tmp/f', '--session', 's', '--event', 'route', '--data'],
    ['/tmp/f', '--session', 's', '--event', 'route', '--data', '{}', '--bogus', 'x'],
    ['/tmp/f', '--session', '', '--event', 'route', '--data', '{}'],
  ];
  for (const args of cases) {
    assert.throws(() => parseAppendArgs(args), TelemetryUsageError, `expected a usage refusal for ${JSON.stringify(args)}`);
  }
});

test('a repeated flag takes the last value, as the shell loop did', () => {
  const parsed = parseAppendArgs(['/tmp/f', '--session', 's1', '--session', 's2', '--event', 'route', '--data', '{}']);
  assert.equal(parsed.options.session, 's2');
});

test('usage is two lines, the second aligned under the first', () => {
  assert.equal(
    usage('scripts/telemetry.sh'),
    'usage: scripts/telemetry.sh append <file> --session SID --event ID --data JSON [--ts TS]\n'
    + '       scripts/telemetry.sh validate <file>\n',
  );
});

// ------------------------------------------------------------------- validate

function seed(t: TestContext, contents: string): string {
  const file = target(t, 'corpus.jsonl');
  writeFileSync(file, contents);
  return file;
}

test('validate accepts what append wrote', (t) => {
  const dir = root(t);
  const file = target(t);
  append(dir, file, { event: 'route', data: '{"escalate":true}' });
  append(dir, file, { event: 'verify', data: '{"failed":false,"targets":["apps/api"]}' });
  assert.deepEqual(validateTelemetry(dir, file), { lines: 2, bad: [] });
});

test('validate names every bad line by number', (t) => {
  const dir = root(t);
  const file = seed(t, [
    '{"ts":"t","session_id":"s1","event":"route","data":{}}',
    '{"ts":"t","session_id":"s1","event":"bogus","data":{}}',
    'not json',
    '{"ts":"","session_id":"s1","event":"route","data":{}}',
    '{"session_id":"s1","event":"route","data":{}}',
    '{"ts":"t","session_id":"","event":"route","data":{}}',
    '{"ts":"t","session_id":"s1","event":"route","data":{"intents":["two words"]}}',
    '{"ts":"t","session_id":"s1","event":"route","data":0}',
    '[1,2]',
    'null',
    '',
  ].join('\n') + '\n');
  assert.deepEqual(validateTelemetry(dir, file), { lines: 11, bad: [2, 3, 4, 5, 6, 7, 8, 9, 10] });
});

// `.data // empty` reads all three as no data at all, and the shell substitutes
// {} — so a line missing its data object validates. Ported, not corrected.
test('validate accepts a line whose data is absent, null or false', (t) => {
  const dir = root(t);
  const file = seed(t, [
    '{"ts":"t","session_id":"s1","event":"route"}',
    '{"ts":"t","session_id":"s1","event":"route","data":null}',
    '{"ts":"t","session_id":"s1","event":"route","data":false}',
  ].join('\n') + '\n');
  assert.deepEqual(validateTelemetry(dir, file), { lines: 3, bad: [] });
});

test('validate checks the final line even with no trailing newline', (t) => {
  const dir = root(t);
  const good = seed(t, '{"ts":"t","session_id":"s1","event":"route","data":{}}');
  assert.deepEqual(validateTelemetry(dir, good), { lines: 1, bad: [] });
  const bad = seed(t, '{"ts":"t","session_id":"s1","event":"bogus","data":{}}');
  assert.deepEqual(validateTelemetry(dir, bad), { lines: 1, bad: [1] });
});

test('validate counts blank lines in the total but never faults them', (t) => {
  const dir = root(t);
  assert.deepEqual(validateTelemetry(dir, seed(t, '')), { lines: 0, bad: [] });
  assert.deepEqual(validateTelemetry(dir, seed(t, '\n\n')), { lines: 2, bad: [] });
  assert.deepEqual(
    validateTelemetry(dir, seed(t, '\n{"ts":"t","session_id":"s1","event":"route","data":{}}\n\n')),
    { lines: 3, bad: [] },
  );
});

test('validate refuses a path that is not a file', (t) => {
  const dir = root(t);
  const missing = join(dir, 'nope.jsonl');
  refuses(() => { validateTelemetry(dir, missing); }, `no such file: ${missing}`);
  refuses(() => { validateTelemetry(dir, dir); }, `no such file: ${dir}`);
});

// --------------------------------------------------------------- jq -c bytes

test('jqCompact matches jq 1.6 where JSON.stringify does not', () => {
  // -0 keeps its sign; the exponent threshold is g_fmt's, not JavaScript's; the
  // exponent itself is padded to two digits.
  assert.equal(jqCompact(-0), '-0');
  assert.equal(jqCompact(0), '0');
  assert.equal(jqCompact(1e-6), '1e-06');
  assert.equal(jqCompact(1e-7), '1e-07');
  assert.equal(jqCompact(1.25e-5), '1.25e-05');
  assert.equal(jqCompact(1e-4), '0.0001');
  assert.equal(jqCompact(1e15), '1000000000000000');
  assert.equal(jqCompact(1e16), '1e+16');
  assert.equal(jqCompact(1.5e16), '15000000000000000');
  assert.equal(jqCompact(1.5e17), '1.5e+17');
  assert.equal(jqCompact(1e22), '1e+22');
  assert.equal(jqCompact(5e-324), '5e-324');
  assert.equal(jqCompact(123456789012345678901), '123456789012345680000');
  // U+007F is escaped by jq and emitted raw by JSON.stringify.
  assert.equal(jqCompact('a\u007Fb'), '"a\\u007fb"');
});

test('jqCompact agrees with JSON.stringify on everything else', () => {
  for (const value of [1, 100, 0.1, 1.5, -1.5, 1e21, true, false, null, 'x', ['a', 'b'], { a: 1, b: [true] }]) {
    assert.equal(jqCompact(value), JSON.stringify(value), `jqCompact drifted on ${JSON.stringify(value)}`);
  }
});
