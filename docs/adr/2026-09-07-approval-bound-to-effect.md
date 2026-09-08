# Human approval bound to the effect, not to the session

Date: 2026-09-07
Status: proposed

Source: "EngineOS 2.0 — Production readiness plan" (2026-09-06, rev. 2), epics E04 (persisted approval) and E10 (authorization at the boundary). Extends `2026-09-03-hitl-as-kernel-entity.md`, which made HITL a kernel entity without defining what an approval binds.

## Context

The kernel already answers whether a human is needed and for which reason, from a closed vocabulary. What it does not define is what the answer "yes, approved" covers. Without that, three things are left open, and all of them are security failures rather than ergonomic ones:

- An agent can obtain approval for a cheap action and reuse it for an expensive one.
- An approval obtained before a `pause` can be reused after the `resume`, when the permission has already been revoked.
- An approval can be asked twice for the same action, which trains the operator to approve without reading — the most expensive failure mode of the three, because it destroys the value of every gate.

## Options considered

1. **Approval bound to the tuple (action, arguments, target, `config_version`)** (chosen).
   - Pros: changing any element invalidates the approval, so there is no silent reuse; the same tuple is not asked twice, so the operator reads what they approve; the approval is auditable — the record says exactly what was permitted, not "the user said yes at 2pm".
   - Cons: an argument that changes innocuously (a retry with the same effect) invalidates the approval and may produce a new question. Mitigation: the effect's idempotency key, not the argument text, is what enters the tuple when the effect declares one.

2. **Approval per session or per time window** (rejected).
   - Pros: less interruption; trivial to implement.
   - Cons: it is exactly the privilege escalation the gate exists to prevent. "Approved for the next 30 minutes" means the next irreversible effect was approved by nobody.

3. **Approval per risk class** (rejected).
   - Pros: aligns with `gates.by_risk`, which already exists.
   - Cons: the class is what decides *whether* to ask, not what the answer covers. Two high-risk actions with completely different effects would share one approval.

## Decision

Option 1. An approval records `{action, arguments or idempotency key, target, config_version, who, when, reason from the HITL vocabulary}` and is valid only for that tuple.

- **Invalidation:** any change to the tuple invalidates it. Revoking a permission invalidates pending approvals, including those of resumed executions.
- **Do not repeat:** an approval that is valid for the same tuple is not asked again.
- **Re-verification at execution:** authorization is checked again at the moment of the effect, including after `pause`/`resume`. Approval does not replace authorization; they are distinct gates.
- **Scope per effect type:** read, reversible write and irreversible effect are different categories. An approval for a reversible write does not cover an irreversible effect.
- **Credentials stay out of the model's context.** The approval authorizes an action; it does not hand a secret to a prompt.

## Consequences

- Declarative configuration is not proof of blocking. A test that demonstrates the action being denied at the real boundary is what closes this gate — a check that only exists in JSON does not count.
- The change record (`.engineos/changes/`) already has the "Human decisions" section with the vocabulary from `policy.json hitl.reasons`; it becomes the human form of this same contract. A tier that required a human and records nothing has not passed its gate.
- Until E04 persists approvals bound to effects, the product has written gates and not enforced gates, and `docs/CAPABILITIES.md` must say so.
