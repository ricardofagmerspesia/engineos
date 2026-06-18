#!/usr/bin/env bash
# EngineOS PostToolUse(Edit|Write): flag that there are unrecorded changes, for the
# Stop record gate (record-verify.sh). The record-change skill clears the flag.
# Evidence-based signal — no transcript parsing. Skips our own scaffolding edits.
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0

# only code changes count
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.py|*.go|*.rs|*.sql) ;;
  *) exit 0 ;;
esac
# never flag edits to our own scaffolding/meta
case "$FILE" in
  */changes/*|*/archived/*|*/memory/*|*/docs/*|*/hooks/*) exit 0 ;;
esac

# resolve git dir from the nearest existing ancestor (file may be freshly created)
DIR=$(dirname "$FILE")
while [ ! -d "$DIR" ] && [ "$DIR" != "/" ] && [ -n "$DIR" ]; do DIR=$(dirname "$DIR"); done
GITDIR=$(cd "$DIR" 2>/dev/null && git rev-parse --absolute-git-dir 2>/dev/null) || exit 0
: > "$GITDIR/ENGINEOS_UNRECORDED" 2>/dev/null || true
exit 0
