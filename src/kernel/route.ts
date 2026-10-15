import type { IntentRow } from '../registry/intents';
import type { Language, PackageStack } from '../registry/project-config';
import type { RoutingDomain } from '../registry/routing';
import type { Registries, RiskTier } from './context';
import { highest, highFloorIntentIds, RISK_ORDER, suppressorOf } from './intent-order';
import { asciiDowncase, scaleSection, type ScaleSection } from './scale';
import { boundedContains, marginOf, matchPathDomain, scoreIntents, type RankedIntent } from './score';
import { enabledSkills, suppressedSkills, type SuppressedSkill } from './skill-state';
import type { ScoringPolicy } from '../registry/policy';

// One route section, three declared-fact forms: a path routes to a domain, a
// prompt routes to intents, and resolve-task's prompt routes to the escalate
// composite. Callers narrow on the key they declared facts for.
export type RouteSection = PathRouteSection | IntentRouteSection | EscalateRouteSection;

export type PathRouteSection =
  | { domain: null; excluded: boolean }
  | {
      domain: string;
      rules: string[];
      skills: string[];
      skills_suppressed: SuppressedSkill[];
      agent: string | null;
      risk_floor: RiskTier | null;
      hook_guidance: string;
      excluded: false;
    };

// The eleven fields cmd_route_intent projected, in its key order.
export interface IntentMatch {
  id: string;
  title: string;
  rules: string[];
  skills: string[];
  skills_suppressed: SuppressedSkill[];
  agents: string[];
  commands: string[];
  mcp: string[];
  model_tier: string | null;
  risk_floor: RiskTier | null;
  note: string | null;
}

export type { RankedIntent } from './score';

// Key order is the answer's contract (contracts.md@rev1 §2.2): the two pinned
// keys, then the trailing ranking siblings.
export interface IntentRouteSection {
  matches: IntentMatch[];
  ambiguous: boolean;
  ranked: RankedIntent[];
  margin: number | null;
  rebound: Rebound[];
  generic_only: boolean;
}

// One stack-bearing intent the keyword floor matched and the repository could
// not hold, replaced by its sibling (contracts §2, amended 2026-10-07). `reason`
// names the evidence level that decided: `framework` when only the sibling's
// framework is present (a FastAPI backend beside a React frontend), `language`
// when no framework of either row is present and only the sibling's language
// is. `scope` says whether the package holding the working directory decided
// or the whole repository did.
export interface Rebound {
  from: string;
  to: string;
  reason: 'framework' | 'language';
  scope: 'package' | 'repo';
}

// What the router knows about the caller's repository. `focus` is the package
// that contains the working directory, when there is one; it is consulted
// before the repository as a whole. A bare language list is accepted for
// callers that know only languages: each language becomes one framework-less
// package and there is no focus.
export interface StackFacts {
  packages: readonly PackageStack[];
  focus: PackageStack | null;
}

export type StackInput = readonly Language[] | StackFacts;

// The one guidance renderer, shared by the hook and the CLI, so the registry
// keeps a single form of the fact (design "Route guidance"). The hint is placed
// last: mid-string parentheticals were the only reason the stored strings could
// not be derived from the structured fields.
export function renderGuidance(domain: RoutingDomain): string {
  const parts: string[] = [];
  if (domain.rules.length > 0) parts.push(`rules/${domain.rules.join('.md+')}.md`);
  for (const skill of domain.skills) parts.push(`skill:${skill}`);
  if (domain.agent !== null) parts.push(`agent:${domain.agent}`);
  const line = parts.join(' | ');
  return domain.hint === null ? line : `${line} (${domain.hint})`;
}

// The floor is intents.json's, not the row's: registries/routing.json still
// stores a risk_floor, but resolve-task has always floored from the intent, and
// exactly one intent carries each domain (asserted in route.test.ts).
export function floorOf(domain: RoutingDomain, regs: Registries): RiskTier | null {
  const intent = regs.intents.intents.find((i) => i.domain === domain.id);
  return intent === undefined ? null : intent.risk_floor;
}

// The matching itself is score.ts matchPathDomain (shared with the scorer's
// path feature); this arm only shapes the answer.
export function routeByPath(file: string, regs: Registries, root: string): PathRouteSection {
  const match = matchPathDomain(file, regs.routing, root);
  if (match.kind === 'excluded') return { domain: null, excluded: true };
  if (match.kind === 'none') return { domain: null, excluded: false };
  const dom = match.domain;
  // Key order is the answer's contract: jq emitted domain, rules, skills,
  // skills_suppressed, agent, risk_floor, hook_guidance, excluded.
  return {
    domain: dom.id,
    rules: dom.rules,
    skills: enabledSkills(dom.skills, regs.skillState),
    skills_suppressed: suppressedSkills(dom.skills, regs.skillState),
    agent: dom.agent,
    risk_floor: floorOf(dom, regs),
    hook_guidance: renderGuidance(dom),
    excluded: false,
  };
}

// Scored multi-match (contracts.md@rev1 §2.2) over the stack-aware keyword
// floor: every intent whose score clears router.scoring.min_score matches,
// emitted in registry order with the eleven pinned fields. With a v1 registry
// every firing signal scores 1, so the placeholders (min_score 1) reproduce the
// any-match set. The router agent still owns real ambiguity and reads `ranked`
// instead of a flat set. `stack` is the repository's resolved stack; absent or
// empty, no stack is known and no match is rebound.
export function routeByIntent(text: string, regs: Registries, stack?: StackInput): IntentRouteSection {
  const raw = matchIntents(text, regs, stack);
  const matches = raw.rows.map((intent) => intentMatch(intent, regs));
  return {
    matches,
    ambiguous: ambiguityOf(raw, regs.policy.router.scoring),
    ranked: raw.ranked,
    margin: raw.margin,
    rebound: raw.rebound,
    generic_only: genericOnly(raw.rows, raw.specific),
  };
}

// One reading of ambiguity for both answer forms: nothing matched, or the top
// candidate is weak on confidence or on its margin over the runner-up. The
// escalate form reads it over the RAW matched rows, before suppression, so a
// tie-break fact narrows the same set the intent form called ambiguous.
function ambiguityOf(raw: MatchedIntents, scoring: ScoringPolicy): boolean {
  const top = raw.ranked[0];
  return (
    raw.rows.length === 0 ||
    top === undefined ||
    top.confidence < scoring.threshold ||
    (raw.margin !== null && raw.margin < scoring.margin)
  );
}

// max_intents trims only what any-match would never have routed. Two kinds of
// admitted candidate are exempt: a high-floor intent, by the same set
// combine.ts keeps (./intent-order highFloorIntentIds), since dropping it would
// lower the floor and lose the reviewer a high-risk prompt needs; and an
// intent whose declared evidence alone (phrases, pair,
// path, minus negatives) clears min_score, which is the §1.5 any-match set.
// The cap fills its remaining slots, score then registry order, from intents
// that needed exemplar similarity to clear min_score. A v1 registry has no
// exemplars, so there the cap can never bind.
function keptIntentIds(text: string, candidates: readonly RankedIntent[], regs: Registries): Set<string> {
  const scoring = regs.policy.router.scoring;
  const admitted = candidates.filter((candidate) => candidate.score >= scoring.min_score);
  if (admitted.length <= scoring.max_intents) return new Set(admitted.map((candidate) => candidate.id));
  const highFloor = highFloorIntentIds(regs);
  const declared = new Set(
    scoreIntents(text, withoutExemplars(regs))
      .filter((candidate) => candidate.score >= scoring.min_score)
      .map((candidate) => candidate.id),
  );
  const isExempt = (id: string): boolean => highFloor.has(id) || declared.has(id);
  const exempt = admitted.filter((candidate) => isExempt(candidate.id));
  const slots = Math.max(0, scoring.max_intents - exempt.length);
  // `admitted` is already score descending, ties by registry order.
  const capped = admitted.filter((candidate) => !isExempt(candidate.id)).slice(0, slots);
  return new Set([...exempt, ...capped].map((candidate) => candidate.id));
}

// The same registries with bm25_weight 0, so the scorer answers from declared
// evidence only. Getters delegate rather than spread: spreading lazyRegistries
// would load every registry file just to override one number.
function withoutExemplars(regs: Registries): Registries {
  const policy = regs.policy;
  const declaredOnly = { ...policy, router: { ...policy.router, scoring: { ...policy.router.scoring, bm25_weight: 0 } } };
  return {
    get routing(): Registries['routing'] { return regs.routing; },
    get intents(): Registries['intents'] { return regs.intents; },
    get models(): Registries['models'] { return regs.models; },
    policy: declaredOnly,
    get decisionRules(): Registries['decisionRules'] { return regs.decisionRules; },
    get capabilities(): Registries['capabilities'] { return regs.capabilities; },
    get agents(): Registries['agents'] { return regs.agents; },
    get skillState(): Registries['skillState'] { return regs.skillState; },
  };
}

function intentMatch(intent: IntentRow, regs: Registries): IntentMatch {
  return {
    id: intent.id,
    title: intent.title,
    rules: intent.rules,
    // Per match, not once for the answer: a disabled skill is never
    // recommended, and never disappears from a match without saying why.
    skills: enabledSkills(intent.skills, regs.skillState),
    skills_suppressed: suppressedSkills(intent.skills, regs.skillState),
    agents: intent.agents,
    commands: intent.commands,
    mcp: intent.mcp,
    model_tier: intent.model_tier,
    risk_floor: intent.risk_floor,
    note: intent.note,
  };
}

// The floor's raw answer, before any suppression: the matched rows in registry
// order, whether each was reached through a signal that is not one of its
// row's generic_signals, the stack rebinds applied on the way, and the scored
// ranking the rows were selected from (the top_k candidates, score descending,
// with the margin between the first two).
interface MatchedIntents {
  rows: IntentRow[];
  specific: ReadonlyMap<string, boolean>;
  rebound: Rebound[];
  ranked: RankedIntent[];
  margin: number | null;
}

// Selection is the scorer's (keptIntentIds); specificity and the stack rebind
// are the keyword floor's, applied to the kept rows. A kept row with no literal
// signal hit was admitted on phrase, pair, path or exemplar evidence, none of
// which is a generic signal, so it counts as specific.
function matchIntents(text: string, regs: Registries, stack?: StackInput): MatchedIntents {
  const scoring = regs.policy.router.scoring;
  const facts = stackFacts(stack);
  const lower = asciiDowncase(text);
  const all = regs.intents.intents;
  const candidates = scoreIntents(text, regs);
  const kept = keptIntentIds(text, candidates, regs);
  const direct = new Map<string, boolean>();
  for (const intent of all) {
    if (!kept.has(intent.id)) continue;
    const hits = intent.signals.filter((signal) => boundedContains(lower, asciiDowncase(signal)));
    direct.set(intent.id, hits.length === 0 || hits.some((signal) => !intent.generic_signals.includes(signal)));
  }
  const rebound: Rebound[] = [];
  const specific = new Map<string, boolean>();
  for (const intent of all) {
    const isSpecific = direct.get(intent.id);
    if (isSpecific === undefined) continue;
    const swap = rebindTarget(intent, all, facts);
    if (swap === null) {
      merge(specific, intent.id, isSpecific);
      continue;
    }
    rebound.push({ from: intent.id, to: swap.target.id, reason: swap.reason, scope: swap.scope });
    // The sibling inherits what made the original specific: "FastAPI" rebound
    // to the node row is still a prompt that named its stack, and "endpoint"
    // rebound is still one that did not.
    merge(specific, swap.target.id, isSpecific);
  }
  // Registry order, which every reader of the raw set relies on (routeEscalate
  // and the task contract both select rows out of intents.json in that order).
  return {
    rows: all.filter((intent) => specific.has(intent.id)),
    specific,
    rebound,
    ranked: candidates.slice(0, scoring.top_k),
    margin: marginOf(candidates),
  };
}

// Whether the floor would keep this intent for the given stack: true unless
// the rebind below swaps it for its sibling. The decision layer offers a model
// only the intents this answers true for, so a model can never choose a row the
// floor itself would have rebound away (contracts §2, "Wave 2a as built").
export function stackEligible(intent: IntentRow, all: readonly IntentRow[], stack?: StackInput): boolean {
  return rebindTarget(intent, all, stackFacts(stack)) === null;
}

interface Swap {
  target: IntentRow;
  reason: Rebound['reason'];
  scope: Rebound['scope'];
}

// Applied to RAW matches, before suppression (contracts §2, amended). The
// evidence is read in a fixed order, strongest first, and the first place that
// holds either row decides:
//   1. frameworks, in the package holding the working directory
//   2. frameworks, anywhere in the repository
//   3. languages, in that package
//   4. languages, anywhere in the repository
// The row itself holding wins over its sibling (a repository with both a NestJS
// and a FastAPI backend keeps the keyword result); only the sibling holding is a
// swap; nothing holding anywhere leaves the keyword result alone. A React
// frontend has a language but not a backend framework, so it never makes a
// FastAPI repository look like a NestJS one: that is what level 1-2 is for.
function rebindTarget(intent: IntentRow, all: readonly IntentRow[], facts: StackFacts | null): Swap | null {
  if (facts === null || facts.packages.length === 0) return null;
  if (intent.stack === null) return null;
  const sibling = all.find((other) => other.id === intent.stack_sibling);
  if (sibling === undefined || sibling.stack === null) return null;
  const pools: { scope: Rebound['scope']; packages: readonly PackageStack[] }[] = [];
  if (facts.focus !== null) pools.push({ scope: 'package', packages: [facts.focus] });
  pools.push({ scope: 'repo', packages: facts.packages });
  for (const reason of ['framework', 'language'] as const) {
    for (const pool of pools) {
      const own = holds(intent, pool.packages, reason);
      const other = holds(sibling, pool.packages, reason);
      if (own) return null;
      if (other) return { target: sibling, reason, scope: pool.scope };
    }
  }
  return null;
}

// Whether some package carries this row's stack, at the given evidence level. A
// row with no stack_frameworks has no framework evidence to offer, so at the
// framework level it counts by language — the field is opt-in, not required.
function holds(intent: IntentRow, packages: readonly PackageStack[], level: Rebound['reason']): boolean {
  return packages.some((pkg) => {
    if (pkg.language !== intent.stack) return false;
    if (level === 'language' || intent.stack_frameworks.length === 0) return true;
    return pkg.framework !== null && intent.stack_frameworks.includes(pkg.framework);
  });
}

function stackFacts(stack: StackInput | undefined): StackFacts | null {
  if (stack === undefined) return null;
  if (isStackFacts(stack)) return stack;
  return {
    packages: stack.map((language) => ({ dir: language, language, framework: null, compose_service: null })),
    focus: null,
  };
}

function isStackFacts(stack: StackInput): stack is StackFacts {
  return !Array.isArray(stack);
}

// A row reached twice — matched directly and rebound onto — is specific when
// either path was.
function merge(into: Map<string, boolean>, id: string, isSpecific: boolean): void {
  into.set(id, (into.get(id) ?? false) || isSpecific);
}

// The prompts the keywords cannot disambiguate: every surviving match was hit
// only through generic signals. No survivors is not "generic" — it is unrouted,
// which `ambiguous` already says.
function genericOnly(surviving: readonly IntentRow[], specific: ReadonlyMap<string, boolean>): boolean {
  return surviving.length > 0 && surviving.every((intent) => specific.get(intent.id) === false);
}

// The verdict for one raw-matched intent that did not survive. `by` names what
// dropped it: "more-specific-match" for the suppressible-fallback rule,
// otherwise the id of the intent from its own suppressed_by that matched.
export interface SuppressedIntent {
  id: string;
  by: string;
}

// cmd_route_escalate's key order, which is the answer's contract: escalate,
// reasons, intents, suppressed, agents, model_tier, risk_floor, scale,
// ambiguous, then the trailing ranking siblings of contracts.md@rev1 §2.3.
export interface EscalateRouteSection {
  escalate: boolean;
  reasons: string[];
  intents: string[];
  suppressed: SuppressedIntent[];
  agents: string[];
  model_tier: string | null;
  risk_floor: RiskTier | null;
  scale: ScaleSection;
  ambiguous: boolean;
  ranked: RankedIntent[];
  margin: number | null;
  rebound: Rebound[];
  generic_only: boolean;
}

// Whether a dispatch plan is needed: the condition of frozen contract 1 of
// docs/specs/2026-08-06-decision-kernel-p3-router-agent.md. Reuses the keyword
// floor routeByIntent answers from (stack rebind included) and scaleSection
// rather than reimplementing either, resolves suppression in a
// single deterministic pass, then aggregates model_tier and risk_floor (max by
// lookup — never a reason to escalate on their own) and checks the three
// trigger reasons.
export function routeEscalate(
  text: string,
  regs: Registries,
  stack?: StackInput,
): EscalateRouteSection {
  // Read the policy block FIRST, so a policy.json without it stops the answer
  // rather than shaping it: the typed loader refuses such a file naming
  // `.router`, exactly where the bash arm's `jq -e '.router'` guard refused. A
  // resolver that silently defaults its own escalation policy is worse than one
  // that stops.
  const router = regs.policy.router;

  const raw = matchIntents(text, regs, stack);
  const scale = scaleSection({ prompt: text }, regs);

  // The raw set is AFTER the stack rebind and BEFORE suppression, so a sibling
  // the rebind put in place is suppressed or kept exactly as if the prompt had
  // matched it directly. Rows come back in registry order.
  const matched = raw.rows;
  const rawIds = new Set(matched.map((i) => i.id));
  const hasNonSuppressible = matched.some((i) => !i.suppressible);

  // One pass, never transitive: both tests below read the RAW matched set, so a
  // drop can never cause another drop.
  const suppressed: SuppressedIntent[] = [];
  const surviving: IntentRow[] = [];
  for (const intent of matched) {
    const by = suppressorOf(intent, rawIds, hasNonSuppressible);
    if (by === null) surviving.push(intent);
    else suppressed.push({ id: intent.id, by });
  }

  const agents: string[] = [];
  for (const intent of surviving) {
    for (const agent of intent.agents) {
      if (!agents.includes(agent)) agents.push(agent);
    }
  }

  // Spelled out rather than asserted: the escalate_when signal names are
  // registry data, and ScaleSection's keys are code, so the crossing between
  // them is one explicit table instead of a cast that would silently accept a
  // signal name nothing answers.
  const scaleFlags: Record<string, boolean> = {
    big_task: scale.big_task,
    spec_authoring: scale.spec_authoring,
    design_work: scale.design_work,
  };
  const agentIntents = surviving.filter((i) => i.agents.length > 0).length;
  const top = raw.ranked[0];
  const triggered: Record<string, boolean> = {
    'multi-agent-dispatch': agentIntents >= router.escalate_when.multi_agent_intents_min,
    // Zero RAW matches, not zero survivors: an intent that matched and was then
    // suppressed still routed the prompt somewhere, so the prompt is not
    // unrouted.
    'unrouted-scale':
      rawIds.size === 0 &&
      router.escalate_when.unrouted_scale_signals.some((signal) => scaleFlags[signal] === true),
    'requires-dispatch-plan': surviving.some((i) => i.requires_dispatch_plan),
    // Weak top confidence or margin among real candidates. Zero candidates never
    // fire it, so a pure question keeps routing nowhere (§2.3).
    'low-confidence':
      top !== undefined &&
      (top.confidence < router.scoring.threshold || (raw.margin !== null && raw.margin < router.scoring.margin)),
  };
  // Both the vocabulary and the emission order are policy.json's: a reason it
  // does not declare is not emitted, however true its condition.
  const reasons = router.reasons.filter((reason) => triggered[reason] === true);

  return {
    escalate: reasons.length > 0,
    reasons,
    intents: surviving.map((i) => i.id),
    suppressed,
    agents,
    model_tier: highest(
      surviving.map((i) => i.model_tier),
      regs.models.escalation_order,
    ),
    risk_floor: highest(
      surviving.map((i) => i.risk_floor),
      RISK_ORDER,
    ),
    scale,
    ambiguous: ambiguityOf(raw, router.scoring),
    // Passed through unchanged: suppression edits `intents`, never the ranking
    // or the rebind record, so the router agent sees every candidate.
    ranked: raw.ranked,
    margin: raw.margin,
    rebound: raw.rebound,
    generic_only: genericOnly(surviving, raw.specific),
  };
}
