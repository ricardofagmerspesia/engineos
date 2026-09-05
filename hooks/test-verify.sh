#!/usr/bin/env bash
# Test harness for hooks/stop-verify.sh.
# Drives the REAL hook with npm-only temp repos (no pnpm-lock.yaml / yarn.lock).
# Tests are opt-in in the gate itself (rules/verification.md "Tests are opt-in"): the
# default TARGETS list is "lint typecheck" and ENGINEOS_VERIFY_TESTS=1 is what
# folds "test" back in. Cases below invoke() with an explicit env value so both
# states are covered instead of relying on whatever leaked into this shell.
# Run: hooks/test-verify.sh
set -uo pipefail
# Isolate from the operator's bypass switches: a machine-wide pause must never make
# this suite go quiet and report green (hooks/bypass.sh).
export ENGINEOS_BYPASS_FLAG=/nonexistent/engineos.bypass
unset ENGINEOS_BYPASS
DIR="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0; skip=0
ok() { pass=$((pass+1)); }
no() { fail=$((fail+1)); echo "FAIL: $1"; }
sk() { skip=$((skip+1)); echo "SKIP: $1"; }

command -v jq >/dev/null 2>&1 || { echo "jq required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm required"; exit 1; }

# ---------- helper: invoke hook, return decision or empty ----------
# invoke <ROOT> <TRANSCRIPT_FILE> <stop_hook_active: true|false> [ENGINEOS_VERIFY_TESTS]
invoke() {
  local ROOT="$1" TRANSCRIPT="$2" ACTIVE="$3" VERIFY_TESTS="${4:-}" out
  out=$(printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":%s}' \
    "$ROOT" "$TRANSCRIPT" "$ACTIVE" \
    | ENGINEOS_VERIFY_TESTS="$VERIFY_TESTS" bash "$DIR/stop-verify.sh" 2>/dev/null) || true
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

# ---------- helper: one JSONL line with BOTH a Read and an Edit tool_use ----------
# make_mixed_transcript <dest_file> <read_path> <edit_path>
make_mixed_transcript() {
  jq -nc --arg r "$2" --arg e "$3" '
    {type:"assistant", message:{content:[
      {type:"tool_use", name:"Read", tool_input:{file_path:$r}},
      {type:"tool_use", name:"Edit", tool_input:{file_path:$e}}
    ]}}' > "$1"
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

# ---------- Case 2: Failing test, tests NOT opted in (default) — no block ----------
# rules/verification.md "Tests are opt-in": with ENGINEOS_VERIFY_TESTS unset, "test"
# is not in the default TARGETS list, so a package whose only script is a
# failing test must not block the gate.
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"test":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"
touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false)
rm -rf "$T" "$TSCRIPT"
[ -z "$DEC" ] && ok || no "case2 failing-test-not-opted-in: expected empty decision, got '$DEC'"

# ---------- Case 2b: Failing test, ENGINEOS_VERIFY_TESTS=1 — block ----------
# Same package as case 2, but with the opt-in flag set: "test" joins TARGETS and
# the failing script must now block.
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"test":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"
touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false "1")
rm -rf "$T" "$TSCRIPT"
[ "$DEC" = "block" ] && ok || no "case2b failing-test-opted-in: expected 'block', got '$DEC'"

# ---------- Case 3: Passing test, ENGINEOS_VERIFY_TESTS=1 — no block ----------
# Proves the opt-in path itself doesn't spuriously block when the test actually passes.
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"test":"exit 0"}}\n' > "$T/package.json"
mkdir -p "$T/src"
touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false "1")
rm -rf "$T" "$TSCRIPT"
[ -z "$DEC" ] && ok || no "case3 passing-test-opted-in: expected empty decision, got '$DEC'"

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

# ---------- Case 7: Path with spaces — failing opted-in test must still block (FIX 1) ----------
# Build a temp repo whose source file lives under a directory whose name contains a space.
# Uses ENGINEOS_VERIFY_TESTS=1 since "test" only runs opted-in; this still proves the
# space-in-path handling blocks correctly once test is part of TARGETS.
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
SPACED_DIR="$T/my pkg"
mkdir -p "$SPACED_DIR/src"
printf '{"scripts":{"test":"exit 1"}}\n' > "$SPACED_DIR/package.json"
touch "$SPACED_DIR/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$SPACED_DIR/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false "1")
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

# ---------- Case 9: Read+Edit on ONE JSONL line, Read's package fails — no block ----------
# A flat line-grep can't tell which tool_use a "file_path" belongs to on a line
# that contains both a Read and an Edit block; the jq path must exclude the Read
# file's package (failing) and only pick up the Edit file's package (passing).
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"test":"exit 0"}}\n' > "$T/package.json"
mkdir -p "$T/src"; touch "$T/src/edited.ts"
mkdir -p "$T/pkgR/src"
printf '{"scripts":{"test":"exit 1"}}\n' > "$T/pkgR/package.json"
touch "$T/pkgR/src/readonly.ts"
TSCRIPT=$(mktemp)
make_mixed_transcript "$TSCRIPT" "$T/pkgR/src/readonly.ts" "$T/src/edited.ts"
DEC=$(invoke "$T" "$TSCRIPT" false)
rm -rf "$T" "$TSCRIPT"
[ -z "$DEC" ] && ok || no "case9 mixed-read-edit-line: expected empty decision (Read's failing package excluded), got '$DEC'"

# ---------- Case 10: no-jq PATH — stop_hook_active=true must not block ----------
# Historically this covered the hook's own jq-free fallback: the pre-fix
# extraction used a GNU-only sed BRE alternation (\(true\|false\)) that yields
# empty on macOS/BSD sed, so the loop guard never fired without jq. The runtime is
# node now and there is no jq path left to get wrong, so what the case proves is
# the other half, and it is the half that can still regress: jq is no longer a
# DEPENDENCY of the Stop gate, and the loop guard still fires with jq genuinely
# off PATH. Dropping jq's directory is not enough on a machine with jq installed
# twice (e.g. /usr/bin AND a conda env), so build an isolated PATH carrying only
# what the shim and the gate need — node and dirname among them, never jq.
NOJQ_BIN=$(mktemp -d)
for _t in grep sed head bash cat dirname git node npm; do
  _p=$(command -v "$_t" 2>/dev/null)
  [ -n "$_p" ] && ln -s "$_p" "$NOJQ_BIN/$_t" 2>/dev/null || true
done
# Verify the sandbox itself before trusting its result (see test-layout.sh for
# why: a dead symlink or an unusable git.exe would make this a false negative).
# jq absence is checked via a freshly spawned process (env ... sh -c), not
# `command -v` in this shell: bash hashes command paths on first lookup, and
# this script already looked up jq (line 11) under the real PATH, so a plain
# `PATH=... command -v jq` here would return the stale hashed path instead of
# re-searching the restricted PATH.
if PATH="$NOJQ_BIN:/bin" git --version >/dev/null 2>&1 \
   && [ -n "$(PATH="$NOJQ_BIN:/bin" git --version 2>/dev/null)" ] \
   && [ -x "$NOJQ_BIN/grep" ] && [ -x "$NOJQ_BIN/sed" ] \
   && ! env PATH="$NOJQ_BIN:/bin" sh -c 'command -v jq' >/dev/null 2>&1; then
  T=$(mktemp -d)
  ( cd "$T" && PATH="$NOJQ_BIN:/bin" git init -q && PATH="$NOJQ_BIN:/bin" git commit -q --allow-empty -m init )
  printf '{"scripts":{"test":"exit 1"}}\n' > "$T/package.json"
  mkdir -p "$T/src"; touch "$T/src/x.ts"
  TSCRIPT=$(mktemp)
  make_transcript "$TSCRIPT" "$T/src/x.ts"
  OUT=$(printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":true}' "$T" "$TSCRIPT" \
    | PATH="$NOJQ_BIN:/bin" bash "$DIR/stop-verify.sh" 2>&1)
  rm -rf "$T" "$TSCRIPT"
  case "$OUT" in
    *'"decision"'*) no "case10 no-jq-loop-guard: expected no block with stop_hook_active=true, got: $OUT" ;;
    *) ok ;;
  esac
else
  sk "case10 no-jq PATH sandbox unavailable (symlinks unusable here)"
fi
rm -rf "$NOJQ_BIN"

# ---------- Case 11: a red check — the block reason carries the kernel's repair ladder (P5) ----------
# The bash hook pasted the bound into the reason itself, so this case grepped for
# the words it pasted. The node runtime asks the kernel instead
# (src/hooks/stop-verify.ts -> src/kernel/repair, the one reader of
# policy.json .repair), so the assertion follows the wiring rather than the old
# wording: the reason must carry, verbatim, what the kernel answers for the FIRST
# red of that check. A hook that kept a private copy of the ladder fails here, and
# so does one that stopped consulting the kernel at all.
LADDER=$(bash "$DIR/../scripts/kernel.sh" repair --check lint --attempt 1 2>/dev/null | jq -r '.reason // empty')
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
# red via lint, not test: tests are opt-in (rules/verification.md), so a failing
# "test" script alone no longer makes the default gate go red
printf '{"scripts":{"lint":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"
touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
REASON_OUT=$(printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":false}' "$T" "$TSCRIPT" \
  | bash "$DIR/stop-verify.sh" 2>/dev/null | jq -r '.reason // empty' 2>/dev/null)
rm -rf "$T" "$TSCRIPT"
if [ -z "$LADDER" ]; then
  no "case11 repair-ladder-in-reason: kernel.sh repair --check lint --attempt 1 answered no reason"
else
  case "$REASON_OUT" in
    "EngineOS gate: verification failed. $LADDER "*) ok ;;
    *) no "case11 repair-ladder-in-reason: expected the kernel's own reason [$LADDER] after the gate prefix, got: $REASON_OUT" ;;
  esac
fi

# ---------- Case 12: P7 telemetry — red run writes a verify event ----------
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
mkdir -p "$T/.engineos"
# red via lint, not test: tests are opt-in (rules/verification.md), so a failing
# "test" script alone no longer makes the default gate go red
printf '{"scripts":{"lint":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"; touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":false,"session_id":"vsmoke1"}' "$T" "$TSCRIPT" \
  | bash "$DIR/stop-verify.sh" >/dev/null
TF="$T/.git/engineos-telemetry/vsmoke1.jsonl"
if [ -f "$TF" ] && [ "$(jq -r '.event' "$TF")" = "verify" ] && [ "$(jq -r '.data.failed' "$TF")" = "true" ]; then
  ok
else
  no "case12 red-run-writes-verify-event: file=$([ -f "$TF" ] && cat "$TF" || echo MISSING)"
fi
rm -rf "$T" "$TSCRIPT"

# ---------- Case 13: a green run writes failed:false ----------
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
mkdir -p "$T/.engineos"
printf '{"scripts":{"test":"exit 0"}}\n' > "$T/package.json"
mkdir -p "$T/src"; touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":false,"session_id":"vsmoke2"}' "$T" "$TSCRIPT" \
  | bash "$DIR/stop-verify.sh" >/dev/null
TF="$T/.git/engineos-telemetry/vsmoke2.jsonl"
if [ -f "$TF" ] && [ "$(jq -r '.data.failed' "$TF")" = "false" ]; then
  ok
else
  no "case13 green-run-writes-failed-false: file=$([ -f "$TF" ] && cat "$TF" || echo MISSING)"
fi
rm -rf "$T" "$TSCRIPT"

# ---------- Case 14: the stop_hook_active re-entry writes no second line ----------
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
mkdir -p "$T/.engineos"
printf '{"scripts":{"test":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"; touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":false,"session_id":"vsmoke3"}' "$T" "$TSCRIPT" \
  | bash "$DIR/stop-verify.sh" >/dev/null
printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":true,"session_id":"vsmoke3"}' "$T" "$TSCRIPT" \
  | bash "$DIR/stop-verify.sh" >/dev/null
TF="$T/.git/engineos-telemetry/vsmoke3.jsonl"
LINES=$([ -f "$TF" ] && wc -l < "$TF" | tr -d ' ' || echo 0)
[ "$LINES" = "1" ] && ok || no "case14 one-stop-cycle-logs-one-verify-event: got $LINES lines"
rm -rf "$T" "$TSCRIPT"

# ---------- Case 15: ENGINEOS_TELEMETRY=0 writes no file ----------
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
mkdir -p "$T/.engineos"
printf '{"scripts":{"test":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"; touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":false,"session_id":"vsmoke4"}' "$T" "$TSCRIPT" \
  | ENGINEOS_TELEMETRY=0 bash "$DIR/stop-verify.sh" >/dev/null
[ ! -e "$T/.git/engineos-telemetry" ] && ok || no "case15 ENGINEOS_TELEMETRY=0-writes-no-file"
rm -rf "$T" "$TSCRIPT"

# ---------- Case 16: ancient node with no nvm rescue — infra skip, no block ----------
# The hook inherits the launcher's PATH; a v16-first PATH must skip verification
# (structuredClone missing — tooling cannot start) instead of blocking on it.
# Read what this case does and does not prove now that node IS the runtime: the
# stand-in below cannot execute dist/engineos.cjs, so it exercises the shim's
# refusal to produce a decision under an unusable node, not the gate's own
# node-too-old rung. That rung is covered where it can be driven honestly —
# src/hooks/stop-verify.test.ts passes the node version in, and src/node-guard.ts
# owns the skip message the CLI prints for a real node below 18.
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"test":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"; touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
OLDBIN=$(mktemp -d)
printf '#!/bin/sh\necho v16.17.0\n' > "$OLDBIN/node"; chmod +x "$OLDBIN/node"
FAKEHOME=$(mktemp -d)   # no .nvm — the rescue is unavailable
DEC=$(printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":false,"session_id":"nodesmoke"}' "$T" "$TSCRIPT" \
  | HOME="$FAKEHOME" PATH="$OLDBIN:$PATH" bash "$DIR/stop-verify.sh" 2>/dev/null \
  | jq -r '.decision // empty' 2>/dev/null)
rm -rf "$T" "$TSCRIPT" "$OLDBIN" "$FAKEHOME"
[ -z "$DEC" ] && ok || no "case16 ancient-node-infra-skip: expected no block, got '$DEC'"

# ---------- Case 17: the false-positive guard now covers the npm arm too ----------
# Before the runner seam, the "target was never really there" guard existed only
# in the Nx arm; a package-manager run that reported a missing script still went
# red. Both arms now share one guard (hooks/lib-runner.sh runner_infra_skip).
# The script emits the runner's own missing-script wording itself because
# `npm run -s` silences npm's real report, so npm cannot produce it here — the
# guard matches on that wording wherever the runner does emit it (pnpm, yarn).
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
printf '{"scripts":{"lint":"echo \\"Missing script: \\\\\\"lint\\\\\\"\\"; exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"; touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
DEC=$(invoke "$T" "$TSCRIPT" false)
rm -rf "$T" "$TSCRIPT"
[ -z "$DEC" ] && ok || no "case17 npm-arm-infra-guard: expected empty decision (missing-script output is an infra skip), got '$DEC'"

# ---------- Case 18: one timeout table, shared by both runners ----------
# The Nx and package-manager ladders each carried their own copy of the 90s/180s
# budgets and had already drifted apart. Asserted at the source, because proving
# it through behaviour would need a fake runner adapter — rejected by the owner
# (docs/specs/2026-09-02-deepen-runtime-modules-design.md), tests stay on real npm.
# Re-pointed to the TypeScript modules with the shim swap: the caller
# (src/hooks/stop-verify.ts) states each budget exactly once and the adapter
# (src/hooks/runner.ts) states none — it takes the budget as a parameter.
SV_TS="$DIR/../src/hooks/stop-verify.ts"
T90=$(grep -oE '\b90\b' "$SV_TS" | wc -l | tr -d ' ')
T180=$(grep -oE '\b180\b' "$SV_TS" | wc -l | tr -d ' ')
ADAPTER_T=$(grep -cE '\b(90|180)\b' "$DIR/../src/hooks/runner.ts")
if [ "$T90" = "1" ] && [ "$T180" = "1" ] && [ "$ADAPTER_T" = "0" ]; then
  ok
else
  no "case18 one-timeout-table: expected one 90 and one 180 in src/hooks/stop-verify.ts and no budget literal in src/hooks/runner.ts, got 90=$T90 180=$T180 adapter=$ADAPTER_T"
fi

# ---------- Case 19: the Stop gate writes a verification SPAN ----------
# The kernel-decision event (case 12) says which packages went red; the span
# says the gate ran, how long it took and whether it passed
# (rules/observability.md "Agent traces"). Same guarded block, so the re-entry
# assertion below is the span half of case 14.
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
mkdir -p "$T/.engineos"
printf '{"scripts":{"lint":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"; touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":false,"session_id":"vspan1"}' "$T" "$TSCRIPT" \
  | bash "$DIR/stop-verify.sh" >/dev/null
printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":true,"session_id":"vspan1"}' "$T" "$TSCRIPT" \
  | bash "$DIR/stop-verify.sh" >/dev/null
XF="$T/.git/engineos-telemetry/vspan1.exec.jsonl"
XLINES=$([ -f "$XF" ] && wc -l < "$XF" | tr -d ' ' || echo 0)
if [ -f "$XF" ] \
   && jq -e '.span_kind == "verification" and .status == "FAILED" and .capability_id == "validate"
             and .trace_id == "vspan1" and (.duration_ms | type) == "number"' "$XF" >/dev/null 2>&1 \
   && bash "$DIR/../scripts/exec-journal.sh" validate "$XF" >/dev/null 2>&1 \
   && [ "$XLINES" = "1" ]; then
  ok
else
  no "case19 stop-gate-writes-a-verification-span: lines=$XLINES file=$([ -f "$XF" ] && cat "$XF" || echo MISSING)"
fi
rm -rf "$T" "$TSCRIPT"

# ---------- Case 20: a green run writes status OK, not a missing span ----------
# The failure direction alone would pass against a hook hardwired to FAILED.
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
mkdir -p "$T/.engineos"
printf '{"scripts":{"lint":"exit 0"}}\n' > "$T/package.json"
mkdir -p "$T/src"; touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":false,"session_id":"vspan2"}' "$T" "$TSCRIPT" \
  | bash "$DIR/stop-verify.sh" >/dev/null
XF="$T/.git/engineos-telemetry/vspan2.exec.jsonl"
if [ -f "$XF" ] && jq -e '.span_kind == "verification" and .status == "OK"' "$XF" >/dev/null 2>&1; then
  ok
else
  no "case20 green-run-writes-status-OK-span: file=$([ -f "$XF" ] && cat "$XF" || echo MISSING)"
fi
rm -rf "$T" "$TSCRIPT"

# ---------- Case 21: ENGINEOS_TELEMETRY=0 writes no span either ----------
# Case 15 covers the event file; the span shares the switch and the directory,
# so an unguarded span writer would recreate the directory case 15 asserts away.
T=$(mktemp -d)
( cd "$T" && git init -q && git commit -q --allow-empty -m init )
mkdir -p "$T/.engineos"
printf '{"scripts":{"lint":"exit 1"}}\n' > "$T/package.json"
mkdir -p "$T/src"; touch "$T/src/x.ts"
TSCRIPT=$(mktemp)
make_transcript "$TSCRIPT" "$T/src/x.ts"
printf '{"cwd":"%s","transcript_path":"%s","stop_hook_active":false,"session_id":"vspan3"}' "$T" "$TSCRIPT" \
  | ENGINEOS_TELEMETRY=0 bash "$DIR/stop-verify.sh" >/dev/null
[ ! -e "$T/.git/engineos-telemetry" ] && ok || no "case21 ENGINEOS_TELEMETRY=0-writes-no-span"
rm -rf "$T" "$TSCRIPT"

echo "---"
echo "pass=$pass fail=$fail skip=$skip"
[ "$fail" -eq 0 ]
