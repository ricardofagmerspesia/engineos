// The only place besides git.ts allowed to touch the real filesystem (design
// §5). Deliberately dumb: entities/*.ts compute *what* should change (pure),
// this module just performs the write so the diff endpoint (compute-only) and
// publish (compute-then-apply) can share the compute step without the diff
// path ever mutating anything on disk.

import { writeFileSync } from 'node:fs';

export interface FileChange {
  path: string;
  after: string;
}

export function applyFileChanges(changes: FileChange[]): void {
  for (const change of changes) {
    writeFileSync(change.path, change.after, 'utf8');
  }
}
