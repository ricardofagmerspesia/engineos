#!/usr/bin/env bash
# Compatibility shim — implementation: src/bypass/cli.ts (dist/engineos.cjs).
# Toggles and reports the EngineOS bypass: `bypass.sh on|off|status [cwd]`. The
# switch it moves (per-repo marker in the git dir, machine-wide
# ~/.claude/engineos.bypass, ENGINEOS_BYPASS=1) is src/hooks/bypass.ts, which
# every hook reads in-process — no hook goes through this file any more.

# hooks/lib-common.sh still carries a `. bypass.sh` line. An exec inside a sourced
# file replaces the SOURCING shell with node, so the stale source line is answered
# with a return before the exec is ever reached.
[ "${BASH_SOURCE[0]}" = "$0" ] || return 0

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" bypass "$@"
