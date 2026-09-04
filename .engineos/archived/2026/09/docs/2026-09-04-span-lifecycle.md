---
name: 2026-09-04-span-lifecycle
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: docs
---

## What

Amend the TypeScript runtime migration design and plan so `src/hooks/telemetry.ts`
exposes a span lifecycle — one `Sink` per hook, `withSpan`, `openSpan` /
`closeSpan`, `spanIdFrom`, `event` — with capability, event, span-kind and
status ids as literal unions pinned to the registries; check C27f retires
(deviation 6).

## Why

Architecture review (2026-09-04, candidate 6 of 9). Nine bash helpers leave
ordering, id derivation and flag validity to the caller: the announce pair
derives the span id twice under a "must match exactly" comment, the telemetry
guard is checked five times, the clamp three, and a wrong capability id is
caught only by C27f grepping writers after two past mistakes. Plan Task 16
ported the helpers in the same shape. Deletion test: remove the sink and the
gate, clamp, slugs and derivation reappear in four hooks.

## Scope

- `docs/specs/2026-09-04-typescript-runtime-migration-design.md`
- `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`

Docs only; amendment to an existing spec. Stacked on PR #47 because the
deviation numbering follows its deviation 5.

## What was made

- Design: Layout line for `telemetry.ts`; Process model points at the sink;
  new deviation 6 (C27f deleted, ids typed); new section "Span lifecycle" with
  the frozen interface (`Sink`, `telemetrySink`, `SpanFacts`, `withSpan`,
  `spanIdFrom`, `openSpan`, `closeSpan`, `event`, internal `SpanWriter` seam
  with file and memory adapters), what the sink owns, consumers per hook,
  tests, deletion test and rejected alternatives.
- Plan: Task 16 interface block replaces `telemetryDir`/`telemetry`/
  `spanOpen`/`spanClose`/`span` with the lifecycle and the literal-union types;
  invariants and test file note; Task 22, 23, 24, 25 rows name the lifecycle
  calls; Task 41 row notes C27f gone.

## Checklist

- [x] Lifecycle interface frozen; callers pass facts, never flags
- [x] One id derivation for the announce pair
- [x] Gate, clock, clamp, slugs owned by the sink
- [x] Ids typed as literal unions pinned by test; C27f retired as deviation 6
- [x] C27c and C22c kept as wiring checks
- [x] Consumers named per hook task
- [x] Change record written and archived

## Verification

Docs-only change, no build. `scripts/validate-engineos.sh` run once on the
branch after the PR opened, at the owner's request; result recorded in the PR.

## Human decisions

No HITL reason fired (risk low, docs only, `git revert` undoes it). Owner
decisions from the grilling round, 2026-09-04: `withSpan` plus
`openSpan`/`closeSpan`; literal unions pinned by test with C27f retired; one
sink per hook with the writer seam inside; Task 16 slot with C27c and C22c
kept; branch stacked on PR #47.

## Changes registered

Branch `docs/span-lifecycle` from `docs/mirror-table` (741f714). Files:

```
docs/specs/2026-09-04-typescript-runtime-migration-design.md
docs/specs/2026-09-04-typescript-runtime-migration-plan.md
.engineos/archived/2026/09/docs/2026-09-04-span-lifecycle.md
```

## Residual risk

Task 16 now carries envelope, output, bypass and the lifecycle; if the PR
passes 400 lines the lifecycle splits into a Task 16b, which the plan permits.
The literal unions duplicate registry ids in TS by design; the pinning tests
are what keep that honest.
