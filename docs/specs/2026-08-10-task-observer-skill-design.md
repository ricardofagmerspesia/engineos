# Task-observer skill — continuous skill-friction capture

**Date:** 2026-08-10
**Status:** approved
**Origin:** adaptation of "One Skill to Rule Them All" (task-observer) by
Eoghan Henn / rebelytics.com, CC BY 4.0 —
https://github.com/rebelytics/one-skill-to-rule-them-all

## Problem

EngineOS improves through `retro`, which mines `.engineos/archived/` change
records periodically. But friction with rules and skills surfaces *during*
work — a rule violated mid-task, a correction revealing a missing edge case, a
section nobody ever uses — and by retro time that signal is gone. Change
records capture what was built, not what chafed. There is no continuous
capture channel feeding the improvement loop.

## Decision

Adapt the upstream task-observer skill into EngineOS as a capture-only skill.
It writes observations to a per-project log; the existing `retro` skill
consumes them. One improvement loop, two ends: observer feeds, retro triages
and proposes via PR, a human merges.

**Rejected alternatives:**
- *Verbatim drop-in* — upstream's weekly review applies skill edits itself
  (duplicate improvement loop, contradicts "skills change via PR"), and its
  machinery is Cowork-specific (schedulers, `.skill` bundles, staging dirs).
- *Extend retro only* — loses the per-session capture protocol (numbering
  discipline, log-write safety, checkpoint flushes), which is the part that
  makes capture actually happen under cognitive load.

## Design

### New: `skills/task-observer/`

- `SKILL.md` — session protocol (scan OPEN entries at start), observation
  signals (new / improve / simplify), log format with mandatory
  `**Status:** OPEN`, numbering discipline (pre-check, pre-write assert,
  post-write verify), log-write safety (bounded mutations, re-read before
  write-back, header-count invariant, survival check), checkpoint flush every
  ~3rd todo completion, archival on write, end-of-session surfacing with
  log-and-defer default. CC BY 4.0 attribution block kept, marked "adapted
  for EngineOS".
- `references/skill-authoring.md` — adapted authoring guidance: lean-content
  rule, pre-flight enforcement principle, verified embedded commands,
  relocation verification, EngineOS taxonomy.

**Dropped from upstream:** `weekly-review.md` (retro owns review),
`environments.md` (Cowork/scheduler-specific), confidentiality layers 2–5,
staging/`.skill` bundle delivery, workspace-folder resolution.

**Taxonomy simplified:** upstream's `open-source | internal` becomes
`engineos | project` — an `engineos` observation targets team-shared
rules/skills (fix lands via PR to the engineos repo); a `project` observation
targets project-local conventions (fix lands in that project's CLAUDE.md or
docs).

### Log home

`.engineos/skill-observations/log.md`, created lazily on first observation.
Resolved entries archive to `.engineos/skill-observations/archive/` by date.
Not added to the SessionStart scaffold — lazy creation keeps unrelated
projects clean.

### Changed: `skills/retro/SKILL.md`

Step 1 gathers OPEN observations from the log as a first-class input source.
Step 6 marks consumed entries `ACTIONED (YYYY-MM-DD)` / `DECLINED
(YYYY-MM-DD)`; task-observer's archival-on-write moves them out later.

### Wiring

- `CLAUDE.md` — one new router table row (request-driven, no hook mirror).
- `registries/intents.json` — one new intent `task-observer`; header count
  text bumped (30 entries / 29 rows). Validate C16 enforces the pairing.
- `rules/memory.md` — knowledge-table row: skill observations live in project
  `.engineos/skill-observations/`, written by task-observer, consumed by
  retro. Plus one always-on line: log friction when noticed, don't wait for
  retro.

## Acceptance criteria

- `scripts/validate-engineos.sh` passes (row count, skill resolution).
- `skills/task-observer/SKILL.md` carries upstream attribution + CC BY 4.0.
- Retro names the observation log as an input and defines status transition.
- Router table row and intent entry exist and agree.
- No hook changes; intent is request-driven (`hook_mirrored: false`).

## Risk

Low — additive, trivially reverted, no runtime surface. Autonomy A2.
