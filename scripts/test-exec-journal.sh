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

# What this pins is jq's own escaping: a value carrying a double quote must not
# be hand-built into a JSON literal. It used to be asserted through --agent,
# which is now a slug field (agent is an identifier, and admitting text there was
# a prompt-text channel to disk). Retargeted at --note, the one field that still
# takes such a value, so the escaping property keeps its test; the guard --agent
# gained is asserted immediately below.
tmp=$(mktemp)
bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --note 'foo"bar' \
  --model-tier build --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append accepts a note value containing a double quote" 0 $?
[ "$(jq -r '.note' "$tmp")" = 'foo"bar' ] && { pass=$((pass+1)); printf 'ok   %s\n' "a quoted note value round-trips unescaped"; } \
  || { fail=$((fail+1)); printf 'FAIL a quoted note value round-trips unescaped — got %s\n' "$(jq -r '.note' "$tmp")"; }
rm -f "$tmp"

# The v1 identifier fields are slugs, at append and at validate. This is the
# tightening item 2 of the fix brief rules for: run_id, capability_id and agent
# used to accept a space, and `validate` used to call the result all valid.
tmp=$(mktemp)
bash "$EJ" append "$tmp" --run-id 'sess 1' --capability-id implement --model-tier build \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append rejects whitespace in run_id" 1 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id 'route thing' --model-tier build \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append rejects whitespace in capability_id" 1 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --agent 'a b c' \
  --model-tier build --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append rejects whitespace in agent" 1 $?

# The exact payload both reviewers landed on disk through --agent: a newline,
# then a second line of arbitrary text.
bash "$EJ" append "$tmp" --run-id r1 --capability-id implement \
  --agent "$(printf 'backend-coordinator\nSECRET=hunter2 leaked prompt text')" \
  --model-tier build --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append rejects a newline in agent (no prompt-text channel through a v1 field)" 1 $?

# ... and note still takes free text, because a guard that rejects everything is
# not a guard.
bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 \
  --note 'a human annotation, with spaces' >/dev/null 2>&1
check "append still accepts free text in note" 0 $?
rm -f "$tmp"

# validate is the guard for journals this CLI did not write, so the same three
# fields are rejected there too.
tmp=$(mktemp)
printf '%s\n' '{"timestamp":"t","run_id":"sess 1","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects whitespace in run_id" 1 $?

printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":"backend-coordinator\nSECRET=hunter2 leaked prompt text","model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects a newline in agent" 1 $?

printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":"my SSN is 123-45-6789, and this is free text"}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate accepts free text in note, the one documented text field" 0 $?
rm -f "$tmp"

# timestamp was the THIRD field to escape the containment claim, and it survived
# the round that closed the first two: --timestamp was exempt from
# check_slug_flag by name, and validate tested it for `type == "string"` only.
# The payload below — a BEL, an ANSI colour sequence, a double quote and a
# newline — appended rc=0 and validated "all valid" through --timestamp while
# the SAME payload in --run-id was rejected. Both boundaries get the case,
# because it passed both.
tmp=$(mktemp)
TS_PAYLOAD=$(printf '2026 \a\033[31mINJECTED\033[0m "q" \nsecond-line')
bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 --timestamp "$TS_PAYLOAD" >/dev/null 2>&1
check "append rejects a newline and control characters in timestamp" 1 $?

# ... and rejects it rather than writing a truncated or escaped version of it.
[ ! -s "$tmp" ] && { pass=$((pass+1)); printf 'ok   %s\n' "the rejected timestamp appended nothing at all"; } \
  || { fail=$((fail+1)); printf 'FAIL the rejected timestamp still wrote %s bytes\n' "$(wc -c < "$tmp")"; }

jq -nc --arg ts "$TS_PAYLOAD" '{timestamp:$ts, run_id:"r", capability_id:"c", agent:null,
  model_tier:"build", status:"OK", tokens_in:0, tokens_out:0, duration_ms:1, note:null}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects a newline and control characters in timestamp" 1 $?
rm -f "$tmp"

# The other direction, so the two rejects above cannot be satisfied by a guard
# that refuses every timestamp: the stamps this repo actually writes must still
# be accepted, at both boundaries. The format is generated the same way
# cmd_append generates its default rather than pinned as a literal, so a change
# to that format moves this test with it.
tmp=$(mktemp)
ISO_NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 --timestamp "$ISO_NOW" >/dev/null 2>&1
check "append accepts the ISO 8601 stamp this CLI itself writes ($ISO_NOW)" 0 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 >/dev/null 2>&1
check "append accepts its own defaulted timestamp" 0 $?

bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate accepts both, so the timestamp guard is not a blanket refusal" 0 $?
rm -f "$tmp"

# The length bound, read from the registry so this test moves with the number.
tmp=$(mktemp)
MVL=$(jq -r '.telemetry.exec_journal.max_value_length // 256' "$ROOT/registries/policy.json" 2>/dev/null)
case "$MVL" in ''|*[!0-9]*|0) MVL=256 ;; esac
LONG=$(awk -v n=$((MVL + 1)) 'BEGIN { while (i++ < n) printf "a" }')
bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 --trace-id "$LONG" >/dev/null 2>&1
check "append rejects a value one character over max_value_length" 1 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 --note "$LONG" >/dev/null 2>&1
check "append rejects an over-long note too" 1 $?

# Over-long is a REJECT, not a truncation: nothing was appended.
[ ! -s "$tmp" ] && { pass=$((pass+1)); printf 'ok   %s\n' "an over-long value appends nothing at all (reject, not truncate)"; } \
  || { fail=$((fail+1)); printf 'FAIL an over-long value was truncated instead of rejected — %s\n' "$(wc -c < "$tmp")"; }

bash "$EJ" append "$tmp" --run-id r1 --capability-id implement --model-tier build \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 1 \
  --trace-id "$(printf %s "$LONG" | cut -c1-"$MVL")" >/dev/null 2>&1
check "append accepts a value exactly at max_value_length" 0 $?
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


echo "-- v2 span fields --"
# Asserted through `check` and a jq -e predicate rather than the brief's
# pass/fail helper names: this suite counts with the integers $pass/$fail and
# has no such functions.
tmp=$(mktemp)

# A v1 line — no v2 flags at all — still validates. Backward compatibility is
# the contract, so this is the first assertion of the section, not the last.
bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build \
  --status OK --tokens-in 1 --tokens-out 1 --duration-ms 5 >/dev/null 2>&1
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "v1 line still validates" 0 $?

# ... and its SHAPE is unchanged: not one v2 key appears on a line that set none
# of them. A v2 field emitted as an explicit null would still validate, so the
# validator alone cannot catch that regression.
jq -e 'has("span_kind") or has("trace_id") or has("cost_micros") or has("cache_hit") | not' "$tmp" >/dev/null 2>&1
check "a v1 line carries no v2 keys at all" 0 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build --status FAILED \
  --tokens-in 0 --tokens-out 0 --duration-ms 900 \
  --trace-id sess-1 --span-id tu-1 --span-kind tool --tool mcp.postgres --provider anthropic \
  --model claude-opus-5 --cost-micros 1200 --retry-attempt 1 --cache-hit false --route dba --risk medium >/dev/null 2>&1
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "v2 line validates" 0 $?

tail -1 "$tmp" | jq -e '.span_kind=="tool" and .cost_micros==1200 and .cache_hit==false and .trace_id=="sess-1"' >/dev/null 2>&1
check "v2 fields round-trip" 0 $?

# Every remaining v2 field, so a flag wired to the wrong variable is caught
# rather than riding along behind the four asserted above.
tail -1 "$tmp" | jq -e '.span_id=="tu-1" and .tool=="mcp.postgres" and .provider=="anthropic"
  and .model=="claude-opus-5" and .retry_attempt==1 and .route=="dba" and .risk=="medium"' >/dev/null 2>&1
check "the remaining v2 fields round-trip too" 0 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build --status OK \
  --tokens-in 0 --tokens-out 0 --duration-ms 1 --span-kind bogus >/dev/null 2>&1
check "unknown span_kind rejected" 1 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build --status OK \
  --tokens-in 0 --tokens-out 0 --duration-ms 1 --trace-id "has space" >/dev/null 2>&1
check "whitespace in trace_id rejected (no prompt-text channel)" 1 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build --status OK \
  --tokens-in 0 --tokens-out 0 --duration-ms 1 --cost-micros 1.5 >/dev/null 2>&1
check "float cost rejected" 1 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build --status OK \
  --tokens-in 0 --tokens-out 0 --duration-ms 1 --risk critical >/dev/null 2>&1
check "unknown risk rejected" 1 $?

bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build --status OK \
  --tokens-in 0 --tokens-out 0 --duration-ms 1 --cache-hit yes >/dev/null 2>&1
check "non-boolean cache_hit rejected" 1 $?

# The whole point of the slug class: a newline must not smuggle a second line
# past the guard. A `grep -E` implementation of is_slug matches line by line and
# accepts this, which is a prompt-text channel straight to disk.
bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build --status OK \
  --tokens-in 0 --tokens-out 0 --duration-ms 1 \
  --trace-id "$(printf 'clean\nand then arbitrary prompt text')" >/dev/null 2>&1
check "a newline inside trace_id is rejected, not accepted on its first line" 1 $?

# A digit string that is not valid JSON. --argjson would abort inside jq here
# instead of honouring the guard, so this pins the --arg + tonumber form.
bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build --status OK \
  --tokens-in 0 --tokens-out 0 --duration-ms 1 --cost-micros 03 >/dev/null 2>&1
check "a leading-zero cost is accepted as a number, not a jq abort" 0 $?
tail -1 "$tmp" | jq -e '.cost_micros == 3' >/dev/null 2>&1
check "the leading-zero cost lands as the number 3" 0 $?

# A v2 flag given as the last argument with no value must reach usage(), not
# re-match forever: `shift 2` with $# = 1 fails silently under this file's
# `set -uo pipefail` and the loop never exits.
bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build --status OK \
  --tokens-in 0 --tokens-out 0 --duration-ms 1 --span-kind >/dev/null 2>&1
check "a v2 flag with no value hits usage, not an arg-loop hang" 1 $?

# Every declared span kind is accepted. Without this, a kind present in the
# registry but missing from VALID_SPAN_KINDS would only be caught by C27a.
sk_bad=""
for k in router coordinator agent tool model verification; do
  bash "$EJ" append "$tmp" --run-id r1 --capability-id route --model-tier build --status OK \
    --tokens-in 0 --tokens-out 0 --duration-ms 1 --span-kind "$k" >/dev/null 2>&1 || sk_bad="$sk_bad $k"
done
[ -z "$sk_bad" ]
check "every declared span_kind is accepted" 0 $?
rm -f "$tmp"

# validate is the guard for journals this CLI did not write (the headless runner
# owns the tool/model spans), so it must reject a bad field wherever it sits.
# A jq predicate written as `X and (generator)` reports only its LAST output,
# which passes a line whose FIRST span field is malformed.
tmp=$(mktemp)
printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null,"trace_id":"bad id","route":"good"}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects a bad FIRST span field even when the last one is fine" 1 $?

printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null,"trace_id":"ok\n"}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects a trailing newline in a span field" 1 $?

printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null,"span_kind":"bogus"}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects an unknown span_kind" 1 $?

printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null,"cache_hit":"true"}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects a string cache_hit" 1 $?

# The enumerated v1 fields. append gates status and model_tier through in_list;
# validate checked them for `type == "string"` only, so a journal this CLI did
# not write could carry prose in status and a newline in model_tier and
# validate clean — while the header, policy.json and rules/observability.md all
# say the two boundaries guard the same fields. These are the cases that fail
# without that parity.
printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"it went fine, mostly","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects free text in status, as append does" 1 $?

printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build\nSECRET=leaked prompt text","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects a newline in model_tier, as append does" 1 $?

printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"wizard","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects an undeclared model_tier" 1 $?

printf '%s\n' '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"ok","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}' > "$tmp"
bash "$EJ" validate "$tmp" >/dev/null 2>&1
check "validate rejects a lowercased status, as append does" 1 $?

# ... and the other direction, so the guard above cannot be satisfied by one
# that rejects everything: every status and every tier the CLI declares must
# still validate. Read from the constants, so renaming one moves this fixture.
ev_bad=""
for st in $(sed -n 's/^VALID_STATUSES="\(.*\)"$/\1/p' "$EJ"); do
  printf '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"build","status":"%s","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}\n' "$st" > "$tmp"
  bash "$EJ" validate "$tmp" >/dev/null 2>&1 || ev_bad="$ev_bad status:$st"
done
for tr in $(sed -n 's/^VALID_TIERS="\(.*\)"$/\1/p' "$EJ"); do
  printf '{"timestamp":"t","run_id":"r","capability_id":"c","agent":null,"model_tier":"%s","status":"OK","tokens_in":0,"tokens_out":0,"duration_ms":1,"note":null}\n' "$tr" > "$tmp"
  bash "$EJ" validate "$tmp" >/dev/null 2>&1 || ev_bad="$ev_bad tier:$tr"
done
[ -z "$ev_bad" ]
check "validate accepts every declared status and model tier ($ev_bad)" 0 $?
rm -f "$tmp"

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
