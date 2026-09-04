import { join } from 'node:path';

export const MIN_NODE_MAJOR = 18;

export function currentMajor(versions: string = process.versions.node): number {
  return Number.parseInt(versions.split('.')[0] ?? '0', 10);
}

function versionMajor(dirName: string): number {
  return Number.parseInt(dirName.replace(/^v/, '').split('.')[0] ?? '0', 10);
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
      .filter((v) => versionMajor(v) >= MIN_NODE_MAJOR)
      .sort((a, b) => versionMajor(b) - versionMajor(a) || b.localeCompare(a));
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
