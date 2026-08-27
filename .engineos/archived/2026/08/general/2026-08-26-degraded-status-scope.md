---
name: 2026-08-26-degraded-status-scope
status: done
completed: 2026-08-26
owner: Ricardo Fagmer
spec: docs/specs/2026-08-26-degraded-status-scope.md
domain: general
---

## What

Scope the return envelope's `DEGRADED` status to the work inside the agent's
brief, so deliberately deferred units (another ticket, another agent, a later
wave) stop downgrading otherwise-green returns.

## Why

Agents were returning DEGRADED on every dispatch whose task list extended past
their own brief — "partial coverage" in the old row read as "anything anywhere
still pending". Real caveats drowned in the noise.

## Scope

The 19 agent files with the generic status-semantics table. The three bespoke
tables (product-spec, router, docs-writer) already scope the status correctly
and are untouched. Envelope fields and the status enum line unchanged — no
COMPATIBILITY surface change.

## Checklist

- [x] Tighten the `DEGRADED` table row in all 19 generic tables
- [x] Add the scope-boundary paragraph after the envelope rules, identically
- [x] Leave the three bespoke tables and the enum line untouched
- [x] scripts/validate-engineos.sh green

## What was made

Replaced "Done, but with caveats, warnings, or partial coverage." with "Done,
but the work you delivered carries a caveat you could not clear." in 19 agent
files, and appended one paragraph: `DEGRADED` speaks about the work inside the
brief; deferred units go under `out_of_scope` / `next_actions` and the status
stays `OK` when everything owned is done and verified.

## Verification

`scripts/validate-engineos.sh` after the sweep: envelope checks green (enum
line and section header unchanged); the 2 failures it surfaced were the prior
change record's own schema gaps, fixed in the same commit. grep confirms 19
files carry the new row and paragraph, 0 carry the old row.

## Changes registered

- agents/android-builder.md — modified
- agents/architecture-analyst.md — modified
- agents/audit-consolidator.md — modified
- agents/backend-coordinator.md — modified
- agents/cicd-specialist.md — modified
- agents/critic.md — modified
- agents/dba-coordinator.md — modified
- agents/devops-coordinator.md — modified
- agents/frontend-coordinator.md — modified
- agents/gcp-specialist.md — modified
- agents/ios-builder.md — modified
- agents/kubernetes-specialist.md — modified
- agents/llm-coordinator.md — modified
- agents/mobile-coordinator.md — modified
- agents/oracle-specialist.md — modified
- agents/postgres-specialist.md — modified
- agents/qa-tester.md — modified
- agents/security-reviewer.md — modified
- agents/test-writer.md — modified
- docs/specs/2026-08-26-degraded-status-scope.md — created
- .engineos/archived/2026/08/general/2026-08-26-agents-prompt-advisor-refs.md — amended to the archive contract (Scope/Verification/Changes registered sections, n/a spec form)
