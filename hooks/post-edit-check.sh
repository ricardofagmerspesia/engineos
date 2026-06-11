#!/usr/bin/env bash
# EngineOS PostToolUse hook (Edit|Write): typecheck + lint the changed code.
# Tool-aware: detects biome/eslint for lint, nx/package-script for typecheck,
# pnpm/yarn/npm for the runner. Scopes to the changed package, not the whole repo.
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
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

# ---------- locate package dir and repo root ----------
find_up() {  # find_up <start_dir> <filename...> ; echoes dir containing first match
  local d="$1"; shift
  while [ "$d" != "/" ]; do
    for f in "$@"; do [ -e "$d/$f" ] && { echo "$d"; return 0; }; done
    d=$(dirname "$d")
  done
  return 1
}

START=$(dirname "$FILE")
PKG_DIR=$(find_up "$START" package.json project.json) || exit 0
ROOT=$(find_up "$START" nx.json pnpm-workspace.yaml .git) || ROOT="$PKG_DIR"

has_script() {  # has_script <dir> <script>
  command -v jq >/dev/null 2>&1 || { grep -q "\"$2\"" "$1/package.json" 2>/dev/null; return; }
  [ -f "$1/package.json" ] && jq -e --arg s "$2" '.scripts[$s] // empty' "$1/package.json" >/dev/null 2>&1
}

# portable timeout: GNU timeout, gtimeout (brew coreutils), or no-op fallback
if   command -v timeout  >/dev/null 2>&1; then TO() { timeout "$@"; }
elif command -v gtimeout >/dev/null 2>&1; then TO() { gtimeout "$@"; }
else                                          TO() { shift; "$@"; }; fi

# runner: pnpm > yarn > npm, based on lockfile at root
if   [ -f "$ROOT/pnpm-lock.yaml" ]; then RUN="pnpm"; EXEC="pnpm exec"
elif [ -f "$ROOT/yarn.lock" ];     then RUN="yarn"; EXEC="yarn"
else                                    RUN="npm run"; EXEC="npx --no-install"; fi

FAILED=0
OUT=""

# ---------- typecheck ----------
if [ -f "$ROOT/nx.json" ] && command -v jq >/dev/null 2>&1; then
  # Nx: run the changed project's typecheck target only (scoped, not run-many --all)
  PROJ=""
  [ -f "$PKG_DIR/project.json" ] && PROJ=$(jq -r '.name // empty' "$PKG_DIR/project.json")
  [ -z "$PROJ" ] && [ -f "$PKG_DIR/package.json" ] && PROJ=$(jq -r '.name // empty' "$PKG_DIR/package.json" | sed 's/^@[^/]*\///')
  if [ -n "$PROJ" ]; then
    TC=$( (cd "$ROOT" && TO 90 $EXEC nx run "$PROJ:typecheck" 2>&1) ) \
      || { FAILED=1; OUT="$OUT\n--- typecheck failed ($PROJ) ---\n$TC"; }
  fi
elif has_script "$PKG_DIR" typecheck; then
  TC=$( (cd "$PKG_DIR" && TO 90 $RUN -s typecheck 2>&1) ) \
    || { FAILED=1; OUT="$OUT\n--- typecheck failed ($PKG_DIR) ---\n$TC"; }
fi

# ---------- lint (single file — fast) ----------
if find_up "$START" biome.json biome.jsonc >/dev/null 2>&1; then
  LINT=$( (cd "$ROOT" && TO 45 $EXEC biome check "$FILE" 2>&1) ) \
    || { FAILED=1; OUT="$OUT\n--- biome failed ($FILE) ---\n$LINT"; }
elif find_up "$START" .eslintrc .eslintrc.js .eslintrc.cjs .eslintrc.json eslint.config.js eslint.config.mjs >/dev/null 2>&1; then
  LINT=$( (cd "$ROOT" && TO 45 $EXEC eslint "$FILE" 2>&1) ) \
    || { FAILED=1; OUT="$OUT\n--- eslint failed ($FILE) ---\n$LINT"; }
fi

if [ "$FAILED" -eq 1 ]; then
  printf '%b' "$OUT" | head -80 >&2
  exit 2
fi
exit 0
