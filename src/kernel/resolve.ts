import { KernelError } from '../lib/json';
import { admitSection, type AdmitFacts, type AdmitSection } from './admit';
import { breakerSection, type BreakerFacts, type BreakerSection } from './breaker';
import type { KernelContext, Registries, RiskTier } from './context';
import { decisionsSection, type DecisionsFacts, type DecisionsSection } from './decisions';
import { hitlSection, type HitlFacts, type HitlSection } from './hitl';
import { modelSection, type ModelSection } from './model';
import { repairSection, type RepairFacts, type RepairSection } from './repair';
import { riskSection, type RiskSection } from './risk';
import { routeByIntent, routeByPath, routeEscalate, type EscalateRouteSection, type RouteSection, type SuppressedIntent } from './route';
import { asciiDowncase, compilePromptRegex, scaleSection, type ScaleFacts, type ScaleSection } from './scale';
import { enabledSkills, suppressedSkills, type SuppressedSkill } from './skill-state';
import { wavesSection, type WavesFacts, type WavesSection } from './waves';

// Declared facts, sparse by design: a section is answered iff the facts it needs
// were declared. With Wave 1(d) the set is complete — every legacy arm is a
// projection of one call (design "Kernel shape").
//
// A multi-field fact travels as the section's own facts type under the section's
// own key (`scale`, `decisions`, `repair`, `admit`, `breaker`, `hitl`, `waves`),
// so the fact key and the answer key are the same word and a section owns the
// shape of its input. `decisions` is the one place the two words differ: the
// answer key is the legacy projection's name, `decision_rules`, which is frozen
// public surface, while the module and its section are named for the concept.
// `signals` and `riskTier` are the other exception, and the reason is visible in
// the pair: they are two FORMS of one section's input, so neither can be named
// after the key they both answer.
//
// `escalate` and `taskContract` are not facts about the world; they are
// MODIFIERS that say which question the prompt fact is being asked. A prompt
// answers the route section in three forms, and the forms are not
// interchangeable — the intent form is P2 public surface and never carries the
// suppression fields — so the caller declares which one it wants rather than the
// kernel guessing from the other facts. `taskContract` implies `escalate`,
// because the task contract is composed out of the escalate form.
export interface DeclaredFacts {
  path?: string;
  prompt?: string;
  escalate?: boolean;
  taskContract?: boolean;
  workType?: string;
  // The PARSED --signals payload. Reading the flag's string is the CLI's job;
  // the risk section owns what a well-formed payload is.
  signals?: unknown;
  riskTier?: RiskTier;
  scale?: ScaleFacts;
  decisions?: DecisionsFacts;
  repair?: RepairFacts;
  admit?: AdmitFacts;
  breaker?: BreakerFacts;
  hitl?: HitlFacts;
  waves?: WavesFacts;
}

// Keys appear in the order resolve fills them, which is the order below for
// every fact but the task contract: that block is composed last and fills
// `decision_rules`, `hitl` and `task_contract` together, so a task-contract call
// answers route, decision_rules, hitl, task_contract in that order. The
// resolve-task projection re-orders into the legacy composite; the `resolve` arm
// emits this order verbatim.
export interface Answer {
  route?: RouteSection;
  model?: ModelSection;
  risk?: RiskSection;
  scale?: ScaleSection;
  decision_rules?: DecisionsSection;
  repair?: RepairSection;
  admit?: AdmitSection;
  breaker?: BreakerSection;
  hitl?: HitlSection;
  waves?: WavesSection;
  task_contract?: TaskContractSection;
}

// cmd_resolve_task's task_contract key order, which is the answer's contract.
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
}

export function resolve(facts: DeclaredFacts, ctx: KernelContext): Answer {
  const answer: Answer = {};
  const { prompt } = facts;
  // Both forms answer the same `route` key, so one of them would have to win
  // silently. resolve-task, the composite Wave 1(d) landed, takes a prompt and
  // nothing else — it has no path form to reconcile a path fact with — so the
  // refusal stands rather than being replaced by a composition.
  if (facts.path !== undefined && prompt !== undefined) {
    throw new KernelError('a path fact and a prompt fact cannot be declared together');
  }
  if (facts.escalate === true && prompt === undefined) {
    throw new KernelError('an escalate fact cannot be declared without a prompt fact');
  }
  // The task contract answers `decision_rules` and `hitl` out of the prompt it
  // was given, so a second fact answering either key would have to win silently
  // — the same refusal, one level up.
  if (facts.taskContract === true && facts.decisions !== undefined) {
    throw new KernelError('a task-contract fact and a decisions fact cannot be declared together');
  }
  if (facts.taskContract === true && facts.hitl !== undefined) {
    throw new KernelError('a task-contract fact and a hitl fact cannot be declared together');
  }
  if (facts.path !== undefined) {
    // Refuse rather than fabricate: an empty path would route as the repo root
    // and answer a domain nobody asked about.
    if (facts.path === '') throw new KernelError('a declared path fact must not be empty');
    answer.route = routeByPath(facts.path, ctx.registries, ctx.root);
  }
  if (prompt !== undefined) {
    // Same refusal for the same reason: an empty prompt matches no signal, and
    // answering "ambiguous" would report absence of a request as absence of an
    // intent.
    if (prompt === '') throw new KernelError('a declared prompt fact must not be empty');
    answer.route =
      facts.escalate === true || facts.taskContract === true
        ? routeEscalate(prompt, ctx.registries)
        : routeByIntent(prompt, ctx.registries);
  }
  if (facts.workType !== undefined) {
    answer.model = modelSection({ workType: facts.workType }, ctx.registries);
  }
  // The same refusal the two route forms get, for the same reason: signals are
  // evidence to classify and a tier is already classified, both answer `risk`,
  // and silently preferring one would let a stale tier override fresh evidence.
  if (facts.signals !== undefined && facts.riskTier !== undefined) {
    throw new KernelError('a signals fact and a classified risk-tier fact cannot be declared together');
  }
  if (facts.signals !== undefined) {
    answer.risk = riskSection({ signals: facts.signals }, ctx.registries);
  }
  if (facts.riskTier !== undefined) {
    answer.risk = riskSection({ riskTier: facts.riskTier }, ctx.registries);
  }
  if (facts.scale !== undefined) {
    answer.scale = scaleSection(facts.scale, ctx.registries);
  }
  if (facts.decisions !== undefined) {
    answer.decision_rules = decisionsSection(facts.decisions, ctx.registries);
  }
  if (facts.repair !== undefined) {
    answer.repair = repairSection(facts.repair, ctx.registries);
  }
  if (facts.admit !== undefined) {
    answer.admit = admitSection(facts.admit, ctx.registries);
  }
  if (facts.breaker !== undefined) {
    answer.breaker = breakerSection(facts.breaker, ctx.registries);
  }
  if (facts.hitl !== undefined) {
    answer.hitl = hitlSection(facts.hitl, ctx.registries);
  }
  if (facts.waves !== undefined) {
    answer.waves = wavesSection(facts.waves, ctx.registries);
  }
  // Composed last, out of the sections above rather than beside them: the task
  // contract is the one answer that reads another section's answer.
  if (facts.taskContract === true) {
    if (prompt === undefined) {
      throw new KernelError('a task-contract fact cannot be declared without a prompt fact');
    }
    const route = answer.route;
    if (route === undefined || !('escalate' in route)) {
      throw new KernelError('a task-contract fact answered no escalate route section');
    }
    const decisions = decisionsSection({ prompt }, ctx.registries);
    answer.decision_rules = decisions;
    const floor = decisions.any_high ? 'high' : route.risk_floor;
    // The ceiling lookup runs for any floor, classified or not: a floor with no
    // entry in autonomy.ceiling_by_risk is a broken registry, and the contract
    // object below publishes the same value.
    const ceiling = floor === null ? null : ceilingAt(floor, ctx.registries);
    // HITL is folded ONLY from decisions.any_high: a matched rule declaring
    // risk=high is a CLASSIFICATION of this prompt's own text, while
    // route.risk_floor is an input to classification, inherited from whichever
    // domain a keyword landed in. Folding the floor in would announce a human
    // gate nobody owed — the gate theatre rules/gates.md warns about. A
    // floor-only prompt therefore gets no hitl section at all, and
    // task_contract.risk_floor is what says a classification is still owed.
    // The ceiling is non-null exactly when the floor is, and any_high raises the
    // floor to high, so what hitl is handed here is the ceiling at high — the
    // same value the contract object publishes.
    if (decisions.any_high && ceiling !== null) {
      // No conflict fact here: a matched high rule on a task nobody has
      // classified is not an observed disagreement between rule and tier, and
      // asserting one would be the same unearned claim one level down.
      answer.hitl = hitlSection({ riskTier: 'high', autonomy: ceiling }, ctx.registries);
    }
    answer.task_contract = taskContract({ prompt, route, decisions, floor, ceiling }, ctx.registries);
  }
  return answer;
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
  decisions: DecisionsSection;
  floor: RiskTier | null;
  ceiling: string | null;
}

function taskContract(inputs: ContractInputs, regs: Registries): TaskContractSection {
  const { prompt, route, decisions } = inputs;
  // Registry order, not match order: the bash arm selects the matched rows out
  // of intents.json, so the unions below follow the registry's own ordering.
  const matched = regs.intents.intents.filter((intent) => route.intents.includes(intent.id));
  // The union is read from intents.json directly here, not through
  // routeByIntent, so the enablement filter has to be applied again at this
  // site. Two answer shapes, one rule: a disabled skill is never recommended,
  // and never disappears without saying why.
  const declaredSkills = unique(matched.flatMap((intent) => intent.skills));
  const substantive =
    route.intents.length > 0 ||
    decisions.matches.length > 0 ||
    route.scale.big_task ||
    route.scale.spec_authoring ||
    route.scale.design_work ||
    // A prompt can request real work without matching a registered domain
    // ("update this prose"). The registry-owned action expression is the
    // fallback that keeps such work inside the safety/verification bundle.
    substantiveAction(prompt, regs);
  return {
    substantive,
    intents: [...route.intents],
    escalates: route.escalate,
    escalation_reasons: [...route.reasons],
    suppressed: route.suppressed.map((entry) => ({ ...entry })),
    agents: [...route.agents],
    rules: unique(matched.flatMap((intent) => intent.rules)),
    // jq's `unique` sorts as well as de-duplicates, and the answer callers
    // already parse carries that ordering.
    policy_rules: [
      ...new Set([
        ...(substantive ? POLICY_BUNDLE : []),
        ...(route.agents.length > 0 ? [AGENT_POLICY_RULE] : []),
      ]),
    ].sort(),
    skills: enabledSkills(declaredSkills, regs.skillState),
    skills_suppressed: suppressedSkills(declaredSkills, regs.skillState),
    commands: unique(matched.flatMap((intent) => intent.commands)),
    mcp: unique(matched.flatMap((intent) => intent.mcp)),
    model_tier: route.model_tier,
    risk_floor: inputs.floor,
    autonomy_ceiling_at_floor: inputs.ceiling,
    scale: { ...route.scale },
    decision_rules: decisions.matches.map((match) => match.id),
    required: unique(decisions.matches.flatMap((match) => match.require)),
    // jq's `map(.gate // empty)` drops a null value rather than emitting it, so
    // a rule that names no gate and no preference contributes to neither list.
    gates: unique(declared(decisions.matches.map((match) => match.gate))),
    preferences: unique(declared(decisions.matches.map((match) => match.prefer))),
  };
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
