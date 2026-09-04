---
title: Shared test harness module for the TypeScript runtime migration
status: done
domain: docs
created: 2026-09-04
completed: 2026-09-04
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
risk: low
autonomy: A2
---

## What

Amend the TypeScript runtime migration design and plan so a single fixture
harness, `src/testing/harness.ts`, lands as Task 6b in Wave 1(a) and every
later kernel, hook and ported-suite test consumes it instead of rebuilding the
temp-root / relocated-registry / envelope / transcript idiom by hand.

## Why

Architecture review (2026-09-04, candidate 7 of 9). The bash suites repeat the
same five fixtures in every file (`scripts/test-kernel.sh` 14-24 and 73-90,
`hooks/test-verify.sh` 25-60). The plan's Wave 6 paragraph prescribed copying
that idiom into 16 `*.e2e.test.ts` files with inline `mkdtempSync` + `git init`.
Deletion test: removing the harness reappears the complexity in every suite, so
it earns its keep. The interface is the test surface for every kernel and hook
module, which is why it lands before `resolve.test.ts` and `parity.test.ts`.

## Scope

- `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
- `docs/specs/2026-09-04-typescript-runtime-migration-design.md`

Docs only; below the >2-file threshold but the change is an amendment to an
existing spec, so `spec:` points at the design it amends.

## What was made

- Plan: new Task 6b between Task 6 and Task 7 with the frozen seven-export
  interface (`tempRoot`, `fixtureRepo`, `relocatedRoot`, `envelope`,
  `transcript`, `runCli`, `runInProcess`), the discipline it enforces (per-test
  root bound to `t.after`, throw on any path under the checkout, mutation on the
  registry copy only, one `RunResult` for both drives, real `input` transcript
  shape by default with `{ legacy: true }` for `tool_input`), TDD steps, commit
  message, and a note that Tasks 5-6 keep their inline `mkdtempSync`.
- Plan: file structure gains `src/testing/{harness,harness.test}.ts` marked
  test-only and never bundled.
- Plan: Wave 6 Tasks 42-57 style paragraph now says "through the shared
  harness" and names which export covers which bash idiom; transcript-driven
  suites run each case in both transcript forms; inline `mkdtempSync` + `git init`
  is called out as a review defect.
- Design: Layout gains `testing/`; Testing section gains one bullet describing
  the harness and that it is never bundled.

## Checklist

- [x] Interface frozen with exact export names and option shapes
- [x] Lands before its first consumers (Wave 1(a) `resolve.test.ts`, `parity.test.ts`)
- [x] Wave 6 paragraph no longer prescribes the inline idiom
- [x] Design layout and Testing section updated
- [x] Not bundled: stated in plan and design, asserted by `harness.test.ts`
- [x] Change record written and archived

## Human decisions

No HITL reason fired (risk low, docs only, reversible by `git revert`). Design
choices confirmed by the owner during the grilling round on 2026-09-04:
Wave 1(a) timing before resolve tests; both drives chosen per suite; real
transcript format default with a legacy flag; per-test root bound to `t.after`;
`src/testing/harness.ts` with seven exports; docs PR first.

## Changes registered

Branch `docs/test-harness-module` from `origin/main` (f3d5594). Files:

```
docs/specs/2026-09-04-typescript-runtime-migration-design.md
docs/specs/2026-09-04-typescript-runtime-migration-plan.md
.engineos/archived/2026/09/docs/2026-09-04-test-harness-module.md
```

## Residual risk

PR #42 (`docs/kernel-resolve-shape`) edits the Task 7 heading and the design
Testing bullets nearby; the hunks are adjacent, not overlapping, so whichever
merges second may need a trivial rebase. The kernel PRs that consume this
harness must not start before both land.
