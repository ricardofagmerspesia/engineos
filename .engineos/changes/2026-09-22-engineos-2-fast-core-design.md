---
name: 2026-09-22-engineos-2-fast-core-design
status: active
owner: ricardofagmer
spec: docs/specs/2026-09-22-engineos-2-fast-core-design.md
domain: general
---

## What
Design EngineOS 2.0 as a faster autonomous execution core covering all eight
performance and orchestration improvements from the 2026-09-22 repository audit.

## Why
The deterministic kernel is already fast, but large eager context, mandatory
delegation, advisory-only capacity and repeated hook discovery dominate delivery
latency. The approved 2.0 design makes those costs proportional to risk and scope.

## Scope
Design-only unit: the EngineOS 2.0 control contract, direct lane, scheduler,
adapter context, runtime split, route/audit fast paths, model bindings, lifecycle
measurement, compatibility strategy and implementation waves.

## Checklist
- [x] Audit current runtime and orchestration bottlenecks
- [x] Obtain approval for all eight improvements and a breaking 2.0 target
- [x] Write the architecture design and rejected alternatives
- [ ] Owner reviews the persisted design
- [x] Create the implementation plan after approval

## What was made
Added eight implementation plans under docs/superpowers/plans/: a program plan
carrying the frozen cross-wave interfaces F1-F7 and fourteen barrier
reconciliations, plus one plan per delivery wave (74 tasks, 462 TDD steps).
Wave 1 was authored inline; Waves 2-7 were authored by six parallel agents
against the frozen contracts and integrated at a single barrier.

Added the approved EngineOS 2.0 fast-core design with measurable acceptance
criteria, frozen interfaces, unresolved-to-resolved scoping behavior, safety
rules, migration requirements, verification strategy and seven delivery waves.

## Verification
Ran the repository's own benchmark against this branch (documentation only):
route-before-change (cache hit) FAILS at median 280.0ms against a 150ms budget.
Measured the floor underneath it on the same host: bare node 54.8ms, one
git rev-parse 29.7ms. Recorded as reconciliation R9 — a pre-existing regression,
not one this work introduced, and evidence that the spec's 75ms target may sit
below the achievable floor.

Design self-review: checked for placeholders, internal contradictions, ambiguous
requirements, missing error handling, public-surface impact and unbounded scope.
No code or test suite changed in this design-only unit.

## Human decisions
2026-09-22 | ricardofagmer | high-risk | approved | all eight audited improvements in one coordinated program; breaking EngineOS 2.0 target; fast-core architecture approved

## Changes registered
Pending final design diff and commit id.

## Notes
Implementation must remain staged and reviewable even though the requested outcome
is one coordinated 2.0 release. No publish, merge or consumer migration is approved
by this design decision.
