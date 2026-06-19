# archived/

Completed change records, moved here from `changes/` once the work is done and
verified. This is the historical trail — treat as read-only; do not edit archived
records except to fix a factual error.

## Layout — grouped by date

Records are filed under `archived/<YYYY>/<MM>/<DD>/<record>.md` (year → month → day),
using the record's `completed` date. Example:

```
archived/
  README.md
  2026/
    06/
      17/  2026-06-17-review-findings-fixes.md
      19/  2026-06-19-start-guide.md
```

The `record-change` skill creates the dated path on archive. This README stays at
the `archived/` root.

A file lands here unchanged from `changes/` except:

```markdown
---
status: done
completed: <YYYY-MM-DD>
---
```

## Why keep these alongside git history

Git already has the diffs, but a change record captures the *why* and the
*verification* in one place, indexed by date and slug — faster to scan than
reconstructing intent from commits. Durable takeaways belong in `memory/`; this
folder is the full narrative archive.
