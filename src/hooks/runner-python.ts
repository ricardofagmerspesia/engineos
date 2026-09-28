// The Python arm of the runner ladder (design §A1, decisions D2/D3): which
// environment runs a Python package's checks, how each verification target
// becomes argv through it, and which of the three tools the package declares
// without an exact pin.
//
// Facts only, like ./runner.ts. This module never judges a non-zero run — that
// is ./classify-failure.ts — and never installs anything: D2 makes the pins the
// project's job, so the gate READS them and reports drift, it does not repair
// it. Every I/O is an injected trailing parameter with a real default, so a unit
// test drives the whole arm with no filesystem, no child process and no Python
// on the machine; the machines this suite runs on carry none.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import type { PackageStack, ProjectConfig } from '../registry/project-config';
import type { RunResult, SpawnSyncLike } from './runner';

export type PythonEnvMode = 'venv' | 'uv' | 'compose';
export type PythonTool = 'ruff' | 'pyright' | 'pytest';
export type PythonTarget = 'lint' | 'typecheck' | 'test';

export interface PythonEnvironment {
  mode: PythonEnvMode;
  pkgDir: string;
  // How a tool name becomes an argv prefix:
  //   venv:    [join(venvBin, tool)]
  //   uv:      ['uv', 'run', '--directory', pkgDir, tool]
  //   compose: ['docker', 'compose', 'exec', '-T', service, tool]
  command: (tool: PythonTool) => readonly string[];
  // Human-readable origin for messages: ".venv/bin", "uv (uv.lock)", "compose:backend".
  source: string;
  // The argv (without `--version`) that answers whether the environment itself
  // is usable: the venv's python, `uv`, or the compose service's python. The
  // Stop gate probes a runner once per distinct selection before it runs
  // anything (design deviation: "a machine without the runner must not read as
  // red"), and nothing else on this shape names the launcher a probe would
  // address — `command` names a tool, and a missing tool is a different infra
  // finding than a missing environment.
  probe: readonly string[];
  // The environment a tool is spawned with. A venv is not "activated" by
  // calling its binaries by path: pyright and pytest resolve imports through
  // whatever `python` PATH answers, so `.venv/bin/pyright` run under a bare
  // PATH reported every third-party import unresolved against the system
  // interpreter (found at the wave-1 barrier against a real venv, invisible to
  // a faked spawn). The venv arm prepends its bin dir and sets VIRTUAL_ENV, the
  // way `activate` does; uv and compose own their interpreters already.
  spawnEnv: (base: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
}

export const PYTHON_TOOLS: readonly PythonTool[] = ['ruff', 'pyright', 'pytest'];

// The commands a target runs, in order; the first non-zero stops the target.
export const PYTHON_TARGETS: Record<PythonTarget, readonly (readonly [PythonTool, ...string[]])[]> = {
  lint: [['ruff', 'check', '.'], ['ruff', 'format', '--check', '.']],
  typecheck: [['pyright']],
  test: [['pytest', '-q']],
};

// The tool whose presence decides whether a target exists at all — the first
// command's tool, restated so the probe never has to index into PYTHON_TARGETS.
const TARGET_TOOL: Record<PythonTarget, PythonTool> = { lint: 'ruff', typecheck: 'pyright', test: 'pytest' };

// bash probed a binary's `--version` with no budget at all. A hook that hangs on
// a wedged package manager (or a `uv` resolving a lock over the network) is
// worse than one that reports the probe failed, so every probe gets the same
// kind of wall clock every run has. Defined here rather than in
// ./verify-targets.ts because that module imports ./runner.ts, which imports
// this one: a value import back the other way would close a cycle. It re-exports
// this constant so its own callers keep one name.
export const PROBE_TIMEOUT_SECONDS = 15;

const VENV_DIR = '.venv';
const UV_LOCK = 'uv.lock';
const PYPROJECT = 'pyproject.toml';

// `spawnSync` is an overload set whose first signature returns Buffers, so it is
// not assignable to the string-returning slice below; binding the utf8 overload
// here is what makes the real call satisfy `SpawnSyncLike`.
const defaultSpawn: SpawnSyncLike = (command, args, options) => spawnSync(command, args, options);

export function isPythonTarget(target: string): target is PythonTarget {
  return target === 'lint' || target === 'typecheck' || target === 'test';
}

export function isPythonTool(name: string): name is PythonTool {
  return PYTHON_TOOLS.some((tool) => tool === name);
}

// A venv lays its executables out per platform: `bin/ruff` on POSIX,
// `Scripts\ruff.exe` on Windows. Both are answered from `platform` so a test can
// state the Windows shape on a Mac, and so the only place the two spellings live
// is here.
export function venvBinDir(venvDir: string, platform: NodeJS.Platform = process.platform): string {
  return join(venvDir, platform === 'win32' ? 'Scripts' : 'bin');
}

export function executableName(tool: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? `${tool}.exe` : tool;
}

// Resolved once per package dir and cached for the process — but only when the
// I/O is the real one. A test's injected `exists`/`spawn` describes a world of
// its own, and a memo across those worlds would let one case's venv answer for
// the next case's uv.
const resolved = new Map<string, PythonEnvironment | null>();

// Resolution order (design §A1 / D3). First hit wins.
//   1. <pkgDir>/.venv/bin/     2. <root>/.venv/bin/
//   3. uv.lock in pkgDir or root AND `uv` on PATH  -> uv
//   4. config.packages[dir==pkgDir].compose_service -> compose
//   5. null
// A `python_env` pin in the config (contracts §2) narrows the cascade to that
// one mode: a developer who declared `compose` does not want a stale local
// `.venv` picked up ahead of the container — the demo repo's `uv.lock` being
// stale is exactly the "a lockfile is a hint, not the truth" case D3 records.
export function resolvePythonEnvironment(
  pkgDir: string,
  root: string,
  config: ProjectConfig | null,
  exists: (p: string) => boolean = defaultExists,
  spawn: SpawnSyncLike = defaultSpawn,
  platform: NodeJS.Platform = process.platform,
): PythonEnvironment | null {
  const memo = exists === defaultExists && spawn === defaultSpawn;
  const key = `${resolve(pkgDir)}\0${resolve(root)}\0${platform}`;
  if (memo) {
    const hit = resolved.get(key);
    if (hit !== undefined) return hit;
  }
  const env = resolveUncached(pkgDir, root, config, exists, spawn, platform);
  if (memo) resolved.set(key, env);
  return env;
}

function resolveUncached(
  pkgDir: string,
  root: string,
  config: ProjectConfig | null,
  exists: (p: string) => boolean,
  spawn: SpawnSyncLike,
  platform: NodeJS.Platform,
): PythonEnvironment | null {
  const declared = packageStackFor(config, pkgDir, root);
  const pin = declared?.python_env ?? 'auto';
  if (pin === 'auto' || pin === 'venv') {
    // The root venv is probed only when it is a different directory: a root
    // package would otherwise be asked the same question twice.
    const venvDirs = resolve(pkgDir) === resolve(root) ? [join(pkgDir, VENV_DIR)] : [join(pkgDir, VENV_DIR), join(root, VENV_DIR)];
    for (const venvDir of venvDirs) {
      const bin = venvBinDir(venvDir, platform);
      if (exists(bin)) return venvEnvironment(pkgDir, bin, platform);
    }
  }
  if (pin === 'auto' || pin === 'uv') {
    const locked = exists(join(pkgDir, UV_LOCK)) || exists(join(root, UV_LOCK));
    if (locked && probeAnswers(spawn, ['uv'], pkgDir)) return uvEnvironment(pkgDir);
  }
  if (pin === 'auto' || pin === 'compose') {
    const service = declared?.compose_service ?? null;
    if (service !== null && service !== '') return composeEnvironment(pkgDir, service);
  }
  return null;
}

// The config row for this package, matched on the loader's normalized spelling
// of `dir` ("." for the root, no leading "./"). A row declared `node` for the
// same directory says nothing about the Python side, so only python rows count.
function packageStackFor(config: ProjectConfig | null, pkgDir: string, root: string): PackageStack | null {
  if (config === null) return null;
  const dir = relativeDir(root, pkgDir);
  return config.stack.packages.find((row) => row.dir === dir && row.language === 'python') ?? null;
}

// `relative` speaks the platform separator; the config speaks `/`, on every platform.
function relativeDir(root: string, dir: string): string {
  const rel = relative(resolve(root), resolve(dir));
  return rel === '' ? '.' : rel.split(sep).join('/');
}

function venvEnvironment(pkgDir: string, bin: string, platform: NodeJS.Platform): PythonEnvironment {
  return {
    mode: 'venv',
    pkgDir,
    command: (tool) => [join(bin, executableName(tool, platform))],
    // ".venv/bin" for the package's own venv, "../.venv/bin" for the root's —
    // the message reader learns which one answered without a machine path.
    source: relative(pkgDir, bin).split(sep).join('/'),
    probe: [join(bin, executableName('python', platform))],
    spawnEnv: (base) => activated(base, bin),
  };
}

// What `source .venv/bin/activate` exports, and nothing else: PATH with the bin
// dir first and VIRTUAL_ENV naming the venv root. PYTHONHOME is unset the way
// activate unsets it, since a stray value would point the interpreter away from
// the venv it is meant to run in.
export function activated(base: NodeJS.ProcessEnv, bin: string): NodeJS.ProcessEnv {
  const path = base['PATH'] ?? '';
  const env: NodeJS.ProcessEnv = { ...base, VIRTUAL_ENV: dirname(bin), PATH: path === '' ? bin : `${bin}${delimiter}${path}` };
  delete env['PYTHONHOME'];
  return env;
}

function uvEnvironment(pkgDir: string): PythonEnvironment {
  return {
    mode: 'uv',
    pkgDir,
    command: (tool) => ['uv', 'run', '--directory', pkgDir, tool],
    spawnEnv: (base) => base,
    source: 'uv (uv.lock)',
    probe: ['uv'],
  };
}

// `-T` because a hook has no TTY to allocate, and `docker compose` finds its
// file by walking up from the cwd, which is why the run cwd stays the package.
function composeEnvironment(pkgDir: string, service: string): PythonEnvironment {
  return {
    mode: 'compose',
    pkgDir,
    command: (tool) => ['docker', 'compose', 'exec', '-T', service, tool],
    source: `compose:${service}`,
    probe: ['docker', 'compose', 'exec', '-T', service, 'python'],
    spawnEnv: (base) => base,
  };
}

// A target "exists" when its tool is configured in pyproject.toml ([tool.ruff],
// [tool.pyright], [tool.pytest.ini_options] / pytest.ini / conftest.py) OR the
// tool answers `--version` through the environment. Configuration is read first
// because it needs no process: a package that configured ruff wants ruff run,
// and a venv missing it is then a runner-missing finding at run time (the
// classifier's python row), not a silently absent target.
export function pythonHasTarget(
  env: PythonEnvironment,
  target: PythonTarget,
  readFile: (p: string) => string | null = defaultReadFile,
  spawn: SpawnSyncLike = defaultSpawn,
): boolean {
  if (configuredIn(env.pkgDir, target, readFile)) return true;
  return probeAnswers(spawn, env.command(TARGET_TOOL[target]), env.pkgDir);
}

function configuredIn(pkgDir: string, target: PythonTarget, readFile: (p: string) => string | null): boolean {
  const doc = readToml(readFile(join(pkgDir, PYPROJECT)) ?? '');
  switch (target) {
    case 'lint':
      return configures(doc, 'tool.ruff');
    case 'typecheck':
      return configures(doc, 'tool.pyright');
    case 'test':
      return (
        configures(doc, 'tool.pytest.ini_options') ||
        readFile(join(pkgDir, 'pytest.ini')) !== null ||
        readFile(join(pkgDir, 'conftest.py')) !== null
      );
  }
}

// Runs PYTHON_TARGETS[target] in sequence under ONE shared budget: the second
// command gets whatever the first left, so `lint` as a whole honours the
// caller's number the way a single npm script would. Output is every command's
// argv on its own line followed by what it printed, so a failure summary reads
// which of the two ruff invocations went red. `code` is the first non-zero;
// `timedOut` when any command was killed by the budget, or when the budget was
// already spent before a later command could start.
export function pythonRun(
  env: PythonEnvironment,
  target: PythonTarget,
  timeoutSeconds: number,
  processEnv: NodeJS.ProcessEnv,
  spawn: SpawnSyncLike = defaultSpawn,
  now: () => number = Date.now,
): RunResult {
  let remaining = timeoutSeconds;
  let output = '';
  for (const [tool, ...args] of PYTHON_TARGETS[target]) {
    const argv = [...env.command(tool), ...args];
    output += `${argv.join(' ')}\n`;
    if (remaining <= 0) return { code: 124, output, timedOut: true };
    const started = now();
    const result = spawn(argv[0] ?? '', argv.slice(1), {
      cwd: env.pkgDir,
      env: env.spawnEnv(processEnv),
      encoding: 'utf8',
      timeout: Math.ceil(remaining * 1000),
    });
    remaining -= (now() - started) / 1000;
    output += endedLine(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    // A tool the environment does not hold never starts: spawnSync answers
    // ENOENT with no status and NO output, which the classifier would read as a
    // red run that said nothing — a block no code edit can clear. The OS error's
    // own text is written in its place, naming the path, so the python row of
    // classify-failure.ts reads it as the missing runner it is.
    if (errorCodeOf(result.error) === 'ENOENT') output += `No such file or directory: ${argv[0] ?? ''}\n`;
    // spawnSync reports its own timeout twice: an ETIMEDOUT error and the
    // SIGTERM it sent. Either is enough, and neither can be confused with an
    // exit code the tool chose.
    if (errorCodeOf(result.error) === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
      return { code: 124, output, timedOut: true };
    }
    if (result.status !== 0) {
      // A killed process has no exit status; 1 stands for "failed without saying how".
      return { code: typeof result.status === 'number' ? result.status : 1, output, timedOut: false };
    }
  }
  return { code: 0, output, timedOut: false };
}

// Advisory only (D2): the tools this package declares without an exact pin, in
// PYTHON_TOOLS order so the one-line message is stable. Both dev-dependency
// shapes are read — `[project.optional-dependencies] dev = [...]` (PEP 621) and
// `[dependency-groups] dev = [...]` (PEP 735, what `uv add --dev` writes). A
// tool the package does not declare at all is not reported: the advisory is
// about drift from a pin the project chose, not about what a global PATH holds.
export function unpinnedTools(pkgDir: string, readFile: (p: string) => string | null = defaultReadFile): PythonTool[] {
  const doc = readToml(readFile(join(pkgDir, PYPROJECT)) ?? '');
  const specs = [
    ...(doc.strings.get('project.optional-dependencies.dev') ?? []),
    ...(doc.strings.get('dependency-groups.dev') ?? []),
  ];
  const unpinned = new Set<PythonTool>();
  for (const spec of specs) {
    const requirement = parseRequirement(spec);
    if (requirement === null || !isPythonTool(requirement.name)) continue;
    if (!EXACT_PIN.test(requirement.specifier)) unpinned.add(requirement.name);
  }
  return PYTHON_TOOLS.filter((tool) => unpinned.has(tool));
}

// `==X.Y.Z` and nothing else: `>=`, `~=`, `==0.13.*` and a bare name all leave
// the version to the resolver, which is the drift D2 forbids.
const EXACT_PIN = /^==\s*\d+(?:\.\d+)*$/;

// The PEP 508 head: name, optional extras, then the specifier up to any
// environment marker. Names compare case-insensitively with `-`, `_` and `.`
// interchangeable (PEP 503), so `Ruff` and `py_test` normalize before the tool
// lookup — a spelling difference must not hide an unpinned tool.
function parseRequirement(spec: string): { name: PythonTool | string; specifier: string } | null {
  const head = /^\s*([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)\s*(?:\[[^\]]*\])?\s*([^;]*?)\s*(?:;.*)?$/.exec(spec);
  if (head === null) return null;
  const name = (head[1] ?? '').toLowerCase().replace(/[._]/g, '-');
  return { name, specifier: head[2] ?? '' };
}

// ------------------------------------------------------------------ pyproject reader

// A tolerant, line-based reader for the slices of pyproject.toml the gate needs:
// which tables and keys exist, and the quoted strings under a key. No TOML
// library is a dependency of this runtime, and the full grammar is not needed
// to answer "is [tool.ruff] configured" and "what is in dev = [...]". It reads
// table headers, dotted keys, single- and multi-line arrays, and strips
// comments; it does not read inline tables or multi-line strings, and a file
// using those for the dev list simply yields no strings — an unread pin is an
// advisory not given, never a gate that blocks.
interface TomlDocument {
  // Every table header and every full dotted key, so `[tool.ruff]`,
  // `[tool.ruff.lint]` and `[tool] ruff.line-length = 120` all answer that ruff
  // is configured.
  entries: Set<string>;
  // The quoted strings that make up each key's value.
  strings: Map<string, string[]>;
}

function readToml(text: string): TomlDocument {
  const entries = new Set<string>();
  const strings = new Map<string, string[]>();
  let table = '';
  let pending: { key: string; value: string } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (pending !== null) {
      pending.value += ` ${line}`;
      if (balanced(pending.value)) {
        strings.set(pending.key, quotedStrings(pending.value));
        pending = null;
      }
      continue;
    }
    if (line === '') continue;
    const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
    if (header !== null) {
      table = dottedKey(header[1] ?? '');
      entries.add(table);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = dottedKey(line.slice(0, eq));
    const full = table === '' ? key : `${table}.${key}`;
    entries.add(full);
    const value = line.slice(eq + 1).trim();
    if (balanced(value)) strings.set(full, quotedStrings(value));
    else pending = { key: full, value };
  }
  return { entries, strings };
}

function configures(doc: TomlDocument, name: string): boolean {
  for (const entry of doc.entries) {
    if (entry === name || entry.startsWith(`${name}.`)) return true;
  }
  return false;
}

// `"tool" . "ruff"` and `tool.ruff` name the same table.
function dottedKey(text: string): string {
  return text
    .split('.')
    .map((part) => part.trim().replace(/^["']|["']$/g, ''))
    .join('.');
}

// A `#` inside a quoted string is not a comment: `select = ["E", "#"]` is rare
// but a specifier like `ruff==0.13.0 # pinned` is not, and the two must not be
// told apart by luck.
function stripComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote !== null) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#') return line.slice(0, i);
  }
  return line;
}

// An array or inline table closes when its brackets balance outside quotes.
function balanced(value: string): boolean {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote !== null) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') depth -= 1;
  }
  return depth <= 0;
}

function quotedStrings(value: string): string[] {
  const out: string[] = [];
  for (const match of value.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)) {
    out.push(match[1] ?? match[2] ?? '');
  }
  return out;
}

// ------------------------------------------------------------------ internals

function probeAnswers(spawn: SpawnSyncLike, launcher: readonly string[], cwd: string): boolean {
  const argv = [...launcher, '--version'];
  const result = spawn(argv[0] ?? '', argv.slice(1), { cwd, encoding: 'utf8', timeout: PROBE_TIMEOUT_SECONDS * 1000 });
  return result.status === 0;
}

// Every command's output ends on its own line so the next argv line is never
// glued to a tool's last unterminated line.
function endedLine(text: string): string {
  return text === '' || text.endsWith('\n') ? text : `${text}\n`;
}

// `error.code` is not on the Error type, and narrowing beats asserting: a spawn
// error that carries no code reads as "no code", never as a timeout.
function errorCodeOf(error: Error | undefined): string | null {
  if (error === undefined) return null;
  const candidate: unknown = error;
  if (typeof candidate !== 'object' || candidate === null) return null;
  const code = Reflect.get(candidate, 'code');
  return typeof code === 'string' ? code : null;
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
