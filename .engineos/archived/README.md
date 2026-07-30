# .engineos/archived/

Completed change records, moved here from `.engineos/changes/` once the work is done and
verified. This is the historical trail — treat as read-only; do not edit archived
records except to fix a factual error.

## Layout — grouped by month, then domain

Records are filed under `.engineos/archived/<YYYY>/<MM>/<domain>/<record>.md`
(year → month → domain), using the record's `completed` date and its
`domain:` front matter (`backend`, `frontend`, `mobile`, `dba`, `llm`, `devops`,
`security`, `test`, `docs`, or `general` for anything that doesn't fit a single
domain). No day
folder — the exact date still lives in the filename's `<YYYY-MM-DD>-<slug>`
prefix. Example:

```
.engineos/archived/
  README.md
  2026/
    06/
      backend/  2026-06-17-review-findings-fixes.md
      general/  2026-06-19-start-guide.md
```

Records archived before 2026-07-02 predate the domain segment and stay flat
under `<YYYY>/<MM>/<DD>/` — not migrated.

The `record-change` skill creates the month/domain path on archive. This README
stays at the `.engineos/archived/` root.

A file lands here unchanged from `.engineos/changes/` except:

```markdown
---
status: done
completed: <YYYY-MM-DD>
---
```

## Why keep these alongside git history

Git already has the diffs, but a change record captures the *why* and the
*verification* in one place, indexed by date and slug — faster to scan than
reconstructing intent from commits. Durable takeaways belong in `.engineos/memory/`; this
folder is the full narrative archive.
