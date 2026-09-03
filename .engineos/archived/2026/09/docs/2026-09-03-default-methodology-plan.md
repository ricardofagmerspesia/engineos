---
name: 2026-09-03-default-methodology-plan
status: done
completed: 2026-09-03
owner: Ricardo Fagmer
spec: n/a — single docs file (the plan is itself the spec artifact), below the >2-file spec threshold
domain: docs
---

## What
Implementation plan that verifies an external methodology review against the repo and lays out ten tasks to make EngineOS the default AI-development methodology for child projects: one-command adoption, plus backpressure, circuit breaker, HITL entity, exec-journal spans, RAG evaluation metrics with hybrid retrieval and re-ranking, and an agent-memory design.

## Why
The review rated the core (router, coordinators, fan-out, contract freeze, risk-based autonomy, retry, evals) as sound and named seven gaps plus an under-specified adoption path. The gaps were verified with line evidence (Explore + router agents, 2026-09-03): backpressure/breaker/HITL/RAG-metric vocabulary has zero hits; exec-journal already carries 8 of the span fields but has no writer; adoption is blocked by the SessionStart scaffold's opt-in gate. Two incidental defects surfaced: kernel `cmd_risk` fails open on empty signals, and `docs/release-notes/` is referenced but absent.

## Scope
- docs/specs/2026-09-03-engineos-default-methodology-plan.md (new)

## Checklist
- [x] Verify the review's eight claims against the tree with path:line evidence
- [x] Dispatch the router agent (hook escalation) and fold its dispatch plan into waves
- [x] Freeze the contracts (policy.json blocks, kernel subcommands, exec-journal v2, init-project)
- [x] Record decisions with rejected alternatives (ADRs are Task 1 of the plan)
- [x] Write ten tasks with tests-first steps, validate checks and prose mirrors
- [x] Self-review: spec coverage, placeholder scan, type consistency

## What was made
One plan document. Part A is the spec (verified findings table, frozen contracts, decision table, gate-requirement status). Part B assigns owners and four waves. Part C holds Tasks 1-10 with code for every kernel resolver, test case, validate check and rule section. Part D is the self-review and the three open points for the human.

## Verification
Docs-only change; no lint/typecheck/test applies. Contract details were checked against the live files: policy.json keys, kernel.sh dispatcher and cmd_risk, exec-journal.sh flags, ensure-project-layout.sh gate, layout-manifest.sh, validate-engineos.sh C20 shape, test-kernel.sh helpers, risk.high_floors ids.

## Changes registered
?? docs/specs/2026-09-03-engineos-default-methodology-plan.md

## Notes
- Router agent classified risk=high (contract surface + child-project blast radius), autonomy A3: human approval before merge of the implementation PRs. The plan itself is docs-only.
- Claims 3 and 4 of the review were over-stated: HITL semantics and most span fields already exist deterministically; the plan builds reification and a writer, not the concept.
- Execution not started. Next step is the user's choice of subagent-driven vs inline execution, wave 1 first.
