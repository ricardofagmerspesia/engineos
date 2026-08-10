---
name: task-observer
description: Continuous capture of skill and rule friction during real work. Use during any multi-step task session when a loaded rule gets violated, a user correction reveals a missing rule or edge case, a better workflow emerges than a skill recommends, a skill section proves dead weight, or a reusable methodology surfaces that no skill captures. Also on explicit request — "log an observation", "watch for skill opportunities", "observation log". Appends to .engineos/skill-observations/log.md; the retro skill consumes OPEN entries. Capture only — proposals and merges stay with retro.
---

# Task Observer — continuous skill-friction capture

**Created by Eoghan Henn / [rebelytics.com](https://rebelytics.com)** —
*"One Skill to Rule Them All."* Licensed CC BY 4.0: share and adapt freely
with credit. Canonical source:
[github.com/rebelytics/one-skill-to-rule-them-all](https://github.com/rebelytics/one-skill-to-rule-them-all).
This is an EngineOS adaptation: the upstream weekly review is replaced by the
`retro` skill, and observation storage moved to `.engineos/`. Methodology
feedback goes to the upstream repository's issues; feedback about EngineOS'
adaptation goes to the engineos repo as a PR or issue.

Skills and rules improve best from friction noticed during real work, not
from sitting down to "improve a skill". This skill formalises that noticing
so insights survive until the next `retro`. It captures; it never proposes,
edits, or merges — that is retro's half of the loop.

## Where observations live

`.engineos/skill-observations/log.md` in the current project. Create it
lazily on the first observation (template below). Resolved entries archive to
`.engineos/skill-observations/archive/log-YYYY-MM-DD.md`.

## Session start

If the log exists, scan OPEN observations and hold them in awareness — apply
their insight to the current work even though the skill or rule file is
unchanged. Don't surface them unprompted.

## When to observe

Active for the whole task session: execution, post-task feedback, review
discussion, and meta-discussion about how the work should be done. The
observation mindset does not deactivate when the conversation shifts from
doing the work to discussing it — feedback phases are the highest-signal
input. Inactive only for casual conversation and quick factual questions.

## What to watch for

**NEW skill signals:** a reusable multi-step workflow; a methodology the user
explains that no skill captures; a recurring task type with similar
structure; the user describing a refined process ("I always do it this way").

**IMPROVE signals:** the agent violates a documented rule (the skill needs
enforcement, not louder prose); a user correction reveals a missing rule or
edge case; a better workflow emerges than the skill recommends; a technique
works well enough to promote; a wrong assumption; new tooling obsoletes a
step; corrections forming a pattern.

**SIMPLIFY signals:** a section never relevant across many sessions;
workflows users consistently shortcut; contradictory rules; "just in case"
complexity that never triggered; a rule the agent consistently fails to
follow (convert to structural enforcement or remove). Ask "what can we
remove?" as deliberately as "what should we add?"

**Do NOT log:** one-off corrections that don't generalise; preferences a
rule or skill already captures; tool bugs unrelated to methodology.

## How to log

Append **silently, within the same turn or the next** — never batch mentally
for later; the act of writing is the enforcement mechanism.

**Checkpoint flush (hard rule):** after roughly every 3rd completed task-list
item, and whenever a major deliverable is presented, write to the log —
either pending observations or a one-line `no observations` marker for that
checkpoint. A remembered "check later" is not enforcement; the write is.
Soft prompts don't survive cognitive load, which peaks exactly when the most
observations accumulate.

**Numbering discipline (every append):**

1. *Pre-check* — read the live log for the highest existing number; never
   trust session memory:

   ```bash
   grep -o '### Observation [0-9]*' .engineos/skill-observations/log.md | grep -o '[0-9]*' | sort -n | tail -1
   ```

2. *Pre-write assertion* — confirm the proposed number doesn't already exist
   (`grep -q "^### Observation ${N}:"`); if it does, increment past all
   existing numbers.
3. *Post-write verification* — count occurrences of the number after
   appending; if more than one, a parallel session collided — renumber YOUR
   entry (identified by your own append position, not by last occurrence)
   to max+1.

**Format** — always `### Observation N:`, always appended to the END of the
log. `**Status:** OPEN` is mandatory at write time: retro classifies entries
by their Status line, and a statusless entry risks silent skipping.

```markdown
### Observation [N]: [Short descriptive title]

**Status:** OPEN
**Date:** [YYYY-MM-DD]
**Session context:** [what task was being worked on]
**Skill:** [rule/skill/agent name, or "New skill candidate: [working name]"]
**Type:** [engineos | project]
**Phase/Area:** [which part of the skill or workflow]

**Issue:** [What happened — specific enough to understand weeks later
without the original conversation.]

**Suggested improvement:** [Concrete change. Name the section or rule for
existing targets; scope and key components for new-skill candidates.]

**Principle:** [The generalisable takeaway — the most important field.]
```

**Type:** `engineos` = targets team-shared rules/skills/agents; the eventual
fix is a PR to the engineos repo, so keep the Principle free of
client/project specifics. `project` = targets this project's own conventions;
specifics are fine.

## Log-write safety

The log is shared state across entries and possibly across parallel
sessions. Appends are cheap; rewrites are the dangerous mutation.

1. **Re-read immediately before any write-back.** A full-file rewrite
   (archival, renumbering) built from an earlier snapshot silently destroys
   entries other sessions appended since. Re-read, diff, merge, then write.
2. **Mutate one bounded entry at a time.** Never run a greedy/DOTALL pattern
   across the multi-entry file — anchor status edits to a single line, or
   split on `### Observation N:` headers and edit the target chunk alone.
3. **Assert the header-count invariant against the live pre-write file.** A
   status edit keeps the `### Observation` count unchanged; archival changes
   it by exactly the number moved. Fail loudly otherwise.
4. **Back up before any programmatic rewrite.** Copy `log.md` first.
5. **Verify survival, not just the write.** Before end-of-session surfacing,
   grep for every entry number this session wrote and confirm each exists
   exactly once; re-append any that vanished and log a meta-observation.

## Archival on write

On every log write, first move resolved entries — status
`ACTIONED (YYYY-MM-DD) — [what was done]` or `DECLINED (YYYY-MM-DD) —
[reason]` with a recorded date **before today** — to
`.engineos/skill-observations/archive/log-[YYYY-MM-DD].md`, preserving the
log header in the archive. Same-day resolutions stay until the next day; the
grace period lives in the file, never in session memory. A resolved entry
with no readable date gets today's date added instead of being archived.
Archival is a rewrite — full log-write safety sequence applies.

## Log template (first observation)

```markdown
# Skill Observation Log

Skill/rule friction captured during task work. Written by the task-observer
skill; OPEN entries are consumed by retro.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = fix landed
| DECLINED (YYYY-MM-DD) = decided not to pursue — resolved statuses always
carry their resolution date

---
```

## Surfacing

At end of session: grouped one-line summary — improvements grouped by
skill/rule, new-skill candidates listed separately. **Default is
log-and-defer**: state that observations are logged for the next retro, and
stop. Act in-session only when (a) the user explicitly names the action
("act on observation #N", "update X skill"), or (b) a skill is actively
producing wrong output the user should know about now. Surface earlier than
session end only when an observation needs user input to be complete, or
observations cluster on one skill.

Before surfacing, self-check: every entry has `**Status:** OPEN`; every
`engineos`-typed Principle is free of project specifics; survival check ran.

## Acting on observations

This skill never applies fixes. The paths out of the log:

- **`retro`** — the normal path. Retro reads OPEN entries as an input
  source, clusters them with change-record evidence, and proposes PR deltas.
- **Explicit user request** — "act on observation #N" routes through the
  normal router: an engineos-typed fix is a PR to the engineos repo; a
  project-typed fix lands in the project's own homes. Load
  `references/skill-authoring.md` before creating or substantially editing
  any skill.
- **In-session correction** — a skill producing wrong output right now gets
  flagged to the user; the fix still follows the PR path.

## Quick reference

| Question | Answer |
|---|---|
| When do I observe? | Whole session, including feedback and reflection phases |
| How do I log? | Silently, immediately, appended to the end, 3-step numbering |
| Checkpoint? | Every ~3rd completed task item: observations or a `no observations` marker |
| Status line? | `**Status:** OPEN` mandatory on every new entry |
| Rewriting the log? | Backup → re-read live → bounded mutation → header-count invariant → survival check |
| Who acts on entries? | `retro` (or explicit user request) — never this skill |
| engineos or project? | engineos = team rules/skills, generalised Principle; project = local conventions |
