// Thin git wrapper — the only place besides fs-writer.ts allowed to touch the
// real filesystem/git (design §5). Uses execFileSync (array argv, no shell)
// so no user-controlled string is ever interpolated into a shell command.
//
// Synchronous by contract (change record §Wave 1 Unit B): callers (publish/
// rollback route handlers) need the resulting sha before deciding the next
// step, and there is exactly one git process running at a time here — no
// concurrency benefit from the async child_process API to give up call-site
// simplicity for.

import { execFileSync } from 'node:child_process';

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly stderr: string;
  readonly exitCode: number | null;

  constructor(args: readonly string[], stderr: string, exitCode: number | null) {
    super(`git ${args.join(' ')} failed (exit ${exitCode ?? 'unknown'}): ${stderr.trim() || '(no stderr)'}`);
    this.name = 'GitCommandError';
    this.args = args;
    this.stderr = stderr;
    this.exitCode = exitCode;
  }
}

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException & { stderr?: Buffer | string; status?: number | null };
    const stderr = nodeErr.stderr ? nodeErr.stderr.toString() : nodeErr.message;
    throw new GitCommandError(args, stderr, nodeErr.status ?? null);
  }
}

/** Current checked-out branch name (`git branch --show-current`), used for the publish branch guard (design §6: refuse on main/master). */
export function getCurrentBranch(cwd: string): string {
  return runGit(cwd, ['branch', '--show-current']);
}

/** Stages exactly `paths` (never `-A`) and commits them, returning the new commit sha. */
export function commit(cwd: string, paths: string[], message: string): string {
  runGit(cwd, ['add', '--', ...paths]);
  runGit(cwd, ['commit', '-m', message, '--', ...paths]);
  return runGit(cwd, ['rev-parse', 'HEAD']);
}

/** `git revert --no-edit <sha>`, returning the new revert commit's sha. `--no-edit` avoids spawning an interactive editor in this non-interactive tool. */
export function revertCommit(cwd: string, sha: string): string {
  runGit(cwd, ['revert', '--no-edit', sha]);
  return runGit(cwd, ['rev-parse', 'HEAD']);
}

/**
 * Paths a commit touched (`git show --name-only`), repo-relative. Rollback uses
 * it to know which working-tree files a revert is about to rewrite.
 */
export function pathsInCommit(cwd: string, sha: string): string[] {
  const out = runGit(cwd, ['show', '--name-only', '--pretty=format:', sha]);
  return out.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

/**
 * Of `paths`, the ones with uncommitted modifications (`git status --porcelain`).
 *
 * A `git revert` over a dirty working tree either refuses or leaves a conflict
 * mid-flight, and in both cases the operator's uncommitted edit is what is at
 * risk. Rollback checks this first and refuses with the file list, rather than
 * letting git decide how much damage to do.
 */
export function dirtyPaths(cwd: string, paths: string[]): string[] {
  if (paths.length === 0) return [];
  const out = runGit(cwd, ['status', '--porcelain', '--', ...paths]);
  return out
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter((line) => line !== '');
}

/** Fail-closed discard of `paths` (`git checkout -- <paths>`) — used to roll back a failed publish attempt before any commit happens. */
export function checkoutPaths(cwd: string, paths: string[]): void {
  runGit(cwd, ['checkout', '--', ...paths]);
}
