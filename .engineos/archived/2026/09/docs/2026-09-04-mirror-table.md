---
name: 2026-09-04-mirror-table
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: docs
---

## What

Amend the TypeScript runtime migration design and plan so the registry-to-doc
mirror relation is one typed table, `src/checks/mirrors.ts`, run by
`src/checks/mirror.ts`, landing as Task 33b before the check families; fifteen
checks port their mirror halves as rows. Add **Mirror** to `CONTEXT.md`.

## Why

Architecture review (2026-09-04, candidate 2 of 9). C16, C19b/c, C20c,
C21b/e, C23, C24c, C25c, C26c, C27d and C28 each hand-write "this document
names what that registry declares", re-deriving section slicing and the
vacuous-grep guard (its comment appears four times in `70-runtime.sh`), and
C16's gate-ladder assertion never opens `rules/gates.md`. Plan Task 37 would
have transliterated all of it. Deletion test: remove the table and the
relation reappears in fifteen checks.

## Scope

- `docs/specs/2026-09-04-typescript-runtime-migration-design.md`
- `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
- `CONTEXT.md`

Docs and glossary only; amendment to an existing spec.

## What was made

- Design: Layout line for `checks/`; new deviation 5 (gate-ladder mirror
  becomes real); new section "Mirror table" with the frozen `MirrorPair`
  shape (two kinds: `names` with `element`, `quotes` with `pattern`; typed
  `registry` path; `anchor` or explicit `scope: 'file'`; `direction`),
  `runMirrors`, runner rules with no opt-out, check-id preservation, what
  stays code, tests, deletion test and rejected alternatives; Testing bullet.
- Plan: new Task 33b (files, source lines, invariants, TDD steps, commit);
  Tasks 37, 39, 40, 41 notes name which checks become rows; file structure
  gains `mirror` and `mirrors`.
- `CONTEXT.md`: **Mirror** entry after **Runner**.

## Checklist

- [x] Row shape frozen with two kinds and typed registry paths
- [x] Runner rules stated once, enforced for every row
- [x] Scope named: fifteen checks' mirror halves; registry-to-registry stays code
- [x] Check ids preserved; failure format names row ids
- [x] Fake gate-ladder mirror made real and recorded as deviation 5
- [x] Glossary term added
- [x] Change record written and archived

## Verification

Docs-only change, no build. `scripts/validate-engineos.sh` run once on the
branch after the PR opened, at the owner's request; result recorded in the PR.

## Human decisions

No HITL reason fired (risk low, docs only, `git revert` undoes it). Owner
decisions from the grilling round, 2026-09-04: every doc-names-registry
assertion is a row; two kinds (names, quotes); runner enforces anti-vacuity
for every row; gate-ladder row made real; check ids stay and each runs its
rows; table in `src/checks/mirrors.ts`, typed; Task 33b after the harness;
add **Mirror** to `CONTEXT.md`.

## Changes registered

Branch `docs/mirror-table` from `origin/main` (e39a6ba). Files:

```
CONTEXT.md
docs/specs/2026-09-04-typescript-runtime-migration-design.md
docs/specs/2026-09-04-typescript-runtime-migration-plan.md
.engineos/archived/2026/09/docs/2026-09-04-mirror-table.md
```

## Residual risk

Deviation 5 may fail `rules/gates.md` when Task 37 lands if the ladder table
drifts before then; the fix is prose, never the row. Typed registry paths
depend on the Wave 1 loaders' shapes being complete for `policy.json`
sub-trees the mirrors read (`hitl`, `gates`, `parallelism`, `retry`,
`telemetry`).
