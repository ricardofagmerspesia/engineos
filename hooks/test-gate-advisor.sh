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

check_risk "production deploy attaches the A3 ceiling" \
      "deploy the billing service to production"
check_risk "destructive DDL attaches the A3 ceiling" \
      "truncate the events table"

# Silence cases. These are the ones that keep the hook usable.
check "plain question stays silent"        "what does base.md say about naming" ""
check "reading code stays silent"          "show me the order service" ""
check "small fix stays silent"             "fix the typo in the readme" ""
check "empty prompt stays silent"          "" ""

echo
printf 'pass=%d fail=%d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
