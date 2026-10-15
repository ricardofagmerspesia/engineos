// File-backed consecutive-failure breaker for the judge provider
// (contracts.md@rev1 §6.2 `judge.breaker`, §10.1). State lives in
// <gitdir>/engineos-telemetry/<state_file>; the threshold is the existing
// policy.breaker.failure_threshold and the cooldown is judge.breaker.cooldown_ms,
// which judge() compares against `opened_at`.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import type { BreakerState, BreakerStore } from './types';

export const TELEMETRY_DIR_NAME = 'engineos-telemetry';

const STATE_FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
const CLOSED: BreakerState = { failures: 0, opened_at: null };

export interface FileBreakerOptions {
  gitDir: string;
  stateFile: string;
  failureThreshold: number;
}

export class BreakerConfigError extends Error {
  readonly kind = 'judge-breaker-config';
}

export function createFileBreakerStore(options: FileBreakerOptions): BreakerStore {
  if (!STATE_FILE_PATTERN.test(options.stateFile) || options.stateFile.includes('..')) {
    throw new BreakerConfigError('judge.breaker.state_file must be a plain file name');
  }
  if (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1) {
    throw new BreakerConfigError('breaker.failure_threshold must be a positive integer');
  }
  const dir = join(options.gitDir, TELEMETRY_DIR_NAME);
  const path = join(dir, options.stateFile);
  const read = (): BreakerState => readState(path);
  return {
    read,
    recordFailure(now: number): void {
      const current = read();
      const failures = current.failures + 1;
      // At or past the threshold every failure (including a failed half-open
      // probe) re-stamps opened_at, which restarts the cooldown.
      const openedAt = failures >= options.failureThreshold ? now : current.opened_at;
      writeState(dir, path, { failures, opened_at: openedAt });
    },
    recordSuccess(): void {
      const current = read();
      if (current.failures === 0 && current.opened_at === null) return;
      writeState(dir, path, CLOSED);
    },
  };
}

// A missing, unreadable or malformed file reads as closed: the breaker only
// ever suppresses calls, so losing its state costs at most `failure_threshold`
// timeout-bounded attempts before it opens again.
function readState(path: string): BreakerState {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return CLOSED;
  }
  if (!isRecord(raw)) return CLOSED;
  const failures = raw['failures'];
  const openedAt = raw['opened_at'];
  if (typeof failures !== 'number' || !Number.isInteger(failures) || failures < 0) return CLOSED;
  if (openedAt === null) return { failures, opened_at: null };
  if (typeof openedAt !== 'number' || !Number.isFinite(openedAt) || openedAt < 0) return CLOSED;
  return { failures, opened_at: openedAt };
}

// Write-then-rename so a concurrent reader sees the old or the new state, never
// a torn file. A failed write is dropped on purpose: the judge runs inside the
// prompt hook, and an unwritable git dir must not turn into hook noise or a
// blocked prompt; the only cost is a breaker that does not open.
function writeState(dir: string, path: string, state: BreakerState): void {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmp, `${JSON.stringify(state)}\n`);
    renameSync(tmp, path);
  } catch {
    return;
  }
}
