---
name: record-change
description: Use after completing a unit of work (any code change) to finalize its change record — mark it done, describe what was made, register all files changed and movements, and move the record from .engineos/changes/ to .engineos/archived/. Clears the EngineOS unrecorded-changes flag that the Stop gate enforces. Invoke when work is complete, when "record the change" / "log this change" is requested, or when the Stop gate reports unrecorded changes.
---

# Record a change

Finalize the change-tracking record for work that is now complete. This is the
closing half of the EngineOS change lifecycle (`.engineos/changes/` → `.engineos/archived/`) and it
clears the `ENGINEOS_UNRECORDED` flag the Stop gate checks.

## Steps

Create a TodoWrite item per step and do them in order.

1. **Locate the active record.** Find the `.engineos/changes/*.md` whose front matter has
   `status: active`. If more than one, pick the one matching the work just done.
   If none exists, create one from `.engineos/changes/_template.md`, named
   `<YYYY-MM-DD>-<short-kebab-slug>.md`, and fill What / Why / Scope from the work.
   Confirm `domain:` is set to one of `backend`, `frontend`, `llm`, `dba`, `devops`,
   `security`, `test`, or `general` (no single domain fits) — required to build the
   archive path in step 6.

2. **Confirm the spec exists.** Read the record's `spec:` front-matter field and
   verify that file exists under `docs/specs/`. If it is missing or the field is
   empty, the change is not ready to archive — write the spec first (brainstorm →
   `docs/specs/<YYYY-MM-DD>-<slug>-design.md`), set `spec:`, then continue.

3. **Describe what was made.** Fill `## What was made` with a concrete, past-tense
   account of what actually landed (not intentions), and resolve `## Checklist` —
   every item ticked `- [x]`, or struck through with a one-line reason if dropped.
   A record with unticked, unexplained checklist items is not done.

4. **Register changes and movements.** Capture the real diff into the record under
   a `## Changes registered` section:
   ```bash
   git status --short
   git diff --stat HEAD
   ```
   List the touched files and any `git mv` / renames. If the work spanned commits,
   add `git log --oneline <base>..HEAD`. Paste the actual output, not a paraphrase.

5. **Mark done.** Only after `## What was made` is written and `## Checklist` is fully resolved:
   set front matter `status: done` and add `completed: <YYYY-MM-DD>`
   (use the real current date).

6. **Archive it under a month+domain tree.** Archived records are grouped
   `.engineos/archived/<YYYY>/<MM>/<domain>/` — no day folder; the exact date
   still lives in the filename prefix. Derive year/month from the record's
   `completed` field and the domain from its `domain:` field, create the path,
   and move it:
   ```bash
   D=2026-06-19   # the record's completed date, YYYY-MM-DD
   DOM=backend    # the record's domain: field
   mkdir -p ".engineos/archived/${D:0:4}/${D:5:2}/${DOM}"
   git mv ".engineos/changes/<file>.md" ".engineos/archived/${D:0:4}/${D:5:2}/${DOM}/<file>.md"
   ```

7. **Clear the flag.** Tell the Stop gate the work is recorded (clears the
   session-scoped marker(s); the glob also clears any legacy unsuffixed flag):
   ```bash
   rm -f "$(git rev-parse --absolute-git-dir)"/ENGINEOS_UNRECORDED*
   ```

8. **Verify.** Confirm the record is in `.engineos/archived/<YYYY>/<MM>/<domain>/` with
   `status: done`, the flag file is gone, and `git status` reflects the rename.

## Scope

- Records flow `.engineos/changes/` → `.engineos/archived/` only. Do NOT distil into `memory/` here
  and do NOT touch external trackers (Jira) — out of scope for this skill.
- One record per unit of work. Don't batch unrelated changes into one record.
- If nothing was actually changed (no code touched), there is nothing to record —
  remove the flag (step 7) and stop.
