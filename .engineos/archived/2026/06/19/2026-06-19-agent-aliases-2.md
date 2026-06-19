---
name: 2026-06-19-agent-aliases-2
status: done
completed: 2026-06-19
owner: Ricardo Fagmer
---

## What

Added aliases for the remaining 6 agents (description-appended, like the first
batch): kovac=kubernetes-specialist, nakamura=gcp-specialist, tobias=postgres-specialist,
fontana=cicd-specialist, vega=security-reviewer, mendes=test-writer. All 13
dispatchable agents now have a human alias; START.md table completed.

## Why

Finish the friendly-handle scheme across every agent. Names chosen by Claude (user
said "yes" without specifying) — renameable.

## Scope

- agents/{kubernetes,gcp,postgres,cicd}-specialist.md, security-reviewer.md,
  test-writer.md — alias appended to description.
- START.md — alias table extended to all agents.

## Verification

- Each agent: alias present; name/tools frontmatter unchanged.
- Gate clean (rc=1); routing 12/12, governance 6/6.

## Notes

Follows [[2026-06-19-agent-aliases]]. Aliases live in description; activate on next
session load.
