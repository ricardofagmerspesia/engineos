import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tempRoot } from '../testing/harness';
import type { RunnerSelection, SpawnSyncLike } from './runner';
import {
  PROBE_TIMEOUT_SECONDS,
  execRun,
  failureBlock,
  findUpAny,
  firstLines,
  hasVerifyExtension,
  isDirectory,
  isFile,
  runnerCommand,
  runnerFound,
  verifyEnvironment,
} from './verify-targets';

const NPM: RunnerSelection = { kind: 'npm-family', run: 'npm run', exec: 'npx --no-install' };
const NX: RunnerSelection = { kind: 'nx', run: 'npm run', exec: 'npx --no-install' };

interface Call {
  command: string;
  args: readonly string[];
  cwd: string;
  timeout: number | undefined;
}

type SpawnResult = ReturnType<SpawnSyncLike>;

function recorder(result: Partial<SpawnResult> = {}): { spawn: SpawnSyncLike; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: SpawnSyncLike = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, timeout: options.timeout });
    return { status: 0, signal: null, stdout: '', stderr: '', ...result };
  };
  return { spawn, calls };
}

function timedOutError(): Error {
  const error = new Error('spawnSync npm ETIMEDOUT');
  Object.assign(error, { code: 'ETIMEDOUT' });
  return error;
}

test('only the JS/TS family is worth verifying', () => {
  for (const file of ['a.ts', 'a.tsx', 'a.js', 'a.jsx', '/x/y/b.ts']) {
    assert.equal(hasVerifyExtension(file), true, file);
  }
  for (const file of ['a.md', 'a.py', 'a.sql', 'a.tsv', 'ts', '']) {
    assert.equal(hasVerifyExtension(file), false, file);
  }
});

test('findUpAny probes every name at a level before ascending', (t) => {
  const root = tempRoot(t);
  // The nested project.json must win over the distant package.json: a per-name
  // ascent would exhaust the walk on the first name and answer with the wrong
  // package.
  mkdirSync(join(root, 'apps', 'api', 'src'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{}\n');
  writeFileSync(join(root, 'apps', 'api', 'project.json'), '{}\n');
  assert.equal(findUpAny(join(root, 'apps', 'api', 'src'), ['package.json', 'project.json']), join(root, 'apps', 'api'));
});

test('findUpAny answers null when no ancestor carries any marker', (t) => {
  const root = tempRoot(t);
  mkdirSync(join(root, 'deep'), { recursive: true });
  assert.equal(findUpAny(join(root, 'deep'), ['engineos-marker-that-never-exists.json']), null);
});

test('isDirectory and isFile answer false rather than throwing on a missing path', (t) => {
  const root = tempRoot(t);
  writeFileSync(join(root, 'a.ts'), '');
  assert.equal(isDirectory(root), true);
  assert.equal(isDirectory(join(root, 'a.ts')), false);
  assert.equal(isFile(join(root, 'a.ts')), true);
  assert.equal(isFile(root), false);
  assert.equal(isFile(join(root, 'nope.ts')), false);
  assert.equal(isDirectory(join(root, 'nope')), false);
});

test('a modern node on PATH leaves the environment untouched', () => {
  const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/nonexistent-home' };
  const resolved = verifyEnvironment(env, '22.11.0');
  assert.equal(resolved.env, env);
  assert.equal(resolved.nodeMajor, 22);
});

test('an ancient node with no nvm rescue keeps its own major', () => {
  const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', NVM_DIR: '/nonexistent/.nvm' };
  const resolved = verifyEnvironment(env, '16.17.0');
  assert.equal(resolved.env, env);
  assert.equal(resolved.nodeMajor, 16);
});

test('the rescued major is read from the bin directory the PATH fix prepended', (t) => {
  const root = tempRoot(t);
  const nvm = join(root, '.nvm');
  const bin = join(nvm, 'versions', 'node', 'v22.11.0', 'bin');
  mkdirSync(join(nvm, 'alias'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(nvm, 'alias', 'default'), '22\n');
  writeFileSync(join(bin, 'node'), '');
  const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', NVM_DIR: nvm };
  const resolved = verifyEnvironment(env, '16.17.0');
  assert.notEqual(resolved.env, env);
  assert.equal((resolved.env['PATH'] ?? '').split(delimiter)[0], bin);
  assert.equal(resolved.nodeMajor, 22);
});

test('the runner command is the binary each adapter is driven through', () => {
  assert.equal(runnerCommand(NPM), 'npm');
  assert.equal(runnerCommand(NX), 'npx');
  assert.equal(runnerCommand({ kind: 'npm-family', run: 'pnpm run', exec: 'pnpm exec' }), 'pnpm');
});

test('the runner probe asks the binary for its version under a budget', () => {
  const { spawn, calls } = recorder({ status: 0 });
  assert.equal(runnerFound(NPM, {}, spawn, '/w'), true);
  assert.deepEqual(calls, [{ command: 'npm', args: ['--version'], cwd: '/w', timeout: PROBE_TIMEOUT_SECONDS * 1000 }]);
});

test('a runner that is not on PATH is reported missing, not red', () => {
  const { spawn } = recorder({ status: null, error: new Error('spawnSync npm ENOENT') });
  assert.equal(runnerFound(NPM, {}, spawn, '/w'), false);
});

test('execRun reports the exit code and the joined output', () => {
  const { spawn, calls } = recorder({ status: 3, stdout: 'out', stderr: 'err' });
  assert.deepEqual(execRun(spawn, 'npx', ['--no-install', 'eslint', 'a.ts'], '/w', {}, 45), {
    code: 3,
    output: 'outerr',
    timedOut: false,
  });
  assert.deepEqual(calls[0], { command: 'npx', args: ['--no-install', 'eslint', 'a.ts'], cwd: '/w', timeout: 45000 });
});

test('execRun reads a budget kill from the ETIMEDOUT error and from the SIGTERM', () => {
  const viaError = recorder({ status: null, error: timedOutError() });
  const byError = execRun(viaError.spawn, 'npm', [], '/w', {}, 90);
  assert.equal(byError.timedOut, true);
  // No status of its own: 124 is the conventional timeout code, never one the
  // command chose.
  assert.equal(byError.code, 124);
  const viaSignal = recorder({ status: null, signal: 'SIGTERM' });
  assert.equal(execRun(viaSignal.spawn, 'npm', [], '/w', {}, 90).timedOut, true);
});

test('a failure block names the target and the subject and drops trailing blank lines', () => {
  assert.equal(failureBlock('lint', '/w/apps/api', 'boom\n\n'), '--- lint failed (/w/apps/api) ---\nboom');
});

test('firstLines truncates by line, never mid-report', () => {
  assert.equal(firstLines('a\nb\nc', 2), 'a\nb');
  assert.equal(firstLines('a\nb', 9), 'a\nb');
});
