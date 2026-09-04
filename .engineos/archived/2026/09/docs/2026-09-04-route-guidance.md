---
name: 2026-09-04-route-guidance
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: docs
---

## What

Amend the TypeScript runtime migration design and plan so `routing.json`
carries one form per domain row (`rules`, `skills`, `agent`, optional `hint`),
the kernel renders `hook_guidance` and derives `risk_floor` from the owning
intent, and the `route-path` answer stays seven fields (deviation 9).

## Why

Architecture review (2026-09-04, candidate 9 of 9). The route answer is wider
than its one runtime caller reads, and the registry stores the rendered
string beside the fields it was rendered from: two dialects kept equal by C14
and restated ten times in `test-route.sh`. The domain `risk_floor` has no
runtime reader; `resolve-task` floors from `intents.json` and C16 only asserts
the two agree. Deletion test: remove the renderer and the string returns to
the registry as data a check must keep equal to its neighbours.

## Scope

- `docs/specs/2026-09-04-typescript-runtime-migration-design.md`
- `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`

Docs only; amendment to an existing spec. Stacked on PR #50 because deviation
9 follows its deviation 8.

## What was made

- Design: kernel layout line names `route.ts`'s renderer; deviation 9; new
  section "Route guidance" with the frozen `RoutingDomain`, `renderGuidance`,
  `floorOf` and derived `RouteSection`, the two-step landing (Task 7 parity,
  Task 13 deletion), tests, deletion test and rejected alternatives; Testing
  bullet.
- Plan: Task 7 loader drops the two fields and gains `hint`; `RouteSection`
  typed with derived fields; `renderGuidance` and `floorOf` exports; parity
  test paragraph including the three moved parentheticals and the
  `test-route.sh` literal updates; `routeByPath` fills the derived fields;
  Task 13 files list carries the registry deletion and check rewrites; rows
  21, 35 and 37 updated.

## Checklist

- [x] One form in the registry; `hint` holds the parentheticals
- [x] `risk_floor` deleted from domains, derived from the owning intent
- [x] Renderer in the kernel; `route-path` answer shape unchanged
- [x] Two-step landing: parity in Task 7, deletion in Task 13
- [x] MINOR with release note, recorded as deviation 9
- [x] Wave 6 route e2e keeps ten literals
- [x] No glossary change (Route covers it)
- [x] Change record written and archived

## Verification

Docs-only change, no build. `scripts/validate-engineos.sh` run once on the
branch after the PR opened, at the owner's request; result recorded in the PR.

## Human decisions

No HITL reason fired (risk low, docs only, `git revert` undoes it). Owner
decisions from the grilling round, 2026-09-04: render plus optional `hint`;
delete the domain floor and derive from the intent; renderer in
`src/kernel/route.ts` with derived fields; two-step landing; MINOR with a
release note; keep the ten literals; no new glossary term; branch stacked on
PR #50.

## Changes registered

Branch `docs/route-guidance` from `docs/check-findings`. Files:

```
docs/specs/2026-09-04-typescript-runtime-migration-design.md
docs/specs/2026-09-04-typescript-runtime-migration-plan.md
.engineos/archived/2026/09/docs/2026-09-04-route-guidance.md
```

## Residual risk

Three hook guidance lines change by a few characters in Task 7 (parenthetical
moved to the end); any consumer grepping those exact lines outside this repo
would notice, though none is known. The floor derivation assumes exactly one
intent per domain, which a test asserts; a future second intent on one domain
would need a max rule the plan does not define.
