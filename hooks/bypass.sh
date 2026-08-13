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
#
# Two escape hatches sit above the per-repo marker for the cases it cannot cover —
# a non-repo directory, or a pause meant to survive session boundaries:
# ENGINEOS_BYPASS=1 in the environment, and the sticky machine-wide flag
# ~/.claude/engineos.bypass. Neither is cleared at SessionStart, so both are
# deliberately harder to forget about: `bypass.sh status` names which one is on.
set -uo pipefail

# Absolute path of the marker for a given working dir. Fails (returns 1) when the
# dir is not inside a git repo — there is nowhere to put the flag, so nothing is
# bypassed and every hook behaves normally.
engineos_bypass_marker() {
  local cwd="${1:-$PWD}" gitdir
  gitdir=$(cd "$cwd" 2>/dev/null && git rev-parse --absolute-git-dir 2>/dev/null) || return 1
  printf '%s/ENGINEOS_BYPASS' "$gitdir"
}

# Machine-wide sticky flag. Unlike the per-repo marker it is NOT cleared at
# SessionStart: it holds until toggled off, and it covers directories that are not
# git repos at all. Use it to pause EngineOS everywhere without uninstalling.
# Overridable so a test run (or a second install) is never at the mercy of the
# operator's real machine state: point it at a path that does not exist to isolate.
ENGINEOS_BYPASS_FLAG="${ENGINEOS_BYPASS_FLAG:-${HOME}/.claude/engineos.bypass}"

# True (exit 0) when EngineOS is bypassed for the repo containing $1.
# Three switches, any one of which is enough:
#   ENGINEOS_BYPASS=1              — process-scoped escape hatch
#   ~/.claude/engineos.bypass      — machine-wide, sticky until toggled off
#   <git-dir>/ENGINEOS_BYPASS      — per-repo, expires at the next SessionStart
engineos_bypass_active() {
  [ "${ENGINEOS_BYPASS:-0}" = "1" ] && return 0
  [ -f "$ENGINEOS_BYPASS_FLAG" ] && return 0
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
      # The two sticky switches are not cleared here: they are machine/process
      # scoped and clearing them from a repo-scoped `off` would be a surprise.
      if [ "${ENGINEOS_BYPASS:-0}" = "1" ]; then
        echo "engineos: repo marker cleared, but ENGINEOS_BYPASS=1 still bypasses everything — unset it to restore" >&2
      elif [ -f "$ENGINEOS_BYPASS_FLAG" ]; then
        echo "engineos: repo marker cleared, but $ENGINEOS_BYPASS_FLAG still bypasses everything — delete it to restore" >&2
      else
        echo "engineos: active — routing, agent dispatch, and Stop gates restored"
      fi
      ;;
    status)
      if [ "${ENGINEOS_BYPASS:-0}" = "1" ]; then echo "bypassed (ENGINEOS_BYPASS=1)"
      elif [ -f "$ENGINEOS_BYPASS_FLAG" ]; then echo "bypassed ($ENGINEOS_BYPASS_FLAG)"
      elif [ -f "$MARKER" ]; then echo "bypassed (repo marker)"
      else echo "active"; fi
      ;;
    *)
      echo "usage: bypass.sh on|off|status [cwd]" >&2
      exit 2
      ;;
  esac
fi
