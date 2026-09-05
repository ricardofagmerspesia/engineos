// EngineOS PreToolUse(Agent|Task): backstop for the green dispatch-announcement
// rule in rules/subagents.md. That rule is prompt-only — nothing forced the model
// to actually emit the diff-fenced banner, so dispatches were happening silently.
// This hook re-injects the exact format right at dispatch time, the same way
// ./route-before-change backstops rule routing for Edit|Write.
//
// Port of hooks/announce-agent-dispatch.sh.
import type { HookEnvelope } from './envelope';
import { context, silent, type HookContext, type HookDecision } from './output';
import { bypassActive } from './bypass';
import { openSpan, spanIdFrom, telemetrySink } from './telemetry';
import { isRecord } from '../lib/json';

// bash `// "general-purpose"`: what a dispatch that names no agent type is
// called in the banner.
export const UNNAMED_AGENT = 'general-purpose';

// Exported because ./announce-agent-return names the same agent in its own
// banner and in the span it closes: one derivation, so the open and the close
// can never disagree about who was dispatched.
export function subagentType(env: HookEnvelope): string {
  const input = toolInput(env);
  // bash `.tool_input.subagent_type // .tool_input.agentType // "general-purpose"`.
  // jq's `//` reads null and false as absent; a non-string value is treated the
  // same way here, as ./telemetry's span-id derivation already treats it.
  return firstString(input['subagent_type'], input['agentType']) ?? UNNAMED_AGENT;
}

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  const bypassed = bypassActive(env.cwd, ctx.io.env, ctx.spawn);
  if (bypassed) return silent;
  const banner = dispatchBanner(subagentType(env), briefDescription(env));
  // The span start marker, composed after the banner and unable to replace it.
  // PostToolUse is a different process, so the start instant goes to disk keyed
  // by the harness tool-use id (./telemetry `spanIdFrom`); a bypassed session
  // returned above and writes no span (rules/subagents.md).
  //
  // The try is the shape bash got for free by printing the banner FIRST: the
  // announcement is this hook's job and must not depend on telemetry
  // succeeding. openSpan swallows its own write errors, but building the sink
  // reads the journal registries, and src/hooks/cli.ts renders a throw out of a
  // hook body as silence — which is exactly the lost banner this guards.
  try {
    openSpan(telemetrySink(env, ctx, { bypassed }), spanIdFrom(env));
  } catch {
    // Telemetry is evidence, not a gate. The banner goes out either way.
  }
  return context('PreToolUse', banner);
}

// ------------------------------------------------------------------ internals

// Verbatim from the bash hook, interpolations included: the model is told the
// exact line to emit, so any drift here is drift in what gets announced.
function dispatchBanner(type: string, description: string): string {
  const descPart = description === '' ? '' : `, desc="${description}"`;
  return (
    `[subagent-announce] dispatching agent(type=${type}${descPart}) — per rules/subagents.md, before any other output for this turn, emit a green diff-fenced line: \`+ [agent] <alias>(<type>) | model: <tier> | mode: AUDIT|IMPLEMENT | scope: <files>\`. One line per agent, its own fenced diff block, blank line above and below. Do not narrate this in prose instead.`
  );
}

// bash `.tool_input.description // empty`.
function briefDescription(env: HookEnvelope): string {
  return firstString(toolInput(env)['description']) ?? '';
}

function toolInput(env: HookEnvelope): Record<string, unknown> {
  const payload = isRecord(env.raw) ? env.raw : {};
  const input = payload['tool_input'];
  return isRecord(input) ? input : {};
}

// The first value that is a string, empty string included — jq's `//` skips
// only null and false, and an empty subagent_type reached the bash banner as
// `type=`.
function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') return value;
  }
  return null;
}
