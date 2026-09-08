import { KernelError, isRecord } from '../lib/json';
import type { GateStatuses, SpecThreshold } from '../registry/policy';
import { isRiskTier, type Registries, type RiskTier } from './context';

// One risk section, two declared-fact forms, exactly as the bash kernel had two
// arms over one policy block: `--signals` classifies (cmd_risk), a `--risk` tier
// is already classified and only asks what that costs (cmd_gates). The key sets
// differ because the two answers differ — a classification reports the floors it
// applied and the ceiling it earned, a lookup reports the spec threshold the
// gate reads. Callers narrow on the key they declared facts for.
export type RiskSection = ClassifiedRiskSection | TierRiskSection;

// cmd_risk's key order: risk, autonomy_ceiling, gates, floors_applied.
export interface ClassifiedRiskSection {
  risk: RiskTier;
  autonomy_ceiling: string;
  gates: GateStatuses;
  floors_applied: string[];
}

// cmd_gates' key order: risk, gates, spec_threshold.
export interface TierRiskSection {
  risk: RiskTier;
  gates: GateStatuses;
  spec_threshold: SpecThreshold;
}

export interface RiskFacts {
  // The parsed payload of --signals: {"inputs": {<input-id>: tier}, "floors": [<floor-id>]}.
  // Parsing the flag's string is the CLI's job; validating the shape is this
  // module's, because an unrecognized id here is a gate answering on evidence
  // it does not understand.
  signals?: unknown;
  riskTier?: RiskTier;
}

// Aggregation is registry data, not a constant: registries/policy.json
// .risk.aggregation names the function, and a value with no implementation is
// refused rather than quietly treated as "max". Averaging is the failure this
// guards — rules/risk-autonomy.md says risk takes the HIGHEST tier any input
// reaches, and an unnoticed rebinding to a mean would downgrade every mixed
// signal set.
const AGGREGATORS: Record<string, (tiers: readonly RiskTier[]) => RiskTier> = {
  max: maxTier,
};

export function riskSection(facts: RiskFacts, regs: Registries): RiskSection {
  if (facts.signals !== undefined) return classify(facts.signals, regs);
  if (facts.riskTier !== undefined) return forTier(facts.riskTier, regs);
  throw new KernelError('risk section requires signals or a classified risk tier');
}

function classify(signals: unknown, regs: Registries): ClassifiedRiskSection {
  const policy = regs.policy;
  if (!isRecord(signals)) {
    throw new KernelError('risk --signals must be a JSON object with inputs{} and/or floors[]');
  }
  const inputs = optionalRecord(signals['inputs'], 'risk --signals .inputs must be an object of input-id to tier');
  const floors = optionalArray(signals['floors'], 'risk --signals .floors must be an array of floor ids');
  const entries = Object.entries(inputs);

  // Absence of evidence is not evidence of low risk. The bash kernel answered
  // "low" here once; that was the same fail-open hole one step earlier.
  if (entries.length === 0 && floors.length === 0) {
    throw new KernelError(
      'risk --signals needs a non-empty inputs{} or floors[] — an empty payload is not low risk, it is no evidence',
    );
  }

  const knownInputs = policy.risk.inputs.map((input) => input.id);
  const unknownInputs = entries.filter(([id]) => !knownInputs.includes(id)).map(([id]) => id);
  if (unknownInputs.length > 0) {
    throw new KernelError(`unknown risk input(s): ${unknownInputs.join(', ')}`);
  }
  const invalidValues = entries.filter(([, tier]) => !isRiskTier(tier)).map(([id]) => id);
  if (invalidValues.length > 0) {
    throw new KernelError(`invalid tier value on input(s): ${invalidValues.join(', ')}`);
  }
  const unknownFloors = floors
    .filter((floor) => typeof floor !== 'string' || !policy.risk.high_floors.includes(floor))
    .map((floor) => String(floor));
  if (unknownFloors.length > 0) {
    throw new KernelError(`unknown floor(s): ${unknownFloors.join(', ')}`);
  }

  const aggregate = AGGREGATORS[policy.risk.aggregation];
  if (aggregate === undefined) {
    throw new KernelError(
      `unsupported risk aggregation: ${policy.risk.aggregation} (registries/policy.json .risk.aggregation)`,
    );
  }
  const applied = floors.filter((floor): floor is string => typeof floor === 'string');
  const tier: RiskTier = applied.length > 0 ? 'high' : aggregate(entries.map(([, value]) => value).filter(isRiskTier));

  return {
    risk: tier,
    autonomy_ceiling: policy.autonomy.ceiling_by_risk[tier],
    gates: policy.gates.by_risk[tier],
    floors_applied: applied,
  };
}

function forTier(tier: RiskTier, regs: Registries): TierRiskSection {
  // Re-checked at runtime because a declared fact can arrive from parsed JSON,
  // where the type says nothing about the value.
  if (!isRiskTier(tier)) throw new KernelError('gates requires --risk low|medium|high');
  return {
    risk: tier,
    gates: regs.policy.gates.by_risk[tier],
    spec_threshold: regs.policy.gates.spec_threshold,
  };
}

function maxTier(tiers: readonly RiskTier[]): RiskTier {
  if (tiers.includes('high')) return 'high';
  if (tiers.includes('medium')) return 'medium';
  return 'low';
}

// jq's `(.inputs // {})` reads an absent and a null field the same way; a
// present field of the wrong type is a malformed payload, not an empty one.
function optionalRecord(value: unknown, message: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new KernelError(message);
  return value;
}

function optionalArray(value: unknown, message: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new KernelError(message);
  return value;
}
