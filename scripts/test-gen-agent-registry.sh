#!/usr/bin/env bash
# Regression tests for scripts/gen-agent-registry.sh's frontmatter parsing —
# specifically the edge cases no real agents/*.md file happens to exercise
# today (every current file has a space after every "field:" and declares
# tools), which is exactly why these need a planted fixture rather than a
# check against the real agents/ directory.
# Run: scripts/test-gen-agent-registry.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pass=0; fail=0

# case <description> <mutation-shell-run-against-a-throwaway-repo-copy> <jq-filter-on-the-result> <expected>
case_() {
  local desc="$1" agent_md="$2" jq_filter="$3" want="$4" tmp got rc
  tmp=$(mktemp -d) || return 1
  ( cd "$ROOT" && tar --exclude=.git -cf - . ) | ( cd "$tmp" && tar -xf - )
  printf '%s' "$agent_md" > "$tmp/agents/zz-fixture.md"

  ( cd "$tmp" && bash scripts/gen-agent-registry.sh ) >/dev/null 2>&1
  rc=$?
  got=$(cd "$tmp" && jq -c --arg f "$jq_filter" '.agents[] | select(.name=="zz-fixture") | .[$f]' registries/agents.json 2>&1)
  rm -rf "$tmp"

  if [ "$rc" -ne 0 ]; then
    fail=$((fail+1)); printf 'FAIL %s — generator exited %s\n' "$desc" "$rc"; return
  fi
  if [ "$got" = "$want" ]; then
    pass=$((pass+1)); printf 'ok   %s\n' "$desc"
  else
    fail=$((fail+1)); printf 'FAIL %s — got %q, want %q\n' "$desc" "$got" "$want"
  fi
}

echo "== gen-agent-registry frontmatter parsing tests =="

case_ "an agent with no tools: line does not crash the generator, produces an empty array" \
"---
name: zz-fixture
description: throwaway.
model: sonnet
---
body
" "tools" "[]"

case_ "a frontmatter line with no space after the colon still strips the field name" \
"---
name: zz-fixture
description: throwaway.
tools: Read
model:sonnet
---
body
" "model" '"sonnet"'

case_ "a trailing comma in tools: does not produce a spurious empty entry" \
"---
name: zz-fixture
description: throwaway.
tools: Read, Grep,
model: sonnet
---
body
" "tools" '["Read","Grep"]'

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
