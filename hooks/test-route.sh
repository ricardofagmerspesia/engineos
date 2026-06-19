#!/usr/bin/env bash
# Smoke test for route-before-change.sh. Feeds sample PreToolUse payloads and
# asserts the injected additionalContext. Run: hooks/test-route.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/route-before-change.sh"
pass=0; fail=0

check() {  # <desc> <file> <expected-substring | empty=expect no routing>
  local desc="$1" file="$2" exp="$3" out ctx
  out=$(printf '{"tool_input":{"file_path":"%s"}}' "$file" | bash "$HOOK")
  ctx=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null)
  if [ -z "$exp" ]; then
    if [ -z "$ctx" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $desc — expected no routing, got: $ctx"; fi
  else
    case "$ctx" in
      *"$exp"*) pass=$((pass+1)) ;;
      *) fail=$((fail+1)); echo "FAIL: $desc — want '$exp' in: [$ctx]" ;;
    esac
  fi
}

check "tsx -> frontend"        "/tmp/app/Button.tsx"                 "frontend-coordinator"
check "controller -> backend"  "/tmp/api/user.controller.ts"        "backend-coordinator"
check "sql -> dba"             "/tmp/db/001_init.sql"               "dba-coordinator"
check "workflow -> devops"     "/tmp/proj/.github/workflows/ci.yml" "devops-coordinator"
check "dockerfile -> devops"   "/tmp/proj/Dockerfile"               "devops-coordinator"
check "prompt -> llm"          "/tmp/ai/prompt-builder.ts"          "llm-coordinator"
check "app router -> frontend" "/tmp/web/app/page-helper.ts"        "frontend-coordinator"
check "spec -> test"           "/tmp/api/user.service.spec.ts"      "test-writer"
check "auth -> security"       "/tmp/api/auth.guard.ts"             "security-reviewer"
check "excluded .engineos/"    "/tmp/repo/.engineos/changes/x.md"   ""
check "excluded .engineos ts"  "/tmp/repo/.engineos/notes.ts"       ""
check "excluded md"            "/tmp/repo/README.md"                ""
check "excluded hooks/"        "/tmp/repo/hooks/foo.sh"             ""

echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
