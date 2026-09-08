import { test } from 'node:test';
import assert from 'node:assert/strict';
import { delimiter } from 'node:path';
import {
  type RunnerSelection,
  type SpawnSyncLike,
  runnerEnv,
  runnerHandle,
  runnerHasTarget,
  runnerRun,
  runnerSelect,
} from './runner';

const NX: RunnerSelection = { kind: 'nx', run: 'npm run', exec: 'npx --no-install' };
const NPM: RunnerSelection = { kind: 'npm-family', run: 'npm run', exec: 'npx --no-install' };

function existsIn(files: Record<string, string>): (p: string) => boolean {
  return (p) => Object.prototype.hasOwnProperty.call(files, p);
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

function recorder(
  result: Partial<ReturnType<SpawnSyncLike>>,
): { spawn: SpawnSyncLike; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: SpawnSyncLike = (command, args, options) => {
    calls.push({
      command,
      args,
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout,
    });
    return { status: 0, signal: null, stdout: '', stderr: '', ...result };
  };
  return { spawn, calls };
}

test('nx.json alone selects the nx adapter', () => {
  assert.equal(runnerSelect('/w', existsIn({ '/w/nx.json': '' })).kind, 'nx');
  assert.equal(runnerSelect('/w', existsIn({})).kind, 'npm-family');
});

test('the lockfile picks the package manager, pnpm over yarn over npm', () => {
  const pnpm = runnerSelect('/w', existsIn({ '/w/pnpm-lock.yaml': '', '/w/yarn.lock': '' }));
  assert.deepEqual(pnpm, { kind: 'npm-family', run: 'pnpm run', exec: 'pnpm exec' });
  assert.deepEqual(runnerSelect('/w', existsIn({ '/w/yarn.lock': '' })), {
    kind: 'npm-family',
    run: 'yarn run',
    exec: 'yarn',
  });
  assert.deepEqual(runnerSelect('/w', existsIn({})), {
    kind: 'npm-family',
    run: 'npm run',
    exec: 'npx --no-install',
  });
});

test('a package manager addresses the package by its directory', () => {
  assert.equal(runnerHandle(NPM, '/w/apps/api', readFrom({})), '/w/apps/api');
});

test('nx prefers the project.json name and strips the npm scope from the fallback', () => {
  assert.equal(
    runnerHandle(NX, '/w/apps/api', readFrom({ '/w/apps/api/project.json': '{"name":"api"}' })),
    'api',
  );
  assert.equal(
    runnerHandle(NX, '/w/apps/api', readFrom({ '/w/apps/api/package.json': '{"name":"@acme/api"}' })),
    'api',
  );
});

test('an nx dir with no resolvable project name has no handle', () => {
  assert.equal(runnerHandle(NX, '/w/apps/api', readFrom({})), null);
  assert.equal(runnerHandle(NX, '/w/apps/api', readFrom({ '/w/apps/api/project.json': 'not json' })), null);
});

test('a package-manager target is a declared package.json script', () => {
  const files = { '/w/api/package.json': '{"scripts":{"lint":"eslint .","test":null}}' };
  assert.equal(runnerHasTarget(NPM, '/w/api', 'lint', readFrom(files)), true);
  assert.equal(runnerHasTarget(NPM, '/w/api', 'typecheck', readFrom(files)), false);
  // A null script is declared-but-absent, the way jq's `// empty` reads it.
  assert.equal(runnerHasTarget(NPM, '/w/api', 'test', readFrom(files)), false);
});

test('an nx target is asked of the workspace, from the workspace root', () => {
  const { spawn, calls } = recorder({ stdout: '{"targets":{"lint":{}}}' });
  assert.equal(runnerHasTarget(NX, 'api', 'lint', readFrom({}), spawn, '/w'), true);
  assert.deepEqual(calls[0]?.command, 'npx');
  assert.deepEqual(calls[0]?.args, ['--no-install', 'nx', 'show', 'project', 'api', '--json']);
  assert.equal(calls[0]?.cwd, '/w');
});

test('an nx probe that fails to run reports no target rather than throwing', () => {
  const { spawn } = recorder({ status: 1, stdout: '' });
  assert.equal(runnerHasTarget(NX, 'api', 'lint', readFrom({}), spawn, '/w'), false);
});

test('a package-manager run happens in the package dir, silenced', () => {
  const { spawn, calls } = recorder({ status: 0, stdout: 'out', stderr: 'err' });
  const result = runnerRun(NPM, '/w/api', 'lint', 90, { A: '1' }, spawn, '/w');
  assert.deepEqual(result, { code: 0, output: 'outerr', timedOut: false });
  assert.equal(calls[0]?.command, 'npm');
  assert.deepEqual(calls[0]?.args, ['run', '-s', 'lint']);
  assert.equal(calls[0]?.cwd, '/w/api');
  assert.deepEqual(calls[0]?.env, { A: '1' });
  assert.equal(calls[0]?.timeout, 90_000);
});

test('an nx run happens at the workspace root and addresses project:target', () => {
  const { spawn, calls } = recorder({ status: 2, stdout: 'boom', stderr: '' });
  const result = runnerRun(NX, 'api', 'typecheck', 180, {}, spawn, '/w');
  assert.deepEqual(result, { code: 2, output: 'boom', timedOut: false });
  assert.deepEqual(calls[0]?.args, ['--no-install', 'nx', 'run', 'api:typecheck']);
  assert.equal(calls[0]?.cwd, '/w');
  assert.equal(calls[0]?.timeout, 180_000);
});

test('a run killed by its budget reports timedOut with the conventional code', () => {
  const timeout = Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' });
  const { spawn } = recorder({ status: null, signal: 'SIGTERM', error: timeout });
  const result = runnerRun(NPM, '/w/api', 'test', 1, {}, spawn, '/w');
  assert.equal(result.timedOut, true);
  assert.equal(result.code, 124);
});

test('a process killed by a signal that is not the budget is not a timeout', () => {
  const { spawn } = recorder({ status: null, signal: 'SIGKILL' });
  const result = runnerRun(NPM, '/w/api', 'test', 1, {}, spawn, '/w');
  assert.equal(result.timedOut, false);
  assert.equal(result.code, 1);
});

const NVM_FILES = { '/home/u/.nvm/alias/default': '22\n', '/home/u/.nvm/versions/node/v22.11.0/bin/node': '' };

test('an ancient node on PATH is fronted by the nvm default', () => {
  const env = runnerEnv(
    { HOME: '/home/u', PATH: '/nvm16/bin:/usr/bin' },
    16,
    existsIn(NVM_FILES),
    readFrom(NVM_FILES),
    () => ['v18.20.0', 'v22.11.0'],
  );
  assert.equal(env['PATH'], `/home/u/.nvm/versions/node/v22.11.0/bin${delimiter}/nvm16/bin:/usr/bin`);
});

test('a node already modern enough is left alone, same object', () => {
  const original = { HOME: '/home/u', PATH: '/usr/bin' };
  assert.equal(runnerEnv(original, 20, existsIn(NVM_FILES), readFrom(NVM_FILES), () => ['v22.11.0']), original);
});

test('no nvm default means no PATH change', () => {
  const original = { HOME: '/home/u', PATH: '/nvm16/bin' };
  assert.equal(runnerEnv(original, 16, existsIn({}), readFrom({}), () => []), original);
});

test('an nvm default that is itself too old is not prepended', () => {
  const files = { '/home/u/.nvm/alias/default': '18', '/home/u/.nvm/versions/node/v18.20.0/bin/node': '' };
  const original = { HOME: '/home/u', PATH: '/nvm16/bin' };
  assert.equal(runnerEnv(original, 16, existsIn(files), readFrom(files), () => ['v18.20.0']), original);
});

test('NVM_DIR wins over the HOME default', () => {
  const files = { '/opt/nvm/alias/default': '22', '/opt/nvm/versions/node/v22.11.0/bin/node': '' };
  const env = runnerEnv(
    { HOME: '/home/u', NVM_DIR: '/opt/nvm', PATH: '/usr/bin' },
    16,
    existsIn(files),
    readFrom(files),
    () => ['v22.11.0'],
  );
  assert.equal(env['PATH'], `/opt/nvm/versions/node/v22.11.0/bin${delimiter}/usr/bin`);
});
