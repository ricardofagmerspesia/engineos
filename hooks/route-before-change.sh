#!/usr/bin/env bash
# EngineOS PreToolUse(Edit|Write|NotebookEdit): route the upcoming change to the
# right rules, skill, and specialist agent. NON-BLOCKING — injects guidance via
# hookSpecificOutput.additionalContext (exit 0). Canonical mapping lives in
# registries/routing.json, resolved by scripts/kernel.sh route-path — this hook
# calls it once and reads both `excluded` and `hook_guidance` off the same
# JSON answer.
#
# Permission flow: this hook does NOT set permissionDecision, so the user's normal
# edit-permission prompt is preserved. NOTE: if a Claude Code version requires
# permissionDecision:"allow" for additionalContext to be injected, that is the
# only case to add it — verify in a live session before changing this.
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=hooks/lib-common.sh
. "$DIR/lib-common.sh"
# shellcheck source=hooks/bypass.sh
. "$DIR/bypass.sh"

# Parse the envelope once; edits often fire this hook repeatedly in one turn.
FILE=""
CWD=""
SID="nosession"
{
  IFS= read -r -d '' FILE || true
  IFS= read -r -d '' CWD || true
  IFS= read -r -d '' SID || true
} < <(printf '%s' "$INPUT" | jq -j \
  '(.tool_input.file_path // ""), "\u0000", (.cwd // ""), "\u0000", (.session_id // "nosession"), "\u0000"' \
  2>/dev/null)

[ -z "$FILE" ] && exit 0

KERNEL="$DIR/../scripts/kernel.sh"
case "$FILE" in */*) START="${FILE%/*}"; [ -n "$START" ] || START="/" ;; *) START="." ;; esac

# Resolve repo root + git dir with one git process and reuse both values for
# bypass, cache placement and the change-record reminder.
REPO=""
CACHE_GITDIR=""
REPO_PREFIX=""
GIT_INFO=$(git -C "${CWD:-$START}" rev-parse --show-toplevel --absolute-git-dir --show-prefix 2>/dev/null) || GIT_INFO=""
if [ -n "$GIT_INFO" ]; then
  {
    IFS= read -r REPO || true
    IFS= read -r CACHE_GITDIR || true
    IFS= read -r REPO_PREFIX || true
  } <<< "$GIT_INFO"
fi
[ "${ENGINEOS_BYPASS:-0}" = "1" ] && exit 0
[ -f "$ENGINEOS_BYPASS_FLAG" ] && exit 0
[ -n "$CACHE_GITDIR" ] && [ -f "$CACHE_GITDIR/ENGINEOS_BYPASS" ] && exit 0

# A path's route is immutable until routing.json changes. Cache the compact
# answer per session in the worktree git dir; the registry mtime and optional
# operator buster make invalidation explicit without touching project files.
CACHE_FILE=""
CACHE_OUTPUT_FILE=""
if [ -n "$CACHE_GITDIR" ]; then
  if ROUTING_SIG=$(stat -f '%m-%z' "$DIR/../registries/routing.json" 2>/dev/null); then :
  else ROUTING_SIG=$(stat -c '%Y-%s' "$DIR/../registries/routing.json" 2>/dev/null || printf unknown); fi
  case "$SID" in *[!A-Za-z0-9._-]*) SAFE_SID=$(printf '%s' "$SID" | tr -c 'A-Za-z0-9._-' '_') ;; *) SAFE_SID="$SID" ;; esac
  CACHE_DIR="$CACHE_GITDIR/engineos-route-cache"
  CACHE_REL=""
  case "$FILE" in
    "$REPO"/*) CACHE_REL=${FILE#"$REPO"/} ;;
    "${CWD%/}"/*) CACHE_REL="${REPO_PREFIX}${FILE#"${CWD%/}"/}" ;;
  esac
  if [ -n "$CACHE_REL" ]; then
    # Never let a non-normalized tool path escape the private cache tree.
    case "/$CACHE_REL/" in */../*|*/./*) : ;;
      *) CACHE_FILE="$CACHE_DIR/${SAFE_SID}-${ROUTING_SIG}-${ENGINEOS_ROUTE_CACHE_BUSTER:-0}/$CACHE_REL.route" ;;
    esac
  fi
  [ -n "$CACHE_FILE" ] && CACHE_OUTPUT_FILE="$CACHE_FILE.output"
fi

if [ -n "$CACHE_FILE" ] && [ -s "$CACHE_FILE" ]; then
  IFS= read -r GUIDE < "$CACHE_FILE" || GUIDE=""
else
  GUIDE=$("$KERNEL" route-path "$FILE" 2>/dev/null \
    | jq -r 'if (.excluded // false) then "__ENGINEOS_EXCLUDED__" else (.hook_guidance // "") end' \
      2>/dev/null) || GUIDE=""
  if [ -n "$CACHE_FILE" ]; then
    CACHE_PARENT=${CACHE_FILE%/*}
    mkdir -p "$CACHE_PARENT" 2>/dev/null || true
    CACHE_TMP="$CACHE_FILE.$$"
    if printf '%s\n' "$GUIDE" > "$CACHE_TMP" 2>/dev/null; then
      mv "$CACHE_TMP" "$CACHE_FILE" 2>/dev/null || true
    fi
  fi
fi

# excluded meta/scaffolding files get no routing at all
[ "$GUIDE" = "__ENGINEOS_EXCLUDED__" ] && exit 0

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
    if [ -n "$REPO" ]; then
      if [ -d "$REPO/.engineos/changes" ] && ! grep -lq '^status:[[:space:]]*active' "$REPO"/.engineos/changes/*.md 2>/dev/null; then
        CHANGE_NOTE=" | no active .engineos/changes record — open one (.engineos/changes/_template.md)"
      fi
    fi
    ;;
esac

# nothing to say
[ -z "$GUIDE" ] && [ -z "$PROJ_NOTE" ] && [ -z "$CHANGE_NOTE" ] && exit 0

# The common cache-hit path has no dynamic notes. Reuse the already encoded
# hook envelope as well as the route answer, avoiding a second jq startup on
# every edit. Project/change notes still take the live formatting path below.
if [ -z "$PROJ_NOTE" ] && [ -z "$CHANGE_NOTE" ] \
   && [ -n "$CACHE_OUTPUT_FILE" ] && [ -s "$CACHE_OUTPUT_FILE" ]; then
  command cat "$CACHE_OUTPUT_FILE"
  exit 0
fi

MSG="[router] ${GUIDE:-base.md+git.md only}${PROJ_NOTE}${CHANGE_NOTE}"
OUTPUT=$(jq -cn --arg c "$MSG" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse", additionalContext:$c}}')
printf '%s\n' "$OUTPUT"
if [ -z "$PROJ_NOTE" ] && [ -z "$CHANGE_NOTE" ] && [ -n "$CACHE_OUTPUT_FILE" ]; then
  OUTPUT_TMP="$CACHE_OUTPUT_FILE.$$"
  if printf '%s\n' "$OUTPUT" > "$OUTPUT_TMP" 2>/dev/null; then
    mv "$OUTPUT_TMP" "$CACHE_OUTPUT_FILE" 2>/dev/null || true
  fi
fi
exit 0
