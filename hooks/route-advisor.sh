#!/usr/bin/env bash
# EngineOS UserPromptSubmit: announce whether this request needs the router
# agent (a dispatch plan) or the kernel already resolved it deterministically.
# NON-BLOCKING — guidance only, via hookSpecificOutput.additionalContext.
#
# A hook cannot dispatch an agent: it is a command process, stdin/stdout only,
# with no Task/Agent tool. So the escalation branch ANNOUNCES that the router
# agent (agents/router.md, model opus) should be invoked via the Task tool —
# the model reading this context is what actually dispatches it, same pattern
# every other advisor hook in this repo already uses.
#
# Canonical rules: scripts/kernel.sh route-escalate, registries/policy.json's
# router block, docs/specs/2026-08-06-decision-kernel-p3-router-agent.md.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=hooks/lib-common.sh
. "$DIR/lib-common.sh"

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
[ -z "$PROMPT" ] && exit 0

RESULT=$("$DIR/../scripts/kernel.sh" route-escalate --prompt "$PROMPT" 2>/dev/null) || exit 0
printf '%s' "$RESULT" | jq -e . >/dev/null 2>&1 || exit 0

# telemetry (best-effort, never affects hook behavior). Written before the
# zero-match early exit below: zero-match prompts are the denominator for
# "which intents never fire" (registries/policy.json telemetry).
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"' 2>/dev/null)
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
if [ "${ENGINEOS_TELEMETRY:-}" != "0" ] && [ -n "$CWD" ]; then
  if TROOT=$(repo_root "$CWD") && [ -d "$TROOT/.engineos" ] && TGIT=$(git_dir "$CWD") && [ -n "$TGIT" ]; then
    mkdir -p "$TGIT/engineos-telemetry" 2>/dev/null || true
    TDATA=$(printf '%s' "$RESULT" | jq -c \
      '{escalate: (.escalate // false), reasons, intents,
        suppressed: [.suppressed[]?.id], agents}' 2>/dev/null)
    "$DIR/../scripts/telemetry.sh" append "$TGIT/engineos-telemetry/$SID.jsonl" \
      --session "$SID" --event route --data "$TDATA" >/dev/null 2>&1 || true
  fi
fi

ESCALATE=$(printf '%s' "$RESULT" | jq -r '.escalate // false')
NMATCH=$(printf '%s' "$RESULT" | jq -r '.intents | length')

# Zero matches and no escalation signal: CLAUDE.md says proceed on always-on
# rules alone and never block on routing. Nothing to say.
if [ "$ESCALATE" != "true" ] && [ "${NMATCH:-0}" -eq 0 ]; then exit 0; fi

if [ "$ESCALATE" = "true" ]; then
  REASONS=$(printf '%s' "$RESULT" | jq -r '.reasons | join(", ")')
  INTENTS=$(printf '%s' "$RESULT" | jq -r 'if (.intents|length)>0 then (.intents|join(",")) else "-" end')
  AGENTS=$(printf '%s' "$RESULT" | jq -r 'if (.agents|length)>0 then (.agents|join(",")) else "-" end')
  SCALE=$(printf '%s' "$RESULT" | jq -r '.scale | to_entries | map("\(.key)=\(.value)") | join(" ")')
  MSG="[engineos] route escalation — the kernel could not fully resolve this request: ${REASONS}. Dispatch the \`router\` agent (agents/router.md, model opus) via the Task tool with the request text and follow its dispatch plan; do not fan out before it returns. Kernel facts so far: intents=${INTENTS} agents=${AGENTS} scale=(${SCALE}). A hook cannot dispatch an agent — you must invoke it."
else
  # Union of rules/skills/mcp over the SURVIVING intents. route-escalate
  # reports ids only; the fields themselves come from intents.json.
  I="$DIR/../registries/intents.json"
  IDS_JSON=$(printf '%s' "$RESULT" | jq -c '.intents')
  RULES=$(jq -r --argjson ids "$IDS_JSON" '
    [.intents[] | select(.id as $i | $ids | index($i)) | .rules[]?] | unique | join(",")' "$I")
  SKILLS=$(jq -r --argjson ids "$IDS_JSON" '
    [.intents[] | select(.id as $i | $ids | index($i)) | .skills[]?] | unique | join(",")' "$I")
  MCP=$(jq -r --argjson ids "$IDS_JSON" '
    [.intents[] | select(.id as $i | $ids | index($i)) | .mcp[]?] | unique | join(",")' "$I")
  INTENTS=$(printf '%s' "$RESULT" | jq -r '.intents | join(",")')
  AGENTS=$(printf '%s' "$RESULT" | jq -r 'if (.agents|length)>0 then (.agents|join(",")) else "-" end')
  MODEL_TIER=$(printf '%s' "$RESULT" | jq -r '.model_tier // "-"')
  RISK_FLOOR=$(printf '%s' "$RESULT" | jq -r '.risk_floor // "-"')
  MSG="[engineos] route (kernel, deterministic): intents=${INTENTS} agents=${AGENTS} rules=${RULES:--} skills=${SKILLS:--} mcp=${MCP:--} model_tier=${MODEL_TIER} risk_floor=${RISK_FLOOR} — load these; classify risk per rules/risk-autonomy.md (the floor is a floor, not the tier). No router dispatch needed."
fi

jq -n --arg c "$MSG" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$c}}'
exit 0
