#!/usr/bin/env bash
# EngineOS Stop hook: runs scoped lint + typecheck for packages changed this
# session and blocks finishing if any fail. No-op when there is nothing to run.
# Never blocks on infra quirks — only on genuine red (real lint/type/test failure).
# Tests are opt-in, not part of the default gate (rules/verification.md "Tests are
# opt-in"); ENGINEOS_VERIFY_TESTS=1 folds the test target/script back in.
# The ladder below runs once for every runner: Nx and pnpm/yarn/npm are adapters
# behind hooks/lib-runner.sh, so the timeout table and the infra-vs-red judgment
# are written here exactly once.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=hooks/lib-common.sh
. "$DIR/lib-common.sh"
# shellcheck source=hooks/lib-runner.sh
. "$DIR/lib-runner.sh"

INPUT=$(cat)

# One degradation decision for the whole hook: without jq the grep/sed fallbacks
# below answer for it rather than the gate going silent. Every branch that cares
# tests this variable, never `command -v` again.
HAVE_JQ=0
command -v jq >/dev/null 2>&1 && HAVE_JQ=1

# ---------- field extraction ----------
# Not lib-common's hook_read_envelope: that helper exits 0 without jq, and this
# gate still verifies through the fallback path. Bypass and telemetry do come
# from the library.
if [ "$HAVE_JQ" = 1 ]; then
  ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
  TRANSCRIPT=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)
  CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
  SID=$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"' 2>/dev/null)
else
  # `\(true\|false\)` is a GNU sed extension yielding empty on macOS/BSD sed, so
  # ACTIVE was always empty and the loop guard never fired. grep -E is portable.
  ACTIVE=$(printf '%s' "$INPUT" | grep -oE '"stop_hook_active"[[:space:]]*:[[:space:]]*(true|false)' 2>/dev/null | grep -oE '(true|false)$' | head -1)
  TRANSCRIPT=$(printf '%s' "$INPUT" | sed -n 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  CWD=$(printf '%s' "$INPUT" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi

# ---------- bypass switch ----------
# Checked against CWD, not the raw payload, so the guard survives the no-jq path
# above. bypass.sh arrives with lib-common.sh.
engineos_bypass_active "$CWD" && exit 0

# Hand the library the two envelope fields hook_telemetry reads. The decode
# above stays local; only the emit is shared.
# shellcheck disable=SC2034
HOOK_CWD="$CWD"
# shellcheck disable=SC2034
HOOK_SID="${SID:-nosession}"

# ---------- loop guard ----------
[ "${ACTIVE:-false}" = "true" ] && exit 0

# ---------- validate inputs ----------
[ -f "$TRANSCRIPT" ] || exit 0
[ -n "${CWD:-}" ] || exit 0

# ---------- resolve git root ----------
ROOT=$(repo_root "$CWD") || exit 0
[ -n "$ROOT" ] || exit 0

# ---------- collect changed code files from transcript ----------
# JS/TS-family only: the runners understand package.json/nx targets and nothing
# else, so other extensions would be collected but never verified — a silent
# no-op that reads as coverage. Non-JS stacks verify manually (CLAUDE.md #2).
# Edit/Write/NotebookEdit only, so merely reading a file doesn't pull its package
# in. jq parses the real tool_use structure, so a JSONL line carrying BOTH a Read
# and an Edit can't leak the Read path the way a flat line-grep would; the
# fallback greps "file_path", covering both the harness's "tool_input" and a real
# transcript's "input".
if [ "$HAVE_JQ" = 1 ]; then
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

# A runtime too old to run the toolchain is an infra gap, not a genuine red —
# this hook's own charter. Try the nvm default first; still <18 (no
# structuredClone: ESLint 9 and vitest cannot start) skips verification rather
# than blocking on failures no code edit can fix.
NODE_MAJOR=$(ensure_modern_node)
[ "${NODE_MAJOR:-0}" -lt 18 ] && exit 0

runner_select "$ROOT" "$HAVE_JQ"

# ---------- map files to unique package dirs ----------
# Newline-safe read loop, so paths with spaces are handled correctly.
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

# Strip the delimiting pipes into a newline list; iterate with a here-string so
# FAILED/OUT mutations inside the loop survive (no subshell).
PKG_LIST=$(printf '%s' "$PKG_DIRS" | tr '|' '\n' | grep -v '^$' | sort -u)

# ---------- the verification ladder ----------
# Tests are opt-in (rules/verification.md): lint + typecheck by default, test
# only when the environment asks for it back.
TARGETS="lint typecheck"
[ "${ENGINEOS_VERIFY_TESTS:-}" = "1" ] && TARGETS="lint typecheck test"

FAILED=0
OUT=""
# Wall clock around the whole ladder, for the verification span below. Started
# here and not at the top of the hook: the span measures the checks, not the
# transcript parsing that decided which packages to check.
LADDER_START=$(hook_now_ms)
while IFS= read -r PKG_DIR; do
  [ -n "$PKG_DIR" ] || continue
  [ -d "$PKG_DIR" ] || continue
  HANDLE=$(runner_handle "$PKG_DIR") || continue

  for TARGET in $TARGETS; do
    runner_has_target "$HANDLE" "$TARGET" || continue

    # The one timeout table, applied to whichever runner was selected.
    TIMEOUT=90
    [ "$TARGET" = "test" ] && TIMEOUT=180

    STEP_OUT=$(runner_run "$HANDLE" "$TARGET" "$TIMEOUT") && continue
    # The runner said the target exists, so non-zero is red — unless its own
    # output says the target was never there after all (stale probe).
    runner_infra_skip "$TARGET" "$STEP_OUT" && continue

    FAILED=1
    OUT="${OUT}
--- ${TARGET} failed (${HANDLE}) ---
${STEP_OUT}"
  done
done <<< "$PKG_LIST"

# ---------- decide ----------
# telemetry (best-effort, never affects hook behavior). jq branch only —
# telemetry.sh needs jq anyway, and the loop guard above already exited on the
# second pass, so one stop cycle logs one verify event, never two. Written red
# or green: a green run is half the base-rate usage-report.sh has lacked.
if [ "$HAVE_JQ" = 1 ] && [ "${ENGINEOS_TELEMETRY:-}" != "0" ]; then
  TDATA=$(printf '%s\n' "$PKG_LIST" | grep -v '^$' \
    | sed "s|^$ROOT/||; s|^$ROOT\$|.|" \
    | jq -R . | jq -cs --argjson f "$([ "$FAILED" -eq 1 ] && echo true || echo false)" \
      '{failed: $f, targets: .}')
  hook_telemetry verify "$TDATA"
  # The same stop cycle, as a span: the event above says WHICH packages went
  # red, this line says how long the gate took and whether it passed
  # (rules/observability.md "Agent traces"). Inside this block on purpose, so it
  # inherits the one-event-per-stop-cycle guard the loop guard above provides.
  # model_tier is `cheap`: lint and typecheck are mechanical and invoke no model.
  LADDER_MS=$(( $(hook_now_ms) - LADDER_START ))
  [ "$LADDER_MS" -ge 0 ] || LADDER_MS=0
  # `validate` is the capabilities.json id for "run the target repo's own
  # lint/typecheck/test checks" — exactly this gate. The earlier `verify`
  # resolved against nothing and shadowed the real id (C27f now catches that).
  hook_span verification --capability-id validate --model-tier cheap \
    --status "$([ "$FAILED" -eq 1 ] && echo FAILED || echo OK)" \
    --duration-ms "$LADDER_MS"
fi

[ "$FAILED" -eq 1 ] || exit 0

# Strip leading newline(s) so the JSON reason starts with text, not a blank line.
SUMMARY=$(printf '%s' "$OUT" | sed '/./,$!d' | head -80)
BOUND=""
POLICY="$DIR/../registries/policy.json"
if [ "$HAVE_JQ" = 1 ] && [ -f "$POLICY" ]; then
  MAXFIX=$(jq -r '.repair.max_fix_attempts_per_check // empty' "$POLICY" 2>/dev/null)
  ESC=$(jq -r '.repair.escalations // empty' "$POLICY" 2>/dev/null)
  [ -n "$MAXFIX" ] && [ -n "$ESC" ] && \
    BOUND=" The fix loop is bounded: ${MAXFIX} fix attempts per check, ${ESC} model-tier escalation, then stop and report red — ask scripts/kernel.sh repair --check <id> --attempt <n> at each step (registries/policy.json repair)."
fi
REASON="EngineOS gate: verification failed.${BOUND} ${SUMMARY}"
if [ "$HAVE_JQ" = 1 ]; then
  jq -n --arg r "$REASON" '{decision: "block", reason: $r}'
else
  # minimal block JSON without jq
  printf '{"decision":"block","reason":"EngineOS gate: verification failed — lint/typecheck/test returned non-zero. Fix failures before finishing."}\n'
fi

exit 0
