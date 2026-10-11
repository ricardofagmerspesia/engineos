// EngineOS Stop hook: runs scoped lint + typecheck for the packages changed this
// session and blocks finishing if any fail. No-op when there is nothing to run.
// Never blocks on infra quirks — only on genuine red (a real lint/type/test
// failure). Automatic hooks run lint/typecheck only. Approved tests are a
// separate orchestrator command after implementation is fully integrated
// (rules/verification.md); environment flags cannot provide user consent.
// It runs ONLY in projects that have adopted EngineOS — a working tree carrying
// `.engineos/` — because the checks it runs are the target repo's own scripts.
//
// Port of hooks/stop-verify.sh. The ladder below runs once for every runner: Nx,
// pnpm/yarn/npm and the Python environment are adapters behind ./runner.ts, so
// the timeout table is written here exactly once, and every infra-vs-red
// judgment goes through ./classify-failure.ts. The runner is selected PER
// PACKAGE (design §A1): a repo can hold a FastAPI service beside a React app,
// and one directory can even be both.
//
// The fix-loop bound is NOT restated here. The block reason comes from the
// kernel's repair section (../kernel/repair), which is the one reader of
// registries/policy.json .repair.max_fix_attempts_per_check — this hook is a
// shim over that answer, never a private copy of the numbers.
import { join } from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import type { HookEnvelope } from './envelope';
import { block, message, silent, type HookContext, type HookDecision } from './output';
import { bypassActive } from './bypass';
import { classify, type InfraReason } from './classify-failure';
import { PYTHON_UNAVAILABLE_REASON, runnerHandle, runnerHasTarget, runnerRun, runnerSelect, runnerSelectFor, type RunnerSelection, type RunnerUnavailable, type SpawnSyncLike } from './runner';
import { unpinnedTools } from './runner-python';
import { event, telemetrySink, withSpan, type EventData, type SpanFacts } from './telemetry';
import type { SpanStatus } from '../registry/policy-exec-journal';
import type { ProjectConfig } from '../registry/project-config';
import { NODE_PACKAGE_MARKERS, SUMMARY_LINES, containedIn, failureBlock, firstLines, hasPythonExtension, hasVerifyExtension, isDirectory, isFile, packageOwner, projectConfig, runnerCommand, runnerFound, runnerProbe, startDir, verifyEnvironment, type VerifyEnvironment } from './verify-targets';
import { lazyRegistries, type Registries } from '../kernel/context';
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

// An infra finding made DURING a run — a budget kill, or a Python tool the
// environment turned out not to hold — as opposed to one made before the
// ladder started (node too old, runner never found), which the plan records
// as a line and never runs.
interface Infra {
  target: string;
  handle: string;
  reason: InfraReason;
  subject: string;
}

interface Ladder {
  failures: Failure[];
  infra: Infra[];
  // One line per Python package with a tool left unpinned (D2). Advisory: it
  // never blocks and never changes the span status.
  advisories: string[];
}

// One package under one runner. A directory holding both a pyproject.toml and
// a package.json is two of these.
interface Run {
  packageDir: string;
  selection: RunnerSelection;
}

// What the gate decided BEFORE running anything: the runs it will make, and the
// lines that explain what it will not — a Python package with no environment,
// a Node package under a node too old for its toolchain, a runner whose probe
// failed. Every skipped package says so; an infra gap is announced, never
// swallowed (design deviation 2).
interface Plan {
  runs: Run[];
  lines: string[];
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

  const skippedFiles = files.filter(hasPythonExtension).map((file) => `[engineos] skipped ${file}: ${PYTHON_UNAVAILABLE_REASON}`);
  const packages = packageDirs(files.filter((file) => !hasPythonExtension(file)), root);
  if (packages.length === 0) return skippedFiles.length === 0 ? silent : message(skippedFiles.join('\n'));

  const targets = DEFAULT_TARGETS;
  // The nvm default is tried first; a node still too old is judged per Node
  // package in planRuns, so a Python package in the same repo is verified
  // regardless — its toolchain never ran on node.
  const environment = verifyEnvironment(ctx.io.env, nodeVersion);
  const plan = planRuns(packages, targets, root, projectConfig(root), environment, spawn);
  plan.lines.unshift(...skippedFiles);
  // Nothing to run means nothing was verified, so there is no verdict to record
  // and no span to open — only the lines that say why.
  if (plan.runs.length === 0) return plan.lines.length === 0 ? silent : message(plan.lines.join('\n'));

  const sink = telemetrySink(env, ctx, { bypassed: false });
  // The span measures the CHECKS, not the transcript parsing that decided which
  // packages to check, which is why it opens here and not at the top.
  const ladder = withSpan(sink, VERIFICATION_SPAN, () => {
    const result = runLadder(plan.runs, targets, environment.env, spawn, root, lazyRegistries(ctx.root));
    return { result, status: ladderStatus(result) };
  });
  // Written red or green: a green run is half the base rate usage-report.sh has
  // lacked. Inside no guard of its own — the sink already answers for
  // ENGINEOS_TELEMETRY, bypass and the project's .engineos/ opt-in.
  event(sink, 'verify', verifyEvent(root, plan.runs, ladder));

  // Skip, infra and advisory lines ride along on a block too: a red lint must
  // not hide that pyright was skipped or that ruff is unpinned, or the
  // developer fixes the red and meets the next finding one Stop later.
  const testNotice = ctx.io.env['ENGINEOS_VERIFY_TESTS'] === '1'
    ? ['[engineos] ENGINEOS_VERIFY_TESTS is deprecated and ignored: tests require explicit user approval and a separate final command after integration.']
    : [];
  const lines = [...testNotice, ...plan.lines, ...ladder.infra.map(infraLineOf), ...ladder.advisories];
  if (ladder.failures.length > 0) {
    const reason = blockReason(ctx.root, ladder.failures);
    return block(lines.length === 0 ? reason : `${reason}\n${lines.join('\n')}`);
  }
  return lines.length === 0 ? silent : message(lines.join('\n'));
}

// ------------------------------------------------------------------ internals

// The one timeout table, applied to whichever runner was selected. The budget
// is a setting, not a new constant (design §A1.5): pyright's first run over a
// large repo can outlast the default, and ENGINEOS_VERIFY_BUDGET_S raises every
// target's budget to the seconds it names. A value that is not a positive
// integer is ignored rather than read as zero — zero would kill every check
// on arrival and report the whole gate as a timeout.
function budgetFor(target: string, env: NodeJS.ProcessEnv): number {
  const override = Number.parseInt(env['ENGINEOS_VERIFY_BUDGET_S'] ?? '', 10);
  if (Number.isInteger(override) && override > 0) return override;
  return target === TEST_TARGET ? 180 : 90;
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
    const owner = packageOwner(startDir(file), stopReal);
    if (owner === null) continue;
    if (containedIn(stopReal, owner)) dirs.add(owner);
  }
  return [...dirs].sort();
}

// Selection per package, probe per distinct runner. The runner-found probe used
// to run once per stop cycle because there was one runner per repo; with a
// runner per package it runs once per distinct probe argv — a root `.venv`
// shared by three services is asked once, and so is npm — and a probe that
// fails drops every package behind it with one line.
function planRuns(
  packages: readonly string[],
  targets: readonly string[],
  root: string,
  config: ProjectConfig | null,
  environment: VerifyEnvironment,
  spawn: SpawnSyncLike,
): Plan {
  const runs: Run[] = [];
  const lines: string[] = [];
  // A runtime too old to run the Node toolchain is an infra gap, not a genuine
  // red — this hook's own charter — and it is a NODE gap: it applies only when a
  // Node package is in scope, and it is announced once however many there are.
  const tooOld = classify({ kind: 'environment', nodeMajor: environment.nodeMajor });
  let nodeAnnounced = false;
  const probed = new Map<string, boolean>();
  for (const packageDir of packages) {
    for (const selection of selectionsFor(packageDir, root, config, spawn)) {
      if (selection.kind === 'python-unavailable') {
        lines.push(`[engineos] stop-verify skipped for ${relativeToRoot(root, packageDir)}: ${selection.reason}`);
        continue;
      }
      if (selection.kind !== 'python' && tooOld !== null && tooOld.situation === 'infra') {
        if (!nodeAnnounced) lines.push(infraLine(tooOld.reason, targets, `node ${environment.nodeMajor} cannot start the toolchain`));
        nodeAnnounced = true;
        continue;
      }
      const key = runnerProbe(selection).join(' ');
      let found = probed.get(key);
      if (found === undefined) {
        found = runnerFound(selection, environment.env, spawn, root);
        probed.set(key, found);
        const missing = classify({ kind: 'runner', found });
        if (missing !== null && missing.situation === 'infra') lines.push(infraLine(missing.reason, targets, missingSubject(selection)));
      }
      if (found) runs.push({ packageDir, selection });
    }
  }
  return { runs, lines };
}

// A directory that holds both a pyproject.toml and a package.json — a LangGraph
// service with its React front in the same root — is two packages sharing a
// directory, and each runs under its own runner (design §A1.1). The Python
// selection is asked first because it is the one that can be unavailable.
function selectionsFor(packageDir: string, root: string, config: ProjectConfig | null, spawn: SpawnSyncLike): (RunnerSelection | RunnerUnavailable)[] {
  const primary = runnerSelectFor(packageDir, root, config, undefined, spawn);
  if (primary.kind !== 'python' && primary.kind !== 'python-unavailable') return [primary];
  const alsoNode = NODE_PACKAGE_MARKERS.some((marker) => isFile(join(packageDir, marker)));
  return alsoNode ? [primary, runnerSelect(root)] : [primary];
}

function missingSubject(selection: RunnerSelection): string {
  if (selection.kind === 'python') return `${runnerProbe(selection).join(' ')} did not answer --version (${selection.env.source})`;
  return `${runnerCommand(selection)} is not on PATH`;
}

function runLadder(
  runs: readonly Run[],
  targets: readonly string[],
  env: NodeJS.ProcessEnv,
  spawn: SpawnSyncLike,
  root: string,
  // The EngineOS checkout's registries (ctx.root), not the project's: the
  // "target was never there" patterns are policy, read from the same root as
  // every other policy answer this hook gives.
  registries: Registries,
): Ladder {
  const failures: Failure[] = [];
  const infra: Infra[] = [];
  const advisories: string[] = [];
  for (const { packageDir, selection } of runs) {
    if (!isDirectory(packageDir)) continue;
    if (selection.kind === 'python') {
      const unpinned = unpinnedTools(packageDir);
      if (unpinned.length > 0) advisories.push(`[engineos] ${relativeToRoot(root, packageDir)}: ${unpinned.join(', ')} not pinned to exact versions (rules/verification.md)`);
    }
    const handle = runnerHandle(selection, packageDir);
    if (handle === null) continue;
    for (const target of targets) {
      if (!runnerHasTarget(selection, handle, target, undefined, spawn, root)) continue;
      const seconds = budgetFor(target, env);
      const result = runnerRun(selection, handle, target, seconds, env, spawn, root);
      const verdict = classify(
        { kind: 'run', runner: selection.kind, target, code: result.code, output: result.output, timedOut: result.timedOut },
        registries.policy.repair.infra_patterns,
      );
      if (verdict === null) continue;
      if (verdict.situation === 'red') {
        failures.push({ target, handle, output: result.output });
        continue;
      }
      if (verdict.reason === 'timeout') infra.push({ target, handle, reason: verdict.reason, subject: `${handle} hit its ${seconds}s budget` });
      // A Python tool the environment does not hold surfaces at run time (the
      // classifier's python row): announced, like every infra finding.
      if (verdict.reason === 'runner-missing') infra.push({ target, handle, reason: verdict.reason, subject: `${handle}: ${missingToolLine(result.output)}` });
      // `target-absent` after a stale probe is "nothing to run", not a finding:
      // the caller continues silently.
    }
  }
  return { failures, infra, advisories };
}

// The line the classifier matched on, so the operator reads "No module named
// ruff" rather than the whole ruff transcript; the argv line stands in when the
// tool said nothing recognisable.
function missingToolLine(output: string): string {
  const matched = /^.*(?:No module named|command not found|No such file or directory).*$/im.exec(output);
  return (matched?.[0] ?? firstLines(output, 1)).trim();
}

// A check that was killed by its budget — or that could not start its tool —
// reported nothing about the code, so the gate neither passed nor failed: `OK`
// there would claim a green run the gate never observed, and `FAILED` would
// blame the code for a tooling gap. bash had no third answer because a timeout
// was simply red to it.
function ladderStatus(ladder: Ladder): SpanStatus {
  if (ladder.failures.length > 0) return 'FAILED';
  return ladder.infra.length > 0 ? 'DEGRADED' : 'OK';
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
//
// `targets` names the packages the ladder ENTERED: a package skipped before the
// ladder (no Python environment, node too old) was not verified, and listing it
// would claim a run the gate never made. A directory entered under two runners
// is one package here.
function verifyEvent(root: string, runs: readonly Run[], ladder: Ladder): EventData {
  const entered = [...new Set(runs.map((run) => relativeToRoot(root, run.packageDir)))];
  const data: EventData = {
    failed: ladder.failures.length > 0,
    targets: entered,
  };
  if (ladder.failures.length > 0) {
    data['situation'] = 'red';
    return data;
  }
  const first = ladder.infra[0];
  if (first !== undefined) {
    data['situation'] = 'infra';
    data['reason'] = first.reason;
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

function infraLineOf(finding: Infra): string {
  return infraLine(finding.reason, [finding.target], finding.subject);
}
