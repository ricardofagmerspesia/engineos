#!/usr/bin/env bash
# Compatibility shim. The subcommand names and JSON answers below are public
# surface (docs/COMPATIBILITY.md); the implementation is src/kernel/ compiled into
# dist/engineos.cjs. ENGINEOS_ROOT lets a relocated copy of this file answer from
# its own registries/ (scripts/test-kernel.sh relocated_kernel).
# Subcommands: resolve route-path route-intent model risk gates repair admit breaker
#              hitl waves decision-rules scale route-escalate resolve-task
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" kernel "$@"
