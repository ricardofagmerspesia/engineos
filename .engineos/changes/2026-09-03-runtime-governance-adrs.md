---
name: 2026-09-03-runtime-governance-adrs
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md
domain: docs
---

## What
Create `docs/adr/` and record five accepted ADRs for the runtime-governance contracts frozen in Part A2 of the plan: backpressure placement, breaker vs. retry, HITL shape, span schema (including trace-id source and cost-field type), and the child-project adoption entry point.

## Why
`rules/memory.md` and `templates/project-claude.md` name `docs/adr/` as the ADR home, but the directory did not exist (plan Part A1, incidental defect 3). Part A3 lists the decisions with their rejected alternatives; `rules/gates.md` says a decision without a written rejected alternative is a preference, and `registries/decision-rules.json` `rule-public-contract` requires an `adr` artifact for this work. Tasks 2–7 cite these ADRs in their commit bodies, so they must exist before any contract is implemented.

## Scope
- `docs/adr/README.md` (new)
- `docs/adr/2026-09-03-backpressure-reuses-wave-cap.md` (new)
- `docs/adr/2026-09-03-circuit-breaker-separate-from-retry.md` (new)
- `docs/adr/2026-09-03-hitl-as-kernel-entity.md` (new)
- `docs/adr/2026-09-03-spans-extend-exec-journal.md` (new)
- `docs/adr/2026-09-03-init-project-over-env-flag.md` (new)
- `.engineos/changes/2026-09-03-runtime-governance-adrs.md` (this record)

Not touched: the plan file (Step 3 cross-link is the controller's), any registry, script, rule or hook.

## Checklist
- [x] `docs/adr/README.md` with the naming, status vocabulary and rejected-alternative rule from the brief (Step 1)
- [x] One ADR per Part A3 decision named in the brief, each with Context (A1 finding + evidence), Options considered (chosen + rejected, honest cons), Decision, Consequences (A2 contract verbatim), Status accepted, revisit triggers
- [x] Backpressure ADR Consequences carry the required verbatim sentence about `max_inflight` and C24a
- [x] Trace-id and cost-field decisions folded into the spans ADR (no free-standing ADR requested for them)
- [x] Change record created from `_template.md`
- [ ] Step 3 (plan cross-link `ADRs: docs/adr/2026-09-03-*.md`) — controller
- [ ] Step 4 (commit `docs(adr): record the runtime-governance contract decisions`) — controller

## What was made
Created `docs/adr/` with a README and five ADRs, all dated 2026-09-03 and marked accepted. Each ADR quotes its Part A1 finding with the plan's path:line evidence, weighs the chosen option against the rejected one with the cons of the winner stated, and copies the relevant Part A2 JSON block or subcommand signature into Consequences verbatim so the implementing task has a single contract to honour. The spans ADR absorbs the trace-id (`trace_id = session_id`, `span_id = tool_use_id`) and cost (`cost_micros` integer) decisions. The init-project ADR records that the `ENGINEOS_SCAFFOLD` gate is left untouched, since retiring it would be a public-surface deprecation the plan does not decide. Layout follows the `adr` skill template (Context / Options considered / Decision / Consequences) with the brief's date-slug filenames instead of the skill's `NNNN-` numbering.

## Verification
Not run — docs-only change; no lint/typecheck/test applies to the new files. `scripts/validate-engineos.sh` is expected to be unaffected (no registry, rule or hook touched); the controller runs it at the final gate.

## Changes registered
Pending commit by the controller (Step 4). Working tree: 7 new files, 0 modified.

## Notes
- Deviation from the `adr` skill: filenames use `YYYY-MM-DD-<slug>.md` per the brief's README, not `NNNN-short-title.md`; Status is `accepted` at creation because Part A3 is the reviewed decision table, not a proposal.
- The plan cites `hooks/ensure-project-layout.sh:70-73` for the opt-in gate; in the current tree it sits at lines 63-67. The init ADR quotes both so the drift is visible rather than silently corrected.
- Human decisions for this change: none required (docs-only, reversible by `git revert`).
