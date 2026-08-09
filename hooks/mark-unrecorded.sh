#!/usr/bin/env bash
# EngineOS PostToolUse(Edit|Write): flag that there are unrecorded changes, for the
# Stop record gate (record-verify.sh). The record-change skill clears the flag.
# Evidence-based signal, no transcript parsing.
#
# The marker is resolved from `cwd` (same as record-verify.sh, so the two always
# agree) and scoped to the session id, so a flag left by a crashed/cleared session
# never blocks a different session, and linked worktrees don't cross-talk.
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

# shellcheck source=hooks/bypass.sh
. "$(cd "$(dirname "$0")" && pwd)/bypass.sh"
engineos_bypass_active_for_payload "$INPUT" && exit 0

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0

# only code changes count
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.py|*.go|*.rs|*.sql) ;;
  *) exit 0 ;;
esac
# never flag edits to our own scaffolding/meta
case "$FILE" in
  */.engineos/*|*/docs/*|*/hooks/*) exit 0 ;;
esac

CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"')
[ -n "$CWD" ] || exit 0
GITDIR=$(cd "$CWD" 2>/dev/null && git rev-parse --absolute-git-dir 2>/dev/null) || exit 0

: > "$GITDIR/ENGINEOS_UNRECORDED.$SID" 2>/dev/null || true
exit 0
