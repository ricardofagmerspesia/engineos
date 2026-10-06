---
status: active
domain: docs
spec: docs/specs/2026-10-06-markdown-context-reduction.md
---

# Markdown context reduction

Risk: medium. Autonomy: A2. Gate: non-test validation complete; tests pending consent.

## Human decisions

2026-10-06: User requested all Markdown review, shorter context without losing
each activity's goal, and double-checking. Read-only semantic review is authorized;
testing/evals are not. Current PR and supervisor-routing decisions remain in force.

## Checklist

- [x] Snapshot, inventory and preservation contract recorded before edits
- [x] Core rules/entrypoints reviewed and condensed
- [x] Skills/patterns reviewed and condensed
- [x] Roles/commands/templates reviewed and condensed
- [x] Records/vendor/mirror inventory reviewed and summarized
- [x] Independent semantic review and final non-test checks

## What was made

Reviewed/indexed all 777 baseline Markdown files with purpose, loading condition,
disposition and review depth in `docs/context/markdown-inventory.json`; search
`docs/context/markdown-map.md` on demand. `docs/context/README.md` explains compact
worker briefs and conditional loading without importing the inventory wholesale.

Condensed 75 of 155 active guidance files and eight current docs; added scoped
navigation to COMPATIBILITY.md. Active guidance: 87,759 → 66,979 words (23.7%
reduction), 598,427 → 482,599 bytes. Whole baseline corpus: 761,565 → 738,775
words, 84 changed files. New discovery artifacts are outside those baseline
comparisons. Counts are whitespace words/UTF-8 bytes, not measured model tokens
or development-speed evidence.

Protected/vendor/IDE sources, fixtures and historical evidence retained. Retained
history received purpose/structure review; equivalent mirrors received canonical
comparison. This is not a claim of line-by-line historical code revalidation.
Routing, roles, gates, risk/autonomy, stack policy, worker ownership, current PR
continuity, permissions and final approval-only testing remain binding.

## Review and evidence

- Independent core/activity reviews caught malformed README rows, ambiguous
  greenfield conditions and renamed topology headings. Repaired all findings;
  restored public headings, parser anchor and conjunctions against source/snapshot.
- Agent/command frontmatter and agent return envelopes match the task snapshot.
  No protected Markdown changed; all 777 unique baseline paths are indexed.
  Inventory/registries JSON parses; new context links resolve.
- Final `npm run typecheck` passed (lint uses the identical command); final
  `npm run build` passed. Registry generation emitted 22 agents. Command generation
  emitted 35 wrappers, preserved six customized files and removed no stale files.
- Final records/docs independent audit found no remaining actionable issues;
  corrected a release-notes reference to a renumbered persistence step.
- `git diff --check` passed.
- No tests, evals, behavioral validator, startup smoke checks, benchmarks,
  installations, git/forge writes or branch/PR changes performed. Tests remain
  pending explicit current-task final-stage approval; non-test evidence does not
  establish behavioral validator success.

Rollback: restore only this task's changed paths from its snapshot, preserving
earlier working-tree changes. Record remains active; no archive/release performed.
