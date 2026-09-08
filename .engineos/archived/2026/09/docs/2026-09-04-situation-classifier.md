---
name: 2026-09-04-situation-classifier
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: docs
---

## What

Amend the TypeScript runtime migration design and plan so the Validation gate's
red-versus-infra judgment is one module, `src/hooks/classify-failure.ts`, with
`Situation` pinned to `policy.repair.by_situation`; timeout becomes `infra`
(deviation 7); the block text comes from the kernel's `repair` section.

## Why

Architecture review (2026-09-04, candidate 5 of 9). The judgment is encoded
four times in three languages: `stop-verify.sh` exits silently below node 18
and degrades without jq, `lib-runner.sh` carries a target-absent regex per
adapter, and `kernel.sh repair --situation infra` answers a question the hook
never asks. Plan Task 17 ported the regexes as `runnerInfraSkip` and Task 25
kept the floor and the policy read inline. Deletion test: remove the module
and the floor, regexes and timeout judgment reappear in two hooks and two
adapters.

## Scope

- `docs/specs/2026-09-04-typescript-runtime-migration-design.md`
- `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
- `CONTEXT.md`

Docs only; amendment to an existing spec. Stacked on PR #48 because deviation
7 follows its deviation 6.

## What was made

- Design: Layout lines for `runner.ts` (facts only) and `classify-failure.ts`;
  deviation 7 (timeout is infra, `verify` event gains `situation` and `reason`,
  C20d re-pointed as a wiring check); new section "Situation classifier" with
  the frozen types (`Situation`, `InfraReason`, `Evidence`, `Verdict`,
  `classify`), the table rows, consumer rendering, telemetry, tests, deletion
  test and rejected alternatives; Testing bullet.
- Plan: Task 17 files, sources, interface block (`runnerRun` returns
  `timedOut`, `runnerInfraSkip` removed, classifier types added), invariants
  with the row order, commit line; Task 25 row rewritten around `classify` and
  the kernel `repairSection`; Task 25b judges through `classify`.
- `CONTEXT.md`: **Situation** added after **Check**.

## Checklist

- [x] One classifier over an evidence union; adapters return facts
- [x] `Situation` trio pinned to policy; `flaky` unreachable from one run
- [x] Regexes moved to the classifier table, verbatim
- [x] Timeout is infra, recorded as deviation 7
- [x] Block text from the kernel repair section, in-process
- [x] Infra rendering: message for gaps, silent for target-absent
- [x] `verify` event carries situation and reason
- [x] Glossary term added
- [x] Change record written and archived

## Verification

Docs-only change, no build. `scripts/validate-engineos.sh` run once on the
branch after the PR opened, at the owner's request; result recorded in the PR.

## Human decisions

No HITL reason fired (risk low, docs only, `git revert` undoes it). Owner
decisions from the grilling round, 2026-09-04: trio pinned with the hook
yielding two; one evidence union; regexes in the classifier table keyed by
runner kind; timeout is infra; kernel repair projection produces the block
text; message for gaps and quiet for target-absent; `verify` event gains the
verdict; Task 17 placement; add **Situation**; branch stacked on PR #48.

## Changes registered

Branch `docs/classify-failure` from `docs/span-lifecycle`. Files:

```
docs/specs/2026-09-04-typescript-runtime-migration-design.md
docs/specs/2026-09-04-typescript-runtime-migration-plan.md
CONTEXT.md
.engineos/archived/2026/09/docs/2026-09-04-situation-classifier.md
```

## Residual risk

Deviation 7 changes gate behavior: a genuinely hanging test now surfaces as a
message instead of a block. The message names the target, so it is visible,
but it no longer stops the turn. Task 17 grows by one module; the plan permits
a 17b split.
