#!/usr/bin/env bash
# Compatibility shim. The FAIL messages, the generated document and the
# "Wrote N agents to <file>" line are public surface (docs/COMPATIBILITY.md) and
# CI's drift guard diffs the committed registries/agents.json against a fresh
# run of this path — so the entry point stays while the implementation moved to
# src/gen/agent-registry.ts, compiled into dist/engineos.cjs. jq is no longer
# needed. ENGINEOS_ROOT makes a relocated copy of the tree (the temp tree
# src/gen/gen-agent-registry.e2e.test.ts builds) generate from and into itself
# rather than from the checkout the runtime happens to live in.
# Usage: ./scripts/gen-agent-registry.sh
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Warn step of the 1.7.0 deprecation: stderr only, because stdout is what the
# caller parses; ENGINEOS_QUIET_SHIMS=1 keeps bench and e2e spawns clean.
[ "${ENGINEOS_QUIET_SHIMS:-}" = "1" ] || printf '%s\n' '[engineos] scripts/gen-agent-registry.sh is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs gen agent-registry' >&2
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" gen agent-registry "$@"
