# Spec — DEGRADED speaks about the brief, not the backlog

## Problem

Every agent return envelope defines `DEGRADED` as "Done, but with caveats,
warnings, or partial coverage." Combined with "pick the worst that applies,
never round up to OK", agents read work that was deliberately deferred to
another ticket, agent, or wave as "partial coverage" and mark the whole return
DEGRADED — even when everything inside their brief is done and every gate is
green. Observed repeatedly on real dispatches: a backend coordinator returning
"tickets 02–04 done, lint/typecheck/build green" as DEGRADED because a
migration run belonged to ticket 06.

The cost is signal decay: when every return is DEGRADED, the status that is
supposed to make a real caveat visible stops meaning anything, and the
parallelism failure policy ("carry the caveat into the barrier report") fires
on noise.

## Decision

`DEGRADED` is scoped to the work INSIDE the agent's brief:

- The delivered work carries a caveat the agent could not clear (a warning,
  narrowed coverage, an unverified assumption) → `DEGRADED`.
- A unit that was never the agent's — deferred to another ticket, another
  agent, or a later wave — is not degradation. It goes under `out_of_scope` or
  `next_actions`, and the status stays `OK` when everything owned is done and
  verified.

## Rejected alternative

A new status value (e.g. `OK_WITH_DEFERRALS`) — rejected because the envelope's
status enum is versioned surface (docs/COMPATIBILITY.md) and the existing
`out_of_scope` / `next_actions` fields already carry exactly this information;
a new enum value would be a breaking change to fix a wording problem.

## Scope

The 19 agent files carrying the generic status-semantics table. The three
agents with bespoke `DEGRADED` rows (product-spec, router, docs-writer) already
scope the status to their own deliverable and are untouched. The envelope's
FIELDS and the status enum line are unchanged — this is a semantics
clarification, not a surface change, so no COMPATIBILITY deprecation window
applies.

## Acceptance

- All 19 generic tables carry the tightened row and the scope-boundary
  paragraph, identically.
- `scripts/validate-engineos.sh` green (the envelope checks parse the enum
  line and section header, which are unchanged).
- An agent whose brief is fully delivered with green gates and a deferred
  sibling ticket reads the table and reports `OK`.
