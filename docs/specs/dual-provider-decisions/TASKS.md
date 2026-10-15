# Consolidated tasks — decisions-v1

| Unit | Owner | Exclusive scope | Prerequisites | State |
|---|---|---|---|---|
| contracts | supervisor | decisions/contracts.ts, docs, package wiring | user requirements/identity/preview | frozen before dispatch |
| core-providers | llm-coordinator | decisions/core, decisions/providers | frozen contracts | ready |
| backend-workflow | backend-coordinator | decisions/backend, API routes, additive migration | frozen contracts; core exports for integration | ready for implementation |
| frontend | frontend-coordinator | features/decisions, app/decisions, navigation | frozen wire contract; backend for integration | ready for implementation |
| final-proof | supervisor/test-writer/critic | scoped tests and read-only review | all work integrated | waiting |

Three implementation units are cohesive ownership boundaries, not one task per file. Preparation proceeds concurrently; final wiring and proof wait for their actual return. Reviewers and implementation workers never share write ownership.
