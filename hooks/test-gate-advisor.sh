#!/usr/bin/env bash
# Tests for gate-advisor.sh. Asserts which decision rules fire on a prompt, and
# — just as important — that ordinary prompts stay silent. A gate advisor that
# fires on everything is noise, and noise gets ignored.
# Run: hooks/test-gate-advisor.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/gate-advisor.sh"
pass=0; fail=0

# check <desc> <prompt> <expected-rule-id | empty=expect silence>
check() {
  local desc="$1" prompt="$2" exp="$3" out ctx
  out=$(jq -nc --arg p "$prompt" '{prompt:$p}' | bash "$HOOK")
  ctx=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null)
  if [ -z "$exp" ]; then
    if [ -z "$ctx" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $desc — expected silence, got: $ctx"; fi
  else
    case "$ctx" in
      *"$exp"*) pass=$((pass+1)) ;;
      *) fail=$((fail+1)); echo "FAIL: $desc — want '$exp' in: [$ctx]" ;;
    esac
  fi
}

# check_absent <desc> <prompt> <substring that must NOT appear>
check_absent() {
  local desc="$1" prompt="$2" nope="$3" ctx
  ctx=$(jq -nc --arg p "$prompt" '{prompt:$p}' | bash "$HOOK" | jq -r '.hookSpecificOutput.additionalContext // ""')
  case "$ctx" in
    *"$nope"*) fail=$((fail+1)); echo "FAIL: $desc — did not want '$nope' in: [$ctx]" ;;
    *) pass=$((pass+1)) ;;
  esac
}

# check_risk <desc> <prompt> — asserts the high-risk autonomy note is attached
check_risk() {
  local desc="$1" prompt="$2" ctx
  ctx=$(jq -nc --arg p "$prompt" '{prompt:$p}' | bash "$HOOK" | jq -r '.hookSpecificOutput.additionalContext // ""')
  case "$ctx" in
    *"autonomy ceiling A3"*) pass=$((pass+1)) ;;
    *) fail=$((fail+1)); echo "FAIL: $desc — expected the high-risk autonomy note, got: [$ctx]" ;;
  esac
}

command -v jq >/dev/null 2>&1 || { echo "SKIP: jq not installed"; exit 0; }

check "production deploy fires the production-write rule" \
      "deploy the billing service to production" "rule-production-write"
check "destructive DDL fires even with words between drop and column" \
      "drop the legacy_id column from users" "rule-destructive-ddl"
check "leaked credential fires the secret rule" \
      "we leaked an api key in git" "rule-secret-exposure"
check "sweep phrasing fires the fanout rule" \
      "add pagination across all endpoints" "rule-fanout"
check "new feature fires the spec threshold" \
      "build a notifications module" "rule-spec-threshold"
check "done-claim fires the verification rule" \
      "is this done?" "rule-verification"
check "breaking change fires the public contract rule" \
      "this is a breaking change to the orders API" "rule-public-contract"
check "PII fires the sensitive data rule" \
      "store the patient medical record" "rule-sensitive-data"
check "rewrite fires the large change rule" \
      "rewrite the scheduler" "rule-large-change"
check "fine-tuning fires the volatile knowledge rule" \
      "should we fine-tune a model for this?" "rule-volatile-knowledge"

# Field labels on the per-rule line. Asserting the rule id fires says nothing about
# WHICH field each value was printed as: a collapsed optional field still names the
# right rule while labelling its gate a preference and dropping risk. Both prompts
# below match exactly one rule, and neither rule defines `prefer`, so any "prefer:"
# here is a shifted field rather than registry content.
check "production-write labels gate and risk in their own slots" \
      "deploy the billing service to production" \
      "rule-production-write — require: explicit-approval, rollback-plan, audit-log [gate: release] [risk: high]"
check_absent "production-write never labels its gate a preference" \
      "deploy the billing service to production" "prefer:"
check "destructive DDL labels risk with no gate of its own" \
      "drop the legacy_id column from users" \
      "rule-destructive-ddl — require: two-phase-deploy, explicit-confirmation, down-path-or-documented-irreversibility [risk: high]"
check_absent "destructive DDL never labels its risk a preference" \
      "drop the legacy_id column from users" "prefer:"
# The mirror case: a rule that really does define `prefer` must still print it, so a
# fix cannot pass by dropping the field instead of keeping it in its slot.
check "a rule that defines prefer still prints the prefer label" \
      "should we fine-tune a model for this?" \
      "rule-volatile-knowledge — require: retrieval-evaluation, freshness-policy — prefer: retrieval-over-fine-tuning"

check_risk "production deploy attaches the A3 ceiling" \
      "deploy the billing service to production"
check_risk "destructive DDL attaches the A3 ceiling" \
      "truncate the events table"

# Silence cases. These are the ones that keep the hook usable.
check "plain question stays silent"        "what does base.md say about naming" ""
check "reading code stays silent"          "show me the order service" ""
check "small fix stays silent"             "fix the typo in the readme" ""
check "empty prompt stays silent"          "" ""

# ---- P7 telemetry: decision-rules event writes ----
MATCH_PROMPT="deploy the billing service to production"

T=$(mktemp -d); ( cd "$T" && git init -q ) >/dev/null 2>&1; mkdir -p "$T/.engineos"
OUT=$(jq -nc --arg p "$MATCH_PROMPT" --arg c "$T" --arg s "gasmoke1" '{prompt:$p, cwd:$c, session_id:$s}' | bash "$HOOK")
TF="$T/.git/engineos-telemetry/gasmoke1.jsonl"
if [ -f "$TF" ] && [ "$(wc -l < "$TF" | tr -d ' ')" = "1" ] \
   && [ "$(jq -r '.event' "$TF")" = "decision-rules" ] \
   && bash "$DIR/../scripts/telemetry.sh" validate "$TF" >/dev/null 2>&1; then
  pass=$((pass+1)); echo "ok   decision-rules event written for a matching prompt in an adopted repo"
else
  fail=$((fail+1)); echo "FAIL decision-rules event written for a matching prompt — file=$([ -f "$TF" ] && cat "$TF" || echo MISSING)"
fi
CTX_UNCHANGED=$(printf '%s' "$OUT" | jq -r '.hookSpecificOutput.additionalContext // ""')
case "$CTX_UNCHANGED" in
  *"rule-production-write"*) pass=$((pass+1)); echo "ok   stdout unchanged by the telemetry write" ;;
  *) fail=$((fail+1)); echo "FAIL stdout unchanged by the telemetry write — got: $CTX_UNCHANGED" ;;
esac
rm -rf "$T"

T=$(mktemp -d); ( cd "$T" && git init -q ) >/dev/null 2>&1; mkdir -p "$T/.engineos"
ENGINEOS_TELEMETRY=0 bash -c "jq -nc --arg p '$MATCH_PROMPT' --arg c '$T' --arg s gasmoke2 '{prompt:\$p, cwd:\$c, session_id:\$s}' | bash '$HOOK'" >/dev/null
if [ ! -e "$T/.git/engineos-telemetry" ]; then
  pass=$((pass+1)); echo "ok   ENGINEOS_TELEMETRY=0 writes no file"
else
  fail=$((fail+1)); echo "FAIL ENGINEOS_TELEMETRY=0 writes no file"
fi
rm -rf "$T"

T=$(mktemp -d); ( cd "$T" && git init -q ) >/dev/null 2>&1  # no .engineos/ -> not adopted
jq -nc --arg p "$MATCH_PROMPT" --arg c "$T" --arg s "gasmoke3" '{prompt:$p, cwd:$c, session_id:$s}' | bash "$HOOK" >/dev/null
if [ ! -e "$T/.git/engineos-telemetry" ]; then
  pass=$((pass+1)); echo "ok   non-adopted repo (no .engineos/) writes no file"
else
  fail=$((fail+1)); echo "FAIL non-adopted repo writes no file"
fi
rm -rf "$T"

echo
printf 'pass=%d fail=%d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
