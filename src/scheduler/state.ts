import type { Registries } from '../kernel/context';
import { KernelError } from '../lib/json';
import type { SchedulerAction, SchedulerEvent, SchedulerState, ScheduledUnit, WorkflowUnit } from '../workflow/contracts';
import { scopesOverlap } from './ownership';
import { capacity, requireCount, requireMetadata, requireText, validateEvent, validateEvidence, validateState, validateUnits } from './validation';

interface InitialOptions { runId: string; units: WorkflowUnit[]; hostCapacity: number; timestampMs: number; planningOpen?: boolean }

export function initialState(options: InitialOptions, regs: Registries): SchedulerState {
  requireMetadata(options.runId, 'run id');
  requireCount(options.hostCapacity, 'host capacity');
  requireCount(options.timestampMs, 'timestamp');
  validateUnits(options.units);
  const state: SchedulerState = {version: 1, runId: options.runId, revision: 0, timestampMs: options.timestampMs, hostCapacity: options.hostCapacity,
    units: options.units.map(scheduleUnit)};
  if (options.planningOpen !== undefined) state.planningOpen = options.planningOpen;
  validateState(state, regs);
  return refreshState(state);
}

export function scheduleUnit(unit: WorkflowUnit): ScheduledUnit {
  return {...unit, dependsOn: [...unit.dependsOn], files: [...unit.files], requiredChecks: [...unit.requiredChecks], state: 'planned', attempts: 0, handle: null, reason: null, evidence: null};
}

// Serialized readiness is never authority; derive it again from accepted integration.
export function refreshState(state: SchedulerState): SchedulerState {
  const units = state.units.map(unit => ({...unit}));
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const settled = new Set<string>();
  function settle(unit: ScheduledUnit): void {
    if (settled.has(unit.id)) return;
    settled.add(unit.id);
    if (!['planned', 'ready'].includes(unit.state) && !(unit.state === 'blocked' && unit.reason?.startsWith('dependency:'))) return;
    const dependencies = unit.dependsOn.map(id => {
      const prerequisite = byId.get(id);
      if (prerequisite === undefined) throw new KernelError('scheduler unknown dependency');
      settle(prerequisite);
      return prerequisite;
    });
    const failed = dependencies.find(other => ['failed', 'blocked', 'cancelled'].includes(other.state));
    if (failed !== undefined) { unit.state = 'blocked'; unit.reason = `dependency:${failed.id}:${failed.state}`; }
    else { unit.state = dependencies.every(other => other.state === 'integrated') ? 'ready' : 'planned'; unit.reason = null; }
  }
  for (const unit of units) settle(unit);
  return {...state, units};
}

export function actions(state: SchedulerState, regs: Registries): SchedulerAction[] {
  validateState(state, regs);
  const derived = refreshState(state);
  const owners = derived.units.filter(unit => unit.state === 'running' || unit.state === 'returned');
  let slots = capacity(state, regs) - owners.length;
  const result: SchedulerAction[] = [];
  for (const unit of derived.units) {
    if (unit.state === 'returned') result.push({kind: 'review', unitId: unit.id, reason: 'returned work awaits accepted integration; ownership retained'});
    if (unit.state === 'blocked' || unit.state === 'failed' || unit.state === 'cancelled') result.push({kind: 'blocked', unitId: unit.id, reason: unit.reason ?? unit.state});
    if (unit.state !== 'ready') continue;
    let reason: string | null = null;
    if (unit.attempts >= regs.policy.retry.max_attempts_per_unit) reason = 'retry attempts exhausted';
    else if (slots <= 0) reason = state.hostCapacity === 0 ? 'host capacity is zero' : 'effective capacity exhausted';
    else if (owners.some(owner => scopesOverlap(unit.files, owner.files))) reason = 'exclusive file ownership overlaps';
    if (reason !== null) result.push({kind: 'blocked', unitId: unit.id, reason});
    else { result.push({kind: 'launch', unitId: unit.id, reason: 'dependencies integrated and exclusive capacity available'}); owners.push(unit); slots--; }
  }
  return result;
}

export function applyEvent(state: SchedulerState, event: SchedulerEvent, regs: Registries): SchedulerState {
  validateState(state, regs);
  validateEvent(event);
  if (event.revision !== state.revision) throw new KernelError('scheduler stale event revision');
  if (event.timestampMs < state.timestampMs) throw new KernelError('scheduler event timestamp moves backwards');
  const derived = refreshState(state);
  const unit = derived.units.find(other => other.id === event.unitId);
  if (unit === undefined) throw new KernelError('scheduler unknown event unit');
  const updated = transition({state: derived, unit, event}, regs);
  const next = refreshState({...derived, revision: state.revision + 1, timestampMs: event.timestampMs, units: derived.units.map(other => other.id === unit.id ? updated : other)});
  validateState(next, regs);
  return next;
}

function transition(input: {state: SchedulerState; unit: ScheduledUnit; event: SchedulerEvent}, regs: Registries): ScheduledUnit {
  const {state, unit, event} = input;
  const protectedBlocker = regs.policy.retry.never_retry.some(situation => unit.reason?.includes(situation));
  // A second blocked event must not launder a security/data-loss reason into a retry.
  // Cancellation may abandon the unit; clearance needs a separate human reconciliation.
  if (protectedBlocker && event.kind !== 'cancelled') throw new KernelError('scheduler protected blocker requires human resolution');
  if (event.kind === 'started') {
    if (!actions(state, regs).some(action => action.kind === 'launch' && action.unitId === unit.id)) throw new KernelError('scheduler launch not admitted');
    requireMetadata(event.handle, 'launch handle');
    return {...unit, state: 'running', handle: event.handle, attempts: unit.attempts + 1, reason: null};
  }
  if (event.kind === 'returned') {
    if (unit.state !== 'running') throw new KernelError('scheduler only running work can return');
    return {...unit, state: 'returned'};
  }
  if (event.kind === 'integrated') {
    if (unit.state !== 'returned') throw new KernelError('scheduler integration requires returned work');
    validateEvidence(event.evidence, unit);
    return {...unit, state: 'integrated', handle: null, evidence: {...event.evidence, checks: [...event.evidence.checks], artifacts: [...event.evidence.artifacts]}};
  }
  if (event.kind === 'resumed') {
    if (!['failed', 'blocked'].includes(unit.state) || unit.reason?.startsWith('dependency:')) throw new KernelError('scheduler resume requires explicit failed/blocked unit');
    requireText(event.reason, 'resume justification');
    if (regs.policy.retry.never_retry.some(situation => unit.reason?.includes(situation))) throw new KernelError('scheduler resume requires human resolution of never-retry situation');
    if (unit.attempts >= regs.policy.retry.max_attempts_per_unit) throw new KernelError('scheduler resume attempts exhausted');
    return {...unit, state: 'planned', handle: null, reason: null, evidence: null};
  }
  if (unit.state === 'integrated' || unit.state === 'cancelled') throw new KernelError('scheduler terminal unit cannot transition');
  if (event.kind === 'failed' && !['running', 'returned'].includes(unit.state)) throw new KernelError('scheduler failure requires active attempt');
  // Active terminal events attest that the host stopped the worker before releasing ownership.
  requireText(event.reason, `${event.kind} reason`);
  return {...unit, state: event.kind, reason: event.reason, handle: null, evidence: null};
}
