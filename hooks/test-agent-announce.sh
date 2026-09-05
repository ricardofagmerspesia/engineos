#!/usr/bin/env bash
# Smoke test for announce-agent-dispatch.sh / announce-agent-return.sh.
# Feeds sample PreToolUse/PostToolUse payloads and asserts the injected
# additionalContext. Run: hooks/test-agent-announce.sh
set -uo pipefail
# Isolate from the operator's bypass switches: a machine-wide pause must never make
# this suite go quiet and report green (hooks/bypass.sh).
export ENGINEOS_BYPASS_FLAG=/nonexistent/engineos.bypass
unset ENGINEOS_BYPASS
DIR="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0

check() {  # <desc> <hook> <payload> <expected-substring>
  local desc="$1" hook="$2" payload="$3" exp="$4" out ctx
  out=$(printf '%s' "$payload" | bash "$DIR/$hook")
  ctx=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null)
  case "$ctx" in
    *"$exp"*) pass=$((pass+1)) ;;
    *) fail=$((fail+1)); echo "FAIL: $desc — want '$exp' in: [$ctx]" ;;
  esac
}

check "dispatch names agent type" \
  "announce-agent-dispatch.sh" \
  '{"tool_input":{"subagent_type":"backend-coordinator","description":"scope src/orders"}}' \
  "backend-coordinator"

check "dispatch carries description" \
  "announce-agent-dispatch.sh" \
  '{"tool_input":{"subagent_type":"backend-coordinator","description":"scope src/orders"}}' \
  "scope src/orders"

check "dispatch tells banner format" \
  "announce-agent-dispatch.sh" \
  '{"tool_input":{"subagent_type":"general-purpose"}}' \
  "diff-fenced"

check "return names agent type" \
  "announce-agent-return.sh" \
  '{"tool_input":{"subagent_type":"frontend-coordinator"}}' \
  "frontend-coordinator"

check "return tells banner format" \
  "announce-agent-return.sh" \
  '{"tool_input":{"subagent_type":"frontend-coordinator"}}' \
  "done|FAILED"


# ---------- agent spans ----------
# The banner is this pair's job; the span is the record that the dispatch
# happened at all (rules/observability.md "Agent traces"). Driven through both
# hooks in order, because the duration only exists as the difference between
# them and a return with no matching dispatch must write nothing.
# Boolean assertions, alongside the substring-matching check() above. Named as
# src/hooks/stop-verify.e2e.test.ts names them, so the two suites read the same way.
ok() { pass=$((pass+1)); }
no() { fail=$((fail+1)); echo "FAIL: $1"; }

adopted_repo() { local t; t=$(mktemp -d); (cd "$t" && git init -q) >/dev/null 2>&1; mkdir -p "$t/.engineos"; echo "$t"; }
payload() {  # <cwd> <session> <tool_use_id> <agent> [tool_response-json]
  jq -nc --arg c "$1" --arg s "$2" --arg u "$3" --arg a "$4" --argjson r "${5:-null}" \
    '{cwd:$c, session_id:$s, tool_use_id:$u, tool_name:"Task",
      tool_input:{subagent_type:$a, description:"scope src/orders"}, tool_response:$r}'
}

# A full dispatch/return pair writes exactly one agent span, and every field a
# consumer gates on is asserted — an exit code alone would pass against a hook
# that wrote the wrong agent or the wrong kind.
T=$(adopted_repo)
P=$(payload "$T" span1 toolu_1 backend-coordinator)
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
[ -f "$T/.git/engineos-telemetry/spans/toolu_1" ] && ok || no "dispatch leaves a span start marker"
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
XF="$T/.git/engineos-telemetry/span1.exec.jsonl"
if [ -f "$XF" ] && [ "$(wc -l < "$XF" | tr -d ' ')" = "1" ] \
   && jq -e '.span_kind == "agent" and .agent == "backend-coordinator" and .capability_id == "implement"
             and .model_tier == "build" and .status == "OK" and .trace_id == "span1"
             and .span_id == "toolu_1" and .tokens_in == 0 and .tokens_out == 0
             and (has("cost_micros") | not) and (.duration_ms | type) == "number"' "$XF" >/dev/null 2>&1 \
   && bash "$DIR/../scripts/exec-journal.sh" validate "$XF" >/dev/null 2>&1; then
  ok
else
  no "a dispatch/return pair writes one valid agent span: $([ -f "$XF" ] && cat "$XF" || echo MISSING)"
fi
[ -f "$T/.git/engineos-telemetry/spans/toolu_1" ] && no "the return consumed its start marker" || ok
rm -rf "$T"

# The tier comes from registries/agents.json, so a design-tier agent is not
# recorded as build. Without this the default would satisfy every case.
T=$(adopted_repo)
P=$(payload "$T" span2 toolu_2 architecture-analyst)
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
jq -e '.model_tier == "design"' "$T/.git/engineos-telemetry/span2.exec.jsonl" >/dev/null 2>&1 \
  && ok || no "a design-tier agent is recorded as design, not build"
rm -rf "$T"

# An agent the registry does not know still gets a span, on the ordinary tier.
T=$(adopted_repo)
P=$(payload "$T" span3 toolu_3 general-purpose)
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
jq -e '.agent == "general-purpose" and .model_tier == "build"' "$T/.git/engineos-telemetry/span3.exec.jsonl" >/dev/null 2>&1 \
  && ok || no "an unregistered agent falls back to the build tier"
rm -rf "$T"

# The harness's own error flag is the status the hook trusts.
T=$(adopted_repo)
P=$(payload "$T" span4 toolu_4 backend-coordinator '{"is_error":true,"content":"boom"}')
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
jq -e '.status == "FAILED"' "$T/.git/engineos-telemetry/span4.exec.jsonl" >/dev/null 2>&1 \
  && ok || no "a harness-reported error is recorded as FAILED"
rm -rf "$T"

# ... and the envelope's own status when it is the first token of the response.
T=$(adopted_repo)
P=$(payload "$T" span5 toolu_5 backend-coordinator '"DEGRADED partial coverage"')
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
jq -e '.status == "DEGRADED"' "$T/.git/engineos-telemetry/span5.exec.jsonl" >/dev/null 2>&1 \
  && ok || no "a leading envelope status is recorded verbatim"
rm -rf "$T"

# A status word buried mid-report is prose, not a verdict.
T=$(adopted_repo)
P=$(payload "$T" span6 toolu_6 backend-coordinator '"the previous attempt FAILED, this one did not"')
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
jq -e '.status == "OK"' "$T/.git/engineos-telemetry/span6.exec.jsonl" >/dev/null 2>&1 \
  && ok || no "a mid-report FAILED does not become the span status"
rm -rf "$T"

# The shapes the harness actually emits. `tostring` on an array of content
# blocks or on an object starts with '[' or '{', so the anchored first-token
# capture never fires on either: before the fix these two recorded OK, which is
# the whole envelope-level failure class the breaker's counter exists to see.
T=$(adopted_repo)
P=$(payload "$T" span5b toolu_5b backend-coordinator '{"status":"FAILED","content":[{"type":"text","text":"could not proceed"}]}')
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
jq -e '.status == "FAILED"' "$T/.git/engineos-telemetry/span5b.exec.jsonl" >/dev/null 2>&1 \
  && ok || no "a top-level .status on an object response is recorded"
rm -rf "$T"

# ... and the floor stays a floor: an object response with no error flag and no
# .status field reads OK. Asserted, not just documented, so the caveat in
# rules/observability.md cannot quietly stop being true.
T=$(adopted_repo)
P=$(payload "$T" span5c toolu_5c backend-coordinator '{"content":[{"type":"text","text":"FAILED - could not proceed"}],"totalDurationMs":1200}')
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
jq -e '.status == "OK"' "$T/.git/engineos-telemetry/span5c.exec.jsonl" >/dev/null 2>&1 \
  && ok || no "an unstructured failure reads OK — the documented status floor"
rm -rf "$T"

# A .status carrying anything but the envelope vocabulary is not a channel:
# the allowlist normalises it to OK rather than writing the text.
T=$(adopted_repo)
P=$(payload "$T" span5d toolu_5d backend-coordinator '{"status":"all fine, zqxjkw"}')
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
jq -e '.status == "OK"' "$T/.git/engineos-telemetry/span5d.exec.jsonl" >/dev/null 2>&1 \
  && [ -z "$(grep -rl zqxjkw "$T/.git/engineos-telemetry" 2>/dev/null)" ] \
  && ok || no "a free-text .status is normalised to OK and never written"
rm -rf "$T"

# A return with no matching dispatch writes nothing: no marker, no fabricated
# duration. Hook installed mid-session, bypass toggled mid-turn, dir reaped.
T=$(adopted_repo)
printf '%s' "$(payload "$T" span7 toolu_7 backend-coordinator)" | bash "$DIR/announce-agent-return.sh" >/dev/null
[ -e "$T/.git/engineos-telemetry/span7.exec.jsonl" ] \
  && no "an unmatched return wrote a span" || ok
rm -rf "$T"

# The three off-switches.
T=$(adopted_repo)
P=$(payload "$T" span8 toolu_8 backend-coordinator)
printf '%s' "$P" | ENGINEOS_TELEMETRY=0 bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | ENGINEOS_TELEMETRY=0 bash "$DIR/announce-agent-return.sh" >/dev/null
[ -e "$T/.git/engineos-telemetry" ] && no "ENGINEOS_TELEMETRY=0 wrote span data" || ok
rm -rf "$T"

T=$(adopted_repo)
P=$(payload "$T" span9 toolu_9 backend-coordinator)
printf '%s' "$P" | ENGINEOS_BYPASS=1 bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | ENGINEOS_BYPASS=1 bash "$DIR/announce-agent-return.sh" >/dev/null
[ -e "$T/.git/engineos-telemetry" ] && no "a bypassed session wrote span data" || ok
rm -rf "$T"

T=$(mktemp -d); (cd "$T" && git init -q) >/dev/null 2>&1   # no .engineos/ — never adopted
P=$(payload "$T" span10 toolu_10 backend-coordinator)
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
[ -e "$T/.git/engineos-telemetry" ] && no "a non-adopted repo wrote span data" || ok
rm -rf "$T"

# No tool_use_id: the pair falls back to a hash of the brief and still joins.
T=$(adopted_repo)
P=$(jq -nc --arg c "$T" '{cwd:$c, session_id:"span11", tool_name:"Task",
      tool_input:{subagent_type:"backend-coordinator", description:"scope src/orders"}}')
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
jq -e '.span_kind == "agent" and (.span_id | length) == 12' "$T/.git/engineos-telemetry/span11.exec.jsonl" >/dev/null 2>&1 \
  && ok || no "a payload with no tool_use_id still produces a joinable span"
rm -rf "$T"

# The banner must not depend on the span writer, and the span writer must not
# print to stdout: both hooks emit exactly one JSON envelope.
T=$(adopted_repo)
P=$(payload "$T" span12 toolu_12 backend-coordinator)
OUT=$(printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh")
printf '%s' "$OUT" | jq -e '.hookSpecificOutput.hookEventName == "PreToolUse"' >/dev/null 2>&1 \
  && ok || no "the dispatch hook still emits one clean envelope: [$OUT]"
OUT=$(printf '%s' "$P" | bash "$DIR/announce-agent-return.sh")
printf '%s' "$OUT" | jq -e '.hookSpecificOutput.hookEventName == "PostToolUse"' >/dev/null 2>&1 \
  && ok || no "the return hook still emits one clean envelope: [$OUT]"
rm -rf "$T"

# Nothing about the dispatch's free text reaches disk.
T=$(adopted_repo)
P=$(jq -nc --arg c "$T" '{cwd:$c, session_id:"span13", tool_use_id:"toolu_13", tool_name:"Task",
      tool_input:{subagent_type:"backend-coordinator", description:"secret brief zqxjkw"}}')
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
grep -rq 'zqxjkw' "$T/.git/engineos-telemetry" 2>/dev/null \
  && no "the agent span leaked the dispatch description" || ok
rm -rf "$T"

# A newline in a harness-supplied subagent_type or tool_use_id is the channel
# hook_slug's class used to keep, in the FIELD and in the marker FILENAME both.
# What the guard promises is the SHAPE, not the content (rules/observability.md
# "Agent traces"): the value's characters still transit dash-joined, so this
# asserts what is actually true and nothing more -- one line, no raw newline, no
# newline in any filename, and the record still parses as a single JSON object.
# An assertion that the WORDS were gone would fail, correctly: sanitizing is not
# classifying, and a test claiming otherwise would re-document the false
# containment this round exists to remove.
T=$(adopted_repo)
P=$(jq -nc --arg c "$T" --arg a "$(printf 'backend-coordinator\nSECRET=hunter2 zqxjkw')" \
      --arg u "$(printf 'toolu_14\nzqxjkw in a filename')" \
      '{cwd:$c, session_id:"span14", tool_use_id:$u, tool_name:"Task",
        tool_input:{subagent_type:$a, description:"scope src/orders"}}')
printf '%s' "$P" | bash "$DIR/announce-agent-dispatch.sh" >/dev/null
printf '%s' "$P" | bash "$DIR/announce-agent-return.sh" >/dev/null
XF="$T/.git/engineos-telemetry/span14.exec.jsonl"
if [ "$(find "$T/.git/engineos-telemetry" -name '*
*' 2>/dev/null | wc -l | tr -d ' ')" = "0" ]; then ok
else no "a newline reached a telemetry filename"; fi
# One physical line, and one JSON object on it. A raw newline in either value
# would have produced two lines, the second of them unparseable garbage.
if [ "$(wc -l < "$XF" | tr -d ' ')" = "1" ] \
   && [ "$(jq -s 'length' "$XF" 2>/dev/null)" = "1" ]; then ok
else no "the span is not exactly one parseable JSON line: $(cat "$XF" 2>/dev/null || echo MISSING)"; fi
# ... and the sanitized span was still WRITTEN and still validates: degrading a
# value must not turn into silently losing the record.
if [ -f "$XF" ] && bash "$DIR/../scripts/exec-journal.sh" validate "$XF" >/dev/null 2>&1; then
  ok
else
  no "the sanitized span was lost instead of written: $([ -f "$XF" ] && cat "$XF" || echo MISSING)"
fi
rm -rf "$T"

# The clock. On the primary development platform (/bin/bash 3.2, BSD date) the
# first two rungs of hook_now_ms are both unavailable, and without the perl rung
# every span was measured in whole seconds — a 1.2s dispatch recorded 1000, a
# fast one 0. Asserted through the real hook pair, not by reading the function.
T=$(adopted_repo)
P=$(payload "$T" span15 toolu_15 backend-coordinator)
printf '%s' "$P" | /bin/bash "$DIR/announce-agent-dispatch.sh" >/dev/null
sleep 0.3
printf '%s' "$P" | /bin/bash "$DIR/announce-agent-return.sh" >/dev/null
DUR=$(jq -r '.duration_ms' "$T/.git/engineos-telemetry/span15.exec.jsonl" 2>/dev/null)
case "${DUR:-}" in
  ''|*[!0-9]*) no "the span carried no numeric duration_ms: [${DUR:-}]" ;;
  *) if [ "$DUR" -ge 100 ] && [ "$DUR" -lt 3000 ]; then ok
     else no "duration_ms is not sub-second resolution: $DUR for a 0.3s dispatch"; fi ;;
esac
rm -rf "$T"

echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
