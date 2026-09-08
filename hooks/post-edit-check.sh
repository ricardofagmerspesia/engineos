#!/usr/bin/env bash
# Compatibility shim — implementation: src/hooks/post-edit-check.ts (dist/engineos.cjs).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" hook post-edit-check
