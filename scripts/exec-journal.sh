#!/usr/bin/env bash
# EngineOS — the Phase 1 execution-journal schema, as an append/read CLI.
#
# This is a schema contract, not a running service: EngineOS itself has no
# agent-dispatch loop to instrument (Claude Code dispatches agents directly,
# not this repo's own code). The deliverable is one JSONL shape both a kernel
# consumer (e.g. the ai-se-os headless runner) and any future in-kernel
# instrumentation write to, so the two join without translation.
#
# Schema (one JSON object per line):
#   timestamp     ISO-8601 string, when the entry was appended
#   run_id        string, groups entries from the same run
#   capability_id string, matches an id in registries/capabilities.json
#   agent         string or null, matches an agent name in registries/agents.json
#   model_tier    string, one of rules/models.md's four tier names
#   status        "OK" | "BLOCKED" | "FAILED" | "DEGRADED" — the kernel's own
#                 return-envelope vocabulary (rules/parallelism.md), never a
#                 second status vocabulary
#   tokens_in     non-negative integer
#   tokens_out    non-negative integer
#   duration_ms   non-negative integer
#   note          string or null, the ONE field that admits free text (below)
#
# Span fields (optional, v2) — one session is one trace, and every dispatched
# agent, router decision and verification gate is a span in it
# (rules/observability.md "Agent traces"). A v1 line carries none of these keys
# at all and stays valid forever; backward compatibility is the contract:
#   trace_id       (optional, v2) slug, the session id — groups a whole session
#   span_id        (optional, v2) slug, the harness tool-use id where there is one
#   parent_span_id (optional, v2) slug, the enclosing span
#   span_kind      (optional, v2) one of VALID_SPAN_KINDS below
#   tool           (optional, v2) slug, the tool a `tool` span called
#   provider       (optional, v2) slug, the model provider
#   model          (optional, v2) slug, the concrete model id
#   cost_micros    (optional, v2) non-negative integer micro-USD, absent when unknown
#   retry_attempt  (optional, v2) non-negative integer, 0 for the first try
#   cache_hit      (optional, v2) boolean
#   route          (optional, v2) slug, the routed intent id
#   risk           (optional, v2) one of VALID_RISKS below
#
# CONTAINMENT — stated the same way here, in registries/policy.json
# telemetry.exec_journal.note and in rules/observability.md "Agent traces":
#
#   Every field except `note` is a slug (SLUG_RE below, the same no-whitespace
#   class as registries/policy.json telemetry.value_pattern), and the validator
#   rejects a line where one of them is not. `note` is the single field that
#   admits text, so a consumer forwarding this journal must treat `note` — and
#   only `note` — as untrusted. Every value, `note` included, is capped at
#   telemetry.exec_journal.max_value_length characters on append; over-long is a
#   reject, never a truncation, because a truncated value that still validates
#   is the same unbounded-input bug with the evidence removed.
#
#   The two write boundaries differ on purpose, and the difference IS the claim.
#   This CLI REJECTS a non-slug value. The hooks SANITIZE first
#   (hooks/lib-common.sh hook_slug maps every other character to '-') so that a
#   span is recorded rather than lost, so a harness-supplied value's characters
#   still transit, dash-joined: `SECRET=hunter2 x` lands as `SECRET-hunter2-x`.
#   What the guard buys is that no field but `note` can carry whitespace, a
#   newline, a quote or a control character — so nothing written through one can
#   break the line format, smuggle a second JSON object or span two lines — and
#   that every value is length-bounded. It bounds the SHAPE and the SIZE of what
#   reaches disk; it does not classify the content. Saying otherwise is the same
#   false-containment bug the paragraph below describes, in a new coat.
#
# An earlier version scoped the slug claim to the v2 fields only, which left
# run_id, capability_id and agent as a working prompt-text-and-credential
# channel to disk while three prose homes claimed no such field existed. Adding
# another free-text field is a compatibility event (docs/COMPATIBILITY.md),
# never a convenience.
#
# Validates shape, the enumerated/numeric constraints and the slug class only —
# it does NOT check capability_id against capabilities.json or agent against
# agents.json; that would make this a registry-aware service rather than a
# schema contract. The length bound is read from policy.json rather than
# hardcoded, which is a number with one home, not a registry lookup.
#
# Usage:
#   scripts/exec-journal.sh append <journal-file> \
#     --run-id ID --capability-id ID [--agent NAME] --model-tier TIER \
#     --status OK|BLOCKED|FAILED|DEGRADED --tokens-in N --tokens-out N \
#     --duration-ms N [--note TEXT] [--timestamp ISO8601] \
#     [--trace-id ID] [--span-id ID] [--parent-span-id ID] [--span-kind KIND] \
#     [--tool NAME] [--provider NAME] [--model NAME] [--cost-micros N] \
#     [--retry-attempt N] [--cache-hit true|false] [--route ID] [--risk TIER]
#   scripts/exec-journal.sh validate <journal-file>
set -euo pipefail

VALID_STATUSES="OK BLOCKED FAILED DEGRADED"
# Hyphenated slug of rules/models.md's tier names (its "most capable" table
# cell has a space; a space-containing token would silently break in_list's
# word-splitting for-loop below, so the identifier form is always hyphenated).
VALID_TIERS="cheap build design most-capable"
# The span vocabulary. Mirrored in registries/policy.json telemetry.exec_journal
# (span_kinds) and checked against this constant by validate-engineos.sh C27a,
# so the two cannot be renamed apart.
VALID_SPAN_KINDS="router coordinator agent tool model verification"
VALID_RISKS="low medium high"
# Same no-whitespace class as registries/policy.json telemetry.value_pattern:
# no free-text field may be added to a span without a deprecation (docs/COMPATIBILITY.md).
SLUG_RE='^[A-Za-z0-9@_./:-]+$'
# Per-value length bound. The NUMBER lives in registries/policy.json
# telemetry.exec_journal.max_value_length so the prose can quote one home;
# MAX_VALUE_LEN_FALLBACK is what this CLI uses when that file is unreadable,
# because a schema contract must still run standalone. validate-engineos.sh
# C27a asserts the registry value equals this constant, so they cannot drift.
MAX_VALUE_LEN_FALLBACK="256"
EJ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  echo "usage: $0 append <file> --run-id ID --capability-id ID [--agent NAME] --model-tier TIER --status STATUS --tokens-in N --tokens-out N --duration-ms N [--note TEXT] [--timestamp TS] [--trace-id ID] [--span-id ID] [--parent-span-id ID] [--span-kind KIND] [--tool NAME] [--provider NAME] [--model NAME] [--cost-micros N] [--retry-attempt N] [--cache-hit true|false] [--route ID] [--risk TIER]" >&2
  echo "       $0 validate <file>" >&2
  exit 1
}

in_list() { # value, space-separated list -> 0 if present
  local v="$1" item
  for item in $2; do [ "$item" = "$v" ] && return 0; done
  return 1
}

# is_nonneg_int <value> -> 0 if value is all digits (rejects negatives,
# fractions, empty strings and anything non-numeric — a leading '-' or a '.'
# is not in [0-9], so both are caught).
is_nonneg_int() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

# is_slug <value> -> 0 when value is a non-empty run of SLUG_RE's character
# class. Implemented as a shell pattern rather than `grep -E "$SLUG_RE"`
# deliberately: grep matches LINE by line, so a value containing a newline would
# pass on the strength of one clean line and carry arbitrary text — prompt text,
# a file body, a PII value — through on the next. The whole point of the class is
# that no span field admits whitespace, and a newline is whitespace.
is_slug() {
  case "$1" in
    ''|*[!A-Za-z0-9@_./:-]*) return 1 ;;
    *) return 0 ;;
  esac
}

# check_slug_flag <flag-name> <set-flag> <value> -> no-op when the flag was not
# given, otherwise aborts unless the value is a slug. Every string flag except
# --note and --timestamp shares this body; spelling it out per flag is how
# --agent silently lost its guard while three prose homes claimed it had one.
check_slug_flag() {
  [ "$2" = 1 ] || return 0
  is_slug "$3" || { echo "$1 must match $SLUG_RE, got: $3" >&2; exit 1; }
}

# check_len <flag-name> <value> -> aborts when the value is longer than
# MAX_VALUE_LEN. Called once for every flag value in the parse loop, so a new
# flag is bounded the moment it is added rather than when someone remembers.
check_len() {
  [ "${#2}" -le "$MAX_VALUE_LEN" ] \
    || { echo "$1 must be at most $MAX_VALUE_LEN characters, got ${#2}" >&2; exit 1; }
}

# max_value_len -> the bound, from the registry, falling back to this file's own
# constant when policy.json is absent or the field is not a positive integer.
max_value_len() {
  local v
  v=$(jq -r '.telemetry.exec_journal.max_value_length // empty' \
    "$EJ_ROOT/registries/policy.json" 2>/dev/null)
  case "$v" in ''|*[!0-9]*|0) v="$MAX_VALUE_LEN_FALLBACK" ;; esac
  printf '%s' "$v"
}

cmd_append() {
  local file="$1"; shift
  command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }
  MAX_VALUE_LEN=$(max_value_len)

  local run_id="" capability_id="" agent_val="" agent_set=0 model_tier="" status=""
  local tokens_in="" tokens_out="" duration_ms="" note_val="" note_set=0 timestamp=""
  # v2 span fields: each carries its own _set flag so an absent field is a key
  # that never appears, not a key holding null — a v1 line stays byte-identical.
  local trace_id_val="" trace_id_set=0 span_id_val="" span_id_set=0
  local parent_span_id_val="" parent_span_id_set=0 span_kind_val="" span_kind_set=0
  local tool_val="" tool_set=0 provider_val="" provider_set=0 model_val="" model_set=0
  local cost_micros_val="" cost_micros_set=0 retry_attempt_val="" retry_attempt_set=0
  local cache_hit_val="" cache_hit_set=0 route_val="" route_set=0 risk_val="" risk_set=0

  while [ $# -gt 0 ]; do
    # Every flag below takes a value — a flag as the last argument (no value
    # following) would otherwise read an unset $2 and abort under `set -u`
    # instead of hitting usage()'s field-completeness check.
    [ $# -ge 2 ] || usage
    # Bounded before it is stored, so no field — slug, enum, number or note —
    # can turn a 200KB harness value into a 200KB journal line.
    check_len "$1" "$2"
    case "$1" in
      --run-id) run_id="$2"; shift 2 ;;
      --capability-id) capability_id="$2"; shift 2 ;;
      --agent) agent_val="$2"; agent_set=1; shift 2 ;;
      --model-tier) model_tier="$2"; shift 2 ;;
      --status) status="$2"; shift 2 ;;
      --tokens-in) tokens_in="$2"; shift 2 ;;
      --tokens-out) tokens_out="$2"; shift 2 ;;
      --duration-ms) duration_ms="$2"; shift 2 ;;
      --note) note_val="$2"; note_set=1; shift 2 ;;
      --timestamp) timestamp="$2"; shift 2 ;;
      --trace-id) trace_id_val="$2"; trace_id_set=1; shift 2 ;;
      --span-id) span_id_val="$2"; span_id_set=1; shift 2 ;;
      --parent-span-id) parent_span_id_val="$2"; parent_span_id_set=1; shift 2 ;;
      --span-kind) span_kind_val="$2"; span_kind_set=1; shift 2 ;;
      --tool) tool_val="$2"; tool_set=1; shift 2 ;;
      --provider) provider_val="$2"; provider_set=1; shift 2 ;;
      --model) model_val="$2"; model_set=1; shift 2 ;;
      --cost-micros) cost_micros_val="$2"; cost_micros_set=1; shift 2 ;;
      --retry-attempt) retry_attempt_val="$2"; retry_attempt_set=1; shift 2 ;;
      --cache-hit) cache_hit_val="$2"; cache_hit_set=1; shift 2 ;;
      --route) route_val="$2"; route_set=1; shift 2 ;;
      --risk) risk_val="$2"; risk_set=1; shift 2 ;;
      *) echo "unknown arg: $1" >&2; usage ;;
    esac
  done

  [ -n "$run_id" ] && [ -n "$capability_id" ] && [ -n "$model_tier" ] && [ -n "$status" ] \
    && [ -n "$tokens_in" ] && [ -n "$tokens_out" ] && [ -n "$duration_ms" ] || usage

  in_list "$status" "$VALID_STATUSES" || { echo "invalid status: $status (must be one of: $VALID_STATUSES)" >&2; exit 1; }
  in_list "$model_tier" "$VALID_TIERS" || { echo "invalid model_tier: $model_tier (must be one of: $VALID_TIERS)" >&2; exit 1; }
  is_nonneg_int "$tokens_in"    || { echo "--tokens-in must be a non-negative integer, got: $tokens_in" >&2; exit 1; }
  is_nonneg_int "$tokens_out"   || { echo "--tokens-out must be a non-negative integer, got: $tokens_out" >&2; exit 1; }
  is_nonneg_int "$duration_ms" || { echo "--duration-ms must be a non-negative integer, got: $duration_ms" >&2; exit 1; }

  # v2 validation. Enumerated fields go through in_list, numbers through
  # is_nonneg_int and every remaining string through is_slug — so there is no v2
  # flag whose value can carry a space. A field left unset is neither validated
  # nor emitted. Written as `if` blocks, not `[ ... ] && { ... }`: under this
  # file's `set -e` a false one-liner is the last command of the function and
  # would exit 1 on the ordinary "flag not given" path.
  if [ "$span_kind_set" = 1 ]; then
    in_list "$span_kind_val" "$VALID_SPAN_KINDS" || { echo "invalid span_kind: $span_kind_val (must be one of: $VALID_SPAN_KINDS)" >&2; exit 1; }
  fi
  if [ "$risk_set" = 1 ]; then
    in_list "$risk_val" "$VALID_RISKS" || { echo "invalid risk: $risk_val (must be one of: $VALID_RISKS)" >&2; exit 1; }
  fi
  if [ "$cache_hit_set" = 1 ]; then
    in_list "$cache_hit_val" "true false" || { echo "--cache-hit must be true or false, got: $cache_hit_val" >&2; exit 1; }
  fi
  if [ "$cost_micros_set" = 1 ]; then
    is_nonneg_int "$cost_micros_val" || { echo "--cost-micros must be a non-negative integer, got: $cost_micros_val" >&2; exit 1; }
  fi
  if [ "$retry_attempt_set" = 1 ]; then
    is_nonneg_int "$retry_attempt_val" || { echo "--retry-attempt must be a non-negative integer, got: $retry_attempt_val" >&2; exit 1; }
  fi
  # run_id, capability_id and agent are IDENTIFIER fields by nature and get the
  # same guard as the v2 strings. This TIGHTENS the schema: a value with a space
  # in it used to be accepted here and to pass validate. That was the hole the
  # containment claim above denied having.
  check_slug_flag --run-id         1                     "$run_id"
  check_slug_flag --capability-id  1                     "$capability_id"
  check_slug_flag --agent          "$agent_set"          "$agent_val"
  check_slug_flag --trace-id       "$trace_id_set"       "$trace_id_val"
  check_slug_flag --span-id        "$span_id_set"        "$span_id_val"
  check_slug_flag --parent-span-id "$parent_span_id_set" "$parent_span_id_val"
  check_slug_flag --tool           "$tool_set"           "$tool_val"
  check_slug_flag --provider       "$provider_set"       "$provider_val"
  check_slug_flag --model          "$model_set"          "$model_val"
  check_slug_flag --route          "$route_set"          "$route_val"

  [ -n "$timestamp" ] || timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # agent/note go through --arg (jq's own escaping), never hand-built into a
  # JSON literal — a raw value containing a quote or a backslash-escape
  # sequence would otherwise break or silently corrupt the entry.
  #
  # The two numeric v2 fields come in through --arg + tonumber, not --argjson:
  # is_nonneg_int accepts "03", which is a digit string but not valid JSON, and
  # --argjson would abort inside jq on stderr instead of reaching the guard
  # above. Every v2 key whose _set flag is 0 is dropped entirely by
  # with_entries, so a v1 line is byte-identical to what v1 wrote — agent and
  # note keep their explicit nulls because v1 always emitted those two keys.
  jq -nc \
    --arg timestamp "$timestamp" --arg run_id "$run_id" --arg capability_id "$capability_id" \
    --arg model_tier "$model_tier" --arg status "$status" \
    --arg agent_val "$agent_val" --argjson agent_set "$agent_set" \
    --arg note_val "$note_val" --argjson note_set "$note_set" \
    --argjson tokens_in "$tokens_in" --argjson tokens_out "$tokens_out" --argjson duration_ms "$duration_ms" \
    --arg trace_id_val "$trace_id_val" --argjson trace_id_set "$trace_id_set" \
    --arg span_id_val "$span_id_val" --argjson span_id_set "$span_id_set" \
    --arg parent_span_id_val "$parent_span_id_val" --argjson parent_span_id_set "$parent_span_id_set" \
    --arg span_kind_val "$span_kind_val" --argjson span_kind_set "$span_kind_set" \
    --arg tool_val "$tool_val" --argjson tool_set "$tool_set" \
    --arg provider_val "$provider_val" --argjson provider_set "$provider_set" \
    --arg model_val "$model_val" --argjson model_set "$model_set" \
    --arg cost_micros_val "$cost_micros_val" --argjson cost_micros_set "$cost_micros_set" \
    --arg retry_attempt_val "$retry_attempt_val" --argjson retry_attempt_set "$retry_attempt_set" \
    --arg cache_hit_val "$cache_hit_val" --argjson cache_hit_set "$cache_hit_set" \
    --arg route_val "$route_val" --argjson route_set "$route_set" \
    --arg risk_val "$risk_val" --argjson risk_set "$risk_set" \
    '{timestamp: $timestamp, run_id: $run_id, capability_id: $capability_id,
      agent: (if $agent_set == 1 then $agent_val else null end),
      model_tier: $model_tier, status: $status,
      tokens_in: $tokens_in, tokens_out: $tokens_out, duration_ms: $duration_ms,
      note: (if $note_set == 1 then $note_val else null end),
      trace_id: (if $trace_id_set == 1 then $trace_id_val else null end),
      span_id: (if $span_id_set == 1 then $span_id_val else null end),
      parent_span_id: (if $parent_span_id_set == 1 then $parent_span_id_val else null end),
      span_kind: (if $span_kind_set == 1 then $span_kind_val else null end),
      tool: (if $tool_set == 1 then $tool_val else null end),
      provider: (if $provider_set == 1 then $provider_val else null end),
      model: (if $model_set == 1 then $model_val else null end),
      cost_micros: (if $cost_micros_set == 1 then ($cost_micros_val | tonumber) else null end),
      retry_attempt: (if $retry_attempt_set == 1 then ($retry_attempt_val | tonumber) else null end),
      cache_hit: (if $cache_hit_set == 1 then ($cache_hit_val == "true") else null end),
      route: (if $route_set == 1 then $route_val else null end),
      risk: (if $risk_set == 1 then $risk_val else null end)}
     | with_entries(select(.value != null or (.key | IN("agent","note"))))' \
    >> "$file"
}

cmd_validate() {
  local file="$1"
  command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }
  [ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }

  local line_no=0 bad=0
  # `|| [ -n "$line" ]` picks up a final line with no trailing newline — plain
  # `read` returns non-zero at EOF on such a line even though it populated
  # $line, so a bare `while read` loop would silently skip it.
  while IFS= read -r line || [ -n "$line" ]; do
    line_no=$((line_no + 1))
    [ -z "$line" ] && continue
    if ! printf '%s' "$line" | jq -e '
        def is_nonneg_int: type == "number" and . >= 0 and (. | floor) == .;
        (.timestamp | type) == "string" and
        (.run_id | type) == "string" and
        (.capability_id | type) == "string" and
        (.model_tier | type) == "string" and
        (.status | type) == "string" and
        (.tokens_in | is_nonneg_int) and
        (.tokens_out | is_nonneg_int) and
        (.duration_ms | is_nonneg_int) and
        # v2 span fields. Each defaults to a value that passes, so a v1 line
        # carrying none of these keys validates exactly as it did before.
        ((.span_kind // "router") | IN("router","coordinator","agent","tool","model","verification")) and
        ((.risk // "low") | IN("low","medium","high")) and
        ((.cost_micros // 0) | is_nonneg_int) and
        ((.retry_attempt // 0) | is_nonneg_int) and
        ((.cache_hit // false) | type == "boolean") and
        # Every string field EXCEPT note. `all`, not a bare generator: `X and
        # (gen)` emits one result per gen output and `jq -e` reports only the
        # LAST, so a bad run_id followed by a good route would validate.
        # Anchored with \z rather than $ because Oniguruma matches $ before a
        # trailing newline too, and a trailing newline is exactly the whitespace
        # this class forbids. note is absent from the list on purpose: it is the
        # one documented free-text field, and a consumer treats it as untrusted.
        ([.run_id, .capability_id, .agent,
          .trace_id, .span_id, .parent_span_id, .tool, .provider, .model, .route]
          | all(. == null or ((type == "string") and test("^[A-Za-z0-9@_./:-]+\\z"))))' >/dev/null 2>&1; then
      echo "line $line_no: does not match the exec-journal schema" >&2
      bad=$((bad + 1))
    fi
  done < "$file"

  [ "$bad" -eq 0 ] || { echo "$bad invalid line(s) in $file" >&2; exit 1; }
  echo "$file: $line_no line(s), all valid"
}

case "${1:-}" in
  append) shift; cmd_append "$@" ;;
  validate) shift; cmd_validate "$@" ;;
  *) usage ;;
esac
