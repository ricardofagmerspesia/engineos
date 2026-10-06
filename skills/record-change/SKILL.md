---
name: record-change
description: "Finalize a completed change record: deliverables, checklist, decisions, diff, archive and Stop marker. Use on completion, record/log requests or unrecorded-change Stop gates."
---

# Record a change

Close one completed unit's record from `.engineos/changes/` to
`.engineos/archived/`, then clear its Stop-gate unrecorded marker.
Track steps in order; git writes independently follow `rules/git.md`.

1. Find the active record matching this work. If absent, create
   `<YYYY-MM-DD>-<short-kebab-slug>.md` from `.engineos/changes/_template.md`
   with What/Why/Scope. Set `domain:` to backend, frontend, mobile, dba, llm,
   devops, security, test, docs or general.
2. Check Scope/`git diff --stat HEAD` against spec threshold: >2 files or any
   new feature. Below threshold, set literal `spec: n/a — <reason>` (C21).
   Otherwise verify `spec:` points to an existing `docs/specs/` file;
   missing spec blocks archival until brainstorm/design is recorded at
   `docs/specs/<YYYY-MM-DD>-<slug>-design.md` and linked.
3. Fill `## What was made` with concrete past-tense deliverables. Resolve every
   `## Checklist` item: tick or strike through with its reason. Fill
   `## Human decisions` with actual date/person/HITL reason ids/approved-or-refused/
   note for reasons from `registries/policy.json` `hitl.reasons`
   (kernel HITL/advisor evidence); if none fired, state that. Remove placeholder
   comments; a present but empty section is not evidence.
4. Under `## Changes registered`, paste actual `git status --short` and
   `git diff --stat HEAD`, including touched files and movements/renames.
   For work spanning commits also paste `git log --oneline <base>..HEAD`.
   This section is required for archives completed from 2026-08-06 (C21).
5. Only with deliverables/checklist resolved and applicable final-gate evidence
   recorded, set `status: done`, `completed: <real YYYY-MM-DD>`.
6. Derive archive year/month from completed and domain from `domain:`; create
   `.engineos/archived/<YYYY>/<MM>/<domain>/` and move the record there,
   preserving the filename's date. Use `git mv` only with git-write authorization.
7. Clear only this session's
   `<absolute-git-dir>/ENGINEOS_UNRECORDED.${CLAUDE_SESSION_ID:-}` marker.
   Obtain git dir with `git rev-parse --absolute-git-dir`. When the session id is
   unavailable, the legacy fallback clears `ENGINEOS_UNRECORDED*` in that git
   dir; use the scoped marker whenever the environment identifies it.
8. Verify archive path/status, marker removal and the rename in `git status`.

Scope: one record per unit; no unrelated batching, memory distillation or external
tracker/Jira writes. If nothing changed, there is no record to archive: clear the
marker and stop. Approved testing remains separate; pending evidence is recorded
honestly and this skill grants no test execution permission.
