#!/usr/bin/env bash
# Compatibility shim. `--only <ids>`, `--list`, the `== EngineOS integrity ==`
# header, the `ok   ` / `FAIL ` / `skip ` prefixes, `passed N, failed N` and the
# exit codes 0/1/2 are the surface CI and the self-test rely on; the checks live
# in src/checks/ compiled into dist/engineos.cjs (docs/COMPATIBILITY.md 1.7.0).
# ENGINEOS_ROOT lets a copied tree validate itself rather than the checkout.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" validate "$@"
