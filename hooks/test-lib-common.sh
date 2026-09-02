#!/usr/bin/env bash
# Behavioral contract for the hook envelope in hooks/lib-common.sh.
set -uo pipefail
export ENGINEOS_BYPASS_FLAG=/nonexistent/engineos.bypass
unset ENGINEOS_BYPASS

DIR="$(cd "$(dirname "$0")" && pwd)"
LIB="$DIR/lib-common.sh"
pass=0
fail=0

ok() { pass=$((pass + 1)); }
no() { fail=$((fail + 1)); echo "FAIL $*"; }

command -v jq >/dev/null 2>&1 || { echo "SKIP jq not installed"; exit 0; }

# A probe runs in its own bash so a hook_read_envelope that exits cannot take the
# suite with it. $1 is the shell body; the payload arrives on stdin.
probe() { bash -c '. "$1"; shift; eval "$@"' _ "$LIB" "$@"; }

# ---------- hook_read_envelope: every field ----------
FULL=$(jq -nc '{cwd:"/tmp/work", session_id:"S9", prompt:"do the thing",
  tool_input:{file_path:"/tmp/work/a.ts"}, tool_name:"Edit",
  transcript_path:"/tmp/t.jsonl", stop_hook_active:true}')
OUT=$(printf '%s' "$FULL" | probe 'hook_read_envelope
  printf "%s|%s|%s|%s|%s|%s|%s" "$HOOK_CWD" "$HOOK_SID" "$HOOK_PROMPT" \
    "$HOOK_FILE" "$HOOK_TOOL" "$HOOK_TRANSCRIPT" "$HOOK_STOP_ACTIVE"')
EXPECT='/tmp/work|S9|do the thing|/tmp/work/a.ts|Edit|/tmp/t.jsonl|true'
[ "$OUT" = "$EXPECT" ] && ok || no "all seven fields decode: got $OUT"

# ---------- hook_read_envelope: defaults on a bare payload ----------
OUT=$(printf '{}' | probe 'hook_read_envelope
  printf "[%s][%s][%s][%s][%s][%s][%s]" "$HOOK_CWD" "$HOOK_SID" "$HOOK_PROMPT" \
    "$HOOK_FILE" "$HOOK_TOOL" "$HOOK_TRANSCRIPT" "$HOOK_STOP_ACTIVE"')
[ "$OUT" = '[][nosession][][][][][false]' ] && ok \
  || no "missing fields fall back to their defaults: got $OUT"

# ---------- hook_read_envelope: unparseable payload keeps the defaults ----------
OUT=$(printf 'not json at all' | probe 'hook_read_envelope
  printf "[%s][%s]" "$HOOK_SID" "$HOOK_STOP_ACTIVE"')
[ "$OUT" = '[nosession][false]' ] && ok \
  || no "an undecodable payload leaves defaults standing: got $OUT"

# ---------- hook_read_envelope: whitespace and quotes survive intact ----------
# The reason the decoder is NUL-delimited rather than line- or eval-based.
GNARLY=$(printf 'line one\ttabbed\nline "two" with '\''quotes'\''\nline three')
PAYLOAD=$(jq -nc --arg p "$GNARLY" '{prompt:$p, cwd:"/x"}')
OUT=$(printf '%s' "$PAYLOAD" | probe 'hook_read_envelope; printf "%s" "$HOOK_PROMPT"')
[ "$OUT" = "$GNARLY" ] && ok || no "tabs, newlines and quotes survive the decode: got $OUT"

# ---------- hook_read_envelope: the raw payload stays available ----------
OUT=$(printf '%s' "$FULL" | probe 'hook_read_envelope
  printf "%s" "$HOOK_INPUT" | jq -r ".tool_input.file_path"')
[ "$OUT" = "/tmp/work/a.ts" ] && ok || no "HOOK_INPUT keeps the raw payload: got $OUT"

# ---------- hook_context ----------
OUT=$(probe 'hook_context UserPromptSubmit "hello — world"' </dev/null)
if printf '%s' "$OUT" | jq -e . >/dev/null 2>&1 \
   && [ "$(printf '%s' "$OUT" | jq -r '.hookSpecificOutput.hookEventName')" = "UserPromptSubmit" ] \
   && [ "$(printf '%s' "$OUT" | jq -r '.hookSpecificOutput.additionalContext')" = "hello — world" ]; then
  ok
else
  no "hook_context emits a valid envelope with both fields: $OUT"
fi

# ---------- hook_telemetry: appends one line in an adopted repo ----------
T=$(mktemp -d)
(cd "$T" && git init -q) >/dev/null 2>&1
mkdir -p "$T/.engineos"
jq -nc --arg c "$T" '{cwd:$c, session_id:"libt1"}' \
  | probe 'hook_read_envelope; hook_telemetry route "{\"intents\":[\"backend\"]}"' >/dev/null
TF="$T/.git/engineos-telemetry/libt1.jsonl"
if [ -f "$TF" ] && [ "$(wc -l < "$TF" | tr -d ' ')" = "1" ] \
   && [ "$(jq -r '.event' "$TF")" = "route" ] \
   && [ "$(jq -r '.session_id' "$TF")" = "libt1" ]; then
  ok
else
  no "hook_telemetry appends one event: $([ -f "$TF" ] && tr '\n' ' ' < "$TF" || echo MISSING)"
fi
rm -rf "$T"

# ---------- hook_telemetry: silent in a project that never adopted EngineOS ----------
T=$(mktemp -d)
(cd "$T" && git init -q) >/dev/null 2>&1
jq -nc --arg c "$T" '{cwd:$c, session_id:"libt2"}' \
  | probe 'hook_read_envelope; hook_telemetry route "{}"; printf "rc=%s" "$?"' >/dev/null
[ ! -d "$T/.git/engineos-telemetry" ] && ok \
  || no "no .engineos/ means no telemetry is written into the repo"
rm -rf "$T"

# ---------- hook_telemetry: ENGINEOS_TELEMETRY=0 turns it off ----------
T=$(mktemp -d)
(cd "$T" && git init -q) >/dev/null 2>&1
mkdir -p "$T/.engineos"
jq -nc --arg c "$T" '{cwd:$c, session_id:"libt3"}' \
  | ENGINEOS_TELEMETRY=0 probe 'hook_read_envelope; hook_telemetry route "{}"' >/dev/null
[ ! -f "$T/.git/engineos-telemetry/libt3.jsonl" ] && ok \
  || no "ENGINEOS_TELEMETRY=0 suppresses the append"
rm -rf "$T"

# ---------- hook_telemetry: never fails its caller ----------
OUT=$(printf '{}' | probe 'hook_read_envelope; hook_telemetry route "{}"; printf "rc=%s" "$?"')
[ "$OUT" = "rc=0" ] && ok || no "hook_telemetry returns 0 with no cwd: got $OUT"

# ---------- the library carries the bypass switch ----------
OUT=$(probe 'type -t engineos_bypass_active' </dev/null)
[ "$OUT" = "function" ] && ok || no "sourcing lib-common brings bypass.sh along: got $OUT"

printf 'lib-common: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
