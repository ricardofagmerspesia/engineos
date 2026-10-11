import type { IntentRow } from '../registry/intents';
import type { RoutingDomain } from '../registry/routing';
import type { Registries, RiskTier } from './context';
import { scaleSection, type ScaleSection } from './scale';
import { marginOf, matchPathDomain, scoreIntents, type RankedIntent } from './score';
import { enabledSkills, suppressedSkills, type SuppressedSkill } from './skill-state';

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
}

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

// Scored multi-match (contracts.md@rev1 §2.2): every intent whose score clears
// router.scoring.min_score matches, at most max_intents (highest scores kept,
// ties by registry order), emitted in registry order with the eleven pinned
// fields. With a v1 registry every firing signal scores 1, so the placeholders
// (min_score 1) reproduce the any-match set. The router agent still owns real
// ambiguity and reads `ranked` instead of a flat set.
export function routeByIntent(text: string, regs: Registries): IntentRouteSection {
  const scoring = regs.policy.router.scoring;
  const candidates = scoreIntents(text, regs);
  const kept = new Set(
    candidates
      .filter((candidate) => candidate.score >= scoring.min_score)
      .slice(0, scoring.max_intents)
      .map((candidate) => candidate.id),
  );
  const matches = regs.intents.intents.filter((intent) => kept.has(intent.id)).map((intent) => intentMatch(intent, regs));
  const margin = marginOf(candidates);
  const top = candidates[0];
  const ambiguous =
    matches.length === 0 ||
    top === undefined ||
    top.confidence < scoring.threshold ||
    (margin !== null && margin < scoring.margin);
  return { matches, ambiguous, ranked: candidates.slice(0, scoring.top_k), margin };
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
}

// The bash arm spells this ordering inline rather than reading policy.json, and
// so does the port: it is the ordering of the tier vocabulary itself — the same
// three names RiskTier is — not a policy knob somebody could re-tune. The model
// tiers are the opposite case, and come from models.json escalation_order.
const RISK_ORDER: readonly RiskTier[] = ['low', 'medium', 'high'];

// Whether a dispatch plan is needed: the condition of frozen contract 1 of
// docs/specs/2026-08-06-decision-kernel-p3-router-agent.md. Reuses routeByIntent
// and scaleSection rather than reimplementing either, resolves suppression in a
// single deterministic pass, then aggregates model_tier and risk_floor (max by
// lookup — never a reason to escalate on their own) and checks the three
// trigger reasons.
export function routeEscalate(text: string, regs: Registries): EscalateRouteSection {
  // Read the policy block FIRST, so a policy.json without it stops the answer
  // rather than shaping it: the typed loader refuses such a file naming
  // `.router`, exactly where the bash arm's `jq -e '.router'` guard refused. A
  // resolver that silently defaults its own escalation policy is worse than one
  // that stops.
  const router = regs.policy.router;

  const raw = routeByIntent(text, regs);
  const scale = scaleSection({ prompt: text }, regs);

  // route-intent's answer is P2 public surface and never carries the three
  // P3-only fields, so the suppression inputs are re-read from the registry —
  // in registry order, which is also the order routeByIntent matched in.
  const rawIds = new Set(raw.matches.map((m) => m.id));
  const matched = regs.intents.intents.filter((i) => rawIds.has(i.id));
  const hasNonSuppressible = matched.some((i) => !i.suppressible);

  // One pass, never transitive: both tests below read the RAW matched set, so a
  // drop can never cause another drop.
  const suppressed: SuppressedIntent[] = [];
  const surviving: IntentRow[] = [];
  for (const intent of matched) {
    const by = suppressorOf(intent, hasNonSuppressible, rawIds);
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
    ambiguous: raw.ambiguous,
    // Passed through unchanged: suppression edits `intents`, never the ranking,
    // so the router agent sees every candidate.
    ranked: raw.ranked,
    margin: raw.margin,
  };
}

function suppressorOf(
  intent: IntentRow,
  hasNonSuppressible: boolean,
  rawIds: ReadonlySet<string>,
): string | null {
  if (intent.suppressible && hasNonSuppressible) return 'more-specific-match';
  return intent.suppressed_by.find((id) => rawIds.has(id)) ?? null;
}

// Max by position in a declared ordering, the aggregation both the tier and the
// floor use. A value the ordering does not name cannot be compared against one
// it does, so it never wins and an all-unknown set aggregates to null.
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
