---
name: 2026-08-08-subagent-dispatch-hook-backstop
status: active
owner: Ricardo Fagmer
spec: n/a (hooks + docs change, below the #1 spec threshold)
domain: docs
---

## What
Give the green dispatch/return announcement rule in `rules/subagents.md` a technical
backstop in Claude Code, and mirror the convention for Cursor, which has no hook
system to backstop it with.

## Why
The rule from `2026-08-07-subagent-dispatch-rule.md` was prose-only: nothing forced
the model to actually emit the diff-fenced banner, so dispatches were happening
silently in both Claude Code and Cursor. `jq` was suspected but confirmed installed
and on PATH (`jq-1.8.2`) — the real gap was that `hooks/hooks.json` had no
`PreToolUse`/`PostToolUse` matcher for the `Agent|Task` tool at all (only `Edit|Write`
was wired), and Cursor has neither `CLAUDE.md`/plugin support nor a hook mechanism.

## Scope
- `hooks/hooks.json` — added `Agent|Task` matchers to `PreToolUse` and `PostToolUse`
- `hooks/announce-agent-dispatch.sh` (new) — PreToolUse(Agent|Task) hook
- `hooks/announce-agent-return.sh` (new) — PostToolUse(Agent|Task) hook
- `hooks/test-agent-announce.sh` (new) — smoke test for both hooks
- `rules/subagents.md` — new "Enforcement backstop" section
- `.cursor/rules/subagent-dispatch.mdc` (new) — Cursor-native, prompt-only mirror

## Checklist
- [x] `PreToolUse`/`PostToolUse` hooks added for `Agent|Task`, mirroring
      `route-before-change.sh`'s structure (non-blocking, `jq`-guarded)
- [x] Smoke test written and passing (`hooks/test-agent-announce.sh`, 5/5 pass)
- [x] `rules/subagents.md` documents the backstop and its Cursor limitation
- [x] `.cursor/rules/subagent-dispatch.mdc` created (best-effort, no enforcement
      possible — Cursor has no hooks and no EngineOS agent registry)

## What was made
Two new hook scripts inject the exact banner format (from `rules/subagents.md`) as
`additionalContext` at the moment an `Agent`/`Task` tool call is about to run or has
just returned, so the reminder lands in-context instead of depending on the model
having internalized a rule read once at session start. `hooks.json` gained two
matcher entries without touching the existing `Edit|Write` entries. A new Cursor
rule file mirrors the same convention for sessions in that tool, clearly marked as
unenforceable there.

## Verification
`bash hooks/test-agent-announce.sh` → `pass=5 fail=0`. No lint/typecheck/build exists
in this repo (rules/hooks/docs only, no package.json) — the shell smoke test is the
verification surface, consistent with `hooks/test-route.sh` for the analogous
`Edit|Write` hook.

## Notes
This closes the loop the `2026-08-07-subagent-dispatch-rule.md` record left open:
that record's unchecked item ("jq installed") turned out to be a red herring — jq
was already present. The actual missing piece was hook wiring, not a missing binary.
