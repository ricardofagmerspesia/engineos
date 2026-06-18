#!/usr/bin/env bash
# EngineOS Stop hook: if code files were edited this session but no test/typecheck
# command ever ran, block stop ONCE with a reminder. Best-effort transcript grep.
set -uo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

# Never loop: if we already blocked once, let the stop through.
ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')
[ "$ACTIVE" = "true" ] && exit 0

TRANSCRIPT=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty')
[ -f "$TRANSCRIPT" ] || exit 0

EDITED=$(grep -c '"name":[[:space:]]*"\(Edit\|Write\)"' "$TRANSCRIPT" 2>/dev/null || true)
[ "${EDITED:-0}" -eq 0 ] && exit 0

# Did any code file get touched?
grep -q '"file_path":[[:space:]]*"[^"]*\.\(ts\|tsx\|js\|jsx\|py\|go\|rs\|sql\)"' "$TRANSCRIPT" 2>/dev/null || exit 0

# Did anything verification-shaped run?
if grep -qE '(npm|pnpm|yarn|bun)[^"]*\b(test|typecheck|lint|build)\b|vitest|jest|tsc\b|pytest|go test|cargo test' "$TRANSCRIPT" 2>/dev/null; then
  exit 0
fi

jq -n '{decision: "block", reason: "EngineOS gate: code was edited this session but no tests/typecheck/lint ran. Run verification (typecheck + relevant tests) and show the output before finishing — or state explicitly why verification is not applicable."}'
exit 0
