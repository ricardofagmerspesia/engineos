// Parser for `registries/models.json` — the model-tier vertical.
//
// Read-only. `rules/models.md`'s assignment table is checked against this file
// by an integrity check (C16), so an edit made here without moving the prose
// turns that check red instead of changing behaviour. Editing tiers from the
// console is a real feature; it needs the prose mirror in the same transaction,
// and that is not this unit.

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { ModelEntity } from './types';

interface ModelsRegistry {
  tiers?: Array<{ id?: string; model?: string; escalates_to?: string | null }>;
  work_types?: Array<{ id?: string; title?: string; tier?: string }>;
}

interface AgentsRegistry {
  agents?: Array<{ name?: string; model_tier?: string }>;
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    // A malformed registry is a defect the integrity checks own. Here it means
    // "nothing declared" rather than a page that will not render.
    return null;
  }
}

/**
 * One entity per tier, with the work types routed to it and the agents that
 * declare it. The back-references come from the agent registry rather than from
 * `agents/*.md`, because that file is generated from the same frontmatter and
 * already carries the resolved `model_tier`.
 */
export function parseModels(basePath: string): ModelEntity[] {
  const modelsFile = path.join(basePath, 'registries', 'models.json');
  const registry = readJson<ModelsRegistry>(modelsFile);
  if (!registry?.tiers) return [];

  const updatedAt = existsSync(modelsFile) ? statSync(modelsFile).mtime.toISOString() : new Date(0).toISOString();
  const sourcePaths = ['registries/models.json'];

  const agents = readJson<AgentsRegistry>(path.join(basePath, 'registries', 'agents.json'));

  return registry.tiers
    .filter((tier): tier is { id: string; model?: string; escalates_to?: string | null } => typeof tier.id === 'string')
    .map((tier) => ({
      id: tier.id,
      kind: 'model' as const,
      name: tier.id,
      status: 'active' as const,
      sourcePaths,
      updatedAt,
      model: typeof tier.model === 'string' ? tier.model : '',
      escalatesTo: typeof tier.escalates_to === 'string' ? tier.escalates_to : null,
      workTypes: (registry.work_types ?? [])
        .filter((work) => work.tier === tier.id && typeof work.id === 'string')
        .map((work) => work.id as string)
        .sort(),
      usedByAgents: (agents?.agents ?? [])
        .filter((agent) => agent.model_tier === tier.id && typeof agent.name === 'string')
        .map((agent) => agent.name as string)
        .sort(),
    }));
}
