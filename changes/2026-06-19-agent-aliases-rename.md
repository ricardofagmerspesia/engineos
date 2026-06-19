---
name: 2026-06-19-agent-aliases-rename
status: done
completed: 2026-06-19
owner: Ricardo Fagmer
---

## What
Renamed 4 agent aliases per user choice: postgres tobias->pereira,
cicd fontana->gustavo, security-reviewer vega->leo-ely, test-writer mendes->ameer.
(gcp stays nakamura.) kubernetes->corradin held: collides with audit-consolidator.

## Why
User-provided handles override the earlier Claude-picked ones.

## Scope
- agents/{postgres,cicd}-specialist.md, security-reviewer.md, test-writer.md — description alias.
- START.md — alias table rows.

## Verification
- alias present in each; routing 12/12, governance 6/6.

## Notes
kubernetes alias unresolved pending collision decision (corradin already = audit-consolidator).
