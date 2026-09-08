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

# Every temp tree this suite builds lives under one root that an EXIT trap
# removes. The router-block fixture below used to back the TRACKED registry up
# to a fixed /tmp path and overwrite registries/policy.json in place: a ^C, a
# crash or a second concurrent run left the checkout carrying a router-less or
# truncated registry, which is exactly what produced six spurious failures in
# another process and a >600s gate timeout during this epic. No fixture writes
# through a predictable path, and none of them writes into $REG at all.
TMPROOT=$(cd "$(mktemp -d)" && pwd -P) || exit 1
trap 'rm -rf "$TMPROOT"' EXIT

# Registry-derived fixture inputs, read once. Every expectation below that
# depends on one of these numbers reads it from here instead of restating it:
# re-parameterising the registry must MOVE the fixtures, never turn the suite
# red. An unusable value is a loud abort rather than fixtures computing
# nonsense off an empty string.
CAP=$(jq -r '.parallelism.wave_concurrency_cap' "$REG/policy.json" 2>/dev/null)
MAXQ=$(jq -r '.parallelism.backpressure.max_queued_units' "$REG/policy.json" 2>/dev/null)
case "$CAP"  in ''|*[!0-9]*|0) echo "policy.json parallelism.wave_concurrency_cap is unusable: [$CAP]" >&2; exit 2 ;; esac
case "$MAXQ" in ''|*[!0-9]*|0) echo "policy.json parallelism.backpressure.max_queued_units is unusable: [$MAXQ]" >&2; exit 2 ;; esac

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

# relocated_kernel <name> <jq-mutation-of-policy.json> -> the path of a PRIVATE
# kernel copy whose registries/ carries policy.json with that mutation applied.
# The kernel derives its own ROOT/REG from where it sits, so the copy answers
# against THAT data and no fail-closed fixture ever has to write into the
# tracked registries/. Lives under $TMPROOT, so the EXIT trap reaps it.
relocated_kernel() {
  # Separate statements, not one `local`: bash 3.2 (macOS) does not make an
  # earlier name on the same `local` line visible to a later one, so
  # `local name="$1" dir="$TMPROOT/$name"` aborts under `set -u`.
  local name="$1" mutation="$2"
  local dir="$TMPROOT/$name"
  mkdir -p "$dir/scripts" "$dir/registries" "$dir/dist" || return 1
  cp "$KERNEL" "$dir/scripts/kernel.sh" || return 1
  # kernel.sh is a shim that resolves dist/engineos.cjs relative to ITSELF, so a
  # relocated copy has to carry the bundle as well as the registries.
  cp "$ROOT/dist/engineos.cjs" "$dir/dist/" || return 1
  cp "$REG"/*.json "$dir/registries/" || return 1
  jq "$mutation" "$REG/policy.json" > "$dir/registries/policy.json" \
    || { echo "fixture mutation failed: $mutation" >&2; return 1; }
  printf '%s' "$dir/scripts/kernel.sh"
}

# runk <kernel-path> <args...> — the same capture as `run`, against a relocated
# copy rather than the shipped kernel.
runk() { local k="$1"; shift; OUT=$(bash "$k" "$@" 2>&1); RC=$?; }

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

# EngineOS-self exclusion: .excluded.self_dirs is DATA, not code. This checkout's
# own hooks/ and docs/ trees get no routing; an unrelated project's hooks/ dir
# must still route, and dropping self_dirs from the registry must turn the
# exclusion off — which is what proves the list is data.
run route-path "$ROOT/hooks/anything.sh"
assert_ok "self hooks/ path exits 0"
assert_eq "self hooks/anything.sh -> excluded" "$(jqval '.excluded')" "true"

# .ts, not .md: an .md basename is excluded anyway, so it would pass vacuously.
run route-path "$ROOT/docs/x.ts"
assert_eq "self docs/x.ts -> excluded" "$(jqval '.excluded')" "true"

run route-path "/some/project/hooks/x.ts"
assert_eq "a foreign project's hooks/x.ts -> not excluded" "$(jqval '.excluded')" "false"

# The kernel derives its ROOT/REG from its own location, so a copy of kernel.sh
# beside a modified registries/ answers against THAT data — no env override on the
# kernel is needed. Run as a MATCHED PAIR: without the `with` control, a `false`
# from the `without` half could just as well mean the relocated root never matched
# at all, and the sub-case would pass vacuously.
# pwd -P because mktemp -d hands back a symlinked path on macOS (/var -> /private/var)
# while the kernel's own $ROOT is the resolved one — unresolved, nothing would match.
SELFT="$TMPROOT/self"
for variant in with without; do
  mkdir -p "$SELFT/$variant/scripts" "$SELFT/$variant/registries" "$SELFT/$variant/dist"
  cp "$KERNEL" "$SELFT/$variant/scripts/kernel.sh"
  cp "$ROOT/dist/engineos.cjs" "$SELFT/$variant/dist/"
done
cp "$REG/routing.json" "$SELFT/with/registries/routing.json"
jq 'del(.excluded.self_dirs)' "$REG/routing.json" > "$SELFT/without/registries/routing.json"

OUT=$(bash "$SELFT/with/scripts/kernel.sh" route-path "$SELFT/with/hooks/x.sh" 2>&1); RC=$?
assert_ok "relocated kernel copy exits 0"
assert_eq "self_dirs present -> relocated root's own hooks/ excluded" "$(jqval '.excluded')" "true"

OUT=$(bash "$SELFT/without/scripts/kernel.sh" route-path "$SELFT/without/hooks/x.sh" 2>&1); RC=$?
assert_ok "relocated kernel copy without self_dirs exits 0"
assert_eq "self_dirs removed -> own hooks/ no longer excluded" "$(jqval '.excluded')" "false"
rm -rf "$SELFT"

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
assert_eq "build model" "$(jqval '.model')" "opus"
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

# -------------------------------------------------------------------- repair

echo "-- repair --"

run repair --check lint --attempt 1
assert_ok "repair lint attempt 1 exits 0"
assert_eq "lint attempt 1 -> action" "$(jqval '.action')" "fix-same-tier"

run repair --check lint --attempt 2
assert_eq "lint attempt 2 -> action" "$(jqval '.action')" "escalate-one-tier"

run repair --check lint --attempt 3
assert_eq "lint attempt 3 -> action" "$(jqval '.action')" "stop-report-red"

run repair --check test --situation infra
assert_eq "test infra situation -> action" "$(jqval '.action')" "report-tooling-gap"

run repair --check test --situation flaky
assert_eq "test flaky situation -> action" "$(jqval '.action')" "fix-or-delete"

# never-repair situations win regardless of attempt.
run repair --check build --attempt 1 --situation weaken-the-check
assert_eq "weaken-the-check situation overrides attempt1 -> never-repair" "$(jqval '.action')" "never-repair"

run repair --check nonsense --attempt 1
assert_err "unknown check errors"

run repair --attempt 1
assert_err "missing --check errors"

run repair --check lint
assert_err "ladder path missing --attempt errors"

run repair --check lint --attempt 1 --situation nonsense
assert_err "unknown situation errors"

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

# The cap split. The unit list is GENERATED from the cap rather than written
# out as eight units against a cap of 6: a literal count is "two units over the
# cap" only for one value of wave_concurrency_cap, so re-parameterising the
# registry used to turn this fixture red against a kernel splitting correctly.
# cap + 2 independent units is always exactly two waves, sized cap and 2.
CAP_UNITS=$(jq -nc --argjson n "$((CAP + 2))" '[range(0; $n) | {id: "u\(. + 1)", files: [], depends_on: []}]')
run waves --units "$CAP_UNITS"
assert_ok "waves cap+2-unit split exits 0"
assert_eq "cap+2 split -> wave count" "$(jqval '.waves | length')" "2"
assert_eq "cap+2 split -> wave1 size is the cap" "$(jqval '.waves[0] | length')" "$CAP"
assert_eq "cap+2 split -> wave2 size" "$(jqval '.waves[1] | length')" "2"

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

# --------------------------------------------------------------- route-escalate
# Spec: docs/specs/2026-08-06-decision-kernel-p3-router-agent.md, "Test surface"

echo "-- route-escalate --"

# Every policy.json.router.fixtures entry, looped from the registry — a new
# fixture is covered automatically, no hardcoding.
while IFS=$'\t' read -r prompt want_esc want_reasons; do
  run route-escalate --prompt "$prompt"
  assert_ok "route-escalate fixture exits 0: $prompt"
  assert_eq "fixture escalate: $prompt" "$(jqval '.escalate')" "$want_esc"
  got_reasons=$(printf '%s' "$OUT" | jq -c '.reasons | sort' 2>/dev/null)
  want_sorted=$(printf '%s' "$want_reasons" | jq -c 'sort')
  assert_eq "fixture reasons: $prompt" "$got_reasons" "$want_sorted"
done < <(jq -r '.router.fixtures[] | [.prompt, .escalate, (.reasons|tojson)] | @tsv' "$REG/policy.json")

# Suppression: a suppressible fallback (new-feature) drops when a more
# specific stack row also matches.
run route-escalate --prompt "add a paginated orders endpoint to the API and mirror the screen to mobile"
assert_ok "suppression (new-feature) prompt exits 0"
assert_eq "suppressible new-feature drops, backend+mobile survive" \
  "$(jqval '.intents | sort | join(",")')" "backend,mobile"
assert_eq "new-feature recorded as suppressed by more-specific-match" \
  "$(jqval '[.suppressed[] | select(.id=="new-feature") | .by][0]')" "more-specific-match"

# Suppression: mobile is suppressed_by ios-release/android-release when a
# store-release row also matches (raw matches verified: mobile, ios-release).
run route-escalate --prompt "publish to App Store the iOS app screen"
assert_ok "suppression (mobile/ios-release) prompt exits 0"
assert_eq "mobile suppressed, ios-release survives" "$(jqval '.intents | join(",")')" "ios-release"
assert_eq "mobile recorded as suppressed by ios-release" \
  "$(jqval '[.suppressed[] | select(.id=="mobile") | .by][0]')" "ios-release"

# Aggregation: model_tier/risk_floor are max-by-lookup over surviving intents,
# never a naive last-match or first-match.
run route-escalate --prompt "add a paginated orders endpoint to the API and mirror the screen to mobile"
assert_ok "aggregation prompt exits 0"
BT=$(jqval '.model_tier'); BF=$(jqval '.risk_floor')
[ -n "$BT" ] && [ "$BT" != "null" ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL: model_tier aggregated (non-null) — got '$BT'"; }
[ -n "$BF" ] && [ "$BF" != "null" ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL: risk_floor aggregated (non-null) — got '$BF'"; }

# A deliberately meaningless string, not a realistic prompt. This case exists to
# prove the zero-intent branch aggregates to null, and a realistic prompt would
# make it vacuous the moment routing improves — which is exactly what happened
# to its predecessor: it used "why does the login handler fail with a 500" and
# passed only because the bug intent's signal was the dead placeholder
# "why does X happen". The prompt that used to prove "no match" is asserted
# below, matching, as the regression guard against that signal dying again.
run route-escalate --prompt "zzqq wibble frobnicate"
assert_eq "no matched intent -> model_tier null" "$(jqval '.model_tier')" "null"
assert_eq "no matched intent -> risk_floor null" "$(jqval '.risk_floor')" "null"
assert_eq "no matched intent -> intents empty" "$(jqvalc '.intents')" "[]"

run route-escalate --prompt "why does the login handler fail with a 500"
assert_eq "a real bug report resolves the bug intent" "$(jqvalc '.intents')" '["bug"]'
assert_eq "a real bug report carries the bug intent tier" "$(jqval '.model_tier')" "design"

# Non-triggers stay non-triggers.
# NOTE: "migration" (singular) is deliberately avoided here — it is one of
# big-sweep's own signals (P1 data; a known noisy overlap the P3 spec already
# flags), so a prompt containing it also matches big-sweep and escalates via
# requires-dispatch-plan. "query perf" is dba-only and signal-clean.
run route-escalate --prompt "improve query perf on the orders table"
assert_ok "dba-only prompt exits 0"
assert_eq "dba-only prompt resolves to exactly dba" "$(jqval '.intents | join(",")')" "dba"
assert_eq "single intent naming 3 leaf agents does NOT escalate" "$(jqval '.escalate')" "false"

run route-escalate --prompt "build the ios release and upload to TestFlight"
assert_eq "divergent tier/floor across suppressed matches is not a trigger" "$(jqval '.escalate')" "false"

# Errors: fail-closed, not silently ignored.
run route-escalate
assert_err "route-escalate with no --prompt errors"

run route-escalate --bogus x
assert_err "route-escalate with unknown argument errors"

# The fail-closed router-block case, built as a RELOCATED kernel copy — the
# same pattern the breaker's missing-block case uses, and for the same reason:
# this fixture used to overwrite the tracked registries/policy.json in place
# through a fixed /tmp backup with no trap, so a run that died between the two
# `cp`s left the checkout carrying a router-less registry for every other
# reader. Nothing here touches $REG.
#
# Run as a MATCHED PAIR: without the `with` control, the `without` half could
# error for any reason at all (a missing registry, a relocated root that never
# resolves) and still satisfy assert_err, which would make the fail-closed
# claim vacuous.
for variant in with without; do
  mkdir -p "$TMPROOT/router-$variant/scripts" "$TMPROOT/router-$variant/registries" "$TMPROOT/router-$variant/dist"
  cp "$KERNEL" "$TMPROOT/router-$variant/scripts/kernel.sh"
  cp "$ROOT/dist/engineos.cjs" "$TMPROOT/router-$variant/dist/"
  cp "$REG"/*.json "$TMPROOT/router-$variant/registries/"
done
jq 'del(.router)' "$REG/policy.json" > "$TMPROOT/router-without/registries/policy.json"

OUT=$(bash "$TMPROOT/router-with/scripts/kernel.sh" route-escalate --prompt "add a feature" 2>&1); RC=$?
assert_ok "relocated kernel copy with the router block intact still answers route-escalate"

OUT=$(bash "$TMPROOT/router-without/scripts/kernel.sh" route-escalate --prompt "add a feature" 2>&1); RC=$?
assert_err "route-escalate with no router policy block errors (fail-closed)"
assert_eq "the router-block error names the missing block, not some other failure" \
  "$(jqval '.error | test("router")')" "true"
rm -rf "$TMPROOT/router-with" "$TMPROOT/router-without"

# ---------------------------------------------- positional subcommands fail closed
# The positional subcommands used to accept a flag SILENTLY: bash bound
# "--prompt" to $1 and the real argument was discarded, so route-intent answered
# about the literal string "--prompt" (which contains the LLM signal "prompt")
# and exited 0. A resolver that returns a confident wrong answer is worse than
# one that refuses, and the flag shape is plausible because route-escalate,
# scale and decision-rules all legitimately take --prompt.

for sub in route-path route-intent; do
  run "$sub" --prompt "audit the system"
  assert_err "$sub rejects a --prompt flag instead of routing on the literal string"

  run "$sub" -x
  assert_err "$sub rejects any leading-dash argument"

  run "$sub"
  assert_err "$sub with no argument errors"

  run "$sub" one two
  assert_err "$sub rejects a second positional argument"
done

# Assert the GUARD fired, not merely that something errored — any other failure
# would also satisfy assert_err above while leaving the fail-open path intact.
# Without the guard this returned {"matches":[{"id":"llm",...}]} and rc=0,
# because "prompt" is one of that intent's signals.
run route-intent --prompt "audit the system"
FLAGGED=no; case "$(jqval '.error')" in *"not a flag"*) FLAGGED=yes ;; esac
assert_eq "route-intent's error names the offending flag" "$FLAGGED" "yes"
assert_eq "route-intent computed no matches at all when given a flag" \
  "$(printf '%s' "$OUT" | jq -r 'has("matches")')" "false"

# The correct positional form is untouched.
run route-intent "audit the system"
assert_ok "route-intent still answers the positional form"
assert_eq "route-intent positional form resolves audit" "$(jqvalc '[.matches[].id]')" '["audit"]'

run route-path apps/api/src/orders/orders.service.ts
assert_eq "route-path still answers the positional form" "$(jqval '.domain')" "backend"

# ----------------------------------------------------------- registry loader
# Every registry read goes through kernel.sh's `reg` seam, so the seam owns the
# fail-closed behaviour that used to be a `need_reg` call at each of 13 sites.
# That behaviour had no test at all: nothing proved a subcommand refuses, or
# says which registry it wanted, when one is absent. A resolver that answers
# from a half-present registry set is the failure mode worth defending against.

echo "-- registry loader --"

# The kernel derives ROOT/REG from its own location (see the route-path
# relocated-copy pair above), so a copy of kernel.sh beside an INCOMPLETE
# registries/ exercises the real error path instead of mocking it. Each case
# hides exactly one registry, so a subcommand that stopped declaring one of its
# inputs — or that names the wrong one — fails here.
LOADT=$(cd "$(mktemp -d)" && pwd -P)
mkdir -p "$LOADT/scripts" "$LOADT/registries" "$LOADT/dist"
cp "$KERNEL" "$LOADT/scripts/kernel.sh"
cp "$ROOT/dist/engineos.cjs" "$LOADT/dist/"
cp "$REG"/*.json "$LOADT/registries/"

while IFS=$'\t' read -r missing sub args; do
  mv "$LOADT/registries/$missing" "$LOADT/registries/$missing.hidden"
  # shellcheck disable=SC2086  # $args is a space-separated argument list from the table
  OUT=$(bash "$LOADT/scripts/kernel.sh" "$sub" $args 2>&1); RC=$?
  assert_err "$sub without $missing exits 1 with .error"
  assert_eq "$sub names the missing registry" \
    "$(jqval '.error')" "registry missing: registries/$missing"
  mv "$LOADT/registries/$missing.hidden" "$LOADT/registries/$missing"
done <<TSV
routing.json	route-path	src/x.ts
intents.json	route-intent	anything
models.json	model	--work spec
policy.json	gates	--risk low
decision-rules.json	decision-rules	--prompt deploy
TSV

# The composing subcommands must refuse with the same shaped error even when
# the missing registry is needed deep in the composition, not by their first jq
# program: resolve-task reaches decision-rules.json only through the
# cmd_decision_rules call it makes, and route-escalate reaches models.json only
# in its own final pass. A caller parses one stream either way, so "which
# registry" has to survive the composition.
while IFS=$'\t' read -r missing sub; do
  mv "$LOADT/registries/$missing" "$LOADT/registries/$missing.hidden"
  OUT=$(bash "$LOADT/scripts/kernel.sh" "$sub" --prompt "add an endpoint" 2>&1); RC=$?
  assert_err "$sub without $missing exits 1 with .error"
  assert_eq "$sub names the missing composed registry" \
    "$(jqval '.error')" "registry missing: registries/$missing"
  mv "$LOADT/registries/$missing.hidden" "$LOADT/registries/$missing"
done <<TSV
decision-rules.json	resolve-task
models.json	route-escalate
TSV
rm -rf "$LOADT"

# -------------------------------------------------------------- resolve-task

echo "-- resolve-task --"

run resolve-task --prompt "add a paginated orders endpoint and mirror the screen to mobile"
assert_ok "resolve-task substantive prompt exits 0"
assert_eq "resolve-task suppresses generic new-feature behind mobile" \
  "$(jqvalc '.task_contract.intents')" '["mobile"]'
assert_eq "resolve-task carries the routed agent" \
  "$(jqvalc '.task_contract.agents')" '["mobile-coordinator"]'
assert_eq "resolve-task carries the decision requirement" \
  "$(jqval '[.task_contract.required[]] | index("design-doc") != null')" "true"
assert_eq "resolve-task raises the initial floor from the surviving intent" \
  "$(jqval '.task_contract.risk_floor')" "medium"
assert_eq "resolve-task includes policy rules needed by an agent dispatch" \
  "$(jqval '[.task_contract.policy_rules[]] | (index("subagents") != null and index("models") != null)')" "true"

run resolve-task --prompt "deploy the billing service to production"
assert_ok "resolve-task high-risk prompt exits 0"
assert_eq "resolve-task decision rule forces high floor" "$(jqval '.task_contract.risk_floor')" "high"
assert_eq "resolve-task maps the high floor to A3" "$(jqval '.task_contract.autonomy_ceiling_at_floor')" "A3"
assert_eq "resolve-task carries release gate" \
  "$(jqval '[.task_contract.gates[]] | index("release") != null')" "true"

run resolve-task --prompt "the weather is nice today"
assert_ok "resolve-task pure prompt exits 0"
assert_eq "resolve-task pure prompt is not substantive" "$(jqval '.task_contract.substantive')" "false"
assert_eq "resolve-task pure prompt has no policy loads" "$(jqvalc '.task_contract.policy_rules')" "[]"

run resolve-task --prompt "update the prose in this document"
assert_ok "resolve-task unrouted action prompt exits 0"
assert_eq "resolve-task treats an unrouted action as substantive" \
  "$(jqval '.task_contract.substantive')" "true"
assert_eq "resolve-task gives an unrouted action the closed safety bundle" \
  "$(jqval '[.task_contract.policy_rules[]] | (index("gates") != null and index("risk-autonomy") != null and index("verification") != null)')" "true"

run resolve-task
assert_err "resolve-task with no --prompt errors"

# ----------------------------------------------------------------------- admit

echo "-- admit --"

# CAP and MAXQ are read once at the top of the file. Nothing below restates a
# policy number, and nothing below picks an input that only happens to sit on
# the right side of one: an inflight count of 3 was "below the cap" solely
# because the cap is 6 today, so re-parameterising the registry to 2 turned
# five of these fixtures red against a kernel that was answering correctly.
# PARTIAL is a load strictly inside any cap >= 1, derived from the cap itself.
PARTIAL=$((CAP / 2))

run admit --inflight 0 --queued 0
assert_ok "admit with idle capacity exits 0"
assert_eq "admit idle -> dispatch" "$(jqval .action)" "dispatch"
assert_eq "admit idle capacity == cap" "$(jqval .capacity)" "$CAP"

# capacity is cap - inflight, not a constant: a partial load under the cap must
# report the remainder, which a hardcoded cap would get wrong.
run admit --inflight "$PARTIAL" --queued 0
assert_eq "admit with a partial load -> dispatch" "$(jqval .action)" "dispatch"
assert_eq "admit capacity is cap minus inflight" "$(jqval .capacity)" "$((CAP - PARTIAL))"
assert_eq "admit answers exactly {action, capacity, reason}" \
  "$(jqvalc '. | keys | sort')" '["action","capacity","reason"]'

# a trailing flag with no value must error, not spin the arg loop forever
run admit --inflight
assert_err "admit with a valueless --inflight errors instead of hanging"

run admit --inflight "$CAP" --queued 0
assert_eq "admit at cap -> overload_action" "$(jqval .action)" "$(jq -r '.parallelism.backpressure.overload_action' "$REG/policy.json")"
assert_eq "admit at cap capacity 0" "$(jqval .capacity)" "0"

# over the cap with room in the queue is still the overload action, not reject.
# The queued count is MAXQ - 1 rather than a literal: any literal is "a non-full
# queue" only for as long as max_queued_units stays above it.
run admit --inflight "$((CAP + 1))" --queued "$((MAXQ - 1))"
assert_eq "admit over cap with a non-full queue -> defer" "$(jqval .action)" "defer"

run admit --inflight "$CAP" --queued "$MAXQ"
assert_eq "admit at cap and queue full -> reject" "$(jqval .action)" "reject"
# Task 4's `hitl --situation reject` keys on this literal
assert_eq "admit reject reason names the HITL trigger" \
  "$(jqval '.reason | test("budget-exhausted")')" "true"

# a leading zero is a shell-ism, not a JSON number: it normalises, and must
# never surface as a bare jq parse error
run admit --inflight 02 --queued 0
assert_ok "admit normalises a leading-zero --inflight"
assert_eq "admit treats 02 as 2" "$(jqval .capacity)" "$((CAP - 2))"

run admit --inflight abc --queued 0
assert_err "admit rejects a non-numeric --inflight"
run admit --inflight 1 --queued abc
assert_err "admit rejects a non-numeric --queued"
run admit --inflight 1
assert_err "admit requires --queued"

# admit fail-closed. Every other registry-reading subcommand guards its block
# before reading through it; admit validated nothing, and the two verified
# consequences are both asserted here — each against a relocated copy, so the
# tracked registry is never touched.
#
# The control comes first: without it, an assert_err below could be satisfied by
# a relocated tree that fails for some reason other than the planted one, and
# every case would pass vacuously.
AK=$(relocated_kernel admit-control '.')
runk "$AK" admit --inflight 0 --queued 0
assert_ok "a relocated kernel copy with an unmutated policy still answers admit"

# Verified before the guard: rc=5, EMPTY stdout, and a raw
# "null (null) and number (0) cannot be subtracted" on stderr — the kernel
# header promises 0-or-1 with {"error": ...} on stdout, so callers parsing a
# single stream got nothing at all to parse.
AK=$(relocated_kernel admit-no-cap 'del(.parallelism.wave_concurrency_cap)')
runk "$AK" admit --inflight 0 --queued 0
assert_err "admit with no wave_concurrency_cap errors on stdout (fail-closed, never a bare jq abort)"
assert_eq "the missing-cap error names the field" \
  "$(jqval '.error | test("wave_concurrency_cap")')" "true"

AK=$(relocated_kernel admit-no-maxq 'del(.parallelism.backpressure.max_queued_units)')
runk "$AK" admit --inflight 0 --queued 0
assert_err "admit with no max_queued_units errors instead of comparing against null"

AK=$(relocated_kernel admit-no-block 'del(.parallelism.backpressure)')
runk "$AK" admit --inflight 0 --queued 0
assert_err "admit with no backpressure block errors (fail-closed)"

# Verified before the guard: rc=0 with the string emitted VERBATIM as the
# action. cmd_hitl validates high_with_thin_evidence against A0..A4; admit
# validated overload_action against nothing, so the kernel would hand an
# orchestrator an action outside the registry's own declared vocabulary.
AK=$(relocated_kernel admit-bogus-action '.parallelism.backpressure.overload_action = "launch-the-missiles"')
runk "$AK" admit --inflight "$CAP" --queued 0
assert_err "admit refuses an overload_action outside the declared actions list"
assert_eq "the bogus-action error names the actions list" \
  "$(jqval '.error | test("actions")')" "true"
assert_eq "admit emitted no action at all for the bogus value" \
  "$(printf '%s' "$OUT" | jq -r 'has("action")')" "false"

# The declared action itself must still be answerable — a guard that rejected
# every value would satisfy the case above while breaking the normal path.
AK=$(relocated_kernel admit-declared-action '.parallelism.backpressure.overload_action = "reject"')
runk "$AK" admit --inflight "$CAP" --queued 0
assert_ok "admit still answers when overload_action is a declared action"
assert_eq "the declared action is the one emitted" "$(jqval .action)" "reject"

# --------------------------------------------------------------------- breaker

echo "-- breaker --"

# every number below comes from the registry, so a threshold change moves the
# fixtures instead of turning them red
thr=$(jq -r '.breaker.failure_threshold' "$REG/policy.json")

run breaker --state closed --failures 0
assert_ok "breaker with a healthy resource exits 0"
assert_eq "closed with 0 failures stays closed" "$(jqval .state)" "closed"
assert_eq "closed allows" "$(jqval .allow)" "true"
assert_eq "breaker answers exactly {allow, reason, state}" \
  "$(jqvalc '. | keys | sort')" '["allow","reason","state"]'

# one below the threshold must NOT trip: a kernel that always opened would
# otherwise pass on the threshold case alone
run breaker --state closed --failures "$((thr - 1))"
assert_eq "closed one failure below the threshold stays closed" "$(jqval .state)" "closed"

run breaker --state closed --failures "$thr"
assert_eq "closed at threshold opens" "$(jqval .state)" "open"
assert_eq "open blocks" "$(jqval .allow)" "false"

run breaker --state open --cooldown-elapsed false
assert_eq "open before cooldown stays open" "$(jqval .state)" "open"
run breaker --state open --cooldown-elapsed true
assert_eq "open after cooldown goes half-open" "$(jqval .state)" "half-open"
assert_eq "half-open allows a probe" "$(jqval .allow)" "true"

run breaker --state half-open --probe-result ok
assert_eq "successful probe closes" "$(jqval .state)" "closed"
run breaker --state half-open --probe-result failed
assert_eq "failed probe reopens" "$(jqval .state)" "open"

run breaker --state closed
assert_err "closed requires --failures"
run breaker --state open
assert_err "open requires --cooldown-elapsed"
run breaker --state half-open
assert_err "half-open requires --probe-result"
run breaker --state bogus --failures 1
assert_err "unknown state is an error"
run breaker --failures 1
assert_err "breaker requires --state"

# a trailing flag with no value must error, not spin the arg loop forever
run breaker --state
assert_err "breaker with a valueless --state errors instead of hanging"

# a leading zero is a shell-ism, not a JSON number: it normalises, and must
# never surface as a bare jq parse error. The value is the threshold itself, so
# the expected answer (open) is one only a correctly parsed number produces --
# "00" would answer closed for any threshold >= 1 and discriminate nothing.
run breaker --state closed --failures "0$thr"
assert_ok "breaker normalises a leading-zero --failures"
assert_eq "breaker treats 0$thr as $thr" "$(jqval .state)" "open"

run breaker --state closed --failures abc
assert_err "breaker rejects a non-numeric --failures"
run breaker --state open --cooldown-elapsed maybe
assert_err "breaker rejects a non-boolean --cooldown-elapsed"
run breaker --state half-open --probe-result maybe
assert_err "breaker rejects an unknown --probe-result"

# need_reg proves only that policy.json exists. With .breaker absent, jq sorts
# null below every number, so `0 >= null` held and the kernel answered
# {"state":"open","allow":false} with exit 0 -- a healthy resource reported
# open. Fail closed instead.
#
# Built as a relocated kernel copy rather than by mutating $REG in place: the
# suite carries both patterns (route-escalate's router-block case backs up and
# overwrites the real registry), and this one cannot leave the repo's
# registries broken if the run dies mid-fixture.
BRKT="$TMPROOT/breaker"
mkdir -p "$BRKT/scripts" "$BRKT/registries" "$BRKT/dist"
cp "$KERNEL" "$BRKT/scripts/kernel.sh"
cp "$ROOT/dist/engineos.cjs" "$BRKT/dist/"
jq 'del(.breaker)' "$REG/policy.json" > "$BRKT/registries/policy.json"
OUT=$(bash "$BRKT/scripts/kernel.sh" breaker --state closed --failures 0 2>&1); RC=$?
assert_err "breaker with no breaker policy block errors (fail-closed, never a fabricated open)"
rm -rf "$BRKT"

# ------------------------------------------------------------------------ hitl

echo "-- hitl --"

# The record home, the situation list and the coupled reason id come from the
# registry, so renaming a reason or adding a situation moves the fixtures rather
# than turning them red. The tiers and autonomy levels stay literal on purpose:
# they are the INPUTS the kernel is being asked about, not registry data being
# mirrored back.
RECORD_HOME=$(jq -r '.hitl.record_home' "$REG/policy.json")

run hitl --risk low --autonomy A2
assert_ok "hitl low/A2 exits 0"
assert_eq "hitl low/A2 not required" "$(jqval .required)" "false"
assert_eq "hitl low/A2 no reasons" "$(jqvalc .reasons)" "[]"
# A no-HITL answer must still hand back the ceiling it was given, not "A0"
# or the null a missing block would produce.
assert_eq "hitl low/A2 keeps the given ceiling" "$(jqval .autonomy_after)" "A2"
assert_eq "hitl record_home comes from the registry" "$(jqval .record_home)" "$RECORD_HOME"
assert_eq "hitl answers exactly {autonomy_after, reasons, record_home, required}" \
  "$(jqvalc '. | keys | sort')" '["autonomy_after","reasons","record_home","required"]'

run hitl --risk high --autonomy A3
assert_eq "hitl high required" "$(jqval .required)" "true"
assert_eq "hitl high reason" "$(jqvalc .reasons)" '["high-risk"]'
# required and autonomy_after are the two fields a gate switches on; asserting
# only one would let a kernel that always dropped to A1 through.
assert_eq "hitl high with adequate evidence keeps A3" "$(jqval .autonomy_after)" "A3"

run hitl --risk medium --autonomy A3 --external-effect true
assert_eq "hitl external effect at A3 required" "$(jqvalc .reasons)" '["external-effect"]'
# below A3 an external effect is not reachable, so it must NOT be a reason --
# without this case a kernel that ignored --autonomy would pass on the row above
run hitl --risk medium --autonomy A2 --external-effect true
assert_eq "hitl external effect below A3 is not a reason" "$(jqvalc .reasons)" "[]"
assert_eq "hitl external effect below A3 not required" "$(jqval .required)" "false"

# Thin evidence DROPS autonomy one level and never raises it. Every case here
# used to pass --autonomy A2 and only A2, the single input where the old
# unconditional "A1" happened to be right; at A0 that literal RAISED the
# ceiling from "explain only, no writes" to "propose a diff" in response to
# weaker evidence, and at medium/A3 it dropped two levels where
# rules/risk-autonomy.md says one. The target at risk high comes from the
# registry, never a literal here.
THIN_HIGH=$(jq -r '.autonomy.high_with_thin_evidence' "$REG/policy.json")

run hitl --risk medium --autonomy A2 --evidence thin
assert_eq "thin evidence at medium/A2 drops one level" "$(jqval .autonomy_after)" "A1"
assert_eq "thin evidence reason" "$(jqvalc .reasons)" '["evidence-insufficient"]'
run hitl --risk low --autonomy A2 --evidence thin
assert_eq "thin evidence at low/A2 drops one level" "$(jqval .autonomy_after)" "A1"
run hitl --risk medium --autonomy A3 --evidence thin
assert_eq "thin evidence at medium/A3 drops ONE level, not to A1" \
  "$(jqval .autonomy_after)" "A2"
run hitl --risk low --autonomy A4 --evidence thin
assert_eq "thin evidence at low/A4 drops one level" "$(jqval .autonomy_after)" "A3"
# The inversion this field existed to prevent: a drop must never hand back MORE
# autonomy than it was given.
run hitl --risk low --autonomy A0 --evidence thin
assert_eq "thin evidence at low/A0 stays A0 and never raises" "$(jqval .autonomy_after)" "A0"
run hitl --risk high --autonomy A0 --evidence thin
assert_eq "thin evidence at high/A0 stays A0 and never raises" "$(jqval .autonomy_after)" "A0"
run hitl --risk medium --autonomy A1 --evidence thin
assert_eq "thin evidence at medium/A1 bottoms out at A1" "$(jqval .autonomy_after)" "A1"
# Risk high is the one tier the registry overrides, and the expected value is
# read from the field itself so a policy change moves the fixture with it.
run hitl --risk high --autonomy A3 --evidence thin
assert_eq "thin evidence at high/A3 lands on autonomy.high_with_thin_evidence" \
  "$(jqval .autonomy_after)" "$THIN_HIGH"
run hitl --risk high --autonomy A4 --evidence thin
assert_eq "thin evidence at high/A4 lands on autonomy.high_with_thin_evidence" \
  "$(jqval .autonomy_after)" "$THIN_HIGH"
# Adequate evidence is the identity: without this half a kernel that always
# dropped would pass every case above.
run hitl --risk medium --autonomy A3
assert_eq "adequate evidence at medium/A3 keeps the given ceiling" "$(jqval .autonomy_after)" "A3"
run hitl --risk low --autonomy A0
assert_eq "adequate evidence at low/A0 keeps A0" "$(jqval .autonomy_after)" "A0"

run hitl --risk low --autonomy A2 --situation security-risk
assert_eq "never-retry situation is a hitl reason" "$(jqvalc .reasons)" '["never-retry-situation"]'
run hitl --risk low --autonomy A2 --situation reject
assert_eq "backpressure reject maps to budget-exhausted" "$(jqvalc .reasons)" '["budget-exhausted"]'
run hitl --risk low --autonomy A2 --situation breaker-open
assert_eq "open breaker is a hitl reason" "$(jqvalc .reasons)" '["breaker-open"]'
run hitl --risk high --autonomy A3 --conflict true --external-effect true
assert_eq "reasons accumulate in fixed order" "$(jqvalc .reasons)" '["high-risk","external-effect","policy-conflict"]'

# Every declared situation must produce at least one reason from the closed
# vocabulary. A situation the kernel accepts and then drops would answer
# required:false -- "no human needed" for an input the kernel did not act on.
for sit in $(jq -r '(.retry.never_retry + .hitl.situations)[]' "$REG/policy.json"); do
  run hitl --risk low --autonomy A2 --situation "$sit"
  assert_eq "situation $sit requires a human" "$(jqval .required)" "true"
  assert_eq "situation $sit cites only declared reasons" \
    "$(printf '%s' "$OUT" | jq --slurpfile pol "$REG/policy.json" -c '[.reasons[] | select(. as $r | $pol[0].hitl.reasons | index($r) | not)]' 2>/dev/null)" "[]"
done

run hitl --risk low --autonomy A2 --situation nonsense
assert_err "unknown situation is an error"
run hitl --autonomy A2
assert_err "hitl requires --risk"
run hitl --risk low
assert_err "hitl requires --autonomy"
run hitl --risk low --autonomy A9
assert_err "hitl rejects an autonomy level outside A0..A4"
run hitl --risk low --autonomy A2 --evidence maybe
assert_err "hitl rejects an unknown --evidence"
run hitl --risk low --autonomy A2 --conflict yes
assert_err "hitl rejects a non-boolean --conflict"
run hitl --bogus x
assert_err "hitl with an unknown argument errors"

# a trailing flag with no value must error, not spin the arg loop forever
run hitl --risk
assert_err "hitl with a valueless --risk errors instead of hanging"
run hitl --risk low --autonomy A2 --situation
assert_err "hitl with a valueless --situation errors instead of hanging"

# resolve-task carries the answer, so an adapter needs one call, not two — but
# only for a CLASSIFIED tier. A matched decision rule carrying risk=high is a
# classification: this prompt trips rule-destructive-ddl and rule-production-write.
run resolve-task --prompt "drop the users table in production"
assert_ok "resolve-task with a destructive prompt exits 0"
assert_eq "resolve-task confirms the classification" "$(jqval .decision_rules.any_high)" "true"
assert_eq "resolve-task carries hitl for a classified tier" "$(jqval .hitl.required)" "true"
assert_eq "resolve-task hitl cites the classified high risk" \
  "$(jqvalc '[.hitl.reasons[] | select(. == "high-risk")]')" '["high-risk"]'
# Follow-on: no --conflict is synthesized from any_high, so a conflict nobody
# observed is never claimed. This asserts the whole list, not a subset, so a
# reason creeping back in fails here.
assert_eq "resolve-task claims no unobserved policy conflict" \
  "$(jqvalc .hitl.reasons)" '["high-risk"]'

# The mirror, and the point of the whole distinction: a risk FLOOR is an input
# to classification, not a classification. security-files carries risk_floor
# high, so the old shape announced a human gate on every auth-guard edit — gate
# theatre (rules/gates.md). hitl must be null even though the floor is high.
#
# task_contract.risk_floor is asserted alongside because otherwise `hitl: null`
# proves nothing: a prompt that stopped resolving a high floor would satisfy the
# assertion for the wrong reason. The expected floor is read from intents.json;
# the intent id is named because the prompt has to be written to match some
# specific intent, so it cannot be derived.
FLOOR_EXP=$(jq -r '.intents[] | select(.id == "security-files") | .risk_floor' "$REG/intents.json")
run resolve-task --prompt "fix the auth guard bug"
assert_ok "resolve-task with a floor-only prompt exits 0"
assert_eq "resolve-task resolves the security-files intent" \
  "$(jqvalc .task_contract.intents)" '["security-files"]'
assert_eq "resolve-task confirms no classification happened" \
  "$(jqval .decision_rules.any_high)" "false"
assert_eq "resolve-task still resolves the floor the registry declares" \
  "$(jqval .task_contract.risk_floor)" "$FLOOR_EXP"
assert_eq "resolve-task claims no hitl off a bare floor" "$(jqvalc .hitl)" "null"
# The floor is carried in exactly one place. A second top-level copy shipped in
# 58504dd with no reader outside its own tests (rules/base.md), so its absence
# is asserted rather than left to drift back in.
assert_eq "resolve-task publishes no second top-level risk_floor" \
  "$(jqvalc 'has("risk_floor")')" "false"

# No intent, no rule, no scale signal: no floor either, and still no hitl. This
# separates "hitl null because the floor is unclassified" from "hitl null
# because there is no risk evidence at all".
run resolve-task --prompt "what does this function return?"
assert_ok "resolve-task with no risk evidence exits 0"
assert_eq "resolve-task reports no floor when there is none" \
  "$(jqval .task_contract.risk_floor)" "null"
assert_eq "resolve-task claims no hitl with no risk evidence" "$(jqvalc .hitl)" "null"

# Amendment 5 coupling, from the caller's side: cmd_admit's reject message
# embeds the literal "hitl: budget-exhausted", and `hitl --situation reject`
# must answer with that same id. The id is read from the registry rather than
# spelled here, and an id missing from hitl.reasons is its own named failure
# above -- never a grep that matches vacuously.
BX=$(jq -r '.hitl.reasons[] | select(. == "budget-exhausted")' "$REG/policy.json")
assert_eq "hitl.reasons declares the id admit's reject message cites" "$BX" "budget-exhausted"
if [ -n "$BX" ]; then
  run admit --inflight "$CAP" --queued "$MAXQ"
  assert_eq "admit's reject reason names hitl: $BX" \
    "$(printf '%s' "$OUT" | jq -r --arg b "$BX" '.reason | test("hitl: " + $b)' 2>/dev/null)" "true"
  run hitl --risk low --autonomy A2 --situation reject
  assert_eq "hitl --situation reject answers with that same id" "$(jqvalc .reasons)" "[\"$BX\"]"
fi

# need_reg proves only that policy.json exists. With .hitl absent, the
# situation allowlist is `null | index($s)` -- every situation reads as unknown
# -- and any answer that got through would carry a null record_home with exit
# 0. Fail closed instead.
#
# Built as a relocated kernel copy rather than by mutating $REG in place (the
# breaker case above uses the same shape): a run that dies mid-fixture cannot
# leave the repo's registries broken.
HITLT="$TMPROOT/hitlt"
mkdir -p "$HITLT/scripts" "$HITLT/registries" "$HITLT/dist"
cp "$KERNEL" "$HITLT/scripts/kernel.sh"
cp "$ROOT/dist/engineos.cjs" "$HITLT/dist/"
jq 'del(.hitl)' "$REG/policy.json" > "$HITLT/registries/policy.json"
OUT=$(bash "$HITLT/scripts/kernel.sh" hitl --risk low --autonomy A2 2>&1); RC=$?
assert_err "hitl with no hitl policy block errors (fail-closed, never a null record_home)"
OUT=$(bash "$HITLT/scripts/kernel.sh" hitl --risk high --autonomy A3 2>&1); RC=$?
assert_err "hitl with no hitl policy block errors even on the required path"
rm -rf "$HITLT"

# ... and the KEY, not just the block. `jq -e '.hitl'` tests the block, while
# the comment beside it claimed it kept a null record_home from shipping. It
# did not: deleting hitl.record_home alone answered
# {"required":true,"reasons":["high-risk"],"record_home":null} at rc=0 — a
# caller told a human must decide and given nowhere to record the decision,
# which rules/risk-autonomy.md counts as a gate not passed.
HK=$(relocated_kernel hitl-no-record-home 'del(.hitl.record_home)')
runk "$HK" hitl --risk high --autonomy A3
assert_err "hitl with no hitl.record_home errors (fail-closed, never a null record home)"
assert_eq "the missing-record_home error names the field" \
  "$(jqval '.error | test("record_home")')" "true"
runk "$HK" hitl --risk low --autonomy A2
assert_err "hitl with no hitl.record_home errors on the not-required path too"

# The control: the same relocated shape with the key intact still answers, and
# still answers with the registry's own value.
HK=$(relocated_kernel hitl-record-home-control '.')
runk "$HK" hitl --risk high --autonomy A3
assert_ok "a relocated kernel copy with record_home intact still answers hitl"
assert_eq "the answered record_home is the registry's" "$(jqval .record_home)" "$RECORD_HOME"

# Same shape for the other registry value the answer depends on. Without the
# guard, jq indexed the level list with null and autonomy_after came back as a
# confident wrong ceiling instead of an error. The node runtime goes further:
# its policy loader is strict, so a malformed policy.json is refused at load and
# even the adequate-evidence path (which never reads the field) fails closed.
THINT="$TMPROOT/thint"
mkdir -p "$THINT/scripts" "$THINT/registries" "$THINT/dist"
cp "$KERNEL" "$THINT/scripts/kernel.sh"
cp "$ROOT/dist/engineos.cjs" "$THINT/dist/"
jq 'del(.autonomy.high_with_thin_evidence)' "$REG/policy.json" > "$THINT/registries/policy.json"
OUT=$(bash "$THINT/scripts/kernel.sh" hitl --risk high --autonomy A3 --evidence thin 2>&1); RC=$?
assert_err "hitl errors when autonomy.high_with_thin_evidence is missing"
OUT=$(bash "$THINT/scripts/kernel.sh" hitl --risk high --autonomy A3 2>&1); RC=$?
assert_err "hitl refuses with adequate evidence too: a malformed policy.json never answers"
jq '.autonomy.high_with_thin_evidence = "sideways"' "$REG/policy.json" > "$THINT/registries/policy.json"
OUT=$(bash "$THINT/scripts/kernel.sh" hitl --risk high --autonomy A3 --evidence thin 2>&1); RC=$?
assert_err "hitl errors when autonomy.high_with_thin_evidence is not a level id"
rm -rf "$THINT"

# ------------------------------------------------------- risk fail-closed fix

echo "-- risk fail-closed --"

run risk --signals '{}'
assert_err "risk with neither inputs nor floors is an error, not low"
run risk --signals '{"inputs":{}}'
assert_err "risk with empty inputs and no floors is an error"
run risk --signals '{"floors":["destructive-ddl-dml"]}'
assert_ok "risk with a floor and no inputs is still answerable"
assert_eq "floor alone -> high" "$(jqval .risk)" "high"

# ------------------------------------------------- skill enablement (E03)

echo "-- skill-state and disabled-skill suppression --"

# The disable switch had no reader outside the console: a skill turned off in
# the UI was still handed to the model by every routing answer. These cases are
# the proof that it now has one, and the regression that keeps it having one.

run skill-state
assert_ok "skill-state answers without arguments"
assert_eq "every skill under skills/ is listed" \
  "$(jqval '.skills | length')" "$(find "$ROOT/skills" -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ')"

FIRST_SKILL=$(ls "$ROOT/skills" | head -1)
run skill-state --id "$FIRST_SKILL"
assert_eq "a skill that exists reports exists:true" "$(jqval .exists)" "true"
run skill-state --id no-such-skill-anywhere
assert_eq "an unknown id reports exists:false" "$(jqval .exists)" "false"
assert_eq "an unknown id is not reported as disabled" "$(jqval .enabled)" "true"

# Fixture: a full-enough tree where ONE skill that a routing domain actually
# references is disabled. It must be a skill some domain names, or the case
# proves nothing about routing.
SKD_DOMAIN=$(jq -r '[.domains[] | select((.skills | length) > 0)][0].id' "$REG/routing.json")
SKD_SKILL=$(jq -r --arg d "$SKD_DOMAIN" '.domains[] | select(.id==$d) | .skills[0]' "$REG/routing.json")
SKD_PATH=$(jq -r --arg d "$SKD_DOMAIN" '.domains[] | select(.id==$d) | .sample_path' "$REG/routing.json")
case "$SKD_SKILL" in ''|null) echo "no routing domain declares a skill — fixture cannot be built" >&2; exit 2 ;; esac

SKD="$TMPROOT/skilldis"
mkdir -p "$SKD/scripts" "$SKD/registries" "$SKD/skills/$SKD_SKILL"
cp "$KERNEL" "$SKD/scripts/kernel.sh"
cp "$REG"/*.json "$SKD/registries/"
printf -- '---\nname: %s\nenabled: false\n---\n\nbody\n' "$SKD_SKILL" > "$SKD/skills/$SKD_SKILL/SKILL.md"

OUT=$(bash "$SKD/scripts/kernel.sh" skill-state --id "$SKD_SKILL" 2>&1); RC=$?
assert_eq "frontmatter enabled:false is read as disabled" "$(jqval .enabled)" "false"

OUT=$(bash "$SKD/scripts/kernel.sh" route-path "$SKD_PATH" 2>&1); RC=$?
assert_ok "route-path still answers with a disabled skill in the domain"
assert_eq "route-path drops the disabled skill from skills" \
  "$(jqvalc "[.skills[] | select(. == \"$SKD_SKILL\")]")" "[]"
assert_eq "route-path says WHY it dropped it, instead of returning a silently short list" \
  "$(jqval '.skills_suppressed[0].reason')" "disabled"
assert_eq "the suppressed entry names the skill" \
  "$(jqval '.skills_suppressed[0].id')" "$SKD_SKILL"

# Same tree, skill re-enabled by removing the key entirely: absence means
# enabled, which is what keeps every skill written before this field existed
# working.
printf -- '---\nname: %s\n---\n\nbody\n' "$SKD_SKILL" > "$SKD/skills/$SKD_SKILL/SKILL.md"
OUT=$(bash "$SKD/scripts/kernel.sh" route-path "$SKD_PATH" 2>&1); RC=$?
assert_eq "absence of the enabled key means enabled" \
  "$(jqvalc "[.skills[] | select(. == \"$SKD_SKILL\")]")" "[\"$SKD_SKILL\"]"
assert_eq "nothing is suppressed when the skill is enabled" "$(jqvalc .skills_suppressed)" "[]"

# An `enabled:` line in the BODY is documentation, not configuration. A parser
# that scanned the whole file would let a code sample switch a skill off.
printf -- '---\nname: %s\n---\n\nExample frontmatter:\n\nenabled: false\n' "$SKD_SKILL" > "$SKD/skills/$SKD_SKILL/SKILL.md"
OUT=$(bash "$SKD/scripts/kernel.sh" skill-state --id "$SKD_SKILL" 2>&1); RC=$?
assert_eq "an enabled: line in the body does not disable the skill" "$(jqval .enabled)" "true"

# A file with no frontmatter at all must not be misread as a disable.
printf -- '# %s\n\nenabled: false\n' "$SKD_SKILL" > "$SKD/skills/$SKD_SKILL/SKILL.md"
OUT=$(bash "$SKD/scripts/kernel.sh" skill-state --id "$SKD_SKILL" 2>&1); RC=$?
assert_eq "a SKILL.md without frontmatter stays enabled" "$(jqval .enabled)" "true"

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
