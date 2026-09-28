import { loadRegistry } from './load';
import { strictReader } from './strict';

// registries/capabilities.json — the workflow-capability -> agent binding a
// consumer reads to answer "what handles this step", and the vocabulary a span's
// `capability_id` must come from.
//
// The id union below is the reason check C27f could be deleted: bash validated a
// span writer's --capability-id by grepping the writers after the fact, so a
// wrong id was caught by a Check rather than by the compiler and, until that
// Check existed, not caught at all. Here a wrong id does not compile.
//
// `as const` rather than a hand-written union with a hand-written array: the
// literals and the list are one declaration, so the two cannot drift, and
// capabilities.test.ts pins the list to the JSON.
export const CAPABILITY_IDS = [
  'author-spec',
  'implement',
  'validate',
  'document',
  'security-review',
  'route',
  'design-agent-topology',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export interface Capability {
  id: string;
  title: string;
  agent: string;
  model_tier: string;
  risk_floor: string;
}

export interface CapabilitiesRegistry {
  version: string;
  model_tiers: string[];
  capabilities: Capability[];
}

const reader = strictReader('capabilities.json');

export function loadCapabilities(root: string): CapabilitiesRegistry {
  const document = reader.requireRecord(loadRegistry(root, 'capabilities.json'), '');
  return {
    version: reader.requireString(document['version'], '.version'),
    model_tiers: reader.requireStrings(document['model_tiers'], '.model_tiers'),
    // Every field of a row is load-bearing: a capability without its agent or
    // its tier cannot answer the question the registry exists to answer, so the
    // loader refuses the row rather than defaulting it (as models.ts does).
    capabilities: reader.requireRows(document['capabilities'], '.capabilities').map((row, i) => ({
      id: reader.requireString(row['id'], `.capabilities[${i}].id`),
      title: reader.requireString(row['title'], `.capabilities[${i}].title`),
      agent: reader.requireString(row['agent'], `.capabilities[${i}].agent`),
      model_tier: reader.requireString(row['model_tier'], `.capabilities[${i}].model_tier`),
      risk_floor: reader.requireString(row['risk_floor'], `.capabilities[${i}].risk_floor`),
    })),
  };
}
