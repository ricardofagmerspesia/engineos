#!/usr/bin/env bash
# Compatibility shim. The "@generated" marker text, the rule that a file without it
# is hand-customized and never overwritten or deleted, and every line printed here
# are public surface (docs/COMPATIBILITY.md) — the marker decides which committed
# commands survive a run. The implementation is src/gen/agent-commands.ts compiled
# into dist/engineos.cjs. ENGINEOS_ROOT makes a relocated copy generate into its
# own tree instead of the checkout the runtime lives in.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Warn step of the 1.7.0 deprecation: stderr only, because stdout is what the
# caller parses; ENGINEOS_QUIET_SHIMS=1 keeps bench and e2e spawns clean.
[ "${ENGINEOS_QUIET_SHIMS:-}" = "1" ] || printf '%s\n' '[engineos] scripts/gen-agent-commands.sh is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs gen agent-commands' >&2
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" gen agent-commands "$@"
