#!/usr/bin/env bash
# Smoke test for route-before-change.sh + routing-map.sh. Feeds sample PreToolUse
# payloads and asserts the FULL injected guidance string (not just an agent-name
# substring — a wrong rules list would otherwise slip through unnoticed).
# Run: hooks/test-route.sh
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

# Full canonical guidance strings (rules|skill|agent) — kept identical to
# routing-map.sh's echo lines. Asserting the full string, not just the agent
# name, catches a wrong/stale rules list that a substring check would miss.
FRONTEND="rules/frontend.md+architecture.md+testing.md | skill:react-patterns | agent:frontend-coordinator"
BACKEND="rules/backend.md+architecture.md+data.md+testing.md+observability.md | skill:nestjs-patterns | agent:backend-coordinator"
DBA="rules/data.md+architecture.md | agent:dba-coordinator (postgres/oracle)"
DEVOPS="rules/architecture.md+observability.md | agent:devops-coordinator (kubernetes/gcp/cicd)"
LLM="rules/llm-apps.md | skill:llm-engineering | agent:llm-coordinator"
TEST_G="rules/testing.md | agent:test-writer"
SECURITY="rules/security.md | agent:security-reviewer"
MOBILE="rules/frontend.md+architecture.md+backend.md+testing.md+observability.md (adapt to React Native) | agent:mobile-coordinator"
IOS_BUILD="rules/security.md (signing) | agent:ios-builder"
ANDROID_BUILD="rules/security.md (signing) | agent:android-builder"

check "tsx -> frontend"        "/tmp/app/Button.tsx"                 "$FRONTEND"
check "controller -> backend"  "/tmp/api/user.controller.ts"        "$BACKEND"
check "sql -> dba"             "/tmp/db/001_init.sql"               "$DBA"
check "workflow -> devops"     "/tmp/proj/.github/workflows/ci.yml" "$DEVOPS"
check "dockerfile -> devops"   "/tmp/proj/Dockerfile"               "$DEVOPS"
check "docker-compose -> devops" "/tmp/proj/docker-compose.yml"     "$DEVOPS"
check "terraform dir -> devops" "/tmp/infra/terraform/main.tf"      "$DEVOPS"
check "jenkinsfile -> devops"  "/tmp/proj/Jenkinsfile"              "$DEVOPS"
check "prompt -> llm"          "/tmp/ai/prompt-builder.ts"          "$LLM"
check "spec -> test"           "/tmp/api/user.service.spec.ts"      "$TEST_G"
check "auth -> security"       "/tmp/api/auth.guard.ts"             "$SECURITY"
check "auth dir -> security"   "/tmp/api/src/auth/login.service.ts" "$SECURITY"

# mobile precedes frontend: RN screens are .tsx but belong to mobile-coordinator
check "rn screen -> mobile"    "/tmp/apps/mobile/src/Home.tsx"      "$MOBILE"
check "native suffix -> mobile" "/tmp/lib/Sheet.native.tsx"         "$MOBILE"
check "ios dir -> mobile"      "/tmp/ios/App/AppDelegate.swift"     "$MOBILE"

# store-builder precedes mobile: release plumbing gets ios-builder/android-builder,
# not mobile-coordinator, even though it lives under ios/ or android/.
check "fastlane -> ios-builder"          "/tmp/ios/fastlane/Fastfile"        "$IOS_BUILD"
check "info.plist -> ios-builder"        "/tmp/app/ios/App/Info.plist"       "$IOS_BUILD"
check "podfile -> ios-builder"           "/tmp/app/ios/Podfile"              "$IOS_BUILD"
check "android gradle -> android-builder" "/tmp/android/app/build.gradle"    "$ANDROID_BUILD"
check "keystore -> android-builder"      "/tmp/android/release.keystore"     "$ANDROID_BUILD"

# queue/pipeline backend suffixes
check "processor -> backend"   "/tmp/api/src/jobs/email.processor.ts" "$BACKEND"
check "consumer -> backend"    "/tmp/api/src/queue/orders.consumer.ts" "$BACKEND"
check "interceptor -> backend" "/tmp/api/src/common/logging.interceptor.ts" "$BACKEND"

# regression: unanchored globs used to mis-route these
check "storage is NOT llm"     "/tmp/api/src/storage/index.ts"      ""
check "paragraph is NOT llm"   "/tmp/lib/paragraph/split.ts"        ""
check "evaluate is NOT llm"    "/tmp/api/orders/evaluate.ts"        ""
check "nest src/app NOT front" "/tmp/api/src/app/config.ts"         ""
check "llm dir -> llm"         "/tmp/api/src/llm/client.ts"         "$LLM"
check "evals dir -> llm"       "/tmp/api/src/evals/golden.ts"       "$LLM"
check "excluded .engineos/"    "/tmp/repo/.engineos/changes/x.md"   ""
check "excluded .engineos ts"  "/tmp/repo/.engineos/notes.ts"       ""
check "excluded md"            "/tmp/repo/README.md"                ""

# regression: unanchored *auth*/*guard*/*middleware* used to catch these — now
# delimiter-bounded so "authors/" (a resource name) doesn't collide with "auth/"
# (the security-sensitive directory).
check "authors ctrl NOT security" "/tmp/api/src/authors/author.controller.ts" "$BACKEND"

# --- route_excluded unit checks (exclusion-scoping fix) -------------------------
# The generic */hooks/*, */docs/* exclusions used to swallow ANY project's own
# src/hooks/ or product docs/ dir. They must now only exclude EngineOS's own
# hooks/ and docs/ trees (resolved from this script's own location), while
# .engineos/ stays excluded everywhere (generic, not EngineOS-repo-specific).
# shellcheck source=hooks/routing-map.sh
. "$DIR/routing-map.sh"

exclcheck() {  # <desc> <path> <want: excluded|routed>
  local desc="$1" path="$2" want="$3" got
  if route_excluded "$path"; then got=excluded; else got=routed; fi
  if [ "$got" = "$want" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $desc — want $want got $got"; fi
}

exclcheck "generic project src/hooks/ not swallowed" "/some/project/src/hooks/useAuth.ts" routed
exclcheck "generic project docs/ ts not swallowed"   "/some/project/docs/notes.ts"        routed
exclcheck "EngineOS's own hooks/ file excluded"      "$DIR/routing-map.sh"                excluded
exclcheck "EngineOS's own docs/ file excluded"       "$(cd "$DIR/.." && pwd)/docs/x.ts"   excluded
exclcheck ".engineos/ exclusion stays generic"       "/some/project/.engineos/changes/x.ts" excluded

echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
