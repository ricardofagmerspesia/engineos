import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { KernelError, readJsonFile } from '../lib/json';

export type RegistryName =
  | 'routing.json' | 'intents.json' | 'models.json' | 'policy.json'
  | 'decision-rules.json' | 'capabilities.json' | 'agents.json';

// Binds a path, not contents: each subcommand reads only the registries it needs,
// the same lazy discipline scripts/kernel.sh reg() kept for speed.
export function registryPath(root: string, name: RegistryName): string {
  const p = join(root, 'registries', name);
  if (!existsSync(p)) throw new KernelError(`registry missing: registries/${name}`);
  return p;
}

export function loadRegistry(root: string, name: RegistryName): unknown {
  return readJsonFile(registryPath(root, name));
}
