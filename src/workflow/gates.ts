// Pure admission only. The host obtains actual human consent; facts do not
// authenticate a user and environment/repository markers never supply consent.
import { createHash } from 'node:crypto';
import { isSimpleTaskEligible, parseExecutionFacts } from '../kernel/execution';
import { isRecord, KernelError } from '../lib/json';
import type { ExecutionFacts, SchedulerState, UnitState } from './contracts';

export interface WorkflowGateFacts {
  taskId?: string;
  scopeRevision?: string;
  sourceRevision?: string;
  phase?: 'planning' | 'implementation' | 'final';
  integrated?: boolean;
  execution?: ExecutionFacts;
  completion?: {scopeRevision: string; sourceRevision: string; requiredTicketIds: string[]; tickets: {id: string; state: UnitState}[]; unfinishedCorrections: boolean; planningOpen?: boolean};
  preview?: {choice?: 'pending' | 'declined' | 'selected'; scopeRevision?: string; artifactRevision?: string; approvedArtifactRevision?: string};
  validation?: {decision?: 'pending' | 'declined' | 'approved'; scopeRevision?: string; sourceRevision?: string; checks?: string[]; requestedAtPhase?: 'final'};
}
export interface WorkflowGateDecision {productionAllowed: boolean; validationAllowed: boolean; reasons: string[]}
export interface HostValidationApproval {facts: unknown; taskId: string; scopeRevision: string; sourceRevision: string; checks: string[]; files: string[]}
export interface HostProductionApproval {facts: unknown; taskId: string}

function object(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).some(key => !keys.includes(key))) throw new KernelError(`${name}: expected exact known fact keys`);
  return value;
}
function token(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) throw new KernelError(`${name}: expected bounded revision/id token`);
  return value;
}
function oneOf<T extends string>(value: unknown, values: readonly T[], name: string): T {
  const selected = values.find(candidate => candidate === value);
  if (selected === undefined) throw new KernelError(`${name}: invalid choice`);
  return selected;
}
function checks(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 64) throw new KernelError('validation.checks: expected at most 64 check ids');
  const parsed = value.map(item => token(item, 'validation.checks'));
  if (new Set(parsed).size !== parsed.length) throw new KernelError('validation.checks: duplicate check ids');
  return parsed;
}
export function parseWorkflowGateFacts(value: unknown): WorkflowGateFacts {
  const row = object(value, ['taskId', 'scopeRevision', 'sourceRevision', 'phase', 'integrated', 'execution', 'completion', 'preview', 'validation'], 'workflow-gate');
  const facts: WorkflowGateFacts = {};
  if (row['taskId'] !== undefined) facts.taskId = token(row['taskId'], 'taskId');
  if (row['scopeRevision'] !== undefined) facts.scopeRevision = token(row['scopeRevision'], 'scopeRevision');
  if (row['sourceRevision'] !== undefined) facts.sourceRevision = token(row['sourceRevision'], 'sourceRevision');
  if (row['phase'] !== undefined) facts.phase = oneOf(row['phase'], ['planning', 'implementation', 'final'], 'phase');
  if (row['integrated'] !== undefined) {
    if (typeof row['integrated'] !== 'boolean') throw new KernelError('integrated: expected boolean');
    facts.integrated = row['integrated'];
  }
  if (row['execution'] !== undefined) facts.execution = parseExecutionFacts(row['execution']);
  if (row['completion'] !== undefined) {
    const entry = object(row['completion'], ['scopeRevision', 'sourceRevision', 'requiredTicketIds', 'tickets', 'unfinishedCorrections', 'planningOpen'], 'completion');
    if (!Array.isArray(entry['requiredTicketIds']) || entry['requiredTicketIds'].length === 0 || entry['requiredTicketIds'].length > 1000) throw new KernelError('completion.requiredTicketIds: expected 1-1000 implementation ticket ids');
    const requiredTicketIds = entry['requiredTicketIds'].map(item => token(item, 'completion.requiredTicketIds'));
    if (new Set(requiredTicketIds).size !== requiredTicketIds.length) throw new KernelError('completion.requiredTicketIds: duplicate ticket ids');
    if (!Array.isArray(entry['tickets']) || entry['tickets'].length === 0 || entry['tickets'].length > 1000) throw new KernelError('completion.tickets: expected 1-1000 implementation tickets');
    const tickets = entry['tickets'].map(item => {
      const ticket = object(item, ['id', 'state'], 'completion.tickets');
      return {
        id: token(ticket['id'], 'completion.tickets.id'),
        state: oneOf(ticket['state'], ['planned', 'ready', 'running', 'returned', 'integrated', 'blocked', 'failed', 'cancelled'], 'completion.tickets.state'),
      };
    });
    if (new Set(tickets.map(ticket => ticket.id)).size !== tickets.length) throw new KernelError('completion.tickets: duplicate ticket ids');
    if (typeof entry['unfinishedCorrections'] !== 'boolean') throw new KernelError('completion.unfinishedCorrections: expected boolean');
    if (entry['planningOpen'] !== undefined && typeof entry['planningOpen'] !== 'boolean') throw new KernelError('completion.planningOpen: expected boolean');
    // Only implementation units belong here: requiring final proof would make its own admission circular.
    facts.completion = {
      scopeRevision: token(entry['scopeRevision'], 'completion.scopeRevision'),
      sourceRevision: token(entry['sourceRevision'], 'completion.sourceRevision'),
      requiredTicketIds,
      tickets,
      unfinishedCorrections: entry['unfinishedCorrections'],
    };
    if (typeof entry['planningOpen'] === 'boolean') facts.completion.planningOpen = entry['planningOpen'];
  }
  if (row['preview'] !== undefined) {
    const entry = object(row['preview'], ['choice', 'scopeRevision', 'artifactRevision', 'approvedArtifactRevision'], 'preview');
    facts.preview = {};
    if (entry['choice'] !== undefined) facts.preview.choice = oneOf(entry['choice'], ['pending', 'declined', 'selected'], 'preview.choice');
    if (entry['scopeRevision'] !== undefined) facts.preview.scopeRevision = token(entry['scopeRevision'], 'preview.scopeRevision');
    if (entry['artifactRevision'] !== undefined) facts.preview.artifactRevision = token(entry['artifactRevision'], 'preview.artifactRevision');
    if (entry['approvedArtifactRevision'] !== undefined) facts.preview.approvedArtifactRevision = token(entry['approvedArtifactRevision'], 'preview.approvedArtifactRevision');
  }
  if (row['validation'] !== undefined) {
    const entry = object(row['validation'], ['decision', 'scopeRevision', 'sourceRevision', 'checks', 'requestedAtPhase'], 'validation');
    facts.validation = {};
    if (entry['decision'] !== undefined) facts.validation.decision = oneOf(entry['decision'], ['pending', 'declined', 'approved'], 'validation.decision');
    if (entry['scopeRevision'] !== undefined) facts.validation.scopeRevision = token(entry['scopeRevision'], 'validation.scopeRevision');
    if (entry['sourceRevision'] !== undefined) facts.validation.sourceRevision = token(entry['sourceRevision'], 'validation.sourceRevision');
    if (entry['checks'] !== undefined) facts.validation.checks = checks(entry['checks']);
    if (entry['requestedAtPhase'] !== undefined) facts.validation.requestedAtPhase = oneOf(entry['requestedAtPhase'], ['final'], 'validation.requestedAtPhase');
  }
  return facts;
}
export function evaluateWorkflowGate(value: unknown): WorkflowGateDecision {
  let facts: WorkflowGateFacts;
  try { facts = parseWorkflowGateFacts(value); } catch (error) {
    if (!(error instanceof KernelError)) throw error;
    return {productionAllowed: false, validationAllowed: false, reasons: [error.message]};
  }
  const reasons: string[] = [];
  const preview = facts.preview;
  const execution = facts.execution;
  const simpleEligible = execution !== undefined && isSimpleTaskEligible(execution, 2);
  const currentSpecChoice = facts.scopeRevision !== undefined && execution !== undefined && execution.scopeRevision === facts.scopeRevision
    && execution.specChoiceScopeRevision === facts.scopeRevision;
  const simpleDirect = simpleEligible && currentSpecChoice && execution?.specChoice === 'direct';
  const previewApproved = facts.scopeRevision !== undefined && preview !== undefined && preview.scopeRevision === facts.scopeRevision
    && (preview.choice === 'declined' || (preview.choice === 'selected' && preview.artifactRevision !== undefined && preview.approvedArtifactRevision === preview.artifactRevision));
  // A preview decision cannot replace the unresolved or stale simple-task planning choice.
  const productionAdmission = simpleEligible
    ? simpleDirect || (currentSpecChoice && execution?.specChoice === 'spec' && previewApproved)
    : previewApproved;
  const productionAllowed = facts.taskId !== undefined && facts.scopeRevision !== undefined && facts.sourceRevision !== undefined
    && (facts.phase === 'implementation' || facts.phase === 'final') && productionAdmission;
  if (!productionAllowed) reasons.push('current task/scope/source and eligible scope-bound direct choice or explicit preview decision required');
  const validation = facts.validation;
  const completion = facts.completion;
  // The host supplies the authoritative approved graph; matching sets check its attestation, not human identity.
  const requiredTicketIds = new Set(completion?.requiredTicketIds);
  const implementationComplete = completion !== undefined && completion.scopeRevision === facts.scopeRevision
    && completion.sourceRevision === facts.sourceRevision && !completion.unfinishedCorrections && completion.planningOpen !== true
    && completion.tickets.length === requiredTicketIds.size
    && completion.tickets.every(ticket => requiredTicketIds.has(ticket.id) && ticket.state === 'integrated');
  const validationAllowed = productionAllowed && facts.phase === 'final' && facts.integrated === true
    && implementationComplete && validation?.decision === 'approved' && validation.requestedAtPhase === 'final' && validation.scopeRevision === facts.scopeRevision
    && validation.sourceRevision === facts.sourceRevision && validation.checks !== undefined && validation.checks.length > 0;
  if (!validationAllowed) reasons.push('exact approved implementation ticket set integrated at current scope/source without corrections, final prompt and exact approved checks required');
  return {productionAllowed, validationAllowed, reasons};
}
export function schedulerScopeRevision(state: SchedulerState): string {
  const graph = state.units.map(unit => ({id: unit.id, dependsOn: [...unit.dependsOn].sort(), files: [...unit.files].sort(), agent: unit.agent, modelTier: unit.modelTier, contractRevision: unit.contractRevision, requiredChecks: [...unit.requiredChecks].sort()})).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return `sha256:${createHash('sha256').update(JSON.stringify(graph)).digest('hex')}`;
}
export function validationScopeRevision(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) throw new KernelError('validation files: expected 1-1000 canonical relative files');
  const files = value.map(item => {
    if (typeof item !== 'string' || item.length > 1024 || !/^[A-Za-z0-9_.@/-]+$/.test(item) || item.split('/').some(part => part === '' || part === '.' || part === '..')) throw new KernelError('validation files: expected canonical repository-relative files');
    return item;
  });
  if (new Set(files).size !== files.length) throw new KernelError('validation files: duplicates');
  return `sha256:${createHash('sha256').update(JSON.stringify(files.sort())).digest('hex')}`;
}
export function requireHostValidation(approval: HostValidationApproval | undefined): WorkflowGateFacts {
  if (!isRecord(approval)) throw new KernelError('final host approval required');
  const facts = parseWorkflowGateFacts(approval.facts);
  const requested = checks(approval.checks);
  if (validationScopeRevision(approval.files) !== approval.scopeRevision) throw new KernelError('final host approval file scope revision is stale');
  if (!evaluateWorkflowGate(facts).validationAllowed || facts.taskId !== token(approval.taskId, 'host.taskId') || facts.scopeRevision !== token(approval.scopeRevision, 'host.scopeRevision') || facts.sourceRevision !== token(approval.sourceRevision, 'host.sourceRevision') || JSON.stringify([...(facts.validation?.checks ?? [])].sort()) !== JSON.stringify([...requested].sort())) throw new KernelError('final host approval is absent, stale or outside approved check scope');
  return facts;
}
