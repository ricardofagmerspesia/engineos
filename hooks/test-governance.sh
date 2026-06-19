#!/usr/bin/env bash
# Dry-run test for the change-governance marker flow: mark-unrecorded sets a
# session-scoped flag on a code edit; record-verify blocks while it's set for the
# same session, ignores other sessions, never loops; the skill's glob clears it.
# Run: hooks/test-governance.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0
ok(){ pass=$((pass+1)); }
no(){ fail=$((fail+1)); echo "FAIL: $1"; }

command -v jq >/dev/null 2>&1 || { echo "jq required"; exit 1; }
T=$(mktemp -d); ( cd "$T" && git init -q && git commit -q --allow-empty -m init )
GD="$T/.git"

dec(){ local out; out=$(printf '%s' "$1" | bash "$DIR/record-verify.sh"); out=$(printf '%s' "$out" | jq -r '.decision // empty' 2>/dev/null); [ -n "$out" ] && echo "$out" || echo none; }
mark(){ printf '{"cwd":"%s","session_id":"%s","tool_input":{"file_path":"%s"}}' "$T" "$1" "$2" | bash "$DIR/mark-unrecorded.sh"; }

# code edit sets a session-scoped flag
mark S1 "$T/src/foo.ts"
[ -f "$GD/ENGINEOS_UNRECORDED.S1" ] && ok || no "code edit did not set flag"

# edits under .engineos/ or docs/ do NOT set a flag (even code files there)
mark Smeta "$T/.engineos/changes/note.ts"; mark Smeta "$T/docs/gen.ts"
[ -f "$GD/ENGINEOS_UNRECORDED.Smeta" ] && no "excluded-dir edit set a flag" || ok

# same session blocks
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S1","stop_hook_active":false}' "$T")")" = "block" ] && ok || no "same-session did not block"

# different session is NOT blocked (stale isolation)
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S2","stop_hook_active":false}' "$T")")" = "none" ] && ok || no "other session blocked (stale isolation broken)"

# loop guard: stop_hook_active=true never blocks
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S1","stop_hook_active":true}' "$T")")" = "none" ] && ok || no "loop guard failed"

# record-change glob clears the flag
( cd "$T" && rm -f "$(git rev-parse --absolute-git-dir)"/ENGINEOS_UNRECORDED* )
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S1","stop_hook_active":false}' "$T")")" = "none" ] && ok || no "flag not cleared by glob"

rm -rf "$T"
echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
