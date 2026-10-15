import type { IntentRow, Registries, RiskTier } from './context';

// The intent-set primitives the deterministic route (./route) and the
// combination policy (./combine, ./combine-aggregate) share, so the raw route
// and the folded or narrowed one suppress, aggregate and keep high floors by
// one definition. Pure, no I/O; a leaf module, importing types only.

// The bash arm spells this ordering inline rather than reading policy.json, and
// so does the port: it is the ordering of the tier vocabulary itself — the same
// three names RiskTier is — not a policy knob somebody could re-tune. The model
// tiers are the opposite case, and come from models.json escalation_order.
export const RISK_ORDER: readonly RiskTier[] = ['low', 'medium', 'high'];

// An intent whose registry floor is this tier is exempt from the max_intents
// cap (§1.5), and a deterministic survivor with it is dropped neither by a
// similarity score (§4.7) nor by a judge fold (§4.1).
const KEPT_FLOOR: RiskTier = 'high';

// Every registry intent whose floor is KEPT_FLOOR.
export function highFloorIntentIds(regs: Registries): Set<string> {
  return new Set(regs.intents.intents.filter((row) => row.risk_floor === KEPT_FLOOR).map((row) => row.id));
}

// The single, non-transitive suppression test. `by` names what dropped the
// intent: "more-specific-match" for the suppressible-fallback rule, otherwise
// the id of the intent from its own suppressed_by that is in `chosen`. Both
// inputs describe the set BEFORE suppression, so a drop never causes another.
export function suppressorOf(row: IntentRow, chosen: ReadonlySet<string>, hasNonSuppressible: boolean): string | null {
  if (row.suppressible && hasNonSuppressible) return 'more-specific-match';
  return row.suppressed_by.find((id) => chosen.has(id)) ?? null;
}

// Max by position in a declared ordering, the aggregation both the tier and the
// floor use. A value the ordering does not name cannot be compared against one
// it does, so it never wins and an all-unknown set aggregates to null.
export function highest<T extends string>(values: readonly (T | null)[], order: readonly T[]): T | null {
  let best: T | null = null;
  let bestIndex = -1;
  for (const value of values) {
    if (value === null) continue;
    const index = order.indexOf(value);
    if (index > bestIndex) {
      bestIndex = index;
      best = value;
    }
  }
  return best;
}
