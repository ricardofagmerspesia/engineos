// Translation between the classic hook events the mod sees and the
// HookDecision the kernel's hooks answer. Pure: no `$`, so every rule here is
// the same rule src/hooks/output.ts `render` applies to a shell hook's stdout.
import type { PreToolUseResult } from 'claude-code';
import type { HostEvent, HostRoute, WireDecision } from '../host/protocol';

// What the EngineOS hooks of one event said, folded.
export interface Outcome {
  context: string[];
  block: string | null;
  ask: string | null;
  notices: string[];
}

// Session facts a PreToolUse envelope needs and `classic.PreToolUse` lacks.
export interface SessionFacts {
  sessionId: string;
  cwd: string;
}

// A git or gh invocation anywhere in a shell line. Used only when the host did
// not answer for Bash: the git-write guard is the developer's safety net and
// must not vanish because a socket timed out (rules/git.md).
const GIT_INVOCATION = /(^|[\s;&|(`])(git|gh)(\s|$)/;

export const HOST_SILENT_GIT_REASON =
  '[engineos] in-process host did not answer for this git/gh command; confirm it yourself (the git-write guard could not run).';

export function hooksFor(routes: readonly HostRoute[], event: HostEvent, toolName: string | null): string[] {
  return routes
    .filter((route) => route.event === event && (toolName === null || matcherAccepts(route.matcher, toolName)))
    .flatMap((route) => route.hooks);
}

// hooks.json matchers are tool-name patterns: empty matches every tool, a
// pattern is anchored to the whole name. A pattern that does not compile is
// compared as a literal name rather than matching everything.
export function matcherAccepts(matcher: string, toolName: string): boolean {
  if (matcher === '' || matcher === '*') return true;
  try {
    return new RegExp(`^(?:${matcher})$`).test(toolName);
  } catch {
    return matcher === toolName;
  }
}

export function looksLikeGitCommand(command: unknown): boolean {
  return typeof command === 'string' && GIT_INVOCATION.test(command);
}

// The order is hooks.json's; the first block or ask stands, as the first
// non-zero exit of a hook group did, and contexts accumulate.
export function foldDecisions(decisions: readonly WireDecision[]): Outcome {
  const outcome: Outcome = { context: [], block: null, ask: null, notices: [] };
  for (const decision of decisions) {
    switch (decision.kind) {
      case 'silent':
        break;
      case 'context':
        outcome.context.push(decision.text);
        break;
      case 'block':
        outcome.block ??= decision.reason;
        break;
      case 'fail':
        // A shell hook's exit 2: the harness reads stderr as the refusal.
        outcome.block ??= decision.stderr;
        break;
      case 'ask':
        outcome.ask ??= decision.reason;
        break;
      case 'message':
        outcome.notices.push(decision.text);
        break;
    }
  }
  return outcome;
}

// `classic.PreToolUse` hands the tool call, not the stdin envelope; this is the
// envelope src/hooks/envelope.ts reads (`tool_name`, `tool_input.file_path`).
export function preToolEnvelope(
  call: { tool: string; tool_use_id?: string } & Record<string, unknown>,
  session: SessionFacts,
): Record<string, unknown> {
  const { tool, tool_use_id: toolUseId, ...input } = call;
  return {
    session_id: session.sessionId,
    transcript_path: '',
    cwd: session.cwd,
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: input,
    tool_use_id: toolUseId ?? '',
  };
}

// Every event the mod serves reads `additionalContext` and `block`; the result
// of the hooks beneath is kept and EngineOS's answer joins it.
export function mergeOutcome<R extends { additionalContext?: string[]; block?: string }>(theirs: R, ours: Outcome): R {
  const merged: R = { ...theirs };
  if (ours.context.length > 0) merged.additionalContext = [...ours.context, ...(theirs.additionalContext ?? [])];
  if (ours.block !== null && theirs.block === undefined) merged.block = ours.block;
  return merged;
}

// Most restrictive wins, as the harness folds several PreToolUse hooks:
// deny over ask over allow. EngineOS never allows on its own.
export function mergePreTool(theirs: PreToolUseResult, ours: Outcome): PreToolUseResult {
  const { allow, ask, deny, ...rest } = theirs;
  const context = [...ours.context, ...(theirs.additionalContext ?? [])];
  const base = context.length > 0 ? { ...rest, additionalContext: context } : rest;
  if (deny !== undefined) return { ...base, deny };
  if (ours.block !== null) return { ...base, deny: ours.block };
  if (ask !== undefined) return { ...base, ask };
  if (ours.ask !== null) return { ...base, ask: ours.ask };
  return allow === true ? { ...base, allow } : base;
}
