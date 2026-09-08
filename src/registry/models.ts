import { isRecord, KernelError } from '../lib/json';
import { loadRegistry } from './load';

// registries/models.json is the machine-readable form of rules/models.md's
// assignment table. Unlike intents.json, whose optional fields have a defined
// jq answer of null, every field here is load-bearing: a tier row without its
// model, or a work type without its tier, cannot answer "which model does this
// work run on". The bash pipeline answered a row like that with an empty
// document and exit 0 — silence where the caller expected a model name — so the
// loader refuses the row instead of defaulting it.

// The tier ids, in the order registries/models.json lists them, as a literal
// union a caller cannot mistype. `ModelTier` below is the loaded ROW (id, model,
// escalation target); `ModelTierId` is the id alone, which is what a span field
// and an agent dispatch carry. The two names stay separate because the row is
// data read at runtime and the id is a compile-time vocabulary.
//
// `as const` rather than a hand-written union beside a hand-written array: one
// declaration, so the literals and the list cannot drift. models.test.ts pins
// the list to .tiers[].id, order included.
export const MODEL_TIER_IDS = ['most-capable', 'design', 'build', 'cheap'] as const;

export type ModelTierId = (typeof MODEL_TIER_IDS)[number];

export interface ModelTier {
  id: string;
  model: string;
  escalates_to: string | null;
}

export interface WorkType {
  id: string;
  title: string;
  tier: string;
}

export interface ModelsRegistry {
  version: string;
  tiers: ModelTier[];
  escalation_order: string[];
  work_types: WorkType[];
}

export function loadModels(root: string): ModelsRegistry {
  const raw = loadRegistry(root, 'models.json');
  const r = isRecord(raw) ? raw : {};
  return {
    version: requireString(r['version'], 'version'),
    tiers: requireRows(r['tiers'], 'tiers').map((tier, index) => ({
      id: requireString(tier['id'], `tiers[${index}].id`),
      model: requireString(tier['model'], `tiers[${index}].model`),
      // The top of the ladder stores null; an absent key reads the same way,
      // because that is what jq's `.escalates_to` answered for both.
      escalates_to: optionalString(tier['escalates_to'], `tiers[${index}].escalates_to`),
    })),
    escalation_order: requireStringArray(r['escalation_order'], 'escalation_order'),
    work_types: requireRows(r['work_types'], 'work_types').map((work, index) => ({
      id: requireString(work['id'], `work_types[${index}].id`),
      title: requireString(work['title'], `work_types[${index}].title`),
      tier: requireString(work['tier'], `work_types[${index}].tier`),
    })),
  };
}

function fail(field: string, expected: string): never {
  throw new KernelError(`registries/models.json: ${field} must be ${expected}`);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') fail(field, 'a non-empty string');
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value === '') fail(field, 'a non-empty string or null');
  return value;
}

function requireRows(value: unknown, field: string): Record<string, unknown>[] {
  const rows: unknown[] = Array.isArray(value) ? value : fail(field, 'an array');
  return rows.map((row, index) => (isRecord(row) ? row : fail(`${field}[${index}]`, 'an object')));
}

function requireStringArray(value: unknown, field: string): string[] {
  const items: unknown[] = Array.isArray(value) ? value : fail(field, 'an array');
  return items.map((item, index) => requireString(item, `${field}[${index}]`));
}
