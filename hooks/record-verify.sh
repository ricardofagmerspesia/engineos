#!/usr/bin/env bash
# EngineOS Stop gate: if there are unrecorded changes for THIS session (flag set by
# mark-unrecorded.sh on code edits, cleared by the record-change skill), block ONCE
# asking for the change to be recorded. Evidence-based — relies on the flag file,
# not transcript text. Never loops (stop_hook_active guard).
#
# Marker is resolved from `cwd` and the session id, identically to
# mark-unrecorded.sh, so the two halves always target the same file.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=hooks/lib-common.sh
. "$DIR/lib-common.sh"

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

# already blocked once this stop cycle -> let it through
ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
[ "$ACTIVE" = "true" ] && exit 0

CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"' 2>/dev/null)
[ -n "$CWD" ] || exit 0
GITDIR=$(git_dir "$CWD") || exit 0
[ -n "$GITDIR" ] || exit 0

[ -f "$GITDIR/ENGINEOS_UNRECORDED.$SID" ] || exit 0

jq -n '{decision:"block", reason:"EngineOS gate: code changed but the change was not recorded. Run the record-change skill — mark the changes/ record done, register files + movements, git mv it to archived/. That step clears this flag."}'
exit 0
