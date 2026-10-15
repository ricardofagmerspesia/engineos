# ADR: Scoped simple-task choice and final-only validation

Status: approved plan, implementation authorized by the user invoking implement-spec.

Use the existing deterministic kernel, host-attested workflow gate and dependency scheduler. Keep routing and stack guidance; expose a scope-bound planning choice for eligible simple tasks, and allow direct execution only after an actual user direct choice. Full specs retain design obligations. Keep complexity and risk separate.

Remove the mandatory prototype question only from the eligible simple lane; the user may request a preview explicitly. The current multi-file implementation preview was explicitly declined by the user on 2026-10-13.

Require explicit full implementation-completion evidence and a final-phase consent attestation for executable validation. Keep the final validation ticket separate from implementation-completion prerequisites to avoid a circular gate. Ordinary read-only diff review is allowed during implementation; tests/checks and the security reviewer wait for final consent.

Reject automatic spec generation for every small feature (unnecessary latency), unbounded/nested agents (ownership and capacity risk), interim test execution (contradicts the user), and ignoring missing scope facts (unsafe bypass).

No agent names, rule paths or existing commands are removed. New decision fields are additive; strengthened final approval is documented as an unreleased default-deny change. Code cannot authenticate human consent: the host records actual replies honestly.
