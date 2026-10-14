---
name: 2026-10-11-session-retro-improvements
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-10-11-session-retro-improvements.md
domain: general
---

## What
Design artifacts (PRD, ADR, plan, checks, five tickets, units graph) for the
seven improvements recorded in the 2026-10-11 session retro. No implementation.

## Why
Each friction recurred within one session: notification misroutes, deprecated
rules in every turn, stale tests after a contract change, generated-file review
noise, unattributable worktrees, a Stop gate that blocks mid-PR, and an
undiscoverable compiled-test path.

## Scope
New files only: `docs/prds/`, `docs/adr/`, `.specs/features/session-retro-improvements/`,
`docs/specs/session-retro-improvements/`, `docs/specs/2026-10-11-session-retro-improvements.md`,
this record. Unrelated dirty tree untouched.

## Checklist
- [x] Verify every retro claim against the tree (corrections in the PRD "Verified facts")
- [x] PRD, ADR (proposed), plan with contracts `sri-v1` and SRI-01..23, checks
- [x] Five tickets and `units.json`; scheduler plan validation
- [x] ADR decisions O1-O4 resolved by the developer and folded into ADR, plan, checks, tickets, units.json
- [ ] Developer review of PRD scope and plan contracts
- [ ] Prototype preview choice before implementation
- [ ] Implementation through `engineos-implement-spec`; COMPATIBILITY rows for units 02 and 03
- [ ] Approved final checks; archive

## What was made
Design only; see the index.

## Verification
Document-only change. `node dist/engineos.cjs scheduler plan --units <units.json> --run-id sri-design --host-capacity 3 --time-ms 1792000000000`
(2026-10-11) answered: all five units `ready`; actions `launch` 01, 02, 03 and
`blocked (effective capacity exhausted)` 04, 05 — capacity only, no dependency or
scope error. No lint/typecheck/build/tests/evals run.
`[validation] pending — final-stage user approval required` applies to the
implementation, not to this record.

## Human decisions
2026-10-11 | Ricardo Fagmer | O1 landing order | decided | Land after PR #132 merges; run the graph on `main`; unit 03 reuses #132's `src/hooks/change-records.ts`.
2026-10-11 | Ricardo Fagmer | O2 rule loading | decided | Link the 11 always-on rules (gates.md gains the H1 marker) into `~/.claude/rules/`; link every routed and deprecated rule into `~/.claude/engineos/rules/` (not auto-loaded); inventory and resolve every `rules/*.md` reference first; stale routed symlinks in `~/.claude/rules/` removed.
2026-10-11 | Ricardo Fagmer | O3 generated attributes | decided | `linguist-generated` only, no `-diff`: `dist/**`, `package-lock.json`, `docs/context/markdown-inventory.json`; `evals/**/*.jsonl` not marked.
2026-10-11 | Ricardo Fagmer | O4 record gate | decided | No default-branch exception; an active record linked to the current branch counts as recorded in progress, `main` included.
2026-10-13 | Ricardo Fagmer | plan review | approved | PRD scope, contracts C1-C5 (`plan.md@sri-v1`), acceptance SRI-01..26 and the five-unit graph; ADR accepted. Implementation waits for PR #132 to merge.
2026-10-13 | Ricardo Fagmer | preview choice | preview-declined | Scope: the five-unit session-retro improvements plan. Question: "Would you like a throwaway prototype to preview how this will work or look before implementation?"
Pending: implementation start after PR #132 merges.

## Changes registered
Filled at integration.

## Notes
Risk low for this record (documents); units 02 and 03 are medium. Branch `main`,
PR none. Worktree: none.
