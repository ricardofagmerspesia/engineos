#!/usr/bin/env bash
# Compatibility shim. The "@generated" marker text, the rule that a file without it
# is hand-customized and never overwritten or deleted, and every line printed here
# are public surface (docs/COMPATIBILITY.md) — the marker decides which committed
# commands survive a run. The implementation is src/gen/agent-commands.ts compiled
# into dist/engineos.cjs. ENGINEOS_ROOT makes a relocated copy generate into its
# own tree instead of the checkout the runtime lives in.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" gen agent-commands "$@"
