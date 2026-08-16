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
#   note          string or null, optional free text
#
# Validates shape and these enumerated/numeric constraints only — it does NOT
# check capability_id against capabilities.json or agent against agents.json;
# that would make this a registry-aware service rather than a schema contract.
#
# Usage:
#   scripts/exec-journal.sh append <journal-file> \
#     --run-id ID --capability-id ID [--agent NAME] --model-tier TIER \
#     --status OK|BLOCKED|FAILED|DEGRADED --tokens-in N --tokens-out N \
#     --duration-ms N [--note TEXT] [--timestamp ISO8601]
#   scripts/exec-journal.sh validate <journal-file>
set -euo pipefail

VALID_STATUSES="OK BLOCKED FAILED DEGRADED"
# Hyphenated slug of rules/models.md's tier names (its "most capable" table
# cell has a space; a space-containing token would silently break in_list's
# word-splitting for-loop below, so the identifier form is always hyphenated).
VALID_TIERS="cheap build design most-capable"

usage() {
  echo "usage: $0 append <file> --run-id ID --capability-id ID [--agent NAME] --model-tier TIER --status STATUS --tokens-in N --tokens-out N --duration-ms N [--note TEXT] [--timestamp TS]" >&2
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

cmd_append() {
  local file="$1"; shift
  command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }

  local run_id="" capability_id="" agent_val="" agent_set=0 model_tier="" status=""
  local tokens_in="" tokens_out="" duration_ms="" note_val="" note_set=0 timestamp=""

  while [ $# -gt 0 ]; do
    # Every flag below takes a value — a flag as the last argument (no value
    # following) would otherwise read an unset $2 and abort under `set -u`
    # instead of hitting usage()'s field-completeness check.
    [ $# -ge 2 ] || usage
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
  [ -n "$timestamp" ] || timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # agent/note go through --arg (jq's own escaping), never hand-built into a
  # JSON literal — a raw value containing a quote or a backslash-escape
  # sequence would otherwise break or silently corrupt the entry.
  jq -nc \
    --arg timestamp "$timestamp" --arg run_id "$run_id" --arg capability_id "$capability_id" \
    --arg model_tier "$model_tier" --arg status "$status" \
    --arg agent_val "$agent_val" --argjson agent_set "$agent_set" \
    --arg note_val "$note_val" --argjson note_set "$note_set" \
    --argjson tokens_in "$tokens_in" --argjson tokens_out "$tokens_out" --argjson duration_ms "$duration_ms" \
    '{timestamp: $timestamp, run_id: $run_id, capability_id: $capability_id,
      agent: (if $agent_set == 1 then $agent_val else null end),
      model_tier: $model_tier, status: $status,
      tokens_in: $tokens_in, tokens_out: $tokens_out, duration_ms: $duration_ms,
      note: (if $note_set == 1 then $note_val else null end)}' \
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
        (.duration_ms | is_nonneg_int)' >/dev/null 2>&1; then
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
