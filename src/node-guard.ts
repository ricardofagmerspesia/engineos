import { join } from 'node:path';

export const MIN_NODE_MAJOR = 18;

export function currentMajor(versions: string = process.versions.node): number {
  return Number.parseInt(versions.split('.')[0] ?? '0', 10);
}

function parseVersion(dirName: string): [number, number, number] {
  const parts = dirName.replace(/^v/, '').split('.');
  const major = Number.parseInt(parts[0] ?? '0', 10);
  const minor = Number.parseInt(parts[1] ?? '0', 10);
  const patch = Number.parseInt(parts[2] ?? '0', 10);
  return [major, minor, patch];
}

// Mirrors hooks/lib-common.sh ensure_modern_node: a hook PATH often carries an
// old nvm node first, while a newer one is installed a directory away.
export function findNewerNode(
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
  listDir: (path: string) => string[],
): string | null {
  const nvmDir = env['NVM_DIR'] ?? join(env['HOME'] ?? '', '.nvm');
  const versionsDir = join(nvmDir, 'versions', 'node');
  if (exists(versionsDir)) {
    const candidates = listDir(versionsDir)
      .filter((v) => parseVersion(v)[0] >= MIN_NODE_MAJOR)
      .sort((a, b) => {
        const av = parseVersion(a);
        const bv = parseVersion(b);
        return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
      });
    for (const v of candidates) {
      const bin = join(versionsDir, v, 'bin', 'node');
      if (exists(bin)) return bin;
    }
  }
  for (const bin of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
    if (exists(bin)) return bin;
  }
  return null;
}
