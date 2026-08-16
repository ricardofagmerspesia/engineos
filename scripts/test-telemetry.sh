#!/usr/bin/env bash
# Tests for scripts/telemetry.sh — the P7 kernel-decision event capture CLI.
# Run: scripts/test-telemetry.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TS="$ROOT/scripts/telemetry.sh"
pass=0; fail=0

check() { # description, expected-exit(0|nonzero), actual-exit
  local desc="$1" want="$2" got="$3"
  if { [ "$want" = "0" ] && [ "$got" -eq 0 ]; } || { [ "$want" != "0" ] && [ "$got" -ne 0 ]; }; then
    pass=$((pass+1)); printf 'ok   %s\n' "$desc"
  else
    fail=$((fail+1)); printf 'FAIL %s — exit %s, expected %s\n' "$desc" "$got" "$want"
  fi
}

echo "== telemetry tests =="

tmp=$(mktemp)

# Append every registry event's sample, deterministic timestamp.
for ev in route decision-rules verify; do
  sample=$(jq -c --arg e "$ev" '.telemetry.events[] | select(.id == $e) | .sample' "$ROOT/registries/policy.json")
  bash "$TS" append "$tmp" --session s1 --event "$ev" --data "$sample" --ts 2026-08-06T00:00:00Z >/dev/null 2>&1
  check "append the $ev registry sample succeeds" 0 $?
done

lines=$(wc -l < "$tmp" | tr -d ' ')
[ "$lines" -eq 3 ] && { pass=$((pass+1)); printf 'ok   %s\n' "all three appended lines are present"; } \
                   || { fail=$((fail+1)); printf 'FAIL all three appended lines are present — got %s lines\n' "$lines"; }

ts=$(head -1 "$tmp" | jq -r '.ts')
[ "$ts" = "2026-08-06T00:00:00Z" ] && { pass=$((pass+1)); printf 'ok   %s\n' "the --ts override round-trips (determinism)"; } \
  || { fail=$((fail+1)); printf 'FAIL the --ts override round-trips — got %s\n' "$ts"; }

bash "$TS" validate "$tmp" >/dev/null 2>&1
check "validate accepts what append wrote" 0 $?
rm -f "$tmp"

tmp=$(mktemp)

bash "$TS" append "$tmp" --session s1 --event bogus --data '{}' >/dev/null 2>&1
check "append rejects an unknown event" 1 $?

bash "$TS" append "$tmp" --session s1 --event route --data '{"bogus_key":"x"}' >/dev/null 2>&1
check "append rejects a data key not in the event's keys" 1 $?

bash "$TS" append "$tmp" --session s1 --event route --data '{"intents":["two words"]}' >/dev/null 2>&1
check "append rejects a string value containing a space" 1 $?

bash "$TS" append "$tmp" --session s1 --event route --data '{"agents":["ok","also fine but not"]}' >/dev/null 2>&1
check "append rejects an array-of-strings with one whitespace value" 1 $?

bash "$TS" append "$tmp" --session s1 --event route --data '{"intents":{"a":1}}' >/dev/null 2>&1
check "append rejects a nested object as a value" 1 $?

bash "$TS" append "$tmp" --session s1 --event route --data 'not json' >/dev/null 2>&1
check "append rejects --data that is not JSON" 1 $?

bash "$TS" append "$tmp" --session s1 --event route --data >/dev/null 2>&1
check "append rejects a flag given with no value, not a bash crash" 1 $?
rm -f "$tmp"

tmp=$(mktemp)
bash "$TS" append "$tmp" --session s1 --event route --data '{}' --ts 2026-08-06T00:00:00Z >/dev/null 2>&1
printf '{"ts":"2026-08-06T00:00:00Z","session_id":"s1","event":"bogus","data":{}}' >> "$tmp"
validate_out=$(bash "$TS" validate "$tmp" 2>&1) || true
case "$validate_out" in
  *"line 2:"*) pass=$((pass+1)); printf 'ok   %s\n' "validate reports the bad line's number" ;;
  *) fail=$((fail+1)); printf 'FAIL validate reports the bad line'"'"'s number — got: %s\n' "$validate_out" ;;
esac
rm -f "$tmp"

tmp=$(mktemp)
printf '%s' '{"ts":"2026-08-06T00:00:00Z","session_id":"s1","event":"route","data":{}}' > "$tmp"
bash "$TS" validate "$tmp" >/dev/null 2>&1
check "validate checks the final line even with no trailing newline" 0 $?
rm -f "$tmp"

# Missing jq -> hard error exit 1, matching exec-journal.sh's own precedent.
TMPBIN=$(mktemp -d)
for b in cat dirname pwd printf mktemp; do ln -s "$(command -v "$b")" "$TMPBIN/$b" 2>/dev/null || true; done
BASH_ABS="$(command -v bash)"
out=$(PATH="$TMPBIN" "$BASH_ABS" "$TS" append /tmp/x --session s --event route --data '{}' 2>&1)
rc=$?
rm -rf "$TMPBIN"
if [ "$rc" -eq 1 ] && printf '%s' "$out" | grep -q '"error"'; then
  pass=$((pass+1)); printf 'ok   %s\n' "missing jq is a hard error, not a silent skip"
else
  fail=$((fail+1)); printf 'FAIL missing jq is a hard error — rc=%s out=%s\n' "$rc" "$out"
fi

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
