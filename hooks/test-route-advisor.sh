#!/usr/bin/env bash
# Behavioral tests for hooks/route-advisor.sh. Same house pattern as
# hooks/test-task-scale.sh: feed {"prompt": "..."} on stdin, assert on stdout.
# Run: hooks/test-route-advisor.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/route-advisor.sh"
pass=0; fail=0

feed() {  # <prompt json string, already escaped>
  printf '{"prompt":%s}\n' "$1" | bash "$HOOK"
}

ctx_of() {  # <hook-json> -> the additionalContext string, or empty
  printf '%s' "$1" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null
}

check() {  # <desc> <prompt> <expected-substring | empty=expect no output>
  local desc="$1" prompt="$2" exp="$3" out ctx
  out=$(feed "$(printf '%s' "$prompt" | jq -Rs .)")
  ctx=$(ctx_of "$out")
  if [ -z "$exp" ]; then
    if [ -z "$ctx" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $desc — expected no output, got: $ctx"; fi
  else
    case "$ctx" in
      *"$exp"*) pass=$((pass+1)) ;;
      *) fail=$((fail+1)); echo "FAIL: $desc — want '$exp' in: [$ctx]" ;;
    esac
  fi
}

echo "== route-advisor.sh behavioral tests =="

# escalating prompt -> escalation notice naming the reason and the router agent
check "multi-agent-dispatch escalates" \
  "add a paginated orders endpoint to the API and mirror the screen to mobile" \
  "route escalation"
check "escalation notice names the reason" \
  "add a paginated orders endpoint to the API and mirror the screen to mobile" \
  "multi-agent-dispatch"
check "escalation notice names the router agent" \
  "add a paginated orders endpoint to the API and mirror the screen to mobile" \
  "router"

check "unrouted-scale escalates" \
  "migrate all services to the new logging format across all packages" \
  "route escalation"

check "requires-dispatch-plan escalates" \
  "backfill the tenant column" \
  "route escalation"

# non-escalating prompt with matches -> exactly one deterministic route line
check "resolved single-domain prompt does not escalate" \
  "fix the auth guard bug" \
  "route (kernel, deterministic)"
check "deterministic line names the resolved intent" \
  "fix the auth guard bug" \
  "intents=security-files"

out=$(feed "$(printf '%s' "fix the auth guard bug" | jq -Rs .)")
ctx=$(ctx_of "$out")
lines=$(printf '%s' "$ctx" | grep -c '^\[engineos\]')
if [ "$lines" -le 1 ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: deterministic output is not exactly one line: [$ctx]"; fi

# zero matches, no scale signal -> silent
check "unmatched prompt with no scale signal is silent" \
  "what time is it" \
  ""

echo "-- exit codes and no-jq behavior --"

feed "$(printf '%s' "add a paginated orders endpoint to the API and mirror the screen to mobile" | jq -Rs .)" >/dev/null
rc=$?
[ "$rc" -eq 0 ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL: escalating prompt exit code $rc, want 0"; }

printf 'not json at all' | bash "$HOOK" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 0 ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL: malformed payload exit code $rc, want 0"; }

# Stripping jq's directory out of PATH is not enough on a machine with jq
# installed twice (e.g. /usr/bin AND a conda env). Build an isolated PATH
# instead, with symlinks ONLY for what the hook needs besides jq — cat and
# dirname; cd/printf/pwd are bash builtins. jq is deliberately absent.
TMPBIN=$(mktemp -d)
ln -s "$(command -v cat)" "$TMPBIN/cat"
ln -s "$(command -v dirname)" "$TMPBIN/dirname"
BASH_ABS="$(command -v bash)"
out=$(printf '{"prompt":"add a paginated orders endpoint to the API and mirror the screen to mobile"}' | PATH="$TMPBIN" "$BASH_ABS" "$HOOK" 2>&1)
rc=$?
rm -rf "$TMPBIN"
if [ "$rc" -eq 0 ] && [ -z "$(printf '%s' "$out" | tr -d '[:space:]')" ]; then
  pass=$((pass+1))
else
  fail=$((fail+1)); echo "FAIL: no-jq run — rc=$rc out=[$out], want rc=0 and no output"
fi

echo "-- P7 telemetry: route event writes --"

ESC_PROMPT="add a paginated orders endpoint to the API and mirror the screen to mobile"
ZERO_PROMPT="what time is it"

T=$(mktemp -d); ( cd "$T" && git init -q ) >/dev/null 2>&1; mkdir -p "$T/.engineos"
OUT=$(jq -nc --arg p "$ESC_PROMPT" --arg c "$T" --arg s "rasmoke1" '{prompt:$p, cwd:$c, session_id:$s}' | bash "$HOOK")
TF="$T/.git/engineos-telemetry/rasmoke1.jsonl"
if [ -f "$TF" ] && [ "$(wc -l < "$TF" | tr -d ' ')" = "1" ] \
   && [ "$(jq -r '.event' "$TF")" = "route" ] \
   && bash "$DIR/../scripts/telemetry.sh" validate "$TF" >/dev/null 2>&1; then
  pass=$((pass+1)); echo "ok   route event written for an escalating prompt in an adopted repo"
else
  fail=$((fail+1)); echo "FAIL route event written for an escalating prompt — file=$([ -f "$TF" ] && cat "$TF" || echo MISSING)"
fi
CTX_UNCHANGED=$(printf '%s' "$OUT" | jq -r '.hookSpecificOutput.additionalContext // ""')
case "$CTX_UNCHANGED" in
  *"route escalation"*) pass=$((pass+1)); echo "ok   stdout unchanged by the telemetry write" ;;
  *) fail=$((fail+1)); echo "FAIL stdout unchanged by the telemetry write — got: $CTX_UNCHANGED" ;;
esac
rm -rf "$T"

# Zero-match, no-scale prompt: still writes a route line (the denominator),
# but produces NO additionalContext — the write happens before the silent exit.
T=$(mktemp -d); ( cd "$T" && git init -q ) >/dev/null 2>&1; mkdir -p "$T/.engineos"
OUT=$(jq -nc --arg p "$ZERO_PROMPT" --arg c "$T" --arg s "rasmoke2" '{prompt:$p, cwd:$c, session_id:$s}' | bash "$HOOK")
TF="$T/.git/engineos-telemetry/rasmoke2.jsonl"
CTX=$(ctx_of "$OUT")
if [ -f "$TF" ] && [ "$(jq -r '.data.intents | length' "$TF")" = "0" ] && [ -z "$CTX" ]; then
  pass=$((pass+1)); echo "ok   zero-match prompt writes a route line (the denominator) with no additionalContext"
else
  fail=$((fail+1)); echo "FAIL zero-match prompt route line — file=$([ -f "$TF" ] && cat "$TF" || echo MISSING) ctx=[$CTX]"
fi
rm -rf "$T"

T=$(mktemp -d); ( cd "$T" && git init -q ) >/dev/null 2>&1; mkdir -p "$T/.engineos"
ENGINEOS_TELEMETRY=0 bash -c "jq -nc --arg p '$ESC_PROMPT' --arg c '$T' --arg s rasmoke3 '{prompt:\$p, cwd:\$c, session_id:\$s}' | bash '$HOOK'" >/dev/null
if [ ! -e "$T/.git/engineos-telemetry" ]; then
  pass=$((pass+1)); echo "ok   ENGINEOS_TELEMETRY=0 writes no file"
else
  fail=$((fail+1)); echo "FAIL ENGINEOS_TELEMETRY=0 writes no file"
fi
rm -rf "$T"

T=$(mktemp -d); ( cd "$T" && git init -q ) >/dev/null 2>&1  # no .engineos/ -> not adopted
jq -nc --arg p "$ESC_PROMPT" --arg c "$T" --arg s "rasmoke4" '{prompt:$p, cwd:$c, session_id:$s}' | bash "$HOOK" >/dev/null
if [ ! -e "$T/.git/engineos-telemetry" ]; then
  pass=$((pass+1)); echo "ok   non-adopted repo (no .engineos/) writes no file"
else
  fail=$((fail+1)); echo "FAIL non-adopted repo writes no file"
fi
rm -rf "$T"

echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
