#!/usr/bin/env bash
# EngineOS UserPromptSubmit: match the prompt against registries/decision-rules.json
# and inject the gates that fire. NON-BLOCKING — guidance only, exit 0 always.
#
# This is the keyword tier of the decision engine. It catches the loud cases from
# the prompt text alone; the model applies the full registry (conditions the
# prompt cannot reveal, like files_changed or affects_public_contract) via
# rules/gates.md. A rule with no `signals` array is model-only by design.
#
# Canonical rules: registries/decision-rules.json, rules/gates.md,
# rules/risk-autonomy.md.
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REG="$DIR/../registries/decision-rules.json"
[ -f "$REG" ] || exit 0

PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null | tr '[:upper:]' '[:lower:]')
[ -z "$PROMPT" ] && exit 0

# id<TAB>signal-regex, one per line, highest priority first so the emitted order
# is the order the rules should be read in.
MATCHES=""
RISK=""
while IFS=$'\t' read -r id sig; do
  [ -z "$id" ] && continue
  printf '%s' "$PROMPT" | grep -qE "$sig" || continue
  case " $MATCHES " in *" $id "*) continue ;; esac
  MATCHES="$MATCHES $id"
# Raw interpolation, NOT @tsv: @tsv escapes backslashes, which turns every "\b"
# word boundary in the signal patterns into a literal "\\b" and they stop matching.
done < <(jq -r '.rules
                | sort_by(-.priority)
                | .[]
                | select(.signals != null)
                | . as $r
                | .signals[]
                | "\($r.id)\t\(.)"' "$REG" 2>/dev/null)

[ -z "$MATCHES" ] && exit 0

LINES=""
for id in $MATCHES; do
  req=$(jq -r --arg i "$id" '.rules[] | select(.id==$i) | (.then.require // []) | join(", ")' "$REG")
  gate=$(jq -r --arg i "$id" '.rules[] | select(.id==$i) | .then.gate // ""' "$REG")
  rrisk=$(jq -r --arg i "$id" '.rules[] | select(.id==$i) | .then.risk // ""' "$REG")
  pref=$(jq -r --arg i "$id" '.rules[] | select(.id==$i) | .then.prefer // ""' "$REG")
  [ "$rrisk" = "high" ] && RISK="high"
  line="  - $id"
  [ -n "$req" ]   && line="$line — require: $req"
  [ -n "$pref" ]  && line="$line — prefer: $pref"
  [ -n "$gate" ]  && line="$line [gate: $gate]"
  [ -n "$rrisk" ] && line="$line [risk: $rrisk]"
  LINES="${LINES:+$LINES
}$line"
done

NOTE="[engineos] decision rules matched this prompt (registries/decision-rules.json).
$LINES
Confirm each requirement is met or explicitly waived with a reason before claiming done. These are keyword matches on the prompt only — apply the full registry per rules/gates.md, and classify risk per rules/risk-autonomy.md."

if [ "$RISK" = "high" ]; then
  NOTE="$NOTE
[engineos] a matched rule sets risk=high — autonomy ceiling A3 per rules/risk-autonomy.md: human approval before any external effect, and a rollback path before release."
fi

jq -n --arg c "$NOTE" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$c}}'
exit 0
