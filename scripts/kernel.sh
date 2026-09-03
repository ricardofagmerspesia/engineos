#!/usr/bin/env bash
# EngineOS decision kernel — the resolver API over registries/*.json.
# One entry point, JSON out, no model calls. Answers the routing, model, risk,
# gate, retry, capability and wave questions that used to live as prose the
# model re-derived every turn, or as private copies inside individual hooks.
#
#   kernel.sh route-path <file>
#   kernel.sh route-intent <text>
#   kernel.sh model --work <type>
#   kernel.sh risk --signals <json>
#   kernel.sh gates --risk <tier>
#   kernel.sh retry --status <s> --attempt <n> [--situation <sit>]
#   kernel.sh repair --check <id> --attempt <n> [--situation <sit>]
#   kernel.sh admit --inflight <n> --queued <n>
#   kernel.sh breaker --state closed --failures <n>
#   kernel.sh breaker --state open --cooldown-elapsed <true|false>
#   kernel.sh breaker --state half-open --probe-result <ok|failed>
#   kernel.sh hitl --risk <tier> --autonomy <A0..A4> [--evidence thin|adequate]
#                  [--external-effect true|false] [--conflict true|false] [--situation <s>]
#   kernel.sh capability <id>
#   kernel.sh waves --units <json>
#   kernel.sh decision-rules --prompt <text>
#   kernel.sh scale --prompt <text>
#   kernel.sh route-escalate --prompt <text>
#   kernel.sh resolve-task --prompt <text>
#
# Exit: 0 success (a null/no-match answer IS an answer), 1 error. Errors are
# {"error": "..."} on stdout so callers parse a single stream. jq is REQUIRED —
# a hard error, deliberately unlike the hooks' silent degradation: the kernel
# is called on purpose, and a caller must know when it cannot answer.
#
# Spec: docs/specs/2026-08-06-decision-kernel-p2-resolver-api.md
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REG="$ROOT/registries"

err() { printf '{"error":%s}\n' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk 'BEGIN{printf "\""} {printf "%s", $0} END{printf "\""}')"; exit 1; }

command -v jq >/dev/null 2>&1 || { printf '{"error":"jq is required — the kernel cannot answer without it"}\n'; exit 1; }

need_reg() { [ -f "$REG/$1" ] || err "registry missing: registries/$1"; }

# require_positional <subcommand> <what> "$@" -> validates that exactly one
# non-flag positional argument was given, or errors. Call it DIRECTLY, never in
# a command substitution: err exits, and inside $(...) that would kill only the
# subshell while the caller carried on with an empty value.
#
# The three positional subcommands used to accept `--prompt "..."` silently:
# bash bound "--prompt" to $1 and discarded the real argument, so route-intent
# answered about the literal string "--prompt" — which contains the LLM intent
# signal "prompt" — and exited 0. A resolver returning a confident wrong answer
# is worse than one that refuses, and the flag shape is plausible precisely
# because route-escalate/scale/decision-rules do take --prompt. A path that
# genuinely starts with "-" stays reachable as ./-name.
require_positional() {
  local cmd="$1" what="$2"; shift 2
  [ $# -gt 0 ] && [ -n "$1" ] || err "$cmd requires $what"
  case "$1" in
    -*) err "$cmd takes $what as a positional argument, not a flag (got $1)" ;;
  esac
  [ $# -eq 1 ] || err "$cmd takes exactly one argument, got $#"
}

# ---------------------------------------------------------------- route-path
# First exclusion wins; then domains in precedence order, first matching glob
# wins — the same first-match-wins semantics as the case ladder this replaced.
# Glob matching uses bash case with unquoted pattern expansion: the same engine,
# patterns now registry data.
cmd_route_path() {
  require_positional route-path "a file path" "$@"
  local f="$1"
  need_reg routing.json
  local R="$REG/routing.json"
  local base="${f##*/}" norm="/$f"

  # Exclusions, in one jq pass and in first-match-wins order:
  #   self  — .excluded.self_dirs: root-relative directories of THIS checkout
  #           (its own hooks/ and docs/ trees) that get no routing. The list is
  #           registry data; only its resolution against $ROOT is code, which is
  #           what keeps a consumer project's own src/hooks/ or docs/ routable.
  #   path  — glob against the leading-slash-normalized full path
  #   base  — glob against the basename
  local typ p
  while IFS=$'\t' read -r typ p; do
    [ -n "$typ" ] || continue
    # shellcheck disable=SC2254  # $p is unquoted on purpose: it is a glob pattern
    case "$typ" in
      self) case "$f"    in "$ROOT/$p"/*) ;; *) continue ;; esac ;;
      path) case "$norm" in $p) ;;           *) continue ;; esac ;;
      base) case "$base" in $p) ;;           *) continue ;; esac ;;
      *) continue ;;
    esac
    jq -n '{domain: null, excluded: true}'; return 0
  done < <(jq -r '
      .excluded as $e
      | (($e.self_dirs // [])[] | ["self", .]),
        (($e.paths     // [])[] | ["path", .]),
        (($e.basenames // [])[] | ["base", .])
      | @tsv' "$R")

  local dom pat hit=""
  while IFS=$'\t' read -r dom typ pat; do
    # shellcheck disable=SC2254  # $pat is registry-owned glob data
    case "$typ" in
      path) case "$norm" in $pat) hit="$dom"; break ;; esac ;;
      base) case "$base" in $pat) hit="$dom"; break ;; esac ;;
    esac
  done < <(jq -r '
      .precedence[] as $d
      | (.domains[] | select(.id==$d)) as $x
      | (($x.match.paths     // [])[] | [$d, "path", .]),
        (($x.match.basenames // [])[] | [$d, "base", .])
      | @tsv' "$R")

  if [ -z "$hit" ]; then
    jq -n '{domain: null, excluded: false}'
  else
    jq --arg d "$hit" '
      .domains[] | select(.id==$d)
      | {domain: .id, rules, skills, agent, risk_floor, hook_guidance, excluded: false}' "$R"
  fi
}

# -------------------------------------------------------------- route-intent
# Case-insensitive boundary match of each intent's literal signal phrases
# against the prompt. Multi-match by design (CLAUDE.md: load all that apply);
# ambiguity handling beyond zero-match is Phase 3's router agent, which reads
# each intent's note.
cmd_route_intent() {
  require_positional route-intent "the request text" "$@"
  local text="$1"
  need_reg intents.json
  local I="$REG/intents.json"
  # Evaluate all literal signals inside ONE jq process. The previous loop
  # spawned sed + grep for every signal (136 today), making routing take ~3s.
  # `bounded_contains` preserves the old non-alphanumeric boundary semantics:
  # "add" matches "add endpoint" but never "addressed".
  jq -n --arg text "$text" --slurpfile intents "$I" '
    def bounded_contains($haystack; $needle):
      ($needle | length) as $n
      | any($haystack | indices($needle)[];
          . as $i
          | ($i == 0
             or (($haystack[$i-1:$i] | test("^[[:alnum:]]$")) | not))
            and (($i + $n) == ($haystack | length)
                 or (($haystack[$i+$n:$i+$n+1]
                      | test("^[[:alnum:]]$")) | not)));
    ($text | ascii_downcase) as $lower
    | ([ $intents[0].intents[]
         | select(any(.signals[]?;
             . as $signal
             | bounded_contains($lower; ($signal | ascii_downcase))))
         | {id, title, rules, skills, agents, commands, mcp,
            model_tier, risk_floor, note} ]) as $matches
    | {matches: $matches, ambiguous: (($matches | length) == 0)}'
}

# --------------------------------------------------------------------- model
cmd_model() {
  local work=""
  while [ $# -gt 0 ]; do case "$1" in --work) work="${2:-}"; shift 2 ;; *) err "model: unknown argument $1" ;; esac; done
  [ -n "$work" ] || err "model requires --work <type>"
  need_reg models.json
  local M="$REG/models.json"
  jq -e --arg w "$work" '.work_types[] | select(.id==$w)' "$M" >/dev/null \
    || err "unknown work type: $work (see registries/models.json work_types)"
  jq --arg w "$work" '
    (.work_types[] | select(.id==$w) | .tier) as $t
    | (.tiers[] | select(.id==$t)) as $tier
    | ($tier.escalates_to) as $up
    | {work: $w, tier: $t, model: $tier.model,
       escalates_to: (if $up == null then null
                      else (.tiers[] | select(.id==$up) | {tier: .id, model}) end)}' "$M"
}

# ---------------------------------------------------------------------- risk
# Input: {"inputs": {<input-id>: low|medium|high}, "floors": [<floor-id>]}.
# Tier = max over inputs; any recognized floor forces high. Unknown ids or
# tier values are errors, not silently ignored — a risk resolver that guesses
# around bad input is a fail-open gate. An empty payload (no inputs, no floors)
# is an error for the same reason: absence of evidence is not evidence of low
# risk, and answering "low" there was the same hole one step earlier.
cmd_risk() {
  local signals=""
  while [ $# -gt 0 ]; do case "$1" in --signals) signals="${2:-}"; shift 2 ;; *) err "risk: unknown argument $1" ;; esac; done
  [ -n "$signals" ] || err "risk requires --signals <json>"
  need_reg policy.json
  local P="$REG/policy.json"
  printf '%s' "$signals" | jq -e . >/dev/null 2>&1 || err "risk --signals is not valid JSON"

  local out
  out=$(printf '%s' "$signals" | jq --slurpfile pol "$P" '
    $pol[0] as $p
    | ([$p.risk.inputs[].id]) as $known_inputs
    | ([$p.risk.high_floors[]]) as $known_floors
    | ((.inputs // {}) | to_entries) as $in
    | ((.floors // [])) as $fl
    | if ($in | length) == 0 and ($fl | length) == 0
        then {error: "risk --signals needs a non-empty inputs{} or floors[] — an empty payload is not low risk, it is no evidence"}
      else .
    | ([$in[] | select(.key as $k | $known_inputs | index($k) | not) | .key]) as $bad_in
    | ([$in[] | select(.value | test("^(low|medium|high)$") | not) | .key]) as $bad_val
    | ([$fl[] | select(. as $f | $known_floors | index($f) | not)]) as $bad_fl
    | if ($bad_in | length) > 0 then {error: ("unknown risk input(s): " + ($bad_in | join(", ")))}
      elif ($bad_val | length) > 0 then {error: ("invalid tier value on input(s): " + ($bad_val | join(", ")))}
      elif ($bad_fl | length) > 0 then {error: ("unknown floor(s): " + ($bad_fl | join(", ")))}
      else
        ( if ($fl | length) > 0 then "high"
          elif ([$in[].value] | index("high")) then "high"
          elif ([$in[].value] | index("medium")) then "medium"
          else "low" end ) as $tier
        | {risk: $tier,
           autonomy_ceiling: $p.autonomy.ceiling_by_risk[$tier],
           gates: $p.gates.by_risk[$tier],
           floors_applied: $fl}
      end end')
  if printf '%s' "$out" | jq -e '.error' >/dev/null 2>&1; then
    printf '%s\n' "$out"; exit 1
  fi
  printf '%s\n' "$out"
}

# --------------------------------------------------------------------- gates
cmd_gates() {
  local tier=""
  while [ $# -gt 0 ]; do case "$1" in --risk) tier="${2:-}"; shift 2 ;; *) err "gates: unknown argument $1" ;; esac; done
  case "$tier" in low|medium|high) ;; *) err "gates requires --risk low|medium|high" ;; esac
  need_reg policy.json
  jq --arg t "$tier" '{risk: $t, gates: .gates.by_risk[$t], spec_threshold: .gates.spec_threshold}' "$REG/policy.json"
}

# --------------------------------------------------------------------- retry
# rules/parallelism.md's failure policy as a function: never-retry situations
# first (they escalate to a human on FIRST occurrence), then per-status.
cmd_retry() {
  local status="" attempt="" situation=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --status) status="${2:-}"; shift 2 ;;
      --attempt) attempt="${2:-}"; shift 2 ;;
      --situation) situation="${2:-}"; shift 2 ;;
      *) err "retry: unknown argument $1" ;;
    esac
  done
  [ -n "$status" ] || err "retry requires --status"
  need_reg policy.json
  local P="$REG/policy.json"

  if [ -n "$situation" ]; then
    if jq -e --arg s "$situation" '.retry.never_retry | index($s)' "$P" >/dev/null; then
      jq -n --arg s "$situation" '{action: "never-retry", reason: ("situation \($s) is on the never-retry list — escalate to a human on the first occurrence")}'
      return 0
    fi
    jq -e --arg s "$situation" '.retry.never_retry | index($s) | not' "$P" >/dev/null \
      || err "unknown situation: $situation"
  fi

  case "$status" in
    BLOCKED)  jq -n '{action: "no-retry", reason: "BLOCKED means the input is missing — supply it or drop the unit, never re-sample"}' ;;
    DEGRADED) jq -n '{action: "accept-carry", reason: "accept, carry the caveat into the barrier report, never silently upgrade to OK"}' ;;
    OK)       jq -n '{action: "none", reason: "nothing to retry"}' ;;
    FAILED)
      case "$attempt" in ''|*[!0-9]*) err "retry --status FAILED requires a numeric --attempt" ;; esac
      if [ "$attempt" -le 1 ]; then
        jq -n '{action: "retry-same-tier", reason: "first failure — retry once at the same tier"}'
      elif [ "$attempt" -eq 2 ]; then
        jq -n '{action: "escalate-one-tier", reason: "failed twice — escalate one model tier and retry once; that is the last retry"}'
      else
        jq -n '{action: "stop", reason: "failed at the escalated tier — report the unit incomplete with what was tried"}'
      fi ;;
    *) err "unknown status: $status (OK|DEGRADED|BLOCKED|FAILED)" ;;
  esac
}

cmd_repair() {
  local check="" attempt="" situation=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --check) check="${2:-}"; shift 2 ;;
      --attempt) attempt="${2:-}"; shift 2 ;;
      --situation) situation="${2:-}"; shift 2 ;;
      *) err "repair: unknown argument $1" ;;
    esac
  done
  [ -n "$check" ] || err "repair requires --check"
  need_reg policy.json
  local P="$REG/policy.json"

  jq -e --arg c "$check" '.repair.checks | index($c)' "$P" >/dev/null 2>&1 \
    || err "unknown check: $check (must be one of policy.json.repair.checks)"

  if [ -n "$situation" ]; then
    if jq -e --arg s "$situation" '.repair.never_repair | index($s)' "$P" >/dev/null; then
      jq -n --arg c "$check" --arg s "$situation" '{check: $c, action: "never-repair", reason: ("situation \($s) is on the never-repair list — a fix that weakens the check or changes behavior is not a fix; escalate to a human on the first occurrence")}'
      return 0
    fi
    case "$situation" in
      infra)
        jq -n --arg c "$check" '{check: $c, action: "report-tooling-gap", reason: "the check could not run — that is a tooling gap, not a code defect; report it, consume no fix attempt (hooks/stop-verify.sh: never block on infra quirks)"}'
        return 0 ;;
      flaky)
        jq -n --arg c "$check" '{check: $c, action: "fix-or-delete", reason: "green on re-run with no diff is a broken test, not a pass — fix or delete within the week, never retry-until-green (rules/testing.md)"}'
        return 0 ;;
      *) err "unknown situation: $situation" ;;
    esac
  fi

  case "$attempt" in ''|*[!0-9]*) err "repair (red ladder) requires a numeric --attempt" ;; esac
  local maxfix esc
  maxfix=$(jq -r '.repair.max_fix_attempts_per_check' "$P")
  esc=$(jq -r '.repair.escalations' "$P")
  if [ "$attempt" -lt "$maxfix" ]; then
    jq -n --arg c "$check" '{check: $c, action: "fix-same-tier", reason: "first red — fix and re-run the check at the same tier"}'
  elif [ "$attempt" -lt "$((maxfix + esc))" ]; then
    jq -n --arg c "$check" '{check: $c, action: "escalate-one-tier", reason: "the same check failed twice — escalate one model tier for the fix and re-run once; that is the last attempt (rules/models.md)"}'
  else
    jq -n --arg c "$check" '{check: $c, action: "stop-report-red", reason: "the bound is exhausted — stop, report the check red with what was tried; a loop continued past this point is sampling until it looks right, not fixing (rules/parallelism.md)"}'
  fi
}

# --------------------------------------------------------------------- admit
# Backpressure: may one more unit be dispatched right now? Capacity is
# parallelism.wave_concurrency_cap (never a second copy of the number); the
# queue bound and the overload action live in parallelism.backpressure.
# rules/parallelism.md "Backpressure" is the prose mirror; C24 guards both.
cmd_admit() {
  local inflight="" queued=""
  # A flag whose value is missing must error, never spin: `shift 2` with one
  # argument left fails silently (no set -e), $# never reaches 0, and the same
  # flag re-matches forever. Check before shifting.
  while [ $# -gt 0 ]; do
    case "$1" in
      --inflight) [ $# -ge 2 ] || err "admit requires a value for --inflight"; inflight="$2"; shift 2 ;;
      --queued)   [ $# -ge 2 ] || err "admit requires a value for --queued";   queued="$2";   shift 2 ;;
      *) err "admit: unknown argument $1" ;;
    esac
  done
  case "$inflight" in ''|*[!0-9]*) err "admit requires a numeric --inflight" ;; esac
  case "$queued"   in ''|*[!0-9]*) err "admit requires a numeric --queued" ;; esac
  need_reg policy.json
  # --arg + tonumber, not --argjson: "06" passes the digits-only check above but
  # is not valid JSON, and --argjson would fail inside jq with a parse error on
  # stderr instead of the kernel's {"error": ...} contract on stdout.
  jq -n --arg i "$inflight" --arg q "$queued" --slurpfile pol "$REG/policy.json" '
    ($i | tonumber) as $i
    | ($q | tonumber) as $q
    | $pol[0].parallelism as $par
    | $par.wave_concurrency_cap as $cap
    | $par.backpressure.max_queued_units as $maxq
    | ($cap - $i) as $capacity
    | if $capacity > 0 then
        {action: "dispatch", capacity: $capacity,
         reason: "inflight \($i) below cap \($cap)"}
      elif $q < $maxq then
        {action: $par.backpressure.overload_action, capacity: 0,
         reason: "cap \($cap) reached; \($q) of \($maxq) queued — hold the unit for the next wave"}
      else
        {action: "reject", capacity: 0,
         reason: "cap \($cap) reached and queue full (\($q)/\($maxq)) — stop planning, report BLOCKED, re-plan with a human (hitl: budget-exhausted)"}
      end'
}

# ------------------------------------------------------------------- breaker
# Per-resource circuit breaker. retry (above) asks "try this UNIT again?";
# breaker asks "why are we still calling this RESOURCE?". The orchestrator
# owns the state and the consecutive-failure count (from the exec journal)
# and passes them in — the kernel is the transition table, nothing more.
# rules/parallelism.md "Circuit breaker" is the prose mirror; C25 guards both.
cmd_breaker() {
  local state="" failures="" cooldown="" probe=""
  # Same fail-fast arg discipline as cmd_admit: a flag with no value must error
  # rather than spin. `shift 2` on a single remaining argument fails silently
  # (no set -e), $# never reaches 0, and the flag re-matches forever.
  while [ $# -gt 0 ]; do
    case "$1" in
      --state)            [ $# -ge 2 ] || err "breaker requires a value for --state";            state="$2";    shift 2 ;;
      --failures)         [ $# -ge 2 ] || err "breaker requires a value for --failures";         failures="$2"; shift 2 ;;
      --cooldown-elapsed) [ $# -ge 2 ] || err "breaker requires a value for --cooldown-elapsed"; cooldown="$2"; shift 2 ;;
      --probe-result)     [ $# -ge 2 ] || err "breaker requires a value for --probe-result";     probe="$2";    shift 2 ;;
      *) err "breaker: unknown argument $1" ;;
    esac
  done
  case "$state" in closed|open|half-open) ;; *) err "breaker requires --state closed|open|half-open" ;; esac
  need_reg policy.json
  local P="$REG/policy.json"

  # need_reg proves the FILE exists, not that this block does. Without the
  # guard, $b.failure_threshold is null, jq sorts null below every number, so
  # `0 >= null` is true and a healthy resource is reported open with exit 0 —
  # the fail-open class cmd_risk was fixed for. Same shape as route-escalate's
  # router-block guard.
  jq -e '.breaker' "$P" >/dev/null 2>&1 \
    || err "policy.json has no breaker block — breaker cannot resolve its own policy without it"

  case "$state" in
    closed)
      case "$failures" in ''|*[!0-9]*) err "breaker --state closed requires a numeric --failures" ;; esac
      # --arg + tonumber, not --argjson: "03" passes the digits-only check above
      # but is not valid JSON, and --argjson would fail inside jq with a parse
      # error on stderr instead of the kernel's {"error": ...} contract.
      jq -n --arg f "$failures" --slurpfile pol "$P" '
        ($f | tonumber) as $f
        | $pol[0].breaker as $b
        | if $f >= $b.failure_threshold
          then {state: "open", allow: false,
                reason: "\($f) consecutive failures reached threshold \($b.failure_threshold) — stop calling this resource for \($b.cooldown_waves) wave(s); route around or report DEGRADED"}
          else {state: "closed", allow: true,
                reason: "\($f) of \($b.failure_threshold) failures — resource healthy"} end' ;;
    open)
      case "$cooldown" in true|false) ;; *) err "breaker --state open requires --cooldown-elapsed true|false" ;; esac
      if [ "$cooldown" = true ]; then
        jq -n --slurpfile pol "$P" '{state: "half-open", allow: true,
          reason: "cooldown elapsed — allow \($pol[0].breaker.half_open_probes) probe call(s); no fan-out through this resource until it closes"}'
      else
        jq -n '{state: "open", allow: false, reason: "cooldown not elapsed — do not call; route around or report DEGRADED"}'
      fi ;;
    half-open)
      case "$probe" in ok|failed) ;; *) err "breaker --state half-open requires --probe-result ok|failed" ;; esac
      if [ "$probe" = ok ]; then
        jq -n '{state: "closed", allow: true, reason: "probe succeeded — resource recovered; reset the failure count to 0"}'
      else
        jq -n '{state: "open", allow: false, reason: "probe failed — reopen for another cooldown"}'
      fi ;;
  esac
}

# ---------------------------------------------------------------------- hitl
# Human-in-the-loop as a queryable entity. autonomy.ceiling_by_risk answers
# "how far may this unit go alone"; hitl answers "must a HUMAN decide, and for
# which named reasons" — so a gate produces an auditable record instead of an
# implication drawn from a tier. The reason vocabulary is the closed list in
# policy.hitl.reasons and the emission order below is that list's order; a gate
# may cite nothing else. rules/risk-autonomy.md "Human-in-the-loop" mirrors it.
#
# The four retry.never_retry ids collapse to the single reason
# never-retry-situation — they are the same decision (stop, escalate to a
# human, do not retry); the hitl.situations ids each carry their own reason.
cmd_hitl() {
  local risk="" autonomy="" evidence="adequate" external="false" conflict="false" situation=""
  # Same fail-fast arg discipline as cmd_admit and cmd_breaker: a flag with no
  # value must error rather than spin. `shift 2` on a single remaining argument
  # fails silently (no set -e), $# never reaches 0, and the flag re-matches
  # forever. Check before shifting.
  while [ $# -gt 0 ]; do
    case "$1" in
      --risk)            [ $# -ge 2 ] || err "hitl requires a value for --risk";            risk="$2";      shift 2 ;;
      --autonomy)        [ $# -ge 2 ] || err "hitl requires a value for --autonomy";        autonomy="$2";  shift 2 ;;
      --evidence)        [ $# -ge 2 ] || err "hitl requires a value for --evidence";        evidence="$2";  shift 2 ;;
      --external-effect) [ $# -ge 2 ] || err "hitl requires a value for --external-effect"; external="$2";  shift 2 ;;
      --conflict)        [ $# -ge 2 ] || err "hitl requires a value for --conflict";        conflict="$2";  shift 2 ;;
      --situation)       [ $# -ge 2 ] || err "hitl requires a value for --situation";       situation="$2"; shift 2 ;;
      *) err "hitl: unknown argument $1" ;;
    esac
  done
  case "$risk"     in low|medium|high) ;; *) err "hitl requires --risk low|medium|high" ;; esac
  case "$autonomy" in A0|A1|A2|A3|A4) ;;  *) err "hitl requires --autonomy A0..A4" ;; esac
  case "$evidence" in thin|adequate) ;;   *) err "hitl --evidence must be thin|adequate" ;; esac
  case "$external" in true|false) ;;      *) err "hitl --external-effect must be true|false" ;; esac
  case "$conflict" in true|false) ;;      *) err "hitl --conflict must be true|false" ;; esac
  need_reg policy.json
  local P="$REG/policy.json"

  # need_reg proves the FILE exists, not that this block does. Without the
  # guard, .hitl.record_home is null and the situation allowlist below reduces
  # to `null | index($s)` — so every situation reads as unknown, and any answer
  # that got through would ship a null record_home with exit 0. Fail closed, as
  # cmd_risk and cmd_breaker do.
  jq -e '.hitl' "$P" >/dev/null 2>&1 \
    || err "policy.json has no hitl block — hitl cannot resolve its own reason vocabulary without it"

  # An unknown situation is an error, never an ignored flag: a caller reporting
  # a situation the kernel silently drops would read required:false as "no
  # human needed", when the truth is "the kernel did not understand the input".
  if [ -n "$situation" ]; then
    jq -e --arg s "$situation" '(.retry.never_retry + .hitl.situations) | index($s)' "$P" >/dev/null 2>&1 \
      || err "unknown situation: $situation (one of retry.never_retry or hitl.situations)"
  fi

  jq -n --arg r "$risk" --arg a "$autonomy" --arg e "$evidence" --arg s "$situation" \
        --argjson x "$external" --argjson c "$conflict" --slurpfile pol "$P" '
    $pol[0] as $p
    | ([ (if $r == "high" then "high-risk" else empty end),
         (if $e == "thin" then "evidence-insufficient" else empty end),
         (if $x and ($a == "A3" or $a == "A4") then "external-effect" else empty end),
         (if $c then "policy-conflict" else empty end),
         (if $s != "" and ($p.retry.never_retry | index($s)) then "never-retry-situation" else empty end),
         (if $s == "destructive" then "destructive-action" else empty end),
         (if $s == "budget-exhausted" or $s == "reject" then "budget-exhausted" else empty end),
         (if $s == "breaker-open" then "breaker-open" else empty end) ]) as $reasons
    | {required: (($reasons | length) > 0),
       reasons: $reasons,
       autonomy_after: (if $e == "thin" then "A1" else $a end),
       record_home: $p.hitl.record_home}'
}

# ---------------------------------------------------------------- capability
cmd_capability() {
  require_positional capability "an id" "$@"
  local id="$1"
  need_reg capabilities.json; need_reg models.json
  local C="$REG/capabilities.json" M="$REG/models.json"
  jq -e --arg i "$id" '.capabilities[] | select(.id==$i)' "$C" >/dev/null \
    || err "unknown capability: $id"
  jq --arg i "$id" --slurpfile m "$M" '
    (.capabilities[] | select(.id==$i)) as $c
    | {id: $c.id, agent: $c.agent, model_tier: $c.model_tier,
       model: ($m[0].tiers[] | select(.id==$c.model_tier) | .model),
       risk_floor: ($c.risk_floor // null),
       bound: ($c.agent != null)}' "$C"
}

# --------------------------------------------------------------------- waves
# rules/parallelism.md steps 1-4, mechanically: Kahn-layer the dependency
# graph (cycle = error), flag same-file ownership inside a wave (the "no two
# agents write the same file" hard rule), split any layer larger than the
# policy cap, and emit the announcement line the rules require.
cmd_waves() {
  local units=""
  while [ $# -gt 0 ]; do case "$1" in --units) units="${2:-}"; shift 2 ;; *) err "waves: unknown argument $1" ;; esac; done
  [ -n "$units" ] || err "waves requires --units <json array>"
  need_reg policy.json
  printf '%s' "$units" | jq -e 'type == "array"' >/dev/null 2>&1 || err "waves --units must be a JSON array"

  local out
  out=$(printf '%s' "$units" | jq --slurpfile pol "$REG/policy.json" '
    $pol[0].parallelism.wave_concurrency_cap as $cap
    | . as $units
    | ([.[].id]) as $ids
    | if ($ids | length) != ($ids | unique | length)
        then {error: "duplicate unit ids"}
      elif ([.[] | .depends_on[]? | select(. as $d | $ids | index($d) | not)] | length) > 0
        then {error: ("depends_on references unknown unit(s): " + ([.[] | .depends_on[]? | select(. as $d | $ids | index($d) | not)] | unique | join(", ")))}
      else
        # Kahn layering
        ( def layers($remaining; $done):
            if ($remaining | length) == 0 then []
            else
              ([$remaining[] | select([.depends_on[]?] | all(. as $d | $done | index($d)))]) as $ready
              | if ($ready | length) == 0
                  then error("dependency cycle among: " + ([$remaining[].id] | join(", ")))
                else [$ready] + layers($remaining - $ready; $done + [$ready[].id])
                end
            end;
          layers($units; []) ) as $layers
        # same-file ownership inside a layer violates the disjoint-scope rule
        | ([ $layers[] as $l
             | [ $l[] | .id as $u | (.files[]? | {file: ., unit: $u}) ]
             | group_by(.file) | .[] | select(length > 1)
             | {file: .[0].file, units: [.[].unit]} ]) as $violations
        # cap: split oversized layers in input order
        | ([ $layers[] | . as $l | [range(0; length; $cap)] | map($l[. : . + $cap]) | .[] ]) as $waves
        | {waves: [ $waves[] | [.[].id] ],
           violations: $violations,
           fanout_line: ("[fanout] waves=\($waves | length) " +
             ([$waves | to_entries[] | "wave\(.key + 1)=(\([.value[].id] | join(", ")))"] | join(" ")))}
      end' 2>&1) || {
    # jq error() output carries a "jq: error (at <stdin>:0): " prefix — strip
    # it so the caller sees only the cycle message itself.
    printf '{"error":%s}\n' "$(printf '%s' "$out" | sed 's/^jq: error ([^)]*): //' | jq -Rs .)"
    exit 1
  }
  if printf '%s' "$out" | jq -e '.error' >/dev/null 2>&1; then
    printf '%s\n' "$out"; exit 1
  fi
  printf '%s\n' "$out"
}

# ------------------------------------------------------------ decision-rules
# The keyword tier of the decision engine (was inline in the gate advisor, now
# composed by resolve-task for hooks/prompt-advisor.sh):
# match the prompt against decision-rules.json signal regexes, highest priority
# first. Rules with no signals are model-only by design and never match here.
cmd_decision_rules() {
  local prompt=""
  while [ $# -gt 0 ]; do case "$1" in --prompt) prompt="${2:-}"; shift 2 ;; *) err "decision-rules: unknown argument $1" ;; esac; done
  [ -n "$prompt" ] || err "decision-rules requires --prompt <text>"
  need_reg decision-rules.json
  local D="$REG/decision-rules.json"
  jq --arg prompt "$prompt" '
    ($prompt | ascii_downcase) as $lower
    | ([ .rules | sort_by(-.priority)[]
         | select(.signals != null)
         | select(any(.signals[];
             . as $signal | ($lower | test($signal))))
         | {id, require: (.then.require // []),
            prefer: (.then.prefer // null),
            gate: (.then.gate // null),
            risk: (.then.risk // null)} ]) as $matches
    | {matches: $matches,
       any_high: ([$matches[].risk] | index("high") != null)}' "$D"
}

# --------------------------------------------------------------------- scale
# Big-task / spec-authoring / design-work classification (was hardcoded regexes
# in the task-scale advisor; the EREs now live in policy.json and reach
# hooks/prompt-advisor.sh through resolve-task).
cmd_scale() {
  local prompt=""
  while [ $# -gt 0 ]; do case "$1" in --prompt) prompt="${2:-}"; shift 2 ;; *) err "scale: unknown argument $1" ;; esac; done
  [ -n "$prompt" ] || err "scale requires --prompt <text>"
  need_reg policy.json
  local P="$REG/policy.json"
  local out
  out=$(jq -n --arg prompt "$prompt" --slurpfile pol "$P" '
    ($pol[0].parallelism.prompt_signals // null) as $s
    | if $s == null then
        {error: "policy.json has no parallelism.prompt_signals block"}
      else
        ($prompt | ascii_downcase) as $lower
        | ($lower | test($s.action)) as $action
        | {big_task: ($action and ($lower | test($s.scale))),
           spec_authoring: ($lower | test($s.spec)),
           design_work: (($lower | test($s.design_strong))
                         or ($action and ($lower | test($s.design_weak))))}
      end')
  if printf '%s' "$out" | jq -e '.error' >/dev/null 2>&1; then
    printf '%s\n' "$out"; exit 1
  fi
  printf '%s\n' "$out"
}

# ------------------------------------------------------------- route-escalate
# The condition under which a dispatch plan is needed, per frozen contract 1 of
# docs/specs/2026-08-06-decision-kernel-p3-router-agent.md. Reuses
# cmd_route_intent's matching and cmd_scale's classification (one
# implementation, not two kept in sync), then applies a single, deterministic
# pass of suppression resolution over the raw matched set before aggregating
# model_tier/risk_floor (max by lookup, never a reason to escalate on their
# own) and checking the three trigger reasons. Thresholds and the reason
# vocabulary come from policy.json.router — never hardcoded — and its absence
# is a fail-closed error: a resolver that silently defaults its own policy is
# worse than one that stops.
cmd_route_escalate() {
  local prompt=""
  while [ $# -gt 0 ]; do case "$1" in --prompt) prompt="${2:-}"; shift 2 ;; *) err "route-escalate: unknown argument $1" ;; esac; done
  [ -n "$prompt" ] || err "route-escalate requires --prompt <text>"
  need_reg intents.json; need_reg policy.json; need_reg models.json
  local I="$REG/intents.json" P="$REG/policy.json" M="$REG/models.json"

  jq -e '.router' "$P" >/dev/null 2>&1 \
    || err "policy.json has no router block — route-escalate cannot resolve its own policy without it"

  local raw rc scale
  raw=$(cmd_route_intent "$prompt"); rc=$?
  [ $rc -eq 0 ] || { printf '%s\n' "$raw"; exit 1; }
  scale=$(cmd_scale --prompt "$prompt"); rc=$?
  [ $rc -eq 0 ] || { printf '%s\n' "$scale"; exit 1; }

  jq -n --argjson raw "$raw" --argjson scale "$scale" \
    --slurpfile intents "$I" --slurpfile pol "$P" --slurpfile mod "$M" '
    ($raw.matches | map(.id)) as $ids
    # Re-read suppressible/suppressed_by/requires_dispatch_plan from
    # intents.json directly — route-intent output is P2 public surface and
    # stays byte-identical, so it never carries these P3-only fields.
    | ($intents[0].intents
       | map(select(.id as $i | $ids | index($i) != null))
       | map({id, agents: (.agents // []), model_tier: (.model_tier // null),
              risk_floor: (.risk_floor // null),
              suppressible: (.suppressible == true),
              suppressed_by: (.suppressed_by // []),
              requires_dispatch_plan: (.requires_dispatch_plan == true)})
      ) as $matched
    | ($matched | any(.suppressible | not)) as $has_non_suppressible
    # Single pass, never transitive: drop I when (I.suppressible AND some
    # matched intent is not suppressible) OR (some id in I.suppressed_by is
    # in the raw matched set).
    | ( $matched
        | map(
            if .suppressible and $has_non_suppressible then
              . + {drop: true, by: "more-specific-match"}
            else
              (.suppressed_by | map(select(. as $sid | $ids | index($sid) != null))) as $by_hits
              | if ($by_hits | length) > 0
                  then . + {drop: true, by: $by_hits[0]}
                  else . + {drop: false, by: null}
                end
            end)
      ) as $decided
    | ($decided | map(select(.drop)) | map({id, by})) as $suppressed
    | ($decided | map(select(.drop | not))) as $surviving
    | ($surviving | map(.id)) as $surv_ids
    | ($mod[0].escalation_order) as $tier_order
    | ( $surviving | map(select(.model_tier != null)) | map(.model_tier)
        | if length == 0 then null
          else (map(. as $t | $tier_order | index($t)) | max) as $mi | $tier_order[$mi]
          end
      ) as $model_tier
    | (["low", "medium", "high"]) as $risk_order
    | ( $surviving | map(select(.risk_floor != null)) | map(.risk_floor)
        | if length == 0 then null
          else (map(. as $r | $risk_order | index($r)) | max) as $mi | $risk_order[$mi]
          end
      ) as $risk_floor
    | (reduce ($surviving | map(.agents[]?) | .[]) as $a ([]; if index($a) then . else . + [$a] end)) as $agents
    | ($surviving | map(select((.agents // []) | length > 0)) | length) as $n_agent_intents
    | ($pol[0].router.escalate_when.multi_agent_intents_min) as $multi_min
    | ($pol[0].router.escalate_when.unrouted_scale_signals) as $uscale
    | ($ids | length == 0) as $zero_raw
    | ($uscale | any(. as $s | $scale[$s] == true)) as $scale_hit
    | ($surviving | any(.requires_dispatch_plan)) as $has_dispatch_plan
    | { "multi-agent-dispatch": ($n_agent_intents >= $multi_min),
        "unrouted-scale": ($zero_raw and $scale_hit),
        "requires-dispatch-plan": $has_dispatch_plan
      } as $reason_bools
    | ($pol[0].router.reasons | map(select($reason_bools[.]))) as $reasons
    | { escalate: (($reasons | length) > 0),
        reasons: $reasons,
        intents: $surv_ids,
        suppressed: $suppressed,
        agents: $agents,
        model_tier: $model_tier,
        risk_floor: $risk_floor,
        scale: $scale,
        ambiguous: $raw.ambiguous
      }'
}

# --------------------------------------------------------------- resolve-task
# Deep prompt-resolution interface: one call returns every deterministic fact a
# prompt advisor needs. Policy stays in the existing registries; this function
# composes their answers and hides the multi-call implementation from adapters.
cmd_resolve_task() {
  local prompt=""
  while [ $# -gt 0 ]; do case "$1" in --prompt) prompt="${2:-}"; shift 2 ;; *) err "resolve-task: unknown argument $1" ;; esac; done
  [ -n "$prompt" ] || err "resolve-task requires --prompt <text>"
  need_reg intents.json; need_reg policy.json; need_reg decision-rules.json

  local route decisions rc
  route=$(cmd_route_escalate --prompt "$prompt"); rc=$?
  [ $rc -eq 0 ] || { printf '%s\n' "$route"; exit 1; }
  decisions=$(cmd_decision_rules --prompt "$prompt"); rc=$?
  [ $rc -eq 0 ] || { printf '%s\n' "$decisions"; exit 1; }

  # Human-in-the-loop, folded in so an adapter gets it from the same call
  # instead of deriving a tier and then asking a second question. The floor and
  # the ceiling are the same two values the output object carries below.
  # any_high is passed as --conflict because a decision rule carrying risk=high
  # on a prompt the route scored lower IS the policy conflict a human resolves.
  #
  # A null floor (no domain intent, no matched rule, no scale signal) is not
  # "low risk" — it is no risk evidence, the distinction cmd_risk fails closed
  # on. There is no tier to answer about, so hitl stays null and the advisor's
  # `.hitl.required // false` reads it as "nothing to announce".
  local any_high="" floor="" ceiling="" hitl=null
  any_high=$(printf '%s' "$decisions" | jq -r '.any_high // false')
  if [ "$any_high" = true ]; then
    floor=high
  else
    floor=$(printf '%s' "$route" | jq -r '.risk_floor // empty')
  fi
  if [ -n "$floor" ]; then
    ceiling=$(jq -r --arg t "$floor" '.autonomy.ceiling_by_risk[$t] // empty' "$REG/policy.json")
    [ -n "$ceiling" ] || err "policy.json has no autonomy.ceiling_by_risk[$floor] — resolve-task cannot resolve the ceiling hitl needs"
    if [ "$any_high" = true ]; then
      hitl=$(cmd_hitl --risk "$floor" --autonomy "$ceiling" --conflict true); rc=$?
    else
      hitl=$(cmd_hitl --risk "$floor" --autonomy "$ceiling"); rc=$?
    fi
    # cmd_hitl's err exits its own subshell only, so the status is checked and
    # re-raised here rather than trusted to abort the caller.
    [ $rc -eq 0 ] || { printf '%s\n' "$hitl"; exit 1; }
  fi

  jq -n --arg prompt "$prompt" --argjson route "$route" --argjson decisions "$decisions" \
    --argjson hitl "$hitl" \
    --slurpfile intents "$REG/intents.json" --slurpfile pol "$REG/policy.json" '
    ($route.intents) as $ids
    | ([ $intents[0].intents[]
         | select(.id as $id | $ids | index($id) != null) ]) as $matched
    | (reduce ($matched | map(.rules[]?) | .[]) as $x
        ([]; if index($x) then . else . + [$x] end)) as $rules
    | (reduce ($matched | map(.skills[]?) | .[]) as $x
        ([]; if index($x) then . else . + [$x] end)) as $skills
    | (reduce ($matched | map(.commands[]?) | .[]) as $x
        ([]; if index($x) then . else . + [$x] end)) as $commands
    | (reduce ($matched | map(.mcp[]?) | .[]) as $x
        ([]; if index($x) then . else . + [$x] end)) as $mcp
    | (reduce ($decisions.matches | map(.require[]) | .[]) as $x
        ([]; if index($x) then . else . + [$x] end)) as $required
    | (reduce ($decisions.matches | map(.gate // empty) | .[]) as $x
        ([]; if index($x) then . else . + [$x] end)) as $gates
    | (reduce ($decisions.matches | map(.prefer // empty) | .[]) as $x
        ([]; if index($x) then . else . + [$x] end)) as $preferences
    | (if $decisions.any_high then "high" else $route.risk_floor end) as $floor
    # A prompt can request real work without matching a registered domain
    # ("update this prose"). Reuse the registry-owned action expression as the
    # fallback that keeps such work inside the safety/verification bundle.
    | ((($ids | length) > 0
       or ($decisions.matches | length) > 0
       or ($route.scale | any(.))
       or (($prompt | ascii_downcase)
           | test($pol[0].parallelism.prompt_signals.substantive_action)))) as $substantive
    # This is the closed policy bundle for substantive work. gates references
    # parallelism/risk/verification; parallelism references models/risk/
    # verification. Returning the closure here keeps adapters and router rows
    # from reconstructing it independently.
    | ((if $substantive then
          ["gates", "models", "parallelism", "risk-autonomy", "verification"]
        else [] end)
       + (if ($route.agents | length) > 0
            then ["subagents"] else [] end)
       | unique) as $policy_rules
    | {task_contract:
        {substantive: $substantive,
         intents: $ids,
         escalates: $route.escalate,
         escalation_reasons: $route.reasons,
         suppressed: $route.suppressed,
         agents: $route.agents,
         rules: $rules,
         policy_rules: $policy_rules,
         skills: $skills,
         commands: $commands,
         mcp: $mcp,
         model_tier: $route.model_tier,
         risk_floor: $floor,
         autonomy_ceiling_at_floor:
           (if $floor == null then null
            else $pol[0].autonomy.ceiling_by_risk[$floor] end),
         scale: $route.scale,
         decision_rules: [$decisions.matches[].id],
         required: $required,
         gates: $gates,
         preferences: $preferences},
       route: $route,
       decision_rules: $decisions,
       hitl: (if $hitl == null then null
              else {required: $hitl.required, reasons: $hitl.reasons} end)}'
}

# ---------------------------------------------------------------- dispatcher
cmd="${1:-}"
[ -n "$cmd" ] && shift
case "$cmd" in
  route-path)     cmd_route_path "$@" ;;
  route-intent)   cmd_route_intent "$@" ;;
  model)          cmd_model "$@" ;;
  risk)           cmd_risk "$@" ;;
  gates)          cmd_gates "$@" ;;
  retry)          cmd_retry "$@" ;;
  repair)         cmd_repair "$@" ;;
  admit)          cmd_admit "$@" ;;
  breaker)        cmd_breaker "$@" ;;
  hitl)           cmd_hitl "$@" ;;
  capability)     cmd_capability "$@" ;;
  waves)          cmd_waves "$@" ;;
  decision-rules) cmd_decision_rules "$@" ;;
  scale)          cmd_scale "$@" ;;
  route-escalate) cmd_route_escalate "$@" ;;
  resolve-task)   cmd_resolve_task "$@" ;;
  *) err "usage: kernel.sh {route-path|route-intent|model|risk|gates|retry|repair|admit|breaker|hitl|capability|waves|decision-rules|scale|route-escalate|resolve-task} ..." ;;
esac
