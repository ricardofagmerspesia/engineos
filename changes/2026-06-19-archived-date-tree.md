---
name: 2026-06-19-archived-date-tree
status: done
completed: 2026-06-19
owner: Ricardo Fagmer
---

## What
Changed the archived-records convention to group by date:
`archived/<YYYY>/<MM>/<DD>/<record>.md`. Updated the record-change skill, the
archived/ and changes/ READMEs, README/START/ADOPTION/spec move-path references,
and migrated the 9 existing records into the tree.

## Why
Flat archived/ would sprawl over time; year→month→day keeps it browsable.

## Scope
- skills/record-change/SKILL.md (step 5 computes YYYY/MM/DD), archived/README.md
  (layout), changes/README.md, README.md, START.md, docs/ADOPTION.md, governance spec.
- Migrated archived/*.md -> archived/YYYY/MM/DD/ (git mv, history preserved).
- Removed a stray untracked archived/CHANGELOG.md (duplicate of root).
- Hooks unchanged: the `*/archived/*` exclusion glob still matches nested paths.

## Verification
- find archived shows the date tree; secrets gate clean (tracked); routing 12/12,
  governance 6/6.

## Notes
See [[2026-06-19-leo-curso-extract]].
