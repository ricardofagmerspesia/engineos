#!/usr/bin/env bash
# Shared scaffold for the EngineOS standard project layout. Sourced only.
# Used by hooks/ensure-project-layout.sh (SessionStart, opt-in) and
# scripts/init-project.sh (explicit adoption). One implementation, so the
# hook and the bootstrap can never disagree about what "the layout" is.
#
# engineos_scaffold_layout <project_root> <engineos_repo_dir>
#   Creates every missing dir in LAYOUT_MANIFEST and seeds missing files.
#   Prints each created dir on its own line. Returns 0 always (never breaks a
#   session start); callers decide what to do with the list.
engineos_scaffold_layout() {
  local root="$1" repo_dir="$2"
  # shellcheck source=/dev/null
  source "$repo_dir/hooks/layout-manifest.sh" 2>/dev/null || return 0
  local entry dir seeds target pair src dest abs
  local -a pairs
  for entry in "${LAYOUT_MANIFEST[@]}"; do
    dir="${entry%%|*}"; seeds="${entry#*|}"
    target="$root/$dir"
    if [ ! -d "$target" ]; then
      mkdir -p "$target" 2>/dev/null || continue
      printf '%s\n' "$dir"
    fi
    IFS=',' read -ra pairs <<< "$seeds"
    for pair in "${pairs[@]}"; do
      src="${pair%%:*}"; dest="${pair#*:}"
      case "$src" in
        @*) abs="$repo_dir/${src#@}" ;;
        *)  abs="$repo_dir/templates/project-layout/$src" ;;
      esac
      [ -f "$abs" ] && [ ! -f "$target/$dest" ] && cp "$abs" "$target/$dest" 2>/dev/null || true
    done
  done
  return 0
}
