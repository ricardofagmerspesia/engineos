#!/usr/bin/env bash
# EngineOS PostToolUse(Agent|Task): backstop for the green return-announcement
# rule in rules/subagents.md — closes the loop visibly once a dispatched agent's
# result comes back, so a wave summary can never quietly hide a dead branch.
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

TYPE=$(printf '%s' "$INPUT" | jq -r '.tool_input.subagent_type // .tool_input.agentType // "general-purpose"')

MSG="[subagent-announce] agent(type=$TYPE) returned — per rules/subagents.md, emit its green diff-fenced return line before continuing: \`+ [agent] <alias> -> done|FAILED | <result summary>\`."

jq -n --arg c "$MSG" \
  '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$c}}'
exit 0
