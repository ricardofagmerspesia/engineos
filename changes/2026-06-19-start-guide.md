---
name: 2026-06-19-start-guide
status: done
completed: 2026-06-19
owner: Ricardo Fagmer
---

## What

Added `START.md` — a day-to-day usage guide for new users: how to invoke skills,
agents, commands, MCPs, and how the hooks/specs/rules/change-lifecycle work.
Linked it from the README top alongside ADOPTION.md.

## Why

ADOPTION.md covers setup; new users also need a "how do I actually drive this"
reference — what fires automatically vs. what to invoke by name.

## Scope

- `START.md` (new): mental model, skills, agents, commands, MCPs, hooks, specs,
  rules, change lifecycle, first-task walkthrough, cheat sheet.
- `README.md`: link to START.md.

## Verification

- Secrets gate clean on repo (rc=1) — confirmed no token/connection-string-shaped
  examples in START.md.
- routing 12/12, governance 6/6 still green.
- All skill/agent/command/MCP names in START.md cross-checked against the repo
  (agents/, skills/, commands/, mcp.template.json).

## Notes

Closed via the record-change skill. Pairs with [[2026-06-19-adoption-guide]].
