import { KernelError } from '../lib/json';
import { combine, type CombineOutput } from './combine';
import type { Registries, RiskTier } from './context';
import { decisionsSection, type ComposedDecisionsSection, type DecisionMatch } from './decisions';
import { hitlSection, type HitlSection } from './hitl';
import type { JudgeFact, JudgeMode, JudgeSummary } from './judge-facts';
import type { EscalateRouteSection, SuppressedIntent } from './route';
import { asciiDowncase, compilePromptRegex, type ScaleSection } from './scale';
import { enabledSkills, suppressedSkills, type SuppressedSkill } from './skill-state';
import { refuseUnrankedTiebreak, type TiebreakFact } from './tiebreak-facts';

// The task-contract block of resolve, split from resolve.ts by concern: it is
// the one answer composed out of another section's answer (the escalate route),
// and it fills `decision_rules`, `hitl` and `task_contract` together.

// cmd_resolve_task's task_contract key order, which is the answer's contract:
// the twenty legacy keys, the two judge keys of contracts.md@rev1 §2.4, then
// the tie-break key of contracts.md@rev3 §2.4 (key 23).
export interface TaskContractSection {
  substantive: boolean;
  intents: string[];
  escalates: boolean;
  escalation_reasons: string[];
  suppressed: SuppressedIntent[];
  agents: string[];
  rules: string[];
  policy_rules: string[];
  skills: string[];
  skills_suppressed: SuppressedSkill[];
  commands: string[];
  mcp: string[];
  model_tier: string | null;
  risk_floor: RiskTier | null;
  autonomy_ceiling_at_floor: string | null;
  scale: ScaleSection;
  decision_rules: string[];
  required: string[];
  gates: string[];
  preferences: string[];
  judge: JudgeSummary;
  risk_proposal: RiskTier | null;
  tiebreak: string | null;
}

interface TaskContractFacts {
  prompt: string;
  route: EscalateRouteSection;
  judge: JudgeFact | null;
  // Validated against the registries; absent when no tie-break fact was declared.
  tiebreak: TiebreakFact | null;
}

// The three keys the block answers, in the order resolve assigns them.
interface ComposedTaskContract {
  decision_rules: ComposedDecisionsSection;
  hitl: HitlSection | null;
  task_contract: TaskContractSection;
}

export function composeTaskContract(facts: TaskContractFacts, regs: Registries): ComposedTaskContract {
  const { prompt, route, judge, tiebreak } = facts;
  // Checked after routing because the ranking is the reference: a score for a
  // candidate this prompt never ranked is a broken caller (contracts §3.1).
  if (tiebreak !== null) refuseUnrankedTiebreak(tiebreak, route.ranked);
  const combined = combine({
    route,
    decisions: decisionsSection({ prompt }, regs),
    scale: route.scale,
    judge,
    mode: judgeMode(judge, regs),
    regs,
    ...(tiebreak === null ? {} : { tiebreak }),
  });
  const decisionRules: ComposedDecisionsSection = {
    matches: combined.decisionMatches,
    any_high: combined.anyHigh,
    judge_added: combined.judgeAdded,
  };
  // The deterministic floor raised by any matched high rule, and in
  // authoritative mode by the folded intents and the judge's proposal; never
  // lowered (contracts.md@rev1 §4.4). A tie-break selection never lowers it
  // either (contracts.md@rev3 §4.7).
  const floor = combined.riskFloor;
  // The ceiling lookup runs for any floor, classified or not: a floor with no
  // entry in autonomy.ceiling_by_risk is a broken registry, and the contract
  // object below publishes the same value.
  const ceiling = floor === null ? null : ceilingAt(floor, regs);
  // HITL is folded ONLY from any_high: a matched rule declaring
  // risk=high is a CLASSIFICATION of this prompt's own text, while
  // route.risk_floor is an input to classification, inherited from whichever
  // domain a keyword landed in. Folding the floor in would announce a human
  // gate nobody owed — the gate theatre rules/gates.md warns about. A
  // floor-only prompt therefore gets no hitl section at all, and
  // task_contract.risk_floor is what says a classification is still owed.
  // The ceiling is non-null exactly when the floor is, and any_high raises the
  // floor to high, so what hitl is handed here is the ceiling at high — the
  // same value the contract object publishes.
  //
  // The one other fold is the topology fact: a matched rule whose `when`
  // declares multi_agent_system owes the developer's approval before any
  // graph code (policy.json hitl.reasons topology-approval). That reason is
  // about the REQUEST, not about a tier, so it is folded at whatever tier the
  // contract already carries — the floor's tier contributes no reason of its
  // own below high, so a floor alone still never triggers hitl. It needs a
  // ceiling to ask about, and every rule signal is also an intent signal, so
  // a matched rule always arrives with a floor (resolve.test.ts holds this).
  //
  // A judge fold changes neither condition's meaning: any_high and the
  // topology fact read the union of regex and judge-added matches, and a
  // judge-raised floor alone folds nothing (a proposal is not a
  // classification).
  const topology = topologyRequired(combined.decisionMatches, regs);
  // No conflict fact here: a matched high rule on a task nobody has
  // classified is not an observed disagreement between rule and tier, and
  // asserting one would be the same unearned claim one level down.
  const hitl = (combined.anyHigh || topology) && floor !== null && ceiling !== null
    ? hitlSection({ riskTier: floor, autonomy: ceiling, topology }, regs)
    : null;
  return {
    decision_rules: decisionRules,
    hitl,
    task_contract: taskContract({ prompt, route, combined, floor, ceiling }, regs),
  };
}

// The closed policy bundle for substantive work. gates references
// parallelism/risk/verification; parallelism references models/risk/
// verification. Returning the closure keeps adapters and router rows from
// reconstructing it independently.
const POLICY_BUNDLE: readonly string[] = ['gates', 'models', 'parallelism', 'risk-autonomy', 'verification'];

// The rule that applies because agents were routed, not because the work is
// substantive: rules/subagents.md is about whether ANY agent runs at all.
const AGENT_POLICY_RULE = 'subagents';

interface ContractInputs {
  prompt: string;
  route: EscalateRouteSection;
  combined: CombineOutput;
  floor: RiskTier | null;
  ceiling: string | null;
}

// Without a jev fact every mode answers the same (contracts.md@rev1 §4), so the
// policy block is read only when there is something to fold: a registry
// without it still answers the pre-judge contract.
function judgeMode(judge: JudgeFact | null, regs: Registries): JudgeMode {
  return judge !== null && judge.source === 'jev' ? regs.policy.judge.mode : 'shadow';
}

function taskContract(inputs: ContractInputs, regs: Registries): TaskContractSection {
  const { prompt, route, combined } = inputs;
  const matches = combined.decisionMatches;
  // Registry order, not match order: the bash arm selects the matched rows out
  // of intents.json, so the unions below follow the registry's own ordering.
  const matched = regs.intents.intents.filter((intent) => combined.intents.includes(intent.id));
  // The union is read from intents.json directly here, not through
  // routeByIntent, so the enablement filter has to be applied again at this
  // site. Two answer shapes, one rule: a disabled skill is never recommended,
  // and never disappears without saying why.
  const declaredSkills = unique(matched.flatMap((intent) => intent.skills));
  const substantive =
    combined.intents.length > 0 ||
    matches.length > 0 ||
    route.scale.big_task ||
    route.scale.spec_authoring ||
    route.scale.design_work ||
    // A prompt can request real work without matching a registered domain
    // ("update this prose"). The registry-owned action expression is the
    // fallback that keeps such work inside the safety/verification bundle.
    substantiveAction(prompt, regs);
  return {
    substantive,
    intents: [...combined.intents],
    escalates: combined.escalateReasons.length > 0,
    escalation_reasons: [...combined.escalateReasons],
    suppressed: combined.suppressed.map((entry) => ({ ...entry })),
    agents: [...combined.agents],
    rules: unique(matched.flatMap((intent) => intent.rules)),
    // jq's `unique` sorts as well as de-duplicates, and the answer callers
    // already parse carries that ordering.
    policy_rules: [
      ...new Set([
        ...(substantive ? POLICY_BUNDLE : []),
        ...(combined.agents.length > 0 ? [AGENT_POLICY_RULE] : []),
      ]),
    ].sort(),
    skills: enabledSkills(declaredSkills, regs.skillState),
    skills_suppressed: suppressedSkills(declaredSkills, regs.skillState),
    commands: unique(matched.flatMap((intent) => intent.commands)),
    mcp: unique(matched.flatMap((intent) => intent.mcp)),
    model_tier: combined.modelTier,
    risk_floor: inputs.floor,
    autonomy_ceiling_at_floor: inputs.ceiling,
    scale: { ...route.scale },
    decision_rules: matches.map((match) => match.id),
    required: unique(matches.flatMap((match) => match.require)),
    // jq's `map(.gate // empty)` drops a null value rather than emitting it, so
    // a rule that names no gate and no preference contributes to neither list.
    gates: unique(declared(matches.map((match) => match.gate))),
    preferences: unique(declared(matches.map((match) => match.prefer))),
    judge: { ...combined.judgeSummary },
    risk_proposal: combined.riskProposal,
    tiebreak: combined.tiebreakWinner,
  };
}

// The `when` key that names a multi-agent topology in decision-rules.json. The
// fold reads the matched rules' declared condition rather than a rule id, so a
// second rule with the same condition folds the same way without a code change.
const TOPOLOGY_WHEN_KEY = 'multi_agent_system';

function topologyRequired(matches: readonly DecisionMatch[], regs: Registries): boolean {
  const matched = new Set(matches.map((match) => match.id));
  return regs.decisionRules.rules.some(
    (rule) => matched.has(rule.id) && rule.when[TOPOLOGY_WHEN_KEY] === true,
  );
}

// A floor the registry cannot map to a ceiling is a broken registry, not a null
// shipped at exit 0: the contract publishes this value, and a caller reading it
// as "no ceiling" would grant more autonomy than the tier permits.
function ceilingAt(floor: RiskTier, regs: Registries): string {
  const ceiling = regs.policy.autonomy.ceiling_by_risk[floor];
  if (ceiling === '') {
    throw new KernelError(
      `policy.json has no autonomy.ceiling_by_risk[${floor}] — resolve-task cannot resolve the ceiling hitl needs`,
    );
  }
  return ceiling;
}

function substantiveAction(prompt: string, regs: Registries): boolean {
  const source = regs.policy.parallelism.prompt_signals.substantive_action;
  const pattern = compilePromptRegex(source, 'registries/policy.json: .parallelism.prompt_signals.substantive_action');
  return pattern.test(asciiDowncase(prompt));
}

// The `// empty` half of jq's `map(.gate // empty)`: a null is dropped, not
// emitted as a member of a list of names.
function declared(values: readonly (string | null)[]): string[] {
  return values.filter((value): value is string => value !== null);
}

// First-occurrence order, which is what jq's `reduce ... if index($x) then . else
// . + [$x] end` preserves — deliberately not `unique`, whose sorting is only
// wanted for policy_rules above.
function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
