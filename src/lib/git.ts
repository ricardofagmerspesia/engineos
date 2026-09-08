// Git queries and the upward file walk, ported from hooks/lib-common.sh
// (`git_dir`, `repo_root`, `find_up`, `find_up_file`).
//
// `spawnSync` arrives as an argument rather than a module import so a caller can
// answer "not a repo" without a subprocess, which is what most hook tests need.
import { existsSync } from 'node:fs';
import type { spawnSync } from 'node:child_process';

function gitOutput(cwd: string, args: readonly string[], spawn: typeof spawnSync): string | null {
  const result = spawn('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) return null;
  const out = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  return out === '' ? null : out;
}

// Uses `git rev-parse` rather than gluing "<root>/.git" so a linked worktree —
// whose .git is a file, not a directory — resolves correctly.
export function gitDir(cwd: string, spawn: typeof spawnSync): string | null {
  return gitOutput(cwd, ['rev-parse', '--absolute-git-dir'], spawn);
}

export function repoRoot(cwd: string, spawn: typeof spawnSync): string | null {
  return gitOutput(cwd, ['rev-parse', '--show-toplevel'], spawn);
}

// bash `case "$d" in */*) d="${d%/*}"; [ -n "$d" ] || d="/" ;; *) d="." ;; esac`.
// Kept as string surgery rather than path.dirname: the bash walk converges a
// relative path to "." and stops there, and path.dirname would resolve past it.
function parentOf(dir: string): string {
  const cut = dir.lastIndexOf('/');
  if (cut === -1) return '.';
  const head = dir.slice(0, cut);
  return head === '' ? '/' : head;
}

// The `previous` guard is why the walk terminates on a relative path, which
// converges to "." and never reaches "/". The loop tests its condition before
// each probe, so the filesystem root itself is never examined — same as bash.
function walkUp(start: string, visit: (dir: string) => string | null): string | null {
  let dir = start;
  let previous = '';
  while (dir !== '/' && dir !== previous && dir !== '') {
    const hit = visit(dir);
    if (hit !== null) return hit;
    previous = dir;
    dir = parentOf(dir);
  }
  return null;
}

// The nearest ancestor directory (start included) that contains `name`.
export function findUp(start: string, name: string): string | null {
  return walkUp(start, (dir) => (existsSync(`${dir}/${name}`) ? dir : null));
}

// Same walk, but for callers that want the matched path itself.
export function findUpFile(start: string, name: string): string | null {
  return walkUp(start, (dir) => {
    const candidate = `${dir}/${name}`;
    return existsSync(candidate) ? candidate : null;
  });
}
