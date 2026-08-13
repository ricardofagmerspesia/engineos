#!/usr/bin/env bash
# EngineOS PreToolUse(Agent|Task): backstop for the green dispatch-announcement
# rule in rules/subagents.md. That rule is prompt-only — nothing forced the model
# to actually emit the diff-fenced banner, so dispatches were happening silently.
# This hook re-injects the exact format right at dispatch time, the same way
# route-before-change.sh backstops rule routing for Edit|Write.
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

# shellcheck source=hooks/bypass.sh
. "$(cd "$(dirname "$0")" && pwd)/bypass.sh"
engineos_bypass_active_for_payload "$INPUT" && exit 0

TYPE=$(printf '%s' "$INPUT" | jq -r '.tool_input.subagent_type // .tool_input.agentType // "general-purpose"')
DESC=$(printf '%s' "$INPUT" | jq -r '.tool_input.description // empty')

DESC_PART=""
[ -n "$DESC" ] && DESC_PART=", desc=\"$DESC\""

MSG="[subagent-announce] dispatching agent(type=$TYPE${DESC_PART}) — per rules/subagents.md, before any other output for this turn, emit a green diff-fenced line: \`+ [agent] <alias>(<type>) | model: <tier> | mode: AUDIT|IMPLEMENT | scope: <files>\`. One line per agent, its own fenced diff block, blank line above and below. Do not narrate this in prose instead."

jq -n --arg c "$MSG" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse", additionalContext:$c}}'
exit 0
