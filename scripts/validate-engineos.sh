#!/usr/bin/env bash
# EngineOS self-integrity harness (gap G11 of docs/specs/2026-08-02-ai-methodology-integration-analysis.md).
#
# This file is the harness only. Every Check lives in scripts/checks/ as a
# function named check_<id> — check_C1, check_C5b, check_C17c — grouped into
# family files by what it reads:
#   lib.sh                     shared paths, rule sets, family skip guards
#   10-rules.sh                CLAUDE.md, rules/ and router-row closure
#   20-registries.sh           routing/decision-rule/capability registries
#   40-decision-registries.sh  models, intents and policy registries
#   30-agents-skills.sh        agent and skill document contracts
#   50-kernel.sh               kernel.sh behaviour and router-agent wiring
#   60-contracts.sh            handoff and change-record contracts
#   70-runtime.sh              repair loop, telemetry, constitution mirrors
# The harness sources lib.sh, then every other family file, enumerates the
# check_* functions and runs the selected ones in natural id order. Adding a
# Check is adding a function; nothing here needs to know about it.
#
# Run: scripts/validate-engineos.sh [--only C1,C17,C17c] [--list]
# --only takes exact Check ids; a bare parent id (C17) also selects its
# letter-suffixed sub-checks (C17b, C17c, C17e).
# Exit: 0 selected checks clear, 1 any selected violation, 2 bad arguments.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

ONLY="all"
LIST=false
while [ $# -gt 0 ]; do
  case "$1" in
    --only) [ $# -ge 2 ] || { echo "--only requires a comma-separated check list" >&2; exit 2; }; ONLY="$2"; shift 2 ;;
    --list) LIST=true; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

pass=0; fail=0
ok()  { pass=$((pass+1)); printf 'ok   %s\n' "$1"; }
bad() { fail=$((fail+1)); printf 'FAIL %s\n' "$1"; }

CHECKS_DIR="$ROOT/scripts/checks"
# shellcheck source=scripts/checks/lib.sh
. "$CHECKS_DIR/lib.sh"
for family in "$CHECKS_DIR"/*.sh; do
  case "$family" in */lib.sh) continue ;; esac
  # shellcheck source=/dev/null
  . "$family"
done

# Natural id order: the numeric part numerically, then the letter suffix.
CHECK_IDS=$(declare -F | sed -n 's/^declare -f check_//p' \
  | sed -E 's/^(C[0-9]+)/\1:/' | sort -t: -k1.2,1n -k2,2 | tr -d ':')
[ -n "$CHECK_IDS" ] || { echo "no Checks found under scripts/checks/" >&2; exit 2; }

if [ "$LIST" = true ]; then printf '%s\n' $CHECK_IDS; exit 0; fi

# A parent id selects its sub-checks; an id nothing answers to is an error, not
# a silent no-op — the flat script's unmatched --only ran everything instead.
if [ "$ONLY" != "all" ]; then
  known=" $(printf '%s ' $CHECK_IDS)$(for i in $CHECK_IDS; do printf '%s ' "${i%%[a-z]*}"; done)"
  unknown=""
  for want in $(printf '%s' "$ONLY" | tr ',' ' '); do
    case "$known" in *" $want "*) ;; *) unknown="$unknown $want" ;; esac
  done
  [ -z "$unknown" ] || { echo "unknown check id:$unknown" >&2; exit 2; }
fi

selected() {
  [ "$ONLY" = "all" ] && return 0
  case ",$ONLY," in *",$1,"*) return 0 ;; esac
  case ",$ONLY," in *",${1%%[a-z]*},"*) return 0 ;; esac
  return 1
}

echo "== EngineOS integrity =="
for id in $CHECK_IDS; do
  selected "$id" && "check_$id"
done

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
