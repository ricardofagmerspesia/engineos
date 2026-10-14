import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lazyRegistries } from '../kernel/context';
import { resolveRoot } from '../registry/paths';
import { actions, applyEvent, initialState } from './state';
import { launchReady, SchedulerLaunchError } from './launcher';
import { schedulerScopeRevision } from '../workflow/gates';
import type { SchedulerEvent, SchedulerState, UnitEvidence, WorkflowUnit } from '../workflow/contracts';

const regs = lazyRegistries(resolveRoot(process.env, __dirname));
function unit(id: string, patch: Partial<WorkflowUnit> = {}): WorkflowUnit {
  return {id, dependsOn: [], files: [`src/${id}.ts`], agent: 'executor', modelTier: 'build', contractRevision: 'v1', requiredChecks: ['typecheck'], ...patch};
}
function plan(units = [unit('a'), unit('b'), unit('c', {dependsOn: ['a']})], hostCapacity = 3): SchedulerState {
  return initialState({runId: 'run', units, hostCapacity, timestampMs: 0}, regs);
}
function evidence(patch: Partial<UnitEvidence> = {}): UnitEvidence {
  return {sourceRevision: 'sha1', contractRevision: 'v1', checks: ['typecheck'], artifacts: ['diff/a'], ...patch};
}
function step(state: SchedulerState, kind: SchedulerEvent['kind'], unitId: string, patch: Partial<SchedulerEvent> = {}): SchedulerState {
  return applyEvent(state, {kind, unitId, revision: state.revision, timestampMs: state.timestampMs + 1, ...patch}, regs);
}
function running(): SchedulerState {
  return step(step(plan(), 'started', 'a', {handle: 'ha'}), 'started', 'b', {handle: 'hb'});
}
function launchIds(state: SchedulerState): string[] {
  return actions(state, regs).filter(action => action.kind === 'launch').map(action => action.unitId);
}

test('DAG starts ready siblings and releases C on A integration while B runs', () => {
  assert.deepEqual(launchIds(plan()), ['a', 'b']);
  const returned = step(running(), 'returned', 'a');
  assert.deepEqual(launchIds(returned), []);
  const integrated = step(returned, 'integrated', 'a', {evidence: evidence()});
  assert.deepEqual(launchIds(integrated), ['c']);
  assert.equal(integrated.units.find(candidate => candidate.id === 'b')?.state, 'running');
});
test('returned work retains file ownership until accepted integration', () => {
  const original = plan([unit('a'), unit('b', {files: ['src/a.ts']})]);
  const returned = step(step(original, 'started', 'a', {handle: 'ha'}), 'returned', 'a');
  assert.deepEqual(launchIds(returned), []);
  assert.ok(actions(returned, regs).some(action => action.kind === 'review' && action.unitId === 'a'));
});
test('glob and ancestor ownership overlaps are serialized conservatively', () => {
  assert.deepEqual(launchIds(plan([unit('a', {files: ['src/api/**']}), unit('b', {files: ['src/api/order.ts']})])), ['a']);
  assert.deepEqual(launchIds(plan([unit('a', {files: ['src/api']}), unit('b', {files: ['src/api/order.ts']})])), ['a']);
});
test('host zero and policy cap constrain ready launches', () => {
  assert.deepEqual(launchIds(plan(undefined, 0)), []);
  assert.equal(launchIds(plan([unit('a'), unit('b'), unit('c'), unit('d')], 99)).length, regs.policy.parallelism.wave_concurrency_cap);
});
test('cycles and unknown dependencies are refused before scheduling', () => {
  assert.throws(() => plan([unit('a', {dependsOn: ['b']}), unit('b', {dependsOn: ['a']})]), /cycle/);
  assert.throws(() => plan([unit('a', {dependsOn: ['missing']})]), /unknown dependency/);
});
test('stale revision and backwards event time are refused', () => {
  const state = running();
  assert.throws(() => step(state, 'returned', 'a', {revision: 0}), /stale/);
  assert.throws(() => step(state, 'returned', 'a', {timestampMs: 0}), /backwards/);
});
test('forged ready state cannot bypass integrated prerequisites', () => {
  const state = plan();
  const forged: SchedulerState = {...state, units: state.units.map(candidate => candidate.id === 'c' ? {...candidate, state: 'ready'} : candidate)};
  assert.throws(() => step(forged, 'started', 'c', {handle: 'hc'}), /not admitted/);
});
test('integration rejects missing checks and contract drift', () => {
  const state = step(running(), 'returned', 'a');
  assert.throws(() => step(state, 'integrated', 'a', {evidence: evidence({checks: []})}), /contract/);
  assert.throws(() => step(state, 'integrated', 'a', {evidence: evidence({contractRevision: 'v2'})}), /contract/);
});
test('failure blocks descendants but leaves independent work running', () => {
  const state = step(running(), 'failed', 'a', {reason: 'timeout'});
  assert.equal(state.units.find(candidate => candidate.id === 'c')?.state, 'blocked');
  assert.equal(state.units.find(candidate => candidate.id === 'b')?.state, 'running');
});
test('resumption releases dependency blocking after bounded attempts', () => {
  let state = step(running(), 'failed', 'a', {reason: 'timeout'});
  state = step(state, 'resumed', 'a', {reason: 'provider-recovered'});
  state = step(state, 'started', 'a', {handle: 'ha2'});
  state = step(state, 'failed', 'a', {reason: 'timeout'});
  assert.throws(() => step(state, 'resumed', 'a', {reason: 'provider-recovered'}), /attempts exhausted/);
});
test('unsafe failure reasons require human resolution before retry', () => {
  const state = step(running(), 'failed', 'a', {reason: regs.policy.retry.never_retry[0] ?? 'security-risk'});
  assert.throws(() => step(state, 'resumed', 'a', {reason: 'retry'}), /human resolution/);
});
function productionApproval(state: SchedulerState) {
  const scopeRevision = schedulerScopeRevision(state);
  return {taskId: state.runId, facts: {taskId: state.runId, scopeRevision, sourceRevision: 'source', phase: 'implementation', preview: {choice: 'declined', scopeRevision}}};
}
test('launcher uncertainty preserves previously accepted worker handles', async () => {
  const state = plan();
  await assert.rejects(() => launchReady(state, {capacity: () => 3, launch: async (candidate) => {
    if (candidate.id === 'b') throw new Error('transport disconnected');
    return 'ha';
  }}, regs, productionApproval(state)), (error: unknown) => {
    assert.ok(error instanceof SchedulerLaunchError);
    assert.deepEqual(error.snapshot.handles, {a: 'ha'});
    assert.equal(error.snapshot.state.units.find(candidate => candidate.id === 'a')?.state, 'running');
    assert.equal(error.uncertainUnitId, 'b');
    return true;
  });
});

test('protected security blocker cannot be replaced by transient reason or resumed', () => {
  const state = step(running(), 'blocked', 'a', {reason: 'security-risk'});
  assert.throws(() => step(state, 'blocked', 'a', {reason: 'timeout'}), /protected blocker/);
  assert.throws(() => step(state, 'resumed', 'a', {reason: 'provider-recovered'}), /human resolution/);
  assert.equal(state.units.find(candidate => candidate.id === 'a')?.reason, 'security-risk');
});

test('dense accepted thousand-unit DAG exposes only dependency-ready roots', () => {
  const units = Array.from({length: 1000}, (_, index) => unit(`u${index}`, {dependsOn: Array.from({length: Math.min(index, 200)}, (_, dependency) => `u${dependency}`)}));
  const state = plan(units);
  assert.equal(state.units.length, 1000);
  assert.deepEqual(launchIds(state), ['u0']);
  assert.equal(state.units.filter(candidate => candidate.state === 'ready').length, 1);
  assert.equal(state.units.filter(candidate => candidate.state === 'planned').length, 999);
});

test('caller cannot impersonate internal dependency blockers on active work', () => {
  const state = running();
  for (const reason of ['dependency:security-risk', 'dependency:transient']) {
    assert.throws(() => step(state, 'blocked', 'a', {reason}), /dependency|reserved/);
  }
  assert.equal(state.units.find(candidate => candidate.id === 'a')?.state, 'running');
});

test('forged root dependency blocker is rejected as an invalid snapshot', () => {
  const state = plan();
  const forged: SchedulerState = {...state, units: state.units.map(candidate => candidate.id === 'a'
    ? {...candidate, state: 'blocked', reason: 'dependency:b:failed'} : candidate)};
  assert.throws(() => actions(forged, regs), /dependency/);
});


test('preview approval denial occurs before capacity probes or launcher calls', async () => {
  const state = plan(); let calls = 0;
  const launcher = {capacity: () => { calls++; return 3; }, launch: async () => {calls++; return 'handle';}};
  await assert.rejects(() => launchReady(state, launcher, regs), /scoped preview/);
  const approved = productionApproval(state);
  await assert.rejects(() => launchReady(state, launcher, regs, {...approved, taskId: 'other'}), /wrong-task/);
  const changed = plan([unit('a', {files: ['src/changed.ts']}), unit('b')]);
  await assert.rejects(() => launchReady(changed, launcher, regs, approved), /stale-scope/);
  assert.equal(calls, 0);
});
test('exact declined or selected preview admits capacity-bounded frontier', async () => {
  for (const choice of ['declined', 'selected']) {
    const state = plan(); const approved = productionApproval(state);
    const facts = {...approved.facts, preview: {...approved.facts.preview, choice, artifactRevision: 'preview2', approvedArtifactRevision: 'preview2'}};
    const launched: string[] = [];
    const result = await launchReady(state, {capacity: () => 1, launch: async unit => {launched.push(unit.id); return 'handle';}}, regs, {taskId: state.runId, facts});
    assert.deepEqual(launched, ['a']); assert.equal(result.state.units.find(unit => unit.id === 'a')?.state, 'running');
  }
});
