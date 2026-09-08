import { KernelError } from '../lib/json';
import type { Registries } from './context';

// The red-ladder half of rules/parallelism.md's failure policy: never-repair
// situations first (they escalate to a human on the FIRST occurrence), then the
// bounded fix loop whose numbers are registries/policy.json .repair data.
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

interface SituationAnswer {
  action: string;
  reason: string;
}

// Keyed by the `response` of registries/policy.json .repair.by_situation, so the
// registry decides which situations have a non-ladder answer and this table only
// carries the prose. `fix-attempt-ladder` (the `red` situation) has no entry on
// purpose: the ladder needs an attempt count, which the situation form never
// carries, so naming it as a situation is an error rather than an answer.
const BY_RESPONSE: Record<string, SituationAnswer> = {
  'report-tooling-gap-no-attempt-consumed': {
    action: 'report-tooling-gap',
    reason:
      'the check could not run — that is a tooling gap, not a code defect; report it, consume no fix attempt (hooks/stop-verify.sh: never block on infra quirks)',
  },
  'fix-or-delete-never-rerun-until-green': {
    action: 'fix-or-delete',
    reason:
      'green on re-run with no diff is a broken test, not a pass — fix or delete within the week, never retry-until-green (rules/testing.md)',
  },
};

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
      return {
        check,
        action: 'never-repair',
        reason: `situation ${situation} is on the never-repair list — a fix that weakens the check or changes behavior is not a fix; escalate to a human on the first occurrence`,
      };
    }
    const row = repair.by_situation.find((entry) => entry.situation === situation);
    const answer = row === undefined ? undefined : BY_RESPONSE[row.response];
    if (answer === undefined) throw new KernelError(`unknown situation: ${situation}`);
    return { check, action: answer.action, reason: answer.reason };
  }

  const attempt = facts.attempt;
  if (attempt === undefined || !Number.isInteger(attempt) || attempt < 0) {
    throw new KernelError('repair (red ladder) requires a numeric --attempt');
  }
  const bound = repair.max_fix_attempts_per_check;
  if (attempt < bound) {
    return {
      check,
      action: 'fix-same-tier',
      reason: 'first red — fix and re-run the check at the same tier',
    };
  }
  if (attempt < bound + repair.escalations) {
    return {
      check,
      action: 'escalate-one-tier',
      reason:
        'the same check failed twice — escalate one model tier for the fix and re-run once; that is the last attempt (rules/models.md)',
    };
  }
  return {
    check,
    action: 'stop-report-red',
    reason:
      'the bound is exhausted — stop, report the check red with what was tried; a loop continued past this point is sampling until it looks right, not fixing (rules/parallelism.md)',
  };
}
