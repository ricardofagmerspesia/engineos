import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportWorkflow } from './workflow';
import { runWorkflowReport } from './workflow-cli';
import { runScheduler } from '../scheduler/cli';
import { runInProcess } from '../testing/harness';
import { resolveRoot } from '../registry/paths';
import type { SchedulerState, WorkflowEvent, WorkflowUnit, UnitEvidence } from '../workflow/contracts';

const proof: UnitEvidence = {sourceRevision: 'sha1', contractRevision: 'v1', checks: ['typecheck'], artifacts: ['diff/a']};
function event(kind: WorkflowEvent['kind'], timestampMs: number, patch: Partial<WorkflowEvent> = {}): WorkflowEvent {
  return {version: 1, runId: 'run', sequence: timestampMs, timestampMs, kind, ...patch};
}
function completed(): WorkflowEvent[] {
  return [event('run-started', 0), event('unit-planned', 1, {unitId: 'a'}), event('unit-ready', 3, {unitId: 'a'}),
    event('unit-started', 5, {unitId: 'a', owner: 'executor'}), event('unit-returned', 15, {unitId: 'a'}),
    event('unit-integrated', 20, {unitId: 'a', evidence: proof}), event('useful-result', 21, {unitId: 'a', evidence: proof}), event('run-completed', 30)];
}
test('completed report separates useful result latency, worker runtime and waits', () => {
  const report = reportWorkflow(completed());
  assert.equal(report.totalTimeMs, 30);
  assert.equal(report.ttfrMs, 21);
  assert.equal(report.units[0]?.dependencyWaitMs, 2);
  assert.equal(report.units[0]?.capacityWaitMs, 2);
  assert.equal(report.units[0]?.runtimeMs, 10);
  assert.equal(report.units[0]?.integrationLatencyMs, 5);
});
test('return announcements alone do not establish TTFR or total completion', () => {
  const report = reportWorkflow(completed().slice(0, 5));
  assert.equal(report.ttfrMs, null);
  assert.equal(report.totalTimeMs, null);
  assert.equal(report.completed, false);
});
test('useful result must reference accepted evidence at the same revision', () => {
  const events = completed();
  events[6] = event('useful-result', 21, {unitId: 'a', evidence: {...proof, sourceRevision: 'other'}});
  assert.throws(() => reportWorkflow(events), /lifecycle/);
});
test('unknown usage remains null while observed numeric usage is aggregated', () => {
  assert.equal(reportWorkflow(completed()).usage.costMicros, null);
  const events = completed();
  events.splice(7, 0, event('model-usage', 22, {calls: 2, tokensIn: 12, tokensOut: 3, costMicros: 9}));
  const report = reportWorkflow(events);
  assert.equal(report.usage.calls, 2);
  assert.equal(report.usage.tokensIn, 12);
  assert.equal(report.usage.costMicros, 9);
  assert.equal(report.usage.completeRunCoverage, null);
});
test('failed attempt followed by replanning reports retries and accumulated runtime', () => {
  const report = reportWorkflow([event('run-started', 0), event('unit-ready', 1, {unitId: 'a'}),
    event('unit-started', 2, {unitId: 'a'}), event('unit-failed', 5, {unitId: 'a'}),
    event('unit-planned', 6, {unitId: 'a'}), event('unit-ready', 7, {unitId: 'a'}), event('unit-started', 8, {unitId: 'a'}),
    event('unit-returned', 10, {unitId: 'a'}), event('unit-integrated', 11, {unitId: 'a', evidence: proof}), event('run-completed', 12)]);
  assert.equal(report.retries, 1);
  assert.equal(report.failures, 1);
  assert.equal(report.units[0]?.runtimeMs, 5);
});
test('parallel event interval produces observed worker concurrency', () => {
  const report = reportWorkflow([event('run-started', 0), event('unit-ready', 1, {unitId: 'a'}), event('unit-ready', 2, {unitId: 'b'}),
    event('unit-started', 3, {unitId: 'a'}), event('unit-started', 4, {unitId: 'b'}),
    event('unit-returned', 8, {unitId: 'a'}), event('unit-returned', 10, {unitId: 'b'})]);
  assert.equal(report.peakActiveWorkers, 2);
  assert.equal(report.activeWorkerTimeMs, 11);
});
test('scheduler CLI events feed workflow report after journal cursor reassignment', () => {
  const root = resolveRoot(process.env, __dirname);
  const units: WorkflowUnit[] = [{id: 'a', dependsOn: [], files: ['notes.md'], agent: 'executor', modelTier: 'build', contractRevision: 'v1', requiredChecks: ['typecheck']}];
  const result = runInProcess(runScheduler, ['plan', '--units', JSON.stringify(units), '--run-id', 'run', '--host-capacity', '1', '--time-ms', '0'], {env: {ENGINEOS_ROOT: root}});
  assert.equal(result.status, 0);
  const output: {state: SchedulerState; events: WorkflowEvent[]} = JSON.parse(result.stdout);
  let state = output.state;
  const events = [...output.events];
  for (const [index, kind] of ['started', 'returned', 'integrated'].entries()) {
    const change = {kind, unitId: 'a', revision: state.revision, timestampMs: index + 1, ...(kind === 'started' ? {handle: 'ha'} : {}), ...(kind === 'integrated' ? {evidence: proof} : {})};
    const next = runInProcess(runScheduler, ['step', '--state', JSON.stringify(state), '--event', JSON.stringify(change)], {env: {ENGINEOS_ROOT: root}});
    assert.equal(next.status, 0, next.stdout);
    const parsed: {state: SchedulerState; events: WorkflowEvent[]} = JSON.parse(next.stdout);
    state = parsed.state;
    for (const item of parsed.events) events.push({...item, sequence: events.length});
  }
  const report = runInProcess(runWorkflowReport, [], {stdin: events.map(item => JSON.stringify(item)).join('\n')});
  assert.equal(report.status, 0, report.stdout);
  assert.equal(JSON.parse(report.stdout).completed, true);
  assert.equal(JSON.parse(report.stdout).ttfrMs, 3);
  const usefulIndex = events.findIndex(item => item.kind === 'useful-result');
  const completedIndex = events.findIndex(item => item.kind === 'run-completed');
  assert.ok(usefulIndex > 0 && usefulIndex < completedIndex);
  assert.deepEqual(events[usefulIndex]?.evidence, proof);
});
