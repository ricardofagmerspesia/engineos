#!/usr/bin/env bash
# Compatibility shim. The section headers and line formats are the surface the
# retro skill reads, so they stay put; the implementation is src/report/usage.ts
# compiled into dist/engineos.cjs. It reads ~/.claude/projects transcripts and
# this repo's .git/engineos-telemetry events natively — jq is no longer needed.
# Run quarterly; prune rules/skills with zero hits. Usage: ./scripts/usage-report.sh [days]
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/dist/engineos.cjs" usage-report "$@"
