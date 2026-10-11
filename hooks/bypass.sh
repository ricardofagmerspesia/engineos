#!/usr/bin/env bash
# Compatibility shim — implementation: src/bypass/cli.ts (dist/engineos.cjs).
# Toggles and reports the EngineOS bypass: `bypass.sh on|off|status [cwd]`. The
# switch it moves (per-repo marker in the git dir, machine-wide
# ~/.claude/engineos.bypass, ENGINEOS_BYPASS=1) is src/hooks/bypass.ts, which
# every hook reads in-process — no hook goes through this file any more.

# Guard against being sourced: an exec inside a sourced file replaces the
# SOURCING shell with node. No shipped file sources this one any more (the last,
# hooks/lib-common.sh, is gone), but a consumer's own script still might.
[ "${BASH_SOURCE[0]}" = "$0" ] || return 0

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Warn step of the 1.7.0 deprecation: stderr only, because stdout is what the
# caller parses; ENGINEOS_QUIET_SHIMS=1 keeps bench and e2e spawns clean.
[ "${ENGINEOS_QUIET_SHIMS:-}" = "1" ] || printf '%s\n' '[engineos] hooks/bypass.sh is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs bypass ...' >&2
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" bypass "$@"
