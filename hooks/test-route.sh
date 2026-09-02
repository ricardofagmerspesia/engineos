#!/usr/bin/env bash
# Smoke test for route-before-change.sh + kernel.sh route-path. Feeds sample PreToolUse
# payloads and asserts the FULL injected guidance string (not just an agent-name
# substring — a wrong rules list would otherwise slip through unnoticed).
# Run: hooks/test-route.sh
set -uo pipefail
# Isolate from the operator's bypass switches: a machine-wide pause must never make
# this suite go quiet and report green (hooks/bypass.sh).
export ENGINEOS_BYPASS_FLAG=/nonexistent/engineos.bypass
unset ENGINEOS_BYPASS
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

# Full canonical guidance strings (rules|skill|agent) — kept identical to the
# hook_guidance values in registries/routing.json. Asserting the full string, not
# just the agent name, catches a wrong/stale rules list that a substring check
# would miss.
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

# --- exclusion unit checks, against the kernel's JSON contract ------------------
# The generic */hooks/*, */docs/* exclusions used to swallow ANY project's own
# src/hooks/ or product docs/ dir. They must only exclude EngineOS's own hooks/
# and docs/ trees — registries/routing.json .excluded.self_dirs, resolved by the
# kernel against its own root — while .engineos/ stays excluded everywhere
# (generic, not EngineOS-repo-specific). Asserted on `.excluded == true` in the
# kernel's own output, so this suite tests the shipped resolver, not a wrapper.
EOS_ROOT="$(cd "$DIR/.." && pwd)"
KERNEL="$EOS_ROOT/scripts/kernel.sh"

exclcheck() {  # <desc> <path> <want: excluded|routed>
  local desc="$1" path="$2" want="$3" got
  if bash "$KERNEL" route-path "$path" 2>/dev/null | jq -e '.excluded == true' >/dev/null 2>&1
  then got=excluded; else got=routed; fi
  if [ "$got" = "$want" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $desc — want $want got $got"; fi
}

exclcheck "generic project src/hooks/ not swallowed" "/some/project/src/hooks/useAuth.ts" routed
exclcheck "generic project hooks/ ts not swallowed"  "/some/project/hooks/x.ts"           routed
exclcheck "generic project docs/ ts not swallowed"   "/some/project/docs/notes.ts"        routed
exclcheck "EngineOS's own hooks/ file excluded"      "$DIR/x.sh"                          excluded
exclcheck "EngineOS's own docs/ file excluded"       "$EOS_ROOT/docs/x.ts"                excluded
exclcheck ".engineos/ exclusion stays generic"       "/some/project/.engineos/changes/x.ts" excluded

# Session cache: the same path reuses one entry; a buster produces a distinct
# key, proving invalidation does not require deleting or mutating source files.
T=$(mktemp -d)
(cd "$T" && git init -q) >/dev/null 2>&1
mkdir -p "$T/src"
CACHE_PAYLOAD=$(jq -nc --arg f "$T/src/Button.tsx" --arg c "$T" \
  '{tool_input:{file_path:$f},cwd:$c,session_id:"route-cache"}')
FIRST=$(printf '%s' "$CACHE_PAYLOAD" | bash "$HOOK" | jq -r '.hookSpecificOutput.additionalContext // ""')
SECOND=$(printf '%s' "$CACHE_PAYLOAD" | bash "$HOOK" | jq -r '.hookSpecificOutput.additionalContext // ""')
CACHE_DIR="$T/.git/engineos-route-cache"
if [ "$FIRST" = "$SECOND" ] && [ -n "$FIRST" ] \
   && [ "$(find "$CACHE_DIR" -type f -name '*.route' 2>/dev/null | wc -l | tr -d ' ')" = "1" ]; then
  pass=$((pass+1))
else
  fail=$((fail+1)); echo "FAIL: repeated route should reuse one session cache entry"
fi
printf '%s' "$CACHE_PAYLOAD" | ENGINEOS_ROUTE_CACHE_BUSTER=changed bash "$HOOK" >/dev/null
if [ "$(find "$CACHE_DIR" -type f -name '*.route' 2>/dev/null | wc -l | tr -d ' ')" = "2" ]; then
  pass=$((pass+1))
else
  fail=$((fail+1)); echo "FAIL: route cache buster should create an invalidated entry"
fi
rm -rf "$T"

echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
