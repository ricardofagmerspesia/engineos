import { KernelError } from '../lib/json';
import type { Registries } from './context';
import { evaluateFirst, fillTemplate } from './table';

// The red-ladder half of rules/parallelism.md's failure policy: never-repair
// situations first (they escalate to a human on the FIRST occurrence), then the
// bounded fix loop. The numbers, the ladder rows and every answer's prose are
// registries/policy.json .repair data; this module measures the facts.
export interface RepairFacts {
  check: string;
  attempt?: number;
  situation?: string;
}

// cmd_repair's key order: check, action, reason.
export interface RepairSection {
  check: string;
  action: string;
  reason: string;
}

// The facts a .repair.ladder row may test, and the one slot the never-repair
// answer may use; the C20 schema check holds the registry to both.
export const LADDER_FACTS = ['within_fix_attempts', 'within_escalations'] as const;
export const NEVER_REPAIR_PLACEHOLDERS = ['situation'] as const;

export function repairSection(facts: RepairFacts, regs: Registries): RepairSection {
  const repair = regs.policy.repair;
  const check = facts.check;
  if (check === '') throw new KernelError('repair requires --check');
  if (!repair.checks.includes(check)) {
    throw new KernelError(`unknown check: ${check} (must be one of policy.json.repair.checks)`);
  }

  const situation = facts.situation;
  if (situation !== undefined && situation !== '') {
    // never-repair wins over every other reading of the situation, and over the
    // attempt count: a fix that weakens the check is not a fix at any attempt.
    if (repair.never_repair.includes(situation)) {
      const answer = repair.never_repair_answer;
      return { check, action: answer.action, reason: fillTemplate(answer.reason, { situation }) };
    }
    // A situation answers only through a by_situation row that carries its own
    // action and reason. `red` (fix-attempt-ladder) carries neither on purpose:
    // the ladder needs an attempt count, which the situation form never
    // carries, so naming it as a situation is an error rather than an answer.
    const row = repair.by_situation.find((entry) => entry.situation === situation);
    if (row === undefined || row.action === null || row.reason === null) {
      throw new KernelError(`unknown situation: ${situation}`);
    }
    return { check, action: row.action, reason: row.reason };
  }

  const attempt = facts.attempt;
  if (attempt === undefined || !Number.isInteger(attempt) || attempt < 0) {
    throw new KernelError('repair (red ladder) requires a numeric --attempt');
  }
  const bound = repair.max_fix_attempts_per_check;
  const measured: Record<(typeof LADDER_FACTS)[number], boolean> = {
    within_fix_attempts: attempt < bound,
    within_escalations: attempt < bound + repair.escalations,
  };
  const rung = evaluateFirst(repair.ladder, { facts: measured });
  if (rung === undefined) {
    throw new KernelError('policy.json repair.ladder has no rung for this attempt — the ladder must end in a row with an empty when');
  }
  return { check, action: rung.action, reason: rung.reason };
}
