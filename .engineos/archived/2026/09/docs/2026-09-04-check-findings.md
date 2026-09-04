---
name: 2026-09-04-check-findings
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: docs
---

## What

Amend the TypeScript runtime migration design and plan so a check reports
findings as values (`Finding { code, subject? }`, typed per check) and the
validator renders the line; the 141 mutation cases become code assertions,
family by family; deviation 8 records the FAIL-tail wording change.

## Why

Architecture review (2026-09-04, candidate 8 of 9). A check is a counter
increment and a printed sentence: 259 slug accumulations across the families,
one aggregated line per check, and 141 substring assertions on those lines in
`test-validate-engineos.sh`. Rewording breaks the suite with no behavior
change and C16's twenty-five assertions cannot be told apart. Plan Task 33
froze `CheckResult { ok, message, skipped? }`, keeping prose as the contract.
Deletion test: remove the module and each family reinvents an accumulator and
a sentence, and the tests go back to substrings.

## Scope

- `docs/specs/2026-09-04-typescript-runtime-migration-design.md`
- `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
- `CONTEXT.md`

Docs only; amendment to an existing spec. Stacked on PR #49 because deviation
8 follows its deviation 7 and the Mirror table edits build on PR #47.

## What was made

- Design: `checks/` layout line names `findings.ts`; Mirror table rows are
  findings (`id` is the code, `runMirrors` returns `Finding[]`); deviation 8;
  new section "Findings" with the frozen contract (`CheckStatus`, `Finding`,
  `CheckResult`, `HARNESS_FINDINGS`, `finding`, `result`, `render`), per-check
  code lists, harness skip semantics, test discipline, no new CLI surface,
  deletion test and rejected alternatives; Testing bullet; Waves row 5 order.
- Plan: Task 33 interface imports the findings module and `Check` carries
  `codes`; invariants and acceptance rewritten; Task 33b Step 3 emits
  findings; new Task 33c (lands first in Wave 5) with files, sources,
  invariants, tests, commit and the family PR contract; Tasks 34-41
  acceptance; Wave 6 validator suite line.
- `CONTEXT.md`: **Finding** added after **Situation**.

## Checklist

- [x] Findings as values, line rendered once
- [x] Per-check code lists with a typed constructor
- [x] Mutation cases ported to code assertions per family PR
- [x] One render format; prefixes and counters byte-exact
- [x] Mirror rows unified with findings
- [x] No new CLI flag
- [x] skipOnce / skipPending mapped to two harness codes
- [x] Task 33c placed first in Wave 5
- [x] Deviation 8 recorded
- [x] Glossary term added
- [x] Change record written and archived

## Verification

Docs-only change, no build. `scripts/validate-engineos.sh` run once on the
branch after the PR opened, at the owner's request; result recorded in the PR.

## Human decisions

No HITL reason fired (risk low, docs only, `git revert` undoes it). Owner
decisions from the grilling round, 2026-09-04: findings as values with the
line rendered; per-check code lists; cases ported per family PR; one render
format; mirror row id is the finding code; no new CLI flag; two harness codes
with two statuses; a separate Task 33c rather than widening Task 33; record
deviation 8; add **Finding**; branch stacked on PR #49.

## Changes registered

Branch `docs/check-findings` from `docs/classify-failure`. Files:

```
docs/specs/2026-09-04-typescript-runtime-migration-design.md
docs/specs/2026-09-04-typescript-runtime-migration-plan.md
CONTEXT.md
.engineos/archived/2026/09/docs/2026-09-04-check-findings.md
```

## Residual risk

Task 33c must land before Task 33 despite the letter; the plan says so
twice, but a reader skimming numbers could start the harness first and then
import a module that does not exist. Codes are chosen by each family PR, so
naming consistency across families rests on review, not on the type system.
