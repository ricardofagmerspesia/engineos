#!/usr/bin/env bash
# EngineOS eval runner (gap G4 of docs/specs/2026-08-02-ai-methodology-integration-analysis.md).
#
# rules/llm-apps.md forbids vibes-driven development and requires a golden set
# before iterating on any prompt or agent. EngineOS had none for its own router.
# This runs that set. Grading contract: evals/RUBRIC.md.
#
#   scripts/run-evals.sh                      deterministic tier only
#   ENGINEOS_EVAL_LIVE=1 scripts/run-evals.sh deterministic + live model grading
#
# The live tier needs the `claude` CLI on PATH. When it is absent or not opted
# into, the tier reports SKIPPED with a count — never as passed.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

command -v jq >/dev/null 2>&1 || { echo "FAIL: jq is required to run evals"; exit 1; }

INTENTS=evals/intent-routing-cases.jsonl
AGENTS=evals/agent-cases.jsonl
pass=0; fail=0; skipped=0
ok()  { pass=$((pass+1)); printf 'ok   %s\n' "$1"; }
bad() { fail=$((fail+1)); printf 'FAIL %s\n' "$1"; }

ALWAYS_ON=$(sed -n 's|^@rules/\([a-z-]*\)\.md.*|\1|p' CLAUDE.md | sort -u | tr '\n' ' ')
is_always_on() { case " $ALWAYS_ON " in *" $1 "*) return 0 ;; esac; return 1; }

# deferrals_of <rule> -> non-always-on rules that <rule>'s text points at.
# Mirrors the closure derivation in scripts/validate-engineos.sh.
deferrals_of() {
  local r="$1" s out=""
  for s in $(cd rules && ls ./*.md | sed 's|^\./||; s|\.md$||'); do
    [ "$s" = "$r" ] && continue
    is_always_on "$s" && continue
    grep -qE "(rules/)?\`?${s}\.md" "rules/$r.md" 2>/dev/null && out="$out $s"
  done
  echo "$out"
}

echo "== deterministic tier =="

# ------------------------------------------------------- well-formed JSONL
for f in "$INTENTS" "$AGENTS"; do
  [ -f "$f" ] || { bad "$f missing"; continue; }
  n=0; bads=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    n=$((n+1))
    printf '%s' "$line" | jq empty >/dev/null 2>&1 || bads="$bads line$n"
  done < "$f"
  [ -z "$bads" ] && ok "$f is valid JSONL ($n cases)" || bad "$f has malformed lines:$bads"
done

# --------------------------------------------------- intent case conformance
bad_rule=""; bad_both=""; bad_closed=""; bad_alwayson=""; bad_fields=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  id=$(printf '%s' "$line" | jq -r '.id // ""')
  inp=$(printf '%s' "$line" | jq -r '.input // ""')
  notes=$(printf '%s' "$line" | jq -r '.notes // ""')
  [ -n "$id" ] && [ -n "$inp" ] && [ -n "$notes" ] || bad_fields="$bad_fields ${id:-<no-id>}"
  ml=$(printf '%s' "$line" | jq -r '.must_load[]?')
  mn=$(printf '%s' "$line" | jq -r '.must_not_load[]?')

  for r in $ml $mn; do
    [ -f "rules/$r.md" ] || bad_rule="$bad_rule $id->$r"
  done
  for r in $ml; do
    is_always_on "$r" && bad_alwayson="$bad_alwayson $id->must_load:$r"
    case " $(echo "$mn" | tr '\n' ' ') " in *" $r "*) bad_both="$bad_both $id->$r" ;; esac
    for d in $(deferrals_of "$r"); do
      case " $(echo "$ml" | tr '\n' ' ') " in
        *" $d "*) ;;
        *) bad_closed="$bad_closed $id($r-defers-to-$d)" ;;
      esac
    done
  done
  for r in $mn; do
    is_always_on "$r" && bad_alwayson="$bad_alwayson $id->must_not_load:$r"
  done
done < "$INTENTS"

[ -z "$bad_fields"   ] && ok "every intent case has id, input and notes"                  || bad "cases missing required fields:$bad_fields"
[ -z "$bad_rule"     ] && ok "every asserted rule exists in rules/"                        || bad "cases naming nonexistent rules:$bad_rule"
[ -z "$bad_both"     ] && ok "no rule is both required and forbidden in the same case"     || bad "contradictory expectations:$bad_both"
[ -z "$bad_alwayson" ] && ok "no case asserts on an always-on rule (they are implicit)"     || bad "always-on rules asserted:$bad_alwayson"
[ -z "$bad_closed"   ] && ok "every must_load set is closed under rule deferrals"           || bad "unclosed must_load sets:$bad_closed"

# ---------------------------------------------------- agent case conformance
bad_agent=""; bad_lists=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  id=$(printf '%s' "$line" | jq -r '.id // ""')
  ag=$(printf '%s' "$line" | jq -r '.agent // ""')
  [ "$ag" = "any" ] || [ -f "agents/$ag.md" ] || bad_agent="$bad_agent $id->$ag"
  nm=$(printf '%s' "$line" | jq -r '.must | length')
  nn=$(printf '%s' "$line" | jq -r '.must_not | length')
  { [ "$nm" -gt 0 ] && [ "$nn" -gt 0 ]; } || bad_lists="$bad_lists $id"
done < "$AGENTS"
[ -z "$bad_agent" ] && ok "every agent case names an existing agent"          || bad "cases naming nonexistent agents:$bad_agent"
[ -z "$bad_lists" ] && ok "every agent case has both must and must_not items" || bad "cases with an empty must/must_not list:$bad_lists"

# ------------------------------------------------------------- coverage floor
n_intents=$(grep -c . "$INTENTS")
if [ "$n_intents" -ge 25 ]; then
  ok "intent set size $n_intents (RUBRIC target 30-60; floor 25)"
else
  bad "intent set has only $n_intents cases — below the floor of 25, the set is decorative"
fi

# ------------------------------------------------------------------ live tier
echo
echo "== live tier =="
if [ "${ENGINEOS_EVAL_LIVE:-0}" != "1" ]; then
  skipped=$n_intents
  echo "SKIP $n_intents intent cases — set ENGINEOS_EVAL_LIVE=1 to grade against a live model"
elif ! command -v claude >/dev/null 2>&1; then
  skipped=$n_intents
  echo "SKIP $n_intents intent cases — ENGINEOS_EVAL_LIVE=1 but the 'claude' CLI is not on PATH"
else
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    id=$(printf '%s' "$line" | jq -r '.id')
    inp=$(printf '%s' "$line" | jq -r '.input')
    ml=$(printf '%s' "$line" | jq -r '.must_load[]?')
    mn=$(printf '%s' "$line" | jq -r '.must_not_load[]?')
    n_intent=$(printf '%s' "$line" | jq -r '.expect_intents | length')

    out=$(claude -p "$inp" 2>/dev/null)
    router=$(printf '%s' "$out" | grep -m1 '^\[router\]' || true)

    if [ "$n_intent" -eq 0 ]; then
      # Pure question: routing exemption. Emitting a router line is over-routing.
      [ -z "$router" ] && ok "$id (no routing expected)" \
                       || bad "$id over-routed a pure question: $router"
      continue
    fi
    if [ -z "$router" ]; then bad "$id emitted no [router] line"; continue; fi

    problems=""
    for r in $ml; do
      case "$router" in *"$r"*) ;; *) problems="$problems missing:$r" ;; esac
    done
    for r in $mn; do
      case "$router" in *"$r"*) problems="$problems forbidden:$r" ;; esac
    done
    [ -z "$problems" ] && ok "$id" || bad "$id —$problems | got: $router"
  done < "$INTENTS"
fi

echo
printf 'passed %d, failed %d, skipped %d\n' "$pass" "$fail" "$skipped"
[ "$fail" -eq 0 ] || exit 1
