import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { relocatedRoot, runInProcess, tempRoot, type RunResult } from '../testing/harness';
import { runTelemetry } from './telemetry-cli';
import { usage } from './telemetry';

const TS = '2026-08-06T00:00:00Z';
const USAGE = usage();

function root(t: TestContext): string {
  return relocatedRoot(tempRoot(t));
}

function run(dir: string, argv: string[]): RunResult {
  return runInProcess(runTelemetry, argv, { env: { ENGINEOS_ROOT: dir } });
}

function file(t: TestContext, contents = ''): string {
  const path = join(tempRoot(t), 'events.jsonl');
  writeFileSync(path, contents);
  return path;
}

function errorBody(result: RunResult): unknown {
  return JSON.parse(result.stdout);
}

test('append writes one line and says nothing', (t) => {
  const dir = root(t);
  const path = file(t);
  const result = run(dir, ['append', path, '--session', 's1', '--event', 'route', '--data', '{"escalate":true}', '--ts', TS]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(readFileSync(path, 'utf8'), `{"ts":"${TS}","session_id":"s1","event":"route","data":{"escalate":true}}\n`);
});

// err(): {"error": ...} on STDOUT with exit 1 — the convention the exec journal
// deliberately does not share.
test('a refused append answers {"error"} on stdout with exit 1', (t) => {
  const dir = root(t);
  const path = file(t);
  const result = run(dir, ['append', path, '--session', 's1', '--event', 'bogus', '--data', '{}']);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.deepEqual(errorBody(result), { error: 'unknown event: bogus' });
  assert.equal(readFileSync(path, 'utf8'), '');
});

test('a value carrying whitespace is refused and never reaches the file', (t) => {
  const dir = root(t);
  const path = file(t);
  const result = run(dir, ['append', path, '--session', 's1', '--event', 'route', '--data', '{"intents":["two words"]}']);
  assert.equal(result.status, 1);
  assert.deepEqual(errorBody(result), {
    error: 'data failed schema/value_pattern check for event route: {"intents":["two words"]}',
  });
  assert.equal(readFileSync(path, 'utf8'), '');
});

// usage(): two lines on STDERR with exit 1. Different stream, same exit code.
test('usage goes to stderr for an unknown subcommand, no subcommand, and a broken flag list', (t) => {
  const dir = root(t);
  const path = file(t);
  for (const argv of [
    [],
    ['bogus'],
    ['append'],
    ['validate'],
    ['append', path, '--session', 's1', '--event', 'route', '--data'],
    ['append', path, '--session', 's1', '--event', 'route'],
    ['append', path, '--session', 's1', '--event', 'route', '--data', '{}', '--bogus', 'x'],
  ]) {
    const result = run(dir, argv);
    assert.equal(result.status, 1, `expected exit 1 for ${JSON.stringify(argv)}`);
    assert.equal(result.stdout, '', `usage must not reach stdout for ${JSON.stringify(argv)}`);
    assert.equal(result.stderr, USAGE, `usage text differs for ${JSON.stringify(argv)}`);
  }
});

// The subcommand is dispatched before anything is resolved, so a root with no
// registries still answers usage rather than a registry error.
test('an unknown subcommand is usage even with no registries in sight', (t) => {
  const result = run(tempRoot(t), ['bogus']);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, USAGE);
});

test('validate reports the count on stdout when every line is valid', (t) => {
  const dir = root(t);
  const path = file(t, `{"ts":"t","session_id":"s1","event":"route","data":{}}\n`);
  const result = run(dir, ['validate', path]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${path}: 1 line(s), all valid\n`);
  assert.equal(result.stderr, '');
});

test('validate names each bad line, then the total, on stderr with exit 1', (t) => {
  const dir = root(t);
  const path = file(t, [
    '{"ts":"t","session_id":"s1","event":"route","data":{}}',
    '{"ts":"t","session_id":"s1","event":"bogus","data":{}}',
    'not json',
  ].join('\n') + '\n');
  const result = run(dir, ['validate', path]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    'line 2: does not match the telemetry schema\n'
    + 'line 3: does not match the telemetry schema\n'
    + `2 invalid line(s) in ${path}\n`,
  );
});

test('validate refuses a missing file with the error convention', (t) => {
  const dir = root(t);
  const missing = join(tempRoot(t), 'nope.jsonl');
  const result = run(dir, ['validate', missing]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.deepEqual(errorBody(result), { error: `no such file: ${missing}` });
});

test('a malformed telemetry block is refused by registry path, not answered', (t) => {
  const dir = relocatedRoot(tempRoot(t), {
    mutate: (policy) => {
      policy['telemetry'] = { home: 'x', retention_days: 90, value_pattern: '^x$', events: 'not-an-array' };
    },
  });
  const result = run(dir, ['append', file(t), '--session', 's1', '--event', 'route', '--data', '{}']);
  assert.equal(result.status, 1);
  assert.deepEqual(errorBody(result), {
    error: 'registries/policy.json: .telemetry.events must be an array of objects',
  });
});
