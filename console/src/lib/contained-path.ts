// Containment for a repo-relative path that came from persisted state rather
// than from a literal in this file's own source.
//
// A skill entity's `sourcePaths[0]` is stored in the draft database and then
// joined under a root before publish reads or writes it. `path.join` is a
// concatenation, not a containment check: `../../etc/x` walks straight out of
// the root, and an absolute segment replaces the root entirely. Every caller
// that turns a stored relative path into an absolute one goes through this
// function, so the read side and the write side cannot disagree about what
// "inside the root" means.

import path from 'node:path';

export class PathEscapesRootError extends Error {
  readonly root: string;
  readonly relative: string;

  constructor(root: string, relative: string) {
    super(`path ${JSON.stringify(relative)} resolves outside ${JSON.stringify(root)}`);
    this.name = 'PathEscapesRootError';
    this.root = root;
    this.relative = relative;
  }
}

/**
 * Resolves `relative` against `root`, returning the absolute path only when it
 * stays inside `root` — the root itself counts as inside. Throws
 * `PathEscapesRootError` otherwise.
 *
 * Pure: it touches no filesystem, so it says nothing about whether the path
 * exists. The `path.sep` suffix on the prefix comparison is what stops a
 * sibling directory sharing the root's name prefix (`/repo-backup` against
 * root `/repo`) from reading as contained.
 */
export function resolveInside(root: string, relative: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);

  if (resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)) {
    return resolved;
  }

  throw new PathEscapesRootError(resolvedRoot, relative);
}
