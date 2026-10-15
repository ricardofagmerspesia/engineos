// The vocabulary the two verification hooks share: which files are worth
// verifying, which directory owns one, what node they will run under, how a raw
// command is run under a budget, and how a failed step is rendered.
//
// ./runner.ts owns the runner ladder and ./classify-failure.ts owns the
// infra-vs-red judgment; this file is what is left over once those two have
// their halves, and it exists so ./stop-verify.ts and ./post-edit-check.ts carry
// one copy of it instead of two.
import { existsSync, realpathSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { runnerEnv, type RunResult, type RunnerSelection, type SpawnSyncLike } from './runner';
import { PROBE_TIMEOUT_SECONDS } from './runner-python';
import { isRecord } from '../lib/json';
import { loadProjectConfig, type ProjectConfig } from '../registry/project-config';

// The probe budget lives beside the Python probe (./runner-python.ts, which
// this module cannot import from without a cycle through ./runner.ts) and is
// re-exported here so every caller keeps the one name it always had.
export { PROBE_TIMEOUT_SECONDS };

// Python extensions/markers remain collected so the final gate can report an
// explicit unsupported skip instead of implying verification coverage.
export const NODE_EXTENSIONS: readonly string[] = ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts', 'mjs', 'cjs'];
export const PYTHON_EXTENSIONS: readonly string[] = ['py', 'pyi'];
export const VERIFY_EXTENSIONS: readonly string[] = [...NODE_EXTENSIONS, ...PYTHON_EXTENSIONS];

// bash find_up's marker list for "the package this file belongs to", one list
// per arm. requirements.txt is the weaker Python marker: packageOwner promotes
// a hit on it to the pyproject.toml above when there is one (design §A1.1).
export const NODE_PACKAGE_MARKERS: readonly string[] = ['package.json', 'project.json'];
export const PYTHON_PACKAGE_MARKERS: readonly string[] = ['pyproject.toml', 'requirements.txt'];
export const PACKAGE_MARKERS: readonly string[] = [...NODE_PACKAGE_MARKERS, ...PYTHON_PACKAGE_MARKERS];

// The directory names under a project whose package files are not the
// project's: a dependency's package.json under node_modules, a wheel's
// pyproject.toml under a venv's site-packages, and a bytecode cache that can
// hold nothing worth entering. An owner reached through any of them is refused.
const FOREIGN_SEGMENTS: readonly string[] = ['node_modules', '.venv', 'site-packages', '__pycache__'];

// How many lines of a failure summary reach the operator (bash `head -80`).
export const SUMMARY_LINES = 80;

export interface VerifyEnvironment {
  env: NodeJS.ProcessEnv;
  nodeMajor: number;
}

export function hasVerifyExtension(file: string): boolean {
  return VERIFY_EXTENSIONS.some((ext) => file.endsWith(`.${ext}`));
}

export function hasPythonExtension(file: string): boolean {
  return PYTHON_EXTENSIONS.some((ext) => file.endsWith(`.${ext}`));
}

// The project's declared stack, or null when it declared none. A malformed
// `.engineos/config.json` is read as absent HERE, on purpose: the gate's charter
// is to block on red code, and a config typo turning every Stop into a crash
// (or a silent skip, which is what a thrown hook renders as) would be the
// gate disabled by a JSON comma. The SessionStart stack line is where a
// malformed config is reported, by the loader's own message.
export function projectConfig(root: string): ProjectConfig | null {
  try {
    return loadProjectConfig(root);
  } catch {
    return null;
  }
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
//
// Every path decision goes through node:path rather than `/` string surgery,
// because the `/`-only form was silently dead on Windows: stop-verify hands this
// a `realpathSync(root)` of `C:\Users\...`, a start of `C:\Users\...\src` never
// matched the `${stop}/` prefix, so every file answered null and the Stop gate
// verified nothing while reading as green. `relative`/`dirname` also handle the
// mixed `C:/Users` forms Git Bash gives node. Consequence, accepted: a RELATIVE
// `start` now resolves against the process cwd instead of converging to `.` —
// every caller passes an absolute path already (startDir below, and
// post-edit-check's own start is one of these).
export function findUpAny(start: string, names: readonly string[], stop?: string): string | null {
  const from = resolve(start);
  const ceiling = stop === undefined ? undefined : resolve(stop);
  if (ceiling !== undefined && !isWithin(ceiling, from)) return null;
  let dir = from;
  for (;;) {
    for (const name of names) {
      if (existsSync(join(dir, name))) return dir;
    }
    // Compared through `relative`, not `===`: win32 `relative` is case-insensitive
    // while `===` is not, and a start admitted as `c:\repo\src` against a ceiling
    // of `C:\repo` would otherwise climb straight past it.
    if (ceiling !== undefined && relative(ceiling, dir) === '') return null;
    const parent = dirname(dir);
    // The filesystem root is its own parent, on every platform and every drive.
    if (parent === dir) return null;
    dir = parent;
  }
}

// `path` is `ceiling` itself or somewhere beneath it. Decided on the first
// segment of `relative`, not a string prefix: `<stop>-other` answers
// `../<stop>-other` and is refused, while a directory legitimately NAMED
// `..hidden` answers `..hidden/...` and must not be — a bare startsWith('..')
// silently left every file under such a name unverified.
function isWithin(ceiling: string, path: string): boolean {
  const inside = relative(ceiling, path);
  if (inside === '') return true;
  if (isAbsolute(inside)) return false;
  return inside !== '..' && !inside.startsWith(`..${sep}`);
}

// The physical directory a walk starts from, so findUpAny compares one path form
// against another. A directory that does not exist has no realpath — a hook's
// transcript names files the session may since have moved — and the lexical
// resolve is the fallback; the containment check is what covers that walk, since
// a lexical ascent from a non-existent path can still cross a symlink.
export function startDir(file: string): string {
  const dir = dirname(file);
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

// Containment decided on PHYSICAL paths, because a lexical prefix is not one: a
// committed symlink `<root>/vendor -> /outside` names a directory that resolves
// out of the tree while every string form of it still reads as being under
// `root`, and existsSync follows the link. Fails closed — a path whose realpath
// cannot be taken is not contained.
//
// "Under the root" is also not "part of the project": a dependency's
// package.json under node_modules is inside the consented tree and was never
// consented to, and its `lint`/`typecheck` scripts are not lifecycle scripts, so
// `npm ci --ignore-scripts` does nothing about them. The same holds for a
// wheel's pyproject.toml under `.venv/lib/.../site-packages`: `ruff check .`
// there would lint a vendored tree the developer never wrote. An owner reached
// through any FOREIGN_SEGMENTS entry is therefore refused too.
export function containedIn(root: string, candidate: string): boolean {
  let rootReal: string;
  let candidateReal: string;
  try {
    rootReal = realpathSync(root);
    candidateReal = realpathSync(candidate);
  } catch {
    return false;
  }
  if (!isWithin(rootReal, candidateReal)) return false;
  return !relative(rootReal, candidateReal).split(sep).some((segment) => FOREIGN_SEGMENTS.includes(segment));
}

// Active verification resolves the nearest Node owner first. A legacy manifest
// nested inside a Node package must not claim its JavaScript/TypeScript files
// and suppress that package's checks. Python-only fallback preserves a visible
// unsupported skip for legacy callers, with requirements promoted as before.
export function packageOwner(start: string, stop: string): string | null {
  const nodeOwner = findUpAny(start, NODE_PACKAGE_MARKERS, stop);
  if (nodeOwner !== null) return nodeOwner;
  const owner = findUpAny(start, PYTHON_PACKAGE_MARKERS, stop);
  if (owner === null || !requirementsOnly(owner)) return owner;
  // dirname(stop) lies outside the ceiling, and findUpAny refuses such a start
  // without probing — which is exactly the bound the promotion must keep.
  return findUpAny(dirname(owner), ['pyproject.toml'], stop) ?? owner;
}

function requirementsOnly(dir: string): boolean {
  if (!existsSync(join(dir, 'requirements.txt'))) return false;
  return !PACKAGE_MARKERS.some((marker) => marker !== 'requirements.txt' && existsSync(join(dir, marker)));
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

// The argv (without `--version`) that asks whether a selection can run at all:
// the package manager for the npm-family ladder, the `exec` form Nx is invoked
// behind, the environment's launcher for Python. Two selections with the same
// probe are the same runner as far as the Stop gate's once-per-runner probe is
// concerned.
export function runnerProbe(sel: RunnerSelection): readonly string[] {
  if (sel.kind === 'python') return [];
  const command = (sel.kind === 'nx' ? sel.exec : sel.run).split(' ').find((part) => part !== '');
  return command === undefined ? [] : [command];
}

// The binary a selection is actually driven through — what an infra message
// names when the probe fails.
export function runnerCommand(sel: RunnerSelection): string {
  return runnerProbe(sel)[0] ?? '';
}

// bash never asked whether the runner existed, so a machine without the package
// manager produced a non-zero run with no output and the Stop gate read it as red
// — a block no code edit could clear. One probe per stop cycle answers the
// classifier's `runner` row instead.
export function runnerFound(sel: RunnerSelection, env: NodeJS.ProcessEnv, spawn: SpawnSyncLike, cwd: string): boolean {
  const [command, ...rest] = runnerProbe(sel);
  if (command === undefined || command === '') return false;
  return execRun(spawn, command, [...rest, '--version'], cwd, env, PROBE_TIMEOUT_SECONDS).code === 0;
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
