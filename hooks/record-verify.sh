#!/usr/bin/env bash
# EngineOS Stop gate: if there are unrecorded changes (flag set by
# mark-unrecorded.sh on code edits, cleared by the record-change skill), block
# ONCE asking for the change to be recorded. Evidence-based — relies on the flag
# file, not transcript text. Never loops (stop_hook_active guard).
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

# already blocked once this stop cycle -> let it through
ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')
[ "$ACTIVE" = "true" ] && exit 0

CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
[ -n "$CWD" ] || exit 0

GITDIR=$(cd "$CWD" 2>/dev/null && git rev-parse --absolute-git-dir 2>/dev/null) || exit 0
[ -f "$GITDIR/ENGINEOS_UNRECORDED" ] || exit 0

jq -n '{decision:"block", reason:"EngineOS gate: code changed but the change was not recorded. Run the record-change skill — mark the changes/ record done, register files + movements, git mv it to archived/. That step clears this flag."}'
exit 0
