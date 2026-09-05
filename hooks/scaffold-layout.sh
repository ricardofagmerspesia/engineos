#!/usr/bin/env bash
# Shared scaffold for the EngineOS standard project layout. Sourced only.
# Used by hooks/ensure-project-layout.sh (SessionStart, opt-in) and
# scripts/init-project.sh (explicit adoption). One implementation, so the
# hook and the bootstrap can never disagree about what "the layout" is.
#
# Write containment
# -----------------
# Every path this file creates or writes resolves inside the project root, and
# every refusal is a silent skip that still returns 0 — this runs on
# SessionStart and must never break a session start.
#
# The threat is concrete: a hostile repo commits `.engineos/` (which IS the
# opt-in signal hooks/ensure-project-layout.sh gates on) plus a manifest
# destination — say `docs/specs/README.md` — as a DANGLING symlink pointing at
# any absolute path. A `[ -f "$dest" ]` test is FALSE for a dangling link, so
# the earlier code's `&&` chain proceeded and `cp` wrote THROUGH the link to
# the attacker's chosen path on the first SessionStart after a clone. `[ -e ]`
# is false for a dangling link too; `[ -L ]` is the test that catches it, so
# the guard below tests for both. The directory form of the same defect is
# `mkdir -p`, which follows a symlinked component without complaint.
#
# Path resolution here is `cd "$dir" && pwd -P` in a subshell, not `realpath`:
# `pwd -P` is a bash builtin, resolves every symlink in the path, and needs
# nothing on PATH. `realpath` does exist on this machine (/bin/realpath), but
# it is an external binary that older macOS did not ship and that a hook run
# under a reduced PATH cannot count on — src/hooks/ensure-project-layout.e2e.test.ts deliberately
# exercises exactly such a PATH.

# engineos_scaffold_physdir <dir> -> the fully symlink-resolved path of an
# EXISTING directory. Non-zero when it does not exist or is not a directory.
engineos_scaffold_physdir() {
  ( cd "$1" 2>/dev/null && pwd -P ) || return 1
}

# engineos_scaffold_within <root_phys> <path_phys> -> 0 when path is root
# itself or lies below it. Both arguments must ALREADY be resolved physical
# paths; this function does no resolution of its own.
engineos_scaffold_within() {
  [ "$2" = "$1" ] && return 0
  case "$2" in "$1"/*) return 0 ;; esac
  return 1
}

# engineos_scaffold_dir <root> <relative/dir> -> echoes the resolved physical
# path of the directory, creating any missing component. An empty <relative/dir>
# means the root itself. Non-zero, having written nothing, when:
#   - the root does not resolve to a directory,
#   - any component already exists as a symlink of ANY kind (live, dangling,
#     directory) or as a non-directory,
#   - a component cannot be created,
#   - the resolved result is not under the resolved root.
# Components are created one at a time on purpose: `mkdir -p` would follow a
# symlinked component instead of refusing it.
engineos_scaffold_dir() {
  local root="$1" rel="$2" root_phys cur rest comp phys
  root_phys=$(engineos_scaffold_physdir "$root") || return 1
  cur="$root_phys"
  rest="$rel"
  while [ -n "$rest" ]; do
    case "$rest" in
      */*) comp="${rest%%/*}"; rest="${rest#*/}" ;;
      *)   comp="$rest"; rest="" ;;
    esac
    case "$comp" in ''|.) continue ;; ..) return 1 ;; esac
    if [ -L "$cur/$comp" ]; then
      return 1
    elif [ -e "$cur/$comp" ]; then
      [ -d "$cur/$comp" ] || return 1
    else
      mkdir "$cur/$comp" 2>/dev/null || return 1
    fi
    cur="$cur/$comp"
  done
  phys=$(engineos_scaffold_physdir "$cur") || return 1
  engineos_scaffold_within "$root_phys" "$phys" || return 1
  printf '%s' "$phys"
}

# engineos_scaffold_seed <parent_phys> <name> <src> -> copy src to parent/name
# ONLY when nothing whatever occupies that name. <parent_phys> must be a path
# engineos_scaffold_dir already vouched for, and <name> must be a plain file
# name — a slashed or dotted name is refused rather than resolved. Always
# returns 0: every refusal is a silent skip.
engineos_scaffold_seed() {
  local parent="$1" name="$2" src="$3"
  case "$name" in ''|.|..|*/*) return 0 ;; esac
  [ -f "$src" ] || return 0
  # -e alone is false for a dangling symlink, which is exactly the case that
  # let the earlier code write outside the project; -L catches it.
  if [ -e "$parent/$name" ] || [ -L "$parent/$name" ]; then
    return 0
  fi
  cp "$src" "$parent/$name" 2>/dev/null || true
  return 0
}

# engineos_scaffold_layout <project_root> <engineos_repo_dir>
#   Creates every missing dir in LAYOUT_MANIFEST and seeds missing files.
#   Prints each created dir on its own line. Returns 0 always (never breaks a
#   session start); callers decide what to do with the list.
engineos_scaffold_layout() {
  local root="$1" repo_dir="$2"
  # shellcheck source=/dev/null
  source "$repo_dir/hooks/layout-manifest.sh" 2>/dev/null || return 0
  local entry dir seeds pair src dest abs parent existed
  local -a pairs
  for entry in "${LAYOUT_MANIFEST[@]}"; do
    dir="${entry%%|*}"; seeds="${entry#*|}"
    existed=0
    if [ -d "$root/$dir" ]; then existed=1; fi
    parent=$(engineos_scaffold_dir "$root" "$dir") || continue
    if [ "$existed" -eq 0 ]; then printf '%s\n' "$dir"; fi
    IFS=',' read -ra pairs <<< "$seeds"
    for pair in "${pairs[@]}"; do
      src="${pair%%:*}"; dest="${pair#*:}"
      case "$src" in
        @*) abs="$repo_dir/${src#@}" ;;
        *)  abs="$repo_dir/templates/project-layout/$src" ;;
      esac
      engineos_scaffold_seed "$parent" "$dest" "$abs"
    done
  done
  return 0
}
