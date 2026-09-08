// C14 — registries are coherent — and the low-level registry readers the rest
// of the 20-registries family shares. The dependency runs one way: registries.ts
// imports this file, never the reverse.
//
// C14 reads its registries raw rather than through the typed loaders on purpose.
// The typed loaders are strict: a decision rule missing `source` makes
// loadDecisionRules throw, and one malformed row would then hide every other
// finding in the same file — which is exactly what this check exists to report.
import { join } from 'node:path';
import { isRecord, readJsonFile, stringArray, KernelError } from '../lib/json';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { CheckContext } from './lib';

const ROUTING = 'registries/routing.json';
const DECISION_RULES = 'registries/decision-rules.json';
export const CAPABILITIES = 'registries/capabilities.json';
export const AGENTS = 'registries/agents.json';

// A registry this check cannot parse is not this check's finding: C14's first
// assertion owns JSON validity, and every other assertion that needs the file
// reports nothing rather than a second copy of the same defect. That is the
// bash `|| return 1` / empty-jq-output behaviour, made explicit.
export function readable<T>(load: () => T): T | null {
  try {
    return load();
  } catch (error) {
    if (error instanceof KernelError) return null;
    throw error;
  }
}

export interface AgentRow {
  readonly name: string;
  // null when the row declares no string model_tier at all, which reads as
  // invalid for C15 and as "no opinion" for C15b.
  readonly tier: string | null;
}

// registries/agents.json read raw, because both callers need the tier EXACTLY as
// written: src/registry/agents.ts maps an unknown tier to null for the hook that
// must still announce a dispatch, and a check that wants to report the bad value
// cannot use a loader that erases it.
export function agentRows(ctx: CheckContext): AgentRow[] | null {
  const document = readable(() => readJsonFile(join(ctx.root, AGENTS)));
  if (document === null) return null;
  const rows: unknown = isRecord(document) ? document['agents'] : undefined;
  if (!Array.isArray(rows)) return [];
  const agents: AgentRow[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const name = row['name'];
    if (typeof name !== 'string' || name === '') continue;
    const tier: unknown = row['model_tier'];
    agents.push({ name, tier: typeof tier === 'string' ? tier : null });
  }
  return agents;
}

export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(byteOrder);
}

export function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// The point of registries/routing.json is that the CLAUDE.md table, the hook map
// and the registry can no longer drift apart in silence.
export function checkC14(ctx: CheckContext): CheckResult[] {
  return [
    jsonValidity(ctx),
    ...routingCoherence(ctx),
    ...decisionRuleCoherence(ctx),
    ...capabilityCoherence(ctx),
  ];
}

// -------------------------------------------------------------------- internals

function jsonValidity(ctx: CheckContext): CheckResult {
  const broken: Finding[] = [];
  for (const name of ctx.list('registries')) {
    if (!name.endsWith('.json')) continue;
    const relative = `registries/${name}`;
    if (!parsesAsJson(join(ctx.root, relative))) broken.push(finding('C14', 'malformed-json', relative));
  }
  return result('C14', 'registries are valid JSON', broken);
}

// `readable` cannot answer this one: a registry holding the literal `null`
// parses, and the sentinel could not tell that from a read error.
function parsesAsJson(absolutePath: string): boolean {
  try {
    readJsonFile(absolutePath);
    return true;
  } catch (error) {
    if (error instanceof KernelError) return false;
    throw error;
  }
}

function routingCoherence(ctx: CheckContext): CheckResult[] {
  if (!ctx.exists(ROUTING)) {
    return [result('C14', 'registries/routing.json is present', [finding('C14', 'missing', ROUTING)])];
  }
  const routing = readable(() => ctx.registries.routing);
  if (routing === null) return [];
  const domainOrder = routing.domains.map((domain) => domain.id);
  const drift = firstDifference(routing.precedence, domainOrder);
  const targets: Finding[] = [];
  for (const agent of sortedUnique(routing.domains.map((d) => d.agent).filter(isPresent))) {
    if (!ctx.exists(`agents/${agent}.md`)) targets.push(finding('C14', 'missing-agent', agent));
  }
  for (const skill of sortedUnique(routing.domains.flatMap((d) => d.skills))) {
    if (!ctx.exists(`skills/${skill}/SKILL.md`)) targets.push(finding('C14', 'missing-skill', skill));
  }
  for (const rule of sortedUnique(routing.domains.flatMap((d) => d.rules))) {
    if (!ctx.exists(`rules/${rule}.md`)) targets.push(finding('C14', 'missing-rule', rule));
  }
  return [
    result('C14', 'registry precedence covers every domain in map order',
      drift === null ? [] : [finding('C14', 'precedence-order-drift', drift)]),
    result('C14', 'registry agents, skills and rules all exist', targets),
  ];
}

// The whole orders are what the bash line printed; a subject cannot carry a
// space, so the finding names the first entry the two lists disagree on, which
// is the one a reader has to move anyway.
function firstDifference(precedence: readonly string[], domainOrder: readonly string[]): string | null {
  const length = Math.max(precedence.length, domainOrder.length);
  for (let index = 0; index < length; index += 1) {
    const listed = precedence[index];
    const declared = domainOrder[index];
    if (listed === declared) continue;
    return listed ?? declared ?? null;
  }
  return null;
}

function decisionRuleCoherence(ctx: CheckContext): CheckResult[] {
  if (!ctx.exists(DECISION_RULES)) {
    return [result('C14', 'registries/decision-rules.json is present', [finding('C14', 'missing', DECISION_RULES)])];
  }
  const document = readable(() => readJsonFile(join(ctx.root, DECISION_RULES)));
  if (document === null) return [];
  const rows: unknown = isRecord(document) ? document['rules'] : undefined;
  const rules = Array.isArray(rows) ? rows.filter(isRecord) : [];
  return [
    result('C14', 'decision rule ids are unique', duplicateIds(rules)),
    result('C14', 'every decision rule requires or prefers something', emptyOutcomes(rules)),
    result('C14', 'every decision rule signal is a valid regex', invalidSignals(rules)),
    result('C14', 'verification policy agrees across registry, verification rule and gate', verificationDrift(ctx, rules)),
    result('C14', 'every decision rule source names a file that exists', missingSources(ctx, rules)),
  ];
}

// C14 pinned ONE rule's source (rule-verification, below). Every other `source`
// was prose nobody joined to the tree, so a rule could cite rules/no-such.md and
// validate clean — the citation is the only thing that makes a registry row
// arguable, and a dangling one is worse than none.
//
// The token class is deliberately narrow: a source is a sentence, not a path, so
// only the eight prose-layer directories and the three root markdown files are
// recognised. A source with no such token ("adapted from the analyzed corpus")
// reports nothing.
//
// The leading lookbehind rather than \b: `decision-rules/rules.json` inside a
// prose source would otherwise match at the `rules` of `decision-rules` and be
// reported as a missing `rules/rules.json`, which is a finding about the regex
// rather than about the tree.
const SOURCE_TOKEN =
  /(?<![A-Za-z0-9_/-])(?:(?:rules|docs|commands|skills|agents|templates|registries|patterns)\/[A-Za-z0-9._\/-]+|(?:CLAUDE|AGENTS|README)\.md\b)/g;

function missingSources(ctx: CheckContext, rules: readonly Row[]): Finding[] {
  const missing: Finding[] = [];
  rules.forEach((rule, index) => {
    const declared = rule['source'];
    if (typeof declared !== 'string') return;
    for (const token of sortedUnique(sourceTokens(declared))) {
      if (sourceResolves(ctx, token)) continue;
      missing.push(finding('C14', 'source-file-missing', `${ruleName(rule, index)}:${token}`));
    }
  });
  return missing;
}

function sourceTokens(source: string): string[] {
  return (source.match(SOURCE_TOKEN) ?? [])
    // Trailing sentence punctuation belongs to the prose, not to the path.
    .map((token) => token.replace(/[./-]+$/, ''))
    .filter((token) => token !== '');
}

// A skill is cited by its directory (`skills/adr`); the file that carries it is
// SKILL.md. Everything else is cited by the path it lives at.
function sourceResolves(ctx: CheckContext, token: string): boolean {
  if (ctx.exists(token)) return true;
  return !token.endsWith('.md') && ctx.exists(`${token}/SKILL.md`);
}

// -------------------------------------- capability <-> agent referential joins
// rules/observability.md: a span's `capability_id` is "always an id from
// registries/capabilities.json". Nothing joined the two registries, so an agent
// row could carry an id no capability defines — and the claim held only by
// convention.
//
// Read raw, like the rest of C14: loadCapabilities refuses a malformed row, and
// one bad row must not hide the join for every other one.
function capabilityCoherence(ctx: CheckContext): CheckResult[] {
  if (!ctx.exists(CAPABILITIES) || !ctx.exists(AGENTS)) return [];
  const capabilities = capabilityRows(ctx);
  const agents = agentCapabilityRows(ctx);
  if (capabilities === null || agents === null) return [];
  const declaredIds = new Set(capabilities.map((row) => row.id));
  const agentNames = new Set(agents.map((row) => row.name));
  const dangling: Finding[] = [];
  for (const agent of agents) {
    for (const id of sortedUnique(agent.capabilityIds)) {
      if (declaredIds.has(id)) continue;
      dangling.push(finding('C14', 'dangling-capability-id', `${agent.name}:${id}`));
    }
  }
  const unknownAgents: Finding[] = [];
  for (const capability of capabilities) {
    if (capability.agent === null || agentNames.has(capability.agent)) continue;
    unknownAgents.push(finding('C14', 'unknown-capability-agent', `${capability.id}:${capability.agent}`));
  }
  return [
    result('C14', 'agent capability_ids resolve to capabilities.json', dangling),
    result('C14', 'capability agents exist in agents.json', unknownAgents),
  ];
}

interface CapabilityBinding {
  readonly id: string;
  readonly agent: string | null;
}

function capabilityRows(ctx: CheckContext): CapabilityBinding[] | null {
  const document = readable(() => readJsonFile(join(ctx.root, CAPABILITIES)));
  if (document === null) return null;
  const rows: unknown = isRecord(document) ? document['capabilities'] : undefined;
  if (!Array.isArray(rows)) return [];
  const bindings: CapabilityBinding[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = row['id'];
    if (typeof id !== 'string' || id === '') continue;
    const agent = row['agent'];
    bindings.push({ id, agent: typeof agent === 'string' && agent !== '' ? agent : null });
  }
  return bindings;
}

interface AgentCapabilities {
  readonly name: string;
  readonly capabilityIds: string[];
}

// A row without `capability_ids` declares none, which is a valid answer: most
// agents bind to no workflow capability at all.
function agentCapabilityRows(ctx: CheckContext): AgentCapabilities[] | null {
  const document = readable(() => readJsonFile(join(ctx.root, AGENTS)));
  if (document === null) return null;
  const rows: unknown = isRecord(document) ? document['agents'] : undefined;
  if (!Array.isArray(rows)) return [];
  const agents: AgentCapabilities[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const name = row['name'];
    if (typeof name !== 'string' || name === '') continue;
    agents.push({ name, capabilityIds: stringArray(row['capability_ids']) });
  }
  return agents;
}

type Row = Record<string, unknown>;

function duplicateIds(rules: readonly Row[]): Finding[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const rule of rules) {
    const id = rule['id'];
    if (typeof id !== 'string') continue;
    if (seen.has(id)) duplicated.add(id);
    seen.add(id);
  }
  return [...duplicated].sort(byteOrder).map((id) => finding('C14', 'duplicate-rule-id', id));
}

function emptyOutcomes(rules: readonly Row[]): Finding[] {
  const empty: Finding[] = [];
  rules.forEach((rule, index) => {
    const outcome: Record<string, unknown> = isRecord(rule['then']) ? rule['then'] : {};
    const prefer = outcome['prefer'];
    if (stringArray(outcome['require']).length > 0) return;
    if (typeof prefer === 'string' && prefer !== '') return;
    empty.push(finding('C14', 'empty-then', ruleName(rule, index)));
  });
  return empty;
}

// A signal that is not a valid regex would silently never match in the kernel's
// keyword tier. The subject is the owning rule rather than the pattern: a
// pattern carries spaces, and a finding's subject cannot.
function invalidSignals(rules: readonly Row[]): Finding[] {
  const broken = new Set<string>();
  rules.forEach((rule, index) => {
    for (const signal of stringArray(rule['signals'])) {
      try {
        // Constructed only for its throw: a pattern the kernel cannot compile
        // never matches, so the gate it guards silently disappears.
        new RegExp(signal);
      } catch {
        broken.add(ruleName(rule, index));
      }
    }
  });
  return [...broken].sort(byteOrder).map((name) => finding('C14', 'invalid-signal', name));
}

// Verification policy is deliberately conditional on task scope. A plain
// referential check cannot catch the registry saying "always test" while the
// owning rule says tests are opt-in, so the behavioural agreement is pinned:
// the rule's source, the exact artifacts it requires, and the two sentences in
// the prose that say the requirement is conditional.
const VERIFICATION_SOURCE = 'rules/verification.md';
const VERIFICATION_REQUIRE = 'lint output-shown tests-when-in-scope typecheck';
const VERIFICATION_RULE_SENTENCE = 'Tests join the gate ONLY when tests were ON';
const VERIFICATION_GATE_SENTENCE = '`rules/verification.md` owns which checks are in';

function verificationDrift(ctx: CheckContext, rules: readonly Row[]): Finding[] {
  const rule = rules.find((candidate) => candidate['id'] === 'rule-verification');
  const declaredSource: unknown = rule?.['source'];
  const source = typeof declaredSource === 'string' ? declaredSource : '';
  const outcome: Record<string, unknown> = rule !== undefined && isRecord(rule['then']) ? rule['then'] : {};
  const required = stringArray(outcome['require']).slice().sort(byteOrder);
  const drift: Finding[] = [];
  if (source !== VERIFICATION_SOURCE) {
    drift.push(finding('C14', 'verification-source-drift', source === '' ? 'absent' : source));
  }
  if (required.join(' ') !== VERIFICATION_REQUIRE) {
    drift.push(finding('C14', 'verification-require-drift', required.length === 0 ? 'absent' : required.join(',')));
  }
  if (!(ctx.readText('rules/verification.md') ?? '').includes(VERIFICATION_RULE_SENTENCE)) {
    drift.push(finding('C14', 'verification-rule-prose-missing', 'rules/verification.md'));
  }
  if (!(ctx.readText('rules/gates.md') ?? '').includes(VERIFICATION_GATE_SENTENCE)) {
    drift.push(finding('C14', 'verification-gate-prose-missing', 'rules/gates.md'));
  }
  return drift;
}

function ruleName(rule: Row, index: number): string {
  const id = rule['id'];
  return typeof id === 'string' && id !== '' ? id : `rules-${index}`;
}

function isPresent(value: string | null): value is string {
  return value !== null && value !== '';
}
