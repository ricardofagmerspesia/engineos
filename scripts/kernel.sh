#!/usr/bin/env bash
# Compatibility shim. The subcommand names and JSON answers below are public
# surface (docs/COMPATIBILITY.md); the implementation is src/kernel/ compiled into
# dist/engineos.cjs. ENGINEOS_ROOT lets a relocated copy of this file answer from
# its own registries/ (src/testing/harness.ts relocatedRoot).
# Subcommands: resolve route-path route-intent model risk gates repair admit breaker
#              hitl waves decision-rules scale route-escalate resolve-task skill-state
#              resolve-stack [dir]
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Warn step of the 1.7.0 deprecation: stderr only, because stdout is what the
# caller parses; ENGINEOS_QUIET_SHIMS=1 keeps bench and e2e spawns clean.
[ "${ENGINEOS_QUIET_SHIMS:-}" = "1" ] || printf '%s\n' '[engineos] scripts/kernel.sh is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs kernel ...' >&2
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" kernel "$@"
