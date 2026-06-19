---
name: 2026-06-19-adoption-guide
status: active
owner: Ricardo Fagmer
---

## What

Final consistency review of the repo + a step-by-step adoption guide
(`docs/ADOPTION.md`) for applying the EngineOS patterns to a new project.

## Why

Pre-adoption: confirm no drift/regressions after the specialist + install work, and
give a newcomer a clone→working-patterns path (the review flagged the MCP-setup gap
as the main adoption blocker).

## Scope

- Review fixes (doc/comment drift, no functional breakage): routing-map "not yet
  built" comment, `ia-coordinator`→`llm-coordinator` in specs, leaf-agent dispatch
  wording.
- New: `docs/ADOPTION.md`; README link.

## Verification

(filled at close)

## Notes

Closed via the record-change skill (registered live this session) — fully
dogfooding the lifecycle. See [[2026-06-17-specialist-agents-build]].
