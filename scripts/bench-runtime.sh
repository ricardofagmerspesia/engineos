#!/usr/bin/env bash
# Compatibility shim. The five budget names, the ok/FAIL line format and
# ENGINEOS_PERF_MULTIPLIER are public surface (docs/COMPATIBILITY.md, CI's
# "Runtime performance budgets" step); the implementation is src/bench/ compiled
# into dist/engineos.cjs, so python3 is no longer a runtime dependency.
# ENGINEOS_ROOT keeps a relocated copy timing its own shims.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Warn step of the 1.7.0 deprecation: stderr only, because stdout is what the
# caller parses; ENGINEOS_QUIET_SHIMS=1 keeps bench and e2e spawns clean.
[ "${ENGINEOS_QUIET_SHIMS:-}" = "1" ] || printf '%s\n' '[engineos] scripts/bench-runtime.sh is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs bench' >&2
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" bench "$@"
