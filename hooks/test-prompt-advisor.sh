#!/usr/bin/env bash
# Behavioral contract for the unified UserPromptSubmit adapter.
set -uo pipefail
export ENGINEOS_BYPASS_FLAG=/nonexistent/engineos.bypass
unset ENGINEOS_BYPASS

DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/prompt-advisor.sh"
pass=0
fail=0

ok() { pass=$((pass + 1)); }
no() { fail=$((fail + 1)); echo "FAIL $*"; }

context() {
  local prompt="$1" cwd="${2:-}" sid="${3:-test}"
  jq -nc --arg p "$prompt" --arg c "$cwd" --arg s "$sid" \
    '{prompt:$p,cwd:$c,session_id:$s}' \
    | ENGINEOS_TELEMETRY=0 bash "$HOOK" \
    | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null
}

command -v jq >/dev/null 2>&1 || { echo "SKIP jq not installed"; exit 0; }

CTX=$(context "Implement the notifications feature across all services")
case "$CTX" in *"big-task signal"*"route escalation"*) ok ;; *) no "scale and route guidance are combined: $CTX" ;; esac

CTX=$(context "deploy the billing service to production")
case "$CTX" in
  *"rule-production-write"*"[gate: release] [risk: high]"*"autonomy ceiling A3"*) ok ;;
  *) no "decision rule fields and high-risk ceiling are preserved: $CTX" ;;
esac

CTX=$(context "Write the PRD for the billing rework")
case "$CTX" in *"model: fable"*) ok ;; *) no "spec authoring tier is preserved: $CTX" ;; esac

CTX=$(context "what does this function return?")
[ -z "$CTX" ] && ok || no "pure question should stay silent: $CTX"

CTX=$(ENGINEOS_BYPASS=1 context "deploy to production")
case "$CTX" in *"BYPASS ACTIVE"*) ok ;; *) no "bypass announcement is preserved: $CTX" ;; esac

# Adopted repos receive one route event for every prompt and one decision event
# only when a decision rule matched.
T=$(mktemp -d)
(cd "$T" && git init -q) >/dev/null 2>&1
mkdir -p "$T/.engineos"
jq -nc --arg p "deploy the billing service to production" --arg c "$T" --arg s unified1 \
  '{prompt:$p,cwd:$c,session_id:$s}' | bash "$HOOK" >/dev/null
TF="$T/.git/engineos-telemetry/unified1.jsonl"
if [ -f "$TF" ] \
   && [ "$(wc -l < "$TF" | tr -d ' ')" = "2" ] \
   && [ "$(jq -r '.event' "$TF" | tr '\n' ',')" = "route,decision-rules," ] \
   && bash "$DIR/../scripts/telemetry.sh" validate "$TF" >/dev/null 2>&1; then
  ok
else
  no "unified telemetry stream is valid: $([ -f "$TF" ] && tr '\n' ' ' < "$TF" || echo MISSING)"
fi
rm -rf "$T"

T=$(mktemp -d)
(cd "$T" && git init -q) >/dev/null 2>&1
mkdir -p "$T/.engineos"
jq -nc --arg p "what does this function return?" --arg c "$T" --arg s unified2 \
  '{prompt:$p,cwd:$c,session_id:$s}' | bash "$HOOK" >/dev/null
TF="$T/.git/engineos-telemetry/unified2.jsonl"
if [ -f "$TF" ] && [ "$(wc -l < "$TF" | tr -d ' ')" = "1" ] \
   && [ "$(jq -r '.event' "$TF")" = "route" ]; then
  ok
else
  no "zero-match prompt writes only the route denominator"
fi
rm -rf "$T"

printf 'prompt-advisor: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
