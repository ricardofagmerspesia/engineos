---
name: 2026-09-04-kernel-wave1b
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 1(b) of the TypeScript runtime migration: typed `models` and `policy`
loaders, the `model`, `risk` and `repair` sections of `resolve`, and the
`model`, `risk`, `gates` and `repair` projections in the kernel CLI, with
parity against the pinned bash kernel.

## Why
Plan Task 10 (`docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
Wave 1(b)). Wave 1(a) landed the route section and the parity harness.

## Scope
- `src/registry/{models,policy}.ts` + tests
- `src/kernel/{model,risk,repair}.ts` + tests
- `src/kernel/{context,resolve,cli,index}.ts`, `resolve.test.ts`, `cli.test.ts`,
  `parity.test.ts`
- `dist/engineos.cjs` (rebuilt)

Branch `feat/kernel-wave1b` cut from `feat/kernel-wave1a` (2ea3ce6).

## Checklist
- [x] Typed `models.json` and `policy.json` loaders; `Registries` rebinds them
- [x] `modelSection`: work type -> tier -> model, escalation
- [x] `riskSection`: signals -> classified tier (policy aggregation, floors), or
      tier -> gates + spec_threshold; empty payload is an error
- [x] `repairSection`: attempt ladder, by-situation responses, never_repair
- [x] Projections `model`, `risk`, `gates`, `repair` with legacy key order
- [x] Parity cases from `scripts/test-kernel.sh` model/risk/gates/repair blocks
- [x] Final gate: typecheck + unit tests + build + bash suites, once, after asking

## What was made
- `src/registry/models.ts`: `ModelTier`, `WorkType`, `ModelsRegistry`,
  `loadModels` (strict: malformed rows and dangling tier references throw
  `KernelError`).
- `src/registry/policy.ts`: `PolicyRegistry` typed for the fields the kernel
  reads (`risk`, `repair`, `autonomy`, `retry`, `gates`), `loadPolicy` (strict).
  `RiskTier` stays defined in `intents.ts`; the policy loader imports it.
- `src/kernel/context.ts`: `Registries.models`/`.policy` typed; lazy loaders
  call `loadModels`/`loadPolicy`.
- `src/kernel/model.ts`: `modelSection` -> `{work, tier, model, escalates_to}`.
- `src/kernel/risk.ts`: `riskSection` -> `ClassifiedRiskSection`
  `{risk, autonomy_ceiling, gates, floors_applied}` from signals, or
  `TierRiskSection` `{risk, gates, spec_threshold}` from a classified tier.
  Aggregation dispatched from `policy.risk.aggregation` (only `max` bound);
  floors force `high`; empty payload refused with the bash message.
- `src/kernel/repair.ts`: `repairSection` -> `{check, action, reason}`; ladder
  from `max_fix_attempts_per_check` and `escalations`; `never_repair` and
  `by_situation` read live; six reason strings byte-identical to bash.
- `src/kernel/resolve.ts`: facts `workType`, `signals`, `riskTier`, `repair`;
  answer keys `route, model, risk, repair`; `signals` + `riskTier` together
  refused.
- `src/kernel/cli.ts`: arms `model --work`, `risk --signals`, `gates --risk`
  (projection of the tier form of `.risk`), `repair --check --attempt
  [--situation]`; missing-flag messages verbatim from bash.
- `src/kernel/parity.test.ts`: 26 new cases covering every
  `run model|risk|gates|repair` block of `scripts/test-kernel.sh`.
- `dist/engineos.cjs` rebuilt.

## Verification
Run once at the end, after asking (2026-09-04):
- `npm run typecheck`: clean.
- `npm test`: 166 pass, 0 fail, 0 skipped.
- `npm run build`: dist rebuilt, no error.
- `bash hooks/test-route.sh`: pass=41 fail=0.
- `bash scripts/test-kernel.sh`: passed 334, failed 0.
- `bash scripts/validate-engineos.sh`: passed 108, failed 0.

## Human decisions
None fired: risk low (new files under `src/`, `git revert` undoes them, no
external effect), autonomy A2. The owner chose the full gate when asked.

## Changes registered
Agent deviations accepted, all inside the plan's frozen interfaces:
- `retry.never_retry` is NOT read by `repairSection`: `cmd_repair` never reads
  it (`--situation security-risk` answers `unknown situation`), and parity
  binds to bash. The plan's Task 10 invariant overstated this; `never_retry`
  is loaded for Task 11's `hitl`.
- `repair.by_situation` is read as the dispatch table keyed by `response`;
  `--situation red` stays `unknown situation`, as in bash.
- Loaders for `models.json` and `policy.json` are strict where `routing.ts`
  and `intents.ts` are lenient: every field they read is load-bearing.
- `modelSection` throws on a dangling tier reference where bash emitted an
  empty document with exit 0 (C16 guarantees the shipped registry never hits it).
- `RiskSection` is a union (`ClassifiedRiskSection | TierRiskSection`): the two
  bash modes emit different key sets.
- Bash crash paths not reproduced and excluded from parity (commented in
  `parity.test.ts`): a flag with no value loops forever in bash; `--signals
  '[]'` writes a jq error to stderr; `--signals null|false` is "not valid
  JSON" in bash but a shape refusal here.
- `--attempt` digit-checked before `Number.parseInt` so `1abc` is refused as
  bash did.

`git status --short` before commit:
```
 M dist/engineos.cjs
 M src/kernel/cli.test.ts
 M src/kernel/cli.ts
 M src/kernel/context.ts
 M src/kernel/index.ts
 M src/kernel/parity.test.ts
 M src/kernel/resolve.test.ts
 M src/kernel/resolve.ts
?? .engineos/changes/2026-09-04-kernel-wave1b.md
?? src/kernel/model.test.ts
?? src/kernel/model.ts
?? src/kernel/repair.test.ts
?? src/kernel/repair.ts
?? src/kernel/risk.test.ts
?? src/kernel/risk.ts
?? src/registry/models.test.ts
?? src/registry/models.ts
?? src/registry/policy.test.ts
?? src/registry/policy.ts
```
`git diff --stat HEAD -- . ':!dist/engineos.cjs'`:
```
 src/kernel/cli.test.ts     | 128 ++++++++++++++
 src/kernel/cli.ts          |  83 ++++++++-
 src/kernel/context.ts      |  22 ++--
 src/kernel/index.ts        |   3 +
 src/kernel/parity.test.ts  |  67 +++++++
 src/kernel/resolve.test.ts |  65 ++++++-
 src/kernel/resolve.ts      |  38 +++-
 7 files changed, 389 insertions(+), 17 deletions(-)
```
New files: 1202 lines (source and tests).

## Residual risk
- PR exceeds the 400-line guideline (~1590 source lines). Commits split by
  layer (loaders, sections, projections); can be split into stacked PRs.
- Plan Task 10 text still claims `retry.never_retry` answers `repair`; a
  one-line plan correction is owed in a later docs PR.

## Notes
Wave A = models+model section and policy+risk+repair sections in parallel
(disjoint files; `context.ts` pre-wired by the orchestrator as the frozen
contract). Wave B = one integration agent for resolve/cli/tests/parity.
