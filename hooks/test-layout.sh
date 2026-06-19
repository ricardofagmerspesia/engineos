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

echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
