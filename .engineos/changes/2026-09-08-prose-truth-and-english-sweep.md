---
name: 2026-09-08-prose-truth-and-english-sweep
status: active
owner: ricardo.fagmer
spec: docs/specs/2026-09-08-prose-truth-and-english-sweep.md
domain: docs
---

## What
Audit units U9 (prose truth: false counts, dead command names, stale hook/jq/CI claims, `skills/strategy` re-enabled, checks C36/C37 pin the claims) and U10 (English-only sweep over ci.yml comments, CAPABILITIES, COMPATIBILITY:111-209, PRD header, the four 2026-09-07 records and ADRs, docs/plan/2.0, docs/strategy).

## Why
`.engineos/audits/2026-09-08-all.md` lines 16, 53-62, 99-100: prose states facts nothing checks and several are false ("62-check", "nine hooks", `/analisy-architecture`, router runs `route-escalate` first, jq in `commands/route.md`, console "not in CI"); `rules/base.md` says English only and ~3,500 lines are Portuguese.

## Scope
Six disjoint units, one wave, split into six independent PRs off main. See spec "Frozen contracts".

## Checklist
- [ ] Unit A prose truth + C36/C37 + strategy enabled (devops-coordinator)
- [ ] Unit B ci.yml comments, CAPABILITIES, COMPATIBILITY:111-209, PRD header, 4 ADRs, 4 records (docs-writer)
- [ ] Unit C docs/plan/2.0 README, 01, 02 (docs-writer)
- [ ] Unit D docs/plan/2.0 03, 04, 05 (docs-writer)
- [ ] Unit E strategy grounding-brief, decision, opportunity (docs-writer)
- [ ] Unit F strategy positioning, monetization (docs-writer)
- [ ] Barrier: COMPATIBILITY Unreleased rows, accent scan, split into per-unit branches
- [ ] Final gate per branch (spec "Verification")

## What was made
<filled on completion>

## Verification
<filled on completion>

## Human decisions
2026-09-08 | owner | none required (risk low) | approved | picked U9/U10 as next unit; re-enable `skills/strategy`; extend U10 to records, ADRs, docs/plan/2.0, docs/strategy

## Changes registered
<filled on completion>

## Notes
Independent PRs, not a stack: today's out-of-order stack merges (#79 into #78's branch, #81 into #80's) stranded two PRs.
