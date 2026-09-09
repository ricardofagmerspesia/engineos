# Criteria for extracting a separate process or service

Date: 2026-09-07
Status: proposed

Source: "EngineOS 2.0 — Production readiness plan" (2026-09-06, rev. 2), section 4 and epic E09. Complements `2026-09-04-typescript-runtime-over-bash.md`, which decided the language of the core, not the topology.

## Context

The plan foresees queues, workers and distributed execution (E09), but it also says — correctly — that distributed components should be implemented **when the assumed capabilities require them**, and not as a universal prerequisite of a production framework. Without a written criterion, that sentence settles nothing: every team thinks its own capability requires it.

The risk here is symmetric and both sides are worth naming. Extracting too early buys network latency, a contract to version, a partial failure mode and an operational surface, all before there is load that justifies it. Extracting too late leaves a long task blocking the interactive process and forces a rewrite under incident pressure.

## Options considered

1. **Clear modules in a local runner; extraction when a declared trigger fires** (chosen).
   - Pros: the module boundary is the work the extraction will demand anyway, and it is cheap now; the trigger makes the decision verifiable instead of a matter of opinion; the local profile — which is legitimate production use — does not pay for infrastructure it does not use.
   - Cons: it requires discipline to keep the boundary clean without the pressure the network would impose. A module that shares state through a global variable does not become a service without a rewrite, and nothing warns you.

2. **Separate services from the start** (rejected).
   - Pros: the boundary is enforced by the network; scaling later is configuration.
   - Cons: the profile declared today is a local installation in `~/.claude` for 2–10 people. Introducing a queue, a broker and workers there adds failure modes the product does not have, and the plan is explicit about not forcing a stack migration without a recorded requirement.

3. **Decide case by case, with no written criterion** (rejected).
   - Pros: flexibility.
   - Cons: in practice it means the decision is made by whoever is at the keyboard, and the history does not explain why.

## Decision

Option 1. The core starts as modules inside a local runner. A module is extracted into a separate process or service when **at least one** of these triggers is observed and recorded with data, not with expectation:

| Trigger | How it is measured | Why it justifies |
|---|---|---|
| **Concurrency** | Queued tasks waiting while there is idle capacity, measured in telemetry (E05) | The single process has become the bottleneck; scaling requires real parallelism |
| **Failure isolation** | A failure of the module takes down or hangs the rest of the runner | Containment that only a process boundary gives |
| **Independent deployment** | The module needs to change at a different cadence from the core, with evidence of blocked releases | Deployment coupling is already costing |
| **Resource profile** | Memory, GPU or execution-time need incompatible with the interactive process | Cohabitation degrades the interactive path |
| **Security boundary** | Need to run under a different credential or network from the core | Least privilege requires real separation |

Language preference, architectural elegance and "we are going to need it one day" are not triggers.

## Consequences

- While no trigger fires, E09 stays **planned** and the distributed profile is not released — an incomplete feature stays disabled and explicitly not supported.
- Every module is written so that it can be extracted: communication through a versioned contract, no implicit shared state, with typed errors. The cost of that discipline is the price of not deciding the topology early.
- When a trigger does fire, the extraction goes in through E09 with what the epic demands: lease and heartbeat, idempotency per effect, an outbox where a transaction needs to publish an event, and a recovery test with a worker killed after the external effect and before the ack.
- A Python worker only goes in if an integration or operational requirement justifies it, consuming the same versioned contract — the decision about the language of the core (`2026-09-04-typescript-runtime-over-bash.md`) is not revisited out of convenience.
- A queue does not guarantee *exactly-once*. Any announced guarantee needs to say what is really idempotent and where it is not.
