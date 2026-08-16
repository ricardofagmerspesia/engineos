#!/usr/bin/env bash
# Test harness for hooks/post-edit-check.sh. Drives the REAL hook against temp
# npm-only package dirs (no pnpm-lock.yaml / yarn.lock, no nx.json).
# Run: hooks/test-post-edit.sh
set -uo pipefail
# Isolate from the operator's bypass switches: a machine-wide pause must never make
# this suite go quiet and report green (hooks/bypass.sh).
export ENGINEOS_BYPASS_FLAG=/nonexistent/engineos.bypass
unset ENGINEOS_BYPASS
DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/post-edit-check.sh"
pass=0; fail=0
ok() { pass=$((pass+1)); }
no() { fail=$((fail+1)); echo "FAIL: $1"; }

command -v jq >/dev/null 2>&1 || { echo "jq required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm required"; exit 1; }

# invoke <file_path> -> sets RC (exit code) and OUT (combined stdout+stderr)
invoke() {
  local file="$1"
  OUT=$(printf '{"tool_input":{"file_path":"%s"}}' "$file" | bash "$HOOK" 2>&1)
  RC=$?
}

# ---------- Case A: lint config present but linter not installed — must NOT block ----------
# A config file existing with no matching binary reachable is a tooling gap, not
# a code defect; the hook must skip lint silently rather than exit 2.
T=$(mktemp -d)
( cd "$T" && git init -q )
printf '{"name":"pkg"}\n' > "$T/package.json"
printf 'module.exports = {};\n' > "$T/.eslintrc.js"
mkdir -p "$T/src"
printf 'export const x = 1;\n' > "$T/src/x.ts"
invoke "$T/src/x.ts"
[ "$RC" -eq 0 ] && ok || no "caseA lint-not-installed: expected exit 0, got $RC (out: $OUT)"
rm -rf "$T"

# ---------- Case B: failing typecheck — must block, exit 2 ----------
T=$(mktemp -d)
( cd "$T" && git init -q )
printf '{"scripts":{"typecheck":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"
printf 'export const x = 1;\n' > "$T/src/x.ts"
invoke "$T/src/x.ts"
[ "$RC" -eq 2 ] && ok || no "caseB failing-typecheck: expected exit 2, got $RC (out: $OUT)"
rm -rf "$T"

# ---------- Case C: non-JS file — no-op ----------
T=$(mktemp -d)
( cd "$T" && git init -q )
printf '{"scripts":{"typecheck":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"
printf '# notes\n' > "$T/src/notes.md"
invoke "$T/src/notes.md"
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok || no "caseC non-js-file: expected silent exit 0, got rc=$RC out=[$OUT]"
rm -rf "$T"

# ---------- Case D: no package.json anywhere up-tree — no-op ----------
T=$(mktemp -d)
mkdir -p "$T/src"
printf 'export const x = 1;\n' > "$T/src/x.ts"
invoke "$T/src/x.ts"
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok || no "caseD no-package-json: expected silent exit 0, got rc=$RC out=[$OUT]"
rm -rf "$T"

echo "---"
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
