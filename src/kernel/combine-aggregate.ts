import type { IntentRow, Registries, RiskTier } from './context';
import { highest, RISK_ORDER, suppressorOf } from './intent-order';
import type { SuppressedIntent } from './route';

// The aggregation half of the combination policy (contracts.md@rev3 §4.2,
// §4.7), split out of ./combine so each file stays one concern. Pure, no I/O.

export interface IntentAggregate {
  intents: string[];
  suppressed: SuppressedIntent[];
  agents: string[];
  modelTier: string | null;
  riskFloor: RiskTier | null;
  // The two intent-derived escalation conditions routeEscalate applies to the
  // raw survivors, applied here to these survivors (§4.5 rev 3).
  multiAgent: boolean;
  dispatchPlan: boolean;
}

// Suppression and aggregation over the folded (or narrowed) set, the same
// single, non-transitive pass routeEscalate runs over the raw set; lists keep
// the order of `ids`. An id in `kept` is never suppressed: the fold uses it for
// the deterministic high-floor survivors, which add-only (§4.1) forbids it to
// drop whatever the judge chose beside them.
export function aggregateIntents(
  ids: readonly string[],
  regs: Registries,
  kept: ReadonlySet<string> = new Set<string>(),
): IntentAggregate {
  const chosen = new Set(ids);
  const rows = ids.flatMap((id) => regs.intents.intents.filter((row) => row.id === id));
  const hasNonSuppressible = rows.some((row) => !row.suppressible);
  const suppressed: SuppressedIntent[] = [];
  const surviving: IntentRow[] = [];
  for (const row of rows) {
    const by = kept.has(row.id) ? null : suppressorOf(row, chosen, hasNonSuppressible);
    if (by === null) surviving.push(row);
    else suppressed.push({ id: row.id, by });
  }
  return {
    intents: surviving.map((row) => row.id),
    suppressed,
    agents: [...new Set(surviving.flatMap((row) => row.agents))],
    modelTier: highest(surviving.map((row) => row.model_tier), regs.models.escalation_order),
    riskFloor: highest(surviving.map((row) => row.risk_floor), RISK_ORDER),
    multiAgent:
      surviving.filter((row) => row.agents.length > 0).length >=
      regs.policy.router.escalate_when.multi_agent_intents_min,
    dispatchPlan: surviving.some((row) => row.requires_dispatch_plan),
  };
}
