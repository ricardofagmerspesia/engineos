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
exit 0
