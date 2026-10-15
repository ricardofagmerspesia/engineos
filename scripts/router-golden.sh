#!/usr/bin/env bash
# Compatibility shim. The subcommands, the summary lines, the candidates file
# (evals/router-golden/candidates.local.jsonl), RESULTS.md and the exit codes
# are public surface (docs/COMPATIBILITY.md); the implementation is
# src/evals/router-golden*.ts compiled into dist/engineos.cjs. ENGINEOS_ROOT
# keeps a relocated copy reading and writing its own evals/ and registries/.
# `run --write-default` is the only writer of policy.json router_decision.default.
# Usage: ./scripts/router-golden.sh collect [<repo>...]
#        ./scripts/router-golden.sh run [--mode keyword|llm|jev]... [--cases <file>] [--write-default]
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINEOS_ROOT="$ROOT" exec node "$ROOT/dist/engineos.cjs" router-golden "$@"
