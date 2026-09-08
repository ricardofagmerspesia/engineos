import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRoot } from '../registry/paths';
import { runInProcess, tempRoot, type RunResult } from '../testing/harness';
import { runJournal } from './cli';
import { EXEC_JOURNAL_FIELDS, journalRegistries } from './schema';

// Differential parity (plan Task 14). Every case runs the same arguments through
// the pinned bash exec-journal and through the TypeScript port, over the same
// registries, and asserts the same exit code — plus, for append, the same LINE
// BYTES, because a journal line is the contract two consumers join on. The
// fixture and its refresh procedure are documented in
// test/fixtures/legacy-journal/README.md.
//
// Deliberately NOT a case: the usage block. It is rendered from the table now
// rather than restated as one string, so its wording differs on purpose and
// cli.test.ts asserts the port's own. Exit codes for every path that reaches it
// ARE compared.

const CHECKOUT = resolveRoot({}, __dirname);
const FIXTURE = join(CHECKOUT, 'test', 'fixtures', 'legacy-journal');
const STAMP = '2026-09-04T12:00:00Z';
const REQUIRED = [
  '--run-id', 'r1',
  '--capability-id', 'implement',
  '--model-tier', 'build',
  '--status', 'OK',
  '--tokens-in', '1',
  '--tokens-out', '2',
  '--duration-ms', '3',
];

// Derived from the live registries for the same reason the kernel parity suite
// derives its numbers: a literal turns a correct port red the day a vocabulary
// is extended.
const registries = journalRegistries(CHECKOUT);

const MISSING_TOOL = firstMissingTool(['bash', 'jq']);

function appendCases(): { label: string; flags: string[] }[] {
  const bound = registries.execJournal.max_value_length;
  const cases: { label: string; flags: string[] }[] = [
    { label: 'v1 minimal', flags: [] },
    { label: 'v1 with agent', flags: ['--agent', 'backend-coordinator'] },
    { label: 'v1 with note', flags: ['--note', 'a human annotation, with spaces'] },
    { label: 'note with a quote and a backslash', flags: ['--note', 'foo"bar\\baz'] },
    { label: 'note with a newline and a tab', flags: ['--note', 'a\tb\nc'] },
    { label: 'note with non-ASCII text', flags: ['--note', 'café ção'] },
    { label: 'note with control characters', flags: ['--note', 'x\u0001y\u007fz'] },
    {
      label: 'full v2 span',
      flags: [
        '--agent', 'qa', '--note', 'n',
        '--trace-id', 'sess-1', '--span-id', 'tu-1', '--parent-span-id', 'tu-0',
        '--span-kind', 'tool', '--tool', 'mcp.postgres', '--provider', 'anthropic',
        '--model', 'claude-opus-5', '--cost-micros', '1200', '--retry-attempt', '1',
        '--cache-hit', 'false', '--route', 'dba', '--risk', 'medium',
      ],
    },
    { label: 'leading-zero integer', flags: ['--cost-micros', '03', '--retry-attempt', '007'] },
    { label: 'cache_hit true', flags: ['--cache-hit', 'true'] },
    { label: 'a value exactly at the length bound', flags: ['--trace-id', 'a'.repeat(bound)] },
    // Rejects: every guard class, on both a v1 and a v2 field.
    { label: 'over-long slug', flags: ['--trace-id', 'a'.repeat(bound + 1)] },
    { label: 'over-long note', flags: ['--note', 'a'.repeat(bound + 1)] },
    { label: 'whitespace run_id', flags: ['--run-id', 'sess 1'] },
    { label: 'whitespace capability_id', flags: ['--capability-id', 'route thing'] },
    { label: 'newline agent', flags: ['--agent', 'backend-coordinator\nSECRET=hunter2 leaked prompt text'] },
    { label: 'newline trace_id', flags: ['--trace-id', 'clean\nthen arbitrary prompt text'] },
    { label: 'control-character timestamp', flags: ['--timestamp', '2026 \u001b[31mX\u001b[0m "q" \nsecond'] },
    { label: 'offset-form timestamp', flags: ['--timestamp', '2026-09-03T12:00:00+00:00'] },
    { label: 'unknown status', flags: ['--status', 'NOT_A_STATUS'] },
    { label: 'unknown model_tier', flags: ['--model-tier', 'wizard'] },
    { label: 'unknown span_kind', flags: ['--span-kind', 'bogus'] },
    { label: 'unknown risk', flags: ['--risk', 'critical'] },
    { label: 'non-boolean cache_hit', flags: ['--cache-hit', 'yes'] },
    { label: 'fractional cost_micros', flags: ['--cost-micros', '1.5'] },
    { label: 'negative tokens_in', flags: ['--tokens-in', '-5'] },
    { label: 'empty agent', flags: ['--agent', ''] },
    { label: 'empty trace_id', flags: ['--trace-id', ''] },
  ];
  // Every declared member of every enumerated row, read from the registries so a
  // renamed or added vocabulary entry moves this suite with it.
  for (const spec of EXEC_JOURNAL_FIELDS) {
    if (spec.guard !== 'enum' || spec.values === undefined) continue;
    for (const member of spec.values(registries)) {
      cases.push({ label: `${spec.name}=${member}`, flags: [spec.flag, member] });
    }
  }
  return cases;
}

// One forged line per class the validator judges, plus the shapes that are not
// objects at all. These arrive from journals this CLI did not write, which is
// the whole reason validate exists.
const VALIDATE_CASES: { label: string; body: string }[] = (() => {
  const valid = '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,'
    + '"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}';
  const forged = (patch: string): string => `${valid.slice(0, -1)},${patch}}`;
  return [
    { label: 'a valid v1 line', body: `${valid}\n` },
    { label: 'a valid line with no trailing newline', body: valid },
    { label: 'an empty file', body: '' },
    { label: 'blank lines around a valid one', body: `\n${valid}\n\n` },
    { label: 'two bad lines and one good', body: `nonsense\n${valid}\nalso bad\n` },
    { label: 'not JSON at all', body: 'nonsense\n' },
    { label: 'a JSON array', body: '[1,2]\n' },
    { label: 'a JSON number', body: '42\n' },
    { label: 'a JSON null', body: 'null\n' },
    { label: 'a line missing its required fields', body: '{"run_id":"r2"}\n' },
    { label: 'whitespace in run_id', body: `${forged('"run_id":"sess 1"')}\n` },
    { label: 'a newline in agent', body: `${forged('"agent":"a\\nSECRET=x y"')}\n` },
    { label: 'free text in note', body: `${forged('"note":"my note is free text, with spaces"')}\n` },
    { label: 'prose in status', body: `${forged('"status":"it went fine, mostly"')}\n` },
    { label: 'a lowercased status', body: `${forged('"status":"ok"')}\n` },
    { label: 'a newline in model_tier', body: `${forged('"model_tier":"build\\nSECRET=leaked"')}\n` },
    { label: 'an undeclared model_tier', body: `${forged('"model_tier":"wizard"')}\n` },
    { label: 'a bad FIRST span field with a good last one', body: `${forged('"trace_id":"bad id","route":"good"')}\n` },
    { label: 'a trailing newline in a span field', body: `${forged('"trace_id":"ok\\n"')}\n` },
    { label: 'an unknown span_kind', body: `${forged('"span_kind":"bogus"')}\n` },
    { label: 'a string cache_hit', body: `${forged('"cache_hit":"true"')}\n` },
    { label: 'a false cache_hit', body: `${forged('"cache_hit":false')}\n` },
    { label: 'a null cache_hit', body: `${forged('"cache_hit":null')}\n` },
    { label: 'a false span_kind', body: `${forged('"span_kind":false')}\n` },
    { label: 'a false trace_id', body: `${forged('"trace_id":false')}\n` },
    { label: 'a false cost_micros', body: `${forged('"cost_micros":false')}\n` },
    { label: 'a negative tokens_in', body: `${forged('"tokens_in":-1')}\n` },
    { label: 'a fractional duration_ms', body: `${forged('"duration_ms":1.5')}\n` },
    { label: 'a stringified tokens_in', body: `${forged('"tokens_in":"0"')}\n` },
    { label: 'an unknown extra key', body: `${forged('"whatever":"x y z"')}\n` },
    {
      label: 'a line with no agent or note key at all',
      body: '{"timestamp":"t","run_id":"r","capability_id":"c","model_tier":"build",'
        + '"status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1}\n',
    },
  ];
})();

test('append writes the same line bytes and the same exit code as the pinned bash CLI', (t) => {
  if (MISSING_TOOL !== null) {
    t.skip(`parity against the pinned bash exec-journal needs ${MISSING_TOOL} on PATH`);
    return;
  }
  const root = stageFixture(t);
  for (const { label, flags } of appendCases()) {
    // The stamp is pinned FIRST so a case driving --timestamp itself still wins:
    // both CLIs keep the last value for a repeated flag.
    const argv = ['--timestamp', STAMP, ...REQUIRED, ...flags];
    const legacyFile = join(root, 'legacy.exec.jsonl');
    const portedFile = join(root, 'ported.exec.jsonl');
    writeFileSync(legacyFile, '');
    writeFileSync(portedFile, '');
    const legacy = runLegacy(root, ['append', legacyFile, ...argv]);
    const ported = runPorted(root, ['append', portedFile, ...argv]);
    assert.equal(ported.status, legacy.status, `${label}: exit codes differ (bash stderr: ${legacy.stderr})`);
    assert.equal(readFileSync(portedFile, 'utf8'), readFileSync(legacyFile, 'utf8'), `${label}: line bytes differ`);
    // A refusal writes nothing at all on either side: over-long is a reject,
    // never a truncation, and a bad enum never lands a partial line.
    if (legacy.status !== 0) {
      assert.equal(readFileSync(portedFile, 'utf8'), '', `${label}: a refused append still wrote`);
    }
  }
});

test('append refuses the same malformed argument lists as the pinned bash CLI', (t) => {
  if (MISSING_TOOL !== null) {
    t.skip(`parity against the pinned bash exec-journal needs ${MISSING_TOOL} on PATH`);
    return;
  }
  const root = stageFixture(t);
  const file = join(root, 'argv.exec.jsonl');
  for (const argv of [
    ['append', file, '--run-id'],
    ['append', file, ...REQUIRED, '--span-kind'],
    ['append', file, ...REQUIRED, '--bogus', 'x'],
    ['append', file, '--run-id', 'r'],
    ['append', file],
    ['validate'],
    ['nonsense'],
    [],
  ]) {
    writeFileSync(file, '');
    const legacy = runLegacy(root, argv);
    const ported = runPorted(root, argv);
    assert.equal(ported.status, legacy.status, `${argv.join(' ')}: exit codes differ`);
    assert.equal(readFileSync(file, 'utf8'), '', `${argv.join(' ')}: a refused append still wrote`);
  }
});

test('validate answers the same verdict and the same text as the pinned bash CLI', (t) => {
  if (MISSING_TOOL !== null) {
    t.skip(`parity against the pinned bash exec-journal needs ${MISSING_TOOL} on PATH`);
    return;
  }
  const root = stageFixture(t);
  const file = join(root, 'judge.exec.jsonl');
  for (const { label, body } of VALIDATE_CASES) {
    writeFileSync(file, body);
    const legacy = runLegacy(root, ['validate', file]);
    const ported = runPorted(root, ['validate', file]);
    assert.equal(ported.status, legacy.status, `${label}: verdicts differ (bash: ${legacy.stderr}${legacy.stdout})`);
    assert.equal(ported.stdout, legacy.stdout, `${label}: stdout differs`);
    assert.equal(ported.stderr, legacy.stderr, `${label}: stderr differs`);
  }
  // A file neither side can read is the same refusal, with the same text.
  const absent = join(root, 'no-such.exec.jsonl');
  const legacy = runLegacy(root, ['validate', absent]);
  const ported = runPorted(root, ['validate', absent]);
  assert.equal(ported.status, legacy.status);
  assert.equal(ported.stderr, legacy.stderr);
});

// ------------------------------------------------------------------ internals

// The pinned bash CLI derives its root from its own location and never reads
// ENGINEOS_ROOT, so it is only bound to a registry set when it sits one
// directory below one. Staging into a fresh temp root per test gives both sides
// the same root: bash resolves it from the staged path, TypeScript is handed it.
//
// The registries are copied LIVE rather than snapshotted: exec-journal reads
// only the tier ids, the span kinds, the statuses and the length bound, and both
// sides must answer from whichever values the repo carries today.
function stageFixture(t: TestContext): string {
  const root = tempRoot(t);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(FIXTURE, 'exec-journal.sh'), legacyCli(root));
  cpSync(join(CHECKOUT, 'registries'), join(root, 'registries'), { recursive: true });
  return root;
}

function runLegacy(root: string, argv: string[]): RunResult {
  const result = spawnSync('bash', [legacyCli(root), ...argv], {
    encoding: 'utf8',
    // PATH so the CLI finds jq; HOME because bash startup reads it.
    env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' },
  });
  if (result.error !== undefined) {
    throw new Error(`could not spawn the pinned bash exec-journal: ${result.error.message}`);
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function runPorted(root: string, argv: string[]): RunResult {
  return runInProcess(runJournal, argv, { env: { ENGINEOS_ROOT: root } });
}

function legacyCli(root: string): string {
  return join(root, 'scripts', 'exec-journal.sh');
}

function firstMissingTool(tools: string[]): string | null {
  for (const tool of tools) {
    const probe = spawnSync(tool, ['--version'], { encoding: 'utf8' });
    if (probe.error !== undefined || probe.status !== 0) return tool;
  }
  return null;
}
