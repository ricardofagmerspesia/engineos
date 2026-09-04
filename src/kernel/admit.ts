import { KernelError } from '../lib/json';
import type { Registries } from './context';

// Backpressure: may one more unit be dispatched right now? Capacity is
// registries/policy.json .parallelism.wave_concurrency_cap — the same number the
// wave cap is, never a second copy of it — and the queue bound and the overload
// action live in .parallelism.backpressure. rules/parallelism.md "Backpressure"
// is the prose mirror; C24 guards both.
export interface AdmitFacts {
  inflight: number;
  queued: number;
}

// cmd_admit's key order: action, capacity, reason. `action` is registry data on
// the middle branch (backpressure.overload_action), so it is a string rather
// than a union spelled here.
export interface AdmitSection {
  action: string;
  capacity: number;
  reason: string;
}

export function admitSection(facts: AdmitFacts, regs: Registries): AdmitSection {
  // The bash arm's digits-only guards, in its order: a count that is not a
  // whole non-negative number is refused before any policy is read, because a
  // negative or fractional load makes the capacity arithmetic below answer for
  // a fleet that cannot exist.
  requireCount(facts.inflight, 'inflight');
  requireCount(facts.queued, 'queued');

  const parallelism = regs.policy.parallelism;
  const backpressure = parallelism.backpressure;

  // The overload action is DATA, so it is checked against the registry's own
  // declared vocabulary rather than against a second list spelled here. The
  // typed loader proves the three fields exist and have the right types; it
  // does not prove this one is a member, and a non-member was emitted verbatim
  // at exit 0 by the bash arm before its guard landed — an action nothing in
  // EngineOS can execute.
  if (!backpressure.actions.includes(backpressure.overload_action)) {
    throw new KernelError(
      'policy.json parallelism.backpressure.overload_action is not one of the declared backpressure.actions — admit will not emit an action the registry does not declare',
    );
  }

  const cap = parallelism.wave_concurrency_cap;
  const maxQueued = backpressure.max_queued_units;
  const capacity = cap - facts.inflight;

  if (capacity > 0) {
    return {
      action: 'dispatch',
      capacity,
      reason: `inflight ${facts.inflight} below cap ${cap}`,
    };
  }
  if (facts.queued < maxQueued) {
    return {
      action: backpressure.overload_action,
      capacity: 0,
      reason: `cap ${cap} reached; ${facts.queued} of ${maxQueued} queued — hold the unit for the next wave`,
    };
  }
  // C26d greps this file for the `hitl: budget-exhausted` literal: reject is a
  // HITL reason (rules/risk-autonomy.md), not a retry, and the reason string is
  // where an orchestrator reads that.
  return {
    action: 'reject',
    capacity: 0,
    reason: `cap ${cap} reached and queue full (${facts.queued}/${maxQueued}) — stop planning, report BLOCKED, re-plan with a human (hitl: budget-exhausted)`,
  };
}

function requireCount(value: number, flag: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new KernelError(`admit requires a numeric --${flag}`);
  }
}
