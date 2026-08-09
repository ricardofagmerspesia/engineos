---
name: 2026-08-07-subagent-dispatch-rule
status: active
owner: Ricardo Fagmer
spec: n/a (2-file rules change, below the #1 spec threshold)
domain: docs
---

## What
Make sub-agent dispatch a hard contract in the EngineOS router, and require every
dispatch/return to be announced in a green, line-broken block naming the agent.

## Why
The router table named agents descriptively (`agent:backend-coordinator` as a
footnote), so work routed to a specialist was being done inline instead. The
`[router]` announce line had no `agent=` field, so nothing made the omission
visible. Separately, the harness carries a "do not call the Agent tool unless the
user requested it" directive; a standing rule in the constitution is the request.

## Scope
- `rules/subagents.md` (new, always-on)
- `CLAUDE.md` — always-on import list, router announce line, routing rule bullet,
  non-negotiable #8 (renumbering the artifact rule to #9)

## Checklist
- [x] `rules/subagents.md` written: mandatory dispatch + green announcement format
- [x] `@rules/subagents.md` added to always-on imports
- [x] `[router]` announce line carries `agent=<agents dispatched|none>`
- [x] Routing rule bullet: a row naming an agent means dispatch it
- [x] Non-negotiable added, artifact rule renumbered
- [ ] `jq` installed so the deterministic PreToolUse routing hook actually fires

## What was made
<filled on completion>

## Verification
`hooks/test-route.sh` and `hooks/test-governance.sh` — both require `jq`, which is
absent on this machine; that is the open checklist item, not a regression from
this change.

## Notes
Root cause of "routing never calls sub-agents" was three-layered: `jq` missing
(hooks self-disable), the router table being soft on agents, and the harness-level
Agent-tool restriction. This record covers layers 2 and 3; layer 1 is an install.
