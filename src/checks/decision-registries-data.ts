// The registry readers C16 uses.
//
// Why raw JSON and not src/registry/*.ts: the typed loaders exist to hand the
// kernel a normalized answer, and normalizing is exactly what C16 must not do.
// loadIntents() coerces an out-of-vocabulary risk_floor to null and never reads
// hook_mirrored at all; loadPolicy() reads neither gates.ladder nor the retry
// bound; both would answer for a file that no longer says what the check is
// asking about. A check that guards the registries has to read the registries.
//
// Every reader below therefore mirrors what the jq expressions in
// scripts/checks/40-decision-registries.sh saw, including the distinction
// between an absent key and a null one, which two assertions depend on.
import { isRecord, readJsonFile, stringArray } from '../lib/json';
import { registryPath, type RegistryName } from '../registry/load';
import { finding, result, type CheckResult } from './findings';

export interface RawTier {
  readonly id: string;
  readonly model: string;
  // jq's `.escalates_to` answers null for an absent key and for an explicit
  // null alike, and the chain assertion compares against null, so the two
  // collapse here the same way.
  readonly escalatesTo: string | null;
}

export interface RawWorkType {
  readonly id: string;
  readonly tier: string;
}

export interface RawModels {
  readonly tiers: readonly RawTier[];
  readonly escalationOrder: readonly string[];
  readonly workTypes: readonly RawWorkType[];
}

export interface RawIntent {
  readonly id: string;
  readonly rules: readonly string[];
  readonly skills: readonly string[];
  readonly agents: readonly string[];
  readonly signals: readonly string[];
  readonly note: string;
  readonly domain: string | null;
  readonly hookMirrored: boolean;
  readonly modelTier: string | null;
  // Kept unreduced: the assertion is whether the value on disk is one of three
  // words, so narrowing it to a tier here would answer the question by fiat.
  readonly riskFloor: unknown;
}

export interface RawDomain {
  readonly id: string;
  readonly rules: readonly string[];
}

export interface RawPolicy {
  readonly riskAggregation: string;
  readonly riskInputs: readonly string[];
  readonly autonomyLevels: readonly string[];
  readonly ceilingByRisk: Readonly<Record<string, unknown>>;
  readonly gateLadder: readonly string[];
  // Per tier key, that tier's gate keys. The values are prose statuses the
  // coverage assertion never reads.
  readonly gatesByRisk: Readonly<Record<string, readonly string[]>>;
  readonly neverRetryCount: number;
  readonly retryMaxAttempts: unknown;
  readonly retryEscalations: unknown;
}

// Throws KernelError when the file is absent or unparseable — the two cases the
// bash `[ -f "$X" ] || bad "... missing"` guard covered, plus the one it did not.
export function readRegistry(root: string, name: RegistryName): Record<string, unknown> {
  const raw = readJsonFile(registryPath(root, name));
  return isRecord(raw) ? raw : {};
}

export function readModels(root: string): RawModels {
  const raw = readRegistry(root, 'models.json');
  return {
    tiers: rows(raw['tiers']).map((tier) => ({
      id: text(tier['id']),
      model: text(tier['model']),
      escalatesTo: optional(tier['escalates_to']),
    })),
    escalationOrder: stringArray(raw['escalation_order']),
    workTypes: rows(raw['work_types']).map((work) => ({ id: text(work['id']), tier: text(work['tier']) })),
  };
}

export function readIntents(root: string): readonly RawIntent[] {
  return rows(readRegistry(root, 'intents.json')['intents']).map((intent) => ({
    id: text(intent['id']),
    rules: stringArray(intent['rules']),
    skills: stringArray(intent['skills']),
    agents: stringArray(intent['agents']),
    signals: stringArray(intent['signals']),
    note: text(intent['note']),
    // `has("domain") and .domain != null` — an absent key and an explicit null
    // are one answer here, which is what the hook_mirrored assertion compares.
    domain: optional(intent['domain']),
    hookMirrored: intent['hook_mirrored'] === true,
    modelTier: optional(intent['model_tier']),
    riskFloor: intent['risk_floor'],
  }));
}

// routing.json absent or malformed answers with no domains rather than throwing:
// the bash read it with an unguarded `jq`, so a broken file left the "claimed
// exactly once" loop empty and made every foreign key dangle. Both effects are
// preserved by an empty domain list, and neither is C16's finding to report —
// C14 owns routing.json's well-formedness.
export function readRoutingDomains(root: string): readonly RawDomain[] {
  let raw: Record<string, unknown>;
  try {
    raw = readRegistry(root, 'routing.json');
  } catch {
    return [];
  }
  return rows(raw['domains']).map((domain) => ({ id: text(domain['id']), rules: stringArray(domain['rules']) }));
}

export function readPolicy(root: string): RawPolicy {
  const raw = readRegistry(root, 'policy.json');
  const risk = record(raw['risk']);
  const autonomy = record(raw['autonomy']);
  const gates = record(raw['gates']);
  const retry = record(raw['retry']);
  const neverRetry = retry['never_retry'];
  const byRisk: Record<string, readonly string[]> = {};
  for (const [tier, value] of Object.entries(record(gates['by_risk']))) {
    byRisk[tier] = Object.keys(record(value));
  }
  return {
    riskAggregation: text(risk['aggregation']),
    riskInputs: rows(risk['inputs']).map((input) => text(input['id'])),
    autonomyLevels: rows(autonomy['levels']).map((level) => text(level['id'])),
    ceilingByRisk: record(autonomy['ceiling_by_risk']),
    gateLadder: stringArray(gates['ladder']),
    gatesByRisk: byRisk,
    neverRetryCount: Array.isArray(neverRetry) ? neverRetry.length : 0,
    retryMaxAttempts: retry['max_attempts_per_unit'] ?? null,
    retryEscalations: retry['escalations'] ?? null,
  };
}

// ------------------------------------------------------------------ internals

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optional(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// `group_by(.) | map(select(length>1)) | flatten | unique` — the values that
// occur more than once, sorted, each named once.
export function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

// `sort -u` over a flattened list.
export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

// Subjects are rendered after a colon on one line, so a value carrying a space
// or a newline would break the finding in two. Registry ids never do; a signal
// phrase and a malformed scalar can, and both reach a subject here.
export function subjectText(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return 'absent';
  const collapsed = value.trim().replace(/\s+/g, '-');
  return collapsed === '' ? 'empty' : collapsed;
}

// The bash guard was `[ -f "$X" ] || bad "registries/X missing"`; an unparseable
// file fell through it and left every jq in the block answering empty. Both are
// one defect — the registry cannot be read — and both end the block, so the
// three blocks report it the same way.
export function unreadableRegistry(path: string): CheckResult {
  return result('C16', `${path} is readable`, [finding('C16', 'registry-unreadable', path)]);
}
