#!/usr/bin/env bash
# Compatibility shim. The ok/FAIL/SKIP lines, the summary line and the exit code
# are public surface (docs/COMPATIBILITY.md, evals/RUBRIC.md, CI's "Evals
# (deterministic tier)" step and .github/workflows/live-evals.yml) — so the entry
# point stays while the implementation moved to src/evals/, compiled into
# dist/engineos.cjs. jq is no longer needed. ENGINEOS_ROOT keeps a relocated copy
# grading its own evals/ and rules/ rather than the checkout the runtime lives in.
# Usage: ./scripts/run-evals.sh   (ENGINEOS_EVAL_LIVE=1 adds the live tier)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" evals "$@"
