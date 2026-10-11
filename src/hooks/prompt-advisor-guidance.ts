// The human-readable guidance half of the UserPromptSubmit adapter: the jq
// program of hooks/prompt-advisor.sh (:64-115), string for string, plus the
// trailing judge note of the routing replacement (contracts.md@rev2 §10.5).
//
// It lives beside ./prompt-advisor rather than inside it because the strings ARE
// the contract — src/hooks/prompt-advisor.e2e.test.ts asserts substrings of them, and the
// Wave 6 e2e keeps doing so — while the hook itself is a kernel call, three
// telemetry writes and one decision. Mixing the two would hide both.
import type {
  DecisionMatch,
  DecisionsSection,
  EscalateRouteSection,
  HitlSection,
  JudgeFact,
  JudgeMode,
  Registries,
  TaskContractSection,
} from '../kernel';
import type { RiskTier } from '../kernel/context';
import { KernelError } from '../lib/json';

// One prompt's kernel answer, narrowed to the four sections the guidance reads.
// `hitl` is null rather than absent for the same reason the resolve-task
// projection emits null: `classifyNote` asks whether a gate fired AT ALL, and an
// optional key would make "no gate" and "not asked" the same value.
export interface TaskAnswer {
  route: EscalateRouteSection;
  decisions: DecisionsSection;
  contract: TaskContractSection;
  hitl: HitlSection | null;
}

// The registry values the notes quote. They were literals (`fable`, `opus`,
// `A3`) until the routing replacement; read from models.json and policy.json
// instead, a rebound tier or ceiling reaches the advisor without a code edit,
// and with today's registries every note renders byte for byte as before.
export interface GuidanceLookups {
  mostCapableModel: string;
  designModel: string;
  buildModel: string;
  routerModel: string;
  highRiskCeiling: string;
}

const MOST_CAPABLE_TIER = 'most-capable';
const DESIGN_TIER = 'design';
const BUILD_TIER = 'build';

// Throws KernelError on a registry that cannot answer: the advisor treats that
// like any other broken registry and stays silent rather than printing a note
// that names no model.
export function guidanceLookups(regs: Registries): GuidanceLookups {
  const routerAgent = regs.policy.router.agent;
  // The router is a fan-out planner, design tier per rules/models.md; its
  // agents.json row says so, and that row wins when it names a tier.
  const routerTier = regs.agents.find((agent) => agent.name === routerAgent)?.model_tier ?? DESIGN_TIER;
  return {
    mostCapableModel: tierModel(regs, MOST_CAPABLE_TIER),
    designModel: tierModel(regs, DESIGN_TIER),
    buildModel: tierModel(regs, BUILD_TIER),
    routerModel: tierModel(regs, routerTier),
    highRiskCeiling: regs.policy.autonomy.ceiling_by_risk.high,
  };
}

function tierModel(regs: Registries, tier: string): string {
  const row = regs.models.tiers.find((candidate) => candidate.id === tier);
  if (row === undefined) throw new KernelError(`registries/models.json: no tier '${tier}' for the prompt advisor`);
  return row.model;
}

// jq's `(scale_notes + decision_note + route_note + hitl_note + classify_note)`.
// The order is asserted by the suite (a big-task prompt reads "big-task
// signal ... route escalation"), so it is the contract, not a preference.
export function guidanceNotes(task: TaskAnswer, lookups: GuidanceLookups): string[] {
  return [
    ...scaleNotes(task.contract, lookups),
    ...decisionNote(task.decisions, lookups),
    ...routeNote(task, lookups),
    ...hitlNote(task.hitl),
    ...classifyNote(task),
  ];
}

function scaleNotes(contract: TaskContractSection, lookups: GuidanceLookups): string[] {
  const notes: string[] = [];
  if (contract.scale.big_task) {
    notes.push(
      "[engineos] big-task signal — apply rules/parallelism.md: freeze shared contracts first, decompose into disjoint-scope units, group into waves, dispatch each wave as MULTIPLE Task calls in ONE message, announce '[fanout] waves=... '. Do not do independent units sequentially yourself.",
    );
  }
  if (contract.scale.spec_authoring) {
    notes.push(
      `[engineos] spec/PRD authoring — rules/models.md: use the most-capable tier (model: ${lookups.mostCapableModel}). If the session model is lower, delegate the authoring to a subagent with that model.`,
    );
  }
  if (contract.scale.design_work) {
    notes.push(
      `[engineos] design/architecture work — rules/models.md: design tier (model: ${lookups.designModel}) for the design pass, build tier (model: ${lookups.buildModel}) for the code that follows.`,
    );
  }
  return notes;
}

function decisionNote(decisions: DecisionsSection, lookups: GuidanceLookups): string[] {
  if (decisions.matches.length === 0) return [];
  const lines = decisions.matches.map(matchLine).join('\n');
  const high = decisions.any_high
    ? `\n[engineos] a matched rule sets risk=high — autonomy ceiling ${lookups.highRiskCeiling} per rules/risk-autonomy.md: human approval before any external effect, and a rollback path before release.`
    : '';
  return [
    `[engineos] decision rules matched this prompt (registries/decision-rules.json).\n${lines}\nConfirm each requirement is met or explicitly waived with a reason before claiming done. These are keyword matches on the prompt only — apply the full registry per rules/gates.md, and classify risk per rules/risk-autonomy.md.${high}`,
  ];
}

// Every optional field keeps its own label. A collapsed field would still name
// the right rule while printing its gate as a preference, which is the shifted-
// slot failure the suite's `absent "prefer:"` assertions exist to catch.
function matchLine(match: DecisionMatch): string {
  return (
    `  - ${match.id}` +
    (match.require.length > 0 ? ` — require: ${match.require.join(', ')}` : '') +
    (declared(match.prefer) ? ` — prefer: ${match.prefer}` : '') +
    (declared(match.gate) ? ` [gate: ${match.gate}]` : '') +
    (declared(match.risk) ? ` [risk: ${match.risk}]` : '')
  );
}

function routeNote(task: TaskAnswer, lookups: GuidanceLookups): string[] {
  const { route, contract } = task;
  if (route.escalate) {
    const scale = Object.entries(route.scale)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');
    return [
      `[engineos] route escalation — the kernel could not fully resolve this request: ${route.reasons.join(', ')}. Dispatch the \`router\` agent (agents/router.md, model ${lookups.routerModel}) via the Task tool with the request text and follow its dispatch plan; do not fan out before it returns. Kernel facts so far: intents=${csv(route.intents)} agents=${csv(route.agents)} scale=(${scale}). A hook cannot dispatch an agent — you must invoke it.`,
    ];
  }
  if (contract.substantive) {
    return [
      `[engineos] task contract (kernel, deterministic): intents=${csv(contract.intents)} agents=${csv(contract.agents)} rules=${csv(contract.rules)} policy_rules=${csv(contract.policy_rules)} skills=${csv(contract.skills)} commands=${csv(contract.commands)} mcp=${csv(contract.mcp)} model_tier=${orDash(contract.model_tier)} risk_floor=${orDash(contract.risk_floor)} autonomy_ceiling_at_floor=${orDash(contract.autonomy_ceiling_at_floor)}${tiebreakField(contract.tiebreak)} — load these before acting; the risk floor is a floor, not the final tier. No router dispatch needed.`,
    ];
  }
  return [];
}

// Present only when the embedding tie-break narrowed the survivors (contracts
// rev3 §16.6), so every line without a winner renders byte for byte as before.
function tiebreakField(winner: string | null): string {
  return winner === null ? '' : ` tiebreak=${winner}`;
}

function hitlNote(hitl: HitlSection | null): string[] {
  if (hitl === null || !hitl.required) return [];
  return [
    `[engineos] human-in-the-loop required — reasons: ${hitl.reasons.join(', ')}. A human decides before any external effect; the autonomy ceiling does not cover this. Record who, when, which reason ids, and what was approved or refused under "## Human decisions" in the change record (rules/risk-autonomy.md "Human-in-the-loop"; rules/gates.md release checklist).`,
  ];
}

// A high risk FLOOR with no classified tier. The compensating signal is an
// instruction to CLASSIFY, never a human-approval gate: no "human decides", no
// "approval", no reason ids, and deliberately not the phrase "human-in-the-loop"
// — a suite assertion that no gate was announced has to stay meaningful.
function classifyNote(task: TaskAnswer): string[] {
  if (task.contract.risk_floor !== 'high' || task.hitl !== null) return [];
  return [
    '[engineos] risk floor is high and no tier has been classified — classify this task per rules/risk-autonomy.md (reversibility, blast radius, data sensitivity, contract surface, spend; the shortcut floors are high outright) BEFORE claiming that no human decision is owed. None of the gate reasons in registries/policy.json hitl.reasons has fired: a floor is an input to classification, not a verdict, so this is an instruction to classify and not an approval gate.',
  ];
}

// What the judge note reads (contracts.md@rev2 §2.5, §10.5). `fact` is the one
// that reached the kernel, or null when the judge could not be consulted at all.
export interface JudgeNoteInput {
  mode: JudgeMode;
  fact: JudgeFact | null;
  intentThreshold: number;
  ruleThreshold: number;
  // decision-rules.json `judge_fact` -> rule id, so a flag names the rule it
  // would add, not the question that measured it.
  ruleOf: Readonly<Record<string, string>>;
  riskProposal: RiskTier | null;
}

// Two decimals, the precision of every probability the kernel publishes.
const PROBABILITY_DIGITS = 2;

// Trailing, and only in advisory or authoritative mode: shadow records the
// judge without telling anyone (§2.5). Every line says it is a model judgment,
// so nobody reads a probability as a gate. A judge that was not switched on
// says nothing; one that was and could not answer says so, because a silent
// fallback is the failure §4.6 rules out.
export function judgeNote(input: JudgeNoteInput): string[] {
  const { fact } = input;
  if (input.mode === 'shadow' || fact === null) return [];
  if (fact.source === 'fallback') {
    if (fact.reason === 'disabled') return [];
    return [`[engineos] judge (fallback, ${fact.reason}): no model judgment for this prompt — the contract above is deterministic only.`];
  }
  const ranked = above(Object.entries(fact.intents), input.intentThreshold);
  const flags = above(
    Object.entries(fact.rules).map(([name, p]): [string, number] => [input.ruleOf[name] ?? name, p]),
    input.ruleThreshold,
  );
  return [
    `[engineos] judge (jev, ${fact.model}): ranked=${scored(ranked)} flags=${scored(flags)} risk_proposal=${orDash(input.riskProposal)} — model judgment, not a gate`,
  ];
}

// Probability descending; a stable sort keeps the judge's own key order (the
// registry order the questions were generated in) among ties.
function above(entries: readonly [string, number][], threshold: number): [string, number][] {
  return entries.filter(([, p]) => p >= threshold).sort((a, b) => b[1] - a[1]);
}

function scored(entries: readonly [string, number][]): string {
  return csv(entries.map(([id, p]) => `${id}:${p.toFixed(PROBABILITY_DIGITS)}`));
}

function csv(values: readonly string[]): string {
  return values.length === 0 ? '-' : values.join(',');
}

// jq's `// "-"`, which falls back on null and false only: an empty string is
// truthy in jq and prints as itself, so it must not become a dash here.
function orDash(value: string | null): string {
  return value === null ? '-' : value;
}

// jq's `(.x // "") != ""`: null and the empty string are both "not declared".
// A type predicate rather than a boolean, so the caller's template literal sees
// a string and no `?? ''` has to stand in for a narrowing the helper already did.
function declared(value: string | null): value is string {
  return value !== null && value !== '';
}
