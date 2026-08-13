#!/usr/bin/env bash
# EngineOS Stop hook: runs scoped lint + typecheck for packages changed this
# session and blocks finishing if any fail.
# Tests are opt-in, not part of the default gate — see rules/verification.md
# "Tests are opt-in". Set ENGINEOS_VERIFY_TESTS=1 to fold the test target/script
# back into this gate (any other value, or unset, skips it).
# No-op when there is nothing to run. Never blocks on infra quirks — only on
# genuine red (real lint/type/test failure).
set -uo pipefail

INPUT=$(cat)

# ---------- field extraction (jq optional) ----------
if command -v jq >/dev/null 2>&1; then
  ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')
  TRANSCRIPT=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty')
  CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
else
  ACTIVE=$(printf '%s' "$INPUT" | sed -n 's/.*"stop_hook_active"[[:space:]]*:[[:space:]]*\(true\|false\).*/\1/p' | head -1)
  TRANSCRIPT=$(printf '%s' "$INPUT" | sed -n 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  CWD=$(printf '%s' "$INPUT" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi

# ---------- bypass switch ----------
# Checked against CWD rather than the raw payload so the guard survives the
# no-jq path above, same as every other field here.
# shellcheck source=hooks/bypass.sh
. "$(cd "$(dirname "$0")" && pwd)/bypass.sh"
engineos_bypass_active "$CWD" && exit 0

# ---------- loop guard ----------
[ "${ACTIVE:-false}" = "true" ] && exit 0

# ---------- validate inputs ----------
[ -f "$TRANSCRIPT" ] || exit 0
[ -n "${CWD:-}" ] || exit 0

# ---------- resolve git root ----------
ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null) || exit 0

# ---------- collect changed code files from transcript ----------
# Scope to Edit/Write tool calls only — Read calls are excluded so that merely
# reading a file doesn't pull its package into the test run.
# JSONL: each tool call is one line that contains both "name":"Edit"|"Write" and
# "file_path". Select matching lines first, then extract the path.
# Note: harness transcripts use "tool_input" while real transcripts use "input";
# extracting "file_path" directly handles both forms.
FILES=$(grep -E '"name"[[:space:]]*:[[:space:]]*"(Edit|Write)"' "$TRANSCRIPT" 2>/dev/null \
  | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*\.(ts|tsx|js|jsx|py|go|rs)"' \
  | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)"/\1/' \
  | sort -u) || true
[ -n "$FILES" ] || exit 0

# ---------- helpers (copied verbatim from post-edit-check.sh style) ----------
find_up() {  # find_up <start_dir> <filename...> ; echoes dir containing first match
  local d="$1" prev=""; shift
  while [ "$d" != "/" ] && [ "$d" != "$prev" ] && [ -n "$d" ]; do
    for f in "$@"; do [ -e "$d/$f" ] && { echo "$d"; return 0; }; done
    prev="$d"; d=$(dirname "$d")
  done
  return 1
}

has_script() {  # has_script <dir> <script>
  command -v jq >/dev/null 2>&1 || { grep -q "\"$2\"" "$1/package.json" 2>/dev/null; return; }
  [ -f "$1/package.json" ] && jq -e --arg s "$2" '.scripts[$s] // empty' "$1/package.json" >/dev/null 2>&1
}

# portable timeout: GNU timeout, gtimeout (brew coreutils), or no-op fallback
if   command -v timeout  >/dev/null 2>&1; then TO() { timeout "$@"; }
elif command -v gtimeout >/dev/null 2>&1; then TO() { gtimeout "$@"; }
else                                          TO() { shift; "$@"; }; fi

# runner: pnpm > yarn > npm, based on lockfile at root
if   [ -f "$ROOT/pnpm-lock.yaml" ]; then RUN="pnpm run"; EXEC="pnpm exec"
elif [ -f "$ROOT/yarn.lock" ];      then RUN="yarn run"; EXEC="yarn"
else                                     RUN="npm run";  EXEC="npx --no-install"; fi

# ---------- map files to unique package dirs ----------
# Use newline-safe read loop so paths with spaces are handled correctly.
PKG_DIRS=""
while IFS= read -r FILE; do
  [ -n "$FILE" ] || continue
  DIR_OF=$(dirname "$FILE")
  PKG=$(find_up "$DIR_OF" package.json project.json 2>/dev/null) || continue
  # dedupe: only add if not already present
  case "$PKG_DIRS" in
    *"|${PKG}|"*) ;;  # already have it
    *) PKG_DIRS="${PKG_DIRS}|${PKG}|" ;;
  esac
done <<< "$FILES"
[ -n "$PKG_DIRS" ] || exit 0

# ---------- run scoped verification ----------
FAILED=0
OUT=""

# strip leading/trailing pipes into newline-delimited list; iterate with here-string
# so FAILED/OUT mutations inside the loop survive (no subshell).
PKG_LIST=$(printf '%s' "$PKG_DIRS" | tr '|' '\n' | grep -v '^$' | sort -u)

HAS_NX=0
[ -f "$ROOT/nx.json" ] && HAS_NX=1

# ---------- verification target list ----------
# Tests are opt-in per rules/verification.md "Tests are opt-in": lint + typecheck run
# by default, test only joins when the environment explicitly asks for it back.
TARGETS="lint typecheck"
[ "${ENGINEOS_VERIFY_TESTS:-}" = "1" ] && TARGETS="lint typecheck test"

while IFS= read -r PKG_DIR; do
  [ -n "$PKG_DIR" ] || continue
  [ -d "$PKG_DIR" ] || continue

  if [ "$HAS_NX" -eq 1 ] && command -v jq >/dev/null 2>&1; then
    # ---------- Nx path ----------
    PROJ=""
    [ -f "$PKG_DIR/project.json" ] && PROJ=$(jq -r '.name // empty' "$PKG_DIR/project.json" 2>/dev/null)
    [ -z "$PROJ" ] && [ -f "$PKG_DIR/package.json" ] && \
      PROJ=$(jq -r '.name // empty' "$PKG_DIR/package.json" 2>/dev/null | sed 's/^@[^/]*\///')
    [ -n "$PROJ" ] || continue

    for TARGET in $TARGETS; do
      # check target existence
      TARGET_EXISTS=0
      NX_SHOW=$( (cd "$ROOT" && $EXEC nx show project "$PROJ" --json 2>/dev/null) ) && \
        printf '%s' "$NX_SHOW" | jq -e --arg t "$TARGET" '.targets[$t] // empty' >/dev/null 2>&1 && \
        TARGET_EXISTS=1

      [ "$TARGET_EXISTS" -eq 1 ] || continue

      TIMEOUT=90
      [ "$TARGET" = "test" ] && TIMEOUT=180

      STEP_OUT=$( (cd "$ROOT" && TO "$TIMEOUT" $EXEC nx run "${PROJ}:${TARGET}" 2>&1) ) && continue

      # TARGET_EXISTS=1 means nx show confirmed the target; any non-zero here is a real failure.
      # Only apply an anchored nx-phrase check as a last-resort guard in case nx show
      # itself gave a false positive (e.g. stale cache). Anchored to Nx's actual output
      # only — never applied to test/lint output more broadly.
      if printf '%s' "$STEP_OUT" | grep -qiE \
          "cannot find (project|target) |does not have (a|an) .* target|cannot find configuration for task"; then
        continue  # target genuinely absent despite nx show — infra skip
      fi

      FAILED=1
      OUT="${OUT}
--- ${TARGET} failed (${PROJ}) ---
${STEP_OUT}"
    done

  else
    # ---------- non-Nx path ----------
    for SCRIPT in $TARGETS; do
      has_script "$PKG_DIR" "$SCRIPT" || continue

      TIMEOUT=90
      [ "$SCRIPT" = "test" ] && TIMEOUT=180

      STEP_OUT=$( (cd "$PKG_DIR" && TO "$TIMEOUT" $RUN -s "$SCRIPT" 2>&1) ) && continue

      FAILED=1
      OUT="${OUT}
--- ${SCRIPT} failed (${PKG_DIR}) ---
${STEP_OUT}"
    done
  fi
done <<< "$PKG_LIST"

# ---------- decide ----------
if [ "$FAILED" -eq 1 ]; then
  # Strip leading newline(s) so the JSON reason starts with text, not a blank line.
  SUMMARY=$(printf '%s' "$OUT" | sed '/./,$!d' | head -80)
  REASON="EngineOS gate: verification failed. ${SUMMARY}"
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg r "$REASON" '{decision: "block", reason: $r}'
  else
    # minimal block JSON without jq
    printf '{"decision":"block","reason":"EngineOS gate: verification failed — lint/typecheck/test returned non-zero. Fix failures before finishing."}\n'
  fi
fi

exit 0
