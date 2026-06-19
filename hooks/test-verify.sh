#!/usr/bin/env bash
# Test harness for hooks/stop-verify.sh.
# Drives the REAL hook with npm-only temp repos (no pnpm-lock.yaml / yarn.lock).
# Run: hooks/test-verify.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0
ok() { pass=$((pass+1)); }
no() { fail=$((fail+1)); echo "FAIL: $1"; }

command -v jq >/dev/null 2>&1 || { echo "jq required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm required"; exit 1; }

# ---------- helper: invoke hook, return decision or empty ----------
# invoke <ROOT> <TRANSCRIPT_FILE> <stop_hook_active: true|false>
invoke() {
  local ROOT="$1" TRANSCRIPT="$2" ACTIVE="$3" out
  out=$(printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":%s}' \
    "$ROOT" "$TRANSCRIPT" "$ACTIVE" \
    | bash "$DIR/stop-verify.sh" 2>/dev/null) || true
  printf '%s' "$out" | jq -r '.decision // empty' 2>/dev/null || true
}

# ---------- helper: build a fake transcript recording an Edit of a file ----------
make_transcript() {  # <dest_file> <abs_path_to_changed_file>
  local DEST="$1" FPATH="$2"
  # Uses "tool_input" (harness format); real Claude transcripts use "input".
  # The hook greps "file_path" directly so both forms are extracted correctly.
  printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","tool_input":{"file_path":"%s"}}]}}\n' \
    "$FPATH" > "$DEST"
}

# ---------- Case 1: No package.json — no block ----------
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
mkdir -p "$T/src"
touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false)
rm -rf "$T" "$TSCRIPT"
[ -z "$DEC" ] && ok || no "case1 no-package.json: expected empty decision, got '$DEC'"

# ---------- Case 2: Failing test — block ----------
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"test":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"
touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false)
rm -rf "$T" "$TSCRIPT"
[ "$DEC" = "block" ] && ok || no "case2 failing-test: expected 'block', got '$DEC'"

# ---------- Case 3: Passing test — no block ----------
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"test":"exit 0"}}\n' > "$T/package.json"
mkdir -p "$T/src"
touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false)
rm -rf "$T" "$TSCRIPT"
[ -z "$DEC" ] && ok || no "case3 passing-test: expected empty decision, got '$DEC'"

# ---------- Case 4: Loop guard — stop_hook_active=true, no block even with failing test ----------
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"test":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"
touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" true)
rm -rf "$T" "$TSCRIPT"
[ -z "$DEC" ] && ok || no "case4 loop-guard: expected empty decision with stop_hook_active=true, got '$DEC'"

# ---------- Case 5: No test script — no block ----------
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"lint":"exit 0"}}\n' > "$T/package.json"
mkdir -p "$T/src"
touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false)
rm -rf "$T" "$TSCRIPT"
[ -z "$DEC" ] && ok || no "case5 no-test-script: expected empty decision, got '$DEC'"

# ---------- Case 6: Failing lint, passing test — block (per-step non-test failure) ----------
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"test":"exit 0","lint":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"
touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false)
rm -rf "$T" "$TSCRIPT"
[ "$DEC" = "block" ] && ok || no "case6 failing-lint-pass-test: expected 'block', got '$DEC'"

# ---------- Case 7: Path with spaces — failing test must still block (FIX 1) ----------
# Build a temp repo whose source file lives under a directory whose name contains a space.
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
SPACED_DIR="$T/my pkg"
mkdir -p "$SPACED_DIR/src"
printf '{"scripts":{"test":"exit 1"}}\n' > "$SPACED_DIR/package.json"
touch "$SPACED_DIR/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$SPACED_DIR/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false)
rm -rf "$T" "$TSCRIPT"
[ "$DEC" = "block" ] && ok || no "case7 space-in-path: expected 'block', got '$DEC'"

# ---------- Case 8: Read-only .ts file in a failing-test package — no block ----------
# A transcript that contains only a "Read" tool_use (not Edit/Write) for a .ts file
# must NOT cause a block, even when that package's test script exits 1.
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"test":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"
touch "$T/src/readonly.ts"
TSCRIPT=$(mktemp)
# Emit a Read tool_use line — same shape as make_transcript but tool name is Read.
printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","tool_input":{"file_path":"%s"}}]}}\n' \
  "$T/src/readonly.ts" > "$TSCRIPT"
DEC=$(invoke "$T" "$TSCRIPT" false)
rm -rf "$T" "$TSCRIPT"
[ -z "$DEC" ] && ok || no "case8 read-only-no-block: expected empty decision for Read-only transcript, got '$DEC'"

echo "---"
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
