---
name: 2026-09-04-kernel-wave1c
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 1(c) of the TypeScript runtime migration: the `admit`, `breaker`, `hitl`
and `waves` sections of `resolve` and their kernel CLI projections, with parity
against the pinned bash kernel.

## Why
Plan Task 11 (`docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
Wave 1(c)). Waves 1(a) and 1(b) landed route, model, risk, gates, repair.

## Scope
- `src/kernel/{admit,breaker,hitl,waves}.ts` + tests
- `src/registry/policy.ts` (+ test): `parallelism`, `breaker`, `hitl` blocks
- `src/kernel/{resolve,cli,index}.ts`, `resolve.test.ts`, `cli.test.ts`,
  `parity.test.ts`, `risk.test.ts` (fixture gains the new blocks)
- `dist/engineos.cjs` (rebuilt)

Branch `feat/kernel-wave1c` cut from `feat/kernel-wave1b` (f67e338).

## Checklist
- [x] Policy loader extended for parallelism/breaker/hitl fields
- [x] `admitSection`, `breakerSection`, `hitlSection`, `wavesSection`
- [x] Projections `admit`, `breaker`, `hitl`, `waves` with legacy key order
- [x] Parity cases from `scripts/test-kernel.sh` waves/admit/breaker/hitl blocks
- [x] Final gate: typecheck + unit tests + build + bash suites, once, after asking

## What was made
- `src/registry/policy.ts`: `ParallelismPolicy` (`wave_concurrency_cap`,
  `backpressure`), `BreakerPolicy`, `HitlPolicy`; loader reads the three blocks
  strictly. Loader tests extended with the blocks and 11 refusal cases.
- `src/kernel/admit.ts`: `admitSection` -> `{action, capacity, reason}`;
  capacity from the cap, queue bound and overload action from the registry;
  reject reason embeds `hitl: budget-exhausted`.
- `src/kernel/breaker.ts`: `breakerSection` -> `{state, allow, reason}`; six
  transitions in a table keyed by state, state membership from
  `policy.breaker.states`; thresholds from the registry.
- `src/kernel/hitl.ts`: `hitlSection` -> `{required, reasons, autonomy_after,
  record_home}`; reasons emitted in `policy.hitl.reasons` order; thin evidence
  drops one level, never below the second declared level, capped by
  `high_with_thin_evidence` at high; situations accept `hitl.situations` and
  `retry.never_retry`.
- `src/kernel/waves.ts`: `wavesSection` -> `{waves, violations, fanout_line}`;
  Kahn layering, same-file violations, layers split at the cap; cycle and
  unknown-dependency messages as bash.
- `src/kernel/resolve.ts`: facts `admit`, `breaker`, `hitl`, `waves`; answer
  key order `route, model, risk, repair, admit, breaker, hitl, waves`.
- `src/kernel/cli.ts`: four arms; counts pass a digits gate and travel as
  `NaN` so the section owns bash's numeric message; `--units` parsed as JSON.
- `src/kernel/parity.test.ts`: four arms with registry-derived case builders.
- `dist/engineos.cjs` rebuilt.

## Verification
Run once at the end, after asking (2026-09-04):
- `npm run typecheck`: clean.
- `npm test`: 277 pass, 0 fail, 0 skipped.
- `npm run build`: dist rebuilt, no error.
- `bash hooks/test-route.sh`: pass=41 fail=0.
- `bash scripts/test-kernel.sh`: passed 334, failed 0.
- `bash scripts/validate-engineos.sh`: passed 108, failed 0.

## Human decisions
None fired: risk low (new files under `src/`, `git revert` undoes them, no
external effect), autonomy A2. The owner chose the full gate when asked.

## Changes registered
Agent deviations accepted:
- Missing-value and unknown-flag messages use the `parseFlags` wording the
  plan pins (`admit: --inflight requires a value`, `admit: unknown flag --x`)
  instead of bash's per-arm text; excluded from parity, asserted in
  `cli.test.ts`. Same choice as Wave 1(b).
- `waves` refuses a unit without an id or a non-object element where bash
  answered `null` ids or leaked raw jq text. Only intentional behaviour change
  on inputs bash accepted.
- Breaker state-refusal message keeps bash's literal `closed|open|half-open`
  order (registry order differs); membership is still registry-driven.
- `hitl` external-effect floor is the named constant `A3` compared by index;
  never-below clamp is the second declared level.
- Missing policy blocks now fail in the loader with `registries/policy.json:
  .<block> must be an object` rather than bash's prose; still fail-closed.
- Relocated-registry cases (missing blocks, bogus overload action) live in the
  section unit tests, not parity: the staging harness is byte-identical.
- `waves --units` with no value hangs bash; excluded from parity.

`git status --short` before commit:
```
 M dist/engineos.cjs
 M src/kernel/cli.test.ts
 M src/kernel/cli.ts
 M src/kernel/index.ts
 M src/kernel/parity.test.ts
 M src/kernel/resolve.test.ts
 M src/kernel/resolve.ts
 M src/kernel/risk.test.ts
 M src/registry/policy.test.ts
 M src/registry/policy.ts
?? .engineos/changes/2026-09-04-kernel-wave1c.md
?? src/kernel/admit.test.ts
?? src/kernel/admit.ts
?? src/kernel/breaker.test.ts
?? src/kernel/breaker.ts
?? src/kernel/hitl.test.ts
?? src/kernel/hitl.ts
?? src/kernel/waves.test.ts
?? src/kernel/waves.ts
```
`git diff --stat HEAD -- . ':!dist/engineos.cjs'`:
```
 src/kernel/cli.test.ts      | 226 +++++++-
 src/kernel/cli.ts           | 101 +++-
 src/kernel/index.ts         |   4 +
 src/kernel/parity.test.ts   | 174 ++++++
 src/kernel/resolve.test.ts  |  77 +++
 src/kernel/resolve.ts       |  36 +-
 src/kernel/risk.test.ts     |   3 +
 src/registry/policy.test.ts |  50 ++
 src/registry/policy.ts      |  61 ++
 9 files changed, 722 insertions(+), 10 deletions(-)
```
New files: 1402 lines (source and tests).

## Residual risk
- PR exceeds the 400-line guideline (~2110 source lines). Commits split by
  layer; can be split into stacked PRs.
- Bash-verbatim `hitl requires --autonomy A0..A4` would go stale if the
  registry declared different level ids.

## Notes
Same shape as 1(b): wave A = section modules in parallel over disjoint files,
wave B = one integration agent.
