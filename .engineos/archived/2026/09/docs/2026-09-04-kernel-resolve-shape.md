---
name: 2026-09-04-kernel-resolve-shape
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: docs
---

## What
Amend the TypeScript runtime migration so `src/kernel/` is one deep module,
`resolve(facts, ctx)`, with the fourteen legacy arms as projections of its
sparse answer, one new `resolve` arm (MINOR), and a differential parity suite.
Add **Declared facts** and **Projection** to `CONTEXT.md`.

## Why
Architecture review of 2026-09-04 (candidate 1, top recommendation). The plan
keyed `src/kernel/` by legacy subcommand, porting a shallow surface one to one:
`gates` is a subset of `risk`'s answer, three arms have no external caller, and
the router agent hand-composes 4+N spawns over registries `resolve-task`
already composes. Wave 1(a) writes `src/kernel/` next and `src/cli.ts`'s table
is still empty, so deciding now costs nothing.

## Scope
- `docs/specs/2026-09-04-typescript-runtime-migration-design.md` — Layout,
  new "Kernel shape" section (frozen contract), CLI surface, invariants,
  testing, waves table, decisions table
- `docs/specs/2026-09-04-typescript-runtime-migration-plan.md` — file
  structure, test convention, Wave 1(a) header, Tasks 7-13 re-shaped, new
  Tasks 8b (parity harness) and 13b (router agent switch)
- `docs/adr/2026-09-04-typescript-runtime-over-bash.md` — addendum; decision
  unchanged
- `CONTEXT.md` — two terms

## Checklist
- [x] Freeze the contract: `DeclaredFacts`, `Answer`, `KernelContext`, `Registries`
- [x] Re-key Wave 1 tasks by section, not subcommand
- [x] Add the parity harness task and the router follow-up task
- [x] Record the shape decision as an ADR addendum
- [x] Add the two domain terms

## What was made
Added a "Kernel shape" section to the design spec with the frozen TypeScript
contract, the rules of the sparse answer, the projection rule, the new public
arm, private concept modules, registry-derived vocabularies and the differential
parity suite, plus the deletion-test rationale and rejected alternatives.
Updated the layout, CLI surface, invariants, testing bullets, the Wave 1 row
(now (a)-(e)) and the decisions table. In the plan, re-keyed the file structure
and the test convention, rewrote Tasks 7 and 9-12 to build sections behind
`resolve` and projections in `cli.ts`, added Task 8b (parity harness against a
pinned legacy kernel) and Task 13b (router agent calls `resolve` once), and
added `resolve` to the shim's subcommand comment. Appended an addendum to the
runtime ADR. Added **Declared facts** and **Projection** to `CONTEXT.md` and
aligned the Decision kernel definition to the new term.

## Verification
Manual review of the diff. `scripts/validate-engineos.sh` not run (user
verification rule: run once, at the end, only when asked) — reported as
unverified; CI runs it on the PR. Docs-only change, no build.

## Human decisions
Owner decisions taken in the grilling round, 2026-09-04: scope = internal + one
new arm (not deprecating shallow arms now); sparse sections; injected lazy
Registries; differential parity suite; one module (not resolve/govern);
private concept modules; vocabularies derived from policy.json; router switch
as a follow-up PR; plan amended before code; two new CONTEXT.md terms. No
`hitl.reasons` id fired: risk medium (reversible docs, blast radius = the
migration's wave PRs, no data, internal contract), autonomy A3 — human-merged PR.

## Changes registered
```
$ git status --short
 M CONTEXT.md
 M docs/adr/2026-09-04-typescript-runtime-over-bash.md
 M docs/specs/2026-09-04-typescript-runtime-migration-design.md
 M docs/specs/2026-09-04-typescript-runtime-migration-plan.md

$ git diff --stat HEAD
 CONTEXT.md                                         |  13 ++-
 .../adr/2026-09-04-typescript-runtime-over-bash.md |  28 ++++++
 ...26-09-04-typescript-runtime-migration-design.md | 103 +++++++++++++++++++--
 ...2026-09-04-typescript-runtime-migration-plan.md |  90 +++++++++++++-----
 4 files changed, 201 insertions(+), 33 deletions(-)
```
Plus this record, created directly in the archive tree.

## Notes
Branch `docs/kernel-resolve-shape` cut from `origin/main` at `f3d5594`.
Review report (not in repo): `$TMPDIR/architecture-review-20260904-130748.html`,
nine candidates; candidates 2-9 remain open for later rounds.
