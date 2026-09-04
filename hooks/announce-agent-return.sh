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
  # Status, from three STRUCTURAL sources and no fourth:
  #   1. the harness's own error flag, which is authoritative;
  #   2. a top-level `.status` on an object payload — a field, not prose;
  #   3. the envelope vocabulary as the FIRST token of a string payload.
  # The `case` below is the allowlist for all three, so a `.status` carrying
  # anything else (including text) becomes OK rather than reaching disk.
  #
  # Nothing scans free text, deliberately: an extractor that read prose would
  # turn a report saying "the previous attempt FAILED" into a verdict, and would
  # hand a subagent a channel for putting chosen words into telemetry. The
  # earlier version had only sources 1 and 3, and `tostring` on the shapes the
  # Task tool actually returns — an array of content blocks, or an object with
  # `content`/`totalDurationMs` — starts with `[` or `{`, so the anchored
  # capture never fired and only `is_error` ever produced FAILED. Source 2
  # closes the common case; the rest stays a known FLOOR, stated as such in
  # rules/observability.md, because the breaker's consecutive-failure count is
  # built on it.
  STATUS=$(printf '%s' "$HOOK_INPUT" | jq -r '
    if (((.tool_response | if type == "object" then .is_error else null end)
         // .is_error // false) == true) then "FAILED"
    else ((.tool_response | if type == "object" then (.status | strings) else empty end)
          // (.tool_response | tostring
              | (capture("^(?<s>OK|BLOCKED|FAILED|DEGRADED)\\b") | .s)?)
          // "OK") end' 2>/dev/null)
  case "$STATUS" in OK|BLOCKED|FAILED|DEGRADED) ;; *) STATUS=OK ;; esac
  # tokens_in/tokens_out are 0 and cost_micros absent by construction: this hook
  # never sees the subagent's usage. rules/observability.md says so in prose so
  # nobody reads a 0 as "free".
  # capability_id is `implement`, not a `dispatch` id of its own: every value
  # here has to resolve against registries/capabilities.json (C27f), and a
  # `dispatch` capability would need an agent binding and a model_tier to
  # satisfy C13 — but dispatching is what the ORCHESTRATOR does, so there is no
  # agent to bind. Known imprecision, recorded in rules/observability.md: a
  # consumer grouping agent spans by capability sees them all as `implement`
  # (a security-review dispatch included) and disambiguates on `agent`.
  hook_span agent --capability-id implement --agent "$AGENT" --model-tier "$TIER" \
    --status "$STATUS" --duration-ms "$DUR" --span-id "$SPAN_ID"
fi

exit 0
