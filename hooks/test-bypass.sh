#!/usr/bin/env bash
# Dry-run test for the EngineOS bypass switch: with the marker set every hook
# goes quiet (except the prompt hook, which announces the bypass instead), and
# SessionStart expires the marker so it cannot outlive its session.
# Run: hooks/test-bypass.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0
ok(){ pass=$((pass+1)); }
no(){ fail=$((fail+1)); echo "FAIL: $1"; }

command -v jq >/dev/null 2>&1 || { echo "jq required"; exit 1; }
T=$(mktemp -d); ( cd "$T" && git init -q && git commit -q --allow-empty -m init )
GD="$T/.git"
MARKER="$GD/ENGINEOS_BYPASS"

on(){ : >"$MARKER"; }
off(){ rm -f "$MARKER"; }

# additionalContext emitted by a hook for a given payload, or empty
ctx(){ printf '%s' "$2" | bash "$DIR/$1" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null; }

# .decision emitted by a hook, or "none". Capture the output BEFORE piping to jq:
# a silent hook emits nothing, and jq on empty stdin prints nothing at all — the
# `// "none"` fallback needs valid JSON to fire, so silence must be handled here.
dec(){ local out; out=$(printf '%s' "$2" | bash "$DIR/$1"); [ -n "$out" ] || { echo none; return; }
       printf '%s' "$out" | jq -r '.decision // "none"' 2>/dev/null; }

EDIT=$(printf '{"cwd":"%s","session_id":"S1","tool_input":{"file_path":"%s"}}' "$T" "$T/src/api/orders.controller.ts")
AGENT=$(printf '{"cwd":"%s","session_id":"S1","tool_input":{"subagent_type":"backend-coordinator","description":"scoped change"}}' "$T")
PROMPT=$(printf '{"cwd":"%s","session_id":"S1","prompt":"implement all the endpoints across every service"}' "$T")
STOP=$(printf '{"cwd":"%s","session_id":"S1","stop_hook_active":false}' "$T")

# ---------- gates ON (no marker) : hooks behave normally ----------
off
[ -n "$(ctx route-before-change.sh "$EDIT")" ] && ok || no "routing silent without bypass"
[ -n "$(ctx announce-agent-dispatch.sh "$AGENT")" ] && ok || no "dispatch banner silent without bypass"
[ -n "$(ctx announce-agent-return.sh "$AGENT")" ] && ok || no "return banner silent without bypass"
[ -n "$(ctx task-scale-advisor.sh "$PROMPT")" ] && ok || no "scale advisor silent without bypass"

printf '%s' "$EDIT" | bash "$DIR/mark-unrecorded.sh"
[ -f "$GD/ENGINEOS_UNRECORDED.S1" ] && ok || no "mark-unrecorded did not flag without bypass"
[ "$(dec record-verify.sh "$STOP")" = "block" ] && ok || no "record gate did not block without bypass"

# ---------- gates OFF (marker set) : hooks go quiet ----------
on
[ -z "$(ctx route-before-change.sh "$EDIT")" ] && ok || no "routing still fired under bypass"
[ -z "$(ctx announce-agent-dispatch.sh "$AGENT")" ] && ok || no "dispatch banner still fired under bypass"
[ -z "$(ctx announce-agent-return.sh "$AGENT")" ] && ok || no "return banner still fired under bypass"

# record gate must not block even though the unrecorded flag is still set
[ "$(dec record-verify.sh "$STOP")" = "none" ] && ok || no "record gate still blocked under bypass"

# stop-verify must emit nothing at all
[ -z "$(printf '%s' "$STOP" | bash "$DIR/stop-verify.sh")" ] && ok || no "stop-verify still spoke under bypass"

# a fresh code edit must not raise a new unrecorded flag
rm -f "$GD"/ENGINEOS_UNRECORDED*
printf '%s' "$EDIT" | bash "$DIR/mark-unrecorded.sh"
[ -f "$GD/ENGINEOS_UNRECORDED.S1" ] && no "mark-unrecorded flagged under bypass" || ok

# the prompt hook is the one that must SPEAK — a silent bypass is the failure mode
printf '%s' "$(ctx task-scale-advisor.sh "$PROMPT")" | grep -q "BYPASS ACTIVE" && ok \
  || no "scale advisor did not announce the active bypass"

# ---------- lifetime: SessionStart expires the marker ----------
on
printf '{"cwd":"%s","session_id":"S2"}' "$T" | bash "$DIR/ensure-project-layout.sh" >/dev/null 2>&1
[ -f "$MARKER" ] && no "bypass survived SessionStart" || ok

# ---------- CLI ----------
off
[ "$(bash "$DIR/bypass.sh" status "$T")" = "active" ] && ok || no "CLI status wrong when off"
bash "$DIR/bypass.sh" on "$T" >/dev/null
[ "$(bash "$DIR/bypass.sh" status "$T")" = "bypassed" ] && ok || no "CLI on did not set the marker"
bash "$DIR/bypass.sh" off "$T" >/dev/null
[ "$(bash "$DIR/bypass.sh" status "$T")" = "active" ] && ok || no "CLI off did not clear the marker"

# ---------- non-git dir: nothing to bypass, hooks stay normal ----------
NG=$(mktemp -d)
bash "$DIR/bypass.sh" on "$NG" >/dev/null 2>&1 && no "CLI claimed success outside a git repo" || ok
rm -rf "$NG"

rm -rf "$T"
echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
