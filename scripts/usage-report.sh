#!/usr/bin/env bash
# Compatibility shim. The section headers and line formats are the surface the
# retro skill reads, so they stay put; the implementation is src/report/usage.ts
# compiled into dist/engineos.cjs. It reads ~/.claude/projects transcripts and
# this repo's .git/engineos-telemetry events natively — jq is no longer needed.
# Run quarterly; prune rules/skills with zero hits. Usage: ./scripts/usage-report.sh [days]
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Warn step of the 1.7.0 deprecation: stderr only, because stdout is what the
# caller parses; ENGINEOS_QUIET_SHIMS=1 keeps bench and e2e spawns clean.
[ "${ENGINEOS_QUIET_SHIMS:-}" = "1" ] || printf '%s\n' '[engineos] scripts/usage-report.sh is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs usage-report' >&2
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" usage-report "$@"
