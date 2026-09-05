#!/usr/bin/env bash
# Single source of truth for the EngineOS standard project layout.
# Sourced only — no side effects. Each entry: relative/dir|seedspec
# seedspec = comma-separated src:dest pairs.
#   src "@path"      -> path relative to the EngineOS repo root (reuse in-repo files)
#   src "basename"   -> basename under templates/project-layout/
#   dest             -> filename written into the target dir
# Mirror of the table in docs/specs/2026-06-19-project-layout-standard-design.md.
# audits/ is intentionally absent (created on first /audit).
#
# The DATA now lives in registries/layout-manifest.json, which src/hooks/scaffold.ts
# reads directly; this file is the sourced-library face of it and keeps the array
# contract its callers already have. The literal below is the degraded copy, used
# when jq is absent — src/hooks/ensure-project-layout.e2e.test.ts deliberately runs the scaffolder under a
# jq-free PATH — and it is also what scripts/init-project.sh's sed reads out of this
# file's text. Both forms must stay byte-identical; the JSON is the source of truth.
LAYOUT_MANIFEST=(
  ".engineos/changes|@.engineos/changes/_template.md:_template.md,@.engineos/changes/README.md:README.md"
  ".engineos/archived|@.engineos/archived/README.md:README.md"
  ".engineos/memory|@.engineos/memory/README.md:README.md"
  "docs/specs|specs-README.md:README.md"
  "docs/prds|prds-README.md:README.md,prd-template.md:_template.md"
  "docs/rules|rules-README.md:README.md"
)

# Rebuild from the registry when jq can read it. `+=` on a fresh array rather than
# mapfile: this is sourced under bash 3.2 (macOS system bash), which has neither
# mapfile nor readarray. A malformed or unreadable registry leaves the literal in
# place rather than emptying the manifest — an empty manifest scaffolds nothing and
# would fail silently.
_engineos_layout_manifest_load() {
  local json entry n=0
  local -a loaded=()
  json="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)/registries/layout-manifest.json"
  command -v jq >/dev/null 2>&1 || return 1
  [ -f "$json" ] || return 1
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    loaded+=("$entry")
    n=$((n + 1))
  done < <(jq -r '.entries[] | "\(.dir)|" + ([.seeds[] | "\(.src):\(.dest)"] | join(","))' \
             "$json" 2>/dev/null)
  # Counted rather than measured with ${#loaded[@]}: bash 3.2 (macOS system bash)
  # errors on an empty array under `set -u`, which every hook sets.
  [ "$n" -gt 0 ] || return 1
  LAYOUT_MANIFEST=("${loaded[@]}")
}
_engineos_layout_manifest_load || true
unset -f _engineos_layout_manifest_load
