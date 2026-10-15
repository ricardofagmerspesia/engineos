import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryIo } from '../io';
import { isRecord } from '../lib/json';
import { lazyRegistries } from '../kernel/context';
import { resolveRoot } from '../registry/paths';
import type { SchedulerState, WorkflowUnit } from '../workflow/contracts';
import { runScheduler } from './cli';
import { initialState } from './state';
import { validateState } from './validation';

const root = resolveRoot(process.env, __dirname);
const regs = lazyRegistries(root);
function unit(id = 'a'): WorkflowUnit {
  return {id, dependsOn: [], files: [`src/${id}.ts`], agent: 'executor', modelTier: 'build', contractRevision: 'v1', requiredChecks: ['diff-inspected']};
}
function planArgs(): string[] {
  return ['plan', '--units', JSON.stringify([unit()]), '--run-id', 'run', '--host-capacity', '2', '--time-ms', '0'];
}
function record(value: unknown): Record<string, unknown> {
  assert.ok(isRecord(value));
  return value;
}
function invoke(args: string[]) {
  const io = memoryIo({env: {ENGINEOS_ROOT: root}});
  const code = runScheduler(args, io);
  const text = io.stdout.join('');
  const records = text.trim().split('\n').map(line => record(JSON.parse(line)));
  return {code, text, records, stderr: io.stderr};
}
function stateOf(result: {records: Record<string, unknown>[]}): SchedulerState {
  const snapshot = result.records.find(entry => entry.type === 'snapshot');
  assert.ok(snapshot);
  validateState(snapshot.state, regs);
  return snapshot.state;
}
function mutationArgs(command: 'append' | 'seal', state: SchedulerState): string[] {
  return [command, '--state', JSON.stringify(state), '--revision', String(state.revision), '--time-ms', String(state.timestampMs + 1)];
}

test('legacy plan and step keep JSON envelopes without transport tags or planning flag', () => {
  const io = memoryIo({env: {ENGINEOS_ROOT: root}});
  assert.equal(runScheduler(planArgs(), io), 0);
  const output = record(JSON.parse(io.stdout.join('')));
  assert.deepEqual(Object.keys(output).sort(), ['actions', 'enforcement', 'events', 'state']);
  const expected = initialState({runId: 'run', units: [unit()], hostCapacity: 2, timestampMs: 0}, regs);
  assert.deepEqual(output.state, expected);
  const stepIo = memoryIo({env: {ENGINEOS_ROOT: root}});
  assert.equal(runScheduler(['step', '--state', JSON.stringify(expected), '--event', JSON.stringify({kind: 'started', unitId: 'a', revision: 0, timestampMs: 1, handle: 'handle-a'})], stepIo), 0);
  const next = record(JSON.parse(stepIo.stdout.join('')));
  validateState(next.state, regs);
  assert.equal(next.state.units[0]?.handle, 'handle-a');
  assert.equal(next.enforcement, 'conventional');
});

test('stream emits ordered event records then a snapshot for flags before and among arguments', () => {
  for (const args of [['--stream', ...planArgs()], [...planArgs().slice(0, 3), '--stream', ...planArgs().slice(3)]]) {
    const result = invoke(args);
    assert.equal(result.code, 0);
    assert.ok(result.text.endsWith('\n'));
    assert.deepEqual(result.records.map(entry => entry.type), ['event', 'event', 'event', 'snapshot']);
    assert.deepEqual(result.records.slice(0, -1).map(entry => record(entry.event).kind), ['run-started', 'unit-planned', 'unit-ready']);
    assert.deepEqual(result.records.slice(0, -1).map(entry => record(entry.event).sequence), [0, 1, 2]);
    assert.equal(result.records.at(-1)?.enforcement, 'conventional');
    assert.deepEqual(result.stderr, []);
  }
});

test('open plan append and seal stream new readiness without restarting the run', () => {
  const planned = invoke([...planArgs(), '--planning-open', '--stream']);
  const original = stateOf(planned);
  assert.equal(original.planningOpen, true);
  const appended = invoke([...mutationArgs('append', original), '--units', JSON.stringify([unit('b')]), '--stream']);
  assert.equal(appended.code, 0);
  const expanded = stateOf(appended);
  assert.equal(expanded.revision, 1);
  assert.deepEqual(expanded.units.map(entry => entry.id), ['a', 'b']);
  assert.deepEqual(appended.records.filter(entry => entry.type === 'event').map(entry => [record(entry.event).kind, record(entry.event).unitId]), [['unit-planned', 'b'], ['unit-ready', 'b']]);
  const sealed = invoke([...mutationArgs('seal', expanded), '--stream']);
  assert.equal(sealed.code, 0);
  assert.equal(stateOf(sealed).planningOpen, false);
  assert.deepEqual(sealed.records.map(entry => entry.type), ['snapshot']);
  const refused = invoke([...mutationArgs('append', stateOf(sealed)), '--units', JSON.stringify([unit('c')]), '--stream']);
  assert.equal(refused.code, 1);
  assert.equal(refused.records.length, 1);
  assert.equal(refused.records[0]?.type, 'error');
});

test('streamed step exposes useful result before sealed terminal completion and snapshot', () => {
  let state = stateOf(invoke([...planArgs(), '--stream']));
  let result = invoke(['step', '--state', JSON.stringify(state), '--event', JSON.stringify({kind: 'started', unitId: 'a', revision: state.revision, timestampMs: 1, handle: 'ha'}), '--stream']);
  state = stateOf(result);
  result = invoke(['step', '--state', JSON.stringify(state), '--event', JSON.stringify({kind: 'returned', unitId: 'a', revision: state.revision, timestampMs: 2}), '--stream']);
  state = stateOf(result);
  result = invoke(['step', '--state', JSON.stringify(state), '--event', JSON.stringify({kind: 'integrated', unitId: 'a', revision: state.revision, timestampMs: 3,
    evidence: {sourceRevision: 'source', contractRevision: 'v1', checks: ['diff-inspected'], artifacts: ['diff/a']}}), '--stream']);
  assert.equal(result.code, 0);
  assert.deepEqual(result.records.map(entry => entry.type === 'event' ? record(entry.event).kind : entry.type), ['unit-integrated', 'useful-result', 'run-completed', 'snapshot']);
});

test('malformed and duplicate stream arguments produce a single tagged error', () => {
  const cases = [['--stream', ...planArgs(), '--stream'], [...planArgs(), '--planning-open', '--planning-open', '--stream'],
    [...planArgs(), '--unknown', 'value', '--stream'], ['plan', '--units', '--stream'],
    ['plan', '--units', '{', '--run-id', 'run', '--host-capacity', '1', '--stream'],
    [...planArgs(), '--host-capacity', '1', '--stream'], [...planArgs(), '--planning-open', 'true', '--stream'],
    ['step', '--planning-open', '--stream'], ['seal', '--event', '{}', '--stream']];
  for (const args of cases) {
    const result = invoke(args);
    assert.equal(result.code, 1);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0]?.type, 'error');
    assert.equal(typeof result.records[0]?.error, 'string');
  }
});

test('append and seal require explicit valid mutation metadata and reject stale snapshots', () => {
  const state = stateOf(invoke([...planArgs(), '--planning-open', '--stream']));
  for (const command of ['append', 'seal'] as const) {
    const units = command === 'append' ? ['--units', JSON.stringify([unit('b')])] : [];
    for (const metadata of [[], ['--revision', '0'], ['--revision', '1', '--time-ms', '1'], ['--revision', '0', '--time-ms', '-1'], ['--revision', '0', '--time-ms', '1.5']]) {
      const result = invoke([command, '--state', JSON.stringify(state), ...units, ...metadata, '--stream']);
      assert.equal(result.code, 1);
      assert.deepEqual(result.records.map(entry => entry.type), ['error']);
    }
  }
  const invalidState = invoke(['seal', '--state', JSON.stringify({...state, planningOpen: 'true'}), '--revision', '0', '--time-ms', '1', '--stream']);
  assert.equal(invalidState.code, 1);
});
