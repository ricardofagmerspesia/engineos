// The vocabulary the two verification hooks share: which files are worth
// verifying, which directory owns one, what node they will run under, how a raw
// command is run under a budget, and how a failed step is rendered.
//
// ./runner.ts owns the runner ladder and ./classify-failure.ts owns the
// infra-vs-red judgment; this file is what is left over once those two have
// their halves, and it exists so ./stop-verify.ts and ./post-edit-check.ts carry
// one copy of it instead of two.
import { existsSync, statSync } from 'node:fs';
import { delimiter } from 'node:path';
import { runnerEnv, type RunResult, type RunnerSelection, type SpawnSyncLike } from './runner';
import { isRecord } from '../lib/json';

// JS/TS-family only: the runners understand package.json/nx targets and nothing
// else, so another extension would be collected but never verified — a silent
// no-op that reads as coverage. Non-JS stacks verify manually (CLAUDE.md #2).
export const VERIFY_EXTENSIONS: readonly string[] = ['ts', 'tsx', 'js', 'jsx'];

// bash find_up's marker list for "the package this file belongs to".
export const PACKAGE_MARKERS: readonly string[] = ['package.json', 'project.json'];

// How many lines of a failure summary reach the operator (bash `head -80`).
export const SUMMARY_LINES = 80;

// bash probed a binary's `--version` with no budget at all. A hook that hangs on
// a wedged package manager is worse than one that reports the probe failed, so
// the probe gets the same kind of wall clock every run has.
export const PROBE_TIMEOUT_SECONDS = 15;

export interface VerifyEnvironment {
  env: NodeJS.ProcessEnv;
  nodeMajor: number;
}

export function hasVerifyExtension(file: string): boolean {
  return VERIFY_EXTENSIONS.some((ext) => file.endsWith(`.${ext}`));
}

// bash `find_up <start> <name...>`: every name is probed at each level BEFORE the
// walk ascends. Looping src/lib/git.ts findUp once per name would instead exhaust
// the whole ascent for the first name, so a nested project.json beside a distant
// package.json would resolve to the wrong package.
//
// `stop` bounds the ascent: the walk probes `stop` itself and then gives up
// rather than climbing past it, and a `start` that is neither `stop` nor under
// it is refused without a single probe. Callers that pass no `stop` keep bash's
// unbounded walk to the filesystem root.
export function findUpAny(start: string, names: readonly string[], stop?: string): string | null {
  if (stop !== undefined && start !== stop && !start.startsWith(`${stop}/`)) return null;
  let dir = start;
  let previous = '';
  while (dir !== '/' && dir !== previous && dir !== '') {
    for (const name of names) {
      if (existsSync(`${dir}/${name}`)) return dir;
    }
    if (dir === stop) return null;
    previous = dir;
    dir = parentOf(dir);
  }
  return null;
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// bash `ensure_modern_node`, which exported the fixed PATH and then re-ran
// `node -v` to report the resulting major. runnerEnv owns the PATH half and
// returns the SAME object when it found nothing to prepend, so identity is the
// signal that the rescue fired. The prepended entry is an nvm bin directory named
// `v<major>.<minor>.<patch>`, so the rescued major is READ from it rather than
// assumed; a name that does not parse keeps the original major, which skips
// verification rather than running it under a runtime nobody could name.
export function verifyEnvironment(env: NodeJS.ProcessEnv, version: string = process.versions.node): VerifyEnvironment {
  const onPath = majorOf(version);
  const fixed = runnerEnv(env, onPath);
  if (fixed === env) return { env, nodeMajor: onPath };
  const prepended = (fixed['PATH'] ?? '').split(delimiter)[0] ?? '';
  const found = /\/v(\d+)[^/]*\/bin$/.exec(prepended);
  const rescued = found === null ? Number.NaN : Number.parseInt(found[1] ?? '', 10);
  return { env: fixed, nodeMajor: Number.isNaN(rescued) ? onPath : rescued };
}

// The binary a selection is actually driven through: the package manager for the
// npm-family ladder, the `exec` form Nx is invoked behind.
export function runnerCommand(sel: RunnerSelection): string {
  const command = (sel.kind === 'nx' ? sel.exec : sel.run).split(' ').find((part) => part !== '');
  return command ?? '';
}

// bash never asked whether the runner existed, so a machine without the package
// manager produced a non-zero run with no output and the Stop gate read it as red
// — a block no code edit could clear. One probe per stop cycle answers the
// classifier's `runner` row instead.
export function runnerFound(sel: RunnerSelection, env: NodeJS.ProcessEnv, spawn: SpawnSyncLike, cwd: string): boolean {
  const command = runnerCommand(sel);
  if (command === '') return false;
  return execRun(spawn, command, ['--version'], cwd, env, PROBE_TIMEOUT_SECONDS).code === 0;
}

// The raw-command counterpart of runnerRun. ./runner.ts deliberately exposes only
// the target ladder, and post-edit-check drives biome/eslint directly, so the
// spawn-result reading is restated here rather than a target being invented for a
// linter invocation.
export function execRun(
  spawn: SpawnSyncLike,
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutSeconds: number,
): RunResult {
  const result = spawn(command, args, { cwd, env, encoding: 'utf8', timeout: timeoutSeconds * 1000 });
  // spawnSync reports its own timeout twice: an ETIMEDOUT error and the SIGTERM it
  // sent. Either is enough, and neither can be confused with an exit code the
  // command chose.
  const timedOut = errorCodeOf(result.error) === 'ETIMEDOUT' || result.signal === 'SIGTERM';
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const code = typeof result.status === 'number' ? result.status : timedOut ? 124 : 1;
  return { code, output, timedOut };
}

// bash `--- ${TARGET} failed (${SUBJECT}) ---\n${OUT}`, where `$(...)` had already
// stripped the command output's trailing newlines.
export function failureBlock(target: string, subject: string, output: string): string {
  return `--- ${target} failed (${subject}) ---\n${output.replace(/\n+$/, '')}`;
}

export function firstLines(text: string, limit: number): string {
  return text.split('\n').slice(0, limit).join('\n');
}

// ------------------------------------------------------------------ internals

// bash `case "$d" in */*) d="${d%/*}"; [ -n "$d" ] || d="/" ;; *) d="." ;; esac`.
// The same string surgery src/lib/git.ts keeps private: path.dirname would resolve
// past the "." a relative path converges to, and the walk would not terminate.
function parentOf(dir: string): string {
  const cut = dir.lastIndexOf('/');
  if (cut === -1) return '.';
  const head = dir.slice(0, cut);
  return head === '' ? '/' : head;
}

function majorOf(version: string): number {
  const parsed = Number.parseInt(version.replace(/^v/, ''), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// `error.code` is not on the Error type, and narrowing beats asserting.
function errorCodeOf(error: Error | undefined): string | null {
  if (error === undefined) return null;
  const candidate: unknown = error;
  if (!isRecord(candidate)) return null;
  const code = candidate['code'];
  return typeof code === 'string' ? code : null;
}
