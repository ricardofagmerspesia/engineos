import { isRecord } from '../lib/json';
import { loadRegistry } from './load';
import { MODEL_TIER_IDS, type ModelTierId } from './models';

// registries/agents.json — generated from agents/*.md frontmatter by
// scripts/gen-agent-registry.sh. Only the two fields a caller reads are loaded:
// an agent's name, and the tier it runs at. A loader that also parsed
// `description`, `tools` or `capability_ids` could refuse a row over a field
// nobody reads.
//
// LENIENT, where every other loader in src/registry is strict, because that is
// what the bash it replaces tolerated and because of what leniency buys here.
// hooks/announce-agent-return.sh read the tier through
// `jq ... 2>/dev/null | head -1` with a `build` fallback: a missing file, a
// parse error, an `agents` key that is not an array, and a row without a tier
// all produced the same answer — the ordinary tier — and the span was still
// written. A strict loader would throw instead, and src/hooks/cli.ts renders a
// throw out of a hook body as silence: that would cost the green banner which
// is the announce pair's actual job (rules/subagents.md). A span on the wrong
// tier is a smaller failure than a dispatch nobody announced.

export interface Agent {
  name: string;
  model_tier: ModelTierId | null;
}

// The tier a dispatched agent's span carries when the registry does not answer:
// `build`, the ordinary tier for dispatched work (rules/models.md).
export const DEFAULT_AGENT_TIER: ModelTierId = 'build';

// A tier string the model registry does not know reads as absent rather than
// travelling to the journal. bash passed such a value straight through and the
// journal's enum guard then rejected the whole line — the span was lost to make
// a point about a field nobody could act on.
function isModelTierId(value: unknown): value is ModelTierId {
  return typeof value === 'string' && MODEL_TIER_IDS.some((id) => id === value);
}

export function loadAgents(root: string): Agent[] {
  let document: unknown;
  try {
    document = loadRegistry(root, 'agents.json');
  } catch {
    return [];
  }
  const rows: unknown = isRecord(document) ? document['agents'] : undefined;
  // bash `.agents[]?`: anything but an array yields no rows, not an error.
  if (!Array.isArray(rows)) return [];
  const agents: Agent[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const name = row['name'];
    if (typeof name !== 'string' || name === '') continue;
    const tier: unknown = row['model_tier'];
    agents.push({ name, model_tier: isModelTierId(tier) ? tier : null });
  }
  return agents;
}

// The tier the agent called `name` runs at, or DEFAULT_AGENT_TIER when the
// registry has no usable answer. First usable row wins, which is bash's
// `head -1` over the rows its select emitted: a duplicate name whose first row
// carries no tier falls through to the next one.
export function agentModelTier(root: string, name: string): ModelTierId {
  const match = loadAgents(root).find((agent) => agent.name === name && agent.model_tier !== null);
  return match?.model_tier ?? DEFAULT_AGENT_TIER;
}
