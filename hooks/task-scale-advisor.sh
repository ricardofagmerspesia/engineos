#!/usr/bin/env bash
# EngineOS UserPromptSubmit: detect big-task prompts and inject the fan-out +
# model-assignment reminder. NON-BLOCKING — guidance only, via
# hookSpecificOutput.additionalContext (exit 0).
#
# Fires only when the prompt carries BOTH an action verb (work is being requested)
# AND a scale marker (the work is plausibly parallelizable), or when it explicitly
# asks for a spec/PRD (model-tier reminder). Classification lives in
# scripts/kernel.sh scale (the EREs moved to registries/policy.json); this hook
# only formats the three message texts. Canonical rules: rules/parallelism.md
# and rules/models.md.
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
[ -z "$PROMPT" ] && exit 0

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KERNEL="$DIR/../scripts/kernel.sh"

RESULT=$("$KERNEL" scale --prompt "$PROMPT" 2>/dev/null) || exit 0
printf '%s' "$RESULT" | jq -e . >/dev/null 2>&1 || exit 0

BIG=$(printf '%s' "$RESULT" | jq -r '.big_task // false')
SPEC=$(printf '%s' "$RESULT" | jq -r '.spec_authoring // false')
DESIGN=$(printf '%s' "$RESULT" | jq -r '.design_work // false')

NOTES=""

if [ "$BIG" = "true" ]; then
  NOTES="[engineos] big-task signal — apply rules/parallelism.md: freeze shared contracts first, decompose into disjoint-scope units, group into waves, dispatch each wave as MULTIPLE Task calls in ONE message, announce '[fanout] waves=... '. Do not do independent units sequentially yourself."
fi

if [ "$SPEC" = "true" ]; then
  NOTES="${NOTES:+$NOTES
}[engineos] spec/PRD authoring — rules/models.md: use the most-capable tier (model: fable). If the session model is lower, delegate the authoring to a subagent with that model."
fi

if [ "$DESIGN" = "true" ]; then
  NOTES="${NOTES:+$NOTES
}[engineos] design/architecture work — rules/models.md: design tier (model: opus) for the design pass, build tier (model: sonnet) for the code that follows."
fi

[ -z "$NOTES" ] && exit 0

jq -n --arg c "$NOTES" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$c}}'
exit 0
