---
name: 2026-07-30-strategy-skill
status: done
completed: 2026-07-30
owner: Ricardo Fagmer
spec: docs/specs/2026-07-30-strategy-skill-design.md
domain: docs
---

## What
Added the `strategy` skill — five strategist modes (market opportunity, learning path,
blocked decision, positioning, hidden monetization) built on a mandatory grounding pass
that traces every claim to a dated web source or a file in the invoking project.

## Why
The five source prompts were strong personas but ungrounded: run as-is, they produce
confident, plausible, unverifiable strategy. Packaging them as an EngineOS skill adds the
thing that makes them usable — a Phase 0 that reads the project (CLAUDE.md, docs/, ADRs,
change records, git cadence, manifests) and does real web research with dated primary
sources before any analysis, plus an output contract with an explicit UNKNOWN section and
a falsifiability clause.

## Scope
- `skills/strategy/SKILL.md` — mode router, Phase 0 grounding protocol, output contract, quality bar
- `skills/strategy/references/01-market-opportunities.md` … `05-monetization.md` — the five playbooks
- `CLAUDE.md` — router row for business/career strategy intents, with the `adr` boundary
- `README.md`, `docs/START.md` — skill inventory rows

## Checklist
- [x] Skill authored with progressive disclosure (lean SKILL.md + five reference playbooks)
- [x] Grounding protocol: project scan + web research with dated primary sources
- [x] Output contract persisting to `docs/strategy/<date>-<mode>-<slug>.md`
- [x] Boundary with `adr` documented (technical decisions stay with `adr`)
- [x] Router row in `CLAUDE.md`
- [x] Inventory rows in `README.md` and `docs/START.md`
- [x] Skill registered and confirmed loadable
- [x] Design spec written at `docs/specs/2026-07-30-strategy-skill-design.md`

## What was made
Created `skills/strategy/` with a lean `SKILL.md` and five reference playbooks. The skill
routes by request signal to one of five modes, but gates all of them behind a mandatory
grounding pass: project grounding (CLAUDE.md, README, docs/adr, docs/prds, change records,
`git log`/`shortlog` cadence, manifests and CI as evidence of shipped capability) and web
grounding (minimum three distinct searches per claim family, then fetch the primary source;
every external claim carries source and publication date, searched in both the user's
language and English). Intake fields are filled from that evidence first, with a single
batched question round limited to facts that cannot exist in a repo or on the web — hours,
revenue, audience size, risk appetite. Anything still unfilled is written as `UNKNOWN` with
its effect on the conclusion stated.

Each playbook keeps its source persona and absolute rule intact — no mainstream trends, no
week exceeding the stated hours, no telling the user what to do in decision mode, no action
depending on a larger following, no revenue source requiring a product built from scratch —
and adds evidence requirements plus falsifiers. Reports persist to
`docs/strategy/<date>-<mode>-<slug>.md`. Wired the skill into the constitution router
(with an explicit boundary against `adr`, which keeps technical X-vs-Y decisions), the
README component table, and the `docs/START.md` skill table. Copied the skill into
`~/.claude/skills/strategy` to match how the other EngineOS skills are materialized on this
machine, and confirmed the harness picked it up.

## Changes registered

`git status --short`:

```
 M CLAUDE.md
 M README.md
 M docs/START.md
?? .engineos/changes/2026-07-30-strategy-skill.md
?? docs/specs/2026-07-30-strategy-skill-design.md
?? install.ps1
?? skills/strategy/
```

`git diff --stat HEAD`:

```
 CLAUDE.md     | 1 +
 README.md     | 1 +
 docs/START.md | 1 +
 3 files changed, 3 insertions(+)
```

New files (untracked, all part of this change except where noted):

- `skills/strategy/SKILL.md`
- `skills/strategy/references/01-market-opportunities.md`
- `skills/strategy/references/02-learning-path.md`
- `skills/strategy/references/03-decision-unblock.md`
- `skills/strategy/references/04-positioning.md`
- `skills/strategy/references/05-monetization.md`
- `docs/specs/2026-07-30-strategy-skill-design.md`
- `.engineos/changes/2026-07-30-strategy-skill.md` (this record, archived below)

Movements: none — no renames other than this record's own archival, from
`.engineos/changes/` to `.engineos/archived/2026/07/docs/` (year → month → `domain:`, per
`.engineos/archived/README.md`). Moved with `mv`, not `git mv`, because the record was still
untracked at archive time.

Not part of this change: `install.ps1` was already untracked in the working tree before
this work started (present in the session's opening `git status`) and is left untouched.

Outside the repo: `~/.claude/skills/strategy/` was created as a copy of `skills/strategy/`,
matching how the other EngineOS skills are materialized on this machine. Not versioned.

## Verification
- Frontmatter parses; skill appeared in the session's available-skills list under `strategy`.
- All five `references/*.md` paths named in `SKILL.md` resolve to files on disk.
- No code or build surface touched, so typecheck/lint/test gates do not apply to this change.

## Notes
- The five source prompts were Portuguese; the skill is written in English per
  `rules/base.md`, and instructs answering in the user's language.
- `strategy` deliberately overlaps zero with `adr`: `adr` records technical decisions,
  `strategy` unblocks business/career/positioning ones. The boundary is stated in both the
  router row and `references/03-decision-unblock.md`.
- Found while archiving: `~/.claude/skills/record-change/SKILL.md` had drifted from the repo
  version and still instructed archiving under `<YYYY>/<MM>/<DD>/`, which the current
  convention replaced with `<YYYY>/<MM>/<domain>/`. The repo copy was already correct; the
  local copy was refreshed from it. The other six skills were in sync. Local skills on this
  machine are plain directory copies, not junctions, so they go stale silently between
  installer runs.
- Requested during this session: `claude plugins install mattpocock-skills` and
  `claude plugin install superpowers@claude-plugins-official`. Neither could run — no
  `claude` CLI exists on this machine (searched PATH, npm global, Programs, `.local/bin`).
