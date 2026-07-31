#!/usr/bin/env bash
# EngineOS usage report — which intents/skills actually fire, from local session transcripts.
# Run quarterly; prune rules/skills with zero hits. Usage: ./scripts/usage-report.sh [days]
set -uo pipefail

DAYS="${1:-30}"
PROJECTS_DIR="$HOME/.claude/projects"
[ -d "$PROJECTS_DIR" ] || { echo "No transcripts at $PROJECTS_DIR"; exit 1; }

echo "EngineOS usage — last $DAYS days"
echo "================================="

FILES=$(find "$PROJECTS_DIR" -name '*.jsonl' -mtime "-$DAYS" 2>/dev/null)
[ -z "$FILES" ] && { echo "No transcripts in window."; exit 0; }

echo ""
echo "## Router intents ([router] announce lines)"
# shellcheck disable=SC2086
grep -h -oE '\[router\] intent=[a-zA-Z-]+' $FILES 2>/dev/null \
  | sed 's/\[router\] intent=//' | sort | uniq -c | sort -rn \
  || echo "(none found — router not announcing?)"

echo ""
echo "## EngineOS skill invocations"
for s in nestjs-patterns react-patterns llm-engineering adr eval-harness release-notes record-change strategy; do
  # shellcheck disable=SC2086
  n=$(grep -hl "\"skill\"[[:space:]]*:[[:space:]]*\"$s\"" $FILES 2>/dev/null | wc -l | tr -d ' ')
  printf "%6s  %s\n" "$n" "$s"
done

echo ""
echo "## Subagent dispatches"
for a in security-reviewer test-writer; do
  # shellcheck disable=SC2086
  n=$(grep -hl "$a" $FILES 2>/dev/null | wc -l | tr -d ' ')
  printf "%6s  %s (sessions mentioning)\n" "$n" "$a"
done

echo ""
echo "## Hook gate hits (stop-verify blocks)"
# shellcheck disable=SC2086
grep -h -c 'EngineOS gate' $FILES 2>/dev/null | awk '{s+=$1} END {print s+0 " blocks"}'

echo ""
echo "Zero-hit items are prune candidates — but check the announce habit first."
