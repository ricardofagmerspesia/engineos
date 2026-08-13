#!/usr/bin/env bash
# EngineOS per-edit typecheck + lint — NOT wired by default.
# Verification runs ONCE at task finalization via the Stop hooks (stop-verify.sh);
# a blocking check after every Edit/Write stalled the build loop, so this hook was
# unwired from hooks.json (see .engineos change record
# 2026-08-08-verify-at-end-distribute-always + rules/verification.md "The final
# gate"). Teams that want per-edit gating back can
# re-add it under PostToolUse(Edit|Write) in hooks/hooks.json.
# Tool-aware: detects biome/eslint for lint, nx/package-script for typecheck,
# pnpm/yarn/npm for the runner. Scopes to the changed package, not the whole repo.
# Failure output goes to stderr with exit 2 so Claude sees it and fixes it.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=hooks/lib-common.sh
. "$DIR/lib-common.sh"

INPUT=$(cat)

# shellcheck source=hooks/bypass.sh
. "$DIR/bypass.sh"
engineos_bypass_active_for_payload "$INPUT" && exit 0

if command -v jq >/dev/null 2>&1; then
  FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
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
START=$(dirname "$FILE")
PKG_DIR=$(find_up "$START" package.json project.json) || exit 0
ROOT=$(find_up "$START" nx.json pnpm-workspace.yaml .git) || ROOT="$PKG_DIR"

runner_detect "$ROOT"

FAILED=0
OUT=""

# ---------- typecheck ----------
if [ -f "$ROOT/nx.json" ] && command -v jq >/dev/null 2>&1; then
  # Nx: run the changed project's typecheck target only (scoped, not run-many --all)
  PROJ=""
  [ -f "$PKG_DIR/project.json" ] && PROJ=$(jq -r '.name // empty' "$PKG_DIR/project.json" 2>/dev/null)
  [ -z "$PROJ" ] && [ -f "$PKG_DIR/package.json" ] && PROJ=$(jq -r '.name // empty' "$PKG_DIR/package.json" 2>/dev/null | sed 's/^@[^/]*\///')
  if [ -n "$PROJ" ]; then
    TC=$( (cd "$ROOT" && TO 90 $EXEC nx run "$PROJ:typecheck" 2>&1) ) \
      || { FAILED=1; OUT="$OUT\n--- typecheck failed ($PROJ) ---\n$TC"; }
  fi
elif has_script "$PKG_DIR" typecheck; then
  TC=$( (cd "$PKG_DIR" && TO 90 $RUN -s typecheck 2>&1) ) \
    || { FAILED=1; OUT="$OUT\n--- typecheck failed ($PKG_DIR) ---\n$TC"; }
fi

# ---------- lint (single file — fast) ----------
# Probe the binary before running it: a config file existing but the linter not
# being installed is a tooling gap, not a code defect — must not block the edit.
if find_up "$START" biome.json biome.jsonc >/dev/null 2>&1; then
  if (cd "$ROOT" && $EXEC biome --version >/dev/null 2>&1); then
    LINT=$( (cd "$ROOT" && TO 45 $EXEC biome check "$FILE" 2>&1) ) \
      || { FAILED=1; OUT="$OUT\n--- biome failed ($FILE) ---\n$LINT"; }
  fi
elif find_up "$START" .eslintrc .eslintrc.js .eslintrc.cjs .eslintrc.json eslint.config.js eslint.config.mjs >/dev/null 2>&1; then
  if (cd "$ROOT" && $EXEC eslint --version >/dev/null 2>&1); then
    LINT=$( (cd "$ROOT" && TO 45 $EXEC eslint "$FILE" 2>&1) ) \
      || { FAILED=1; OUT="$OUT\n--- eslint failed ($FILE) ---\n$LINT"; }
  fi
fi

if [ "$FAILED" -eq 1 ]; then
  printf '%b' "$OUT" | head -80 >&2
  exit 2
fi
exit 0
