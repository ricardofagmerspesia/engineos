#!/usr/bin/env bash
# Compatibility shim. The subcommands, the flags, the appended line's bytes and
# the {"error": ...}-on-stdout convention below are public surface
# (docs/COMPATIBILITY.md); the implementation is src/journal/telemetry.ts
# compiled into dist/engineos.cjs. ENGINEOS_ROOT lets a relocated copy of this
# file answer from its own registries/ instead of the checkout the runtime
# happens to live in.
#
# Schema (one JSON object per line):
#   ts          ISO-8601 string, when the entry was appended
#   session_id  string
#   event       string, an id in registries/policy.json's telemetry.events
#   data        flat object whose keys are a subset of that event's `keys`;
#               every value is a boolean, a number, or a string/array-of-
#               strings matching telemetry.value_pattern (no whitespace class
#               — this is the structural guard against prompt text ever
#               entering the store, not a discipline one).
#
# Usage:
#   scripts/telemetry.sh append <file> --session <sid> --event <id> --data <json> [--ts <iso8601>]
#   scripts/telemetry.sh validate <file>
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" telemetry "$@"
