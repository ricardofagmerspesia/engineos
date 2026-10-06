---
name: retro
description: "Mine archived changes, eval evidence and repeated corrections for rule/skill/registry improvements; propose, never merge. Use for retros, recurring corrections or periodic improvement reviews."
---

# Retro

Propose evidence-backed changes to rules/skills/registries; a human merges.
Stop if fewer than three change records were archived since the last retro.
Track these steps in the session task list.

## 1. Gather the window

Read the latest 20 archived records and relevant git history since the last retro
(or one month ago). Extract actual deliverables, verification, Notes and dropped
checklist items. Also read existing evidence, without running tests/evals:

- OPEN `.engineos/skill-observations/log.md` entries from `task-observer`;
- recorded `scripts/run-evals.sh` failures/changed expectations;
- recorded `scripts/validate-engineos.sh` integrity failures;
- BLOCKED/FAILED/DEGRADED change statuses;
- `.git/engineos-telemetry/*.jsonl` route/decision/verify outcomes
  (`registries/policy.json`): unused routes/rules suggest pruning, repeated
  verification failures suggest patterns.

## 2. Cluster

Require **three independent occurrences** per pattern (`rules/memory.md`).
Write `Pattern / Occurrences (ids ×3+) / Cost / Root cause`. Put smaller clusters
on a watch list. Three OPEN observations about the same rule/skill qualify too.

## 3. Place the fix

Use `rules/memory.md` placement guidance:

| Cause | Home |
|---|---|
| Missing/ambiguous rule | `rules/<domain>.md` |
| Correct rule not loaded | CLAUDE.md router + `registries/routing.json` |
| Missing gate | `registries/decision-rules.json` |
| Repeated procedure | `skills/<name>/SKILL.md` |
| Agent oversteps/under-reports | `agents/<name>.md` |
| Eval missed failure | `evals/`, after final approval |
| Project-specific convention | That project's CLAUDE.md |

If no home fits, explain why the observation is not yet an actionable fix.

## 4. Propose

Keep each pattern's proposal independently reviewable:

`Proposal: title`
`Pattern: behavior, occurrence count and ids`
`Change: exact file/text delta`
`Why this and not more: smallest root-cause fix`
`How we would know it worked: proposed eval/hook/integrity criterion`

The detection criterion is mandatory. Include deletion candidates for rules that
never caught anything; do not merely restate records or grow rules indefinitely.

## 5. Implement and deliver

Record detection criteria, then implement accepted rule changes first. Only after
integration and explicit current-task approval author/run detection tests under
`rules/verification.md`. Preserve inconvenient cases: accepted behavior changes
need explicit rule/case updates, not deletion.

Write proposals into `.engineos/changes/`, spec-linked at non-negotiable #1's
threshold. Preserve the current branch/PR until the developer requests a change;
keep unrelated proposals separately reviewable within that work. Any PR/write
follows `rules/git.md`; self-review and report actual final CI/evidence status.
Never merge automatically.

## 6. Resolve and record

For consumed observations, update only their bounded status line:
`ACTIONED (YYYY-MM-DD) — proposal <title>` if covered, or
`DECLINED (YYYY-MM-DD) — <reason>` if triaged out. Follow task-observer's live
read, backup, header-count and survival safeguards. Unconsumed entries remain OPEN;
task-observer archives dated resolutions later. Put the mined date range in the
change record's `## Notes` so the next retro does not mine it twice.
