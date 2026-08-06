#!/usr/bin/env bash
# EngineOS UserPromptSubmit: match the prompt against registries/decision-rules.json
# and inject the gates that fire. NON-BLOCKING — guidance only, exit 0 always.
#
# This is the keyword tier of the decision engine. It catches the loud cases from
# the prompt text alone; the model applies the full registry (conditions the
# prompt cannot reveal, like files_changed or affects_public_contract) via
# rules/gates.md. A rule with no `signals` array is model-only by design.
#
# Matching itself lives in scripts/kernel.sh decision-rules — this hook only
# formats what the kernel returns. Canonical rules: registries/decision-rules.json,
# rules/gates.md, rules/risk-autonomy.md.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=hooks/lib-common.sh
. "$DIR/lib-common.sh"
KERNEL="$DIR/../scripts/kernel.sh"

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
[ -z "$PROMPT" ] && exit 0

RESULT=$("$KERNEL" decision-rules --prompt "$PROMPT" 2>/dev/null) || exit 0
printf '%s' "$RESULT" | jq -e . >/dev/null 2>&1 || exit 0

MATCH_COUNT=$(printf '%s' "$RESULT" | jq '.matches | length' 2>/dev/null)
[ "${MATCH_COUNT:-0}" = "0" ] && exit 0

# telemetry (best-effort, never affects hook behavior). Only real matches
# log — the denominator is the route event stream (one per prompt), so a
# second empty line per prompt here would be the same fact twice.
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"' 2>/dev/null)
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
if [ "${ENGINEOS_TELEMETRY:-}" != "0" ] && [ -n "$CWD" ]; then
  if TROOT=$(repo_root "$CWD") && [ -d "$TROOT/.engineos" ] && TGIT=$(git_dir "$CWD") && [ -n "$TGIT" ]; then
    mkdir -p "$TGIT/engineos-telemetry" 2>/dev/null || true
    TDATA=$(printf '%s' "$RESULT" | jq -c \
      '{rules: [.matches[].id], any_high: (.any_high // false)}' 2>/dev/null)
    "$DIR/../scripts/telemetry.sh" append "$TGIT/engineos-telemetry/$SID.jsonl" \
      --session "$SID" --event decision-rules --data "$TDATA" >/dev/null 2>&1 || true
  fi
fi

LINES=""
while IFS=$'\t' read -r id req pref gate risk; do
  [ -z "$id" ] && continue
  line="  - $id"
  [ -n "$req" ]   && line="$line — require: $req"
  [ -n "$pref" ]  && line="$line — prefer: $pref"
  [ -n "$gate" ]  && line="$line [gate: $gate]"
  [ -n "$risk" ]  && line="$line [risk: $risk]"
  LINES="${LINES:+$LINES
}$line"
done < <(printf '%s' "$RESULT" | jq -r '
  .matches[]
  | [.id, ((.require // []) | join(", ")), (.prefer // ""), (.gate // ""), (.risk // "")]
  | @tsv')

[ -z "$LINES" ] && exit 0

NOTE="[engineos] decision rules matched this prompt (registries/decision-rules.json).
$LINES
Confirm each requirement is met or explicitly waived with a reason before claiming done. These are keyword matches on the prompt only — apply the full registry per rules/gates.md, and classify risk per rules/risk-autonomy.md."

ANY_HIGH=$(printf '%s' "$RESULT" | jq -r '.any_high // false')
if [ "$ANY_HIGH" = "true" ]; then
  NOTE="$NOTE
[engineos] a matched rule sets risk=high — autonomy ceiling A3 per rules/risk-autonomy.md: human approval before any external effect, and a rollback path before release."
fi

jq -n --arg c "$NOTE" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$c}}'
exit 0
