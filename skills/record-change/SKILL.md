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

2. **Describe what was made.** In the record's `## What` (and `## Notes` if
   useful), write a concrete, past-tense summary of the change — not intentions,
   what actually landed.

3. **Register changes and movements.** Capture the real diff into the record under
   a `## Changes registered` section:
   ```bash
   git status --short
   git diff --stat HEAD
   ```
   List the touched files and any `git mv` / renames. If the work spanned commits,
   add `git log --oneline <base>..HEAD`. Paste the actual output, not a paraphrase.

4. **Mark done.** Set front matter `status: done` and add `completed: <YYYY-MM-DD>`
   (use the real current date).

5. **Archive it under a date tree.** Archived records are grouped
   `.engineos/archived/<YYYY>/<MM>/<DD>/`. Derive the date from the record's `completed`
   field (same as the filename prefix), create the path, and move it:
   ```bash
   D=2026-06-19   # the record's completed date, YYYY-MM-DD
   mkdir -p ".engineos/archived/${D:0:4}/${D:5:2}/${D:8:2}"
   git mv ".engineos/changes/<file>.md" ".engineos/archived/${D:0:4}/${D:5:2}/${D:8:2}/<file>.md"
   ```

6. **Clear the flag.** Tell the Stop gate the work is recorded (clears the
   session-scoped marker(s); the glob also clears any legacy unsuffixed flag):
   ```bash
   rm -f "$(git rev-parse --absolute-git-dir)"/ENGINEOS_UNRECORDED*
   ```

7. **Verify.** Confirm the record is in `.engineos/archived/<YYYY>/<MM>/<DD>/` with
   `status: done`, the flag file is gone, and `git status` reflects the rename.

## Scope

- Records flow `.engineos/changes/` → `.engineos/archived/` only. Do NOT distil into `memory/` here
  and do NOT touch external trackers (Jira) — out of scope for this skill.
- One record per unit of work. Don't batch unrelated changes into one record.
- If nothing was actually changed (no code touched), there is nothing to record —
  remove the flag (step 6) and stop.
