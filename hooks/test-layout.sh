#!/usr/bin/env bash
# Tests for the standard-layout scaffold: manifest + ensure-project-layout hook.
# Run: hooks/test-layout.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
pass=0; fail=0
ok(){ pass=$((pass+1)); }
no(){ fail=$((fail+1)); echo "FAIL: $1"; }

# --- manifest sources cleanly and is non-empty ---
( source "$DIR/layout-manifest.sh" && [ "${#LAYOUT_MANIFEST[@]}" -ge 6 ] ) \
  && ok || no "manifest did not load 6+ entries"

# --- scaffold a fresh git repo: creates all 6 dirs + seeds, prints one warn line ---
T=$(mktemp -d); ( cd "$T" && git init -q )
OUT=$(printf '{"cwd":"%s","session_id":"S1"}' "$T" | bash "$DIR/ensure-project-layout.sh")
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

echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
