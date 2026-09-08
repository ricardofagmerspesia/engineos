import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { runInProcess, tempRoot, type RunResult } from '../testing/harness';
import { runKernel } from './cli';
import { lazyRegistries } from './context';

// Differential parity (plan Task 8b). Every case runs the SAME arm and args
// through the pinned bash kernel and through the TypeScript projection, over
// byte-identical registries, and asserts the answers are the same JSON in the
// same key order with the same exit code. The fixture and its refresh procedure
// are documented in test/fixtures/legacy-kernel/README.md.
//
// Deliberately NOT a case: an unknown subcommand. Bash and TypeScript both
// answer {"error":"unknown subcommand: <x>"}, but over different sets of known
// arms while the port is in flight, so the comparison would assert on the
// migration's progress rather than on behaviour. Arms that are not ported yet
// are skipped by name (see armIsPorted), never failed.

const FIXTURE = join(resolveRoot({}, __dirname), 'test', 'fixtures', 'legacy-kernel');

// The FIXTURE's own policy — the registries both sides are staged with — read
// through the typed loader, lazily. Cases derive their numbers from it for the
// reason scripts/test-kernel.sh derives its own: an inflight of 3 is "below the
// cap" only for as long as the cap is 6, so a literal would turn a correct kernel
// red the day the registry is re-parameterised.
const fixtureRegistries = lazyRegistries(FIXTURE);

// One frontend, one backend, one security path (three different domains and
// three different match kinds), one excluded basename, one path no domain claims.
const ROUTE_PATH_CASES = [
  '/tmp/apps/web/src/Home.tsx',
  '/tmp/apps/api/src/orders/orders.controller.ts',
  '/tmp/apps/api/src/auth/jwt.guard.ts',
  '/tmp/repo/README.md',
  '/tmp/other/random.py',
];

// One prompt per multiplicity the intent form can answer with: exactly one
// intent, several at once (multi-match is by design), and none at all — the
// last one being the only case where `ambiguous` is true.
const ROUTE_INTENT_CASES = [
  'audit the system',
  'add a fix for something broken',
  'the weather is nice today',
];

// The four flag-taking arms, with the args of every `run <arm> ...` block in
// scripts/test-kernel.sh plus the arm alone (bash's own missing-flag message).
//
// Deliberately NOT cases, for two reasons a parity assertion cannot express:
//   - a flag with no value at all (`model --work`, `risk --signals`, `gates
//     --risk`, `repair --check`). bash binds ${2:-} and then `shift 2` runs off
//     the end, which fails without shifting, so the same flag re-matches and the
//     loop spins forever. There is no answer to compare against; the TypeScript
//     refusal is asserted in cli.test.ts instead.
//   - `risk --signals '[]'` and any other non-object payload. jq indexes it,
//     fails, and bash writes the jq error to stderr and nothing to stdout, so
//     the case would fail on unparseable output rather than on a difference.
const MODEL_CASES = [
  ['--work', 'adr'],
  ['--work', 'build'],
  ['--work', 'nonsense'],
  [],
];

const RISK_CASES = [
  ['--signals', '{"inputs":{"reversibility":"low","blast-radius":"medium"}}'],
  ['--signals', '{"inputs":{"reversibility":"low","blast-radius":"low","data-sensitivity":"low","contract-surface":"low","spend":"low"},"floors":["payments"]}'],
  ['--signals', '{"inputs":{"bogus-input":"low"}}'],
  ['--signals', '{"inputs":{"reversibility":"low"},"floors":["bogus-floor"]}'],
  ['--signals', '{}'],
  ['--signals', '{"inputs":{}}'],
  ['--signals', '{"floors":["destructive-ddl-dml"]}'],
  [],
];

const GATES_CASES = [
  ['--risk', 'low'],
  ['--risk', 'medium'],
  ['--risk', 'high'],
  ['--risk', 'banana'],
  [],
];

const REPAIR_CASES = [
  ['--check', 'lint', '--attempt', '1'],
  ['--check', 'lint', '--attempt', '2'],
  ['--check', 'lint', '--attempt', '3'],
  ['--check', 'test', '--situation', 'infra'],
  ['--check', 'test', '--situation', 'flaky'],
  ['--check', 'build', '--attempt', '1', '--situation', 'weaken-the-check'],
  ['--check', 'nonsense', '--attempt', '1'],
  ['--attempt', '1'],
  ['--check', 'lint'],
  ['--check', 'lint', '--attempt', '1', '--situation', 'nonsense'],
];

// The `run admit`, `run breaker`, `run hitl` and `run waves` blocks of
// scripts/test-kernel.sh, as case builders because each one reads the fixture's
// policy.
//
// Deliberately NOT cases, across all four:
//   - a flag with no value (`admit --inflight`, `breaker --state`, `hitl --risk`,
//     `hitl --situation`). These three bash arms DO refuse — they check
//     `[ $# -ge 2 ]` before shifting — but with a per-arm wording ("admit requires
//     a value for --inflight") while parseFlags answers the single message the
//     plan pins for every arm ("admit: --inflight requires a value"). Both exit 1
//     with a JSON error; only the text differs, and cli.test.ts asserts the
//     TypeScript one.
//   - `waves --units` with no value. bash binds ${2:-} and `shift 2` runs off the
//     end, so the flag re-matches and the loop spins forever: there is no answer
//     to compare against, and the process has to be killed.
//   - an unknown argument (`hitl --bogus x`). Same divergence as the first entry:
//     bash says "unknown argument", parseFlags says "unknown flag".
//   - every relocated-kernel case (a policy with no wave_concurrency_cap, no
//     breaker block, no hitl.record_home, a bogus overload_action, a
//     high_with_thin_evidence that is not a level id). Those assert fail-closed
//     behaviour against a MUTATED registry, which this harness's byte-identical
//     staging cannot express by construction; admit.test.ts, breaker.test.ts and
//     hitl.test.ts carry them.
function admitCases(): string[][] {
  const parallelism = fixtureRegistries.policy.parallelism;
  const cap = parallelism.wave_concurrency_cap;
  const maxQueued = parallelism.backpressure.max_queued_units;
  // A load strictly inside any cap >= 1, derived from the cap itself.
  const partial = Math.floor(cap / 2);
  return [
    ['--inflight', '0', '--queued', '0'],
    ['--inflight', String(partial), '--queued', '0'],
    ['--inflight', String(cap), '--queued', '0'],
    ['--inflight', String(cap + 1), '--queued', String(maxQueued - 1)],
    ['--inflight', String(cap), '--queued', String(maxQueued)],
    // A leading zero is a shell-ism, not a JSON number: both sides normalise it.
    ['--inflight', '02', '--queued', '0'],
    ['--inflight', 'abc', '--queued', '0'],
    ['--inflight', '1', '--queued', 'abc'],
    ['--inflight', '1'],
    [],
  ];
}

function breakerCases(): string[][] {
  const threshold = fixtureRegistries.policy.breaker.failure_threshold;
  return [
    ['--state', 'closed', '--failures', '0'],
    ['--state', 'closed', '--failures', String(threshold - 1)],
    ['--state', 'closed', '--failures', String(threshold)],
    // The value is the threshold itself, so only a correctly parsed number
    // answers open — "00" would answer closed for any threshold >= 1.
    ['--state', 'closed', '--failures', `0${String(threshold)}`],
    ['--state', 'open', '--cooldown-elapsed', 'false'],
    ['--state', 'open', '--cooldown-elapsed', 'true'],
    ['--state', 'half-open', '--probe-result', 'ok'],
    ['--state', 'half-open', '--probe-result', 'failed'],
    ['--state', 'closed'],
    ['--state', 'closed', '--failures', 'abc'],
    ['--state', 'open'],
    ['--state', 'open', '--cooldown-elapsed', 'maybe'],
    ['--state', 'half-open'],
    ['--state', 'half-open', '--probe-result', 'maybe'],
    ['--state', 'bogus', '--failures', '1'],
    ['--failures', '1'],
    [],
  ];
}

function hitlCases(): string[][] {
  const policy = fixtureRegistries.policy;
  // Every declared situation, from the registry both sides read: a situation the
  // kernel accepts and then drops would answer required:false, and a situation
  // one side declares and the other does not would answer two different things.
  const situations = [...policy.retry.never_retry, ...policy.hitl.situations];
  return [
    ['--risk', 'low', '--autonomy', 'A2'],
    ['--risk', 'high', '--autonomy', 'A3'],
    ['--risk', 'medium', '--autonomy', 'A3', '--external-effect', 'true'],
    ['--risk', 'medium', '--autonomy', 'A2', '--external-effect', 'true'],
    ['--risk', 'high', '--autonomy', 'A3', '--conflict', 'true', '--external-effect', 'true'],
    // Thin evidence drops exactly one level, never raises, bottoms out at A1 and
    // is capped by autonomy.high_with_thin_evidence at risk high.
    ['--risk', 'medium', '--autonomy', 'A2', '--evidence', 'thin'],
    ['--risk', 'low', '--autonomy', 'A2', '--evidence', 'thin'],
    ['--risk', 'medium', '--autonomy', 'A3', '--evidence', 'thin'],
    ['--risk', 'low', '--autonomy', 'A4', '--evidence', 'thin'],
    ['--risk', 'low', '--autonomy', 'A0', '--evidence', 'thin'],
    ['--risk', 'high', '--autonomy', 'A0', '--evidence', 'thin'],
    ['--risk', 'medium', '--autonomy', 'A1', '--evidence', 'thin'],
    ['--risk', 'high', '--autonomy', 'A3', '--evidence', 'thin'],
    ['--risk', 'high', '--autonomy', 'A4', '--evidence', 'thin'],
    // Adequate evidence is the identity: without it a kernel that always dropped
    // would pass every case above.
    ['--risk', 'medium', '--autonomy', 'A3'],
    ['--risk', 'low', '--autonomy', 'A0'],
    ...situations.map((situation) => ['--risk', 'low', '--autonomy', 'A2', '--situation', situation]),
    ['--risk', 'low', '--autonomy', 'A2', '--situation', 'nonsense'],
    // An empty situation is no situation at all, on both sides.
    ['--risk', 'low', '--autonomy', 'A2', '--situation', ''],
    ['--risk', 'low', '--autonomy', 'A9'],
    ['--risk', 'low', '--autonomy', 'A2', '--evidence', 'maybe'],
    ['--risk', 'low', '--autonomy', 'A2', '--conflict', 'yes'],
    ['--risk', 'banana', '--autonomy', 'A2'],
    ['--risk', 'low'],
    ['--autonomy', 'A2'],
    [],
  ];
}

function wavesCases(): string[][] {
  const payloads = wavesPayloads();
  // The arm alone: bash reads an absent --units and an empty one through the same
  // guard, so both answer "waves requires --units <json array>".
  return [...payloads.map((payload) => ['--units', payload]), []];
}

function wavesPayloads(): string[] {
  const cap = fixtureRegistries.policy.parallelism.wave_concurrency_cap;
  // cap + 2 independent units is always exactly two waves, sized cap and 2 — a
  // literal count is "two over the cap" only for one value of the cap.
  const capUnits = Array.from({ length: cap + 2 }, (_, i) => ({ id: `u${String(i + 1)}`, files: [], depends_on: [] }));
  return [
    JSON.stringify([
      { id: 'a', files: ['a.ts'], depends_on: [] },
      { id: 'b', files: ['b.ts'], depends_on: [] },
      { id: 'c', files: ['c.ts'], depends_on: ['a', 'b'] },
    ]),
    // Two units in one wave owning a file is a violation, not an error: the plan
    // is still emitted, with the collision named.
    JSON.stringify([
      { id: 'a', files: ['shared.ts'], depends_on: [] },
      { id: 'b', files: ['shared.ts'], depends_on: [] },
    ]),
    JSON.stringify(capUnits),
    JSON.stringify([
      { id: 'a', files: [], depends_on: ['b'] },
      { id: 'b', files: [], depends_on: ['a'] },
    ]),
    JSON.stringify([{ id: 'a', files: [], depends_on: [] }, { id: 'a', files: [], depends_on: [] }]),
    JSON.stringify([{ id: 'a', files: [], depends_on: ['zz'] }]),
    '[]',
    // Not JSON at all, and JSON that is not an array: bash failed both on the
    // same `type == "array"` guard, with the same message.
    '{}',
    'not json',
    '',
  ];
}

// The `run decision-rules` and `run scale` blocks of scripts/test-kernel.sh,
// plus the arm alone (bash's own missing-flag message). The four prompt arms
// share two deliberate non-cases, for the reasons the flag-taking arms above
// already document:
//   - `--prompt` with no value. bash binds ${2:-} and `shift 2` runs off the
//     end, so the flag re-matches and the loop spins forever: there is no answer
//     to compare against, and the process has to be killed. cli.test.ts asserts
//     the TypeScript refusal instead.
//   - an unknown argument (`scale --bogus x`). bash says "unknown argument",
//     parseFlags says "unknown flag" — both exit 1 with a JSON error, only the
//     text differs, and cli.test.ts asserts the TypeScript one.
const DECISION_RULES_CASES = [
  ['--prompt', 'drop the users table in production'],
  ['--prompt', "let's write a friendly test"],
  ['--prompt', 'deploy the billing service to production'],
  [],
];

const SCALE_CASES = [
  ['--prompt', 'implement all the endpoints across the codebase'],
  ['--prompt', 'write a spec for the payment flow'],
  ['--prompt', 'what time is it'],
  // design_weak ("design") with no action verb must not count as design work.
  ['--prompt', 'the button design looks good'],
  [],
];

// Every prompt of the `run route-escalate` block, plus every
// policy.json .router.fixtures[] prompt read from the fixture's own registry —
// a new fixture is covered automatically, exactly as the bash suite loops it.
function routeEscalateCases(): string[][] {
  const prompts = [
    'add a paginated orders endpoint to the API and mirror the screen to mobile',
    'publish to App Store the iOS app screen',
    'zzqq wibble frobnicate',
    'why does the login handler fail with a 500',
    'improve query perf on the orders table',
    'build the ios release and upload to TestFlight',
    ...fixtureRegistries.policy.router.fixtures.map((fixture) => fixture.prompt),
  ];
  return [...unique(prompts).map((prompt) => ['--prompt', prompt]), []];
}

// The `run resolve-task` block: a routed prompt whose floor comes from an
// intent, a prompt a decision rule classifies high (the only shape that folds
// hitl in), a prompt that requests no work, and an unrouted action.
const RESOLVE_TASK_PROMPTS = [
  'add a paginated orders endpoint and mirror the screen to mobile',
  'deploy the billing service to production',
  'the weather is nice today',
  'update the prose in this document',
];

const RESOLVE_TASK_CASES = [...RESOLVE_TASK_PROMPTS.map((prompt) => ['--prompt', prompt]), []];

// Probed once: both tools are external, and a missing one skips rather than
// fails the suite (plan Task 8b).
const MISSING_TOOL = firstMissingTool(['bash', 'jq']);

test('route-path answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'route-path', ROUTE_PATH_CASES.map((path) => [path]));
});

test('route-intent answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'route-intent', ROUTE_INTENT_CASES.map((prompt) => [prompt]));
});

test('model answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'model', MODEL_CASES);
});

test('risk answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'risk', RISK_CASES);
});

test('gates answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'gates', GATES_CASES);
});

test('repair answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'repair', REPAIR_CASES);
});

test('admit answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'admit', admitCases());
});

test('breaker answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'breaker', breakerCases());
});

test('hitl answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'hitl', hitlCases());
});

test('waves answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'waves', wavesCases());
});

test('decision-rules answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'decision-rules', DECISION_RULES_CASES);
});

test('scale answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'scale', SCALE_CASES);
});

test('route-escalate answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'route-escalate', routeEscalateCases());
});

test('resolve-task answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'resolve-task', RESOLVE_TASK_CASES);
});

// The `resolve` arm has no bash counterpart — it is the one arm this migration
// ADDS — so its parity case asserts the thing that would otherwise go unchecked:
// every section of the sparse Answer deep-equals the legacy projection that owns
// it, over the same registries. A composite that drifts from its own parts is
// exactly what a caller trading four processes for one would not notice.
test('resolve answers each section identically to the legacy projection that owns it', (t) => {
  if (MISSING_TOOL !== null) {
    t.skip(`parity against the pinned bash kernel needs ${MISSING_TOOL} on PATH`);
    return;
  }
  const root = stageFixture(t);
  if (!armIsPorted('resolve', root)) {
    t.skip('resolve is not ported yet — parity is skipped by name, not asserted');
    return;
  }
  for (const prompt of RESOLVE_TASK_PROMPTS) {
    const label = `resolve --facts (${prompt})`;
    const composite = portedFacts(root, { prompt, taskContract: true });
    const task = legacyAnswer(root, ['resolve-task', '--prompt', prompt]);

    assertSame(field(composite, 'route', label), legacyAnswer(root, ['route-escalate', '--prompt', prompt]), `${label}: route`);
    assertSame(field(composite, 'decision_rules', label), legacyAnswer(root, ['decision-rules', '--prompt', prompt]), `${label}: decision_rules`);
    assertSame(field(composite, 'task_contract', label), field(task, 'task_contract', label), `${label}: task_contract`);
    // A null hitl in the legacy composite is an ABSENT hitl in the sparse
    // Answer, and the composite publishes two of the section's four fields. The
    // projection performs both conversions, so the comparison is on the
    // converted pair rather than on the section.
    assertSame(narrowedHitl(field(composite, 'hitl', label)), field(task, 'hitl', label), `${label}: hitl`);

    // The two sections a prompt answers on its own, against their own arms.
    assertSame(field(portedFacts(root, { prompt }), 'route', label), legacyAnswer(root, ['route-intent', prompt]), `${label}: route (intent form)`);
    assertSame(field(portedFacts(root, { scale: { prompt } }), 'scale', label), legacyAnswer(root, ['scale', '--prompt', prompt]), `${label}: scale`);
  }
});

// ------------------------------------------------------------------ internals

function runArm(t: TestContext, arm: string, cases: string[][]): void {
  if (MISSING_TOOL !== null) {
    t.skip(`parity against the pinned bash kernel needs ${MISSING_TOOL} on PATH`);
    return;
  }
  const root = stageFixture(t);
  if (!armIsPorted(arm, root)) {
    t.skip(`${arm} is not ported yet — parity is skipped by name, not asserted`);
    return;
  }
  for (const args of cases) parityCase(root, arm, args);
}

// scripts/kernel.sh derives its root from its own location and never reads
// ENGINEOS_ROOT, so a copy is only pinned to the snapshot when it sits one
// directory below it. Staging into a fresh temp root per test gives both sides
// one root: bash resolves it from the staged path, TypeScript is handed it.
function stageFixture(t: TestContext): string {
  const root = tempRoot(t);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(FIXTURE, 'kernel.sh'), legacyKernel(root));
  cpSync(join(FIXTURE, 'registries'), join(root, 'registries'), { recursive: true });
  return root;
}

function parityCase(root: string, arm: string, args: string[]): void {
  const argv = [arm, ...args];
  const label = argv.join(' ');
  const legacy = runLegacy(root, argv);
  const ported = runPorted(root, argv);
  const legacyAnswer = parseAnswer(legacy, `${label} (pinned bash kernel)`);
  const portedAnswer = parseAnswer(ported, `${label} (typescript projection)`);

  assert.deepEqual(portedAnswer, legacyAnswer, `${label}: answers differ`);
  // Key order is part of the answer's contract, not a formatting detail: callers
  // diff kernel output. JSON.parse preserves insertion order for every key these
  // sections carry (none is integer-like), so the re-stringified forms differ
  // exactly when the key order does.
  assert.equal(JSON.stringify(portedAnswer), JSON.stringify(legacyAnswer), `${label}: key order differs`);
  assert.equal(ported.status, legacy.status, `${label}: exit codes differ`);
}

function portedFacts(root: string, facts: Record<string, unknown>): unknown {
  const argv = ['resolve', '--facts', JSON.stringify(facts)];
  return parseAnswer(runPorted(root, argv), `${argv.join(' ')} (typescript resolve)`);
}

function legacyAnswer(root: string, argv: string[]): unknown {
  return parseAnswer(runLegacy(root, argv), `${argv.join(' ')} (pinned bash kernel)`);
}

function field(answer: unknown, key: string, label: string): unknown {
  if (!isRecord(answer)) assert.fail(`${label}: expected an object, got ${JSON.stringify(answer)}`);
  return answer[key];
}

// An absent section is the composite's null, and only two of the section's four
// fields were ever published there.
function narrowedHitl(section: unknown): unknown {
  if (section === undefined) return null;
  if (!isRecord(section)) return section;
  return { required: section['required'], reasons: section['reasons'] };
}

function assertSame(ported: unknown, legacy: unknown, label: string): void {
  assert.deepEqual(ported, legacy, `${label}: answers differ`);
  assert.equal(JSON.stringify(ported), JSON.stringify(legacy), `${label}: key order differs`);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function runLegacy(root: string, argv: string[]): RunResult {
  const result = spawnSync('bash', [legacyKernel(root), ...argv], {
    encoding: 'utf8',
    // PATH so the kernel finds jq, HOME because bash startup reads it.
    // ENGINEOS_ROOT is ignored by this kernel (the staged location is what pins
    // it) and set anyway, so both sides are told the same root.
    env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ENGINEOS_ROOT: root },
  });
  if (result.error !== undefined) throw new Error(`could not spawn the pinned bash kernel: ${result.error.message}`);
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function runPorted(root: string, argv: string[]): RunResult {
  return runInProcess(runKernel, argv, { env: { ENGINEOS_ROOT: root } });
}

// An arm still answered only by bash reports itself as unknown, in that exact
// shape (src/kernel/cli.ts). Recognising it keeps the harness honest while the
// port lands one arm at a time: skipped by name, never a green assertion.
function armIsPorted(arm: string, root: string): boolean {
  // The arm alone: a ported arm answers, or refuses for its own reason (missing
  // positional, missing flag) — either way, not "unknown subcommand".
  const probe = runPorted(root, [arm]);
  if (probe.status === 0) return true;
  try {
    const body: unknown = JSON.parse(probe.stdout);
    return !(isErrorBody(body) && body.error === `unknown subcommand: ${arm}`);
  } catch {
    return true;
  }
}

function isErrorBody(value: unknown): value is { error: unknown } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

function parseAnswer(result: RunResult, label: string): unknown {
  try {
    return JSON.parse(result.stdout);
  } catch {
    // The stream itself is the finding here: a kernel that cannot answer must
    // still answer JSON on stdout, so unparseable output is a parity failure
    // worth reading in full.
    assert.fail(`${label}: stdout is not JSON (exit ${result.status})\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
}

function firstMissingTool(tools: string[]): string | null {
  for (const tool of tools) {
    const probe = spawnSync(tool, ['--version'], { encoding: 'utf8' });
    if (probe.error !== undefined || probe.status !== 0) return tool;
  }
  return null;
}

function legacyKernel(root: string): string {
  return join(root, 'scripts', 'kernel.sh');
}
