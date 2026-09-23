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
