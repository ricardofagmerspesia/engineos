---
name: 2026-09-08-prose-truth-and-english-sweep
status: done
completed: 2026-09-08
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
- [x] Unit A prose truth + C36/C37 + strategy enabled (devops-coordinator)
- [x] Unit B ci.yml comments, CAPABILITIES, COMPATIBILITY:111-209, PRD header, 4 ADRs, 4 records (docs-writer)
- [x] Unit C docs/plan/2.0 README, 01, 02 (docs-writer)
- [x] Unit D docs/plan/2.0 03, 04, 05 (docs-writer)
- [x] Unit E strategy grounding-brief, decision, opportunity (docs-writer)
- [x] Unit F strategy positioning, monetization (docs-writer)
- [x] Barrier: COMPATIBILITY Unreleased rows, accent scan, split into per-unit branches
- [x] Final gate per branch (spec "Verification")

## What was made
- Unit A (hinokuma): `src/checks/prose-truth.ts` adds C36 (router-table `/command` and `patterns/` references resolve) and C37 (numeric check-count claims equal `CHECK_IDS.length`); 68 ids, 110 results; 19 tests. CLAUDE.md, AGENTS.md, README.md, docs/CODEBASE_MAP.md, commands/route.md (jq -> node payload), templates/adapters/{claude-code,README,codex}.md, `skills/strategy` re-enabled, `registries/intents.json` router note, three COMPATIBILITY Unreleased rows. Five extra lines beyond the spec's bullets fixed (adapter enforcement table, CODEBASE_MAP mermaid count, "7 assertions") — same defect class, accepted at the barrier.
- Unit B (tomasz): ci.yml comments + the four Portuguese step names/echo strings (barrier), docs/CAPABILITIES.md, docs/COMPATIBILITY.md:111-209, docs/PRD.md header, four 2026-09-07 ADRs, four 2026-09-07 records.
- Units C/D (tomasz): docs/plan/2.0 six files. Units E/F (tomasz): docs/strategy four files (grounding brief was already English).
- Barrier decisions: number separators follow English convention everywhere (Units B/E converted, F converted by the orchestrator; a quoted external string reverted to its original); `homologation` kept in 03 (listed beside `staging` in the source); "hipótese" analyst label kept as quoted; E10-T6 dropped-negation flagged to the plan owner, not fixed; `grounding-brief.md:154` "Answer in Portuguese" left as a historical claim.
- Spec count corrected 66 -> 68 (the spec counted before adding its own two checks).

## Verification
Run once at the barrier on `docs/audit-u9-u10` (all six units integrated): `npm run build` (dist rebuilt), `npm run typecheck` clean, `node dist/engineos.cjs validate` passed 110 failed 0, `npm test` 2074 tests / 2058 pass / 0 fail, `git diff --check` clean. Accent scan over every touched file: only `São Paulo`, quoted TabNews/Alura/Outsider School text, quoted `patterns/1-Analisys` rules and the `hipótese` label remain. Per-PR branches are cherry-picks of these commits; CI re-runs the same gate on each.

## Human decisions
2026-09-08 | owner | none required (risk low) | approved | picked U9/U10 as next unit; re-enable `skills/strategy`; extend U10 to records, ADRs, docs/plan/2.0, docs/strategy

## Changes registered
```
 42 files changed, 3714 insertions(+), 2876 deletions(-)
00bdff4 docs(strategy): translate the positioning and monetization analyses to English
99cda87 docs(strategy): translate the decision and opportunity analyses to English
013100b docs(plan): translate 2.0 evidence templates, risk register and architecture contracts to English
477c661 docs(plan): translate 2.0 plan README, epic decomposition and sequencing to English
6e52990 docs: translate CI comments, capabilities baseline, compatibility sections, PRD header, 2026-09-07 ADRs and records to English
95f2a13 feat(checks): C36/C37 pin router references and check counts; prose truth sweep
8d7db14 docs: spec and record for prose truth + English sweep (U9/U10)
```
Split into six independent PRs off main (one per unit; A carries the spec and this record). Translation PRs exceed the 400-line guideline by construction and say so.

## Notes
Independent PRs, not a stack: today's out-of-order stack merges (#79 into #78's branch, #81 into #80's) stranded two PRs.
