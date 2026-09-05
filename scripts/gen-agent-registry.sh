#!/usr/bin/env bash
# Compatibility shim. The FAIL messages, the generated document and the
# "Wrote N agents to <file>" line are public surface (docs/COMPATIBILITY.md) and
# CI's drift guard diffs the committed registries/agents.json against a fresh
# run of this path — so the entry point stays while the implementation moved to
# src/gen/agent-registry.ts, compiled into dist/engineos.cjs. jq is no longer
# needed. ENGINEOS_ROOT makes a relocated copy of the tree (the temp tree
# scripts/test-gen-agent-registry.sh builds) generate from and into itself
# rather than from the checkout the runtime happens to live in.
# Usage: ./scripts/gen-agent-registry.sh
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" gen agent-registry "$@"
