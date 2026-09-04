import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRoot } from '../registry/paths';
import { runInProcess, tempRoot, type RunResult } from '../testing/harness';
import { runKernel } from './cli';

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

// Probed once: both tools are external, and a missing one skips rather than
// fails the suite (plan Task 8b).
const MISSING_TOOL = firstMissingTool(['bash', 'jq']);

test('route-path answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'route-path', ROUTE_PATH_CASES.map((path) => [path]));
});

test('route-intent answers identically to the pinned bash kernel', (t) => {
  runArm(t, 'route-intent', ROUTE_INTENT_CASES.map((prompt) => [prompt]));
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
