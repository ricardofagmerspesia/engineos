---
name: retro
description: Mine closed change records, eval failures and recurring corrections for durable improvements to EngineOS rules, skills and registries — then propose them as a PR. Use when asked to "run a retro", "what should we improve", "learn from the last N changes", periodically (monthly is a reasonable cadence), or when the same correction has come up repeatedly. Proposes; never merges.
---

# Retro

`.engineos/archived/` accumulates change records that nothing ever reads.
`rules/memory.md` has a promotion rule — a note repeated three times should be
promoted — with no mechanism to notice the third time. This skill is that
mechanism.

**It proposes. A human merges.** Constrained self-improvement is the point: a
system that edits its own constitution unsupervised is not improving, it is
drifting.

## When to stop before starting

If fewer than 3 change records have been archived since the last retro, stop and
say so. A retro over one record produces noise dressed as insight.

## Steps

Track each step in the session's task list.

### 1. Gather the window

```bash
ls -1 .engineos/archived/*/*/*/*.md | tail -20
git log --oneline --since="<last retro date or 1 month ago>"
```

Read the records. For each, extract: what was made, what verification actually
ran, what the `## Notes` section flagged, and any checklist item struck through
rather than ticked.

Also gather, when the repo has them:
- eval failures: `scripts/run-evals.sh` output, and any case whose expectation
  was changed rather than met;
- integrity failures: anything `scripts/validate-engineos.sh` caught that a rule
  should have prevented;
- `BLOCKED` / `FAILED` / `DEGRADED` statuses recorded in change records;
- kernel telemetry: `.git/engineos-telemetry/*.jsonl` (route, decision-rules
  and verify events — ids and outcomes per session; see
  `registries/policy.json` telemetry). Intents and rules that never fire are
  prune evidence; repeated `verify failed` on the same target is a pattern
  candidate.

### 2. Cluster, do not list

Group observations into recurring patterns. A pattern needs **three
independent occurrences** to qualify — this is `rules/memory.md`'s threshold, and
it is what separates a pattern from a bad day.

For each cluster write:

```
Pattern: <what keeps happening>
Occurrences: <record/commit/eval id> x3+
Cost: <what it actually cost — rework, an incident, a wrong route, wasted context>
Root cause: <why the current rules permit it>
```

Discard clusters with fewer than three occurrences into a "watch list" section.
They are not yet evidence.

### 3. Decide where each fix belongs

Use `rules/memory.md`'s placement table. The common outcomes:

| Root cause | Fix goes to |
|---|---|
| A rule is missing or ambiguous | `rules/<domain>.md` |
| A rule is right but never loaded for this intent | the CLAUDE.md router row, and `registries/routing.json` |
| A gate requirement is missing | `registries/decision-rules.json` |
| A procedure keeps being reinvented | a new or extended `skills/<name>/SKILL.md` |
| An agent keeps overstepping or under-reporting | that `agents/<name>.md` |
| The eval set never caught it | a new case in `evals/` |
| It is project-specific, not team-wide | that project's `CLAUDE.md`, not here |

A fix with no home in this table is usually not a fix — it is a complaint.
Say so plainly rather than inventing a rule for it.

### 4. Write the proposals

One proposal per pattern, each independently mergeable:

```markdown
## Proposal: <short title>

**Pattern:** <what keeps happening> (<n> occurrences: <ids>)
**Change:** <the exact edit — file, and the text to add or replace>
**Why this and not more:** <the smallest change that addresses the root cause>
**How we would know it worked:** <the eval case, hook test, or integrity check
that would now fail if the pattern recurred>
```

The last field is not optional. A rule change with no way to detect the pattern
returning is how rule files grow without getting better.

### 5. Add the detection first

For every accepted proposal that can be mechanically detected, write the eval
case or hook test **before** the rule change, and confirm it fails. Same
discipline as a regression test (`rules/testing.md`): a fix whose test never
failed has not been shown to fix anything.

### 6. Deliver as a change record and a PR

- Write the proposals into a change record under `.engineos/changes/`, spec-linked
  if the total crosses non-negotiable #1's threshold.
- Open a PR per `rules/git.md` — under 400 lines, self-reviewed, CI green.
- Do not merge. The whole point is that a human decides which lessons become law.

### 7. Record the window

Note the date range covered in the change record's `## Notes`, so the next retro
knows where to start and records are not mined twice.

## Anti-patterns

- **Proposing a rule for a one-off.** Three occurrences or it goes on the watch
  list. Rules written from single incidents are the main way a constitution
  becomes unreadable.
- **Deleting the inconvenient eval case.** If a case fails and the team accepts
  the new behaviour, that is a rule change with a case update — not a deletion.
- **Restating what the records already say.** A retro that summarizes is a
  report. A retro that changes a rule is a retro.
- **Batching unrelated proposals into one PR.** They get accepted or rejected as
  a block, which means the weakest one decides.
- **Growing rules only.** Every retro should also ask which rule has never once
  been the reason something was caught. Propose deleting it.
