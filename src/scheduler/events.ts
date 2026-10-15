import { hookSlug } from '../lib/slug';
import type { SchedulerEvent, SchedulerState, WorkflowEvent } from '../workflow/contracts';

// Sequence is local to this batch; the journal host assigns its persistent cursor.
export function schedulerEvents(before: SchedulerState | null, after: SchedulerState, event: SchedulerEvent | null): WorkflowEvent[] {
  const result: WorkflowEvent[] = [];
  function emit(details: Omit<WorkflowEvent, 'version' | 'runId' | 'sequence' | 'timestampMs'>): void {
    result.push({version: 1, runId: after.runId, sequence: result.length, timestampMs: after.timestampMs, ...details});
  }
  if (before === null) {
    emit({kind: 'run-started'});
    for (const unit of after.units) emit({kind: 'unit-planned', unitId: unit.id, owner: unit.agent});
  } else if (event === null) {
    const previousIds = new Set(before.units.map(unit => unit.id));
    for (const unit of after.units) {
      if (!previousIds.has(unit.id)) emit({kind: 'unit-planned', unitId: unit.id, owner: unit.agent});
    }
  } else {
    const unit = after.units.find(other => other.id === event.unitId);
    if (unit !== undefined) {
      const mapping: Record<SchedulerEvent['kind'], WorkflowEvent['kind']> = {started: 'unit-started', returned: 'unit-returned', integrated: 'unit-integrated', failed: 'unit-failed', blocked: 'unit-blocked', resumed: 'unit-planned', cancelled: 'unit-cancelled'};
      const details: Omit<WorkflowEvent, 'version' | 'runId' | 'sequence' | 'timestampMs'> = {kind: mapping[event.kind], unitId: unit.id, owner: unit.agent};
      if (unit.reason !== null) details.reason = hookSlug(unit.reason).slice(0, 256);
      if (unit.evidence !== null) details.evidence = unit.evidence;
      emit(details);
      // Integrated delivery units expose accepted results before completion closes the journal.
      if (event.kind === 'integrated' && unit.evidence !== null && unit.evidence.checks.length > 0) {
        emit({kind: 'useful-result', unitId: unit.id, owner: unit.agent, evidence: unit.evidence});
      }
    }
  }
  for (const unit of after.units) {
    const previous = before?.units.find(other => other.id === unit.id);
    if (unit.state === 'ready' && previous?.state !== 'ready') emit({kind: 'unit-ready', unitId: unit.id, owner: unit.agent});
    if (unit.state === 'blocked' && previous?.state !== 'blocked' && event?.unitId !== unit.id) emit({kind: 'unit-blocked', unitId: unit.id, owner: unit.agent, reason: hookSlug(unit.reason ?? 'dependency-blocked').slice(0, 256)});
  }
  const complete = after.planningOpen !== true && after.units.every(unit => unit.state === 'integrated');
  const previouslyComplete = before !== null && before.planningOpen !== true && before.units.every(unit => unit.state === 'integrated');
  if (complete && !previouslyComplete) emit({kind: 'run-completed'});
  return result;
}
