#!/usr/bin/env bash
# EngineOS bypass switch — single source of truth for "is EngineOS off right now".
#
# Sourced by every hook (which early-exits when the switch is on) and runnable
# directly as a CLI: bypass.sh on|off|status [cwd].
#
# The marker lives in the git dir, beside the ENGINEOS_UNRECORDED flag: never
# committed, per-repo, and per-worktree without extra work.
#
# It is deliberately NOT session-scoped. The /engineos:bypass command that toggles
# it is a prompt and cannot see the session id, so scoping it that way would mean
# the command could turn the switch on but never reliably off. Instead
# ensure-project-layout.sh (SessionStart) deletes the marker, so a bypass can
# never outlive the session that asked for it. The failure direction is the safe
# one: a forgotten bypass expires into gates-ON, never the reverse.
#
# Concurrent sessions in one repo share the switch. That is documented, not
# accidental: starting a second session clears the first session's bypass.
set -uo pipefail

# Absolute path of the marker for a given working dir. Fails (returns 1) when the
# dir is not inside a git repo — there is nowhere to put the flag, so nothing is
# bypassed and every hook behaves normally.
engineos_bypass_marker() {
  local cwd="${1:-$PWD}" gitdir
  gitdir=$(cd "$cwd" 2>/dev/null && git rev-parse --absolute-git-dir 2>/dev/null) || return 1
  printf '%s/ENGINEOS_BYPASS' "$gitdir"
}

# True (exit 0) when EngineOS is bypassed for the repo containing $1.
engineos_bypass_active() {
  local marker
  marker=$(engineos_bypass_marker "${1:-$PWD}") || return 1
  [ -f "$marker" ]
}

# Hook-side one-liner: reads the `cwd` field out of a hook's stdin JSON payload
# and reports whether the switch is on. Falls back to $PWD when the payload has
# no cwd, which is the same repo in every case a hook actually fires.
engineos_bypass_active_for_payload() {
  local payload="${1:-}" cwd=""
  if command -v jq >/dev/null 2>&1; then
    cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)
  fi
  engineos_bypass_active "$cwd"
}

# CLI mode — only when executed, not when sourced.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  ACTION="${1:-status}"
  TARGET="${2:-$PWD}"
  MARKER=$(engineos_bypass_marker "$TARGET") || {
    echo "engineos: not a git repository — bypass has no effect here" >&2
    exit 1
  }
  case "$ACTION" in
    on)
      : >"$MARKER"
      echo "engineos: BYPASSED — routing, agent dispatch, and Stop gates are off for this session"
      ;;
    off)
      rm -f "$MARKER"
      echo "engineos: active — routing, agent dispatch, and Stop gates restored"
      ;;
    status)
      if [ -f "$MARKER" ]; then echo "bypassed"; else echo "active"; fi
      ;;
    *)
      echo "usage: bypass.sh on|off|status [cwd]" >&2
      exit 2
      ;;
  esac
fi
