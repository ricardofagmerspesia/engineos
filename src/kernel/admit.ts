import { KernelError } from '../lib/json';
import type { Registries } from './context';
import { evaluateFirst, fillTemplate } from './table';

// Backpressure: may one more unit be dispatched right now? Capacity is
// registries/policy.json .parallelism.wave_concurrency_cap — the same number the
// wave cap is, never a second copy of it — and the queue bound, the overload
// action and the answer ladder (.rows, a FIRST table) live in
// .parallelism.backpressure. rules/parallelism.md "Backpressure" is the prose
// mirror; C24 guards both.
export interface AdmitFacts {
  inflight: number;
  queued: number;
}

// cmd_admit's key order: action, capacity, reason. `action` is registry data, so
// it is a string rather than a union spelled here.
export interface AdmitSection {
  action: string;
  capacity: number;
  reason: string;
}

// The facts a backpressure row may test and the slots its action and reason may
// use; the C24 schema check holds policy.parallelism.backpressure.rows to both.
export const ADMIT_FACTS = ['capacity_available', 'queue_has_room'] as const;
export const ADMIT_PLACEHOLDERS = ['inflight', 'queued', 'cap', 'max_queued_units', 'overload_action'] as const;

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
  const measured: Record<(typeof ADMIT_FACTS)[number], boolean> = {
    capacity_available: capacity > 0,
    queue_has_room: facts.queued < maxQueued,
  };
  const row = evaluateFirst(backpressure.rows, { facts: measured });
  if (row === undefined) {
    throw new KernelError(
      'policy.json parallelism.backpressure.rows has no row for this load — the ladder must end in a row with an empty when',
    );
  }
  // The reject row's reason carries the literal `hitl: budget-exhausted` (C26d
  // reads it there): reject is a HITL reason (rules/risk-autonomy.md), not a
  // retry, and the reason string is where an orchestrator reads that.
  const slots: Record<(typeof ADMIT_PLACEHOLDERS)[number], string | number> = {
    inflight: facts.inflight,
    queued: facts.queued,
    cap,
    max_queued_units: maxQueued,
    overload_action: backpressure.overload_action,
  };
  return {
    action: fillTemplate(row.action, slots),
    capacity: row.capacity === 'remaining' ? capacity : 0,
    reason: fillTemplate(row.reason, slots),
  };
}

function requireCount(value: number, flag: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new KernelError(`admit requires a numeric --${flag}`);
  }
}
