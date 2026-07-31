#!/usr/bin/env bash
# EngineOS PreToolUse(Edit|Write|NotebookEdit): route the upcoming change to the
# right rules, skill, and specialist agent. NON-BLOCKING — injects guidance via
# hookSpecificOutput.additionalContext (exit 0). Canonical mapping lives in
# routing-map.sh (beside this file).
#
# Permission flow: this hook does NOT set permissionDecision, so the user's normal
# edit-permission prompt is preserved. NOTE: if a Claude Code version requires
# permissionDecision:"allow" for additionalContext to be injected, that is the
# only case to add it — verify in a live session before changing this.
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=hooks/lib-common.sh
. "$DIR/lib-common.sh"
# shellcheck source=hooks/routing-map.sh
. "$DIR/routing-map.sh"

# excluded meta/scaffolding files get no routing at all
route_excluded "$FILE" && exit 0

GUIDE=$(route_for_path "$FILE")

START=$(dirname "$FILE")

# nearest project CLAUDE.md up-tree
PROJ_NOTE=""
if PROJ_CLAUDE=$(find_up_file "$START" CLAUDE.md); then
  PROJ_NOTE=" | follow project CLAUDE.md (project > EngineOS): $PROJ_CLAUDE"
fi

# soft .engineos/changes reminder: code edit with no active record
# git_dir/repo_root are worktree-safe (git rev-parse), unlike a manual .git walk —
# a linked worktree's ".git" is a file, not a directory, so string-gluing
# "$repo/.git" breaks there.
CHANGE_NOTE=""
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.py|*.go|*.rs|*.sql)
    if REPO=$(repo_root "$START") && [ -n "$REPO" ]; then
      if [ -d "$REPO/.engineos/changes" ] && ! grep -lq '^status:[[:space:]]*active' "$REPO"/.engineos/changes/*.md 2>/dev/null; then
        CHANGE_NOTE=" | no active .engineos/changes record — open one (.engineos/changes/_template.md)"
      fi
    fi
    ;;
esac

# nothing to say
[ -z "$GUIDE" ] && [ -z "$PROJ_NOTE" ] && [ -z "$CHANGE_NOTE" ] && exit 0

MSG="[router] ${GUIDE:-base.md+git.md only}${PROJ_NOTE}${CHANGE_NOTE}"
jq -n --arg c "$MSG" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse", additionalContext:$c}}'
exit 0
