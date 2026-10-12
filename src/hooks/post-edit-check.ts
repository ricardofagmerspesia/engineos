// EngineOS per-edit typecheck + lint — NOT wired by default.
// Verification runs ONCE at task finalization via the Stop gate (./stop-verify);
// a blocking check after every Edit/Write stalled the build loop, so this hook
// was unwired from hooks/hooks.json (see the .engineos change record
// 2026-08-08-verify-at-end-distribute-always + rules/verification.md "The final
// gate"). Teams that want per-edit gating back can re-add it under
// PostToolUse(Edit|Write) in hooks/hooks.json.
//
// Tool-aware: biome or eslint for lint, nx or a package script for typecheck,
// pnpm/yarn/npm for the runner. Python edits report an unsupported skip.
// Scoped to the changed package, never the repo,
// and the hunt for that package is bounded to the session cwd by the same
// two-layer containment the Stop gate uses — a lexical ceiling on the walk plus a
// realpath check on what came back — so a package.json above or beside the
// consented tree never has its scripts run
// (docs/specs/2026-09-08-hook-path-containment.md).
// Failure goes to stderr with exit 2 (the `fail` decision) so Claude sees it and
// fixes it — and ONLY for a `red` verdict: the infra-vs-red judgment is
// ./classify-failure.ts's, exactly as it is for the Stop gate.
//
// Port of hooks/post-edit-check.sh.
import { realpathSync } from 'node:fs';
import type { HookEnvelope } from './envelope';
import { fail, message, silent, type HookContext, type HookDecision } from './output';
import { bypassActive } from './bypass';
import { lazyRegistries, type Registries } from '../kernel/context';
import { classify } from './classify-failure';
import { PYTHON_UNAVAILABLE_REASON, runnerHandle, runnerHasTarget, runnerRun, runnerSelect, type RunResult, type RunnerSelection, type SpawnSyncLike } from './runner';
import { PROBE_TIMEOUT_SECONDS, SUMMARY_LINES, containedIn, execRun, failureBlock, findUpAny, firstLines, hasPythonExtension, hasVerifyExtension, isFile, packageOwner, startDir, verifyEnvironment } from './verify-targets';

const TYPECHECK_TARGET = 'typecheck';
// bash `find_up "$START" nx.json pnpm-workspace.yaml .git` — the workspace a
// scoped run is issued from, falling back to the package dir itself.
const WORKSPACE_MARKERS: readonly string[] = ['nx.json', 'pnpm-workspace.yaml', '.git'];

// One linter per config family, probed in bash's order: biome wins where both
// are configured.
const LINTERS: readonly { target: string; configs: readonly string[] }[] = [
  { target: 'biome', configs: ['biome.json', 'biome.jsonc'] },
  { target: 'eslint', configs: ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', 'eslint.config.js', 'eslint.config.mjs'] },
];

// bash's two budgets: a package's typecheck script, and a single-file lint.
const TYPECHECK_TIMEOUT_SECONDS = 90;
const LINT_TIMEOUT_SECONDS = 45;

interface Failure {
  target: string;
  subject: string;
  output: string;
}

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  return verify(env, ctx, ctx.spawn);
}

// `spawn` is a parameter so a unit test drives the ladder without a package
// manager or a linter installed.
export function verify(env: HookEnvelope, ctx: HookContext, spawn: SpawnSyncLike): HookDecision {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return silent;
  if (env.file === '') return silent;
  if (!hasVerifyExtension(env.file)) return silent;
  if (!isFile(env.file)) return silent;
  if (hasPythonExtension(env.file)) return message(`[engineos] skipped ${env.file}: ${PYTHON_UNAVAILABLE_REASON}`);

  // The session's cwd is the tree the operator consented to, so it is both the
  // ascent's ceiling and the containment test on what came back. Fail closed: a
  // cwd with no physical path bounds nothing, and an unbounded walk would run
  // whatever package.json it met above it — with no tool-permission prompt in
  // front of the scripts.
  // realpathSync('') answers the hook process's own cwd, an implicit ceiling the
  // envelope never named — so the empty field is refused before it gets there.
  if (env.cwd === '') return silent;
  let stopReal: string;
  try {
    stopReal = realpathSync(env.cwd);
  } catch {
    return silent;
  }

  const start = startDir(env.file);
  const packageDir = packageOwner(start, stopReal);
  if (packageDir === null) return silent;
  if (!containedIn(stopReal, packageDir)) return silent;
  // A workspace root that resolves outside the cwd is dropped rather than
  // entered: the scoped run falls back to the package, which is contained.
  const workspace = findUpAny(start, WORKSPACE_MARKERS, stopReal);
  const root = workspace !== null && containedIn(stopReal, workspace) ? workspace : packageDir;

  const environment = verifyEnvironment(ctx.io.env);
  const failures = nodeChecks(env.file, start, packageDir, root, stopReal, environment.env, spawn, lazyRegistries(ctx.root));
  if (failures.length === 0) return silent;
  // bash accumulated each block behind a newline and printed the lot with
  // `printf '%b' | head -80`, so the report opens on a blank line.
  return fail(firstLines(`\n${failures.map((f) => failureBlock(f.target, f.subject, f.output)).join('\n')}`, SUMMARY_LINES));
}

// ------------------------------------------------------------------ internals

// The arm is chosen by the edited FILE, not by the package: a directory that
// holds both a pyproject.toml and a package.json is two packages, and a .ts edit
// in it wants tsc, not pyright. The Node arm is exactly what it was.
function nodeChecks(
  file: string,
  start: string,
  packageDir: string,
  root: string,
  stop: string,
  env: NodeJS.ProcessEnv,
  spawn: SpawnSyncLike,
  // The EngineOS checkout's registries (ctx.root): the infra patterns the
  // classifier reads are policy, not project configuration.
  registries: Registries,
): Failure[] {
  const selection = runnerSelect(root);
  return [...typecheck(selection, packageDir, root, env, spawn, registries), ...lint(selection, file, start, root, stop, env, spawn, registries)];
}

// Nx addresses the project by name and runs from the workspace root; a package
// manager runs the package's own script from its directory. Both arms are the
// same ladder — handle, hasTarget, run, classify — which is what makes the Nx arm
// stop firing a run for a target the project does not declare, as bash did.
function typecheck(
  selection: RunnerSelection,
  packageDir: string,
  root: string,
  env: NodeJS.ProcessEnv,
  spawn: SpawnSyncLike,
  registries: Registries,
): Failure[] {
  return target(selection, packageDir, TYPECHECK_TARGET, TYPECHECK_TIMEOUT_SECONDS, root, env, spawn, registries);
}

// One rung of the ladder for one target: handle, hasTarget, run, classify.
function target(
  selection: RunnerSelection,
  packageDir: string,
  name: string,
  timeoutSeconds: number,
  root: string,
  env: NodeJS.ProcessEnv,
  spawn: SpawnSyncLike,
  registries: Registries,
): Failure[] {
  const handle = runnerHandle(selection, packageDir);
  if (handle === null) return [];
  if (!runnerHasTarget(selection, handle, name, undefined, spawn, root)) return [];
  const result = runnerRun(selection, handle, name, timeoutSeconds, env, spawn, root);
  return redOf({ selection, target: name, subject: handle, result, registries });
}

// Probe the binary before running it: a config file existing while the linter is
// not installed is a tooling gap, not a code defect, and must not block the edit.
function lint(
  selection: RunnerSelection,
  file: string,
  start: string,
  root: string,
  stop: string,
  env: NodeJS.ProcessEnv,
  spawn: SpawnSyncLike,
  registries: Registries,
): Failure[] {
  // biome and eslint are driven through the package manager's exec form, which
  // only the Node arms carry.
  if (selection.kind === 'python') return [];
  for (const linter of LINTERS) {
    // Bounded and contained like the package hunt: a biome.json above the
    // session cwd, or reached through a symlink out of it, must not decide that
    // this edit gets linted.
    const configDir = findUpAny(start, linter.configs, stop);
    if (configDir === null || !containedIn(stop, configDir)) continue;
    const exec = selection.exec.split(' ').filter((part) => part !== '');
    const command = exec[0] ?? '';
    if (command === '') return [];
    const rest = exec.slice(1);
    if (execRun(spawn, command, [...rest, linter.target, '--version'], root, env, PROBE_TIMEOUT_SECONDS).code !== 0) return [];
    const args = linter.target === 'biome' ? [...rest, linter.target, 'check', file] : [...rest, linter.target, file];
    const result = execRun(spawn, command, args, root, env, LINT_TIMEOUT_SECONDS);
    return redOf({ selection, target: linter.target, subject: file, result, registries });
  }
  return [];
}

// The only failure this hook reports. `infra` — a timeout, a stale target probe,
// a runtime too old — is not the edit's fault and never becomes exit 2.
interface RunVerdictInput {
  selection: RunnerSelection;
  target: string;
  subject: string;
  result: RunResult;
  registries: Registries;
}

function redOf({ selection, target, subject, result, registries }: RunVerdictInput): Failure[] {
  const verdict = classify(
    { kind: 'run', runner: selection.kind, target, code: result.code, output: result.output, timedOut: result.timedOut },
    registries.policy.repair.infra_patterns,
  );
  if (verdict === null || verdict.situation !== 'red') return [];
  return [{ target, subject, output: result.output }];
}
