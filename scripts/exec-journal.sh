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
#   tokens_in     integer >= 0
#   tokens_out    integer >= 0
#   duration_ms   integer >= 0
#   note          string or null, optional free text
#
# Usage:
#   scripts/exec-journal.sh append <journal-file> \
#     --run-id ID --capability-id ID --agent NAME --model-tier TIER \
#     --status OK|BLOCKED|FAILED|DEGRADED --tokens-in N --tokens-out N \
#     --duration-ms N [--note TEXT] [--timestamp ISO8601]
#   scripts/exec-journal.sh validate <journal-file>
set -euo pipefail

VALID_STATUSES="OK BLOCKED FAILED DEGRADED"
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

cmd_append() {
  local file="$1"; shift
  command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }

  local run_id="" capability_id="" agent="null" model_tier="" status=""
  local tokens_in="" tokens_out="" duration_ms="" note="null" timestamp=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --run-id) run_id="$2"; shift 2 ;;
      --capability-id) capability_id="$2"; shift 2 ;;
      --agent) agent="\"$2\""; shift 2 ;;
      --model-tier) model_tier="$2"; shift 2 ;;
      --status) status="$2"; shift 2 ;;
      --tokens-in) tokens_in="$2"; shift 2 ;;
      --tokens-out) tokens_out="$2"; shift 2 ;;
      --duration-ms) duration_ms="$2"; shift 2 ;;
      --note) note="\"$2\""; shift 2 ;;
      --timestamp) timestamp="$2"; shift 2 ;;
      *) echo "unknown arg: $1" >&2; usage ;;
    esac
  done

  [ -n "$run_id" ] && [ -n "$capability_id" ] && [ -n "$model_tier" ] && [ -n "$status" ] \
    && [ -n "$tokens_in" ] && [ -n "$tokens_out" ] && [ -n "$duration_ms" ] || usage

  in_list "$status" "$VALID_STATUSES" || { echo "invalid status: $status (must be one of: $VALID_STATUSES)" >&2; exit 1; }
  in_list "$model_tier" "$VALID_TIERS" || { echo "invalid model_tier: $model_tier (must be one of: $VALID_TIERS)" >&2; exit 1; }
  [ -n "$timestamp" ] || timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  jq -nc \
    --arg timestamp "$timestamp" --arg run_id "$run_id" --arg capability_id "$capability_id" \
    --arg model_tier "$model_tier" --arg status "$status" \
    --argjson agent "$agent" --argjson note "$note" \
    --argjson tokens_in "$tokens_in" --argjson tokens_out "$tokens_out" --argjson duration_ms "$duration_ms" \
    '{timestamp: $timestamp, run_id: $run_id, capability_id: $capability_id, agent: $agent, model_tier: $model_tier, status: $status, tokens_in: $tokens_in, tokens_out: $tokens_out, duration_ms: $duration_ms, note: $note}' \
    >> "$file"
}

cmd_validate() {
  local file="$1"
  command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }
  [ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }

  local line_no=0 bad=0
  while IFS= read -r line; do
    line_no=$((line_no + 1))
    [ -z "$line" ] && continue
    if ! printf '%s' "$line" | jq -e '
        (.timestamp | type) == "string" and
        (.run_id | type) == "string" and
        (.capability_id | type) == "string" and
        (.model_tier | type) == "string" and
        (.status | type) == "string" and
        (.tokens_in | type) == "number" and
        (.tokens_out | type) == "number" and
        (.duration_ms | type) == "number"' >/dev/null 2>&1; then
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
