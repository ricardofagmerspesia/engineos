#!/usr/bin/env bash
# Compatibility shim. The ok/FAIL/SKIP lines, the summary line and the exit code
# are public surface (docs/COMPATIBILITY.md, evals/RUBRIC.md, CI's "Evals
# (deterministic tier)" step and .github/workflows/live-evals.yml) — so the entry
# point stays while the implementation moved to src/evals/, compiled into
# dist/engineos.cjs. jq is no longer needed. ENGINEOS_ROOT keeps a relocated copy
# grading its own evals/ and rules/ rather than the checkout the runtime lives in.
# Usage: ./scripts/run-evals.sh   (ENGINEOS_EVAL_LIVE=1 adds the live tier)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Warn step of the 1.7.0 deprecation: stderr only, because stdout is what the
# caller parses; ENGINEOS_QUIET_SHIMS=1 keeps bench and e2e spawns clean.
[ "${ENGINEOS_QUIET_SHIMS:-}" = "1" ] || printf '%s\n' '[engineos] scripts/run-evals.sh is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs evals' >&2
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" evals "$@"
