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
SELFT=$(cd "$(mktemp -d)" && pwd -P)
for variant in with without; do
  mkdir -p "$SELFT/$variant/scripts" "$SELFT/$variant/registries"
  cp "$KERNEL" "$SELFT/$variant/scripts/kernel.sh"
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

cp "$REG/policy.json" /tmp/test-kernel-policy-bak.json
jq 'del(.router)' /tmp/test-kernel-policy-bak.json > "$REG/policy.json"
run route-escalate --prompt "add a feature"
assert_err "route-escalate with no router policy block errors (fail-closed)"
cp /tmp/test-kernel-policy-bak.json "$REG/policy.json"
rm -f /tmp/test-kernel-policy-bak.json

# ---------------------------------------------- positional subcommands fail closed
# The three positional subcommands used to accept a flag SILENTLY: bash bound
# "--prompt" to $1 and the real argument was discarded, so route-intent answered
# about the literal string "--prompt" (which contains the LLM signal "prompt")
# and exited 0. A resolver that returns a confident wrong answer is worse than
# one that refuses, and the flag shape is plausible because route-escalate,
# scale and decision-rules all legitimately take --prompt.

for sub in route-path route-intent capability; do
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

run capability implement
assert_eq "capability still answers the positional form" "$(jqval '.agent')" "backend-coordinator"

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

cap=$(jq -r '.parallelism.wave_concurrency_cap' "$REG/policy.json")
maxq=$(jq -r '.parallelism.backpressure.max_queued_units' "$REG/policy.json")

run admit --inflight 0 --queued 0
assert_ok "admit with idle capacity exits 0"
assert_eq "admit idle -> dispatch" "$(jqval .action)" "dispatch"
assert_eq "admit idle capacity == cap" "$(jqval .capacity)" "$cap"

# capacity is cap - inflight, not a constant: 3 running under a cap of 6 must
# report 3 remaining, which a hardcoded cap would get wrong.
run admit --inflight 3 --queued 0
assert_eq "admit with 3 inflight -> dispatch" "$(jqval .action)" "dispatch"
assert_eq "admit capacity is cap minus inflight" "$(jqval .capacity)" "$((cap - 3))"
assert_eq "admit answers exactly {action, capacity, reason}" \
  "$(jqvalc '. | keys | sort')" '["action","capacity","reason"]'

# a trailing flag with no value must error, not spin the arg loop forever
run admit --inflight
assert_err "admit with a valueless --inflight errors instead of hanging"

run admit --inflight "$cap" --queued 0
assert_eq "admit at cap -> overload_action" "$(jqval .action)" "$(jq -r '.parallelism.backpressure.overload_action' "$REG/policy.json")"
assert_eq "admit at cap capacity 0" "$(jqval .capacity)" "0"

# over the cap with room in the queue is still the overload action, not reject
run admit --inflight "$((cap + 1))" --queued 5
assert_eq "admit over cap with a non-full queue -> defer" "$(jqval .action)" "defer"

run admit --inflight "$cap" --queued "$maxq"
assert_eq "admit at cap and queue full -> reject" "$(jqval .action)" "reject"
# Task 4's `hitl --situation reject` keys on this literal
assert_eq "admit reject reason names the HITL trigger" \
  "$(jqval '.reason | test("budget-exhausted")')" "true"

# a leading zero is a shell-ism, not a JSON number: it normalises, and must
# never surface as a bare jq parse error
run admit --inflight 02 --queued 0
assert_ok "admit normalises a leading-zero --inflight"
assert_eq "admit treats 02 as 2" "$(jqval .capacity)" "$((cap - 2))"

run admit --inflight abc --queued 0
assert_err "admit rejects a non-numeric --inflight"
run admit --inflight 1 --queued abc
assert_err "admit rejects a non-numeric --queued"
run admit --inflight 1
assert_err "admit requires --queued"

# ------------------------------------------------------- risk fail-closed fix

echo "-- risk fail-closed --"

run risk --signals '{}'
assert_err "risk with neither inputs nor floors is an error, not low"
run risk --signals '{"inputs":{}}'
assert_err "risk with empty inputs and no floors is an error"
run risk --signals '{"floors":["destructive-ddl-dml"]}'
assert_ok "risk with a floor and no inputs is still answerable"
assert_eq "floor alone -> high" "$(jqval .risk)" "high"

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
