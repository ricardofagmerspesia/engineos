---
name: task-observer
description: "Capture reusable rule/skill friction during multi-step work and feedback: violations, missing cases, better methods, obsolete steps or uncovered workflows. Also use for log/watch requests. Append OPEN observations for retro; never apply fixes."
---

# Task Observer

Capture reusable skill/rule friction during work; `retro` proposes fixes and a
human merges. Created by **Eoghan Henn / [rebelytics.com](https://rebelytics.com)**,
*One Skill to Rule Them All*, CC BY 4.0.
[Upstream](https://github.com/rebelytics/one-skill-to-rule-them-all) methodology
feedback goes upstream; EngineOS adaptation feedback goes to its repo/PR. EngineOS
replaces weekly review with retro and stores observations under `.engineos/`.

## Scope and signals

Lazily create `.engineos/skill-observations/log.md` on the first observation;
resolved entries archive to `.engineos/skill-observations/archive/log-YYYY-MM-DD.md`.
At session start, read existing OPEN entries and apply their insights silently.
Remain active through execution, feedback, reviews and methodology discussion;
casual conversation/quick factual questions are exempt.

- NEW: reusable multi-step method, repeated task structure, uncovered user workflow.
- IMPROVE: violated rule, missing edge case, better technique, mistaken assumption,
  obsolete tooling or repeated correction. Prefer enforcement over louder prose.
- SIMPLIFY: irrelevant sections, consistent shortcuts, contradictions, unused
  complexity; structurally enforce or remove repeatedly ignored rules.
- Exclude nongeneralizable corrections, already-covered preferences and unrelated
  tool bugs.

## Mandatory capture

Append silently in the same or next turn; never defer in memory. After roughly
**every third completed task-list item** and at every major deliverable, write
pending observations or a checkpoint-specific `no observations` marker.

For every append:

1. Re-read the live highest observation number; session memory is insufficient.
2. Assert the candidate header `### Observation N:` is absent; choose above all
   existing numbers if needed.
3. Count that header after writing. On collision, renumber **your bounded entry**
   identified by its append position to max+1; do not alter another session's entry.

Append this complete schema at the log's **end**; `**Status:** OPEN` is mandatory:

```markdown
### Observation [N]: [Short descriptive title]

**Status:** OPEN
**Date:** [YYYY-MM-DD]
**Session context:** [task]
**Skill:** [rule/skill/agent or "New skill candidate: [name]"]
**Type:** [engineos | project]
**Phase/Area:** [workflow section]

**Issue:** [Specific event understandable without this conversation.]
**Suggested improvement:** [Exact target/section/change or candidate scope.]
**Principle:** [Generalisable takeaway.]
```

`engineos` targets team rules/skills/agents via PR; its Principle must omit
client/project specifics. `project` targets local conventions and may retain them.

## Shared-log safety

Before every write-back re-read live state, diff and merge. Back up before any
programmatic rewrite. Mutate one bounded entry/line at a time; no greedy/DOTALL
regex across entries. Against the live pre-write file, assert header count:
status edits preserve it; archival changes it by exactly entries moved. Fail
loudly on mismatch. Before surfacing, confirm every number this session wrote
exists exactly once; restore vanished entries and log a meta-observation.

On **every** write, first archive ACTIONED/DECLINED entries with resolution dates
before today, preserving the log header. Same-day resolutions stay until tomorrow.
Unreadable/missing resolution dates receive today's date instead of archival.
Apply all rewrite safeguards to this move; the grace period lives in the file.

First-observation log header:

```markdown
# Skill Observation Log

Skill/rule friction captured during task work. Written by task-observer;
OPEN entries are consumed by retro.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = fix landed
| DECLINED (YYYY-MM-DD) = not pursued — resolved statuses require dates

---
```

## Surface and hand off

At session end, group one-line improvements by skill/rule, list new candidates
separately, say logged for retro and stop. Surface earlier only for missing user
input, a cluster on one skill, or actively wrong output. Before surfacing confirm
new entries are OPEN, engineos Principles are generalized, and survival checks passed.

This skill never applies fixes. Retro consumes OPEN entries; an explicit
`act on observation #N` request routes normally to team PR/local convention work.
Load `references/skill-authoring.md` before substantial skill edits. Actively
wrong output may be flagged now, but correction still follows that PR route.
