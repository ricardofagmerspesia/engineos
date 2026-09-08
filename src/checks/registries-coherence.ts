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
  return [jsonValidity(ctx), ...routingCoherence(ctx), ...decisionRuleCoherence(ctx)];
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
  ];
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
