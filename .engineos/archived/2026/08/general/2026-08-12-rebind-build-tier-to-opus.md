---
name: 2026-08-12-rebind-build-tier-to-opus
status: done
completed: 2026-08-12
owner: Ricardo Fagmer
spec: n/a — mechanical rebind, no design change (see Why)
domain: general
---

## What
Rebound the **build** tier from `sonnet` to `opus` across every live reference:
the `rules/models.md` assignment row, the 15 agent frontmatters that carried
`model: sonnet`, and the four downstream mentions (`README.md` tier summary,
the `rules/subagents.md` announcement example, the per-unit model guidance in
`commands/implement.md`, and the advisory string in
`hooks/task-scale-advisor.sh`). All 18 agents now sit on `opus`.

Two clarifications added to `rules/models.md` so the result does not read as a
tier merge: the **build** and **design** rows stay separate under a shared
binding, and escalating out of **build** is now a no-op that has to go to
**most capable** (`fable`) or reframe the problem.

## Why
Requested directly: code work should run on Opus 5, not Sonnet. `rules/models.md`
already carries the mechanism — "the tier is the contract; the model name is just
today's binding" — so this is the rebind that file describes, not a change to the
tier structure. It is also the direction the file's own escalation posture points:
"never trade correctness for cost. When in doubt, go up a tier."

No spec, against non-negotiable #1's >2-file threshold. The threshold exists to
force design thinking before multi-file change; this change has no design content
— it is one token substituted at 20 sites, with the tier taxonomy, the router,
the dispatch rules and the agent roster all untouched. Recorded here rather than
specced, deliberately.

## Scope
- `rules/models.md` — build row `sonnet` -> `opus`; test-tier sentence repointed;
  new paragraph on the shared build/design binding; escalation bullet amended
- 15 agent frontmatters — `model: sonnet` -> `model: opus`:
  `agents/{android-builder,backend-coordinator,cicd-specialist,dba-coordinator,
  devops-coordinator,frontend-coordinator,gcp-specialist,ios-builder,
  kubernetes-specialist,llm-coordinator,mobile-coordinator,oracle-specialist,
  postgres-specialist,qa-tester,test-writer}.md`
- `README.md` — `rules/models.md` tier summary line
- `rules/subagents.md` — the green announcement example
- `commands/implement.md` — step 6 per-unit model guidance
- `hooks/task-scale-advisor.sh` — the design-work advisory string

## Not in scope
- `docs/specs/2026-07-30-parallel-fanout-model-tiers-design.md` and
  `.engineos/archived/2026/07/general/2026-07-30-parallel-fanout-model-tiers.md`
  keep `sonnet`. They are dated point-in-time accounts of what was decided then,
  not live configuration. Rewriting them would falsify the record.
- The two stale checkouts under `.claude/worktrees/` still carry `sonnet`. They
  are separate working copies, not the tracked tree.

## Checklist
- [x] `rules/models.md` build row reads `opus`
- [x] no live file outside dated records mentions `sonnet` (verified by grep,
      excluding `.git`, `.engineos`, `docs`, and `.claude/worktrees`)
- [x] all 18 agent frontmatters read `model: opus`
- [x] `hooks/task-scale-advisor.sh` still parses (`bash -n`, clean)
- [x] the build/design collapse is documented as a binding, not a merge
- [x] escalation-out-of-build no-op called out
- [x] committed atomically, separate from the ledger-debt work that shared the
      working tree (`4b43424` then `37d544c`)
- [x] PR opened and merged into `main` as #20

## What was made
The build tier reads `opus` in `rules/models.md` and in every agent frontmatter
that carried `model: sonnet`; the four downstream mentions (README tier summary,
the `rules/subagents.md` announcement example, `commands/implement.md` step 6, the
`hooks/task-scale-advisor.sh` advisory string) follow it. Two paragraphs in
`rules/models.md` state that build and design share a binding without merging as
tiers, and that escalating out of build is a no-op that must go to **most capable**.

Completed at merge time, on main: `registries/models.json` — the machine-readable
mirror this branch predates — was rebound `build: sonnet -> opus` as well, and
`scripts/validate-engineos.sh`'s model-binding uniqueness check was relaxed to
permit a documented shared binding. Without those two, the prose and the registry
would have disagreed and the validator would have failed the merge.

## Changes registered
```
M rules/models.md
M rules/subagents.md
M README.md
M commands/implement.md
M hooks/task-scale-advisor.sh
M agents/android-builder.md
M agents/backend-coordinator.md
M agents/cicd-specialist.md
M agents/dba-coordinator.md
M agents/devops-coordinator.md
M agents/frontend-coordinator.md
M agents/gcp-specialist.md
M agents/ios-builder.md
M agents/kubernetes-specialist.md
M agents/llm-coordinator.md
M agents/mobile-coordinator.md
M agents/oracle-specialist.md
M agents/postgres-specialist.md
M agents/qa-tester.md
M agents/test-writer.md
```
Merged into main via PR #20; the registry/validator half is registered in that
merge's own change record.

## Verification
Per the checklist above: `rules/models.md`'s build row reads `opus`, all 18 agent
frontmatters read `model: opus`, no live file outside dated records mentions
`sonnet` (grep, excluding `.git`, `.engineos`, `docs`, `.claude/worktrees`), and
`hooks/task-scale-advisor.sh` parses clean under `bash -n`. Post-merge
verification — the full validator and hook suites against the merged tree — is
recorded in the merge's change record, not here.
