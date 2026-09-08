// EngineOS — generate registries/agents.json from agents/*.md frontmatter.
// The TypeScript half of scripts/gen-agent-registry.sh; the .sh is a shim.
//
// Always fully regenerated (unlike gen-agent-commands' per-file customization
// marker) — one JSON file, nothing in it is ever hand-edited, so there is no
// "preserve this" case. CI's drift guard just diffs the committed file against
// a fresh run, which is why every byte of the output and every FAIL message is
// reproduced verbatim from the bash it replaces.
//
// capability_ids is a back-reference computed from registries/capabilities.json:
// every capability whose "agent" names this agent. model_tier comes from the
// agent's own "tier:" frontmatter — it is NOT derivable from the model name,
// because registries/models.json can bind two tiers to the same model (build
// and design both bind opus today). The generator only validates that the
// declared tier exists and that its model binding matches the frontmatter
// model; any mismatch is a hard error, never a guess.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Io } from '../io';
import { KernelError } from '../lib/json';
import { loadCapabilities, type CapabilitiesRegistry } from '../registry/capabilities';
import { loadModels, type ModelsRegistry } from '../registry/models';
import { frontmatterAlias, frontmatterValue, splitCsv } from './frontmatter';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

// Verbatim from the bash, the path to the generator included: the shim keeps
// that path alive, and changing this string would move every committed byte of
// registries/agents.json and fail CI's drift guard for no gain.
const DOCUMENT_DESCRIPTION =
  'Generated from agents/*.md frontmatter by scripts/gen-agent-registry.sh — do not hand-edit. capability_ids is a back-reference from registries/capabilities.json.';

export interface AgentRegistryEntry {
  name: string;
  alias: string | null;
  description: string;
  tools: string[];
  model: string;
  model_tier: string;
  capability_ids: string[];
}

export interface AgentRegistryDocument {
  version: string;
  description: string;
  agents: AgentRegistryEntry[];
}

export interface AgentFile {
  path: string;
  text: string;
}

// Pure: every file is already read, so the three tier failures are unit-testable
// without a temp tree. Throws KernelError carrying the bash FAIL line verbatim.
export function buildAgentRegistry(
  agentFiles: AgentFile[],
  models: ModelsRegistry,
  capabilities: CapabilitiesRegistry,
): AgentRegistryDocument {
  const entries: AgentRegistryEntry[] = [];

  for (const file of agentFiles) {
    const name = frontmatterValue(file.text, 'name');
    // An absent name is bash's `[ -n "$name" ] || continue`: a file that is not
    // an agent definition is skipped silently, never reported.
    if (name === '') continue;

    const model = frontmatterValue(file.text, 'model');
    const tier = frontmatterValue(file.text, 'tier');
    if (tier === '') {
      const ids = models.tiers.map((row) => row.id).join(', ');
      throw new KernelError(
        `FAIL: ${file.path} has no 'tier:' frontmatter — the tier cannot be derived from the model (two tiers may share a binding, registries/models.json). Declare one of: ${ids}.`,
      );
    }
    const bound = models.tiers.find((row) => row.id === tier);
    if (bound === undefined) {
      throw new KernelError(`FAIL: ${file.path} declares unknown tier '${tier}' — not a tier id in registries/models.json.`);
    }
    if (bound.model !== model) {
      throw new KernelError(
        `FAIL: ${file.path} declares tier '${tier}' (binds model '${bound.model}' in registries/models.json) but model '${model}' — fix the frontmatter or rebind the tier.`,
      );
    }

    entries.push({
      name,
      alias: emptyToNull(frontmatterAlias(file.text)),
      description: frontmatterValue(file.text, 'description'),
      tools: splitCsv(frontmatterValue(file.text, 'tools')),
      model,
      model_tier: tier,
      capability_ids: capabilities.capabilities.filter((row) => row.agent === name).map((row) => row.id),
    });
  }

  return {
    version: '1.0.0',
    description: DOCUMENT_DESCRIPTION,
    // Code-point order, which is what jq's sort_by(.name) produced; a locale
    // collation would reorder hyphenated names and move committed bytes.
    agents: entries.sort(byNameCodePoint),
  };
}

// Reads <root>/agents/*.md plus the two registries, writes
// <root>/registries/agents.json, and reports through io. Returns the exit code.
export function generateAgentRegistry(root: string, io: Io): number {
  const agentsDir = join(root, 'agents');
  const capsFile = join(root, 'registries', 'capabilities.json');
  const modelsFile = join(root, 'registries', 'models.json');
  const outFile = join(root, 'registries', 'agents.json');

  // Same order as the bash guards: first failure wins, so a tree missing both
  // the agents dir and the registries names the agents dir.
  if (!isDirectory(agentsDir)) return fail(io, `No agents dir at ${agentsDir}`);
  if (!existsSync(capsFile)) return fail(io, `No capabilities registry at ${capsFile}`);
  if (!existsSync(modelsFile)) return fail(io, `No models registry at ${modelsFile}`);

  let document: AgentRegistryDocument;
  try {
    const models: ModelsRegistry = loadModels(root);
    const capabilities: CapabilitiesRegistry = loadCapabilities(root);
    document = buildAgentRegistry(readAgentFiles(agentsDir), models, capabilities);
  } catch (error) {
    if (error instanceof KernelError) return fail(io, error.message);
    throw error;
  }

  try {
    writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`);
  } catch (error) {
    return fail(io, `cannot write ${outFile}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  io.out(`Wrote ${document.agents.length} agents to ${outFile}\n`);
  return EXIT_OK;
}

// -------------------------------------------------------------------- helpers

function readAgentFiles(agentsDir: string): AgentFile[] {
  return readdirSync(agentsDir)
    .filter((entry) => entry.endsWith('.md'))
    .sort()
    .map((entry) => {
      const path = join(agentsDir, entry);
      return { path, text: readFileSync(path, 'utf8') };
    });
}

function byNameCodePoint(a: AgentRegistryEntry, b: AgentRegistryEntry): number {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

function emptyToNull(value: string): string | null {
  return value === '' ? null : value;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function fail(io: Io, message: string): number {
  io.err(`${message}\n`);
  return EXIT_FAILURE;
}
