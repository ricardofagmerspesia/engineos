#!/usr/bin/env bash
# EngineOS — kernel-decision event capture, as an append/validate CLI.
#
# Registry-driven, fail-closed: the event enum, per-event key sets, and the
# anti-prompt-text value pattern are read from registries/policy.json's
# telemetry block at call time. Deliberately parallel to (never merged with)
# scripts/exec-journal.sh — that schema is per-capability-dispatch run
# accounting for the ai-se-os runner; this one is hook-side kernel-decision
# events. Different subjects, different fields, one CLI shape.
#
# Schema (one JSON object per line):
#   ts          ISO-8601 string, when the entry was appended
#   session_id  string
#   event       string, an id in registries/policy.json's telemetry.events
#   data        flat object whose keys are a subset of that event's `keys`;
#               every value is a boolean, a number, or a string/array-of-
#               strings matching telemetry.value_pattern (no whitespace class
#               — this is the structural guard against prompt text ever
#               entering the store, not a discipline one).
#
# Usage:
#   scripts/telemetry.sh append <file> --session <sid> --event <id> --data <json> [--ts <iso8601>]
#   scripts/telemetry.sh validate <file>
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
POLICY="$DIR/registries/policy.json"

usage() {
  echo "usage: $0 append <file> --session SID --event ID --data JSON [--ts TS]" >&2
  echo "       $0 validate <file>" >&2
  exit 1
}

err() { # <message> -> {"error": message} on stdout, exit 1
  jq -n --arg m "$1" '{error: $m}'
  exit 1
}

need_jq() { command -v jq >/dev/null 2>&1 || { echo '{"error":"jq required"}'; exit 1; }; }

# validate_data <event_id> <data_json> -> 0 if data's keys are a subset of the
# event's registry keys and every value obeys the shape/pattern rule.
validate_data() {
  local event="$1" data="$2"
  jq -n -e --arg e "$event" --argjson d "$data" --slurpfile p "$POLICY" '
    ($p[0].telemetry.events[] | select(.id == $e) | .keys) as $keys
    | ($p[0].telemetry.value_pattern) as $pat
    | ($d | type) == "object"
    and (($d | keys) - $keys | length) == 0
    and (
      $d | to_entries | all(.[]; .value as $v |
        ($v | type) == "boolean" or ($v | type) == "number"
        or (($v | type) == "string" and ($v | test($pat)))
        or (($v | type) == "array" and ($v | all(.[]; type == "string" and test($pat))))
      )
    )
  ' >/dev/null 2>&1
}

cmd_append() {
  local file="$1"; shift
  need_jq
  [ -f "$POLICY" ] || err "policy.json missing"

  local session="" event="" data="" ts=""
  while [ $# -gt 0 ]; do
    [ $# -ge 2 ] || usage
    case "$1" in
      --session) session="$2"; shift 2 ;;
      --event) event="$2"; shift 2 ;;
      --data) data="$2"; shift 2 ;;
      --ts) ts="$2"; shift 2 ;;
      *) usage ;;
    esac
  done
  [ -n "$session" ] && [ -n "$event" ] && [ -n "$data" ] || usage

  jq -e --arg e "$event" '.telemetry.events[] | select(.id == $e)' "$POLICY" >/dev/null 2>&1 \
    || err "unknown event: $event"
  printf '%s' "$data" | jq -e . >/dev/null 2>&1 || err "--data is not valid JSON: $data"
  validate_data "$event" "$data" || err "data failed schema/value_pattern check for event $event: $data"

  [ -n "$ts" ] || ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  jq -nc --arg ts "$ts" --arg session "$session" --arg event "$event" --argjson data "$data" \
    '{ts: $ts, session_id: $session, event: $event, data: $data}' \
    >> "$file"
}

cmd_validate() {
  local file="$1"
  need_jq
  [ -f "$file" ] || err "no such file: $file"
  [ -f "$POLICY" ] || err "policy.json missing"

  local line_no=0 bad=0
  while IFS= read -r line || [ -n "$line" ]; do
    line_no=$((line_no + 1))
    [ -z "$line" ] && continue
    local ev data
    ev=$(printf '%s' "$line" | jq -r '.event // empty' 2>/dev/null)
    data=$(printf '%s' "$line" | jq -c '.data // empty' 2>/dev/null)
    [ -n "$data" ] || data='{}'
    if ! printf '%s' "$line" | jq -e '
          (.ts | type) == "string" and (.ts | length) > 0
          and (.session_id | type) == "string" and (.session_id | length) > 0
          and (.event | type) == "string"
        ' >/dev/null 2>&1 \
       || ! jq -e --arg e "$ev" '.telemetry.events[] | select(.id == $e)' "$POLICY" >/dev/null 2>&1 \
       || ! validate_data "$ev" "$data"; then
      echo "line $line_no: does not match the telemetry schema" >&2
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
