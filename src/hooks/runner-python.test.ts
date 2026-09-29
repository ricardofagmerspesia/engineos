import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectConfig } from '../registry/project-config';
import { tempRoot } from '../testing/harness';
import type { SpawnSyncLike } from './runner';
import {
  PROBE_TIMEOUT_SECONDS,
  PYTHON_TARGETS,
  executableName,
  pythonHasTarget,
  pythonRun,
  resolvePythonEnvironment,
  unpinnedTools,
  venvBinDir,
  type PythonEnvironment,
} from './runner-python';

function existsIn(paths: readonly string[]): (p: string) => boolean {
  return (p) => paths.includes(p);
}

function readFrom(files: Record<string, string>): (p: string) => string | null {
  return (p) => files[p] ?? null;
}

interface Call {
  command: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv | undefined;
  timeout: number | undefined;
}

interface Outcome {
  status?: number | null;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

type Responder = (command: string, args: readonly string[]) => Outcome;

const GREEN: Responder = () => ({});
const ABSENT: Responder = () => ({ status: null, error: new Error('spawnSync ENOENT') });

function spawnWith(respond: Responder): { spawn: SpawnSyncLike; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: SpawnSyncLike = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env, timeout: options.timeout });
    const outcome = respond(command, args);
    return {
      status: outcome.status === undefined ? 0 : outcome.status,
      signal: outcome.signal ?? null,
      stdout: outcome.stdout ?? '',
      stderr: outcome.stderr ?? '',
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    };
  };
  return { spawn, calls };
}

function timedOutError(): Error {
  const error = new Error('spawnSync ETIMEDOUT');
  Object.assign(error, { code: 'ETIMEDOUT' });
  return error;
}

function configWith(dir: string, over: { compose_service?: string | null; python_env?: 'venv' | 'uv' | 'compose' | 'auto' } = {}): ProjectConfig {
  return {
    version: 1,
    stack: {
      packages: [
        {
          dir,
          language: 'python',
          framework: 'fastapi',
          compose_service: over.compose_service ?? null,
          ...(over.python_env === undefined ? {} : { python_env: over.python_env }),
        },
      ],
    },
  };
}

const NONE = existsIn([]);
const PKG = '/repo/backend';
const ROOT = '/repo';

function venvAt(pkgDir: string, bin: string): PythonEnvironment {
  const env = resolvePythonEnvironment(pkgDir, ROOT, null, existsIn([bin]), ABSENT_SPAWN, 'darwin');
  assert.notEqual(env, null);
  if (env === null) throw new Error('unreachable');
  return env;
}

const ABSENT_SPAWN = spawnWith(ABSENT).spawn;

// ------------------------------------------------------------------ resolution

test('the package venv wins, and its tools are addressed by path', () => {
  const env = venvAt(PKG, '/repo/backend/.venv/bin');
  assert.equal(env.mode, 'venv');
  assert.equal(env.source, '.venv/bin');
  assert.deepEqual(env.command('ruff'), ['/repo/backend/.venv/bin/ruff']);
  assert.deepEqual(env.probe, ['/repo/backend/.venv/bin/python']);
});

test('the root venv answers for a nested package when it has none of its own', () => {
  const env = venvAt(PKG, '/repo/.venv/bin');
  assert.equal(env.source, '../.venv/bin');
  assert.deepEqual(env.command('pyright'), ['/repo/.venv/bin/pyright']);
});

test('on Windows the venv lays its tools out under Scripts with an .exe suffix', () => {
  const bin = venvBinDir('/repo/.venv', 'win32');
  assert.equal(bin, join('/repo/.venv', 'Scripts'));
  assert.equal(executableName('ruff', 'win32'), 'ruff.exe');
  assert.equal(executableName('ruff', 'linux'), 'ruff');
  const env = resolvePythonEnvironment(ROOT, ROOT, null, existsIn([bin]), ABSENT_SPAWN, 'win32');
  assert.deepEqual(env?.command('pytest'), [join(bin, 'pytest.exe')]);
  assert.deepEqual(env?.probe, [join(bin, 'python.exe')]);
});

test('a uv.lock selects uv only when uv itself answers', () => {
  const { spawn, calls } = spawnWith(GREEN);
  const env = resolvePythonEnvironment(PKG, ROOT, null, existsIn(['/repo/uv.lock']), spawn, 'linux');
  assert.equal(env?.mode, 'uv');
  assert.equal(env?.source, 'uv (uv.lock)');
  assert.deepEqual(env?.command('ruff'), ['uv', 'run', '--directory', PKG, 'ruff']);
  assert.deepEqual(env?.probe, ['uv']);
  // The lockfile is a hint, not the truth (D3): uv is asked before it is trusted.
  assert.deepEqual(calls.map((c) => [c.command, c.args.join(' '), c.cwd, c.timeout]), [['uv', '--version', PKG, PROBE_TIMEOUT_SECONDS * 1000]]);
  assert.equal(resolvePythonEnvironment(PKG, ROOT, null, existsIn(['/repo/backend/uv.lock']), ABSENT_SPAWN, 'linux'), null);
});

test('uv is never probed without a lockfile', () => {
  const { spawn, calls } = spawnWith(GREEN);
  assert.equal(resolvePythonEnvironment(PKG, ROOT, null, NONE, spawn, 'linux'), null);
  assert.deepEqual(calls, []);
});

test('a declared compose service is the last resort, matched on the config dir', () => {
  const env = resolvePythonEnvironment(PKG, ROOT, configWith('backend', { compose_service: 'api' }), NONE, ABSENT_SPAWN, 'linux');
  assert.equal(env?.mode, 'compose');
  assert.equal(env?.source, 'compose:api');
  assert.deepEqual(env?.command('pytest'), ['docker', 'compose', 'exec', '-T', 'api', 'pytest']);
  assert.deepEqual(env?.probe, ['docker', 'compose', 'exec', '-T', 'api', 'python']);
  // The root package is "." in the config.
  assert.equal(resolvePythonEnvironment(ROOT, ROOT, configWith('.', { compose_service: 'api' }), NONE, ABSENT_SPAWN, 'linux')?.mode, 'compose');
  // Another package's service says nothing about this one.
  assert.equal(resolvePythonEnvironment(PKG, ROOT, configWith('frontend', { compose_service: 'api' }), NONE, ABSENT_SPAWN, 'linux'), null);
  assert.equal(resolvePythonEnvironment(PKG, ROOT, configWith('backend', { compose_service: null }), NONE, ABSENT_SPAWN, 'linux'), null);
});

test('the cascade order is venv, then uv, then compose', () => {
  const everything = existsIn(['/repo/backend/.venv/bin', '/repo/uv.lock']);
  const config = configWith('backend', { compose_service: 'api' });
  assert.equal(resolvePythonEnvironment(PKG, ROOT, config, everything, spawnWith(GREEN).spawn, 'linux')?.mode, 'venv');
  assert.equal(resolvePythonEnvironment(PKG, ROOT, config, existsIn(['/repo/uv.lock']), spawnWith(GREEN).spawn, 'linux')?.mode, 'uv');
  assert.equal(resolvePythonEnvironment(PKG, ROOT, config, NONE, spawnWith(GREEN).spawn, 'linux')?.mode, 'compose');
});

test('a python_env pin narrows the cascade to the one mode it names', () => {
  const everything = existsIn(['/repo/backend/.venv/bin', '/repo/uv.lock']);
  const { spawn, calls } = spawnWith(GREEN);
  const pinned = resolvePythonEnvironment(PKG, ROOT, configWith('backend', { compose_service: 'api', python_env: 'compose' }), everything, spawn, 'linux');
  assert.equal(pinned?.mode, 'compose');
  // Neither the stale venv nor uv was consulted.
  assert.deepEqual(calls, []);
  assert.equal(resolvePythonEnvironment(PKG, ROOT, configWith('backend', { python_env: 'uv' }), everything, spawn, 'linux')?.mode, 'uv');
  // A pin the machine cannot honour is unavailable, not silently something else.
  assert.equal(resolvePythonEnvironment(PKG, ROOT, configWith('backend', { compose_service: 'api', python_env: 'venv' }), NONE, spawn, 'linux'), null);
});

test('with the real filesystem the answer is cached per package dir', (t) => {
  const root = tempRoot(t);
  const bin = venvBinDir(join(root, '.venv'));
  mkdirSync(bin, { recursive: true });
  const first = resolvePythonEnvironment(root, root, null);
  assert.equal(first?.mode, 'venv');
  rmSync(join(root, '.venv'), { recursive: true, force: true });
  // Still the venv: one process resolves a package once (design §A1.3).
  assert.equal(resolvePythonEnvironment(root, root, null)?.mode, 'venv');
});

// ------------------------------------------------------------------ hasTarget

const VENV = venvAt(PKG, '/repo/backend/.venv/bin');

test('a target configured in pyproject.toml exists without a probe', () => {
  const { spawn, calls } = spawnWith(ABSENT);
  const files = { '/repo/backend/pyproject.toml': '[tool.ruff]\nline-length = 120\n\n[tool.pyright]\nstrict = []\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n' };
  assert.equal(pythonHasTarget(VENV, 'lint', readFrom(files), spawn), true);
  assert.equal(pythonHasTarget(VENV, 'typecheck', readFrom(files), spawn), true);
  assert.equal(pythonHasTarget(VENV, 'test', readFrom(files), spawn), true);
  assert.deepEqual(calls, []);
});

test('a sub-table or a dotted key configures the tool as well as its header', () => {
  const lintOnly = readFrom({ '/repo/backend/pyproject.toml': '[tool.ruff.lint]\nselect = ["E"]\n' });
  assert.equal(pythonHasTarget(VENV, 'lint', lintOnly, ABSENT_SPAWN), true);
  const dotted = readFrom({ '/repo/backend/pyproject.toml': '[tool]\npyright.strict = ["app"]\n' });
  assert.equal(pythonHasTarget(VENV, 'typecheck', dotted, ABSENT_SPAWN), true);
  // `[tool.ruffle]` is not ruff.
  const lookalike = readFrom({ '/repo/backend/pyproject.toml': '[tool.ruffle]\nx = 1\n' });
  assert.equal(pythonHasTarget(VENV, 'lint', lookalike, ABSENT_SPAWN), false);
});

test('pytest.ini or conftest.py configures the test target', () => {
  assert.equal(pythonHasTarget(VENV, 'test', readFrom({ '/repo/backend/pytest.ini': '[pytest]\n' }), ABSENT_SPAWN), true);
  assert.equal(pythonHasTarget(VENV, 'test', readFrom({ '/repo/backend/conftest.py': '' }), ABSENT_SPAWN), true);
});

test('an unconfigured tool exists when it answers --version through the environment', () => {
  const { spawn, calls } = spawnWith((command) => (command.endsWith('/ruff') ? {} : { status: 1 }));
  assert.equal(pythonHasTarget(VENV, 'lint', readFrom({}), spawn), true);
  assert.equal(pythonHasTarget(VENV, 'typecheck', readFrom({}), spawn), false);
  assert.deepEqual(calls.map((c) => [c.command, c.args.join(' '), c.cwd, c.timeout]), [
    ['/repo/backend/.venv/bin/ruff', '--version', PKG, PROBE_TIMEOUT_SECONDS * 1000],
    ['/repo/backend/.venv/bin/pyright', '--version', PKG, PROBE_TIMEOUT_SECONDS * 1000],
  ]);
});

// ------------------------------------------------------------------ run

test('the target table is the contract', () => {
  assert.deepEqual(PYTHON_TARGETS, {
    lint: [['ruff', 'check', '.'], ['ruff', 'format', '--check', '.']],
    typecheck: [['pyright']],
    test: [['pytest', '-q']],
  });
});

test('lint runs both ruff commands in order, from the package, under one budget', () => {
  const { spawn, calls } = spawnWith((_command, args) => ({ stdout: `${args.join(' ')} ok\n` }));
  // A clock that advances 5 s per reading: the second command sees what the first left.
  let tick = 0;
  const now = (): number => {
    tick += 5_000;
    return tick;
  };
  const result = pythonRun(VENV, 'lint', 90, { A: '1' }, spawn, now);
  assert.deepEqual(result, {
    code: 0,
    output: '/repo/backend/.venv/bin/ruff check .\ncheck . ok\n/repo/backend/.venv/bin/ruff format --check .\nformat --check . ok\n',
    timedOut: false,
  });
  assert.deepEqual(calls.map((c) => [c.command, c.args.join(' '), c.cwd, c.timeout]), [
    ['/repo/backend/.venv/bin/ruff', 'check .', PKG, 90_000],
    ['/repo/backend/.venv/bin/ruff', 'format --check .', PKG, 85_000],
  ]);
  // The venv is activated for the spawn, never handed the bare env: PATH leads
  // with its bin and VIRTUAL_ENV names it (see `activated`).
  assert.deepEqual(calls[0]?.env, { A: '1', VIRTUAL_ENV: '/repo/backend/.venv', PATH: '/repo/backend/.venv/bin' });
});

test('the first non-zero command stops the target and is its code', () => {
  const { spawn, calls } = spawnWith((_command, args) => (args[0] === 'check' ? { status: 1, stdout: 'app/main.py:1:1 F401\n' } : {}));
  const result = pythonRun(VENV, 'lint', 90, {}, spawn);
  assert.equal(result.code, 1);
  assert.equal(result.timedOut, false);
  assert.equal(result.output, '/repo/backend/.venv/bin/ruff check .\napp/main.py:1:1 F401\n');
  assert.equal(calls.length, 1);
});

test('a command killed by the budget reports timedOut, and a spent budget never starts the next', () => {
  const killed = spawnWith(() => ({ status: null, signal: 'SIGTERM', error: timedOutError() }));
  const byKill = pythonRun(VENV, 'lint', 90, {}, killed.spawn);
  assert.deepEqual([byKill.code, byKill.timedOut, killed.calls.length], [124, true, 1]);

  const slow = spawnWith(GREEN);
  let tick = 0;
  const now = (): number => {
    tick += 100_000;
    return tick;
  };
  const bySpend = pythonRun(VENV, 'lint', 90, {}, slow.spawn, now);
  assert.equal(bySpend.timedOut, true);
  assert.equal(bySpend.code, 124);
  assert.equal(slow.calls.length, 1);
  assert.equal(bySpend.output.endsWith('/repo/backend/.venv/bin/ruff format --check .\n'), true);
});

test('a tool that never starts is named in the output, in the words the classifier reads', () => {
  const enoent = Object.assign(new Error('spawnSync /repo/backend/.venv/bin/pyright ENOENT'), { code: 'ENOENT' });
  const { spawn } = spawnWith(() => ({ status: null, error: enoent }));
  const result = pythonRun(VENV, 'typecheck', 90, {}, spawn);
  assert.deepEqual(result, {
    code: 1,
    output: '/repo/backend/.venv/bin/pyright\nNo such file or directory: /repo/backend/.venv/bin/pyright\n',
    timedOut: false,
  });
});

test('a tool that ends without a newline still gets the next argv on its own line', () => {
  const { spawn } = spawnWith(() => ({ stdout: 'no newline' }));
  const result = pythonRun(VENV, 'lint', 90, {}, spawn);
  assert.equal(result.output, '/repo/backend/.venv/bin/ruff check .\nno newline\n/repo/backend/.venv/bin/ruff format --check .\nno newline\n');
});

test('uv and compose environments prefix every command the same way', () => {
  const uv = resolvePythonEnvironment(PKG, ROOT, null, existsIn(['/repo/uv.lock']), spawnWith(GREEN).spawn, 'linux');
  const { spawn, calls } = spawnWith(GREEN);
  assert.notEqual(uv, null);
  if (uv === null) return;
  pythonRun(uv, 'test', 180, {}, spawn);
  assert.deepEqual(calls.map((c) => [c.command, c.args.join(' ')]), [['uv', `run --directory ${PKG} pytest -q`]]);
});

// ------------------------------------------------------------------ unpinned

test('an exact pin is ==X.Y.Z and nothing else', () => {
  const dev = (specs: string[]): string => `[project.optional-dependencies]\ndev = [${specs.map((s) => `"${s}"`).join(', ')}]\n`;
  const read = (text: string): ReturnType<typeof readFrom> => readFrom({ '/repo/backend/pyproject.toml': text });
  assert.deepEqual(unpinnedTools(PKG, read(dev(['ruff==0.13.0', 'pyright==1.1.405', 'pytest==8.4.1']))), []);
  assert.deepEqual(unpinnedTools(PKG, read(dev(['ruff>=0.13', 'pyright~=1.1', 'pytest==8.*']))), ['ruff', 'pyright', 'pytest']);
  assert.deepEqual(unpinnedTools(PKG, read(dev(['ruff', 'pytest==8.4.1']))), ['ruff']);
  // Extras, spacing and an environment marker do not hide a pin, or an unpin.
  assert.deepEqual(unpinnedTools(PKG, read(dev(['pyright[nodejs] == 1.1.405', 'Ruff==0.13.0 ; python_version < "3.13"']))), []);
  assert.deepEqual(unpinnedTools(PKG, read(dev(['py_test>=8']))), []);
  assert.deepEqual(unpinnedTools(PKG, read(dev(['pytest ; python_version < "3.13"']))), ['pytest']);
});

test('both dev-dependency shapes are read, and a tool the package never declares is not reported', () => {
  const groups = readFrom({ '/repo/backend/pyproject.toml': '[dependency-groups]\ndev = [\n  "ruff>=0.13",  # trailing comment\n  { include-group = "lint" },\n  "pytest==8.4.1",\n]\nlint = ["pyright==1.1.405"]\n' });
  assert.deepEqual(unpinnedTools(PKG, groups), ['ruff']);
  const dotted = readFrom({ '/repo/backend/pyproject.toml': '[project]\noptional-dependencies.dev = ["pyright"]\n' });
  assert.deepEqual(unpinnedTools(PKG, dotted), ['pyright']);
  // Runtime deps are not dev deps; a range there is not this advisory's business.
  const runtime = readFrom({ '/repo/backend/pyproject.toml': '[project]\ndependencies = ["ruff>=0.13"]\n' });
  assert.deepEqual(unpinnedTools(PKG, runtime), []);
  assert.deepEqual(unpinnedTools(PKG, readFrom({})), []);
});

test('a # inside a quoted specifier is not a comment', () => {
  const read = readFrom({ '/repo/backend/pyproject.toml': '[project.optional-dependencies]\ndev = ["ruff==0.13.0", "pytest==8.4.1"] # both pinned\n' });
  assert.deepEqual(unpinnedTools(PKG, read), []);
});
