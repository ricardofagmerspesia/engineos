#!/usr/bin/env bash
# Tests for scripts/exec-journal.sh — the Phase 1 exec-journal schema's
# append/validate CLI. Run: scripts/test-exec-journal.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EJ="$ROOT/scripts/exec-journal.sh"
pass=0; fail=0

check() { # description, expected-exit(0|nonzero), actual-exit
  local desc="$1" want="$2" got="$3"
  if { [ "$want" = "0" ] && [ "$got" -eq 0 ]; } || { [ "$want" != "0" ] && [ "$got" -ne 0 ]; }; then
    pass=$((pass+1)); printf 'ok   %s\n' "$desc"
  else
    fail=$((fail+1)); printf 'FAIL %s — exit %s, expected %s\n' "$desc" "$got" "$want"
  fi
}

echo "== exec-journal tests =="

tmp=$(mktemp)

bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --agent backend-coordinator \
  --model-tier build --status OK --tokens-in 100 --tokens-out 200 --duration-ms 5000 >/dev/null 2>&1
check "append with an agent succeeds" 0 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id author-spec \
  --model-tier most-capable --status FAILED --tokens-in 10 --tokens-out 0 --duration-ms 100 \
  --note "spec artifact missing" >/dev/null 2>&1
check "append with agent omitted (null) succeeds" 0 $?

lines=$(wc -l < "$tmp" | tr -d ' ')
[ "$lines" -eq 2 ] && { pass=$((pass+1)); printf 'ok   %s\n' "both appended lines are present"; } \
                   || { fail=$((fail+1)); printf 'FAIL both appended lines are present — got %s lines\n' "$lines"; }

bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate accepts what append wrote" 0 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build \
  --status NOT_A_STATUS --tokens-in 1 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append rejects an unknown status" 1 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier not-a-tier \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append rejects an unknown model tier" 1 $?

echo '{"run_id":"r2"}' >> "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects a line missing required fields" 1 $?

rm -f "$tmp"

# A flag with no value following it must hit usage(), not an unbound-variable
# crash from `set -u` reading an absent $2.
bash "$EJ" append /tmp/nonexistent-does-not-matter.jsonl --run-id >/dev/null 2>&1
check "append rejects a flag given with no value, not a bash crash" 1 $?

tmp=$(mktemp)
bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --agent 'foo"bar' \
  --model-tier build --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append accepts an agent value containing a double quote" 0 $?
[ "$(jq -r '.agent' "$tmp")" = 'foo"bar' ] && { pass=$((pass+1)); printf 'ok   %s\n' "a quoted agent value round-trips unescaped"; } \
  || { fail=$((fail+1)); printf 'FAIL a quoted agent value round-trips unescaped — got %s\n' "$(jq -r '.agent' "$tmp")"; }
rm -f "$tmp"

tmp=$(mktemp)
bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build --status OK \
  --tokens-in 1 --tokens-out 1 --duration-ms 1 --note 'foo\bar' >/dev/null 2>&1
[ "$(jq -r '.note' "$tmp")" = 'foo\bar' ] && { pass=$((pass+1)); printf 'ok   %s\n' "a backslash in note is not reinterpreted as a JSON escape"; } \
  || { fail=$((fail+1)); printf 'FAIL a backslash in note is not reinterpreted as a JSON escape — got %s\n' "$(jq -r '.note' "$tmp")"; }
rm -f "$tmp"

tmp=$(mktemp)
bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build --status OK \
  --tokens-in -5 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append rejects a negative tokens-in" 1 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build --status OK \
  --tokens-in 1.5 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append rejects a fractional tokens-in" 1 $?
rm -f "$tmp"

tmp=$(mktemp)
printf '%s' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":-1,"tokens_out":1,"duration_ms":1,"note":null}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate checks the final line even with no trailing newline" 1 $?
rm -f "$tmp"

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
