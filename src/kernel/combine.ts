import type { DecisionRule } from '../registry/decision-rules';
import { aggregateIntents } from './combine-aggregate';
import type { Registries, RiskTier } from './context';
import { matchFromRule, rulesInPriorityOrder, type DecisionMatch, type DecisionsSection } from './decisions';
import { highest, highFloorIntentIds, RISK_ORDER } from './intent-order';
import { judgeSummary, OTHER_PRIMARY, type JevFact, type JudgeFact, type JudgeMode, type JudgeSummary } from './judge-facts';
import type { EscalateRouteSection, RankedIntent, SuppressedIntent } from './route';
import type { ScaleSection } from './scale';
import { tiebreakWinner, type TiebreakFact } from './tiebreak-facts';

// The combination policy (contracts.md@rev3 §4): pure, no I/O. Deterministic
// gates win; a judge fact may only ADD decision matches and only RAISE risk, and
// it replaces the lexical intent set only in authoritative mode. On the
// deterministic branch an embedding tie-break fact may only NARROW an ambiguous
// set of survivors to one of them (§4.7). The declared
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
  // The validated tie-break fact (§3.1); absent means the client was not
  // consulted. Read only on the deterministic branch of an ambiguous route.
  tiebreak?: TiebreakFact;
}

// The first nine keys are the frozen §4 output. `intents` carries the survivors
// of suppression, as route.intents does. The next four are the derived lists
// §4.2 says are recomputed over the folded set; they are emitted here so the
// task contract reads one answer instead of re-running suppression itself.
// `tiebreakWinner` is the §4.7 selection, published as task_contract.tiebreak.
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
  tiebreakWinner: string | null;
}

// Two rules are derived in code, not from judge.rules (§4.3).
const FANOUT_RULE = 'rule-fanout';
const FANOUT_SCALE = 2;
const SPEC_THRESHOLD_RULE = 'rule-spec-threshold';
const NEW_FEATURE_INTENT = 'new-feature';

const LOW_CONFIDENCE_REASON = 'low-confidence';
const MULTI_AGENT_REASON = 'multi-agent-dispatch';
const DISPATCH_PLAN_REASON = 'requires-dispatch-plan';

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

// The deterministic answer re-packaged: with no judge fact and no tie-break
// selection every task-contract value is exactly what it was before the judge
// existed.
function deterministic(input: CombineInput, summary: JudgeSummary, riskProposal: RiskTier | null): CombineOutput {
  const { route, decisions, regs } = input;
  // §4.7 is read only when the route itself is in doubt; route.* is never edited.
  const winner = input.tiebreak !== undefined && route.ambiguous
    ? tiebreakWinner(route.intents, route.ranked, input.tiebreak, regs.policy.router.tiebreak)
    : null;
  if (winner !== null) return narrowed(input, winner, summary, riskProposal);
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
    tiebreakWinner: null,
  };
}

// §4.7 on selection: keep the winner plus every high-floor survivor, re-aggregate
// over that subset, and never lower the floor or the model tier. Decision
// matches, anyHigh and the reasons are the deterministic ones: narrowing can
// only remove agents, so no reason needs recomputing, and `low-confidence`
// stays so the router agent still sees the doubt.
function narrowed(
  input: CombineInput,
  winner: string,
  summary: JudgeSummary,
  riskProposal: RiskTier | null,
): CombineOutput {
  const { route, decisions, regs } = input;
  const keptFloorIds = highFloorIds(route.intents, regs);
  // route.intents is in registry order, so both partitions are too.
  const kept = route.intents.filter((id) => id === winner || keptFloorIds.has(id));
  const dropped = route.intents.filter((id) => !kept.includes(id));
  const aggregate = aggregateIntents(kept, regs);
  return {
    intents: aggregate.intents,
    ranked: route.ranked,
    ambiguous: false,
    decisionMatches: decisions.matches,
    judgeAdded: [],
    anyHigh: decisions.any_high,
    riskProposal,
    judgeSummary: summary,
    escalateReasons: route.reasons,
    suppressed: [...route.suppressed, ...dropped.map((id) => ({ id, by: winner }))],
    agents: aggregate.agents,
    modelTier: highest([route.model_tier, aggregate.modelTier], regs.models.escalation_order),
    riskFloor: decisions.any_high ? 'high' : highest([route.risk_floor, aggregate.riskFloor], RISK_ORDER),
    tiebreakWinner: winner,
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
  // Rule 1, add-only (review finding #8): every deterministic survivor with a
  // high floor stays in the folded set, after the judge's choice and never
  // suppressed by it, so the fold cannot drop the domain whose rules, agents
  // and reviewer a high-risk prompt needs.
  const keptHigh = highFloorIds(route.intents, regs);
  const ids = [...choice.ids, ...route.intents.filter((id) => keptHigh.has(id) && !choice.ids.includes(id))];
  const aggregate = aggregateIntents(ids, regs, keptHigh);
  const added = judgeAddedRules(jev, ids, decisions, regs).map((rule) => matchFromRule(rule.id, regs));
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
  // Rule 4, add-only (§4.5 rev 3): every deterministic reason stays, in policy
  // order; the two intent-derived reasons are re-evaluated over the folded
  // survivors and only ever added. unrouted-scale is defined on zero RAW
  // matches, so only the route.reasons term keeps it.
  const escalateReasons = regs.policy.router.reasons.filter(
    (reason) =>
      route.reasons.includes(reason) ||
      (reason === MULTI_AGENT_REASON && aggregate.multiAgent) ||
      (reason === DISPATCH_PLAN_REASON && aggregate.dispatchPlan) ||
      (reason === LOW_CONFIDENCE_REASON && doubt),
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
    // Never below the deterministic tier: uncertainty favours the stronger
    // model (rules/models.md), as in narrowed().
    modelTier: highest([route.model_tier, aggregate.modelTier], regs.models.escalation_order),
    riskFloor,
    // The judge is the semantic tier above the tie-break, so the fold ignores it.
    tiebreakWinner: null,
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

// The deterministic survivors with a kept high floor: neither a similarity
// score (§4.7) nor a judge fold (§4.1) drops one.
function highFloorIds(survivors: readonly string[], regs: Registries): Set<string> {
  const high = highFloorIntentIds(regs);
  return new Set(survivors.filter((id) => high.has(id)));
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
