#!/usr/bin/env bash
# Compatibility shim. `--only <ids>`, `--list`, the `== EngineOS integrity ==`
# header, the `ok   ` / `FAIL ` / `skip ` prefixes, `passed N, failed N` and the
# exit codes 0/1/2 are the surface CI and the self-test rely on; the checks live
# in src/checks/ compiled into dist/engineos.cjs (docs/COMPATIBILITY.md 1.7.0).
# ENGINEOS_ROOT lets a copied tree validate itself rather than the checkout.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Warn step of the 1.7.0 deprecation: stderr only, because stdout is what the
# caller parses; ENGINEOS_QUIET_SHIMS=1 keeps bench and e2e spawns clean.
[ "${ENGINEOS_QUIET_SHIMS:-}" = "1" ] || printf '%s\n' '[engineos] scripts/validate-engineos.sh is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs validate' >&2
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" validate "$@"
