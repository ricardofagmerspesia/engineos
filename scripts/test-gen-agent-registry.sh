#!/usr/bin/env bash
# Regression tests for scripts/gen-agent-registry.sh's frontmatter parsing —
# specifically the edge cases no real agents/*.md file happens to exercise
# today (every current file has a space after every "field:" and declares
# tools), which is exactly why these need a planted fixture rather than a
# check against the real agents/ directory. Also covers the tier contract:
# tier comes from frontmatter (never derived from the model), and a missing,
# unknown, or model-inconsistent tier is a hard generator failure.
# Run: scripts/test-gen-agent-registry.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pass=0; fail=0

# case <description> <fixture-agent-md> <jq-filter-on-the-result> <expected>
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

# fail_case <description> <fixture-agent-md> <stderr-substring-expected>
# The generator must exit nonzero AND name the problem — a silent bad exit is
# as unreviewable as a silent success.
fail_case() {
  local desc="$1" agent_md="$2" want_err="$3" tmp err rc
  tmp=$(mktemp -d) || return 1
  ( cd "$ROOT" && tar --exclude=.git -cf - . ) | ( cd "$tmp" && tar -xf - )
  printf '%s' "$agent_md" > "$tmp/agents/zz-fixture.md"

  err=$( ( cd "$tmp" && bash scripts/gen-agent-registry.sh ) 2>&1 >/dev/null )
  rc=$?
  rm -rf "$tmp"

  if [ "$rc" -eq 0 ]; then
    fail=$((fail+1)); printf 'FAIL %s — generator exited 0, expected failure\n' "$desc"; return
  fi
  case "$err" in
    *"$want_err"*) pass=$((pass+1)); printf 'ok   %s\n' "$desc" ;;
    *) fail=$((fail+1)); printf 'FAIL %s — stderr lacks %q, got: %s\n' "$desc" "$want_err" "$err" ;;
  esac
}

echo "== gen-agent-registry frontmatter parsing tests =="

case_ "an agent with no tools: line does not crash the generator, produces an empty array" \
"---
name: zz-fixture
description: throwaway.
model: opus
tier: build
---
body
" "tools" "[]"

case_ "a frontmatter line with no space after the colon still strips the field name" \
"---
name: zz-fixture
description: throwaway.
tools: Read
model:opus
tier:build
---
body
" "model" '"opus"'

case_ "a trailing comma in tools: does not produce a spurious empty entry" \
"---
name: zz-fixture
description: throwaway.
tools: Read, Grep,
model: opus
tier: build
---
body
" "tools" '["Read","Grep"]'

case_ "model_tier is taken from tier: frontmatter, not reverse-derived from the model" \
"---
name: zz-fixture
description: throwaway.
tools: Read
model: opus
tier: design
---
body
" "model_tier" '"design"'

fail_case "an agent with no tier: frontmatter fails the generator loudly" \
"---
name: zz-fixture
description: throwaway.
tools: Read
model: opus
---
body
" "has no 'tier:' frontmatter"

fail_case "an unknown tier id fails the generator loudly" \
"---
name: zz-fixture
description: throwaway.
tools: Read
model: opus
tier: turbo
---
body
" "unknown tier 'turbo'"

fail_case "a tier whose models.json binding disagrees with model: fails the generator loudly" \
"---
name: zz-fixture
description: throwaway.
tools: Read
model: haiku
tier: design
---
body
" "declares tier 'design'"

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
