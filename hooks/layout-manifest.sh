#!/usr/bin/env bash
# Single source of truth for the EngineOS standard project layout.
# Sourced only — no side effects. Each entry: relative/dir|seedspec
# seedspec = comma-separated src:dest pairs.
#   src "@path"      -> path relative to the EngineOS repo root (reuse in-repo files)
#   src "basename"   -> basename under templates/project-layout/
#   dest             -> filename written into the target dir
# Mirror of the table in docs/specs/2026-06-19-project-layout-standard-design.md.
# audits/ is intentionally absent (created on first /audit).
LAYOUT_MANIFEST=(
  ".engineos/changes|@.engineos/changes/_template.md:_template.md,@.engineos/changes/README.md:README.md"
  ".engineos/archived|@.engineos/archived/README.md:README.md"
  ".engineos/memory|@.engineos/memory/README.md:README.md"
  "docs/specs|specs-README.md:README.md"
  "docs/prds|prds-README.md:README.md,prd-template.md:_template.md"
  "docs/rules|rules-README.md:README.md"
)
