// Checks on registries/routing.json, decision-rules.json, capabilities.json and
// agents.json — the registries the routing hot path and the capability bindings
// read. The decision-kernel registries (models, intents, policy) are C16, in the
// 40-decision-registries family.
import { loadCapabilities } from '../registry/capabilities';
import { MODEL_TIER_IDS } from '../registry/models';
import type { RoutingDomain } from '../registry/routing';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import type { CheckContext } from './lib';
import {
  AGENTS,
  CAPABILITIES,
  agentRows,
  checkC14,
  readable,
  sortedUnique,
  type AgentRow,
} from './registries-coherence';

export const C6_FINDINGS = ['missing-agent'] as const;
export const C7_FINDINGS = ['missing-skill'] as const;
export const C8_FINDINGS = ['missing-rule'] as const;

export const C14_FINDINGS = [
  'malformed-json',
  'missing',
  'precedence-order-drift',
  'missing-agent',
  'missing-skill',
  'missing-rule',
  'duplicate-rule-id',
  'empty-then',
  'invalid-signal',
  'verification-source-drift',
  'verification-require-drift',
  'verification-rule-prose-missing',
  'verification-gate-prose-missing',
] as const;

export const C15_FINDINGS = [
  'missing',
  'capability-missing-agent',
  'capability-invalid-tier',
  'agent-invalid-tier',
  'agent-file-missing',
] as const;

export const C15b_FINDINGS = ['tier-mismatch'] as const;

declare module './codes' {
  interface CheckCodes {
    C6: (typeof C6_FINDINGS)[number];
    C7: (typeof C7_FINDINGS)[number];
    C8: (typeof C8_FINDINGS)[number];
    C14: (typeof C14_FINDINGS)[number];
    C15: (typeof C15_FINDINGS)[number];
    C15b: (typeof C15b_FINDINGS)[number];
  }
}

export const REGISTRIES_CHECKS: readonly Check[] = [
  { id: 'C6', codes: C6_FINDINGS, run: checkC6 },
  { id: 'C7', codes: C7_FINDINGS, run: checkC7 },
  { id: 'C8', codes: C8_FINDINGS, run: checkC8 },
  { id: 'C14', codes: C14_FINDINGS, run: checkC14 },
  { id: 'C15', codes: C15_FINDINGS, run: checkC15 },
  { id: 'C15b', codes: C15b_FINDINGS, run: checkC15b },
];

// ------------------------------------------ C6/C7/C8: routing targets all exist
// Pre-P2 these grepped a hand-written case ladder's echo literals; then they
// parsed the registry's hook_guidance strings. That string is DERIVED by
// src/kernel/route.ts from the structured fields now, so the three checks read
// the structured fields themselves — agent, skills[], rules[] — and the guidance
// string can no longer name a target the row does not declare.

function checkC6(ctx: CheckContext): CheckResult[] {
  const routing = routingDomains(ctx);
  if (routing === null) return [];
  const missing = sortedUnique(routing.map((domain) => domain.agent).filter(isNamed))
    .filter((agent) => !ctx.exists(`agents/${agent}.md`))
    .map((agent) => finding('C6', 'missing-agent', agent));
  return [result('C6', 'guidance agents all exist', missing)];
}

function checkC7(ctx: CheckContext): CheckResult[] {
  const routing = routingDomains(ctx);
  if (routing === null) return [];
  const missing = sortedUnique(routing.flatMap((domain) => domain.skills))
    .filter((skill) => !ctx.exists(`skills/${skill}/SKILL.md`))
    .map((skill) => finding('C7', 'missing-skill', skill));
  return [result('C7', 'guidance skills all exist', missing)];
}

function checkC8(ctx: CheckContext): CheckResult[] {
  const routing = routingDomains(ctx);
  if (routing === null) return [];
  const missing = sortedUnique(routing.flatMap((domain) => domain.rules))
    .filter((rule) => !ctx.exists(`rules/${rule}.md`))
    .map((rule) => finding('C8', 'missing-rule', rule));
  return [result('C8', 'guidance rules all exist', missing)];
}

// -------------------------------------- C15: capability/agent registries
// registries/capabilities.json + registries/agents.json (Phase 1
// registry-kernel, docs/specs/2026-08-05-phase1-registry-kernel-design.md).
// JSON validity is already covered by C14's registries/*.json loop.

function checkC15(ctx: CheckContext): CheckResult[] {
  return [...capabilityBindings(ctx), ...agentRegistry(ctx)];
}

function capabilityBindings(ctx: CheckContext): CheckResult[] {
  if (!ctx.exists(CAPABILITIES)) {
    return [result('C15', 'registries/capabilities.json is present', [finding('C15', 'missing', CAPABILITIES)])];
  }
  const registry = readable(() => loadCapabilities(ctx.root));
  if (registry === null) return [];
  const missing = sortedUnique(registry.capabilities.map((capability) => capability.agent).filter(isNamed))
    .filter((agent) => !ctx.exists(`agents/${agent}.md`))
    .map((agent) => finding('C15', 'capability-missing-agent', agent));
  const tiers = registry.capabilities
    .filter((capability) => !isModelTier(capability.model_tier))
    .map((capability) => finding('C15', 'capability-invalid-tier', capability.id));
  return [
    result('C15', 'every capabilities.json agent binding resolves', missing),
    result('C15', 'every capabilities.json entry declares a valid model tier', tiers),
  ];
}

function agentRegistry(ctx: CheckContext): CheckResult[] {
  if (!ctx.exists(AGENTS)) {
    return [result('C15', 'registries/agents.json is present', [finding('C15', 'missing', AGENTS)])];
  }
  const rows = agentRows(ctx);
  if (rows === null) return [];
  const tiers: Finding[] = [];
  const files: Finding[] = [];
  for (const row of rows) {
    if (row.tier === null || !isModelTier(row.tier)) tiers.push(finding('C15', 'agent-invalid-tier', row.name));
    if (!ctx.exists(`agents/${row.name}.md`)) files.push(finding('C15', 'agent-file-missing', row.name));
  }
  return [
    result('C15', 'every agents.json entry declares a valid model tier', tiers),
    result('C15', 'every agents.json entry resolves to a file under agents/', files),
  ];
}

// -------------------------------------- C15b: capability tier <-> agent tier
// A capability's model_tier must agree with its bound agent's tier in
// agents.json — the tier is declared by the agent (its frontmatter), and nothing
// else was comparing the two registries when they drifted apart.

function checkC15b(ctx: CheckContext): CheckResult[] {
  if (!ctx.exists(CAPABILITIES) || !ctx.exists(AGENTS)) return [];
  const registry = readable(() => loadCapabilities(ctx.root));
  const rows = agentRows(ctx);
  if (registry === null || rows === null) return [];
  const declared = tierByAgent(rows);
  const mismatched = registry.capabilities
    .filter((capability) => {
      const tier = declared.get(capability.agent);
      // An agent the registry does not describe is not a mismatch: bash's
      // `$tiers[.agent] != null` skipped it, and C15 already reports a binding
      // that resolves to nothing.
      return tier !== undefined && tier !== capability.model_tier;
    })
    .map((capability) => finding('C15b', 'tier-mismatch', capability.id));
  return [result('C15b', "every capability model_tier agrees with its agent's tier", mismatched)];
}

// -------------------------------------------------------------------- internals

// The bash validated a tier against a literal alternation. The tier vocabulary
// is owned by registries/models.json and already a compile-time union here, so
// the check reads that instead of carrying a fifth copy of the four names.
function isModelTier(value: string): boolean {
  return MODEL_TIER_IDS.some((tier) => tier === value);
}

// First row wins, matching the `head -1` the hook readers use: a duplicate name
// does not silently retier the earlier one.
function tierByAgent(rows: readonly AgentRow[]): Map<string, string> {
  const tiers = new Map<string, string>();
  for (const row of rows) {
    if (row.tier !== null && !tiers.has(row.name)) tiers.set(row.name, row.tier);
  }
  return tiers;
}

// A routing.json that is missing or unparsable answers with nothing rather than
// a finding: the bash guard was a bare `return 1`, and C14 owns both defects.
function routingDomains(ctx: CheckContext): RoutingDomain[] | null {
  const routing = readable(() => ctx.registries.routing);
  return routing === null ? null : routing.domains;
}

function isNamed(value: string | null): value is string {
  return value !== null && value !== '';
}
