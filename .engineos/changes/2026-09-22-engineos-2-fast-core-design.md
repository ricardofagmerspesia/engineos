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
- [ ] Create the implementation plan after approval

## What was made
Added the approved EngineOS 2.0 fast-core design with measurable acceptance
criteria, frozen interfaces, unresolved-to-resolved scoping behavior, safety
rules, migration requirements, verification strategy and seven delivery waves.

## Verification
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
