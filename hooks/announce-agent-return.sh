#!/usr/bin/env bash
# EngineOS PostToolUse(Agent|Task): backstop for the green return-announcement
# rule in rules/subagents.md — closes the loop visibly once a dispatched agent's
# result comes back, so a wave summary can never quietly hide a dead branch.
set -uo pipefail

# shellcheck source=hooks/lib-common.sh
. "$(cd "$(dirname "$0")" && pwd)/lib-common.sh"

hook_read_envelope
engineos_bypass_active "$HOOK_CWD" && exit 0

TYPE=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .tool_input.agentType // "general-purpose"')

MSG="[subagent-announce] agent(type=$TYPE) returned — per rules/subagents.md, emit its green diff-fenced return line before continuing: \`+ [agent] <alias> -> done|FAILED | <result summary>\`."

hook_context PostToolUse "$MSG"

# Close the span the dispatch hook opened. No marker -> no span: a PostToolUse
# without a matching PreToolUse (bypass toggled mid-turn, hook installed
# mid-session, telemetry dir reaped) writes nothing rather than a fabricated
# duration. The id derivation must match announce-agent-dispatch.sh exactly.
SPAN_ID=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_use_id // empty')
[ -n "$SPAN_ID" ] || SPAN_ID=$(printf '%s' "$HOOK_INPUT" \
  | jq -r '.tool_input | (.subagent_type // "") + ":" + (.description // "")' \
  | shasum | cut -c1-12)
SPAN_ID=$(hook_slug "$SPAN_ID")

if DUR=$(hook_span_close "$SPAN_ID"); then
  AGENT=$(hook_slug "$TYPE")
  # The agent's own tier, from the registry, so a design-tier agent is not
  # recorded as build. Absent or unregistered -> build, the ordinary tier for
  # dispatched work (rules/models.md).
  TIER=$(jq -r --arg a "$AGENT" \
    '.agents[]? | select(.name == $a) | .model_tier // empty' \
    "$LIB_DIR/../registries/agents.json" 2>/dev/null | head -1)
  [ -n "$TIER" ] || TIER=build
  # FAILED comes from the harness reporting an error, or from the return
  # envelope's own status when it is the FIRST token of the response. The
  # vocabulary inside the response body is the agent's claim about itself
  # (rules/parallelism.md), not the harness's, so it is read only in that
  # position and never searched for further in — a "FAILED" mentioned in the
  # middle of a report is prose, not a verdict. The consequence is deliberate
  # and stated in rules/observability.md: a structured tool_response with no
  # error flag reads as OK, so this status is a floor on the failure count the
  # breaker consumes, never a ceiling.
  STATUS=$(printf '%s' "$HOOK_INPUT" | jq -r '
    if (((.tool_response | if type == "object" then .is_error else null end)
         // .is_error // false) == true) then "FAILED"
    else ((.tool_response | tostring)
          | (capture("^(?<s>OK|BLOCKED|FAILED|DEGRADED)\\b") | .s)? // "OK") end' 2>/dev/null)
  case "$STATUS" in OK|BLOCKED|FAILED|DEGRADED) ;; *) STATUS=OK ;; esac
  # tokens_in/tokens_out are 0 and cost_micros absent by construction: this hook
  # never sees the subagent's usage. rules/observability.md says so in prose so
  # nobody reads a 0 as "free".
  hook_span agent --capability-id dispatch --agent "$AGENT" --model-tier "$TIER" \
    --status "$STATUS" --duration-ms "$DUR" --span-id "$SPAN_ID"
fi

exit 0
