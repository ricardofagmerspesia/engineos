import { isRecord, KernelError } from '../lib/json';
import type { Registries } from '../kernel/context';
import type { SchedulerEvent, SchedulerState, ScheduledUnit, UnitEvidence, WorkflowUnit } from '../workflow/contracts';
import { scopesOverlap, validateScope } from './ownership';

export function requireText(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 2048) throw new KernelError(`scheduler invalid ${name}`);
}

export function requireMetadata(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9@_./:-]+$/.test(value)) throw new KernelError(`scheduler invalid ${name}`);
}

function requireKeys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new KernelError('scheduler unknown input field');
}

export function requireCount(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new KernelError(`scheduler invalid ${name}`);
}

function requireStrings(value: unknown, name: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length > 256) throw new KernelError(`scheduler invalid ${name}`);
  for (const item of value) requireText(item, name);
  if (new Set(value).size !== value.length) throw new KernelError(`scheduler duplicate ${name}`);
}

export function validateUnits(value: unknown, allowScheduled = false, knownUnitIds: readonly string[] = []): asserts value is WorkflowUnit[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) throw new KernelError('scheduler requires 1–1000 units');
  const ids = new Set<string>();
  for (const unit of value) {
    if (!isRecord(unit)) throw new KernelError('scheduler invalid unit');
    const fields = ['id', 'dependsOn', 'files', 'agent', 'modelTier', 'contractRevision', 'requiredChecks'];
    requireKeys(unit, allowScheduled ? [...fields, 'state', 'attempts', 'handle', 'reason', 'evidence'] : fields);
    requireMetadata(unit.id, 'unit id');
    requireMetadata(unit.agent, 'agent');
    requireMetadata(unit.modelTier, 'model tier');
    requireMetadata(unit.contractRevision, 'contract revision');
    requireStrings(unit.dependsOn, 'dependencies');
    requireStrings(unit.files, 'files');
    requireStrings(unit.requiredChecks, 'required checks');
    for (const id of unit.dependsOn) requireMetadata(id, 'dependency');
    for (const check of unit.requiredChecks) requireMetadata(check, 'required check');
    if (unit.files.length === 0) throw new KernelError('scheduler requires explicit file ownership');
    for (const file of unit.files) validateScope(file);
    if (ids.has(unit.id)) throw new KernelError('scheduler duplicate unit id');
    ids.add(unit.id);
  }
  const units: WorkflowUnit[] = value;
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const known = new Set(knownUnitIds);
  function visit(id: string): void {
    if (visiting.has(id)) throw new KernelError('scheduler dependency cycle');
    if (visited.has(id)) return;
    const unit = byId.get(id);
    if (unit === undefined) {
      if (known.has(id)) return;
      throw new KernelError('scheduler unknown dependency');
    }
    visiting.add(id);
    for (const dependency of unit.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const unit of units) visit(unit.id);
}

export function validateEvidence(value: unknown, unit: Pick<WorkflowUnit, 'contractRevision' | 'requiredChecks'>): asserts value is UnitEvidence {
  if (!isRecord(value)) throw new KernelError('scheduler integration requires evidence');
  requireKeys(value, ['sourceRevision', 'contractRevision', 'checks', 'artifacts']);
  requireMetadata(value.sourceRevision, 'source revision');
  requireMetadata(value.contractRevision, 'evidence contract revision');
  requireStrings(value.checks, 'evidence checks');
  requireStrings(value.artifacts, 'evidence artifacts');
  for (const check of value.checks) requireMetadata(check, 'evidence check');
  for (const artifact of value.artifacts) requireMetadata(artifact, 'evidence artifact');
  const checks = value.checks;
  if (value.contractRevision !== unit.contractRevision || value.artifacts.length === 0 || !unit.requiredChecks.every(check => checks.includes(check))) {
    throw new KernelError('scheduler evidence does not cover the frozen unit contract');
  }
}

export function validateEvent(value: unknown): asserts value is SchedulerEvent {
  if (!isRecord(value) || !['started', 'returned', 'integrated', 'failed', 'blocked', 'resumed', 'cancelled'].includes(String(value.kind))) throw new KernelError('scheduler invalid event');
  requireKeys(value, ['kind', 'unitId', 'revision', 'timestampMs', 'handle', 'reason', 'evidence']);
  requireMetadata(value.unitId, 'event unit id');
  requireCount(value.revision, 'event revision');
  requireCount(value.timestampMs, 'event timestamp');
  if (value.handle !== undefined) requireMetadata(value.handle, 'event handle');
  if (value.reason !== undefined) {
    requireText(value.reason, 'event reason');
    if (value.reason.startsWith('dependency:')) throw new KernelError('scheduler dependency reason namespace is reserved');
  }
  if (value.evidence !== undefined) {
    if (!isRecord(value.evidence)) throw new KernelError('scheduler invalid event evidence');
    requireMetadata(value.evidence.contractRevision, 'evidence contract revision');
    validateEvidence(value.evidence, {contractRevision: value.evidence.contractRevision, requiredChecks: []});
  }
}

export function capacity(state: SchedulerState, regs: Registries): number {
  const policyCap = regs.policy.parallelism.wave_concurrency_cap;
  requireCount(policyCap, 'policy capacity');
  return Math.min(policyCap, state.hostCapacity);
}

export function validateState(value: unknown, regs: Registries): asserts value is SchedulerState {
  if (!isRecord(value) || value.version !== 1) throw new KernelError('scheduler invalid state version');
  requireKeys(value, ['version', 'runId', 'revision', 'timestampMs', 'hostCapacity', 'planningOpen', 'units']);
  if (value.planningOpen !== undefined && typeof value.planningOpen !== 'boolean') throw new KernelError('scheduler invalid planning flag');
  requireMetadata(value.runId, 'run id');
  requireCount(value.revision, 'revision');
  requireCount(value.timestampMs, 'timestamp');
  requireCount(value.hostCapacity, 'host capacity');
  validateUnits(value.units, true);
  const units: ScheduledUnit[] = [];
  for (const unit of value.units) { validateScheduled(unit, regs); units.push(unit); }
  const state: SchedulerState = {version: 1, runId: value.runId, revision: value.revision, timestampMs: value.timestampMs, hostCapacity: value.hostCapacity, units};
  const active = state.units.filter(unit => unit.state === 'running' || unit.state === 'returned');
  if (active.length > capacity(state, regs)) throw new KernelError('scheduler active ownership exceeds capacity');
  if (new Set(active.map(unit => unit.handle)).size !== active.length) throw new KernelError('scheduler duplicate active handles');
  for (const [index, unit] of active.entries()) {
    if (active.slice(index + 1).some(other => scopesOverlap(unit.files, other.files))) throw new KernelError('scheduler active ownership overlaps');
  }
  const byId = new Map(state.units.map(unit => [unit.id, unit]));
  for (const unit of state.units) {
    if (unit.reason?.startsWith('dependency:') && !unit.dependsOn.some(id => ['failed', 'blocked', 'cancelled'].some(status => unit.reason === `dependency:${id}:${status}`))) {
      throw new KernelError('scheduler invalid derived dependency blocker');
    }
    if (['running', 'returned', 'integrated'].includes(unit.state) && unit.dependsOn.some(id => byId.get(id)?.state !== 'integrated')) throw new KernelError('scheduler unit bypasses dependencies');
  }
}

function validateScheduled(value: unknown, regs: Registries): asserts value is ScheduledUnit {
  if (!isRecord(value) || !['planned', 'ready', 'running', 'returned', 'integrated', 'blocked', 'failed', 'cancelled'].includes(String(value.state))) throw new KernelError('scheduler invalid unit state');
  requireCount(value.attempts, 'attempts');
  if (value.attempts > regs.policy.retry.max_attempts_per_unit) throw new KernelError('scheduler attempts exceed retry policy');
  if (value.reason !== null) requireText(value.reason, 'unit reason');
  if (value.handle !== null) requireMetadata(value.handle, 'unit handle');
  if (['running', 'returned', 'integrated', 'failed'].includes(String(value.state)) && value.attempts === 0) throw new KernelError('scheduler unit state requires an attempt');
  if (['running', 'returned'].includes(String(value.state)) && value.handle === null) throw new KernelError('scheduler active unit requires handle');
  if (['planned', 'ready'].includes(String(value.state)) && value.handle !== null) throw new KernelError('scheduler pending unit cannot own handle');
  if (['failed', 'blocked', 'cancelled'].includes(String(value.state)) && value.reason === null) throw new KernelError('scheduler terminal or blocked unit requires reason');
  if (value.state === 'integrated') {
    requireText(value.contractRevision, 'contract revision');
    requireStrings(value.requiredChecks, 'required checks');
    validateEvidence(value.evidence, {contractRevision: value.contractRevision, requiredChecks: value.requiredChecks});
  } else if (value.evidence !== null) throw new KernelError('scheduler evidence only accepted at integration');
}
