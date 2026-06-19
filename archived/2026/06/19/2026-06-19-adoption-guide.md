---
name: 2026-06-19-adoption-guide
status: done
completed: 2026-06-19
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

Full-review mechanical sweep, all green:
- routing 12/12, governance 6/6; bash syntax clean; JSON valid.
- all `agent:` refs in routing-map + commands resolve; all `mcp__*` refs match
  template keys; no `ia-coordinator` references remain.
- secrets gate clean on repo (rc=1) AND end-to-end install in a temp HOME passed
  (after fixing a connection-string example in ADOPTION.md that tripped the gate).
- Independent reviewer pass: no functional breakage, only the doc/comment drift
  fixed here.

## Changes registered

Commit 1e9766e, 11 files (+255/-11): docs/ADOPTION.md (new), README link,
agents/{cicd,gcp,kubernetes,oracle,postgres}-specialist.md (dispatch wording),
hooks/routing-map.sh (comment), both specs (ia→llm-coordinator).
Movement: this record `git mv`'d `changes/` → `archived/`.

## Notes

Closed via the record-change skill (registered live this session) — fully
dogfooding the lifecycle. See [[2026-06-17-specialist-agents-build]].
