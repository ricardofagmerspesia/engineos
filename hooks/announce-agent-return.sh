#!/usr/bin/env bash
# Compatibility shim — implementation: src/hooks/announce-agent-return.ts (dist/engineos.cjs).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Warn step of the 1.7.0 deprecation: stderr only, because stdout is what the
# caller parses; ENGINEOS_QUIET_SHIMS=1 keeps bench and e2e spawns clean.
[ "${ENGINEOS_QUIET_SHIMS:-}" = "1" ] || printf '%s\n' '[engineos] hooks/announce-agent-return.sh is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs hook announce-agent-return' >&2
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" hook announce-agent-return
