# Dual-provider decision framework

User-approved requirements supplied on 2026-10-11. The attached request is the authoritative acceptance baseline.

Implement a production-ready TypeScript decision framework in this project using GPT and Claude together.

Work directly in the repository. Inspect the existing architecture, implement the feature, run the relevant checks, and document the result. Do not stop at a proposal or generate disconnected example code.

## 1. Inspect and adapt to the project

Before coding:

- Read repository instructions, package manifests, architecture documentation, and existing application modules.
- Identify backend/frontend frameworks, database and ORM, authentication, authorization, background jobs, configuration, logging, and test conventions.
- Find any existing AI integrations or decision workflows.
- Reuse existing infrastructure and patterns wherever practical.
- Preserve unrelated changes and existing behavior.
- Summarize the implementation plan and any material assumptions, then proceed.

Use NestJS, React, PostgreSQL, or other technologies only if they match the repository. Keep scoring and policy logic in framework-independent TypeScript modules.

Verify current official OpenAI and Anthropic documentation before implementing provider integrations. Use compatible structured-output models, configurable model IDs, and pinned dependency versions.

## 2. Core architecture

Build these responsibilities:

1. Decision input and revision management.
2. GPT and Claude provider adapters.
3. Durable workflow orchestration.
4. Structured-output and semantic validation.
5. Evidence verification.
6. Deterministic scoring.
7. Disagreement detection and bounded challenge rounds.
8. Review gates and human approvals.
9. Immutable reporting and audit history.
10. A decision interface integrated into the existing frontend, if the project has one.

Models provide assessments. Application code calculates scores, applies policies, and controls state transitions. Models cannot approve decisions or authorize consequential actions.

## 3. Decision inputs and versioning

A decision must contain:

- Question and context.
- At least two candidate options with unique IDs.
- Criteria with unique IDs, nonnegative weights, explicit scoring rubrics, and optional minimum acceptable scores.
- Hard constraints with unique IDs.
- Evidence records with source, excerpt, content hash, observation timestamp, and optional expiration timestamp.
- Risk tier: low, medium, or high.
- Reversibility.
- Owner and tenant identity using existing project conventions.

Require a positive total criterion weight.

Every criterion uses a 0–100 scale where higher means better. Represent cost, time, and risk through explicit utility rubrics.

Freeze the input before evaluation. Both providers receive the same options, rubric, constraints, and evidence snapshot.

Store immutable revisions. Changing inputs, evidence, weights, or constraints creates a new revision and invalidates previous approvals. Record the exact policy version used for every run.

Models may suggest rubric changes but cannot apply them during evaluation.

## 4. Structured evaluations

Use Zod as the contract source and provider-supported JSON Schema for structured outputs. Keep the provider-facing schema compatible with both APIs; enforce additional business rules locally.

Each provider must evaluate every option and return:

- One assessment per criterion.
- Score from 0–100, or null when unsupported.
- Lower and upper plausible score bounds.
- Concise rationale.
- Evidence IDs.
- Explicit assumptions.
- One assessment per hard constraint: pass, fail, or unknown.
- Risks, severity, and proposed mitigations.
- Preferred option ID, or null.
- Unresolved questions.

Assign provider identity, model metadata, request IDs, timestamps, and usage in trusted application code.

Reject evaluations with:

- Unknown or duplicate option, criterion, constraint, or evidence IDs.
- Missing assessment matrix entries.
- Nonfinite or out-of-range scores.
- Bounds that do not contain the point score.
- Null scores without the full [0,100] uncertainty interval.
- Invalid preferred option references.

Treat evidence-reference validity separately from factual support. A real evidence ID does not prove that the evidence supports a claim.

## 5. Provider integration

Implement a shared evaluator interface and separate OpenAI and Anthropic adapters.

Requirements:

- Use each provider’s native structured-output support.
- Parse and validate outputs locally.
- Return typed success/failure results.
- Distinguish timeout, rate limit, refusal, incomplete response, invalid output, and provider errors.
- Support cancellation, per-call deadlines, and output-token limits.
- Keep credentials server-side.
- Record actual model identity, request ID, token usage, and calculated cost where available.
- Configure model IDs through the existing configuration system.
- Do not hardcode unverified model names or pricing.

Both models independently evaluate the same rubric in the first round. Neither sees the other’s response.

The prompt must instruct models to treat evidence as untrusted data, cite only supplied evidence IDs, identify uncertainty, and return concise justifications.

## 6. Deterministic scoring

Start with equal provider weights.

Normalize criterion weights:

normalizedWeight = criterionWeight / sumOfCriterionWeights

For each eligible option:

aggregateScore =
sum(normalizedWeight × average(GPT score, Claude score))

Calculate aggregate lower and upper bounds using the same formula.

Calculate weighted disagreement:

disagreement =
sum(normalizedWeight × absolute(GPT score − Claude score))

Rules:

- Never substitute zero for missing scores.
- Never renormalize away missing criteria.
- If a positively weighted score is missing, the aggregate point score is unavailable and automatic readiness is prohibited.
- Preserve full precision internally and round only for display.
- Do not label scores or uncertainty intervals as calibrated probabilities.
- Do not weight assessments by model-reported confidence.

Determine eligibility before ranking:

- Verified hard-constraint violation: option is ineligible.
- Unknown or disputed hard constraint: option is unresolved.
- A model-reported violation requires evidence verification before becoming a confirmed violation.
- High scores cannot compensate for hard-constraint failures.

Keep aggregate utility, evidence coverage, disagreement, assumptions, and constraint status separate in reports.

## 7. Disagreement handling

Make thresholds configurable and versioned. Initial defaults:

- Different first-ranked eligible options.
- Weighted disagreement of at least 20 points.
- Criterion score gap of at least 30 points when its normalized weight is at least 0.15.
- Conflicting hard-constraint assessments.
- Conflicting material evidence claims.

Classify disagreements as factual, assumption-based, rubric interpretation, stakeholder priorities, or residual judgment.

Run at most one challenge round by default:

- Give each provider the anonymized counter-assessment.
- Require a complete revised evaluation.
- Record changed assessments, reasons, evidence references, and unresolved disagreement.
- Preserve the original evaluations.
- Recalculate scores and gates deterministically.

New evidence creates a new revision and fresh evaluations.

Do not force consensus or run indefinite debates. Route unresolved material disagreement to human review. Agreement after debate must not be treated as independent verification.

## 8. Review gates

Apply gates in a fixed order, accumulate all reasons, and let the strongest applicable gate determine the outcome.

Implement these outcomes:

- PAUSED: execution failure, unavailable provider, invalid evaluation, exhausted deadline, or exhausted budget.
- BLOCKED: all options have verified hard-constraint violations.
- NEEDS_EVIDENCE: material evidence or constraint verification is missing.
- HUMAN_REVIEW: unresolved disagreement, uncertain ranking, high risk, irreversibility, or unmet policy requirements.
- READY: all configured readiness conditions pass.

Conservative initial READY conditions:

- Low risk and reversible.
- Both evaluations are valid and complete.
- No material unresolved evidence or constraint issues.
- Winner score is at least 75.
- Winning point-score margin is at least 5.
- Winner’s lower bound exceeds every other eligible option’s upper bound.
- No unresolved critical risks.
- Winner remains stable under configured weight and assumption sensitivity tests.

Make sensitivity scenarios explicit and deterministic. Do not invent a robustness result without calculating it.

READY means ready for adoption under policy. It is not permission to execute an action.

## 9. Human review and approvals

Use existing authentication and authorization.

Approvals must bind to:

- Decision ID and revision.
- Report hash.
- Policy version.
- Selected option.
- Reviewer identity.
- Approve, reject, or request-changes disposition.
- Rationale.
- Timestamp and optional expiration.

Invalidate approvals when the bound revision, policy, or report changes.

Support two distinct reviewers for configured high-risk cases.

Enforce approval validity on the backend using transactional concurrency controls. Frontend controls alone are insufficient.

If the project has action execution, require separate action authorization and a current approved report. Otherwise, expose an integration boundary without introducing external side effects.

## 10. Durable orchestration

Implement resumable workflow stages:

1. Validate and persist the frozen decision.
2. Reserve the allowed call budget.
3. Dispatch independent GPT and Claude evaluations concurrently.
4. Persist successful evaluations immediately.
5. Validate outputs and evidence.
6. Compute preliminary scores and disagreement.
7. Run a challenge round when required and within budget.
8. Generate the final report and gate outcome.
9. Await human review when necessary.

Use Promise.allSettled or equivalent so one provider failure does not discard another provider’s success.

Never silently convert one successful provider into two-model consensus.

Reuse the project’s job infrastructure. Ensure durable checkpoints, bounded retries, cancellation, deadlines, tenant-scoped idempotency, duplicate-delivery handling, and optimistic concurrency.

Coordinate SDK retries with worker retries to avoid multiplying attempts.

Use a transactional outbox where database changes must reliably trigger jobs or notifications.

## 11. Persistence and APIs

Add migrations through the existing ORM or migration system.

Persist:

- Immutable decision revisions.
- Runs with prompt/schema/policy versions and budget.
- Provider evaluation attempts.
- Evidence checks.
- Reports with scores, dissent, and gate reasons.
- Approvals.
- Append-only audit events.

Expose project-consistent APIs for:

- Creating and revising decisions.
- Starting and cancelling runs.
- Reading run progress and reports.
- Listing decisions.
- Submitting and reading reviews.

Long-running evaluations must execute asynchronously. Return a run identifier and expose polling or existing real-time progress mechanisms.

Include authorization, tenant isolation, pagination, idempotency, and structured errors.

## 12. Frontend integration

If a frontend exists, add:

- Decision creation with options, criteria, weights, constraints, and evidence.
- Run progress.
- Side-by-side GPT and Claude assessments.
- Scores and uncertainty bounds.
- Evidence and assumption inspection.
- Disagreement and gate explanations.
- Human review controls.
- Revision and audit history.

Clearly label unavailable scores, provisional assessments, and unresolved evidence.

Generate numerical tables and gate explanations from application data. Optional AI summaries cannot change scores, eligibility, or approval status.

Follow existing design and accessibility conventions.

## 13. Operational controls

Implement:

- Per-run and tenant budgets with atomic reservation.
- Bounded exponential backoff with jitter for retryable failures.
- Rate-limit handling.
- Structured logs and traces by decision, run, and provider.
- Metrics for cost, latency, failures, disagreement, and reviewer overrides.
- Sensitive-data redaction before provider submission.
- Controlled retention and tenant-isolated access.
- Restricted evidence fetching, document-size limits, and protection against server-side request forgery if fetching is added.
- Feature flags for shadow mode, human-review mode, and low-risk readiness.

Do not log secrets or sensitive provider payloads by default.

## 14. Testing and validation

Add meaningful tests for:

- Input and evaluation invariants.
- Scoring and weight normalization.
- Missing scores and invalid bounds.
- Hard-constraint eligibility.
- Disagreement thresholds and challenge limits.
- Ties, overlapping intervals, and sensitivity ranking changes.
- Provider failures, refusals, truncation, and budget exhaustion.
- Duplicate jobs and workflow recovery.
- Concurrent reviews and stale approvals.
- Tenant isolation.
- Prompt injection in evidence.

Use mocked providers for deterministic CI tests. Make live provider smoke tests opt-in.

Create a small evaluation dataset with expected gate outcomes and expert-reviewed rankings.

Run relevant type checks, lint, tests, and builds. Report what actually passed. If credentials or infrastructure are unavailable, complete offline implementation and tests, and state exactly what remains unverified.

## 15. Deliverables

Deliver:

- Integrated implementation.
- Database migrations.
- Configuration examples without secrets.
- Automated tests.
- Architecture/ADR documentation.
- Setup and operating instructions.
- Example decision fixtures.
- A rollout plan: shadow mode, human review, then low-risk readiness.

At completion, summarize what changed, how it was validated, required configuration, and remaining limitations.

Do not claim production readiness until the relevant operational and integration checks have passed. Do not deploy, run destructive migrations, or execute external actions without explicit authorization.