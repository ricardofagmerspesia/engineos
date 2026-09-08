import { KernelError } from '../lib/json';
import type { ModelTier } from '../registry/models';
import type { Registries } from './context';

export interface ModelFacts {
  workType: string;
}

// jq projected the escalation target as {tier, model}, and null at the top of
// the ladder. Both halves come from the target tier's own row, never from a
// name restated here.
export interface ModelEscalation {
  tier: string;
  model: string;
}

// cmd_model's key order: work, tier, model, escalates_to.
export interface ModelSection {
  work: string;
  tier: string;
  model: string;
  escalates_to: ModelEscalation | null;
}

export function modelSection(facts: ModelFacts, regs: Registries): ModelSection {
  const models = regs.models;
  const work = models.work_types.find((w) => w.id === facts.workType);
  // The bash message, verbatim — the CLI renders it as {"error": ...} exit 1.
  if (work === undefined) {
    throw new KernelError(`unknown work type: ${facts.workType} (see registries/models.json work_types)`);
  }
  const tier = tierById(models.tiers, work.tier, `work type ${work.id}`);
  const next =
    tier.escalates_to === null ? null : tierById(models.tiers, tier.escalates_to, `tier ${tier.id}`);
  return {
    work: work.id,
    tier: tier.id,
    model: tier.model,
    escalates_to: next === null ? null : { tier: next.id, model: next.model },
  };
}

// Check C16 keeps every tier reference resolvable. The bash pipeline answered a
// dangling one with an empty document and exit 0, which a caller reads as
// success with no model; refusing is the only honest answer.
function tierById(tiers: ModelTier[], id: string, referrer: string): ModelTier {
  const tier = tiers.find((t) => t.id === id);
  if (tier === undefined) {
    throw new KernelError(`registries/models.json: ${referrer} names an undefined tier: ${id}`);
  }
  return tier;
}
