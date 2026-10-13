---
name: tlc-spec-lean
description: Plan acceptance obligations before code, build independent slices concurrently, review independently, then test only after integrated implementation and explicit user approval.
---

# Spec-driven JavaScript development

This canonical EngineOS adaptation replaces legacy test-first skill workflows for
active development. Follow rules/verification.md, rules/parallelism.md and
rules/git.md. Existing protected or third-party copies are compatibility sources;
resolve this canonical skill first.

1. Plan: write problem, flow, impact, entities, public surfaces, one-way doors and
   EARS criteria to .specs/features/<feature>/plan.md; obtain design review as the
   feature flow requires. Record decisions before code.
2. Checks: derive checks.md as observable acceptance claims and proposed evidence.
   Map every public surface/status, entity and door to a claim. This phase creates
   no executable tests, fixtures, eval harnesses or test scripts. Review structures
   by reading; active workflows require no Python validators.
3. Tasks: assign independent implementation slices exclusive file ownership and
   dependencies. Freeze shared contracts. Dispatch ready units concurrently within
   min(policy cap, available host worker slots); refill capacity as units complete.
   Reserve the orchestrator slot; workers never recursively delegate.
4. Build: implement JavaScript/TypeScript slices without tests or intermediate
   gates. Review diffs, report evidence and integrate each dependency before its
   consumers start. Keep scope and one-way decisions aligned with the approved plan.
5. Final validation: after every slice is integrated, the orchestrator runs one
   lint/typecheck/build stage. A fresh independent Verifier reviews all claims and
   records file/line evidence, unavailable evidence and remaining risks in
   verification.md. Its review does not authorize testing.
6. Final tests: present concrete scope after integration. Reuse direct explicit current-task
   approval for that scope if already given; otherwise request it. Only then author/run tests derived from claims. Record actual results;
   without approval mark test evidence pending. TDD needs an explicit user-approved
   exception to the final-only ordering before the first test.

Preserve existing tests. No project convention, workflow, dispatched agent,
environment variable, CI/release gate or stored approval authorizes current-task
execution. Stop lint/typecheck only; approved final tests are explicit commands.
Git writes follow rules/git.md independently of design approval.

References: [build](references/build.md), [verify](references/verify.md).
