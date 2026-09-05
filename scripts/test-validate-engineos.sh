#!/usr/bin/env bash
# Harness tests for scripts/validate-engineos.sh — the shim over
# `engineos validate`. The planted-breakage cases that used to live here were
# ported, family by family, to src/checks/<family>.test.ts as assertions on
# findings (design deviation 8); what remains is the public surface of the
# validator itself: --list, --only selection, exit codes, and a clean run.
# Run: scripts/test-validate-engineos.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pass=0; fail=0
hok() { pass=$((pass+1)); printf 'ok   %s\n' "$1"; }
hno() { fail=$((fail+1)); printf 'FAIL %s\n' "$1"; }

echo "== validate-engineos harness =="

LISTED=$(cd "$ROOT" && bash scripts/validate-engineos.sh --list); LIST_RC=$?
COUNT=$(printf '%s\n' "$LISTED" | grep -c '^C[0-9][0-9]*[a-z]*$')
if [ "$LIST_RC" -eq 0 ] && [ "$COUNT" -eq 62 ] && [ "$(printf '%s\n' "$LISTED" | head -1)" = "C1" ] && [ "$(printf '%s\n' "$LISTED" | tail -1)" = "C31" ]; then
  hok "--list prints the 62 registered Checks in natural order (C1 first, C31 last)"
else
  hno "--list drifted (rc=$LIST_RC, $COUNT ids): $(printf '%s' "$LISTED" | tr '\n' ' ')"
fi

H_OUT=$(cd "$ROOT" && bash scripts/validate-engineos.sh --only C0nope 2>&1); H_RC=$?
case "$H_RC:$H_OUT" in
  2:*"unknown check id"*) hok "--only with an id no Check answers to exits 2" ;;
  *) hno "--only with an unknown id exited $H_RC instead of 2: $H_OUT" ;;
esac

H_OUT=$(cd "$ROOT" && bash scripts/validate-engineos.sh --bogus 2>&1); H_RC=$?
case "$H_RC:$H_OUT" in
  2:*"unknown argument"*) hok "an unknown argument exits 2" ;;
  *) hno "an unknown argument exited $H_RC instead of 2: $H_OUT" ;;
esac

PARENT_OUT=$(cd "$ROOT" && bash scripts/validate-engineos.sh --only C17 2>&1)
CHILD_OUT=$(cd "$ROOT" && bash scripts/validate-engineos.sh --only C17c 2>&1)
PARENT=$(printf '%s\n' "$PARENT_OUT" | grep -c '^ok  ')
CHILD=$(printf '%s\n' "$CHILD_OUT" | grep -c '^ok  ')
CHILD_LINE=$(printf '%s\n' "$CHILD_OUT" | grep -m1 '^ok  ')
case "
$PARENT_OUT
" in *"
$CHILD_LINE
"*) PARENT_COVERS_CHILD=true ;; *) PARENT_COVERS_CHILD=false ;; esac
if [ "$CHILD" -ge 1 ] && [ "$PARENT" -gt "$CHILD" ] && [ "$PARENT_COVERS_CHILD" = true ]; then
  hok "--only C17 runs its letter-suffixed sub-checks, --only C17c runs only C17c"
else
  hno "--only parent/sub-check selection is wrong (C17 emitted $PARENT ok lines, C17c emitted $CHILD)"
fi

FULL_OUT=$(cd "$ROOT" && bash scripts/validate-engineos.sh 2>&1); FULL_RC=$?
FIRST=$(printf '%s\n' "$FULL_OUT" | head -1)
LAST=$(printf '%s\n' "$FULL_OUT" | tail -1)
case "$FULL_RC:$FIRST:$LAST" in
  0:"== EngineOS integrity ==":"passed "*", failed 0") hok "a clean tree validates green with the header and summary line intact" ;;
  *) hno "the unfiltered run is not green (rc=$FULL_RC): first='$FIRST' last='$LAST'" ;;
esac

# A planted failure must flip the exit code: copy the tree, break one invariant
# the always-on rule check owns, and expect red from the copy — not from here.
H_TMP=$(mktemp -d) || exit 1
( cd "$ROOT" && tar --exclude=.git --exclude=node_modules --exclude=build -cf - . ) | ( cd "$H_TMP" && tar -xf - )
rm -f "$H_TMP/rules/base.md"
H_OUT=$(cd "$H_TMP" && bash scripts/validate-engineos.sh --only C2 2>&1); H_RC=$?
rm -rf "$H_TMP"
case "$H_RC:$H_OUT" in
  1:*"FAIL "*) hok "a planted failure in a copied tree flips the exit code to 1 and prints a FAIL line" ;;
  *) hno "a planted failure was not caught (rc=$H_RC): $H_OUT" ;;
esac

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
