#!/usr/bin/env bash
# Tests for the standard-layout scaffold: manifest + ensure-project-layout hook.
# Run: hooks/test-layout.sh
set -uo pipefail
# Isolate from the operator's bypass switches: a machine-wide pause must never make
# this suite go quiet and report green (hooks/bypass.sh).
export ENGINEOS_BYPASS_FLAG=/nonexistent/engineos.bypass
unset ENGINEOS_BYPASS
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
pass=0; fail=0; skip=0
ok(){ pass=$((pass+1)); }
no(){ fail=$((fail+1)); echo "FAIL: $1"; }
sk(){ skip=$((skip+1)); echo "SKIP: $1"; }

# --- manifest sources cleanly and is non-empty ---
( source "$DIR/layout-manifest.sh" && [ "${#LAYOUT_MANIFEST[@]}" -ge 6 ] ) \
  && ok || no "manifest did not load 6+ entries"

# --- fresh git repo WITHOUT opt-in: nothing created, one hint line ---
U=$(mktemp -d); ( cd "$U" && git init -q )
OUTU=$(printf '{"cwd":"%s","session_id":"S1"}' "$U" | bash "$DIR/ensure-project-layout.sh")
[ ! -d "$U/docs" ] && [ ! -d "$U/.engineos" ] && ok || no "un-adopted repo was scaffolded without opt-in"
printf '%s' "$OUTU" | grep -q 'opt-in' && ok || no "no opt-in hint line for un-adopted repo"
rm -rf "$U"

# --- ENGINEOS_SCAFFOLD=0 disables even for adopted repos ---
Z=$(mktemp -d); ( cd "$Z" && git init -q ); mkdir "$Z/.engineos"
OUTZ=$(printf '{"cwd":"%s","session_id":"S1"}' "$Z" | ENGINEOS_SCAFFOLD=0 bash "$DIR/ensure-project-layout.sh")
[ -z "$OUTZ" ] && [ ! -d "$Z/docs" ] && ok || no "ENGINEOS_SCAFFOLD=0 did not disable scaffolding"
rm -rf "$Z"

# --- scaffold a fresh git repo (opted in): creates all 6 dirs + seeds, prints one warn line ---
T=$(mktemp -d); ( cd "$T" && git init -q )
OUT=$(printf '{"cwd":"%s","session_id":"S1"}' "$T" | ENGINEOS_SCAFFOLD=1 bash "$DIR/ensure-project-layout.sh")
miss=0
for d in .engineos/changes .engineos/archived .engineos/memory docs/specs docs/prds docs/rules; do
  [ -d "$T/$d" ] || { miss=1; echo "  missing $d"; }
done
[ "$miss" -eq 0 ] && ok || no "scaffold did not create all dirs"
[ -f "$T/docs/specs/README.md" ] && ok || no "specs README not seeded"
[ -f "$T/docs/prds/_template.md" ] && ok || no "prd template not seeded as _template.md"
[ -f "$T/.engineos/changes/_template.md" ] && ok || no "changes template not seeded"
printf '%s' "$OUT" | grep -q '^\[engineos\] scaffolded' && ok || no "no warn line on scaffold"

# --- idempotent: re-run creates nothing, prints nothing ---
OUT2=$(printf '{"cwd":"%s","session_id":"S1"}' "$T" | bash "$DIR/ensure-project-layout.sh")
[ -z "$OUT2" ] && ok || no "re-run was not silent (not idempotent)"

# --- existing file is never overwritten ---
echo "KEEP" > "$T/docs/rules/README.md"
printf '{"cwd":"%s","session_id":"S1"}' "$T" | bash "$DIR/ensure-project-layout.sh" >/dev/null
[ "$(cat "$T/docs/rules/README.md")" = "KEEP" ] && ok || no "existing file overwritten"
rm -rf "$T"

# --- non-git dir: nothing created, no output, exit 0 ---
N=$(mktemp -d)
OUT3=$(printf '{"cwd":"%s","session_id":"S1"}' "$N" | bash "$DIR/ensure-project-layout.sh"); rc=$?
[ "$rc" -eq 0 ] && [ -z "$OUT3" ] && [ ! -d "$N/docs" ] && ok || no "non-git dir was scaffolded"
rm -rf "$N"

# --- engineos repo itself is skipped ---
OUT4=$(printf '{"cwd":"%s","session_id":"S1"}' "$REPO" | bash "$DIR/ensure-project-layout.sh")
[ -z "$OUT4" ] && ok || no "engineos repo not skipped"

# --- no-jq fallback: cwd parsed via grep/sed path still scaffolds ---
# Build a minimal PATH that includes git/grep/sed/etc. but excludes jq.
# On macOS both git and jq live in /usr/bin, so we symlink the needed tools
# into a temp dir and leave jq out.
NOJQ_BIN=$(mktemp -d)
for _t in git grep sed head bash cp mkdir dirname; do
  _p=$(command -v "$_t" 2>/dev/null)
  [ -f "$_p" ] && ln -s "$_p" "$NOJQ_BIN/$_t" 2>/dev/null || true
done
# Environments without usable symlinks (Windows/Git Bash without Developer Mode)
# cannot build the reduced PATH, which would make this assert a false negative.
# Verify the sandbox itself before trusting its result.
# Probe the sandbox by RUNNING git in it — on Windows a symlink to git.exe exists
# and is executable but cannot load its sibling DLLs, so an -x test passes while
# every git call silently produces nothing.
if PATH="$NOJQ_BIN:/bin" git --version >/dev/null 2>&1 \
   && [ -n "$(PATH="$NOJQ_BIN:/bin" git --version 2>/dev/null)" ] \
   && [ -x "$NOJQ_BIN/grep" ] && [ -x "$NOJQ_BIN/sed" ]; then
  J=$(mktemp -d); ( cd "$J" && git init -q )
  OUT5=$(printf '{"cwd":"%s","session_id":"S1"}' "$J" | PATH="$NOJQ_BIN:/bin" ENGINEOS_SCAFFOLD=1 bash "$DIR/ensure-project-layout.sh")
  [ -d "$J/docs/specs" ] && printf '%s' "$OUT5" | grep -q '^\[engineos\] scaffolded' \
    && ok || no "no-jq fallback path did not scaffold"
  rm -rf "$J"
else
  sk "no-jq fallback — cannot build a jq-free PATH here (symlinks unavailable)"
fi
rm -rf "$NOJQ_BIN"
unset NOJQ_BIN _t _p

# --- init-project: one-command adoption ---
# A fake HOME carries the machine-install import line the script gates on, so the
# suite never depends on (or touches) the operator's real ~/.claude/CLAUDE.md.
IP=$(mktemp -d); ( cd "$IP" && git init -q )
HOME_FAKE=$(mktemp -d); mkdir -p "$HOME_FAKE/.claude"
printf '@%s/CLAUDE.md\n' "$REPO" > "$HOME_FAKE/.claude/CLAUDE.md"

# --dry-run first, on the still-untouched project: reports, writes nothing
OUTD=$(HOME="$HOME_FAKE" bash "$REPO/scripts/init-project.sh" --dir "$IP" --dry-run); rc=$?
[ "$rc" -eq 0 ] && printf '%s' "$OUTD" | grep -q 'dry run' && [ ! -d "$IP/.engineos" ] \
  && ok || no "--dry-run did not report cleanly without writing (rc=$rc)"

HOME="$HOME_FAKE" bash "$REPO/scripts/init-project.sh" --dir "$IP" >/dev/null; rc=$?
[ "$rc" -eq 0 ] && ok || no "init did not exit 0 on a fresh git repo (rc=$rc)"
[ -d "$IP/.engineos/changes" ] && ok || no "init did not create .engineos/changes"
[ -f "$IP/CLAUDE.md" ] && ok || no "init did not copy CLAUDE.md"
HOME="$HOME_FAKE" bash "$REPO/scripts/init-project.sh" --dir "$IP" >/dev/null \
  && ok || no "second init failed (not idempotent)"
printf '# mine\n' > "$IP/CLAUDE.md"
HOME="$HOME_FAKE" bash "$REPO/scripts/init-project.sh" --dir "$IP" >/dev/null
[ "$(cat "$IP/CLAUDE.md")" = "# mine" ] && ok || no "init overwrote an existing CLAUDE.md"

EMPTY_HOME=$(mktemp -d); mkdir -p "$EMPTY_HOME/.claude"; : > "$EMPTY_HOME/.claude/CLAUDE.md"
HOME="$EMPTY_HOME" bash "$REPO/scripts/init-project.sh" --dir "$IP" >/dev/null 2>&1; rc=$?
[ "$rc" -eq 1 ] && ok || no "init did not exit 1 without the machine install (rc=$rc)"

HOME="$HOME_FAKE" bash "$REPO/scripts/init-project.sh" --dir "$REPO" >/dev/null 2>&1; rc=$?
[ "$rc" -eq 3 ] && ok || no "init did not refuse the engineos repo (rc=$rc)"

# the SessionStart hook now scaffolds without the hint, because .engineos/ exists
OUT6=$(printf '{"cwd":"%s","session_id":"S1"}' "$IP" | bash "$DIR/ensure-project-layout.sh")
case "$OUT6" in
  *"not scaffolded"*) no "hook still shows the opt-in hint after init" ;;
  *) ok ;;
esac
rm -rf "$IP" "$HOME_FAKE" "$EMPTY_HOME"

echo "---"; echo "pass=$pass fail=$fail skip=$skip"
[ "$fail" -eq 0 ]
