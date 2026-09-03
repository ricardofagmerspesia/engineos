#!/usr/bin/env bash
# Behavioral contract for the unified UserPromptSubmit adapter.
set -uo pipefail
export ENGINEOS_BYPASS_FLAG=/nonexistent/engineos.bypass
unset ENGINEOS_BYPASS

DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/prompt-advisor.sh"
pass=0
fail=0

ok() { pass=$((pass + 1)); }
no() { fail=$((fail + 1)); echo "FAIL $*"; }

# want <substring> <context> <desc> / absent <substring> <context> <desc>
want()   { case "$2" in *"$1"*) ok ;; *) no "$3 — want '$1' in: [$2]" ;; esac; }
absent() { case "$2" in *"$1"*) no "$3 — did not want '$1' in: [$2]" ;; *) ok ;; esac; }

context() {
  local prompt="$1" cwd="${2:-}" sid="${3:-test}"
  jq -nc --arg p "$prompt" --arg c "$cwd" --arg s "$sid" \
    '{prompt:$p,cwd:$c,session_id:$s}' \
    | ENGINEOS_TELEMETRY=0 bash "$HOOK" \
    | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null
}

command -v jq >/dev/null 2>&1 || { echo "SKIP jq not installed"; exit 0; }

CTX=$(context "Implement the notifications feature across all services")
case "$CTX" in *"big-task signal"*"route escalation"*) ok ;; *) no "scale and route guidance are combined: $CTX" ;; esac

CTX=$(context "deploy the billing service to production")
case "$CTX" in
  *"rule-production-write"*"[gate: release] [risk: high]"*"autonomy ceiling A3"*) ok ;;
  *) no "decision rule fields and high-risk ceiling are preserved: $CTX" ;;
esac

CTX=$(context "Write the PRD for the billing rework")
case "$CTX" in *"model: fable"*) ok ;; *) no "spec authoring tier is preserved: $CTX" ;; esac

CTX=$(context "what does this function return?")
[ -z "$CTX" ] && ok || no "pure question should stay silent: $CTX"

CTX=$(ENGINEOS_BYPASS=1 context "deploy to production")
case "$CTX" in *"BYPASS ACTIVE"*) ok ;; *) no "bypass announcement is preserved: $CTX" ;; esac

# Adopted repos receive one route event for every prompt, a decision event only
# when a decision rule matched, and a hitl event only when a human is required.
# rule-production-write carries risk=high, so this prompt fires all three.
T=$(mktemp -d)
(cd "$T" && git init -q) >/dev/null 2>&1
mkdir -p "$T/.engineos"
jq -nc --arg p "deploy the billing service to production" --arg c "$T" --arg s unified1 \
  '{prompt:$p,cwd:$c,session_id:$s}' | bash "$HOOK" >/dev/null
TF="$T/.git/engineos-telemetry/unified1.jsonl"
if [ -f "$TF" ] \
   && [ "$(wc -l < "$TF" | tr -d ' ')" = "3" ] \
   && [ "$(jq -r '.event' "$TF" | tr '\n' ',')" = "route,decision-rules,hitl," ] \
   && bash "$DIR/../scripts/telemetry.sh" validate "$TF" >/dev/null 2>&1; then
  ok
else
  no "unified telemetry stream is valid: $([ -f "$TF" ] && tr '\n' ' ' < "$TF" || echo MISSING)"
fi
rm -rf "$T"

T=$(mktemp -d)
(cd "$T" && git init -q) >/dev/null 2>&1
mkdir -p "$T/.engineos"
jq -nc --arg p "what does this function return?" --arg c "$T" --arg s unified2 \
  '{prompt:$p,cwd:$c,session_id:$s}' | bash "$HOOK" >/dev/null
TF="$T/.git/engineos-telemetry/unified2.jsonl"
if [ -f "$TF" ] && [ "$(wc -l < "$TF" | tr -d ' ')" = "1" ] \
   && [ "$(jq -r '.event' "$TF")" = "route" ]; then
  ok
else
  no "zero-match prompt writes only the route denominator"
fi
rm -rf "$T"

# Scale guidance, folded in from the retired hooks/test-task-scale.sh. The
# unified adapter still emits a task contract for a one-unit prompt, so a small
# change must not trip the fan-out advice -- not that it must stay silent.
while IFS='|' read -r prompt phrase; do
  want "$phrase" "$(context "$prompt")" "scale signal on '$prompt'"
done <<'SCALE'
Refactor every component to the new theme API|big-task signal
Should we use Kafka or SQS for this? design the flow|model: opus
let's decompose this into smaller pieces|model: opus
we should write an adr for this|model: opus
SCALE
absent "big-task signal" "$(context "add a component for the user avatar")" \
       "a single component is not a fan-out"
absent "big-task signal" "$(context "create a service to send the welcome email")" \
       "a single service is not a fan-out"
# bare "design"/"architecture" in ordinary prose must claim no tier at all
CTX=$(context "the button design looks good to me")
[ -z "$CTX" ] && ok || no "bare design word stays quiet: $CTX"
CTX=$(context "the architecture diagram in the doc is outdated")
[ -z "$CTX" ] && ok || no "bare architecture word stays quiet: $CTX"

# Decision rules, folded in from the retired hooks/test-gate-advisor.sh. The
# destructive-DDL prompt keeps words between "drop" and "column" on purpose.
while IFS='|' read -r prompt phrase; do
  want "$phrase" "$(context "$prompt")" "decision rule on '$prompt'"
done <<'RULES'
drop the legacy_id column from users|rule-destructive-ddl
we leaked an api key in git|rule-secret-exposure
add pagination across all endpoints|rule-fanout
build a notifications module|rule-spec-threshold
is this done?|rule-verification
this is a breaking change to the orders API|rule-public-contract
store the patient medical record|rule-sensitive-data
rewrite the scheduler|rule-large-change
should we fine-tune a model for this?|rule-volatile-knowledge
truncate the events table|autonomy ceiling A3
RULES

# Field labels. The rule id firing says nothing about which SLOT each value was
# printed in: a collapsed optional field still names the right rule while calling
# its gate a preference. Neither prompt below defines `prefer`, so a "prefer:"
# here is a shifted field, not registry content.
CTX=$(context "drop the legacy_id column from users")
want "rule-destructive-ddl — require: two-phase-deploy, explicit-confirmation, down-path-or-documented-irreversibility [risk: high]" \
     "$CTX" "destructive DDL labels risk with no gate of its own"
absent "prefer:" "$CTX" "destructive DDL never labels its risk a preference"
absent "prefer:" "$(context "deploy the billing service to production")" \
       "production-write never labels its gate a preference"
# The mirror case: a rule that really does define `prefer` must still print it,
# so a fix cannot pass by dropping the field instead of keeping it in its slot.
want "rule-volatile-knowledge — require: retrieval-evaluation, freshness-policy — prefer: retrieval-over-fine-tuning" \
     "$(context "should we fine-tune a model for this?")" \
     "a rule that defines prefer still prints the prefer label"

# Silence cases — the ones that keep the guidance usable.
CTX=$(context "what does base.md say about naming")
[ -z "$CTX" ] && ok || no "plain question stays silent: $CTX"
CTX=$(context "")
[ -z "$CTX" ] && ok || no "empty prompt stays silent: $CTX"
absent "decision rules matched" "$(context "show me the order service")" \
       "reading code matches no decision rule"
absent "decision rules matched" "$(context "fix the typo in the readme")" \
       "a small fix matches no decision rule"

# Route resolution, folded in from the retired hooks/test-route-advisor.sh.
CTX=$(context "add a paginated orders endpoint to the API and mirror the screen to mobile")
want "route escalation" "$CTX" "multi-agent dispatch escalates"
want "multi-agent-dispatch" "$CTX" "the escalation notice names the reason"
want "\`router\` agent" "$CTX" "the escalation notice names the router agent"
want "unrouted-scale" "$(context "let's decompose this into smaller pieces")" \
     "an unrouted scale signal escalates with its reason"
want "requires-dispatch-plan" "$(context "backfill the tenant column")" \
     "a dispatch-plan intent escalates with its reason"

# A resolved single-domain prompt gets one deterministic contract line and no
# escalation. The security-files intent carries risk_floor: high, so the HITL
# gate line joins it — two lines, one contract and one gate, still no second
# route pass. The count is asserted so a third line cannot creep in unnoticed.
CTX=$(context "fix the auth guard bug")
want "task contract (kernel, deterministic)" "$CTX" "a resolved prompt does not escalate"
want "intents=security-files" "$CTX" "the deterministic line names the resolved intent"
absent "route escalation" "$CTX" "a resolved prompt carries no escalation notice"
want "human-in-the-loop required — reasons: high-risk" "$CTX" \
     "a high risk floor announces the HITL gate with its reason"
[ "$(printf '%s' "$CTX" | grep -c '^\[engineos\]')" -eq 2 ] && ok \
  || no "deterministic output is not exactly the contract line plus the HITL line: [$CTX]"

# The mirror: a resolved prompt whose floor needs no human carries the contract
# line alone. Without this case, a hitl_note that fired unconditionally would
# still pass the assertion above.
CTX=$(context "add a component for the user avatar")
want "task contract (kernel, deterministic)" "$CTX" "a low-floor prompt still gets its contract"
absent "human-in-the-loop required" "$CTX" "a low risk floor announces no HITL gate"

# Exit codes: a hook that fails is a hook that blocks the prompt.
jq -nc '{prompt:"add a paginated orders endpoint to the API and mirror the screen to mobile"}' \
  | ENGINEOS_TELEMETRY=0 bash "$HOOK" >/dev/null
[ "$?" -eq 0 ] && ok || no "escalating prompt exits non-zero"
printf 'not json at all' | bash "$HOOK" >/dev/null 2>&1
[ "$?" -eq 0 ] && ok || no "malformed payload exits non-zero"

# No jq: silent exit 0. Dropping jq's dir from PATH is not enough on a machine
# with jq installed twice (e.g. /usr/bin AND a conda env), so build an isolated
# PATH with symlinks for only what the hook needs besides jq.
TMPBIN=$(mktemp -d)
ln -s "$(command -v cat)" "$TMPBIN/cat"
ln -s "$(command -v dirname)" "$TMPBIN/dirname"
BASH_ABS="$(command -v bash)"
OUT=$(printf '{"prompt":"implement the notifications feature across all services"}' \
  | PATH="$TMPBIN" "$BASH_ABS" "$HOOK" 2>&1)
RC=$?
rm -rf "$TMPBIN"
if [ "$RC" -eq 0 ] && [ -z "$(printf '%s' "$OUT" | tr -d '[:space:]')" ]; then
  ok
else
  no "no-jq run — rc=$RC out=[$OUT], want rc=0 and no output"
fi

# Telemetry switches: off by env, and off in a repo that never adopted EngineOS.
T=$(mktemp -d)
(cd "$T" && git init -q) >/dev/null 2>&1
mkdir -p "$T/.engineos"
jq -nc --arg p "deploy the billing service to production" --arg c "$T" --arg s unified3 \
  '{prompt:$p,cwd:$c,session_id:$s}' | ENGINEOS_TELEMETRY=0 bash "$HOOK" >/dev/null
[ -e "$T/.git/engineos-telemetry" ] && no "ENGINEOS_TELEMETRY=0 wrote a telemetry file" || ok
rm -rf "$T"

T=$(mktemp -d)   # a git repo with no .engineos/ has not adopted EngineOS
(cd "$T" && git init -q) >/dev/null 2>&1
jq -nc --arg p "deploy the billing service to production" --arg c "$T" --arg s unified4 \
  '{prompt:$p,cwd:$c,session_id:$s}' | bash "$HOOK" >/dev/null
[ -e "$T/.git/engineos-telemetry" ] && no "non-adopted repo wrote a telemetry file" || ok
rm -rf "$T"

printf 'prompt-advisor: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
