import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { memoryIo } from '../io';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { envelope, relocatedRoot, tempRoot } from '../testing/harness';
import { readEnvelope, type HookEnvelope } from './envelope';
import { silent, type HookContext } from './output';
import type { SpawnSyncLike } from './runner';
import { venvBinDir } from './runner-python';
import { run, verify } from './post-edit-check';

const checkout = resolveRoot({}, __dirname);

const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

interface Call {
  command: string;
  args: readonly string[];
  cwd: string;
  timeout: number | undefined;
}

interface Outcome {
  status?: number | null;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  error?: Error;
}

type Responder = (command: string, args: readonly string[]) => Outcome;

const GREEN: Responder = () => ({});

function spawnWith(respond: Responder): { spawn: SpawnSyncLike; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: SpawnSyncLike = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, timeout: options.timeout });
    const outcome = respond(command, args);
    return {
      status: outcome.status === undefined ? 0 : outcome.status,
      signal: outcome.signal ?? null,
      stdout: outcome.stdout ?? '',
      stderr: '',
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    };
  };
  return { spawn, calls };
}

function timedOutError(): Error {
  const error = new Error('spawnSync npm ETIMEDOUT');
  Object.assign(error, { code: 'ETIMEDOUT' });
  return error;
}

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

function skipWithoutGit(t: { skip: (reason: string) => void }): boolean {
  if (hasGit()) return false;
  t.skip('git is not installed');
  return true;
}

function context(env: NodeJS.ProcessEnv = ISOLATED): HookContext {
  return { io: memoryIo({ env }), root: checkout, now: () => 1000, spawn: spawnSync };
}

function editOf(cwd: string, file: string): HookEnvelope {
  const decoded = readEnvelope(memoryIo({ stdin: envelope({ event: 'PostToolUse', cwd, sid: 'S1', tool: { name: 'Edit', input: { file_path: file } } }) }));
  assert.notEqual(decoded, null);
  if (decoded === null) throw new Error('unreachable');
  return decoded;
}

// A package directory with the given files, plus src/x.ts as the edited file.
// Deliberately NOT a git repo: this hook derives its own workspace root from
// nx.json / pnpm-workspace.yaml / .git and must work without one.
function pkg(t: Parameters<typeof tempRoot>[0], files: Record<string, string> = { 'package.json': '{}' }): { dir: string; file: string } {
  const dir = tempRoot(t);
  for (const [name, contents] of Object.entries(files)) {
    const target = join(dir, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  mkdirSync(join(dir, 'src'), { recursive: true });
  const file = join(dir, 'src', 'x.ts');
  writeFileSync(file, 'export const x = 1;\n');
  return { dir, file };
}

function scripts(table: Record<string, string>): string {
  return JSON.stringify({ name: 'fixture', scripts: table });
}

// ------------------------------------------------------------------ silence

test('a non-JS edit is not this hook business', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir } = pkg(t, { 'package.json': scripts({ typecheck: 'exit 1' }) });
  const notes = join(dir, 'notes.md');
  writeFileSync(notes, '# notes\n');
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(editOf(dir, notes), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

test('an envelope with no file path checks nothing', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir } = pkg(t, { 'package.json': scripts({ typecheck: 'exit 1' }) });
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(editOf(dir, ''), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

test('a path that is not a file on disk checks nothing', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir } = pkg(t, { 'package.json': scripts({ typecheck: 'exit 1' }) });
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(editOf(dir, join(dir, 'src', 'ghost.ts')), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

test('a file that belongs to no package checks nothing', (t) => {
  if (skipWithoutGit(t)) return;
  const dir = tempRoot(t);
  mkdirSync(join(dir, 'src'), { recursive: true });
  const file = join(dir, 'src', 'x.ts');
  writeFileSync(file, 'export const x = 1;\n');
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(editOf(dir, file), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

// Consent is given per working tree, and the tree is the session cwd. An
// unbounded ascent ran the scripts of whatever package.json it met above it,
// with no tool-permission prompt in front of them.
test('a package.json above the session cwd is never run', (t) => {
  if (skipWithoutGit(t)) return;
  const outer = tempRoot(t);
  writeFileSync(join(outer, 'package.json'), scripts({ typecheck: 'exit 1' }));
  const cwd = join(outer, 'app');
  mkdirSync(join(cwd, 'src'), { recursive: true });
  const file = join(cwd, 'src', 'x.ts');
  writeFileSync(file, 'export const x = 1;\n');
  const { spawn, calls } = spawnWith(() => ({ status: 1 }));
  assert.deepEqual(verify(editOf(cwd, file), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

test('an edit inside a dependency under node_modules never runs its scripts', (t) => {
  if (skipWithoutGit(t)) return;
  const cwd = tempRoot(t);
  writeFileSync(join(cwd, 'package.json'), '{}\n');
  const dependency = join(cwd, 'node_modules', 'evil');
  mkdirSync(join(dependency, 'src'), { recursive: true });
  writeFileSync(join(dependency, 'package.json'), scripts({ typecheck: 'exit 1' }));
  const file = join(dependency, 'src', 'x.ts');
  writeFileSync(file, 'export const x = 1;\n');
  const { spawn, calls } = spawnWith(() => ({ status: 1 }));
  assert.deepEqual(verify(editOf(cwd, file), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

test('an envelope with no cwd bounds nothing and runs nothing', (t) => {
  if (skipWithoutGit(t)) return;
  const { file } = pkg(t, { 'package.json': scripts({ typecheck: 'exit 1' }) });
  const { spawn, calls } = spawnWith(() => ({ status: 1 }));
  assert.deepEqual(verify(editOf('', file), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

test('a package in a sibling checkout is never run', (t) => {
  if (skipWithoutGit(t)) return;
  const outer = tempRoot(t);
  const cwd = join(outer, 'here');
  mkdirSync(cwd, { recursive: true });
  const sibling = join(outer, 'there');
  mkdirSync(join(sibling, 'src'), { recursive: true });
  writeFileSync(join(sibling, 'package.json'), scripts({ typecheck: 'exit 1' }));
  const file = join(sibling, 'src', 'x.ts');
  writeFileSync(file, 'export const x = 1;\n');
  const { spawn, calls } = spawnWith(() => ({ status: 1 }));
  assert.deepEqual(verify(editOf(cwd, file), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

test('bypass silences the per-edit check', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, { 'package.json': scripts({ typecheck: 'exit 1' }) });
  const { spawn, calls } = spawnWith(() => ({ status: 1 }));
  assert.deepEqual(verify(editOf(dir, file), context({ ...ISOLATED, ENGINEOS_BYPASS: '1' }), spawn), silent);
  assert.deepEqual(calls, []);
});

// ------------------------------------------------------------------ typecheck

test('a red typecheck fails the edit with the package named', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, { 'package.json': scripts({ typecheck: 'tsc --noEmit' }) });
  const { spawn, calls } = spawnWith(() => ({ status: 2, stdout: 'src/x.ts(1,7): error TS2345\n' }));
  const decision = verify(editOf(dir, file), context(), spawn);
  assert.equal(decision.kind, 'fail');
  if (decision.kind !== 'fail') return;
  assert.equal(decision.stderr.includes(`--- typecheck failed (${dir}) ---`), true);
  assert.equal(decision.stderr.includes('error TS2345'), true);
  assert.deepEqual(calls.map((call) => [call.command, call.args.join(' '), call.cwd, call.timeout]), [
    ['npm', 'run -s typecheck', dir, 90_000],
  ]);
});

test('a green typecheck says nothing', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, { 'package.json': scripts({ typecheck: 'tsc --noEmit' }) });
  const { spawn } = spawnWith(GREEN);
  assert.deepEqual(verify(editOf(dir, file), context(), spawn), silent);
});

test('a package that declares no typecheck target is never run', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, { 'package.json': scripts({ build: 'tsc' }) });
  const { spawn, calls } = spawnWith(() => ({ status: 1 }));
  assert.deepEqual(verify(editOf(dir, file), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

test('a typecheck killed by its budget is infra, never exit 2', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, { 'package.json': scripts({ typecheck: 'tsc --noEmit' }) });
  const { spawn } = spawnWith(() => ({ status: null, error: timedOutError() }));
  assert.deepEqual(verify(editOf(dir, file), context(), spawn), silent);
});

test('a stale target probe is infra, never exit 2', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, { 'package.json': scripts({ typecheck: 'tsc --noEmit' }) });
  const { spawn } = spawnWith(() => ({ status: 1, stdout: 'npm ERR! Missing script: "typecheck"' }));
  assert.deepEqual(verify(editOf(dir, file), context(), spawn), silent);
});

// The infra patterns are policy of the EngineOS checkout the hook runs from
// (ctx.root), not of the process's own registry: a relocated root whose
// npm-family row speaks a different phrase decides the verdict on its own.
function withNpmInfraPattern(pattern: string): (policy: Record<string, unknown>) => void {
  return (policy) => {
    const repair = policy['repair'];
    if (!isRecord(repair) || !Array.isArray(repair['infra_patterns'])) throw new Error('policy.json has no repair.infra_patterns');
    repair['infra_patterns'] = repair['infra_patterns'].map((row: unknown) => (isRecord(row) && row['runner'] === 'npm-family' ? { ...row, pattern } : row));
  };
}

function contextAt(root: string): HookContext {
  return { io: memoryIo({ env: ISOLATED }), root, now: () => 1000, spawn: spawnSync };
}

test('the infra patterns come from the checkout in ctx.root', (t) => {
  if (skipWithoutGit(t)) return;
  const root = relocatedRoot(tempRoot(t), { mutate: withNpmInfraPattern('relocated registry says gone') });
  const { dir, file } = pkg(t, { 'package.json': scripts({ typecheck: 'tsc --noEmit' }) });
  const relocatedPhrase = spawnWith(() => ({ status: 1, stdout: 'relocated registry says gone' }));
  assert.deepEqual(verify(editOf(dir, file), contextAt(root), relocatedPhrase.spawn), silent);
  // The phrase only the real checkout's row knows is a genuine red here.
  const defaultPhrase = spawnWith(() => ({ status: 1, stdout: 'npm ERR! Missing script: "typecheck"' }));
  assert.equal(verify(editOf(dir, file), contextAt(root), defaultPhrase.spawn).kind, 'fail');
});

test('the nx arm addresses the project by name and asks whether the target exists', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, {
    'package.json': JSON.stringify({ name: '@scope/api' }),
    'nx.json': '{}',
  });
  const { spawn, calls } = spawnWith((_command, args) =>
    args.includes('show') ? { stdout: JSON.stringify({ targets: { typecheck: {} } }) } : { status: 1, stdout: 'TS1005' },
  );
  const decision = verify(editOf(dir, file), context(), spawn);
  assert.equal(decision.kind, 'fail');
  assert.deepEqual(calls.map((call) => call.args.join(' ')), [
    '--no-install nx show project api --json',
    '--no-install nx run api:typecheck',
  ]);
});

// ------------------------------------------------------------------ lint

test('a lint config with no linter installed is a tooling gap, not a defect', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, { 'package.json': '{}', '.eslintrc.js': 'module.exports = {};\n' });
  // The probe fails the way an absent binary does; nothing else may run.
  const { spawn, calls } = spawnWith(() => ({ status: 1 }));
  assert.deepEqual(verify(editOf(dir, file), context(), spawn), silent);
  assert.deepEqual(calls.map((call) => call.args.join(' ')), ['--no-install eslint --version']);
});

test('a red lint fails the edit with the file named', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, { 'package.json': '{}', '.eslintrc.js': 'module.exports = {};\n' });
  const { spawn, calls } = spawnWith((_command, args) =>
    args.includes('--version') ? {} : { status: 1, stdout: `${file}\n  1:7  error  no-unused-vars\n` },
  );
  const decision = verify(editOf(dir, file), context(), spawn);
  assert.equal(decision.kind, 'fail');
  if (decision.kind !== 'fail') return;
  assert.equal(decision.stderr.includes(`--- eslint failed (${file}) ---`), true);
  assert.equal(decision.stderr.includes('no-unused-vars'), true);
  assert.deepEqual(calls.map((call) => [call.args.join(' '), call.timeout]), [
    ['--no-install eslint --version', 15_000],
    [`--no-install eslint ${file}`, 45_000],
  ]);
});

test('biome wins where both linters are configured, and checks the one file', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, {
    'package.json': '{}',
    'biome.json': '{}',
    '.eslintrc.js': 'module.exports = {};\n',
  });
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(editOf(dir, file), context(), spawn), silent);
  assert.deepEqual(calls.map((call) => call.args.join(' ')), [
    '--no-install biome --version',
    `--no-install biome check ${file}`,
  ]);
});

test('typecheck and lint failures are reported together', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pkg(t, {
    'package.json': scripts({ typecheck: 'tsc --noEmit' }),
    'biome.json': '{}',
  });
  const { spawn } = spawnWith((_command, args) => (args.includes('--version') ? {} : { status: 1, stdout: 'nope' }));
  const decision = verify(editOf(dir, file), context(), spawn);
  assert.equal(decision.kind, 'fail');
  if (decision.kind !== 'fail') return;
  assert.equal(decision.stderr.includes('--- typecheck failed'), true);
  assert.equal(decision.stderr.includes('--- biome failed'), true);
});

// ------------------------------------------------------------------ python

// A Python package with a venv, plus app/main.py as the edited file.
function pythonPkg(t: Parameters<typeof tempRoot>[0], pyproject: string, opts: { venv?: boolean } = { venv: true }): { dir: string; file: string; bin: string } {
  const dir = tempRoot(t);
  writeFileSync(join(dir, 'pyproject.toml'), pyproject);
  const bin = venvBinDir(join(dir, '.venv'));
  if (opts.venv !== false) mkdirSync(bin, { recursive: true });
  mkdirSync(join(dir, 'app'), { recursive: true });
  const file = join(dir, 'app', 'main.py');
  writeFileSync(file, 'x = 1\n');
  return { dir, file, bin };
}

test('a python edit runs pyright and ruff through the package venv and fails on red', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file, bin } = pythonPkg(t, '[tool.ruff]\n[tool.pyright]\n');
  const { spawn, calls } = spawnWith((command) => (command.endsWith('pyright') ? { status: 1, stdout: 'app/main.py:1:1 - error: nope\n' } : {}));
  const decision = verify(editOf(dir, file), context(), spawn);
  assert.equal(decision.kind, 'fail');
  if (decision.kind !== 'fail') return;
  assert.equal(decision.stderr.includes(`--- typecheck failed (${dir}) ---`), true);
  assert.equal(decision.stderr.includes('error: nope'), true);
  assert.deepEqual(calls.map((call) => [[call.command, ...call.args].join(' '), call.cwd, call.timeout]), [
    [`${join(bin, 'pyright')}`, dir, 90_000],
    [`${join(bin, 'ruff')} check .`, dir, 45_000],
    [`${join(bin, 'ruff')} format --check .`, dir, 45_000],
  ]);
});

test('a python edit in a package with no environment is silent here', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file } = pythonPkg(t, '[tool.ruff]\n', { venv: false });
  const { spawn, calls } = spawnWith(() => ({ status: 1 }));
  assert.deepEqual(verify(editOf(dir, file), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

test('a python edit in a Node package is not linted by eslint', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir } = pkg(t, { 'package.json': scripts({ typecheck: 'exit 1' }), '.eslintrc.js': 'module.exports = {};\n' });
  const file = join(dir, 'src', 'tool.py');
  writeFileSync(file, 'x = 1\n');
  const { spawn, calls } = spawnWith(() => ({ status: 1 }));
  assert.deepEqual(verify(editOf(dir, file), context(), spawn), silent);
  assert.deepEqual(calls, []);
});

test('a .ts edit in a directory that is also a Python package still takes the Node arm', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir, file, bin } = pythonPkg(t, '[tool.pyright]\n');
  writeFileSync(join(dir, 'package.json'), scripts({ typecheck: 'tsc --noEmit' }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  const ts = join(dir, 'src', 'x.ts');
  writeFileSync(ts, 'export const x = 1;\n');
  const { spawn, calls } = spawnWith(GREEN);
  assert.deepEqual(verify(editOf(dir, ts), context(), spawn), silent);
  assert.deepEqual(calls.map((call) => [call.command, ...call.args].join(' ')), ['npm run -s typecheck']);
  // And the .py edit in the same directory takes the Python arm: pyright is
  // configured, ruff is not, so ruff is probed before it runs.
  const python = spawnWith(GREEN);
  assert.deepEqual(verify(editOf(dir, file), context(), python.spawn), silent);
  assert.deepEqual(python.calls.map((call) => [call.command, ...call.args].join(' ')), [
    join(bin, 'pyright'),
    `${join(bin, 'ruff')} --version`,
    `${join(bin, 'ruff')} check .`,
    `${join(bin, 'ruff')} format --check .`,
  ]);
});

// ------------------------------------------------------------------ the adapter entry

test('run drives the same ladder through the context spawner', (t) => {
  if (skipWithoutGit(t)) return;
  const { dir } = pkg(t);
  // A non-JS path is the silent branch that reaches no spawner at all.
  const notes = join(dir, 'notes.md');
  writeFileSync(notes, '# notes\n');
  assert.deepEqual(run(editOf(dir, notes), context()), silent);
});
