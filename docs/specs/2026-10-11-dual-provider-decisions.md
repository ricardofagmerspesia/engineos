# Dual-provider decision framework — approved implementation contract

Source: docs/prds/2026-10-11-dual-provider-decisions.md. Architecture: docs/adr/2026-10-11-dual-provider-decisions.md. Risk high; local editing A2. Branch main; PR unknown. User explicitly declined preview and selected local mode with a fail-closed trusted multi-user identity boundary.

## Frozen contract

Owner: supervisor. Revision: decisions-v1. Authoritative schemas/types: console/src/lib/decisions/contracts.ts. APIs use the existing Next console as explicitly requested, not a new application stack. Model calls are independent first-round evaluations of one immutable input; at most one anonymous challenge round. Durable worker persistence, budgets, leases and idempotency are transactional. Human evidence verification is separate from syntactic citation validity. Scoring/gates/approvals are deterministic and version-bound.

## Acceptance

The 15 sections of the user PRD are binding. In particular: complete ID matrices and bounded finite scores; no missing-score renormalization; hard-constraint eligibility precedes scoring; fixed strongest-gate precedence PAUSED > BLOCKED > NEEDS_EVIDENCE > HUMAN_REVIEW > READY; conservative readiness and explicit calculated sensitivity; atomic budget reservation; successful provider checkpoints retained; complete revisions and report hashes immutable; exact report/revision/policy approvals with distinct identities; no model-derived authorization; local mode cannot satisfy dual identities; no payload/secret logging.

## Delivery graph

1. core-providers: contracts consumed read-only; domain schemas/validation, evidence, scoring, sensitivity, gates, disagreement, native provider fetch adapters/config/prompts. Owner llm-coordinator. Scope console/src/lib/decisions/core/** and providers/**.
2. backend-workflow: frozen contracts; repository/migration, trusted principal/service/API, outbox durable leased worker and checkpointed attempts. Owner backend-coordinator. Scope console/src/lib/decisions/backend/**, console/src/app/api/decisions/** and additive migration. Runtime integration depends on core-providers exports.
3. frontend: frozen wire contract; forms/list/detail/reviews/evidence/progress/audit and navigation. Owner frontend-coordinator. Scope console/src/features/decisions/**, console/src/app/decisions/**, layout.tsx and page.tsx. Runtime integration depends on backend API.
4. final-proof: after integration, meaningful deterministic core/provider/store/worker/approval/tenant tests, fixtures, eval cases and offline checks. Owner supervisor/test worker. User explicitly requested checks after implementation, including tests; live provider calls remain opt-in. Security reviewer and scans require their separate final clickable consent; independent critic is required after integration.

Shared wiring: supervisor owns contracts, package manifests/locks, tsconfig, worker launcher and setup docs. No other worker edits these. Read-only reviewers receive the integrated revision. Existing dirty changes are preserved.

## Evidence and limitations

Run console typecheck, lint, tests and build after integrated implementation, with the user's current-task explicit final-stage request recorded. Reuse successful evidence only for unchanged inputs; repair at most twice with affected checks. Live integration lacks credentials unless explicitly configured and opted in. No expert human rankings are invented: supplied synthetic gate cases are marked awaiting expert review. No claims of live operational readiness without live integration/identity/storage checks.
