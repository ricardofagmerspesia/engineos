// EngineOS PostToolUse(Agent|Task): backstop for the green return-announcement
// rule in rules/subagents.md — closes the loop visibly once a dispatched agent's
// result comes back, so a wave summary can never quietly hide a dead branch.
//
// Port of hooks/announce-agent-return.sh.
import type { HookEnvelope } from './envelope';
import { context, silent, type HookContext, type HookDecision } from './output';
import { bypassActive } from './bypass';
import { subagentType } from './announce-agent-dispatch';
import { closeSpan, spanIdFrom, telemetrySink } from './telemetry';
import { isRecord } from '../lib/json';
import { hookSlug } from '../lib/slug';
import { agentModelTier } from '../registry/agents';
import { SPAN_STATUSES, type SpanStatus } from '../registry/policy-exec-journal';

export function run(env: HookEnvelope, ctx: HookContext): HookDecision {
  const bypassed = bypassActive(env.cwd, ctx.io.env, ctx.spawn);
  if (bypassed) return silent;
  const type = subagentType(env);
  const banner = returnBanner(type);
  // Close the span the dispatch hook opened. No marker -> no span: a PostToolUse
  // without a matching PreToolUse (bypass toggled mid-turn, hook installed
  // mid-session, telemetry dir reaped) writes nothing rather than a fabricated
  // duration. The id derivation is shared with the dispatch hook by import, so
  // the two cannot drift the way two copies of a jq pipeline could.
  //
  // The try guards the banner the way bash guarded it by printing first: see
  // ./announce-agent-dispatch. The tier and the status are read eagerly here
  // rather than inside a close-succeeded branch — reading a registry the close
  // will not use costs nothing observable, and the alternative is a second
  // marker probe outside ./telemetry.
  try {
    // The registry is keyed by the same slugged name the span field carries, as
    // bash looked it up: what reaches the journal is what was looked up.
    const agent = hookSlug(type);
    closeSpan(telemetrySink(env, ctx, { bypassed }), spanIdFrom(env), {
      kind: 'agent',
      // `implement`, not a `dispatch` id of its own: dispatching is what the
      // ORCHESTRATOR does, so no capability binds an agent to it. Known
      // imprecision, recorded in rules/observability.md — a consumer grouping
      // agent spans by capability sees them all as `implement` (a
      // security-review dispatch included) and disambiguates on `agent`.
      capability: 'implement',
      // The agent's own tier, from the registry, so a design-tier agent is not
      // recorded as build. Absent or unregistered -> build (../registry/agents).
      modelTier: agentModelTier(ctx.root, agent),
      status: responseStatus(env.raw),
      // tokens_in/tokens_out are 0 and cost_micros absent by construction:
      // this hook never sees the subagent's usage. ./telemetry writes the
      // zeros; rules/observability.md says so in prose so nobody reads a 0 as
      // "free".
      fields: { agent },
    });
  } catch {
    // Telemetry is evidence, not a gate. The banner goes out either way.
  }
  return context('PostToolUse', banner);
}

// The status floor, from three STRUCTURAL sources and no fourth:
//   1. the harness's own error flag, which is authoritative;
//   2. a top-level `.status` on an object payload — a field, not prose;
//   3. the envelope vocabulary as the FIRST token of a string payload.
// SPAN_STATUSES is the allowlist for sources 2 and 3, so a `.status` carrying
// anything else (including text) becomes OK rather than reaching disk.
//
// Nothing scans free text, deliberately: an extractor that read prose would turn
// a report saying "the previous attempt FAILED" into a verdict, and would hand a
// subagent a channel for putting chosen words into telemetry. The rest stays a
// known FLOOR, stated as such in rules/observability.md, because the breaker's
// consecutive-failure count is built on it.
//
// Exported for its own unit test: this is the one derivation in the pair that
// has branches worth pinning without a repo on disk.
export function responseStatus(raw: unknown): SpanStatus {
  const payload = isRecord(raw) ? raw : {};
  const response = payload['tool_response'];
  const flag = isRecord(response) ? response['is_error'] : null;
  if (alternative(flag, payload['is_error']) === true) return 'FAILED';
  if (isRecord(response)) {
    const status = response['status'];
    // An object with no string status reaches OK in bash by the longer route:
    // `tostring` renders it as `{...}`, which the anchored capture cannot match.
    return typeof status === 'string' ? allowlisted(status) : 'OK';
  }
  // Only a string response can match the anchored capture — bash's `tostring`
  // renders an array as `[...]`, and null, numbers and booleans as text that no
  // envelope word starts.
  const first = /^(OK|BLOCKED|FAILED|DEGRADED)\b/.exec(typeof response === 'string' ? response : '');
  return first === null ? 'OK' : allowlisted(first[1]);
}

// ------------------------------------------------------------------ internals

// Verbatim from the bash hook, interpolation included.
function returnBanner(type: string): string {
  return `[subagent-announce] agent(type=${type}) returned — per rules/subagents.md, emit its green diff-fenced return line before continuing: \`+ [agent] <alias> -> done|FAILED | <result summary>\`.`;
}

// jq's `//`: null and false are absent, everything else (0 and "" included) is
// present. Only the literal true then counts as an error, so a truthy non-true
// flag reads as no error, exactly as `(A // B // false) == true` did.
function alternative(first: unknown, second: unknown): unknown {
  if (first !== null && first !== undefined && first !== false) return first;
  if (second !== null && second !== undefined && second !== false) return second;
  return false;
}

function allowlisted(value: string | undefined): SpanStatus {
  return SPAN_STATUSES.find((status) => status === value) ?? 'OK';
}
