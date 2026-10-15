---
name: 2026-10-11-dual-provider-decisions
status: active
owner: codex
spec: docs/specs/2026-10-11-dual-provider-decisions.md
domain: llm
---

## What
Implement the user's full dual-provider deterministic decision framework in the existing console.

## Why
Independent model assessments need durable, tenant-scoped application-owned scoring, evidence gates and transactional human approvals.

## Scope
Additive console decision modules/UI/APIs/migration, shared contracts, dependency wiring, setup/ADR/fixtures/tests. Existing CLI and extensive unrelated dirty tree remain intact.

## Checklist
- [x] Inspect architecture and obtain preview/identity decisions.
- [x] Record PRD, ADR, SPEC and consolidated TASKS.
- [ ] Freeze contracts and implement domain/providers, storage/workflow/API and frontend.
- [ ] Integrate and author/run the explicitly requested offline tests and checks.
- [ ] Independent critic and final user-approved security review/scans.
- [ ] Record operational limitations and setup/rollout evidence.

## What was made
In progress.

## Verification
User explicitly requested type checks, lint, tests and builds after implementation; final-stage scope is console decision implementation. No intermediate executable checks or tests. Live provider tests are opt-in. No deployment or real database migration is authorized.

## Human decisions
2026-10-11 | user | preview | declined | Skip preview and implement for this decision framework.
2026-10-11 | user | identity | selected | Keep local mode; add a fail-closed trusted identity-provider boundary for multi-user deployments.
High risk from new approval/authorization boundary; external-effect gate remains closed. Native bounded provider assessments introduce no autonomous application-agent topology.

## Changes registered
Existing dirty tree predates this feature. Task changes recorded at integration.

## Notes
Official provider documentation researched before implementing transport adapters. Implementation uses current existing console technology under explicit user instruction, overriding the default new NestJS/Mastra stack policy for this feature.
