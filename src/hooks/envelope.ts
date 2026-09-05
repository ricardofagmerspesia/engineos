// The harness payload a hook receives on stdin, decoded once.
//
// Ported from hooks/lib-common.sh `hook_read_envelope` (:154-188) and
// `hook_context` (:189-198). The bash version left its HOOK_* defaults standing
// when jq could not parse the payload; here an unparseable or non-object payload
// is `null` and the caller decides — for every hook in this repo that decision is
// the same silent exit 0, which is what the bash defaults produced in practice.
import { spawnSync } from 'node:child_process';
import type { Io } from '../io';
import type { HookContext } from './output';
import { isRecord } from '../lib/json';
import { repoRoot } from '../lib/git';

export interface HookEnvelope {
  cwd: string;
  sessionId: string;
  prompt: string;
  file: string;
  tool: string;
  transcriptPath: string;
  stopHookActive: boolean;
  raw: unknown;
}

// bash `(.session_id // "nosession")`: the id every telemetry path keys on, so it
// is never allowed to be empty.
const NO_SESSION = 'nosession';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nested(payload: Record<string, unknown>, outer: string, inner: string): unknown {
  const child = payload[outer];
  return isRecord(child) ? child[inner] : undefined;
}

export function readEnvelope(io: Io): HookEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(io.readStdin()) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const sessionId = text(parsed['session_id']);
  return {
    cwd: text(parsed['cwd']),
    sessionId: sessionId === '' ? NO_SESSION : sessionId,
    prompt: text(parsed['prompt']),
    file: text(nested(parsed, 'tool_input', 'file_path')),
    tool: text(parsed['tool_name']),
    transcriptPath: text(parsed['transcript_path']),
    stopHookActive: parsed['stop_hook_active'] === true,
    raw: parsed,
  };
}

// `root` is the repo containing the payload's cwd, falling back to that cwd when
// the directory is not inside a git repo. lib-common has no single `root`
// variable: each hook called `repo_root "$HOOK_CWD"` and carried on with
// `$HOOK_CWD` when it came back empty. That per-hook idiom is the derivation.
//
// `spawn` is injectable so a test can build a context without a git subprocess;
// production callers pass nothing.
export function hookContext(env: HookEnvelope, io: Io, spawn: typeof spawnSync = spawnSync): HookContext {
  return {
    io,
    root: repoRoot(env.cwd, spawn) ?? env.cwd,
    now: Date.now,
    spawn,
  };
}
