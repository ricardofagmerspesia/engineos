import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { isRecord } from '../lib/json';
import type { UnitEvidence, WorkflowEvent } from '../workflow/contracts';

export const WORKFLOW_INPUT_LIMIT_BYTES = 4 * 1024 * 1024;
const MAX_EVENTS = 10_000;
const EVENT_KEYS = new Set(['version', 'runId', 'sequence', 'timestampMs', 'kind', 'unitId', 'owner', 'reason', 'evidence', 'calls', 'tokensIn', 'tokensOut', 'costMicros']);
const EVIDENCE_KEYS = new Set(['sourceRevision', 'contractRevision', 'checks', 'artifacts']);

export class WorkflowInputError extends Error {
  readonly kind = 'workflow-input';
}

function invalid(field: string): never {
  throw new WorkflowInputError(`invalid workflow ${field}`);
}

function metadata(value: unknown, field: string): string {
  // Identifiers and context pointers only: never record prompts or secret values.
  // This constrains shape, not sensitivity; producers must exclude secrets.
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9@_./:-]+$/.test(value)) invalid(field);
  return value;
}

function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(field);
  return value;
}

function pointers(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 256) invalid(field);
  return value.map((item: unknown) => metadata(item, field));
}

function evidence(value: unknown): UnitEvidence {
  if (!isRecord(value) || Object.keys(value).some((key) => !EVIDENCE_KEYS.has(key))) invalid('evidence');
  return {
    sourceRevision: metadata(value['sourceRevision'], 'sourceRevision'),
    contractRevision: metadata(value['contractRevision'], 'contractRevision'),
    checks: pointers(value['checks'], 'checks'),
    artifacts: pointers(value['artifacts'], 'artifacts'),
  };
}

function eventKind(value: unknown): WorkflowEvent['kind'] {
  switch (value) {
    case 'run-started': case 'unit-planned': case 'unit-ready': case 'unit-started': case 'unit-returned':
    case 'unit-integrated': case 'unit-blocked': case 'unit-failed': case 'unit-cancelled':
    case 'review-completed': case 'check-completed': case 'useful-result':
    case 'model-usage': case 'run-completed': return value;
    default: return invalid('kind');
  }
}

function parseEvent(value: unknown): WorkflowEvent {
  if (!isRecord(value) || Object.keys(value).some((key) => !EVENT_KEYS.has(key)) || value['version'] !== 1) invalid('event');
  const kind = eventKind(value['kind']);
  const event: WorkflowEvent = {
    version: 1, kind,
    runId: metadata(value['runId'], 'runId'),
    sequence: count(value['sequence'], 'sequence'),
    timestampMs: count(value['timestampMs'], 'timestampMs'),
  };
  if (value['unitId'] !== undefined) event.unitId = metadata(value['unitId'], 'unitId');
  if (kind.startsWith('unit-') || kind === 'review-completed' || kind === 'check-completed') {
    if (event.unitId === undefined) invalid('unitId');
  }
  if (value['owner'] !== undefined) event.owner = metadata(value['owner'], 'owner');
  if (value['reason'] !== undefined) event.reason = metadata(value['reason'], 'reason');
  if (value['evidence'] !== undefined) event.evidence = evidence(value['evidence']);
  if (kind === 'useful-result' && (event.evidence === undefined || event.evidence.checks.length === 0 || event.evidence.artifacts.length === 0)) invalid('useful-result evidence');
  for (const field of ['calls', 'tokensIn', 'tokensOut', 'costMicros']) {
    if (value[field] !== undefined && kind !== 'model-usage') invalid('usage kind');
  }
  if (value['calls'] !== undefined) event.calls = count(value['calls'], 'calls');
  if (value['tokensIn'] !== undefined) event.tokensIn = count(value['tokensIn'], 'tokensIn');
  if (value['tokensOut'] !== undefined) event.tokensOut = count(value['tokensOut'], 'tokensOut');
  if (value['costMicros'] !== undefined) event.costMicros = count(value['costMicros'], 'costMicros');
  if (Buffer.byteLength(JSON.stringify(event)) > 64 * 1024) invalid('event size');
  return event;
}

export function parseWorkflowEvents(value: unknown): WorkflowEvent[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVENTS) invalid('events');
  const events = value.map((item: unknown) => parseEvent(item));
  if (Buffer.byteLength(JSON.stringify(events)) > WORKFLOW_INPUT_LIMIT_BYTES) invalid('input size');
  const first = events[0];
  if (first === undefined || first.kind !== 'run-started') invalid('run start');
  let previous = first;
  for (let index = 1; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined || event.runId !== first.runId || event.sequence <= previous.sequence || event.timestampMs < previous.timestampMs) invalid('event ordering');
    if (event.kind === 'run-started' || previous.kind === 'run-completed') invalid('run lifecycle');
    previous = event;
  }
  return events;
}

export function parseWorkflowText(text: string): WorkflowEvent[] {
  if (Buffer.byteLength(text) > WORKFLOW_INPUT_LIMIT_BYTES) invalid('input size');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    try {
      value = text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line): unknown => JSON.parse(line));
    } catch { return invalid('JSON'); }
  }
  return parseWorkflowEvents(Array.isArray(value) ? value : [value]);
}

export function loadWorkflowEvents(path: string): WorkflowEvent[] {
  let descriptor: number;
  try { descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK); } catch { throw new WorkflowInputError('cannot read workflow input'); }
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > WORKFLOW_INPUT_LIMIT_BYTES) invalid('input file');
    return parseWorkflowText(readFileSync(descriptor, 'utf8'));
  } catch (error) {
    if (error instanceof WorkflowInputError) throw error;
    throw new WorkflowInputError('cannot read workflow input');
  } finally { closeSync(descriptor); }
}

export function appendWorkflowEvent(path: string, value: WorkflowEvent): void {
  const event = parseEvent(value);
  // One caller owns this journal; concurrent producers must serialize appends.
  parseWorkflowEvents([...(existsSync(path) ? loadWorkflowEvents(path) : []), event]);
  const line = `${JSON.stringify(event)}\n`;
  if (Buffer.byteLength(line) > 64 * 1024) invalid('event size');
  // Explicit caller-owned file only. Event identifiers never become filesystem paths.
  let descriptor: number;
  try { descriptor = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600); }
  catch { throw new WorkflowInputError('cannot append workflow event'); }
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size + Buffer.byteLength(line) > WORKFLOW_INPUT_LIMIT_BYTES) invalid('journal file');
    writeFileSync(descriptor, line, 'utf8');
  } catch (error) {
    if (error instanceof WorkflowInputError) throw error;
    throw new WorkflowInputError('cannot append workflow event');
  } finally { closeSync(descriptor); }
}
