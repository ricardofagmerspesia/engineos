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

hook_read_envelope
engineos_bypass_active "$HOOK_CWD" && exit 0

[ -z "$HOOK_FILE" ] && exit 0

# only code changes count
case "$HOOK_FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.py|*.go|*.rs|*.sql) ;;
  *) exit 0 ;;
esac
# never flag edits to our own scaffolding/meta
case "$HOOK_FILE" in
  */.engineos/*) exit 0 ;;
esac
# EngineOS's own meta dirs, read from registries/routing.json (.excluded.self_dirs)
# and resolved against THIS checkout's root — the same list and the same
# resolution scripts/kernel.sh route-path uses, so the two cannot drift. Scoping
# to these exact paths (not any hooks/ or docs/ anywhere) is what keeps a consumer
# project's own src/hooks/ or product docs/ flagged.
EOS_ROOT="$(cd "$DIR/.." && pwd)"
EOS_SELF_DIRS=$(jq -r '.excluded.self_dirs[]?' "$EOS_ROOT/registries/routing.json" 2>/dev/null)

while IFS= read -r d; do
  [ -n "$d" ] || continue
  case "$HOOK_FILE" in
    "$EOS_ROOT/$d"/*) exit 0 ;;
  esac
done <<EOF
$EOS_SELF_DIRS
EOF

[ -n "$HOOK_CWD" ] || exit 0
GITDIR=$(git_dir "$HOOK_CWD") || exit 0
[ -n "$GITDIR" ] || exit 0

: > "$GITDIR/ENGINEOS_UNRECORDED.$HOOK_SID" 2>/dev/null || true
exit 0
