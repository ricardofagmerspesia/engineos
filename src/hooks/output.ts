// The output half of the hook contract: a hook decides, `render` writes.
//
// This module imports nothing at runtime — only two type-only imports — so
// src/cli.ts's node guard can call it before the version floor is known to hold
// (design "Node-version guard", deviation 2). It is also the ONLY place in src/
// that writes a hook's stdout or chooses its exit code; every other module
// returns a HookDecision and lets the entry point render it.
import type { Io } from '../io';
import type { spawnSync } from 'node:child_process';

export type HookEventName =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop';

export type HookDecision =
  | { kind: 'silent' }
  | { kind: 'context'; event: HookEventName; text: string }
  | { kind: 'block'; reason: string }
  | { kind: 'message'; text: string }
  | { kind: 'fail'; stderr: string };

export const silent: HookDecision = { kind: 'silent' };

export function context(event: HookEventName, text: string): HookDecision {
  return { kind: 'context', event, text };
}

export function block(reason: string): HookDecision {
  return { kind: 'block', reason };
}

export function message(text: string): HookDecision {
  return { kind: 'message', text };
}

export function fail(stderr: string): HookDecision {
  return { kind: 'fail', stderr };
}

// Returns the exit code the caller should exit with. Compact JSON plus one
// trailing newline: the harness parses it, and the bash hooks this replaces
// emitted both compact (`stop-verify.sh`) and jq-pretty (`hook_context`) forms,
// so one shape for all five kinds settles the drift.
export function render(decision: HookDecision, io: Io): number {
  switch (decision.kind) {
    case 'silent':
      return 0;
    case 'context':
      io.out(`${JSON.stringify({ hookSpecificOutput: { hookEventName: decision.event, additionalContext: decision.text } })}\n`);
      return 0;
    case 'block':
      io.out(`${JSON.stringify({ decision: 'block', reason: decision.reason })}\n`);
      return 0;
    case 'message':
      io.out(`${JSON.stringify({ systemMessage: decision.text })}\n`);
      return 0;
    case 'fail':
      io.err(`${decision.stderr}\n`);
      return 2;
  }
}

// What a hook body gets besides its envelope: where to write, which repo it is
// acting on, the clock, and the process spawner. Built by `hookContext` in
// ./envelope, which is where `root` is derived.
export interface HookContext {
  io: Io;
  root: string;
  now: () => number;
  spawn: typeof spawnSync;
}
