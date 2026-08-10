#!/usr/bin/env bash
# EngineOS PostToolUse(Edit|Write|NotebookEdit): flag that there are unrecorded
# changes, for the Stop record gate (record-verify.sh). The record-change skill
# clears the flag. Evidence-based signal, no transcript parsing.
#
# The marker is resolved from `cwd` (same as record-verify.sh, so the two always
# agree) and scoped to the session id, so a flag left by a crashed/cleared session
# never blocks a different session, and linked worktrees don't cross-talk.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=hooks/lib-common.sh
. "$DIR/lib-common.sh"

# EngineOS's own hooks/ and docs/ dirs — restricting the exclusion below to these
# exact paths (not any hooks/ or docs/ anywhere) so a consumer project's own
# src/hooks/ or product docs/ still get flagged. Kept in sync with routing-map.sh.
EOS_HOOKS_DIR="$DIR"
EOS_DOCS_DIR="$(cd "$DIR/.." && pwd)/docs"

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

# only code changes count
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.py|*.go|*.rs|*.sql) ;;
  *) exit 0 ;;
esac
# never flag edits to our own scaffolding/meta
case "$FILE" in
  */.engineos/*) exit 0 ;;
esac
case "$FILE" in
  "$EOS_HOOKS_DIR"/*|"$EOS_DOCS_DIR"/*) exit 0 ;;
esac

CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"' 2>/dev/null)
[ -n "$CWD" ] || exit 0
GITDIR=$(git_dir "$CWD") || exit 0
[ -n "$GITDIR" ] || exit 0

: > "$GITDIR/ENGINEOS_UNRECORDED.$SID" 2>/dev/null || true
exit 0
