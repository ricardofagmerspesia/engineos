import { globMatch } from '../lib/glob';
import type { RoutingDomain } from '../registry/routing';
import type { Registries, RiskTier } from './context';

// One route section, two declared-fact forms: a path routes to a domain, a
// prompt routes to intents. Callers narrow on the key they declared facts for.
export type RouteSection = PathRouteSection | IntentRouteSection;

export type PathRouteSection =
  | { domain: null; excluded: boolean }
  | {
      domain: string;
      rules: string[];
      skills: string[];
      agent: string | null;
      risk_floor: RiskTier | null;
      hook_guidance: string;
      excluded: false;
    };

// The ten fields cmd_route_intent projected, in its key order.
export interface IntentMatch {
  id: string;
  title: string;
  rules: string[];
  skills: string[];
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
      // agent, risk_floor, hook_guidance, excluded.
      return {
        domain: dom.id,
        rules: dom.rules,
        skills: dom.skills,
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
// each intent's note.
export function routeByIntent(text: string, regs: Registries): IntentRouteSection {
  const lower = asciiDowncase(text);
  const matches: IntentMatch[] = [];
  for (const intent of regs.intents.intents) {
    if (!intent.signals.some((signal) => boundedContains(lower, asciiDowncase(signal)))) continue;
    matches.push({
      id: intent.id,
      title: intent.title,
      rules: intent.rules,
      skills: intent.skills,
      agents: intent.agents,
      commands: intent.commands,
      mcp: intent.mcp,
      model_tier: intent.model_tier,
      risk_floor: intent.risk_floor,
      note: intent.note,
    });
  }
  return { matches, ambiguous: matches.length === 0 };
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
