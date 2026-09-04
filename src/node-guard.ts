import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

export const MIN_NODE_MAJOR = 18;

// The four hooks that already go silent without jq stay silent; the ones that
// survive a missing jq today (the Stop gate among them) say why they did not run.
export const SILENT_HOOKS = new Set(['route-before-change', 'mark-unrecorded', 'record-verify', 'prompt-advisor']);

export function currentMajor(versions: string = process.versions.node): number {
  const major = Number.parseInt(versions.split('.')[0] ?? '0', 10);
  return Number.isNaN(major) ? 0 : major;
}

function toComponent(part: string | undefined): number {
  const n = Number.parseInt(part ?? '0', 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseVersion(dirName: string): [number, number, number] {
  const parts = dirName.replace(/^v/, '').split('.');
  return [toComponent(parts[0]), toComponent(parts[1]), toComponent(parts[2])];
}

function defaultIsExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Mirrors hooks/lib-common.sh ensure_modern_node: a hook PATH often carries an
// old nvm node first, while a newer one is installed a directory away.
export function findNewerNode(
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
  listDir: (path: string) => string[],
  isExecutable: (path: string) => boolean = defaultIsExecutable,
): string | null {
  const nvmDir = env['NVM_DIR'] ?? join(env['HOME'] ?? '', '.nvm');
  const versionsDir = join(nvmDir, 'versions', 'node');
  if (exists(versionsDir)) {
    // versionsDir can exist as a file, or be unreadable (EACCES) — readdirSync (or a
    // test double standing in for it) throws in both cases; treat that as "no candidates".
    let names: string[];
    try {
      names = listDir(versionsDir);
    } catch {
      names = [];
    }
    const candidates = names
      .filter((v) => parseVersion(v)[0] >= MIN_NODE_MAJOR)
      .sort((a, b) => {
        const av = parseVersion(a);
        const bv = parseVersion(b);
        return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
      });
    for (const v of candidates) {
      const bin = join(versionsDir, v, 'bin', 'node');
      if (exists(bin) && isExecutable(bin)) return bin;
    }
  }
  for (const bin of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
    if (exists(bin) && isExecutable(bin)) return bin;
  }
  return null;
}

export type GuardOutcome =
  | { kind: 'proceed' }
  | { kind: 'reexec'; bin: string }
  | { kind: 'silent' }
  | { kind: 'skip'; message: string }
  | { kind: 'refuse'; message: string };

// Pure decision: given the current node version and a pre-resolved newer-node
// candidate, decide what the guard should do. cli.ts performs the actual effects
// (spawnSync / process.exit / print) so this stays testable without a subprocess.
export function guardOutcome(argv: string[], nodeVersion: string, newer: string | null): GuardOutcome {
  if (currentMajor(nodeVersion) >= MIN_NODE_MAJOR) return { kind: 'proceed' };
  if (newer !== null) return { kind: 'reexec', bin: newer };
  if (argv[0] === 'hook') {
    const hookName = argv[1] ?? '';
    if (SILENT_HOOKS.has(hookName)) return { kind: 'silent' };
    return { kind: 'skip', message: `[engineos] ${argv[1] ?? 'hook'} skipped: node >= ${MIN_NODE_MAJOR} required (found v${nodeVersion})` };
  }
  return { kind: 'refuse', message: `node >= ${MIN_NODE_MAJOR} required, found v${nodeVersion}` };
}
