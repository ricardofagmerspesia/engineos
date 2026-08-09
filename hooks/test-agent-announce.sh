#!/usr/bin/env bash
# Smoke test for announce-agent-dispatch.sh / announce-agent-return.sh.
# Feeds sample PreToolUse/PostToolUse payloads and asserts the injected
# additionalContext. Run: hooks/test-agent-announce.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0

check() {  # <desc> <hook> <payload> <expected-substring>
  local desc="$1" hook="$2" payload="$3" exp="$4" out ctx
  out=$(printf '%s' "$payload" | bash "$DIR/$hook")
  ctx=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null)
  case "$ctx" in
    *"$exp"*) pass=$((pass+1)) ;;
    *) fail=$((fail+1)); echo "FAIL: $desc — want '$exp' in: [$ctx]" ;;
  esac
}

check "dispatch names agent type" \
  "announce-agent-dispatch.sh" \
  '{"tool_input":{"subagent_type":"backend-coordinator","description":"scope src/orders"}}' \
  "backend-coordinator"

check "dispatch carries description" \
  "announce-agent-dispatch.sh" \
  '{"tool_input":{"subagent_type":"backend-coordinator","description":"scope src/orders"}}' \
  "scope src/orders"

check "dispatch tells banner format" \
  "announce-agent-dispatch.sh" \
  '{"tool_input":{"subagent_type":"general-purpose"}}' \
  "diff-fenced"

check "return names agent type" \
  "announce-agent-return.sh" \
  '{"tool_input":{"subagent_type":"frontend-coordinator"}}' \
  "frontend-coordinator"

check "return tells banner format" \
  "announce-agent-return.sh" \
  '{"tool_input":{"subagent_type":"frontend-coordinator"}}' \
  "done|FAILED"

echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
