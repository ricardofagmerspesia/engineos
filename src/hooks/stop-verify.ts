// EngineOS Stop hook: runs scoped lint + typecheck for the packages changed this
// session and blocks finishing if any fail. No-op when there is nothing to run.
// Never blocks on infra quirks — only on genuine red (a real lint/type/test
// failure). Tests are opt-in, not part of the default gate (rules/verification.md
// "Tests are opt-in"); ENGINEOS_VERIFY_TESTS=1 folds the test target back in.
// It runs ONLY in projects that have adopted EngineOS — a working tree carrying
// `.engineos/` — because the checks it runs are the target repo's own scripts.
//
// Port of hooks/stop-verify.sh. The ladder below runs once for every runner: Nx
// and pnpm/yarn/npm are adapters behind ./runner.ts, so the timeout table is
// written here exactly once, and every infra-vs-red judgment goes through
// ./classify-failure.ts.
//
// The fix-loop bound is NOT restated here. The block reason comes from the
// kernel's repair section (../kernel/repair), which is the one reader of
// registries/policy.json .repair.max_fix_attempts_per_check — this hook is a
// shim over that answer, never a private copy of the numbers.
import { dirname, join, resolve, sep } from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import type { HookEnvelope } from './envelope';
import { block, message, silent, type HookContext, type HookDecision } from './output';
import { bypassActive } from './bypass';
import { classify, type InfraReason } from './classify-failure';
import { runnerHandle, runnerHasTarget, runnerRun, runnerSelect, type RunnerSelection, type SpawnSyncLike } from './runner';
import { event, telemetrySink, withSpan, type EventData, type SpanFacts } from './telemetry';
import type { SpanStatus } from '../registry/policy-exec-journal';
import { PACKAGE_MARKERS, SUMMARY_LINES, failureBlock, findUpAny, firstLines, hasVerifyExtension, isDirectory, isFile, runnerCommand, runnerFound, verifyEnvironment } from './verify-targets';
import { lazyRegistries } from '../kernel/context';
import { repairSection } from '../kernel/repair';
import { isRecord } from '../lib/json';
import { repoRoot } from '../lib/git';

// Edit/Write/NotebookEdit only, so merely READING a file does not pull its
// package into the gate.
const EDIT_TOOLS: readonly string[] = ['Edit', 'Write', 'NotebookEdit'];

const DEFAULT_TARGETS: readonly string[] = ['lint', 'typecheck'];
const TEST_TARGET = 'test';

// The attempt this gate speaks for: it is the FIRST red of a check, and the
// kernel's ladder answers what to do about that. A later attempt is the fix
// loop's own call to `kernel repair`, not this hook's.
const FIRST_ATTEMPT = 1;

// model_tier is `cheap`: lint and typecheck are mechanical and invoke no model.
// `validate` is the capabilities.json id for "run the target repo's own
// lint/typecheck/test checks" — exactly this gate.
const VERIFICATION_SPAN: SpanFacts = { kind: 'verification', capability: 'validate', modelTier: 'cheap' };

interface Failure {
  target: string;
  handle: string;
  output: string;
}

interface Timeout {
  target: string;
  handle: string;
  seconds: number;
}

interface Ladder {
  failures: Failure[];
  timeouts: Timeout[];
}

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  return verify(env, ctx, ctx.spawn);
}

// `spawn` and `nodeVersion` are parameters so a unit test drives the whole ladder
// without a package manager and without the runtime it happens to run under.
export function verify(
  env: HookEnvelope,
  ctx: HookContext,
  spawn: SpawnSyncLike,
  nodeVersion: string = process.versions.node,
): HookDecision {
  if (bypassActive(env.cwd, ctx.io.env, ctx.spawn)) return silent;
  // Already blocked once this stop cycle -> let it through, and log nothing: one
  // stop cycle writes one verify event, never two.
  if (env.stopHookActive) return silent;
  if (!isFile(env.transcriptPath)) return silent;
  if (env.cwd === '') return silent;
  const root = repoRoot(env.cwd, ctx.spawn);
  if (root === null) return silent;
  // Adoption is consent. Hooks run outside the tool-permission prompt, so every
  // `npm run <target>` below would execute whatever the nearest package.json
  // declares with nothing asking the user first — a repository that has not
  // adopted EngineOS must never have its scripts run by this gate. The marker is
  // the same one the telemetry sink reads: `.engineos/` at the working tree root,
  // as ensure-project-layout.ts defines it. No env override.
  if (!isDirectory(join(root, '.engineos'))) return silent;

  const files = changedFiles(env.transcriptPath);
  if (files.length === 0) return silent;

  // A runtime too old to run the toolchain is an infra gap, not a genuine red —
  // this hook's own charter. The nvm default is tried first; still too old skips
  // verification rather than blocking on failures no code edit can fix.
  const environment = verifyEnvironment(ctx.io.env, nodeVersion);
  const tooOld = classify({ kind: 'environment', nodeMajor: environment.nodeMajor });
  if (tooOld !== null && tooOld.situation === 'infra') {
    return message(infraLine(tooOld.reason, targetsFor(ctx.io.env), `node ${environment.nodeMajor} cannot start the toolchain`));
  }

  const packages = packageDirs(files, root);
  if (packages.length === 0) return silent;

  const targets = targetsFor(ctx.io.env);
  const selection = runnerSelect(root);
  const missing = classify({ kind: 'runner', found: runnerFound(selection, environment.env, spawn, root) });
  if (missing !== null && missing.situation === 'infra') {
    return message(infraLine(missing.reason, targets, `${runnerCommand(selection)} is not on PATH`));
  }

  const sink = telemetrySink(env, ctx, { bypassed: false });
  // The span measures the CHECKS, not the transcript parsing that decided which
  // packages to check, which is why it opens here and not at the top.
  const ladder = withSpan(sink, VERIFICATION_SPAN, () => {
    const result = runLadder(selection, packages, targets, environment.env, spawn, root);
    return { result, status: ladderStatus(result) };
  });
  // Written red or green: a green run is half the base rate usage-report.sh has
  // lacked. Inside no guard of its own — the sink already answers for
  // ENGINEOS_TELEMETRY, bypass and the project's .engineos/ opt-in.
  event(sink, 'verify', verifyEvent(root, packages, ladder));

  if (ladder.failures.length > 0) return block(blockReason(ctx.root, ladder.failures));
  if (ladder.timeouts.length > 0) return message(timeoutLines(ladder.timeouts));
  return silent;
}

// ------------------------------------------------------------------ internals

function targetsFor(env: NodeJS.ProcessEnv): readonly string[] {
  return env['ENGINEOS_VERIFY_TESTS'] === '1' ? [...DEFAULT_TARGETS, TEST_TARGET] : DEFAULT_TARGETS;
}

// The real tool_use structure is parsed, so a JSONL line carrying BOTH a Read and
// an Edit cannot leak the Read's path the way a flat line-grep would. A line that
// does not decode is skipped, never fatal: the gate reads the transcript
// leniently and would rather verify less than fail on a malformed record.
function changedFiles(path: string): string[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const files = new Set<string>();
  for (const line of text.split('\n')) {
    if (line === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      continue;
    }
    if (!isRecord(parsed) || parsed['type'] !== 'assistant') continue;
    const messageField = parsed['message'];
    if (!isRecord(messageField)) continue;
    const content = messageField['content'];
    if (!Array.isArray(content)) continue;
    for (const entry of content) {
      if (!isRecord(entry) || entry['type'] !== 'tool_use') continue;
      const name = entry['name'];
      if (typeof name !== 'string' || !EDIT_TOOLS.includes(name)) continue;
      const file = filePathOf(entry);
      if (file !== '' && hasVerifyExtension(file)) files.add(file);
    }
  }
  return [...files].sort();
}

// bash `.input.file_path // .tool_input.file_path`: a real transcript carries
// `input`, the harness fixture carries `tool_input`, and both are read.
function filePathOf(entry: Record<string, unknown>): string {
  const input = entry['input'];
  const primary = isRecord(input) ? input['file_path'] : undefined;
  if (typeof primary === 'string') return primary;
  const legacy = entry['tool_input'];
  const fallback = isRecord(legacy) ? legacy['file_path'] : undefined;
  return typeof fallback === 'string' ? fallback : '';
}

// Adoption is consent, and it was given for THIS working tree only: the marker
// the gate reads is `.engineos/` at `root`, so a package.json ABOVE the root or
// beside it never consented to having its scripts run. Unbounded, the ascent
// reached them — a second, non-adopted checkout touched in the same session, or
// a package.json planted in a world-writable directory above a scratch file,
// had its `lint`/`typecheck` executed with no tool-permission prompt in front
// of it. `root` is therefore both the ascent's ceiling and the containment test
// on what came back.
//
// Containment is decided on PHYSICAL paths, in two layers. The lexical `stop`
// handed to findUpAny bounds the WALK — cheap, and it stops the ascent before it
// probes anything above the root. The realpath comparison below decides the
// containment itself, because a lexical prefix is not one: a committed symlink
// `<root>/vendor -> /outside` names a directory that resolves out of the tree
// while every string form of it still reads as being under `root`, and
// existsSync follows the link, so the lexical test alone admitted `/outside`'s
// package.json and ran its scripts. Both sides are realpath'd, so a root reached
// through a symlinked form — macOS `/tmp` -> `/private/tmp`, a `~/projects` that
// is a volume link — still verifies rather than silently skipping: the walk
// starts from the file's physical directory and the ceiling is the root's.
//
// Fails closed at every step: an unresolvable root verifies nothing, and an
// owner whose realpath cannot be taken or lands outside is dropped rather than
// entered.
function packageDirs(files: readonly string[], root: string): string[] {
  let stopReal: string;
  try {
    stopReal = realpathSync(root);
  } catch {
    return [];
  }
  const dirs = new Set<string>();
  for (const file of files) {
    const owner = findUpAny(startDir(file), PACKAGE_MARKERS, stopReal);
    if (owner === null) continue;
    if (containedIn(stopReal, owner)) dirs.add(owner);
  }
  return [...dirs].sort();
}

// The physical directory the walk starts from, so findUpAny compares one path
// form against another. A directory that does not exist has no realpath — the
// transcript names files the session may since have moved — and the lexical
// resolve is the fallback; the owner check is what covers that walk, since a
// lexical ascent from a non-existent path can still cross a symlink.
function startDir(file: string): string {
  const dir = dirname(file);
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

function containedIn(stopReal: string, owner: string): boolean {
  let ownerReal: string;
  try {
    ownerReal = realpathSync(owner);
  } catch {
    return false;
  }
  return ownerReal === stopReal || ownerReal.startsWith(`${stopReal}${sep}`);
}

function runLadder(
  selection: RunnerSelection,
  packages: readonly string[],
  targets: readonly string[],
  env: NodeJS.ProcessEnv,
  spawn: SpawnSyncLike,
  root: string,
): Ladder {
  const failures: Failure[] = [];
  const timeouts: Timeout[] = [];
  for (const packageDir of packages) {
    if (!isDirectory(packageDir)) continue;
    const handle = runnerHandle(selection, packageDir);
    if (handle === null) continue;
    for (const target of targets) {
      if (!runnerHasTarget(selection, handle, target, undefined, spawn, root)) continue;
      // The one timeout table, applied to whichever runner was selected.
      const seconds = target === TEST_TARGET ? 180 : 90;
      const result = runnerRun(selection, handle, target, seconds, env, spawn, root);
      const verdict = classify({ kind: 'run', runner: selection.kind, target, code: result.code, output: result.output, timedOut: result.timedOut });
      if (verdict === null) continue;
      if (verdict.situation === 'red') {
        failures.push({ target, handle, output: result.output });
        continue;
      }
      if (verdict.reason === 'timeout') timeouts.push({ target, handle, seconds });
      // `target-absent` after a stale probe is "nothing to run", not a finding:
      // the caller continues silently.
    }
  }
  return { failures, timeouts };
}

// A check that was killed by its budget reported nothing about the code, so the
// gate neither passed nor failed — `OK` there would claim a green run the gate
// never observed, and `FAILED` would blame the code for a tooling gap. bash had
// no third answer because a timeout was simply red to it.
function ladderStatus(ladder: Ladder): SpanStatus {
  if (ladder.failures.length > 0) return 'FAILED';
  return ladder.timeouts.length > 0 ? 'DEGRADED' : 'OK';
}

// bash relativized each package dir against the repo root (`s|^$ROOT/||;
// s|^$ROOT$|.|`) so the event names packages, not machine paths.
function relativeToRoot(root: string, dir: string): string {
  if (dir === root) return '.';
  return dir.startsWith(`${root}/`) ? dir.slice(root.length + 1) : dir;
}

// `situation` and `reason` are absent on a wholly green cycle: there is no
// verdict to report, and the append boundary reads a declared key that was never
// sent as simply not sent.
function verifyEvent(root: string, packages: readonly string[], ladder: Ladder): EventData {
  const data: EventData = {
    failed: ladder.failures.length > 0,
    targets: packages.map((dir) => relativeToRoot(root, dir)),
  };
  if (ladder.failures.length > 0) {
    data['situation'] = 'red';
    return data;
  }
  if (ladder.timeouts.length > 0) {
    data['situation'] = 'infra';
    data['reason'] = 'timeout';
  }
  return data;
}

const GATE_PREFIX = 'EngineOS gate: verification failed.';

function blockReason(engineosRoot: string, failures: readonly Failure[]): string {
  const summary = firstLines(failures.map((f) => failureBlock(f.target, f.handle, f.output)).join('\n'), SUMMARY_LINES);
  const first = failures[0];
  const ladder = first === undefined ? '' : repairReason(engineosRoot, first.target);
  return ladder === '' ? `${GATE_PREFIX} ${summary}` : `${GATE_PREFIX} ${ladder} ${summary}`;
}

function repairReason(engineosRoot: string, check: string): string {
  try {
    return repairSection({ check, attempt: FIRST_ATTEMPT }, lazyRegistries(engineosRoot)).reason;
  } catch {
    // An unreadable, relocated or partial registry must not turn a block into a
    // crash: the failure summary alone still says which check went red.
    return '';
  }
}

// Infra is announced, never swallowed: the Validation gate is skipped LOUDLY
// (design deviation 2) and consumes no fix attempt (deviation 7).
function infraLine(reason: InfraReason, targets: readonly string[], subject: string): string {
  return `EngineOS gate: ${targets.join(', ')} skipped — infra (${reason}): ${subject}. No fix attempt is consumed.`;
}

function timeoutLines(timeouts: readonly Timeout[]): string {
  return timeouts.map((t) => infraLine('timeout', [t.target], `${t.handle} hit its ${t.seconds}s budget`)).join('\n');
}
