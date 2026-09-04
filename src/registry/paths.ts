import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KernelError } from '../lib/json';

export function resolveRoot(env: NodeJS.ProcessEnv, startDir: string = __dirname): string {
  // The shim exports ENGINEOS_ROOT so a relocated copy answers from its own
  // registries/ instead of the checkout the runtime happens to live in.
  const forced = env['ENGINEOS_ROOT'];
  if (forced !== undefined && forced !== '') return forced;
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'registries', 'routing.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new KernelError('cannot locate the EngineOS root (no registries/routing.json above the runtime)');
    dir = parent;
  }
}
