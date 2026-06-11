#!/usr/bin/env bash
# EngineOS PostToolUse hook (Edit|Write): typecheck + lint the changed package.
# Failure output goes to stderr with exit 2 so Claude sees it and fixes it.
set -uo pipefail

INPUT=$(cat)

if command -v jq >/dev/null 2>&1; then
  FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
else
  FILE=$(printf '%s' "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi

[ -z "$FILE" ] && exit 0
case "$FILE" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

# Walk up to the nearest package.json (the changed package, not monorepo root)
DIR=$(dirname "$FILE")
PKG_DIR=""
while [ "$DIR" != "/" ]; do
  if [ -f "$DIR/package.json" ]; then PKG_DIR="$DIR"; break; fi
  DIR=$(dirname "$DIR")
done
[ -z "$PKG_DIR" ] && exit 0

cd "$PKG_DIR" || exit 0

FAILED=0
OUT=""

has_script() {
  if command -v jq >/dev/null 2>&1; then
    jq -e --arg s "$1" '.scripts[$s] // empty' package.json >/dev/null 2>&1
  else
    grep -q "\"$1\"" package.json
  fi
}

if has_script typecheck; then
  TC_OUT=$(timeout 60 npm run -s typecheck 2>&1) || { FAILED=1; OUT="$OUT\n--- typecheck failed ($PKG_DIR) ---\n$TC_OUT"; }
fi

if has_script lint; then
  LINT_OUT=$(timeout 60 npx --no-install eslint "$FILE" 2>&1) || { FAILED=1; OUT="$OUT\n--- lint failed ($FILE) ---\n$LINT_OUT"; }
fi

if [ "$FAILED" -eq 1 ]; then
  # Truncate so we don't flood context
  printf '%b' "$OUT" | head -60 >&2
  exit 2
fi
exit 0
