// Append-only mutation log, independent of the store's `publish_history` table
// (design §5) so a failed publish attempt — nothing committed, nothing in
// history — still leaves an inspectable trail of what was actually written to
// disk / attempted in git.
//
// `consoleRoot` is injected rather than read from `process.cwd()`
// (rules/architecture.md: never read process.cwd() or hardcode a path inside
// these modules) even though the change record names a fixed relative
// location (`console/.data/mutations.log`) — the caller (an API route handler,
// which does know its own app root) decides that path; this module only knows
// how to write into it.

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export interface MutationLogEntry {
  path: string;
  action: string;
  result: 'ok' | 'error';
  detail?: string;
}

const LOG_DIR_SEGMENTS = ['.data'] as const;
const LOG_FILE_NAME = 'mutations.log';

export function logMutation(consoleRoot: string, entry: MutationLogEntry): void {
  const dir = path.join(consoleRoot, ...LOG_DIR_SEGMENTS);
  mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  appendFileSync(path.join(dir, LOG_FILE_NAME), `${line}\n`, 'utf8');
}
