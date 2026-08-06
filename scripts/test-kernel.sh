#!/usr/bin/env bash
# Behavioral test suite for scripts/kernel.sh — asserts on ACTUAL jq-extracted
# values from the kernel's JSON output, against the real registries (never a
# copied fixture registry: the point is to prove the shipped kernel answers
# correctly against the shipped data).
# Spec: docs/specs/2026-08-06-decision-kernel-p2-resolver-api.md, "New test surface"
# Run: scripts/test-kernel.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KERNEL="$ROOT/scripts/kernel.sh"
REG="$ROOT/registries"
pass=0; fail=0

# ---------------------------------------------------------------- assertions

# run <args...> — invokes the kernel, captures stdout+stderr into $OUT and the
# exit code into $RC. Every case below calls this first, then asserts on $OUT/$RC.
run() { OUT=$(bash "$KERNEL" "$@" 2>&1); RC=$?; }

jqval() { printf '%s' "$OUT" | jq -r "$1" 2>/dev/null; }
jqvalc() { printf '%s' "$OUT" | jq -c "$1" 2>/dev/null; }  # compact — for comparing whole JSON arrays/objects

assert_eq() {  # <desc> <got> <want>
  local desc="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); printf 'FAIL %s — got [%s] want [%s]\n' "$desc" "$got" "$want"
  fi
}

assert_ok() {  # <desc> — expects the last `run` to have exited 0
  local desc="$1"
  if [ "$RC" -eq 0 ]; then pass=$((pass+1))
  else fail=$((fail+1)); printf 'FAIL %s — expected rc=0, got rc=%s out=%s\n' "$desc" "$RC" "$OUT"
  fi
}

assert_err() {  # <desc> — expects the last `run` to have exited non-zero with an {"error":...} body
  local desc="$1"
  if [ "$RC" -ne 0 ] && printf '%s' "$OUT" | jq -e '.error' >/dev/null 2>&1; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); printf 'FAIL %s — rc=%s out=%s\n' "$desc" "$RC" "$OUT"
  fi
}

echo "== kernel.sh behavioral tests =="

# ------------------------------------------------------------------ route-path

echo "-- route-path --"

# Every domain in the registry must route its own sample_path back to itself.
# Looping the registry (not hardcoding domain ids) means a new domain added to
# routing.json is covered automatically — this is the same proof as C17b.
while IFS=$'\t' read -r dom sample; do
  [ -n "$dom" ] || continue
  run route-path "$sample"
  assert_ok "route-path sample for $dom exits 0"
  assert_eq "route-path($sample) -> domain" "$(jqval '.domain')" "$dom"
done < <(jq -r '.domains[] | "\(.id)\t\(.sample_path)"' "$REG/routing.json")

# Excluded files: no domain, excluded flag set.
run route-path "/tmp/repo/README.md"
assert_ok "excluded README.md exits 0"
assert_eq "excluded README.md -> domain" "$(jqval '.domain')" "null"
assert_eq "excluded README.md -> excluded" "$(jqval '.excluded')" "true"

run route-path "/tmp/x/.engineos/y.ts"
assert_ok "excluded .engineos path exits 0"
assert_eq "excluded .engineos/y.ts -> domain" "$(jqval '.domain')" "null"
assert_eq "excluded .engineos/y.ts -> excluded" "$(jqval '.excluded')" "true"

# Unmatched file: no domain, not excluded either.
run route-path "/tmp/other/random.py"
assert_ok "unmatched random.py exits 0"
assert_eq "unmatched random.py -> domain" "$(jqval '.domain')" "null"
assert_eq "unmatched random.py -> excluded" "$(jqval '.excluded')" "false"

# Precedence: each of these paths is ambiguous against a less-specific domain
# (security vs backend, mobile vs frontend, ios-release vs mobile) and the
# higher-precedence domain must win.
run route-path "/tmp/api/src/auth/login.service.ts"
assert_eq "auth/*.service.ts -> security, not backend" "$(jqval '.domain')" "security"

run route-path "/tmp/apps/mobile/src/Home.tsx"
assert_eq "mobile/*.tsx -> mobile, not frontend" "$(jqval '.domain')" "mobile"

run route-path "/tmp/app/ios/fastlane/Fastfile"
assert_eq "ios/fastlane/* -> ios-release, not mobile" "$(jqval '.domain')" "ios-release"

# ---------------------------------------------------------------- route-intent

echo "-- route-intent --"

run route-intent "the login form is broken and users cannot sign in"
assert_ok "route-intent 'broken' prompt exits 0"
assert_eq "'broken' prompt matches bug" "$(jqval '[.matches[].id] | index("bug") != null')" "true"
assert_eq "'broken' prompt ambiguous" "$(jqval '.ambiguous')" "false"

# No signal words at all -> zero matches, ambiguous true.
run route-intent "the weather is nice today"
assert_ok "route-intent no-signal prompt exits 0"
assert_eq "no-signal prompt match count" "$(jqval '.matches | length')" "0"
assert_eq "no-signal prompt ambiguous" "$(jqval '.ambiguous')" "true"

# Multi-match: "add" is a new-feature signal, "broken" is a bug signal; both
# fire from one prompt, proving multi-match (not first-match-wins here).
run route-intent "add a fix for something broken"
assert_ok "multi-match prompt exits 0"
assert_eq "multi-match includes new-feature" "$(jqval '[.matches[].id] | index("new-feature") != null')" "true"
assert_eq "multi-match includes bug" "$(jqval '[.matches[].id] | index("bug") != null')" "true"
assert_eq "multi-match ambiguous" "$(jqval '.ambiguous')" "false"

# Word-boundary proof: "addressed" contains the literal substring "add", but
# the new-feature signal "add" must NOT fire on it — the signal is bounded on
# non-alphanumerics per kernel.sh's grep -qiE "(^|[^[:alnum:]])...([^[:alnum:]]|$)".
# ("review" legitimately fires the "review" intent here; that is expected and
# not what this case is checking.)
run route-intent "addressed the review comments"
assert_ok "word-boundary prompt exits 0"
assert_eq "'addressed' does not fire the 'add' signal (new-feature absent)" \
  "$(jqval '[.matches[].id] | index("new-feature") != null')" "false"

# --------------------------------------------------------------------- model

echo "-- model --"

run model --work adr
assert_ok "model --work adr exits 0"
assert_eq "adr tier" "$(jqval '.tier')" "most-capable"
assert_eq "adr model" "$(jqval '.model')" "fable"
assert_eq "adr escalates_to" "$(jqval '.escalates_to')" "null"

run model --work build
assert_ok "model --work build exits 0"
assert_eq "build tier" "$(jqval '.tier')" "build"
assert_eq "build model" "$(jqval '.model')" "sonnet"
assert_eq "build escalates_to.tier" "$(jqval '.escalates_to.tier')" "design"

run model --work nonsense
assert_err "model --work nonsense exits 1 with .error"

# ---------------------------------------------------------------------- risk

echo "-- risk --"

run risk --signals '{"inputs":{"reversibility":"low","blast-radius":"medium"}}'
assert_ok "risk max-aggregation exits 0"
assert_eq "max aggregation -> risk" "$(jqval '.risk')" "medium"
assert_eq "max aggregation -> autonomy_ceiling" "$(jqval '.autonomy_ceiling')" "A3"

run risk --signals '{"inputs":{"reversibility":"low","blast-radius":"low","data-sensitivity":"low","contract-surface":"low","spend":"low"},"floors":["payments"]}'
assert_ok "risk floor-forcing exits 0"
assert_eq "floor forcing -> risk" "$(jqval '.risk')" "high"

run risk --signals '{"inputs":{"bogus-input":"low"}}'
assert_err "risk with unknown input id exits 1 with .error"

run risk --signals '{"inputs":{"reversibility":"low"},"floors":["bogus-floor"]}'
assert_err "risk with unknown floor exits 1 with .error"

# --------------------------------------------------------------------- gates

echo "-- gates --"

run gates --risk high
assert_ok "gates --risk high exits 0"
assert_eq "gates high -> validation" "$(jqval '.gates.validation')" "required-plus-critic"
assert_eq "gates high -> release" "$(jqval '.gates.release')" "required-plus-human-approval"

run gates --risk banana
assert_err "gates --risk banana exits 1 with .error"

# --------------------------------------------------------------------- retry

echo "-- retry --"

run retry --status FAILED --attempt 1
assert_ok "retry FAILED attempt 1 exits 0"
assert_eq "FAILED attempt 1 -> action" "$(jqval '.action')" "retry-same-tier"

run retry --status FAILED --attempt 2
assert_eq "FAILED attempt 2 -> action" "$(jqval '.action')" "escalate-one-tier"

run retry --status FAILED --attempt 3
assert_eq "FAILED attempt 3 -> action" "$(jqval '.action')" "stop"

run retry --status BLOCKED
assert_eq "BLOCKED -> action" "$(jqval '.action')" "no-retry"

run retry --status DEGRADED
assert_eq "DEGRADED -> action" "$(jqval '.action')" "accept-carry"

run retry --status OK
assert_eq "OK -> action" "$(jqval '.action')" "none"

# never-retry situations win regardless of status/attempt.
run retry --status OK --situation security-risk
assert_eq "security-risk situation overrides OK -> never-retry" "$(jqval '.action')" "never-retry"

run retry --status FAILED --attempt 1 --situation security-risk
assert_eq "security-risk situation overrides FAILED attempt1 -> never-retry" "$(jqval '.action')" "never-retry"

# --------------------------------------------------------------- capability

echo "-- capability --"

run capability security-review
assert_ok "capability security-review exits 0"
assert_eq "security-review -> agent" "$(jqval '.agent')" "security-reviewer"
assert_eq "security-review -> model" "$(jqval '.model')" "opus"
assert_eq "security-review -> bound" "$(jqval '.bound')" "true"

run capability does-not-exist
assert_err "capability unknown id exits 1 with .error"

# --------------------------------------------------------------------- waves

echo "-- waves --"

# 3 units: a, b independent; c depends on both -> two waves, no violations.
run waves --units '[
  {"id":"a","files":["a.ts"],"depends_on":[]},
  {"id":"b","files":["b.ts"],"depends_on":[]},
  {"id":"c","files":["c.ts"],"depends_on":["a","b"]}
]'
assert_ok "waves 3-unit dag exits 0"
assert_eq "3-unit dag -> waves" "$(jqvalc '.waves')" '[["a","b"],["c"]]'
assert_eq "3-unit dag -> violations" "$(jqval '.violations')" "[]"
assert_eq "3-unit dag -> fanout_line names two waves" "$(jqval '.fanout_line | test("waves=2")')" "true"

# Two units in the same wave sharing a file: reported as a violation naming
# the file and both unit ids, wave still emitted (not an error).
run waves --units '[
  {"id":"a","files":["shared.ts"],"depends_on":[]},
  {"id":"b","files":["shared.ts"],"depends_on":[]}
]'
assert_ok "waves same-file collision exits 0"
assert_eq "same-file collision -> violation file" "$(jqval '.violations[0].file')" "shared.ts"
assert_eq "same-file collision -> violation names both units" \
  "$(jqvalc '.violations[0].units | sort')" '["a","b"]'

# 8 independent units, cap is 6 (registries/policy.json parallelism.wave_concurrency_cap)
# -> one wave of 6, one wave of 2.
run waves --units '[
  {"id":"u1","files":[],"depends_on":[]},
  {"id":"u2","files":[],"depends_on":[]},
  {"id":"u3","files":[],"depends_on":[]},
  {"id":"u4","files":[],"depends_on":[]},
  {"id":"u5","files":[],"depends_on":[]},
  {"id":"u6","files":[],"depends_on":[]},
  {"id":"u7","files":[],"depends_on":[]},
  {"id":"u8","files":[],"depends_on":[]}
]'
assert_ok "waves 8-unit cap split exits 0"
assert_eq "8-unit split -> wave count" "$(jqval '.waves | length')" "2"
assert_eq "8-unit split -> wave1 size" "$(jqval '.waves[0] | length')" "6"
assert_eq "8-unit split -> wave2 size" "$(jqval '.waves[1] | length')" "2"

# Cycle a -> b -> a is an error, not a silently-empty wave list.
run waves --units '[
  {"id":"a","files":[],"depends_on":["b"]},
  {"id":"b","files":[],"depends_on":["a"]}
]'
assert_err "waves cycle exits 1 with .error"
assert_eq "waves cycle error mentions cycle" "$(printf '%s' "$OUT" | jq -r '.error' | grep -qi cycle && echo true || echo false)" "true"

# Duplicate unit ids are also an error.
run waves --units '[
  {"id":"a","files":[],"depends_on":[]},
  {"id":"a","files":[],"depends_on":[]}
]'
assert_err "waves duplicate ids exits 1 with .error"

# --------------------------------------------------------------- decision-rules

echo "-- decision-rules --"

run decision-rules --prompt "drop the users table in production"
assert_ok "decision-rules destructive prompt exits 0"
assert_eq "destructive prompt -> matches rule-destructive-ddl" \
  "$(jqval '[.matches[].id] | index("rule-destructive-ddl") != null')" "true"
assert_eq "destructive prompt -> matches rule-production-write" \
  "$(jqval '[.matches[].id] | index("rule-production-write") != null')" "true"
assert_eq "destructive prompt -> any_high" "$(jqval '.any_high')" "true"

run decision-rules --prompt "let's write a friendly test"
assert_ok "decision-rules innocuous prompt exits 0"
assert_eq "innocuous prompt -> match count" "$(jqval '.matches | length')" "0"
assert_eq "innocuous prompt -> any_high" "$(jqval '.any_high')" "false"

# --------------------------------------------------------------------- scale

echo "-- scale --"

run scale --prompt "implement all the endpoints across the codebase"
assert_ok "scale big-task prompt exits 0"
assert_eq "big-task prompt -> big_task" "$(jqval '.big_task')" "true"

run scale --prompt "write a spec for the payment flow"
assert_ok "scale spec-authoring prompt exits 0"
assert_eq "spec-authoring prompt -> spec_authoring" "$(jqval '.spec_authoring')" "true"

run scale --prompt "what time is it"
assert_ok "scale neutral prompt exits 0"
assert_eq "neutral prompt -> big_task" "$(jqval '.big_task')" "false"
assert_eq "neutral prompt -> spec_authoring" "$(jqval '.spec_authoring')" "false"
assert_eq "neutral prompt -> design_work" "$(jqval '.design_work')" "false"

# design_weak ("design") alone, with no action verb, must NOT count as design_work.
run scale --prompt "the button design looks good"
assert_ok "scale weak-design prompt exits 0"
assert_eq "weak design signal without action verb -> design_work false" "$(jqval '.design_work')" "false"

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
