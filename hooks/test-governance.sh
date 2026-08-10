#!/usr/bin/env bash
# Dry-run test for the change-governance marker flow: mark-unrecorded sets a
# session-scoped flag on a code edit; record-verify blocks while it's set for the
# same session, ignores other sessions, never loops; the record-change skill's
# session-scoped `rm` clears only that session's flag, leaving siblings intact.
# Run: hooks/test-governance.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0
ok(){ pass=$((pass+1)); }
no(){ fail=$((fail+1)); echo "FAIL: $1"; }

command -v jq >/dev/null 2>&1 || { echo "jq required"; exit 1; }
T=$(mktemp -d); ( cd "$T" && git init -q && git commit -q --allow-empty -m init )
GD="$T/.git"
REPO_ROOT="$(cd "$DIR/.." && pwd)"

dec(){ local out; out=$(printf '%s' "$1" | bash "$DIR/record-verify.sh"); out=$(printf '%s' "$out" | jq -r '.decision // empty' 2>/dev/null); [ -n "$out" ] && echo "$out" || echo none; }
mark(){ printf '{"cwd":"%s","session_id":"%s","tool_input":{"file_path":"%s"}}' "$T" "$1" "$2" | bash "$DIR/mark-unrecorded.sh"; }

# code edit sets a session-scoped flag
mark S1 "$T/src/foo.ts"
[ -f "$GD/ENGINEOS_UNRECORDED.S1" ] && ok || no "code edit did not set flag"

# .engineos/ is excluded everywhere (generic — not EngineOS-repo-specific)
mark Smeta "$T/.engineos/changes/note.ts"
[ -f "$GD/ENGINEOS_UNRECORDED.Smeta" ] && no ".engineos/ edit set a flag" || ok

# a consumer project's own docs/ or hooks/ dir is NOT excluded (regression: the
# exclusion used to be unscoped and swallowed React src/hooks/ and product docs/
# in every project, not just EngineOS's own tree)
mark Sproj1 "$T/docs/gen.ts"
[ -f "$GD/ENGINEOS_UNRECORDED.Sproj1" ] && ok || no "consumer project docs/ edit did not set a flag"
mark Sproj2 "$T/src/hooks/useAuth.ts"
[ -f "$GD/ENGINEOS_UNRECORDED.Sproj2" ] && ok || no "consumer project src/hooks/ edit did not set a flag"
rm -f "$GD"/ENGINEOS_UNRECORDED.Sproj1 "$GD"/ENGINEOS_UNRECORDED.Sproj2

# EngineOS's own hooks/ and docs/ trees ARE excluded (avoid noisy self-routing).
# mark-unrecorded.sh only inspects the $FILE string (no filesystem read), so a
# synthetic path under the real hooks/ and docs/ dirs exercises the exclusion
# without needing the file to exist.
mark Seos1 "$DIR/fake-for-test.ts"
[ -f "$GD/ENGINEOS_UNRECORDED.Seos1" ] && no "EngineOS's own hooks/ file set a flag" || ok
mark Seos2 "$REPO_ROOT/docs/fake-for-test.ts"
[ -f "$GD/ENGINEOS_UNRECORDED.Seos2" ] && no "EngineOS's own docs/ file set a flag" || ok

# same session blocks
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S1","stop_hook_active":false}' "$T")")" = "block" ] && ok || no "same-session did not block"

# different session is NOT blocked (stale isolation)
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S2","stop_hook_active":false}' "$T")")" = "none" ] && ok || no "other session blocked (stale isolation broken)"

# loop guard: stop_hook_active=true never blocks
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S1","stop_hook_active":true}' "$T")")" = "none" ] && ok || no "loop guard failed"

# session-scoped clearing: mark a second session, then clear ONLY S1 the way the
# record-change skill does (`rm -f ".../ENGINEOS_UNRECORDED.$CLAUDE_SESSION_ID"`,
# not a blanket glob) — S2's flag must survive untouched.
mark S2 "$T/src/bar.ts"
[ -f "$GD/ENGINEOS_UNRECORDED.S2" ] && ok || no "second session did not set flag"
rm -f "$GD/ENGINEOS_UNRECORDED.S1"
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S1","stop_hook_active":false}' "$T")")" = "none" ] && ok || no "flag not cleared by session-scoped rm"
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S2","stop_hook_active":false}' "$T")")" = "block" ] && ok || no "sibling session's flag was wiped by another session's clear"

# defer escape hatch: marker silences the gate for that session only, without
# deleting the debt flag itself
touch "$GD/ENGINEOS_UNRECORDED.S2.deferred"
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S2","stop_hook_active":false}' "$T")")" = "none" ] && ok || no "defer marker did not silence the gate"
[ -f "$GD/ENGINEOS_UNRECORDED.S2" ] && ok || no "defer removed the debt flag (it must only silence)"
mark S3 "$T/src/baz.ts"
[ "$(dec "$(printf '{"cwd":"%s","session_id":"S3","stop_hook_active":false}' "$T")")" = "block" ] && ok || no "another session inherited S2's defer"

rm -rf "$T"
echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
