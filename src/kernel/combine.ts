import type { DecisionRule } from '../registry/decision-rules';
import type { IntentRow, Registries, RiskTier } from './context';
import { matchFromRule, rulesInPriorityOrder, type DecisionMatch, type DecisionsSection } from './decisions';
import { judgeSummary, OTHER_PRIMARY, type JevFact, type JudgeFact, type JudgeMode, type JudgeSummary } from './judge-facts';
import type { EscalateRouteSection, RankedIntent, SuppressedIntent } from './route';
import type { ScaleSection } from './scale';

// The combination policy (contracts.md@rev1 §4): pure, no I/O. Deterministic
// gates win; a judge fact may only ADD decision matches and only RAISE risk, and
// it replaces the lexical intent set only in authoritative mode. The declared
// invariants live in policy.router.combination, whose loader refuses any value
// but the ones implemented here (fail closed), so this module does not branch
// on them.

export interface CombineInput {
  route: EscalateRouteSection;
  decisions: DecisionsSection;
  scale: ScaleSection;
  judge: JudgeFact | null;
  mode: JudgeMode;
  regs: Registries;
  // Reserved for T12 (embedding tiebreak); never read here.
  tiebreak?: Record<string, number>;
}

// The first nine keys are the frozen §4 output. `intents` carries the survivors
// of suppression, as route.intents does. The last four are the derived lists
// §4.2 says are recomputed over the folded set; they are emitted here so the
// task contract reads one answer instead of re-running suppression itself.
export interface CombineOutput {
  intents: string[];
  ranked: RankedIntent[];
  ambiguous: boolean;
  decisionMatches: DecisionMatch[];
  judgeAdded: string[];
  anyHigh: boolean;
  riskProposal: RiskTier | null;
  judgeSummary: JudgeSummary;
  escalateReasons: string[];
  suppressed: SuppressedIntent[];
  agents: string[];
  modelTier: string | null;
  riskFloor: RiskTier | null;
}

// The ordering of the tier vocabulary itself, as in route.ts.
const RISK_ORDER: readonly RiskTier[] = ['low', 'medium', 'high'];

// Two rules are derived in code, not from judge.rules (§4.3).
const FANOUT_RULE = 'rule-fanout';
const FANOUT_SCALE = 2;
const SPEC_THRESHOLD_RULE = 'rule-spec-threshold';
const NEW_FEATURE_INTENT = 'new-feature';

const LOW_CONFIDENCE_REASON = 'low-confidence';

export function combine(input: CombineInput): CombineOutput {
  const { judge } = input;
  const jev = judge !== null && judge.source === 'jev' ? judge : null;
  // Reported in every mode (§2.5) so shadow runs record what the judge would
  // have proposed; folded into the floor only in authoritative mode.
  const riskProposal = jev === null ? null : proposalOf(jev);
  const summary = judgeSummary(judge);
  if (jev === null || input.mode !== 'authoritative') return deterministic(input, summary, riskProposal);
  return folded(input, jev, summary, riskProposal);
}

// The deterministic answer re-packaged: with no judge fact every task-contract
// value is exactly what it was before the judge existed.
function deterministic(input: CombineInput, summary: JudgeSummary, riskProposal: RiskTier | null): CombineOutput {
  const { route, decisions } = input;
  return {
    intents: route.intents,
    ranked: route.ranked,
    ambiguous: route.ambiguous,
    decisionMatches: decisions.matches,
    judgeAdded: [],
    anyHigh: decisions.any_high,
    riskProposal,
    judgeSummary: summary,
    escalateReasons: route.reasons,
    suppressed: route.suppressed,
    agents: route.agents,
    modelTier: route.model_tier,
    riskFloor: decisions.any_high ? 'high' : route.risk_floor,
  };
}

function folded(
  input: CombineInput,
  jev: JevFact,
  summary: JudgeSummary,
  riskProposal: RiskTier | null,
): CombineOutput {
  const { route, decisions, regs } = input;
  const thresholds = regs.policy.judge.thresholds;
  const choice = chooseIntents(jev, regs);
  const aggregate = aggregateIntents(choice.ids, regs);
  const added = judgeAddedRules(jev, choice.ids, decisions, regs).map((rule) => matchFromRule(rule.id, regs));
  const decisionMatches = [...decisions.matches, ...added];
  const anyHigh = decisionMatches.some((match) => match.risk === 'high');
  // Rule 1 and 2b: the deterministic floor is kept, the folded intents and a
  // matched high rule can only raise it, and so can the proposal.
  const intentFloor = highest([route.risk_floor, aggregate.riskFloor], RISK_ORDER);
  const riskFloor = highest([anyHigh ? 'high' : intentFloor, riskProposal], RISK_ORDER);
  const doubt =
    choice.ambiguous ||
    jev.primary.confidence < thresholds.primary_confidence ||
    jev.primary.margin < thresholds.margin;
  // Rule 4, add-only: every deterministic reason stays, in policy order.
  const escalateReasons = regs.policy.router.reasons.filter(
    (reason) => route.reasons.includes(reason) || (reason === LOW_CONFIDENCE_REASON && doubt),
  );
  return {
    intents: aggregate.intents,
    ranked: route.ranked,
    ambiguous: choice.ambiguous,
    decisionMatches,
    judgeAdded: added.map((match) => match.id),
    anyHigh,
    riskProposal,
    judgeSummary: summary,
    escalateReasons,
    suppressed: aggregate.suppressed,
    agents: aggregate.agents,
    modelTier: aggregate.modelTier,
    riskFloor,
  };
}

interface IntentChoice {
  ids: string[];
  ambiguous: boolean;
}

// Rule 3, noul-then-primary (§4.2). Only active rows are eligible: the judge is
// never asked about a disabled intent, so a disabled id cannot qualify.
function chooseIntents(jev: JevFact, regs: Registries): IntentChoice {
  const thresholds = regs.policy.judge.thresholds;
  const qualifying = regs.intents.intents
    .map((row, index) => ({ row, index, p: jev.intents[row.id] ?? 0 }))
    .filter(({ row, p }) => row.active && p >= (row.threshold ?? thresholds.intent_default))
    .sort((a, b) => b.p - a.p || a.index - b.index)
    .slice(0, regs.policy.router.scoring.max_intents)
    .map(({ row }) => row.id);
  if (qualifying.length > 0) return { ids: qualifying, ambiguous: false };
  if (jev.primary.confidence >= thresholds.primary_confidence) {
    // 'other' is a confident answer that no routed intent applies.
    return { ids: jev.primary.id === OTHER_PRIMARY ? [] : [jev.primary.id], ambiguous: false };
  }
  return { ids: [], ambiguous: true };
}

interface IntentAggregate {
  intents: string[];
  suppressed: SuppressedIntent[];
  agents: string[];
  modelTier: string | null;
  riskFloor: RiskTier | null;
}

// Suppression and aggregation over the folded set, the same single,
// non-transitive pass routeEscalate runs over the raw set; lists keep the
// folded set's confidence order.
function aggregateIntents(ids: readonly string[], regs: Registries): IntentAggregate {
  const chosen = new Set(ids);
  const rows = ids.flatMap((id) => regs.intents.intents.filter((row) => row.id === id));
  const hasNonSuppressible = rows.some((row) => !row.suppressible);
  const suppressed: SuppressedIntent[] = [];
  const surviving: IntentRow[] = [];
  for (const row of rows) {
    const by = row.suppressible && hasNonSuppressible
      ? 'more-specific-match'
      : row.suppressed_by.find((id) => chosen.has(id)) ?? null;
    if (by === null) surviving.push(row);
    else suppressed.push({ id: row.id, by });
  }
  return {
    intents: surviving.map((row) => row.id),
    suppressed,
    agents: [...new Set(surviving.flatMap((row) => row.agents))],
    modelTier: highest(surviving.map((row) => row.model_tier), regs.models.escalation_order),
    riskFloor: highest(surviving.map((row) => row.risk_floor), RISK_ORDER),
  };
}

// Rule 2a, add-only (§4.3), in the keyword tier's priority order. The spec
// threshold reads the folded set before suppression: a new feature that a more
// specific domain suppressed is still a new feature, and the fold may only add.
function judgeAddedRules(
  jev: JevFact,
  folded: readonly string[],
  decisions: DecisionsSection,
  regs: Registries,
): DecisionRule[] {
  const matched = new Set(decisions.matches.map((match) => match.id));
  const ruleDefault = regs.policy.judge.thresholds.rule_default;
  return rulesInPriorityOrder(regs).filter((rule) => {
    if (matched.has(rule.id)) return false;
    if (rule.id === FANOUT_RULE) return jev.scale === FANOUT_SCALE;
    if (rule.id === SPEC_THRESHOLD_RULE) return folded.includes(NEW_FEATURE_INTENT);
    if (rule.judge_fact === null) return false;
    return (jev.rules[rule.judge_fact] ?? 0) >= (rule.judge_threshold ?? ruleDefault);
  });
}

// Rule 2b (§4.4): the highest of the five risk inputs, as a tier.
function proposalOf(jev: JevFact): RiskTier {
  const { risk } = jev;
  const top = Math.max(risk.reversibility, risk.blast_radius, risk.data_sensitivity, risk.contract_surface, risk.spend);
  // Levels are validated 0|1|2, so the lookup always hits; were it ever to miss,
  // failing toward the higher tier is the only direction raise-only permits.
  return RISK_ORDER[top] ?? 'high';
}

// Max by position in a declared ordering. A value the ordering does not name
// never wins, and an all-null set aggregates to null.
function highest<T extends string>(values: readonly (T | null)[], order: readonly T[]): T | null {
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
