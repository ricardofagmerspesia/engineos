import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import type { BenchDeps } from './measure';
import { runScenario, SCENARIOS } from './scenarios';

function fakeDeps(spawned: string[][]): BenchDeps {
  let clock = 0;
  return {
    spawn: (command, args) => {
      spawned.push([command, ...args]);
      return { status: 0, signal: null };
    },
    now: () => (clock += 5),
    mkdtemp: () => '/tmp/engineos-bench-fake',
  };
}

test('every scenario declares a phase and a stable name', () => {
  const names = SCENARIOS.map((entry) => entry.name);
  strictEqual(new Set(names).size, names.length);
  strictEqual(SCENARIOS.every((entry) => entry.samples > 0), true);
});

test('the warm edit scenario spawns the route hook and records a routing sample', () => {
  const spawned: string[][] = [];
  const scenario = SCENARIOS.find((entry) => entry.name === 'direct-edit-warm');
  if (scenario === undefined) throw new Error('direct-edit-warm is missing');
  const samples = runScenario(scenario, '/repo', {}, fakeDeps(spawned));
  strictEqual(samples.length, scenario.samples);
  strictEqual(samples.every((entry) => entry.phase === 'routing'), true);
  strictEqual(spawned.length > 0, true);
  strictEqual(spawned.every((argv) => argv[0]?.includes('route-before-change') === true), true);
});

test('scenarios record unobserved usage as null, never as zero', () => {
  const scenario = SCENARIOS[0];
  if (scenario === undefined) throw new Error('no scenarios');
  const samples = runScenario(scenario, '/repo', {}, fakeDeps([]));
  deepStrictEqual(
    samples.map((entry) => [entry.tokensIn, entry.tokensOut, entry.costMicros]),
    samples.map(() => [null, null, null]),
  );
});

interface SpawnRecord {
  argv: string[];
  input: string;
  env: NodeJS.ProcessEnv | undefined;
}

function recordingDeps(records: SpawnRecord[]): BenchDeps {
  let clock = 0;
  return {
    spawn: (command, args, options) => {
      records.push({ argv: [command, ...args], input: options.input, env: options.env });
      return { status: 0, signal: null };
    },
    now: () => (clock += 5),
    mkdtemp: () => '/tmp/engineos-bench-fake',
  };
}

function scenarioNamed(name: string): (typeof SCENARIOS)[number] {
  const scenario = SCENARIOS.find((entry) => entry.name === name);
  if (scenario === undefined) throw new Error(`${name} is missing`);
  return scenario;
}

test('the six original scenarios keep their names and order ahead of the appended ones', () => {
  deepStrictEqual(
    SCENARIOS.map((entry) => entry.name).slice(0, 6),
    ['prompt-routing', 'direct-edit-cold', 'direct-edit-warm', 'agent-dispatch', 'agent-return', 'final-gate'],
  );
});

test('the original scenarios still spawn their deprecated shim, with no node in front', () => {
  const records: SpawnRecord[] = [];
  runScenario(scenarioNamed('final-gate'), '/repo', {}, recordingDeps(records));
  strictEqual(records.length > 0, true);
  strictEqual(records.every((record) => record.argv.length === 1 && record.argv[0] === '/repo/hooks/stop-verify.sh'), true);
});

test('bash-noop spawns the per-call bundle write guard with a Bash ls payload', () => {
  const records: SpawnRecord[] = [];
  const scenario = scenarioNamed('bash-noop');
  runScenario(scenario, '/repo', {}, recordingDeps(records));
  strictEqual(records.length, scenario.samples);
  deepStrictEqual(records[0]?.argv, ['node', '/repo/dist/engineos-hot.cjs', 'hook', 'git-write-guard']);
  deepStrictEqual(JSON.parse(records[0]?.input ?? 'null'), {
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
    cwd: '/tmp',
    session_id: 'lifecycle-benchmark',
  });
});

test('the bundle-load pair spawns the per-call and the full bundle with an empty payload', () => {
  const hot: SpawnRecord[] = [];
  const full: SpawnRecord[] = [];
  runScenario(scenarioNamed('hot-bundle-load'), '/repo', {}, recordingDeps(hot));
  runScenario(scenarioNamed('full-bundle-load'), '/repo', {}, recordingDeps(full));
  deepStrictEqual(hot[0]?.argv, ['node', '/repo/dist/engineos-hot.cjs', 'hook', 'git-write-guard']);
  deepStrictEqual(full[0]?.argv, ['node', '/repo/dist/engineos.cjs', 'hook', 'git-write-guard']);
  strictEqual([...hot, ...full].every((record) => record.input === ''), true);
});

test('scenario hooks run with bypass, telemetry, write mode and shim warnings pinned over the caller env', () => {
  const records: SpawnRecord[] = [];
  const callerEnv: NodeJS.ProcessEnv = {
    PATH: '/usr/bin',
    ENGINEOS_BYPASS_FLAG: '/home/someone/.claude/engineos.bypass',
    ENGINEOS_TELEMETRY: '1',
    ENGINEOS_GIT_WRITES: 'auto',
  };
  runScenario(scenarioNamed('bash-noop'), '/repo', callerEnv, recordingDeps(records));
  deepStrictEqual(records[0]?.env, {
    PATH: '/usr/bin',
    ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass',
    ENGINEOS_TELEMETRY: '0',
    ENGINEOS_GIT_WRITES: 'ask',
    ENGINEOS_QUIET_SHIMS: '1',
  });
});

test('the appended scenarios take no warm run and record no cache hit', () => {
  for (const name of ['bash-noop', 'hot-bundle-load', 'full-bundle-load']) {
    const records: SpawnRecord[] = [];
    const scenario = scenarioNamed(name);
    const samples = runScenario(scenario, '/repo', {}, recordingDeps(records));
    strictEqual(scenario.warm, false);
    strictEqual(records.length, scenario.samples);
    strictEqual(samples.every((entry) => entry.cacheHit === null && entry.phase === 'execution'), true);
  }
});
