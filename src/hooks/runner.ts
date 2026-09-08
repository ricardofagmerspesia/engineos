import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { isRecord } from '../lib/json';

// Port of hooks/lib-runner.sh plus the runner half of hooks/lib-common.sh
// (has_script, runner_detect, ensure_modern_node).
//
// A runner is the tool that executes a project's verification targets (lint,
// typecheck, tests): Nx, or a package-manager script runner. Callers see one
// ladder — select -> handle -> hasTarget -> run — and never branch on the runner
// themselves. This module reports FACTS ONLY: it never decides whether a
// non-zero run is the code's fault. That judgment is src/hooks/classify-failure.ts,
// which is why lib-runner.sh's runner_infra_skip has no counterpart here.
//
// Every I/O the module performs is an injected trailing parameter with a real
// default, so a unit test drives the whole ladder without a filesystem or a
// child process.

export type RunnerKind = 'nx' | 'npm-family';

// `spawnSync` is an overload set whose first signature returns Buffers, so it is
// not assignable to the string-returning slice below; binding the utf8 overload
// here is what makes the real call satisfy `SpawnSyncLike`.
const defaultSpawn: SpawnSyncLike = (command, args, options) => spawnSync(command, args, options);

export interface RunnerSelection {
  kind: RunnerKind;
  run: string;
  exec: string;
}

// The exact slice of `spawnSync` this module uses, rather than `typeof spawnSync`
// itself: the real `spawnSync` satisfies it, so callers pass it unchanged, and a
// test can write a fake without a type assertion. `HookContext.spawn` (typed
// `typeof spawnSync`) is assignable to it too.
export type SpawnSyncLike = (
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    encoding: 'utf8';
    env?: NodeJS.ProcessEnv;
    timeout?: number;
  },
) => {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string | null;
  stderr: string | null;
  error?: Error | undefined;
};

export interface RunResult {
  code: number;
  output: string;
  timedOut: boolean;
}

// The node major below which npm-run tooling (ESLint 9, vitest) dies on missing
// runtime APIs. Hooks inherit the launching app's PATH, which can resolve an
// ancient node; this is the version the nvm default is worth reaching for.
const MODERN_NODE_MAJOR = 20;

export function runnerSelect(
  root: string,
  exists: (p: string) => boolean = defaultExists,
): RunnerSelection {
  // The bash arm also required jq, because both Nx probes read JSON. JSON is
  // native here, so nx.json alone decides.
  const kind: RunnerKind = exists(join(root, 'nx.json')) ? 'nx' : 'npm-family';
  if (exists(join(root, 'pnpm-lock.yaml'))) return { kind, run: 'pnpm run', exec: 'pnpm exec' };
  if (exists(join(root, 'yarn.lock'))) return { kind, run: 'yarn run', exec: 'yarn' };
  return { kind, run: 'npm run', exec: 'npx --no-install' };
}

// The identifier this runner addresses the package by, or null when it has none
// (an Nx dir with no resolvable project name — nothing to run, so the caller
// skips it). The handle is opaque to the caller and is also what a failure
// summary names, which is why it differs per adapter: Nx addresses projects by
// name, a package manager by directory.
export function runnerHandle(
  sel: RunnerSelection,
  pkgDir: string,
  readFile: (p: string) => string | null = defaultReadFile,
): string | null {
  if (sel.kind !== 'nx') return pkgDir;
  const project = readName(readFile(join(pkgDir, 'project.json')));
  if (project !== null) return project;
  const pkg = readName(readFile(join(pkgDir, 'package.json')));
  // An Nx project name never carries the npm scope the package name does.
  return pkg === null ? null : pkg.replace(/^@[^/]*\//, '');
}

// True when this runner knows that target for that handle. Each adapter asks its
// own question: `nx show project` for Nx, a declared package.json script for a
// package manager.
export function runnerHasTarget(
  sel: RunnerSelection,
  handle: string,
  target: string,
  readFile: (p: string) => string | null = defaultReadFile,
  spawn: SpawnSyncLike = defaultSpawn,
  cwd: string = process.cwd(),
): boolean {
  if (sel.kind === 'nx') {
    const argv = [...words(sel.exec), 'nx', 'show', 'project', handle, '--json'];
    const shown = spawn(argv[0] ?? '', argv.slice(1), { cwd, encoding: 'utf8' });
    if (shown.status !== 0) return false;
    return declared(parseJson(shown.stdout), 'targets', target);
  }
  return declared(parseJson(readFile(join(handle, 'package.json'))), 'scripts', target);
}

// Run the target under a wall-clock budget and report what happened. The caller
// passes the budget, so one timeout table governs both adapters.
export function runnerRun(
  sel: RunnerSelection,
  handle: string,
  target: string,
  timeoutSeconds: number,
  env: NodeJS.ProcessEnv,
  spawn: SpawnSyncLike = defaultSpawn,
  cwd: string = process.cwd(),
): RunResult {
  // Nx runs from the workspace root and addresses the project by name; a package
  // manager runs from the package dir, which IS its handle.
  const argv =
    sel.kind === 'nx'
      ? [...words(sel.exec), 'nx', 'run', `${handle}:${target}`]
      : [...words(sel.run), '-s', target];
  const runCwd = sel.kind === 'nx' ? cwd : handle;
  const result = spawn(argv[0] ?? '', argv.slice(1), {
    cwd: runCwd,
    env,
    encoding: 'utf8',
    timeout: timeoutSeconds * 1000,
  });
  // spawnSync reports its own timeout twice: an ETIMEDOUT error and the SIGTERM
  // it sent. Either is enough, and neither can be confused with an exit code the
  // target chose — which is why the bash `timeout` convention (exit 124) is not
  // read here as a timeout at all.
  const timedOut = errorCodeOf(result.error) === 'ETIMEDOUT' || result.signal === 'SIGTERM';
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  // A killed process has no exit status; 124 is the conventional timeout code
  // and 1 stands for "failed without saying how".
  const code = typeof result.status === 'number' ? result.status : timedOut ? 124 : 1;
  return { code, output, timedOut };
}

// Best-effort PATH fix, and the only place it lives. Hooks inherit the launching
// app's PATH, which can resolve an ancient node (observed: an nvm v16 bin dir
// stacked FIRST on a PATH accumulated across years of nvm switches). If PATH's
// node is older than the toolchain needs and an nvm default alias resolves to a
// modern version, prepend that version's bin; otherwise the env is returned
// untouched, same object.
export function runnerEnv(
  env: NodeJS.ProcessEnv,
  nodeMajorOnPath: number,
  exists: (p: string) => boolean = defaultExists,
  readLink: (p: string) => string | null = defaultReadFile,
  listDir: (p: string) => string[] = defaultListDir,
): NodeJS.ProcessEnv {
  if (nodeMajorOnPath >= MODERN_NODE_MAJOR) return env;
  const home = env['HOME'];
  const nvmDir = env['NVM_DIR'] ?? (home === undefined || home === '' ? null : join(home, '.nvm'));
  if (nvmDir === null || nvmDir === '') return env;
  const alias = join(nvmDir, 'alias', 'default');
  if (!exists(alias)) return env;
  const wanted = (readLink(alias) ?? '').trim();
  if (wanted === '') return env;
  // The alias names a prefix ("22"), not a directory ("v22.11.0"), so the
  // versions dir is scanned rather than joined. Last match wins, as `ls | tail -1`
  // did: the highest patch of that prefix sorts last.
  const versionsDir = join(nvmDir, 'versions', 'node');
  let bin: string | null = null;
  for (const name of listDir(versionsDir).sort()) {
    if (!name.startsWith(`v${wanted}`)) continue;
    if (majorOf(name) < MODERN_NODE_MAJOR) continue;
    const candidate = join(versionsDir, name, 'bin');
    if (exists(join(candidate, 'node'))) bin = candidate;
  }
  if (bin === null) return env;
  const current = env['PATH'] ?? '';
  return { ...env, PATH: current === '' ? bin : `${bin}${delimiter}${current}` };
}

// jq's `.<field>[$name] // empty` reads an absent, null or false entry as
// absent; anything else counts as declared.
function declared(doc: unknown, field: string, name: string): boolean {
  if (!isRecord(doc)) return false;
  const table = doc[field];
  if (!isRecord(table)) return false;
  const value = table[name];
  return value !== undefined && value !== null && value !== false;
}

// `error.code` is not on the Error type, and narrowing beats asserting: a spawn
// error that carries no code reads as "no code", never as a timeout.
function errorCodeOf(error: Error | undefined): string | null {
  const candidate: unknown = error;
  if (!isRecord(candidate)) return null;
  const code = candidate['code'];
  return typeof code === 'string' ? code : null;
}

function readName(text: string | null): string | null {
  const doc = parseJson(text);
  if (!isRecord(doc)) return null;
  const name = doc['name'];
  return typeof name === 'string' && name !== '' ? name : null;
}

function parseJson(text: string | null | undefined): unknown {
  if (text === null || text === undefined || text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

// `$RUN`/`$EXEC` are unquoted in the bash, so the shell word-splits them; the
// same split turns them into an argv here, without a shell.
function words(command: string): string[] {
  return command.split(' ').filter((part) => part !== '');
}

function majorOf(versionDir: string): number {
  const parsed = Number.parseInt(versionDir.replace(/^v/, ''), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function defaultExists(p: string): boolean {
  return existsSync(p);
}

function defaultReadFile(p: string): string | null {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function defaultListDir(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}
