import type { Registries } from '../kernel/context';
import { KernelError } from '../lib/json';
import type { SchedulerState, WorkflowUnit } from '../workflow/contracts';
import { refreshState, scheduleUnit } from './state';
import { requireCount, validateState, validateUnits } from './validation';

interface PlanningMutation { revision: number; timestampMs: number }
interface AppendOptions extends PlanningMutation { units: WorkflowUnit[] }

function requireOpenPlanning(state: SchedulerState, mutation: PlanningMutation, regs: Registries): void {
  validateState(state, regs);
  requireCount(mutation.revision, 'planning revision');
  requireCount(mutation.timestampMs, 'planning timestamp');
  if (state.planningOpen !== true) throw new KernelError('scheduler planning is sealed');
  if (mutation.revision !== state.revision) throw new KernelError('scheduler stale planning revision');
  if (mutation.timestampMs < state.timestampMs) throw new KernelError('scheduler planning timestamp moves backwards');
}

export function appendUnits(state: SchedulerState, options: AppendOptions, regs: Registries): SchedulerState {
  requireOpenPlanning(state, options, regs);
  validateUnits(options.units, false, state.units.map(unit => unit.id));
  const units = [...state.units, ...options.units.map(scheduleUnit)];
  // The combined graph checks collisions and the total limit without replacing live owners.
  validateUnits(units, true);
  const next = refreshState({...state, revision: state.revision + 1, timestampMs: options.timestampMs, units});
  validateState(next, regs);
  return next;
}

export function sealPlanning(state: SchedulerState, options: PlanningMutation, regs: Registries): SchedulerState {
  requireOpenPlanning(state, options, regs);
  const next: SchedulerState = {...state, revision: state.revision + 1, timestampMs: options.timestampMs, planningOpen: false};
  validateState(next, regs);
  return next;
}
