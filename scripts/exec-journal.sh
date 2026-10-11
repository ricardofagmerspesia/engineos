#!/usr/bin/env bash
# Compatibility shim. The subcommand names, the JSONL line shape and the exit
# codes below are public surface (docs/COMPATIBILITY.md); the implementation is
# src/journal/ compiled into dist/engineos.cjs. The field table — names, flags,
# guards, JSON types and which registry supplies each vocabulary — lives in
# src/journal/schema.ts and is declared once there rather than restated per
# guard. ENGINEOS_ROOT lets a relocated copy of this file answer from its own
# registries/, which is how the bash CLI behaved (it derived that root from its
# own path) and what test/fixtures/legacy-journal/exec-journal.sh still needs.
# Subcommands: append validate
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Warn step of the 1.7.0 deprecation: stderr only, because stdout is what the
# caller parses; ENGINEOS_QUIET_SHIMS=1 keeps bench and e2e spawns clean.
[ "${ENGINEOS_QUIET_SHIMS:-}" = "1" ] || printf '%s\n' '[engineos] scripts/exec-journal.sh is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs journal ...' >&2
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" journal "$@"
