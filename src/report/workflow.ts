import { parseWorkflowEvents, WorkflowInputError } from '../journal/workflow';
import type { UnitEvidence, WorkflowEvent } from '../workflow/contracts';

export { parseWorkflowEvents } from '../journal/workflow';

export interface WorkflowUnitReport {
  id: string;
  owner: string | null;
  firstReadyLatencyMs: number | null;
  dependencyWaitMs: number | null;
  capacityWaitMs: number | null;
  runtimeMs: number | null;
  integrationLatencyMs: number | null;
  reviewCompletionLatencyMs: number | null;
  attempts: number;
  retries: number;
  failures: number;
  integrated: boolean;
}

interface UnitObservation {
  report: WorkflowUnitReport;
  readyAt: number | null;
  plannedAt: number | null;
  startedAt: number | null;
  returnedAt: number | null;
  integratedEvidence: UnitEvidence | null;
  state: 'planned' | 'ready' | 'running' | 'returned' | 'integrated' | 'blocked' | 'failed' | 'cancelled';
}

export interface WorkflowReport {
  runId: string;
  completed: boolean;
  totalTimeMs: number | null;
  observedTimeMs: number;
  ttfrMs: number | null;
  activeWorkerTimeMs: number;
  averageActiveWorkers: number | null;
  peakActiveWorkers: number;
  retries: number;
  failures: number;
  units: WorkflowUnitReport[];
  usage: {
    events: number;
    calls: number | null;
    tokensIn: number | null;
    tokensOut: number | null;
    costMicros: number | null;
    coverage: Record<'calls' | 'tokensIn' | 'tokensOut' | 'costMicros', number>;
    completeRunCoverage: null;
  };
  limitations: string[];
}

function transitionError(): never {
  throw new WorkflowInputError('invalid workflow unit lifecycle');
}

function addDuration(previous: number | null, duration: number): number {
  const total = (previous ?? 0) + duration;
  if (!Number.isSafeInteger(total)) throw new WorkflowInputError('workflow total exceeds numeric bounds');
  return total;
}

function newUnit(id: string): UnitObservation {
  return {
    report: { id, owner: null, firstReadyLatencyMs: null, dependencyWaitMs: null,
      capacityWaitMs: null, runtimeMs: null, integrationLatencyMs: null,
      reviewCompletionLatencyMs: null, attempts: 0, retries: 0, failures: 0, integrated: false },
    readyAt: null, plannedAt: null, startedAt: null, returnedAt: null, integratedEvidence: null, state: 'blocked',
  };
}

function finishAttempt(unit: UnitObservation, timestampMs: number): void {
  if (unit.startedAt === null) transitionError();
  unit.report.runtimeMs = addDuration(unit.report.runtimeMs, timestampMs - unit.startedAt);
  unit.startedAt = null;
}

function applyUnitEvent(unit: UnitObservation, event: WorkflowEvent, runStartedAt: number): number {
  if (event.owner !== undefined) unit.report.owner = event.owner;
  switch (event.kind) {
    case 'unit-planned':
      if (unit.state !== 'blocked' && unit.state !== 'failed') transitionError();
      unit.plannedAt = event.timestampMs;
      unit.readyAt = null;
      unit.startedAt = null;
      unit.returnedAt = null;
      unit.integratedEvidence = null;
      unit.state = 'planned';
      return 0;
    case 'unit-ready':
      if (unit.state === 'running' || unit.state === 'returned' || unit.state === 'integrated' || unit.state === 'ready' || unit.state === 'cancelled') transitionError();
      unit.readyAt = event.timestampMs;
      unit.report.firstReadyLatencyMs ??= event.timestampMs - runStartedAt;
      if (unit.plannedAt !== null) {
        unit.report.dependencyWaitMs = addDuration(unit.report.dependencyWaitMs, event.timestampMs - unit.plannedAt);
        unit.plannedAt = null;
      }
      unit.state = 'ready';
      return 0;
    case 'unit-started':
      if (unit.state !== 'ready' || unit.readyAt === null) transitionError();
      unit.report.capacityWaitMs = addDuration(unit.report.capacityWaitMs, event.timestampMs - unit.readyAt);
      unit.startedAt = event.timestampMs;
      unit.report.attempts += 1;
      unit.report.retries = Math.max(0, unit.report.attempts - 1);
      unit.state = 'running';
      return 1;
    case 'unit-returned':
      if (unit.state !== 'running') transitionError();
      finishAttempt(unit, event.timestampMs);
      unit.returnedAt = event.timestampMs;
      unit.state = 'returned';
      return -1;
    case 'unit-integrated':
      if (unit.state !== 'returned' || unit.returnedAt === null) transitionError();
      unit.report.integrationLatencyMs = event.timestampMs - unit.returnedAt;
      unit.report.integrated = true;
      unit.integratedEvidence = event.evidence ?? null;
      unit.state = 'integrated';
      return 0;
    case 'review-completed':
      if ((unit.state !== 'returned' && unit.state !== 'integrated') || unit.returnedAt === null) transitionError();
      unit.report.reviewCompletionLatencyMs = event.timestampMs - unit.returnedAt;
      return 0;
    case 'unit-failed': case 'unit-blocked': case 'unit-cancelled': {
      if (unit.state === 'integrated' || unit.state === 'cancelled') transitionError();
      const running = unit.state === 'running';
      if (running) finishAttempt(unit, event.timestampMs);
      if (event.kind === 'unit-failed') unit.report.failures += 1;
      unit.readyAt = null;
      unit.returnedAt = null;
      unit.state = event.kind === 'unit-failed' ? 'failed' : event.kind === 'unit-blocked' ? 'blocked' : 'cancelled';
      return running ? -1 : 0;
    }
    case 'check-completed':
      if (unit.state !== 'returned' && unit.state !== 'integrated') transitionError();
      return 0;
    default: return 0;
  }
}

export function reportWorkflow(input: WorkflowEvent[]): WorkflowReport {
  const events = parseWorkflowEvents(input);
  const first = events[0];
  const last = events[events.length - 1];
  if (first === undefined || last === undefined) transitionError();
  const units = new Map<string, UnitObservation>();
  const usage: WorkflowReport['usage'] = { events: 0, calls: null, tokensIn: null,
    tokensOut: null, costMicros: null, coverage: { calls: 0, tokensIn: 0, tokensOut: 0, costMicros: 0 }, completeRunCoverage: null };
  let active = 0;
  let peak = 0;
  let integral = 0;
  let priorTimestamp = first.timestampMs;
  let ttfrMs: number | null = null;
  for (const event of events) {
    integral = addDuration(integral, active * (event.timestampMs - priorTimestamp));
    priorTimestamp = event.timestampMs;
    if (event.unitId !== undefined && (event.kind.startsWith('unit-') || event.kind === 'review-completed' || event.kind === 'check-completed')) {
      let unit = units.get(event.unitId);
      if (unit === undefined) { unit = newUnit(event.unitId); units.set(event.unitId, unit); }
      active += applyUnitEvent(unit, event, first.timestampMs);
      peak = Math.max(peak, active);
    }
    if (event.kind === 'useful-result') {
      if (event.unitId !== undefined) {
        const unit = units.get(event.unitId);
        const accepted = unit?.integratedEvidence;
        if (unit?.state !== 'integrated' || accepted === undefined || accepted === null || event.evidence === undefined
          || accepted.sourceRevision !== event.evidence.sourceRevision
          || accepted.contractRevision !== event.evidence.contractRevision
          || event.evidence.checks.some((check) => !accepted.checks.includes(check))
          || event.evidence.artifacts.some((artifact) => !accepted.artifacts.includes(artifact))) transitionError();
      }
      ttfrMs ??= event.timestampMs - first.timestampMs;
    }
    if (event.kind === 'model-usage') {
      usage.events += 1;
      for (const field of ['calls', 'tokensIn', 'tokensOut', 'costMicros']) {
        // Explicit properties keep unknown usage distinct from observed zero.
        switch (field) {
          case 'calls': if (event.calls !== undefined) { usage.calls = addDuration(usage.calls, event.calls); usage.coverage.calls += 1; } break;
          case 'tokensIn': if (event.tokensIn !== undefined) { usage.tokensIn = addDuration(usage.tokensIn, event.tokensIn); usage.coverage.tokensIn += 1; } break;
          case 'tokensOut': if (event.tokensOut !== undefined) { usage.tokensOut = addDuration(usage.tokensOut, event.tokensOut); usage.coverage.tokensOut += 1; } break;
          case 'costMicros': if (event.costMicros !== undefined) { usage.costMicros = addDuration(usage.costMicros, event.costMicros); usage.coverage.costMicros += 1; } break;
        }
      }
    }
  }
  const completed = last.kind === 'run-completed';
  if (completed && [...units.values()].some((unit) => unit.state !== 'integrated' && unit.state !== 'failed' && unit.state !== 'cancelled')) transitionError();
  const observedTimeMs = last.timestampMs - first.timestampMs;
  const reports = [...units.values()].map((unit) => unit.report);
  return {
    runId: first.runId, completed, totalTimeMs: completed ? observedTimeMs : null,
    observedTimeMs, ttfrMs, activeWorkerTimeMs: integral,
    averageActiveWorkers: observedTimeMs === 0 ? null : integral / observedTimeMs,
    peakActiveWorkers: peak,
    retries: reports.reduce((total, unit) => total + unit.retries, 0),
    failures: reports.reduce((total, unit) => total + unit.failures, 0), units: reports, usage,
    limitations: [
      'dependencyWaitMs sums observed unit-planned to unit-ready intervals; absent planned events remain unknown',
      'firstReadyLatencyMs includes all time before readiness; capacityWaitMs includes ownership and capacity admission',
      'integrationLatencyMs and reviewCompletionLatencyMs include waiting; isolated review duration is unavailable',
      'runtimeMs sums finished attempts only; activeWorkerTimeMs covers the observed event window',
      'usage totals cover supplied model-usage fields only; complete run coverage is unknown',
      'useful-result evidence is a producer attestation, not an independently executed check',
    ],
  };
}
