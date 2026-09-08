// Mutual exclusion for the two operations that write the real repository:
// publish and rollback.
//
// Why a lock at all. Both handlers do read-check-write over the same files and
// then run git. Two of them interleaving is not a rare race — the console is a
// web app, and a double-click on Publish is enough. The failure is ugly: two
// `git add`/`git commit` pairs racing produce a commit containing the other
// request's half-written files, or an index.lock error surfaced as an opaque
// git failure long after the disk was already touched.
//
// Why mkdir. It is the one filesystem primitive that is atomic and
// fail-if-exists on every platform this runs on, needs no dependency, and — the
// part an in-process flag cannot give — also excludes a SECOND console process
// pointed at the same repository, which is exactly the "publicação concorrente"
// case. A module-level boolean would silently allow that one through.
//
// Staleness is handled by age, not by pid liveness: a pid check cannot tell a
// dead process from one on another machine sharing the directory, and guessing
// wrong there means breaking a live publish. An abandoned lock older than
// STALE_AFTER_MS is reclaimed; a fresh one is honoured and the caller is told
// to retry.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const STALE_AFTER_MS = 2 * 60 * 1000; // a publish that has not finished in two minutes is not running

export class PublishLockedError extends Error {
  readonly heldSince: string;
  constructor(heldSince: string) {
    super(`another publish or rollback is in progress (started ${heldSince}) — retry once it finishes`);
    this.name = 'PublishLockedError';
    this.heldSince = heldSince;
  }
}

function lockDir(consoleRoot: string): string {
  return path.join(consoleRoot, '.publish.lock');
}

function acquire(consoleRoot: string, owner: string): void {
  const dir = lockDir(consoleRoot);
  try {
    mkdirSync(dir); // atomic: succeeds only if it did not exist
  } catch {
    // Age and owner are read SEPARATELY on purpose. Reading them together meant
    // a lock directory with no owner file — a process killed between mkdir and
    // the owner write — threw before the age was computed, defaulted to age 0,
    // and could never be reclaimed. The half-created lock was the one case the
    // staleness rule existed for, and it was the one case it did not cover.
    let heldSince = 'unknown';
    try {
      heldSince = readFileSync(path.join(dir, 'owner'), 'utf8').trim() || 'unknown';
    } catch {
      // No owner recorded — the holder died before writing it. Age still decides.
    }

    let ageMs = 0;
    try {
      ageMs = Date.now() - statSync(dir).mtimeMs;
    } catch {
      // The directory vanished between mkdir failing and this stat: whoever held
      // it just released it. Fall through to the reclaim path, which recreates.
      ageMs = STALE_AFTER_MS + 1;
    }

    if (ageMs <= STALE_AFTER_MS) {
      throw new PublishLockedError(heldSince);
    }
    // Stale: reclaim it. Removing and recreating is not atomic, so a second
    // reclaimer can win the race — which is fine, exactly one of them ends up
    // owning a freshly created directory and the other throws below.
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
  }
  writeFileSync(path.join(dir, 'owner'), `${owner} at ${new Date().toISOString()}\n`, 'utf8');
}

function release(consoleRoot: string): void {
  rmSync(lockDir(consoleRoot), { recursive: true, force: true });
}

/**
 * Runs `fn` while holding the repository write lock. The lock is released even
 * when `fn` throws — a publish that fails must not wedge every later one.
 */
export function withPublishLock<T>(consoleRoot: string, owner: string, fn: () => T): T {
  acquire(consoleRoot, owner);
  try {
    return fn();
  } finally {
    release(consoleRoot);
  }
}
