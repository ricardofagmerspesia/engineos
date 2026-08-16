#!/usr/bin/env bash
# EngineOS Stop hook: runs scoped lint + typecheck for packages changed this
# session and blocks finishing if any fail.
# Tests are opt-in, not part of the default gate — see rules/verification.md
# "Tests are opt-in". Set ENGINEOS_VERIFY_TESTS=1 to fold the test target/script
# back into this gate (any other value, or unset, skips it).
# No-op when there is nothing to run. Never blocks on infra quirks — only on
# genuine red (real lint/type/test failure).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=hooks/lib-common.sh
. "$DIR/lib-common.sh"

INPUT=$(cat)

# ---------- field extraction (jq optional) ----------
if command -v jq >/dev/null 2>&1; then
  ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
  TRANSCRIPT=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)
  CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
  SID=$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"' 2>/dev/null)
else
  # Portable extraction: the BRE alternation `\(true\|false\)` used previously is a
  # GNU sed extension and yields empty on macOS/BSD sed, so ACTIVE was always empty
  # and the loop guard below never fired. grep -E's alternation is POSIX-portable.
  ACTIVE=$(printf '%s' "$INPUT" | grep -oE '"stop_hook_active"[[:space:]]*:[[:space:]]*(true|false)' 2>/dev/null | grep -oE '(true|false)$' | head -1)
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
ROOT=$(repo_root "$CWD") || exit 0
[ -n "$ROOT" ] || exit 0

# ---------- collect changed code files from transcript ----------
# JS/TS-family only: the runner below understands package.json/nx scripts and
# nothing else, so other extensions would be collected but never verified —
# a silent no-op that reads as coverage. Non-JS stacks verify manually (CLAUDE.md #2).
# Scope to Edit/Write/NotebookEdit tool calls only — Read calls are excluded so
# that merely reading a file doesn't pull its package into the test run.
# Prefer jq: it parses the actual tool_use structure (name + input.file_path),
# so a JSONL line that contains BOTH a Read and an Edit block can't leak the
# Read path the way a flat line-grep would. Transcript is JSONL — jq reads a
# stream of top-level JSON values from a file just fine, no need to slurp.
# Note: harness transcripts use "tool_input" while real transcripts use "input";
# the fallback (jq absent) greps "file_path" directly, which handles both forms.
if command -v jq >/dev/null 2>&1; then
  FILES=$(jq -r '
      select(.type == "assistant")
      | .message.content[]?
      | select(.type == "tool_use")
      | select(.name == "Edit" or .name == "Write" or .name == "NotebookEdit")
      | (.input.file_path // .tool_input.file_path // empty)
    ' "$TRANSCRIPT" 2>/dev/null \
    | grep -E '\.(ts|tsx|js|jsx)$' \
    | sort -u) || true
else
  FILES=$(grep -E '"name"[[:space:]]*:[[:space:]]*"(Edit|Write|NotebookEdit)"' "$TRANSCRIPT" 2>/dev/null \
    | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*\.(ts|tsx|js|jsx)"' \
    | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)"/\1/' \
    | sort -u) || true
fi
[ -n "$FILES" ] || exit 0

HAS_NX=0
[ -f "$ROOT/nx.json" ] && HAS_NX=1

# A runtime too old to run the toolchain is an infra gap, not a genuine red —
# this hook's own charter. Try the nvm default first; if node is still <18
# (no structuredClone — ESLint 9 and vitest cannot start), skip verification
# entirely rather than blocking on failures no code edit can fix.
NODE_MAJOR=$(ensure_modern_node)
[ "${NODE_MAJOR:-0}" -lt 18 ] && exit 0

runner_detect "$ROOT"

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
# telemetry (best-effort, never affects hook behavior). jq branch only —
# telemetry.sh needs jq anyway, and this hook only runs verification once per
# stop cycle (the loop guard above already exited on the second pass), so one
# cycle logs one verify event, never two. Written regardless of red or green:
# a green run is half the base-rate usage-report.sh's block count has lacked.
if command -v jq >/dev/null 2>&1 && [ "${ENGINEOS_TELEMETRY:-}" != "0" ]; then
  if TROOT=$(repo_root "$CWD") && [ -d "$TROOT/.engineos" ] && TGIT=$(git_dir "$CWD") && [ -n "$TGIT" ]; then
    mkdir -p "$TGIT/engineos-telemetry" 2>/dev/null || true
    TDATA=$(printf '%s\n' "$PKG_LIST" | grep -v '^$' \
      | sed "s|^$ROOT/||; s|^$ROOT\$|.|" \
      | jq -R . | jq -cs --argjson f "$([ "$FAILED" -eq 1 ] && echo true || echo false)" \
        '{failed: $f, targets: .}')
    "$DIR/../scripts/telemetry.sh" append "$TGIT/engineos-telemetry/$SID.jsonl" \
      --session "$SID" --event verify --data "$TDATA" >/dev/null 2>&1 || true
  fi
fi

if [ "$FAILED" -eq 1 ]; then
  # Strip leading newline(s) so the JSON reason starts with text, not a blank line.
  SUMMARY=$(printf '%s' "$OUT" | sed '/./,$!d' | head -80)
  BOUND=""
  POLICY="$DIR/../registries/policy.json"
  if command -v jq >/dev/null 2>&1 && [ -f "$POLICY" ]; then
    MAXFIX=$(jq -r '.repair.max_fix_attempts_per_check // empty' "$POLICY" 2>/dev/null)
    ESC=$(jq -r '.repair.escalations // empty' "$POLICY" 2>/dev/null)
    [ -n "$MAXFIX" ] && [ -n "$ESC" ] && \
      BOUND=" The fix loop is bounded: ${MAXFIX} fix attempts per check, ${ESC} model-tier escalation, then stop and report red — ask scripts/kernel.sh repair --check <id> --attempt <n> at each step (registries/policy.json repair)."
  fi
  REASON="EngineOS gate: verification failed.${BOUND} ${SUMMARY}"
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg r "$REASON" '{decision: "block", reason: $r}'
  else
    # minimal block JSON without jq
    printf '{"decision":"block","reason":"EngineOS gate: verification failed — lint/typecheck/test returned non-zero. Fix failures before finishing."}\n'
  fi
fi

exit 0
