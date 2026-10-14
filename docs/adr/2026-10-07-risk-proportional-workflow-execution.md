# Risk-proportional workflow execution

Date: 2026-10-07
Status: Accepted for working-tree implementation; no release approval

## Context

EngineOS already describes dependency-ready fan-out, flat workers, exclusive file
ownership and bounded admission. Mandatory dispatch for even indivisible edits,
unbounded task decomposition and global validation barriers add overhead without
improving every change. The developer requested fewer tasks, safe concurrency,
incremental useful results and deterministic execution, then approved proceeding
with the proposed working-tree implementation ("go for it"). That approval does
not authorize release, Git/forge writes or blanket test execution.

## Decision

Keep complexity separate from classified risk. Store reference task budgets in
`registries/policy.json`: small 1–3, medium 3–6, large 5–10. They are guidance,
not quotas. Consolidate atomic work; explain over-budget decomposition by actual
deliverables or dependencies. Before accepting a plan ask whether the same result
can be delivered with fewer tasks.

Permit direct execution only for fully scoped small, low-risk, reversible,
non-feature work without a required design gate,
touching at most two files, one domain and one indivisible unit, with neither
security-sensitive scope nor a required independent reviewer. Ordinary domain
routing supplies guidance and does not itself prohibit direct execution. Missing
facts retain delegated defaults. Reclassify before eligibility is lost. Spec,
security, reviewer, consent and Git gates remain binding.

Reuse `parallelism.wave_concurrency_cap`, lowering its initial worker limit from
6 to 3. Effective capacity remains bounded by available host worker slots with
the supervisor reserved. Preserve prerequisite integration, frozen contracts,
exclusive ownership, continuous refill, retry bounds and flat workers. Scheduling
readiness is advisory when no host launcher exists; it is never dispatch evidence.

Allow read-only component review and separately scoped deterministic checks at
stable integrated revisions. Invalidate evidence when its inputs change. Tests
still require explicit current-task approval; final-only timing remains the
default unless the developer explicitly approves a component scope and timing.
For this implementation the developer approved tests after all integration, and
that timing remains binding. A final fan-in validation is always required.

## Consequences

Small eligible changes avoid coordinator handoffs while retaining routing and
targeted validation. Larger changes retain the current safety boundaries and
use a dependency graph rather than artificial sequential waves. A task budget
cannot force extra work or suppress necessary deliverables.

Policy, prose, command mirrors, kernel consumers and integrity checks must agree
before completion. Existing public command names and return envelopes remain
compatible; new workflow fields are additive. Evidence distinguishes readiness,
execution and verified result, including unavailable usage metrics.

External skills remain references for reusable graph/frontier and PR-evidence
ideas; native EngineOS behavior owns consent, branch continuity and runtime
policy. Do not copy automatic upstream Git/worktree actions into core execution.

## Alternatives

Keeping mandatory dispatch for every edit preserves the previous shape but fails
the requested fast path. Applying the fast path to all small changes would weaken
risk gates. Creating another concurrency setting would duplicate admission
policy. Removing final validation would confuse component evidence with integrated
system correctness. These alternatives were rejected.

## Verification obligations

After integration, demonstrate direct-mode eligibility and conservative fallback,
unchanged required reviewers/spec thresholds, consolidation guidance without task
quotas, host-bounded admission/refill and invalidation of stale component evidence.
Show the final validation output and approved test results separately. No check
results are asserted by this decision record.
