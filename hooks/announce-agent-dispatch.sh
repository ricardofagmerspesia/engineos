#!/usr/bin/env bash
# EngineOS PreToolUse(Agent|Task): backstop for the green dispatch-announcement
# rule in rules/subagents.md. That rule is prompt-only — nothing forced the model
# to actually emit the diff-fenced banner, so dispatches were happening silently.
# This hook re-injects the exact format right at dispatch time, the same way
# route-before-change.sh backstops rule routing for Edit|Write.
set -uo pipefail

# shellcheck source=hooks/lib-common.sh
. "$(cd "$(dirname "$0")" && pwd)/lib-common.sh"

hook_read_envelope
engineos_bypass_active "$HOOK_CWD" && exit 0

TYPE=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .tool_input.agentType // "general-purpose"')
DESC=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.description // empty')

DESC_PART=""
[ -n "$DESC" ] && DESC_PART=", desc=\"$DESC\""

MSG="[subagent-announce] dispatching agent(type=$TYPE${DESC_PART}) — per rules/subagents.md, before any other output for this turn, emit a green diff-fenced line: \`+ [agent] <alias>(<type>) | model: <tier> | mode: AUDIT|IMPLEMENT | scope: <files>\`. One line per agent, its own fenced diff block, blank line above and below. Do not narrate this in prose instead."

hook_context PreToolUse "$MSG"

# Span start marker, after the banner: the announcement is this hook's job and
# must not depend on telemetry succeeding. PostToolUse is a different process,
# so the start instant goes to disk keyed by the harness tool-use id. Without
# one, a hash of the brief keys it instead — a span with a synthetic id is still
# joinable by trace_id, and two concurrent dispatches of the SAME agent with the
# SAME description are the only case it collapses.
# A bypassed session exited above and writes no span (rules/subagents.md).
SPAN_ID=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_use_id // empty')
[ -n "$SPAN_ID" ] || SPAN_ID=$(printf '%s' "$HOOK_INPUT" \
  | jq -r '.tool_input | (.subagent_type // "") + ":" + (.description // "")' \
  | shasum | cut -c1-12)
SPAN_ID=$(hook_slug "$SPAN_ID")
hook_span_open "$SPAN_ID"

exit 0
