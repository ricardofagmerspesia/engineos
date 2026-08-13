---
name: 2026-08-10-task-observer-skill
status: done
completed: 2026-08-10
owner: Ricardo Fagmer
spec: docs/specs/2026-08-10-task-observer-skill-design.md
domain: general
---

## What
Added the `task-observer` skill — continuous capture of skill/rule friction
into `.engineos/skill-observations/log.md` — adapted from "One Skill to Rule
Them All" (CC BY 4.0, Eoghan Henn / rebelytics.com), and wired it into the
existing improvement loop as retro's input source.

## Why
Friction with rules and skills surfaces during work and is gone by retro
time; change records capture what was built, not what chafed. The upstream
skill formalises in-session capture, but its own review loop and Cowork
machinery conflict with EngineOS (skills change via PR; retro owns
proposals) — hence adaptation, not verbatim drop-in.

## Scope
skills/task-observer/ (new: SKILL.md + references/skill-authoring.md),
skills/retro/SKILL.md, CLAUDE.md router table, registries/intents.json,
rules/memory.md, docs/specs/2026-08-10-task-observer-skill-design.md.

## Checklist
- [x] Spec written and approved (approach + log home chosen by user)
- [x] skills/task-observer/SKILL.md with CC BY 4.0 attribution, EngineOS taxonomy (engineos|project), log-write safety, checkpoint flush
- [x] references/skill-authoring.md adapted (pre-flight principle, lean content, relocation verification)
- [x] retro: observation log added as gather source; new step 7 resolves consumed entries
- [x] CLAUDE.md: new router row (request-driven); retro row names the log
- [x] registries/intents.json: task-observer intent added, header count 29→30
- [x] rules/memory.md: knowledge-table row + log-at-friction promotion rule
- [x] scripts/validate-engineos.sh green
- [x] Embedded numbering command pre-flighted against sample data

## What was made
New capture-only skill `task-observer`: appends structured observations
(mandatory `**Status:** OPEN`, 3-step numbering discipline, bounded-mutation
log-write safety, archival-on-write, checkpoint flush every ~3rd task item)
to per-project `.engineos/skill-observations/log.md`, created lazily. Retro
now reads OPEN entries as first-class occurrences and resolves consumed ones
as ACTIONED/DECLINED with dates. Dropped from upstream: weekly-review
(superseded by retro), environments/scheduler machinery, staging/.skill
bundle delivery, confidentiality layers 2–5. Taxonomy simplified to
engineos|project. Router row + intent entry added as a pair (C16 row-count
invariant), intent is request-driven, cheap tier.

## Verification
`bash scripts/validate-engineos.sh` — passed 85, failed 0 (includes C16
row-count drift alarm, skill name resolution, empty-doc check). Embedded
log-numbering command executed against a 3-entry sample log with
out-of-order numbers — returned 12 (the max), as intended.

## Changes registered
```
 M CLAUDE.md
 M registries/intents.json
 M rules/memory.md
 M skills/retro/SKILL.md
?? docs/specs/2026-08-10-task-observer-skill-design.md
?? skills/task-observer/
 4 files changed, 35 insertions(+), 4 deletions(-)  (+ 2 new dirs/files)
```

## Notes
Upstream licence is CC BY 4.0 — attribution block kept in SKILL.md and the
adaptation stated there. The session also had the unmodified upstream skill
active as a plugin (`anthropic-skills:task-observer`); the engineos copy is
the team-shared adapted one — if both stay installed, the plugin-qualified
name disambiguates, but consider removing the plugin copy to avoid double
activation. Log home `.engineos/skill-observations/` is created lazily by
the skill, deliberately NOT added to the SessionStart scaffold set.
