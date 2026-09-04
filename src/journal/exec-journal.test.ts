import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { relocatedRoot, tempRoot } from '../testing/harness';
import { appendLine, JournalError, parseAppendArgs, usage, validateFile } from './exec-journal';
import { EXEC_JOURNAL_FIELDS, journalRegistries, type FieldSpec, type JournalRegistries } from './schema';

// One case per GUARD CLASS, driven through the table, rather than one per field:
// the port derives every boundary from the same rows, so a per-field suite would
// assert the table twenty-two times and the classes once.

const STAMP = '2026-09-04T12:00:00Z';
const REQUIRED = ['--run-id', 'r1', '--capability-id', 'implement', '--model-tier', 'build', '--status', 'OK', '--tokens-in', '1', '--tokens-out', '2', '--duration-ms', '3'];

interface World { root: string; file: string; regs: JournalRegistries }

test('a v1 append carries agent and note as explicit nulls and no v2 key at all', (t) => {
  const w = world(t);
  append(w, REQUIRED);
  assert.equal(read(w), `{"timestamp":"${STAMP}","run_id":"r1","capability_id":"implement","agent":null,"model_tier":"build","status":"OK","tokens_in":1,"tokens_out":2,"duration_ms":3,"note":null}\n`);
});

test('a v2 append emits only the keys it was given, in table order', (t) => {
  const w = world(t);
  append(w, [...REQUIRED, '--trace-id', 'sess-1', '--span-kind', 'tool', '--cost-micros', '1200', '--cache-hit', 'false', '--risk', 'medium']);
  const row: unknown = JSON.parse(read(w).trim());
  assert.deepEqual(Object.keys(row as Record<string, unknown>), [
    'timestamp', 'run_id', 'capability_id', 'agent', 'model_tier', 'status',
    'tokens_in', 'tokens_out', 'duration_ms', 'note',
    'trace_id', 'span_kind', 'cost_micros', 'cache_hit', 'risk',
  ]);
  assert.deepEqual(row, {
    timestamp: STAMP, run_id: 'r1', capability_id: 'implement', agent: null,
    model_tier: 'build', status: 'OK', tokens_in: 1, tokens_out: 2, duration_ms: 3, note: null,
    trace_id: 'sess-1', span_kind: 'tool', cost_micros: 1200, cache_hit: false, risk: 'medium',
  });
});

test('the length bound is checked before any guard reads a value, and rejects rather than truncates', (t) => {
  const w = world(t);
  const bound = w.regs.execJournal.max_value_length;
  const over = 'a'.repeat(bound + 1);
  // A value that is over-long AND outside its class reports the LENGTH, so the
  // bound cannot be sidestepped by a payload the class would have refused.
  assert.throws(() => append(w, [...REQUIRED, '--trace-id', `${over} x`]), (e: unknown) => {
    assert.ok(e instanceof JournalError);
    assert.equal(e.message, `--trace-id must be at most ${bound} characters, got ${over.length + 2}`);
    return true;
  });
  assert.equal(read(w), '', 'an over-long value was truncated instead of rejected');
  // note is free text and still bounded: the class is not what enforces size.
  assert.throws(() => append(w, [...REQUIRED, '--note', over]), JournalError);
  assert.equal(read(w), '');
  append(w, [...REQUIRED, '--trace-id', 'a'.repeat(bound)]);
  assert.equal(readLines(w).length, 1, 'a value exactly at the bound was rejected');
});

test('every slug row refuses whitespace, a newline and an empty value on append', (t) => {
  const w = world(t);
  for (const spec of rowsOf('slug')) {
    for (const payload of ['has space', 'clean\nthen arbitrary text']) {
      assert.throws(
        () => append(w, [...REQUIRED, spec.flag, payload]),
        (e: unknown) => e instanceof JournalError && e.message.startsWith(`${spec.flag} must match `),
        `${spec.flag} accepted ${JSON.stringify(payload)}`,
      );
    }
    // An empty value reached the bash completeness test as an absent one
    // (`[ -n "$v" ]` on both): a required row answers usage, the defaulted
    // timestamp is filled in, and an optional row falls through to its guard.
    if (spec.name === 'timestamp') {
      append(w, [...REQUIRED, spec.flag, '']);
      assert.equal(lastRow(w)['timestamp'], STAMP, 'an empty timestamp was not defaulted');
    } else {
      assert.throws(
        () => append(w, [...REQUIRED, spec.flag, '']),
        (e: unknown) => e instanceof JournalError
          && (spec.presence === 'required' ? e.usage : e.message.startsWith(`${spec.flag} must match `)),
        `${spec.flag} accepted ""`,
      );
    }
  }
  assert.equal(readLines(w).length, 1, 'only the defaulted-timestamp append may land');
});

test('every enum row refuses a non-member and accepts each declared member', (t) => {
  const w = world(t);
  for (const spec of rowsOf('enum')) {
    assert.throws(() => append(w, [...REQUIRED, spec.flag, 'not-a-member']), JournalError, `${spec.flag}`);
    const members = spec.values === undefined ? [] : spec.values(w.regs);
    for (const member of members) append(w, [...REQUIRED, spec.flag, member]);
  }
  assert.ok(readLines(w).length > 0);
});

test('every int row refuses a negative, a fraction and a non-number, and accepts a leading zero', (t) => {
  const w = world(t);
  for (const spec of rowsOf('int')) {
    for (const payload of ['-5', '1.5', 'abc']) {
      assert.throws(
        () => append(w, [...REQUIRED, spec.flag, payload]),
        (e: unknown) => e instanceof JournalError && e.message === `${spec.flag} must be a non-negative integer, got: ${payload}`,
        `${spec.flag} accepted ${JSON.stringify(payload)}`,
      );
    }
    // Empty reads as unset, same as the slug rows: usage when the row is
    // required, the int guard's own text when it is optional.
    assert.throws(
      () => append(w, [...REQUIRED, spec.flag, '']),
      (e: unknown) => e instanceof JournalError
        && (spec.presence === 'required' ? e.usage : e.message === `${spec.flag} must be a non-negative integer, got: `),
      `${spec.flag} accepted ""`,
    );
    // "03" is a digit string but not valid JSON, which is why the emitter
    // converts rather than passing the text through to the encoder.
    append(w, [...REQUIRED, spec.flag, '03']);
    const row = lastRow(w);
    assert.equal(row[spec.name], 3, `${spec.flag} did not land as the number 3`);
  }
});

test('the free row takes text no other row would, and is emitted unescaped', (t) => {
  const w = world(t);
  append(w, [...REQUIRED, '--note', 'a human annotation, with "quotes" and a \\backslash']);
  assert.equal(lastRow(w)['note'], 'a human annotation, with "quotes" and a \\backslash');
});

test('the timestamp is defaulted before its guard, not trusted for being ours', (t) => {
  const w = world(t);
  assert.throws(
    () => { appendLine(w.root, w.file, [w.file, ...REQUIRED], () => 'has space', w.regs); },
    (e: unknown) => e instanceof JournalError && e.message.startsWith('--timestamp must match '),
    'a defaulted timestamp bypassed the slug guard',
  );
  assert.equal(read(w), '');
});

test('a defaulted timestamp inside the class is written as given', (t) => {
  const w = world(t);
  appendLine(w.root, w.file, [w.file, ...REQUIRED], () => STAMP, w.regs);
  assert.equal(lastRow(w)['timestamp'], STAMP);
  // An empty --timestamp reaches the default, exactly as the bash `-n` test did.
  appendLine(w.root, w.file, [w.file, ...REQUIRED, '--timestamp', ''], () => STAMP, w.regs);
  assert.equal(lastRow(w)['timestamp'], STAMP);
});

test('an incomplete append asks for the usage block, never a partial line', (t) => {
  const w = world(t);
  for (const argv of [['--run-id', 'r'], [...REQUIRED.slice(0, 4)], ['--run-id', '', '--capability-id', 'c', '--model-tier', 'build', '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '1']]) {
    assert.throws(() => append(w, argv), (e: unknown) => e instanceof JournalError && e.usage && e.message === '');
  }
  assert.equal(read(w), '');
});

test('an unknown flag names itself and then asks for the usage block', () => {
  assert.throws(() => parseAppendArgs(['f', '--bogus', 'x']), (e: unknown) => {
    assert.ok(e instanceof JournalError);
    assert.equal(e.message, 'unknown arg: --bogus');
    assert.equal(e.usage, true);
    return true;
  });
});

test('a flag with no value asks for the usage block rather than reading past the end', () => {
  assert.throws(() => parseAppendArgs(['f', '--span-kind']), (e: unknown) => e instanceof JournalError && e.usage && e.message === '');
  assert.throws(() => parseAppendArgs([]), (e: unknown) => e instanceof JournalError && e.usage);
});

test('parseAppendArgs maps flags to field names and keeps the last value for a repeated flag', () => {
  const parsed = parseAppendArgs(['/tmp/j.jsonl', '--run-id', 'a', '--run-id', 'b', '--cache-hit', 'true']);
  assert.equal(parsed.file, '/tmp/j.jsonl');
  assert.deepEqual(parsed.fields, { run_id: 'b', cache_hit: 'true' });
});

test('a missing models registry is named before anything is parsed', (t) => {
  const root = tempRoot(t);
  const w = world(t);
  assert.throws(
    () => appendLine(root, w.file, [w.file, ...REQUIRED], () => STAMP, w.regs),
    (e: unknown) => e instanceof JournalError && e.message === `no models registry at ${join(root, 'registries', 'models.json')}`,
  );
});

test('validate accepts what append wrote and counts every line', (t) => {
  const w = world(t);
  append(w, REQUIRED);
  append(w, [...REQUIRED, '--agent', 'backend-coordinator', '--note', 'text, with spaces', '--span-kind', 'agent']);
  assert.deepEqual(validateFile(w.root, w.file, w.regs), { lines: 2, bad: [] });
});

test('validate reports every bad line by number, and a blank line is counted but not judged', (t) => {
  const w = world(t);
  const valid = `{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}`;
  write(w, `nonsense\n${valid}\n\n{"run_id":"r"}\n`);
  assert.deepEqual(validateFile(w.root, w.file, w.regs), { lines: 4, bad: [1, 4] });
});

test('validate reads a final line that carries no trailing newline', (t) => {
  const w = world(t);
  write(w, `{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":-1,"tokens_out":1,"duration_ms":1,"note":null}`);
  assert.deepEqual(validateFile(w.root, w.file, w.regs), { lines: 1, bad: [1] });
});

test('validate guards on the LAST span field as well as the first', (t) => {
  const w = world(t);
  write(w, `{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null,"trace_id":"bad id","route":"good"}\n`);
  assert.equal(validateFile(w.root, w.file, w.regs).bad.length, 1);
  write(w, `{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null,"trace_id":"good","route":"bad id"}\n`);
  assert.equal(validateFile(w.root, w.file, w.regs).bad.length, 1);
});

test('validate enumerates the same rows append does, on a journal this CLI did not write', (t) => {
  const w = world(t);
  const forged = (patch: Record<string, unknown>): string => JSON.stringify({
    timestamp: 't', run_id: 'r', capability_id: 'c', agent: null,
    model_tier: 'build', status: 'OK', tokens_in: 0, tokens_out: 0, duration_ms: 1, note: null,
    ...patch,
  });
  for (const patch of [
    { status: 'it went fine, mostly' },
    { status: 'ok' },
    { model_tier: 'build\nSECRET=leaked' },
    { model_tier: 'wizard' },
    { span_kind: 'bogus' },
    { risk: 'critical' },
    { cache_hit: 'true' },
    { cost_micros: -1 },
    { retry_attempt: 1.5 },
    { run_id: 'sess 1' },
    { agent: 'a\nSECRET=x y' },
    { trace_id: 'ok\n' },
  ]) {
    write(w, `${forged(patch)}\n`);
    assert.deepEqual(validateFile(w.root, w.file, w.regs).bad, [1], `validate accepted ${JSON.stringify(patch)}`);
  }
  // ... and the other direction, so none of the above is satisfied by a guard
  // that refuses everything: free text in note and an absent v2 key still pass.
  for (const patch of [{ note: 'my SSN is 123-45-6789, and this is free text' }, {}, { cache_hit: false }, { agent: 'qa' }]) {
    write(w, `${forged(patch)}\n`);
    assert.deepEqual(validateFile(w.root, w.file, w.regs).bad, [], `validate rejected ${JSON.stringify(patch)}`);
  }
});

test('validate refuses a line that is not a JSON object', (t) => {
  const w = world(t);
  for (const line of ['[1,2]', '42', 'null', '"a string"', '{']) {
    write(w, `${line}\n`);
    assert.deepEqual(validateFile(w.root, w.file, w.regs).bad, [1], `validate accepted ${line}`);
  }
});

test('validate names a missing file rather than reporting zero valid lines', (t) => {
  const w = world(t);
  const absent = join(w.root, 'no-such.jsonl');
  assert.throws(
    () => validateFile(w.root, absent, w.regs),
    (e: unknown) => e instanceof JournalError && e.message === `no such file: ${absent}`,
  );
});

test('usage renders one term per row, bracketing everything not required', () => {
  const text = usage('scripts/exec-journal.sh');
  for (const spec of EXEC_JOURNAL_FIELDS) {
    const bracketed = text.includes(`[${spec.flag} `);
    assert.equal(bracketed, spec.presence !== 'required', `${spec.flag} bracketing does not match its presence`);
  }
  assert.match(text, /^usage: scripts\/exec-journal\.sh append <file> /);
  assert.match(text, /\n {7}scripts\/exec-journal\.sh validate <file>\n$/);
});

// ------------------------------------------------------------------ internals

function world(t: TestContext): World {
  const root = relocatedRoot(tempRoot(t));
  return { root, file: join(root, 'spans.exec.jsonl'), regs: journalRegistries(root) };
}

// The stamp goes FIRST so a case that drives --timestamp itself still wins under
// the parser's last-value-for-a-repeated-flag rule.
function append(w: World, flags: string[]): void {
  appendLine(w.root, w.file, [w.file, '--timestamp', STAMP, ...flags], () => STAMP, w.regs);
}

function write(w: World, text: string): void {
  writeFileSync(w.file, text);
}

function read(w: World): string {
  try {
    return readFileSync(w.file, 'utf8');
  } catch {
    return '';
  }
}

function readLines(w: World): string[] {
  return read(w).split('\n').filter((line) => line !== '');
}

function lastRow(w: World): Record<string, unknown> {
  const lines = readLines(w);
  const last = lines[lines.length - 1];
  assert.notEqual(last, undefined, 'no line was appended');
  return JSON.parse(last ?? '{}') as Record<string, unknown>;
}

function rowsOf(guard: FieldSpec['guard']): FieldSpec[] {
  return EXEC_JOURNAL_FIELDS.filter((spec) => spec.guard === guard);
}
