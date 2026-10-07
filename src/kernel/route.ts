import { globMatch } from '../lib/glob';
import type { IntentRow } from '../registry/intents';
import type { Language, PackageStack } from '../registry/project-config';
import type { RoutingDomain } from '../registry/routing';
import type { Registries, RiskTier } from './context';
import { scaleSection, type ScaleSection } from './scale';
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

export interface IntentRouteSection {
  matches: IntentMatch[];
  ambiguous: boolean;
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

export function routeByPath(file: string, regs: Registries, root: string): PathRouteSection {
  const reg = regs.routing;
  const base = file.slice(file.lastIndexOf('/') + 1);
  const norm = `/${file}`;

  // Exclusions first, in registry order: self dirs of THIS checkout, then path
  // globs, then basename globs. self_dirs is data; only its resolution against
  // root is code, which keeps a consumer project's own hooks/ or docs/ routable.
  for (const dir of reg.excluded.self_dirs) {
    if (file.startsWith(`${root}/${dir}/`)) return { domain: null, excluded: true };
  }
  for (const pattern of reg.excluded.paths) {
    if (globMatch(pattern, norm)) return { domain: null, excluded: true };
  }
  for (const pattern of reg.excluded.basenames) {
    if (globMatch(pattern, base)) return { domain: null, excluded: true };
  }

  for (const id of reg.precedence) {
    const dom = reg.domains.find((d) => d.id === id);
    if (dom === undefined) continue;
    // Fidelity with the bash loop: every path glob of a domain is tried before
    // any of its basename globs, per domain in precedence order.
    const hit =
      dom.match.paths.some((p) => globMatch(p, norm)) ||
      dom.match.basenames.some((p) => globMatch(p, base));
    if (hit) {
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
  }
  return { domain: null, excluded: false };
}

// Case-insensitive boundary match of each intent's literal signal phrases
// against the prompt. Multi-match by design (CLAUDE.md: load all that apply);
// ambiguity handling beyond zero-match belongs to the router agent, which reads
// each intent's note. `stack` is the repository's resolved stack; absent or
// empty, no stack is known and no match is rebound.
export function routeByIntent(
  text: string,
  regs: Registries,
  stack?: StackInput,
): IntentRouteSection {
  const matched = matchIntents(text, regs, stack);
  const matches: IntentMatch[] = matched.rows.map((intent) => ({
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
  }));
  return {
    matches,
    ambiguous: matches.length === 0,
    rebound: matched.rebound,
    generic_only: genericOnly(matched.rows, matched.specific),
  };
}

// The keyword floor's raw answer, before any suppression: the matched rows in
// registry order, whether each was reached through a signal that is not one of
// its row's generic_signals, and the stack rebinds applied on the way.
interface MatchedIntents {
  rows: IntentRow[];
  specific: ReadonlyMap<string, boolean>;
  rebound: Rebound[];
}

function matchIntents(text: string, regs: Registries, stack?: StackInput): MatchedIntents {
  const facts = stackFacts(stack);
  const lower = asciiDowncase(text);
  const all = regs.intents.intents;
  const direct = new Map<string, boolean>();
  for (const intent of all) {
    const hits = intent.signals.filter((signal) => boundedContains(lower, asciiDowncase(signal)));
    if (hits.length === 0) continue;
    direct.set(intent.id, hits.some((signal) => !intent.generic_signals.includes(signal)));
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
  return { rows: all.filter((intent) => specific.has(intent.id)), specific, rebound };
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
// ambiguous.
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
  rebound: Rebound[];
  generic_only: boolean;
}

// The bash arm spells this ordering inline rather than reading policy.json, and
// so does the port: it is the ordering of the tier vocabulary itself — the same
// three names RiskTier is — not a policy knob somebody could re-tune. The model
// tiers are the opposite case, and come from models.json escalation_order.
const RISK_ORDER: readonly RiskTier[] = ['low', 'medium', 'high'];

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
  const triggered: Record<string, boolean> = {
    'multi-agent-dispatch': agentIntents >= router.escalate_when.multi_agent_intents_min,
    // Zero RAW matches, not zero survivors: an intent that matched and was then
    // suppressed still routed the prompt somewhere, so the prompt is not
    // unrouted.
    'unrouted-scale':
      rawIds.size === 0 &&
      router.escalate_when.unrouted_scale_signals.some((signal) => scaleFlags[signal] === true),
    'requires-dispatch-plan': surviving.some((i) => i.requires_dispatch_plan),
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
    ambiguous: matched.length === 0,
    rebound: raw.rebound,
    generic_only: genericOnly(surviving, raw.specific),
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

// jq's ascii_downcase folds A-Z and nothing else. String.toLowerCase() also
// folds non-ASCII, and some of those foldings change a string's length (U+0130
// lowercases to two code units), which would shift every match index away from
// the answer the registry was written against.
function asciiDowncase(text: string): string {
  return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

// The jq bounded_contains helper, literally: a signal matches only where both
// of its edges sit against the start of the text, the end of the text, or a
// non-alphanumeric character. "add" matches "add endpoint" but never
// "addressed". Scanning with indexOf rather than a built regex is the invariant
// the port carries over — a signal is registry data, and turning data into a
// pattern is how a "*.sql" or a "CI/CD" becomes an injection.
function boundedContains(haystack: string, needle: string): boolean {
  // An empty signal would match at every position; refusing it keeps a
  // malformed registry row from routing every prompt to its intent.
  if (needle === '') return false;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    if (!isAlnum(haystack[i - 1]) && !isAlnum(haystack[i + needle.length])) return true;
  }
  return false;
}

// Oniguruma's POSIX [[:alnum:]] over UTF-8 is Unicode-aware: it accepts letters
// and decimal digits in any script, and rejects marks, "_" and punctuation.
// Verified against jq for U+00B2, U+2167, U+0663, U+0308, U+AC00, U+00B7 and "_".
// Known limit: a JS index into an astral character yields a lone surrogate,
// which reads as non-alphanumeric here and as alphanumeric in jq.
const ALNUM = /^[\p{Alphabetic}\p{Nd}]$/u;

// undefined is the text's own edge — start or end — which bounds a match.
function isAlnum(char: string | undefined): boolean {
  return char !== undefined && ALNUM.test(char);
}
