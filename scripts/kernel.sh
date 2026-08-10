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
#   kernel.sh capability <id>
#   kernel.sh waves --units <json>
#   kernel.sh decision-rules --prompt <text>
#   kernel.sh scale --prompt <text>
#   kernel.sh route-escalate --prompt <text>
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
# wins — the same first-match-wins semantics as the case ladder this replaces
# (hooks/routing-map.sh, now a shim over this). Glob matching uses bash case
# with unquoted pattern expansion: the same engine, patterns now registry data.
cmd_route_path() {
  require_positional route-path "a file path" "$@"
  local f="$1"
  need_reg routing.json
  local R="$REG/routing.json"
  local base="${f##*/}" norm="/$f"

  # EngineOS-self exclusion is runtime-relative (this checkout's own hooks/
  # and docs/ trees), so it stays code, not registry data.
  case "$f" in
    "$ROOT/hooks"/*|"$ROOT/docs"/*)
      jq -n '{domain: null, excluded: true}'; return 0 ;;
  esac
  local p
  while IFS= read -r p; do
    # shellcheck disable=SC2254  # unquoted on purpose: $p is a glob pattern
    case "$norm" in $p) jq -n '{domain: null, excluded: true}'; return 0 ;; esac
  done < <(jq -r '.excluded.paths[]?' "$R")
  while IFS= read -r p; do
    # shellcheck disable=SC2254
    case "$base" in $p) jq -n '{domain: null, excluded: true}'; return 0 ;; esac
  done < <(jq -r '.excluded.basenames[]?' "$R")

  local dom typ pat hit=""
  while IFS=$'\t' read -r dom typ pat; do
    case "$typ" in
      # shellcheck disable=SC2254
      path) case "$norm" in $pat) hit="$dom"; break ;; esac ;;
      # shellcheck disable=SC2254
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
  local lower id sig esc matched=""
  lower=$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]')

  while IFS=$'\t' read -r id sig; do
    [ -z "$id" ] && continue
    case " $matched " in *" $id "*) continue ;; esac
    # Signals are literal phrases, not regexes — escape ERE metacharacters,
    # then bound on non-alphanumerics so "add" never matches "addressed".
    esc=$(printf '%s' "$sig" | sed 's/[][\.|$(){}?+*^\\]/\\&/g')
    if printf '%s' "$lower" | grep -qiE "(^|[^[:alnum:]])${esc}([^[:alnum:]]|$)"; then
      matched="$matched $id"
    fi
  done < <(jq -r '.intents[] | .id as $i | .signals[]? | "\($i)\t\(.)"' "$I")

  local ids_json
  ids_json=$(printf '%s\n' $matched | jq -R . | jq -s 'map(select(length > 0))')
  jq --argjson ids "$ids_json" '
    {matches: [ $ids[] as $id | .intents[] | select(.id==$id)
                | {id, title, rules, skills, agents, commands, mcp, model_tier, risk_floor, note} ],
     ambiguous: (($ids | length) == 0)}' "$I"
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
# around bad input is a fail-open gate.
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
          elif ($in | length) > 0 then "low"
          else "low" end ) as $tier
        | {risk: $tier,
           autonomy_ceiling: $p.autonomy.ceiling_by_risk[$tier],
           gates: $p.gates.by_risk[$tier],
           floors_applied: $fl}
      end')
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
# The keyword tier of the decision engine (was inline in hooks/gate-advisor.sh):
# match the prompt against decision-rules.json signal regexes, highest priority
# first. Rules with no signals are model-only by design and never match here.
cmd_decision_rules() {
  local prompt=""
  while [ $# -gt 0 ]; do case "$1" in --prompt) prompt="${2:-}"; shift 2 ;; *) err "decision-rules: unknown argument $1" ;; esac; done
  [ -n "$prompt" ] || err "decision-rules requires --prompt <text>"
  need_reg decision-rules.json
  local D="$REG/decision-rules.json"
  local lower id sig matched=""
  lower=$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')

  # Raw interpolation, NOT @tsv: @tsv escapes backslashes, which turns every
  # \b word boundary in the signal patterns into \\b and they stop matching.
  while IFS=$'\t' read -r id sig; do
    [ -z "$id" ] && continue
    printf '%s' "$lower" | grep -qE "$sig" || continue
    case " $matched " in *" $id "*) continue ;; esac
    matched="$matched $id"
  done < <(jq -r '.rules | sort_by(-.priority) | .[] | select(.signals != null) | . as $r | .signals[] | "\($r.id)\t\(.)"' "$D")

  local ids_json
  ids_json=$(printf '%s\n' $matched | jq -R . | jq -s 'map(select(length > 0))')
  jq --argjson ids "$ids_json" '
    {matches: [ $ids[] as $id | .rules[] | select(.id==$id)
                | {id, require: (.then.require // []), prefer: (.then.prefer // null),
                   gate: (.then.gate // null), risk: (.then.risk // null)} ],
     any_high: ([ $ids[] as $id | .rules[] | select(.id==$id) | .then.risk ] | index("high") != null)}' "$D"
}

# --------------------------------------------------------------------- scale
# Big-task / spec-authoring / design-work classification (was hardcoded regexes
# in hooks/task-scale-advisor.sh; the EREs now live in policy.json).
cmd_scale() {
  local prompt=""
  while [ $# -gt 0 ]; do case "$1" in --prompt) prompt="${2:-}"; shift 2 ;; *) err "scale: unknown argument $1" ;; esac; done
  [ -n "$prompt" ] || err "scale requires --prompt <text>"
  need_reg policy.json
  local P="$REG/policy.json"
  local lower a s sp ds dw
  lower=$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')
  has() { printf '%s' "$lower" | grep -qE "$1"; }

  a=$(jq -r '.parallelism.prompt_signals.action' "$P")
  s=$(jq -r '.parallelism.prompt_signals.scale' "$P")
  sp=$(jq -r '.parallelism.prompt_signals.spec' "$P")
  ds=$(jq -r '.parallelism.prompt_signals.design_strong' "$P")
  dw=$(jq -r '.parallelism.prompt_signals.design_weak' "$P")
  [ "$a" = "null" ] && err "policy.json has no parallelism.prompt_signals block"

  local big=false spec=false design=false
  has "$a" && has "$s" && big=true
  has "$sp" && spec=true
  { has "$ds" || { has "$dw" && has "$a"; }; } && design=true

  jq -n --argjson b "$big" --argjson sp "$spec" --argjson d "$design" \
    '{big_task: $b, spec_authoring: $sp, design_work: $d}'
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
  capability)     cmd_capability "$@" ;;
  waves)          cmd_waves "$@" ;;
  decision-rules) cmd_decision_rules "$@" ;;
  scale)          cmd_scale "$@" ;;
  route-escalate) cmd_route_escalate "$@" ;;
  *) err "usage: kernel.sh {route-path|route-intent|model|risk|gates|retry|repair|capability|waves|decision-rules|scale|route-escalate} ..." ;;
esac
