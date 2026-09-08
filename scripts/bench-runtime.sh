#!/usr/bin/env bash
# Compatibility shim. The five budget names, the ok/FAIL line format and
# ENGINEOS_PERF_MULTIPLIER are public surface (docs/COMPATIBILITY.md, CI's
# "Runtime performance budgets" step); the implementation is src/bench/ compiled
# into dist/engineos.cjs, so python3 is no longer a runtime dependency.
# ENGINEOS_ROOT keeps a relocated copy timing its own shims.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" bench "$@"
