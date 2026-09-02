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
exit 0
