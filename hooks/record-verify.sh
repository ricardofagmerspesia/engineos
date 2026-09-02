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

hook_read_envelope
engineos_bypass_active "$HOOK_CWD" && exit 0

# already blocked once this stop cycle -> let it through
[ "$HOOK_STOP_ACTIVE" = "true" ] && exit 0

[ -n "$HOOK_CWD" ] || exit 0
GITDIR=$(git_dir "$HOOK_CWD") || exit 0
[ -n "$GITDIR" ] || exit 0

[ -f "$GITDIR/ENGINEOS_UNRECORDED.$HOOK_SID" ] || exit 0

# Escape hatch: an explicit defer marker silences the gate for this session
# without deleting the debt flag, so declining to record is a one-touch action
# instead of a manual rm inside .git. Reaped with the flags after 7 days.
[ -f "$GITDIR/ENGINEOS_UNRECORDED.$HOOK_SID.deferred" ] && exit 0

jq -n --arg defer "$GITDIR/ENGINEOS_UNRECORDED.$HOOK_SID.deferred" \
  '{decision:"block", reason:("EngineOS gate: code changed but the change was not recorded. Run the record-change skill — mark the changes/ record done, register files + movements, git mv it to archived/. That step clears this flag. To defer recording for this session instead, create the marker: touch \"" + $defer + "\"")}'
exit 0
