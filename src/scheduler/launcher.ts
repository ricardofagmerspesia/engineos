import type { Registries } from '../kernel/context';
import { isRecord, KernelError } from '../lib/json';
import type { AgentLauncher, SchedulerState } from '../workflow/contracts';
import { actions, applyEvent } from './state';
import { requireCount, validateState } from './validation';
import { evaluateWorkflowGate, parseWorkflowGateFacts, schedulerScopeRevision, type HostProductionApproval } from '../workflow/gates';

export interface LaunchResult { state: SchedulerState; handles: Record<string, string> }

export class SchedulerLaunchError extends KernelError {
  constructor(readonly snapshot: LaunchResult, readonly uncertainUnitId: string) {
    super(`scheduler launcher outcome unknown for ${uncertainUnitId}; host must reconcile before any further launch`);
  }
}

// Host owns exclusive persistence, crash recovery and resource-breaker admission.
// This adapter never shells out or pretends to provide native harness enforcement.
export async function launchReady(state: SchedulerState, launcher: AgentLauncher, regs: Registries, hostApproval?: HostProductionApproval): Promise<LaunchResult> {
  validateState(state, regs);
  if (!isRecord(hostApproval)) throw new KernelError('scheduler requires scoped preview admission from host');
  const facts = parseWorkflowGateFacts(hostApproval.facts);
  if (!evaluateWorkflowGate(facts).productionAllowed || hostApproval.taskId !== state.runId || facts.taskId !== state.runId || facts.scopeRevision !== schedulerScopeRevision(state)) throw new KernelError('scheduler preview admission is absent, wrong-task or stale-scope');
  const hostCapacity = launcher.capacity();
  requireCount(hostCapacity, 'launcher capacity');
  const active = state.units.filter(unit => unit.state === 'running' || unit.state === 'returned').length;
  if (active > hostCapacity) return {state, handles: {}};
  let current: SchedulerState = {...state, hostCapacity: Math.min(state.hostCapacity, hostCapacity)};
  const handles: Record<string, string> = Object.create(null);
  for (;;) {
    const next = actions(current, regs).find(action => action.kind === 'launch');
    if (next === undefined) return {state: current, handles};
    const unit = current.units.find(candidate => candidate.id === next.unitId);
    if (unit === undefined) throw new KernelError('scheduler launch unit disappeared');
    // Launch calls are serialized; launched workers may execute concurrently.
    // Reconcile an uncertain launcher error before calling this adapter again.
    try {
      const handle = await launcher.launch({...unit, dependsOn: [...unit.dependsOn], files: [...unit.files], requiredChecks: [...unit.requiredChecks]});
      current = applyEvent(current, {kind: 'started', unitId: unit.id, revision: current.revision, timestampMs: current.timestampMs, handle}, regs);
      handles[unit.id] = handle;
    } catch {
      // Preserve earlier accepted launches; retrying the original snapshot duplicates workers.
      throw new SchedulerLaunchError({state: current, handles: {...handles}}, unit.id);
    }
  }
}
