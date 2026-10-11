import { parseWhen, type When } from '../kernel/table';
import { strictReader } from './strict';

// The decision-table rows of registries/policy.json (T10, commit 653ca01): the
// backpressure ladder, the repair ladder and its answers, the infra patterns,
// the breaker transitions and the hitl reason table. The loader proves only the
// row SHAPE — a `when` parses into conditions, an enum field is a member. Which
// facts, sets and placeholders a row may name is the arm's vocabulary, held to
// the registry by the C20/C24/C25/C26 schema checks, and evaluated fail-closed
// by src/kernel/table.ts at answer time.
//
// table.ts imports only src/lib, so this is a leaf import, never a cycle.

export interface AdmitRow {
  when: When;
  action: string;
  capacity: 'remaining' | 'none';
  reason: string;
}

// action and reason are null on the `red` row on purpose: the red ladder needs
// an attempt count, which the situation form never carries (src/kernel/repair.ts).
export interface RepairSituation {
  situation: string;
  response: string;
  action: string | null;
  reason: string | null;
}

export interface RepairAnswer {
  action: string;
  reason: string;
}

export interface RepairLadderRow {
  when: When;
  action: string;
  reason: string;
}

export type InfraPatternReason = 'target-absent' | 'runner-missing';

export interface InfraPattern {
  runner: string;
  pattern: string;
  reason: InfraPatternReason;
}

export interface BreakerTransition {
  from: string;
  guard: When;
  to: string;
  allow: boolean;
  reason: string;
}

export interface HitlReasonRow {
  reason: string;
  when: When;
}

const { malformed, requireRecord, requireString, requireBoolean, optionalString, requireRows } = strictReader('policy.json');

export function parseAdmitRows(value: unknown, at: string): AdmitRow[] {
  return nonEmptyRows(value, at).map((row, i) => ({
    when: requireWhen(row['when'], `${at}[${i}].when`),
    action: requireString(row['action'], `${at}[${i}].action`),
    capacity: capacity(row['capacity'], `${at}[${i}].capacity`),
    reason: requireString(row['reason'], `${at}[${i}].reason`),
  }));
}

export function parseSituations(value: unknown, at: string): RepairSituation[] {
  return requireRows(value, at).map((row, i) => {
    const action = optionalString(row['action'], `${at}[${i}].action`);
    const reason = optionalString(row['reason'], `${at}[${i}].reason`);
    // Half an answer is neither an answer nor the deliberate red-row absence.
    if ((action === null) !== (reason === null)) malformed(`${at}[${i}] must carry both action and reason, or neither`);
    return {
      situation: requireString(row['situation'], `${at}[${i}].situation`),
      response: requireString(row['response'], `${at}[${i}].response`),
      action,
      reason,
    };
  });
}

export function parseRepairAnswer(value: unknown, at: string): RepairAnswer {
  const answer = requireRecord(value, at);
  return { action: requireString(answer['action'], `${at}.action`), reason: requireString(answer['reason'], `${at}.reason`) };
}

export function parseLadder(value: unknown, at: string): RepairLadderRow[] {
  return nonEmptyRows(value, at).map((row, i) => ({
    when: requireWhen(row['when'], `${at}[${i}].when`),
    action: requireString(row['action'], `${at}[${i}].action`),
    reason: requireString(row['reason'], `${at}[${i}].reason`),
  }));
}

export function parseInfraPatterns(value: unknown, at: string): InfraPattern[] {
  return nonEmptyRows(value, at).map((row, i) => ({
    runner: requireString(row['runner'], `${at}[${i}].runner`),
    pattern: requireString(row['pattern'], `${at}[${i}].pattern`),
    reason: infraReason(row['reason'], `${at}[${i}].reason`),
  }));
}

export function parseTransitions(value: unknown, at: string): BreakerTransition[] {
  return nonEmptyRows(value, at).map((row, i) => ({
    from: requireString(row['from'], `${at}[${i}].from`),
    guard: requireWhen(row['guard'], `${at}[${i}].guard`),
    to: requireString(row['to'], `${at}[${i}].to`),
    allow: requireBoolean(row['allow'], `${at}[${i}].allow`),
    reason: requireString(row['reason'], `${at}[${i}].reason`),
  }));
}

export function parseReasonTable(value: unknown, at: string): HitlReasonRow[] {
  return nonEmptyRows(value, at).map((row, i) => ({
    reason: requireString(row['reason'], `${at}[${i}].reason`),
    when: requireWhen(row['when'], `${at}[${i}].when`),
  }));
}

// An empty table answers nothing, and the FIRST arms throw on a load they have
// no row for; refusing it here names the file instead of the arm.
function nonEmptyRows(value: unknown, at: string): Record<string, unknown>[] {
  const rows = requireRows(value, at);
  if (rows.length === 0) malformed(`${at} must not be empty`);
  return rows;
}

function requireWhen(value: unknown, path: string): When {
  const when = parseWhen(value);
  return typeof when === 'string' ? malformed(`${path} ${when}`) : when;
}

function capacity(value: unknown, path: string): AdmitRow['capacity'] {
  const text = requireString(value, path);
  if (text === 'remaining' || text === 'none') return text;
  return malformed(`${path} must be remaining or none`);
}

function infraReason(value: unknown, path: string): InfraPatternReason {
  const text = requireString(value, path);
  if (text === 'target-absent' || text === 'runner-missing') return text;
  return malformed(`${path} must be target-absent or runner-missing`);
}
