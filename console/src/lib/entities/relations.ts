// Real relations between skills and the rest of the capability graph.
//
// `SkillEntity.usedByAgents` and `.dependsOnRules` shipped as fixed `[]` with a
// note saying the Agents ticket would fill them. Empty is not neutral: the
// validation layer's only warn path — "disabling this skill affects N agent(s)"
// — can never fire while the list is always empty, so the console let an
// operator disable a skill that three agents name and said nothing. A relation
// that is always empty is worse than an absent field, because the UI presents
// it as an answer.
//
// Pure and base-path-injected, like entities/skills.ts: the API layer decides
// the real repo root, and a test can point this at a fixture tree.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface SkillRelations {
  usedByAgents: string[];
  dependsOnRules: string[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Body of a markdown file with its frontmatter block removed, or the whole file when it has none. */
function bodyOf(raw: string): string {
  const match = FRONTMATTER_RE.exec(raw);
  return match ? raw.slice(match[0].length) : raw;
}

function readIfPresent(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/**
 * A reference is a whole-token mention, so `retro` never matches `retrospective`
 * and `adr` never matches `adrenaline`. Deliberately not a substring scan: this
 * feeds a warning an operator acts on, and a false positive there teaches them
 * to ignore the warning.
 */
function mentions(haystack: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`).test(haystack);
}

interface GraphSources {
  agentBodies: Map<string, string>;
  /** domain/intent id -> { agents, skills } as declared in the registries. */
  bindings: Array<{ agents: string[]; skills: string[] }>;
  ruleIds: string[];
}

function safeParseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // A malformed registry is a real defect, but it belongs to the integrity
    // checks, not here: relations degrade to "nothing declared" rather than
    // taking the whole skills page down with a parse error.
    return null;
  }
}

function collectBindings(basePath: string): GraphSources['bindings'] {
  const bindings: GraphSources['bindings'] = [];

  const routing = safeParseJson(readIfPresent(path.join(basePath, 'registries', 'routing.json'))) as
    | { domains?: Array<{ agent?: string | null; agents?: string[]; skills?: string[] }> }
    | null;
  for (const domain of routing?.domains ?? []) {
    const agents = [...(domain.agents ?? []), ...(domain.agent ? [domain.agent] : [])];
    bindings.push({ agents, skills: domain.skills ?? [] });
  }

  const intents = safeParseJson(readIfPresent(path.join(basePath, 'registries', 'intents.json'))) as
    | { intents?: Array<{ agents?: string[]; skills?: string[] }> }
    | null;
  for (const intent of intents?.intents ?? []) {
    bindings.push({ agents: intent.agents ?? [], skills: intent.skills ?? [] });
  }

  return bindings;
}

function collectAgentBodies(basePath: string): Map<string, string> {
  const dir = path.join(basePath, 'agents');
  const bodies = new Map<string, string>();
  if (!existsSync(dir)) return bodies;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const raw = readIfPresent(path.join(dir, entry.name));
    if (raw === null) continue;
    bodies.set(entry.name.replace(/\.md$/, ''), bodyOf(raw));
  }
  return bodies;
}

function collectRuleIds(basePath: string): string[] {
  const dir = path.join(basePath, 'rules');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.replace(/\.md$/, ''))
    .sort();
}

/**
 * Reads every source of skill relations once. Callers resolve many skills
 * against one graph instead of re-reading `agents/`, `rules/` and the
 * registries per skill — the skills page asks for all of them at once.
 */
export function loadGraph(basePath: string): GraphSources {
  return {
    agentBodies: collectAgentBodies(basePath),
    bindings: collectBindings(basePath),
    ruleIds: collectRuleIds(basePath),
  };
}

/**
 * Two independent grounds count as "this agent uses this skill", and both are
 * real: a registry that binds the agent and the skill to the same domain or
 * intent, and an agent whose own prose names the skill. Neither alone is
 * enough — the registries miss agents that invoke a skill directly, and prose
 * misses agents wired only through routing.
 */
export function resolveSkillRelations(
  graph: GraphSources,
  skillId: string,
  skillBody: string,
): SkillRelations {
  const agents = new Set<string>();

  for (const binding of graph.bindings) {
    if (!binding.skills.includes(skillId)) continue;
    for (const agent of binding.agents) {
      if (agent) agents.add(agent);
    }
  }

  for (const [agentId, body] of graph.agentBodies) {
    if (mentions(body, skillId)) agents.add(agentId);
  }

  const dependsOnRules = graph.ruleIds.filter(
    (rule) => skillBody.includes(`rules/${rule}.md`) || mentions(skillBody, `${rule}.md`),
  );

  return {
    usedByAgents: [...agents].sort(),
    dependsOnRules,
  };
}
