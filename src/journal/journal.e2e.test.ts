// End-to-end port of scripts/test-exec-journal.sh: the exec-journal append and
// validate CLI driven as a consumer drives it — `node dist/engineos.cjs journal
// <sub>`, one spawned process per invocation, real files on disk.
//
// The bash suite ran the same cases through scripts/exec-journal.sh, which is a
// shim that execs the bundle with ENGINEOS_ROOT pinned to the checkout. Every
// case here passes that env explicitly, because the harness strips ENGINEOS_*
// from a spawned environment and an operator's stray ENGINEOS_ROOT must never
// decide which registries a case answers against.
//
// src/journal/exec-journal.test.ts, schema.test.ts and cli.test.ts cover the same
// schema in process, against the exported functions. This file is deliberately
// not those assertions: it is the spawned black-box contract — exit codes, what
// reached disk, and the vocabularies read from the live registries.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord, readJsonFile, stringArray } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { runCli, tempRoot, type RunResult } from '../testing/harness';

const CHECKOUT = resolveRoot({}, __dirname);

// What scripts/exec-journal.sh exports before exec'ing the bundle, so a relocated
// copy answers from its own registries/. Pinned per call rather than inherited.
const SHIM_ENV: Record<string, string> = { ENGINEOS_ROOT: CHECKOUT };

// The three flag sets the bash suite repeated. Named once so a case reads as the
// property it asserts rather than as a wall of flags.
const AGENT_SPAN = [
  '--run-id', 'r1', '--capability-id', 'implement', '--agent', 'backend-coordinator',
  '--model-tier', 'build', '--status', 'OK', '--tokens-in', '100', '--tokens-out', '200', '--duration-ms', '5000',
];
const NULL_AGENT_SPAN = [
  '--run-id', 'r1', '--capability-id', 'author-spec',
  '--model-tier', 'most-capable', '--status', 'FAILED', '--tokens-in', '10', '--tokens-out', '0', '--duration-ms', '100',
  '--note', 'spec artifact missing',
];
const MINIMAL_SPAN = [
  '--run-id', 'r1', '--capability-id', 'implement', '--model-tier', 'build',
  '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '1',
];
const ROUTE_SPAN = [
  '--run-id', 'r1', '--capability-id', 'route', '--model-tier', 'build', '--status', 'OK',
  '--tokens-in', '0', '--tokens-out', '0', '--duration-ms', '1',
];

// The bash TS_PAYLOAD: a BEL, an ANSI colour sequence, a double quote and a
// newline, in one value. The character classes are what matter, so they are
// spelled as escapes rather than pasted raw.
const TIMESTAMP_PAYLOAD = '2026 \u0007\u001b[31mINJECTED\u001b[0m "q" \nsecond-line';

// The exact payload both reviewers landed on disk through --agent.
const NEWLINE_PAYLOAD = 'backend-coordinator\nSECRET=hunter2 leaked prompt text';

test('append with an agent succeeds', (t) => {
  const file = journalFile(t);
  assertAccepted(ej(['append', file, ...AGENT_SPAN]));
});

test('append with agent omitted (null) succeeds', (t) => {
  const file = journalFile(t);
  assertAccepted(ej(['append', file, ...NULL_AGENT_SPAN]));
});

test('both appended lines are present', (t) => {
  const file = journalFile(t);
  seedPair(file);
  assert.equal(readFileSync(file, 'utf8').split('\n').length - 1, 2);
});

test('validate accepts what append wrote', (t) => {
  const file = journalFile(t);
  seedPair(file);
  assertAccepted(ej(['validate', file]));
});

test('append rejects an unknown status', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file,
    '--run-id', 'r1', '--capability-id', 'implement', '--model-tier', 'build',
    '--status', 'NOT_A_STATUS', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '1']));
});

test('append rejects an unknown model tier', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file,
    '--run-id', 'r1', '--capability-id', 'implement', '--model-tier', 'not-a-tier',
    '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '1']));
});

test('validate rejects a line missing required fields', (t) => {
  const file = journalFile(t);
  seedPair(file);
  writeFileSync(file, `${readFileSync(file, 'utf8')}{"run_id":"r2"}\n`);
  assertRejected(ej(['validate', file]));
});

// A flag with no value following it must hit usage(), not an unbound-variable
// crash from `set -u` reading an absent $2.
test('append rejects a flag given with no value, not a bash crash', (t) => {
  const file = join(tempRoot(t), 'nonexistent-does-not-matter.jsonl');
  assertRejected(ej(['append', file, '--run-id']));
});

// What this pins is the encoder's own escaping: a value carrying a double quote
// must not be hand-built into a JSON literal. It used to be asserted through
// --agent, which is now a slug field (agent is an identifier, and admitting text
// there was a prompt-text channel to disk). Retargeted at --note, the one field
// that still takes such a value; the guard --agent gained is asserted below.
test('append accepts a note value containing a double quote', (t) => {
  const file = journalFile(t);
  assertAccepted(ej(['append', file, '--run-id', 'r1', '--capability-id', 'implement', '--note', 'foo"bar',
    '--model-tier', 'build', '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '1']));
});

test('a quoted note value round-trips unescaped', (t) => {
  const file = journalFile(t);
  ej(['append', file, '--run-id', 'r1', '--capability-id', 'implement', '--note', 'foo"bar',
    '--model-tier', 'build', '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '1']);
  assert.equal(lastRow(file)['note'], 'foo"bar');
});

// The v1 identifier fields are slugs, at append and at validate: run_id,
// capability_id and agent used to accept a space, and `validate` used to call
// the result all valid.
test('append rejects whitespace in run_id', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file,
    '--run-id', 'sess 1', '--capability-id', 'implement', '--model-tier', 'build',
    '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '1']));
});

test('append rejects whitespace in capability_id', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file,
    '--run-id', 'r1', '--capability-id', 'route thing', '--model-tier', 'build',
    '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '1']));
});

test('append rejects whitespace in agent', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file,
    '--run-id', 'r1', '--capability-id', 'implement', '--agent', 'a b c',
    '--model-tier', 'build', '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '1']));
});

test('append rejects a newline in agent (no prompt-text channel through a v1 field)', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file,
    '--run-id', 'r1', '--capability-id', 'implement', '--agent', NEWLINE_PAYLOAD,
    '--model-tier', 'build', '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '1']));
});

// ... and note still takes free text, because a guard that rejects everything is
// not a guard.
test('append still accepts free text in note', (t) => {
  const file = journalFile(t);
  assertAccepted(ej(['append', file, ...MINIMAL_SPAN, '--note', 'a human annotation, with spaces']));
});

// validate is the guard for journals this CLI did not write, so the same three
// fields are rejected there too.
test('validate rejects whitespace in run_id', (t) => {
  const file = journalFile(t);
  writeFixture(file, { run_id: 'sess 1' });
  assertRejected(ej(['validate', file]));
});

test('validate rejects a newline in agent', (t) => {
  const file = journalFile(t);
  writeFixture(file, { agent: NEWLINE_PAYLOAD });
  assertRejected(ej(['validate', file]));
});

test('validate accepts free text in note, the one documented text field', (t) => {
  const file = journalFile(t);
  writeFixture(file, { note: 'my SSN is 123-45-6789, and this is free text' });
  assertAccepted(ej(['validate', file]));
});

// timestamp was the THIRD field to escape the containment claim, and it survived
// the round that closed the first two: --timestamp was exempt from the slug
// check by name, and validate tested it for a string type only. The payload
// below appended rc=0 and validated "all valid" through --timestamp while the
// SAME payload in --run-id was rejected. Both boundaries get the case, because
// it passed both.
test('append rejects a newline and control characters in timestamp', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, ...MINIMAL_SPAN, '--timestamp', TIMESTAMP_PAYLOAD]));
});

// ... and rejects it rather than writing a truncated or escaped version of it.
test('the rejected timestamp appended nothing at all', (t) => {
  const file = journalFile(t);
  ej(['append', file, ...MINIMAL_SPAN, '--timestamp', TIMESTAMP_PAYLOAD]);
  assert.equal(readFileSync(file, 'utf8'), '');
});

test('validate rejects a newline and control characters in timestamp', (t) => {
  const file = journalFile(t);
  writeFixture(file, { timestamp: TIMESTAMP_PAYLOAD });
  assertRejected(ej(['validate', file]));
});

// The other direction, so the two rejects above cannot be satisfied by a guard
// that refuses every timestamp: the stamps this repo actually writes must still
// be accepted, at both boundaries. The format is generated the same way the
// append arm generates its default rather than pinned as a literal, so a change
// to that format moves this test with it.
test('append accepts the ISO 8601 stamp this CLI itself writes', (t) => {
  const file = journalFile(t);
  assertAccepted(ej(['append', file, ...MINIMAL_SPAN, '--timestamp', isoNow()]));
});

test('append accepts its own defaulted timestamp', (t) => {
  const file = journalFile(t);
  assertAccepted(ej(['append', file, ...MINIMAL_SPAN]));
});

test('validate accepts both, so the timestamp guard is not a blanket refusal', (t) => {
  const file = journalFile(t);
  ej(['append', file, ...MINIMAL_SPAN, '--timestamp', isoNow()]);
  ej(['append', file, ...MINIMAL_SPAN]);
  assertAccepted(ej(['validate', file]));
});

// The length bound, read from the registry so this test moves with the number.
test('append rejects a value one character over max_value_length', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, ...MINIMAL_SPAN, '--trace-id', overLongValue()]));
});

test('append rejects an over-long note too', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, ...MINIMAL_SPAN, '--note', overLongValue()]));
});

// Over-long is a REJECT, not a truncation: nothing was appended.
test('an over-long value appends nothing at all (reject, not truncate)', (t) => {
  const file = journalFile(t);
  ej(['append', file, ...MINIMAL_SPAN, '--trace-id', overLongValue()]);
  ej(['append', file, ...MINIMAL_SPAN, '--note', overLongValue()]);
  assert.equal(readFileSync(file, 'utf8'), '');
});

test('append accepts a value exactly at max_value_length', (t) => {
  const file = journalFile(t);
  assertAccepted(ej(['append', file, ...MINIMAL_SPAN, '--trace-id', overLongValue().slice(0, maxValueLength())]));
});

test('a backslash in note is not reinterpreted as a JSON escape', (t) => {
  const file = journalFile(t);
  ej(['append', file, ...MINIMAL_SPAN, '--note', 'foo\\bar']);
  assert.equal(lastRow(file)['note'], 'foo\\bar');
});

test('append rejects a negative tokens-in', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, '--run-id', 'r1', '--capability-id', 'implement', '--model-tier', 'build',
    '--status', 'OK', '--tokens-in', '-5', '--tokens-out', '1', '--duration-ms', '1']));
});

test('append rejects a fractional tokens-in', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, '--run-id', 'r1', '--capability-id', 'implement', '--model-tier', 'build',
    '--status', 'OK', '--tokens-in', '1.5', '--tokens-out', '1', '--duration-ms', '1']));
});

test('validate checks the final line even with no trailing newline', (t) => {
  const file = journalFile(t);
  writeFixture(file, { tokens_in: -1 }, { trailingNewline: false });
  assertRejected(ej(['validate', file]));
});

// ------------------------------------------------------------- v2 span fields

// A v1 line — no v2 flags at all — still validates. Backward compatibility is
// the contract, so this is the first assertion of the section, not the last.
test('v1 line still validates', (t) => {
  const file = journalFile(t);
  ej(['append', file, '--run-id', 'r1', '--capability-id', 'route', '--model-tier', 'build',
    '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '5']);
  assertAccepted(ej(['validate', file]));
});

// ... and its SHAPE is unchanged: not one v2 key appears on a line that set none
// of them. A v2 field emitted as an explicit null would still validate, so the
// validator alone cannot catch that regression.
test('a v1 line carries no v2 keys at all', (t) => {
  const file = journalFile(t);
  ej(['append', file, '--run-id', 'r1', '--capability-id', 'route', '--model-tier', 'build',
    '--status', 'OK', '--tokens-in', '1', '--tokens-out', '1', '--duration-ms', '5']);
  const row = lastRow(file);
  for (const key of ['span_kind', 'trace_id', 'cost_micros', 'cache_hit']) {
    assert.equal(Object.hasOwn(row, key), false, `a v1 line carries ${key}`);
  }
});

test('v2 line validates', (t) => {
  const file = journalFile(t);
  appendV2Span(file);
  assertAccepted(ej(['validate', file]));
});

test('v2 fields round-trip', (t) => {
  const file = journalFile(t);
  appendV2Span(file);
  const row = lastRow(file);
  assert.equal(row['span_kind'], 'tool');
  assert.equal(row['cost_micros'], 1200);
  assert.equal(row['cache_hit'], false);
  assert.equal(row['trace_id'], 'sess-1');
});

// Every remaining v2 field, so a flag wired to the wrong variable is caught
// rather than riding along behind the four asserted above.
test('the remaining v2 fields round-trip too', (t) => {
  const file = journalFile(t);
  appendV2Span(file);
  const row = lastRow(file);
  assert.equal(row['span_id'], 'tu-1');
  assert.equal(row['tool'], 'mcp.postgres');
  assert.equal(row['provider'], 'anthropic');
  assert.equal(row['model'], 'claude-opus-5');
  assert.equal(row['retry_attempt'], 1);
  assert.equal(row['route'], 'dba');
  assert.equal(row['risk'], 'medium');
});

test('unknown span_kind rejected', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, ...ROUTE_SPAN, '--span-kind', 'bogus']));
});

test('whitespace in trace_id rejected (no prompt-text channel)', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, ...ROUTE_SPAN, '--trace-id', 'has space']));
});

test('float cost rejected', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, ...ROUTE_SPAN, '--cost-micros', '1.5']));
});

test('unknown risk rejected', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, ...ROUTE_SPAN, '--risk', 'critical']));
});

test('non-boolean cache_hit rejected', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, ...ROUTE_SPAN, '--cache-hit', 'yes']));
});

// The whole point of the slug class: a newline must not smuggle a second line
// past the guard. A line-by-line regex implementation accepts this, which is a
// prompt-text channel straight to disk.
test('a newline inside trace_id is rejected, not accepted on its first line', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, ...ROUTE_SPAN, '--trace-id', 'clean\nand then arbitrary prompt text']));
});

// A digit string that is not valid JSON. Handing it straight to a JSON decoder
// would abort instead of honouring the guard, so this pins the parse-then-emit
// form.
test('a leading-zero cost is accepted as a number, not a jq abort', (t) => {
  const file = journalFile(t);
  assertAccepted(ej(['append', file, ...ROUTE_SPAN, '--cost-micros', '03']));
});

test('the leading-zero cost lands as the number 3', (t) => {
  const file = journalFile(t);
  ej(['append', file, ...ROUTE_SPAN, '--cost-micros', '03']);
  assert.equal(lastRow(file)['cost_micros'], 3);
});

// A v2 flag given as the last argument with no value must reach usage(), not
// re-match forever: `shift 2` with $# = 1 failed silently in bash and the loop
// never exited.
test('a v2 flag with no value hits usage, not an arg-loop hang', (t) => {
  const file = journalFile(t);
  assertRejected(ej(['append', file, ...ROUTE_SPAN, '--span-kind']));
});

// Every declared span kind is accepted. Without this, a kind present in the
// registry but missing from the CLI's vocabulary would only be caught by the
// registry-parity check in validate-engineos.sh.
test('every declared span_kind is accepted', (t) => {
  const file = journalFile(t);
  const rejected: string[] = [];
  for (const kind of ['router', 'coordinator', 'agent', 'tool', 'model', 'verification']) {
    if (ej(['append', file, ...ROUTE_SPAN, '--span-kind', kind]).status !== 0) rejected.push(kind);
  }
  assert.deepEqual(rejected, []);
});

// validate is the guard for journals this CLI did not write (the headless runner
// owns the tool/model spans), so it must reject a bad field wherever it sits. A
// predicate written as `X and (generator)` reports only its LAST output, which
// passes a line whose FIRST span field is malformed.
test('validate rejects a bad FIRST span field even when the last one is fine', (t) => {
  const file = journalFile(t);
  writeFixture(file, { trace_id: 'bad id', route: 'good' });
  assertRejected(ej(['validate', file]));
});

test('validate rejects a trailing newline in a span field', (t) => {
  const file = journalFile(t);
  writeFixture(file, { trace_id: 'ok\n' });
  assertRejected(ej(['validate', file]));
});

test('validate rejects an unknown span_kind', (t) => {
  const file = journalFile(t);
  writeFixture(file, { span_kind: 'bogus' });
  assertRejected(ej(['validate', file]));
});

test('validate rejects a string cache_hit', (t) => {
  const file = journalFile(t);
  writeFixture(file, { cache_hit: 'true' });
  assertRejected(ej(['validate', file]));
});

// The enumerated v1 fields. append gates status and model_tier against the
// registry vocabularies; validate checked them for a string type only, so a
// journal this CLI did not write could carry prose in status and a newline in
// model_tier and validate clean — while the header, policy.json and
// rules/observability.md all say the two boundaries guard the same fields.
test('validate rejects free text in status, as append does', (t) => {
  const file = journalFile(t);
  writeFixture(file, { status: 'it went fine, mostly' });
  assertRejected(ej(['validate', file]));
});

test('validate rejects a newline in model_tier, as append does', (t) => {
  const file = journalFile(t);
  writeFixture(file, { model_tier: 'build\nSECRET=leaked prompt text' });
  assertRejected(ej(['validate', file]));
});

test('validate rejects an undeclared model_tier', (t) => {
  const file = journalFile(t);
  writeFixture(file, { model_tier: 'wizard' });
  assertRejected(ej(['validate', file]));
});

test('validate rejects a lowercased status, as append does', (t) => {
  const file = journalFile(t);
  writeFixture(file, { status: 'ok' });
  assertRejected(ej(['validate', file]));
});

// ... and the other direction, so the guards above cannot be satisfied by one
// that rejects everything: every status and every tier the CLI declares must
// still validate. Both lists are read from the registries the CLI itself reads —
// statuses from policy.json.telemetry.exec_journal, tiers from models.json — so
// renaming one moves this fixture.
test('validate accepts every declared status and model tier', (t) => {
  const file = journalFile(t);
  const rejected: string[] = [];
  for (const status of declaredStatuses()) {
    writeFixture(file, { status });
    if (ej(['validate', file]).status !== 0) rejected.push(`status:${status}`);
  }
  for (const tier of declaredTiers()) {
    writeFixture(file, { model_tier: tier });
    if (ej(['validate', file]).status !== 0) rejected.push(`tier:${tier}`);
  }
  assert.deepEqual(rejected, []);
});

// ------------------------------------------------------------------ internals

// bash `bash "$EJ" <sub> ...`: the shim's exec line, with its ENGINEOS_ROOT.
function ej(argv: string[]): RunResult {
  return runCli(['journal', ...argv], { env: SHIM_ENV });
}

// bash `tmp=$(mktemp)`: a path whose file already exists and is empty, so the
// "appended nothing at all" cases assert a zero-byte file rather than an absent
// one — the same distinction `[ ! -s "$tmp" ]` made.
function journalFile(t: TestContext): string {
  const file = join(tempRoot(t), 'spans.exec.jsonl');
  writeFileSync(file, '');
  return file;
}

function assertAccepted(result: RunResult): void {
  assert.equal(result.status, 0, result.stderr);
}

// bash `check <desc> 1 $?`: the suite asserted a NON-ZERO exit, never a
// particular code, so the port keeps that bar.
function assertRejected(result: RunResult): void {
  assert.notEqual(result.status, 0, `expected a rejection, got exit 0 with stdout: ${result.stdout}`);
}

// The two appends the first block of the bash suite left on disk before its
// line-count and validate cases read the file.
function seedPair(file: string): void {
  assertAccepted(ej(['append', file, ...AGENT_SPAN]));
  assertAccepted(ej(['append', file, ...NULL_AGENT_SPAN]));
}

function appendV2Span(file: string): void {
  assertAccepted(ej(['append', file,
    '--run-id', 'r1', '--capability-id', 'route', '--model-tier', 'build', '--status', 'FAILED',
    '--tokens-in', '0', '--tokens-out', '0', '--duration-ms', '900',
    '--trace-id', 'sess-1', '--span-id', 'tu-1', '--span-kind', 'tool', '--tool', 'mcp.postgres',
    '--provider', 'anthropic', '--model', 'claude-opus-5', '--cost-micros', '1200',
    '--retry-attempt', '1', '--cache-hit', 'false', '--route', 'dba', '--risk', 'medium']));
}

// The valid v1 line every `validate` fixture starts from. Overrides that name an
// existing key keep its position, so a fixture stays byte-comparable with the
// bash `printf` literal it replaces.
const BASE_LINE: Record<string, unknown> = {
  timestamp: 't', run_id: 'r', capability_id: 'c', agent: null, model_tier: 'build',
  status: 'OK', tokens_in: 0, tokens_out: 0, duration_ms: 1, note: null,
};

function writeFixture(file: string, overrides: Record<string, unknown>, opts: { trailingNewline?: boolean } = {}): void {
  const line = JSON.stringify({ ...BASE_LINE, ...overrides });
  writeFileSync(file, opts.trailingNewline === false ? line : `${line}\n`);
}

function lastRow(file: string): Record<string, unknown> {
  const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line !== '');
  const last = lines[lines.length - 1];
  assert.notEqual(last, undefined, `${file} has no lines`);
  const parsed: unknown = JSON.parse(String(last));
  assert.ok(isRecord(parsed), `${file} last line is not a JSON object`);
  return parsed;
}

// bash `date -u +%Y-%m-%dT%H:%M:%SZ`, which is how the append arm builds its own
// default. Generated rather than pinned so a format change moves the test.
function isoNow(): string {
  return new Date().toISOString().replace(/\.[0-9]{3}Z$/, 'Z');
}

// One character over the bound, so the accept case can slice it back to exactly
// the bound and both directions read from the same string.
function overLongValue(): string {
  return 'a'.repeat(maxValueLength() + 1);
}

function maxValueLength(): number {
  const value = execJournalPolicy()['max_value_length'];
  // bash `// 256` plus its non-numeric guard: the registry decides, and a
  // missing or nonsensical entry falls back rather than failing the suite.
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 256;
}

function declaredStatuses(): string[] {
  return stringArray(execJournalPolicy()['statuses']);
}

function declaredTiers(): string[] {
  const models = readJsonFile(join(CHECKOUT, 'registries', 'models.json'));
  const tiers = isRecord(models) ? models['tiers'] : undefined;
  // Array.from rather than a cast: Array.isArray narrows unknown to any[], and
  // an any would then leak through the map's element type.
  const rows: unknown[] = Array.isArray(tiers) ? Array.from<unknown>(tiers) : [];
  return rows.flatMap((tier) => {
    const id = isRecord(tier) ? tier['id'] : undefined;
    return typeof id === 'string' ? [id] : [];
  });
}

function execJournalPolicy(): Record<string, unknown> {
  const policy = readJsonFile(join(CHECKOUT, 'registries', 'policy.json'));
  const telemetry = isRecord(policy) ? policy['telemetry'] : undefined;
  const execJournal = isRecord(telemetry) ? telemetry['exec_journal'] : undefined;
  return isRecord(execJournal) ? execJournal : {};
}
