#!/usr/bin/env bash
# Smoke test for task-scale-advisor.sh. Feeds sample UserPromptSubmit payloads and
# asserts the injected additionalContext. Run: hooks/test-task-scale.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/task-scale-advisor.sh"
pass=0; fail=0

check() {  # <desc> <prompt> <expected-substring | empty=expect no output>
  local desc="$1" prompt="$2" exp="$3" out ctx
  out=$(jq -nc --arg p "$prompt" '{prompt:$p}' | bash "$HOOK")
  ctx=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null)
  if [ -z "$exp" ]; then
    if [ -z "$ctx" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $desc — expected nothing, got: $ctx"; fi
  else
    case "$ctx" in
      *"$exp"*) pass=$((pass+1)) ;;
      *) fail=$((fail+1)); echo "FAIL: $desc — expected '$exp', got: $ctx" ;;
    esac
  fi
}

check "multi-module build fans out" \
  "Implement the notifications feature across all services" "big-task signal"
check "sweep refactor fans out" \
  "Refactor every component to the new theme API" "big-task signal"
check "spec authoring picks top tier" \
  "Write the PRD for the billing rework" "model: fable"
check "architecture picks design tier" \
  "Should we use Kafka or SQS for this? design the flow" "model: opus"
check "small edit stays quiet" \
  "fix the typo in the login label" ""
# countable nouns are plural-only: one unit of work must not trip the fan-out advice
check "single component stays quiet" \
  "add a component for the user avatar" ""
check "single service stays quiet" \
  "create a service to send the welcome email" ""
check "question stays quiet" \
  "what does this function return?" ""

echo "task-scale-advisor: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
