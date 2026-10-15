import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lazyRegistries } from '../kernel/context';
import { resolveRoot } from '../registry/paths';
import type { SchedulerEvent, SchedulerState, WorkflowUnit } from '../workflow/contracts';
import { schedulerScopeRevision } from '../workflow/gates';
import { actions, applyEvent, initialState } from './state';
import { appendUnits, sealPlanning } from './incremental';
import { schedulerEvents } from './events';
import { launchReady } from './launcher';

const regs = lazyRegistries(resolveRoot(process.env, __dirname));
function unit(id: string, patch: Partial<WorkflowUnit> = {}): WorkflowUnit {
  return {id, dependsOn: [], files: [`src/${id}.ts`], agent: 'executor', modelTier: 'build', contractRevision: 'v1', requiredChecks: ['diff-inspected'], ...patch};
}
function plan(hostCapacity = 3): SchedulerState {
  return initialState({runId: 'incremental', units: [unit('a')], hostCapacity, timestampMs: 1, planningOpen: true}, regs);
}
function step(state: SchedulerState, kind: SchedulerEvent['kind'], id = 'a'): SchedulerState {
  return applyEvent(state, {kind, unitId: id, revision: state.revision, timestampMs: state.timestampMs + 1,
    ...(kind === 'started' ? {handle: `handle-${id}`} : {}),
    ...(kind === 'integrated' ? {evidence: {sourceRevision: 'source', contractRevision: 'v1', checks: ['diff-inspected'], artifacts: [`diff/${id}`]}} : {})}, regs);
}
function append(state: SchedulerState, units: WorkflowUnit[]): SchedulerState {
  return appendUnits(state, {units, revision: state.revision, timestampMs: state.timestampMs + 1}, regs);
}
function seal(state: SchedulerState): SchedulerState {
  return sealPlanning(state, {revision: state.revision, timestampMs: state.timestampMs + 1}, regs);
}
function launchIds(state: SchedulerState): string[] {
  return actions(state, regs).filter(action => action.kind === 'launch').map(action => action.unitId);
}
function approval(state: SchedulerState) {
  const scopeRevision = schedulerScopeRevision(state);
  return {taskId: state.runId, facts: {taskId: state.runId, scopeRevision, sourceRevision: 'source', phase: 'implementation', preview: {choice: 'declined', scopeRevision}}};
}

test('first open frontier launches before later specs and append releases a dependent while a sibling runs', async () => {
  const first = await launchReady(plan(), {capacity: () => 3, launch: async () => 'handle-a'}, regs, approval(plan()));
  const before = JSON.stringify(first.state);
  const expanded = append(first.state, [unit('b'), unit('c', {dependsOn: ['a']})]);
  assert.equal(JSON.stringify(first.state), before);
  assert.deepEqual(expanded.units[0], first.state.units[0]);
  assert.deepEqual(launchIds(expanded), ['b']);
  const active = step(expanded, 'started', 'b');
  const returned = step(active, 'returned');
  const integrated = step(returned, 'integrated');
  assert.deepEqual(launchIds(integrated), ['c']);
  assert.equal(integrated.units.find(candidate => candidate.id === 'b')?.handle, 'handle-b');
  const more = append(integrated, [unit('d')]);
  assert.deepEqual(more.units.find(candidate => candidate.id === 'a'), integrated.units.find(candidate => candidate.id === 'a'));
});

test('append keeps exclusive ownership and effective capacity for running and returned workers', () => {
  for (const returned of [false, true]) {
    let state = step(plan(), 'started');
    if (returned) state = step(state, 'returned');
    const expanded = append(state, [unit('collision', {files: ['src/a.ts']}), unit('free')]);
    assert.deepEqual(launchIds(expanded), ['free']);
    assert.equal(expanded.units[0]?.handle, 'handle-a');
  }
  const full = append(step(plan(1), 'started'), [unit('b')]);
  assert.deepEqual(launchIds(full), []);
  assert.equal(full.hostCapacity, 1);
});

test('append rejects invalid and future contracts atomically', () => {
  const state = step(plan(), 'started');
  const before = JSON.stringify(state);
  const batches = [[], [unit('a')], [unit('b'), unit('b')], [unit('b', {dependsOn: ['future']})],
    [unit('b', {dependsOn: ['c']}), unit('c', {dependsOn: ['b']})], [unit('b', {files: ['../outside.ts']})],
    [unit('bad id')], Array.from({length: 1000}, (_, index) => unit(`extra${index}`))];
  for (const units of batches) {
    assert.throws(() => append(state, units));
    assert.equal(JSON.stringify(state), before);
  }
  const batch = append(state, [unit('b', {dependsOn: ['c']}), unit('c')]);
  assert.deepEqual(launchIds(batch), ['c']);
});

test('append and seal reject stale revisions and backwards time without changing live ownership', () => {
  const state = step(plan(), 'started');
  const before = JSON.stringify(state);
  for (const mutation of [{revision: 0, timestampMs: state.timestampMs}, {revision: state.revision, timestampMs: 0},
    {revision: state.revision, timestampMs: Number.MAX_SAFE_INTEGER + 1}]) {
    assert.throws(() => appendUnits(state, {...mutation, units: [unit('b')]}, regs));
    assert.throws(() => sealPlanning(state, mutation, regs));
    assert.equal(JSON.stringify(state), before);
  }
});

test('an integrated open frontier yields results and can expand before one sealed completion', () => {
  const returned = step(step(plan(), 'started'), 'returned');
  const integrated = step(returned, 'integrated');
  const outcomes = schedulerEvents(returned, integrated, {kind: 'integrated', unitId: 'a', revision: returned.revision, timestampMs: integrated.timestampMs});
  assert.ok(outcomes.some(event => event.kind === 'useful-result'));
  assert.ok(!outcomes.some(event => event.kind === 'run-completed'));
  const expanded = append(integrated, [unit('b', {dependsOn: ['a']})]);
  assert.deepEqual(schedulerEvents(integrated, expanded, null).map(event => [event.kind, event.unitId]), [['unit-planned', 'b'], ['unit-ready', 'b']]);
  const complete = step(step(step(expanded, 'started', 'b'), 'returned', 'b'), 'integrated', 'b');
  const sealed = seal(complete);
  assert.deepEqual(schedulerEvents(complete, sealed, null).map(event => event.kind), ['run-completed']);
  assert.deepEqual(schedulerEvents(sealed, sealed, null), []);
  assert.throws(() => append(sealed, [unit('c')]), /sealed/);
  assert.throws(() => seal(sealed), /sealed/);
});

test('sealing active work preserves its handle and waits for final integration', () => {
  const running = step(plan(), 'started');
  const sealed = seal(running);
  assert.deepEqual(sealed.units, running.units);
  assert.deepEqual(schedulerEvents(running, sealed, null), []);
  const returned = step(sealed, 'returned');
  const integrated = step(returned, 'integrated');
  assert.ok(schedulerEvents(returned, integrated, {kind: 'integrated', unitId: 'a', revision: returned.revision, timestampMs: integrated.timestampMs}).some(event => event.kind === 'run-completed'));
});

test('expanded scope rejects previous admission before probing host and accepts refreshed frontier', async () => {
  const original = plan();
  const expanded = append(original, [unit('b')]);
  let probes = 0;
  const launcher = {capacity: () => { probes++; return 3; }, launch: async (candidate: WorkflowUnit) => `handle-${candidate.id}`};
  await assert.rejects(() => launchReady(expanded, launcher, regs, approval(original)), /stale-scope/);
  assert.equal(probes, 0);
  const result = await launchReady(expanded, launcher, regs, approval(expanded));
  assert.equal(result.state.units.filter(candidate => candidate.state === 'running').length, 2);
});

test('legacy plans omit planning flag and remain closed with unchanged completion', () => {
  const legacy = initialState({runId: 'legacy', units: [unit('a')], hostCapacity: 1, timestampMs: 0}, regs);
  assert.equal(Object.hasOwn(legacy, 'planningOpen'), false);
  assert.throws(() => append(legacy, [unit('b')]), /sealed/);
  const returned = step(step(legacy, 'started'), 'returned');
  const integrated = step(returned, 'integrated');
  assert.ok(schedulerEvents(returned, integrated, {kind: 'integrated', unitId: 'a', revision: returned.revision, timestampMs: integrated.timestampMs}).some(event => event.kind === 'run-completed'));
  assert.equal(schedulerScopeRevision(plan()), schedulerScopeRevision(legacy));
});
