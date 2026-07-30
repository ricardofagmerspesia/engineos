---
name: 2026-07-02-drop-archive-day-folder
status: done
completed: 2026-07-02
owner: Ricardo Fagmer
spec: docs/specs/2026-07-02-archive-domain-folder-design.md
domain: general
---

## What
Drop the day folder from the archived-change path: `.engineos/archived/<YYYY>/<MM>/<domain>/<slug>.md`
(was `<YYYY>/<MM>/<DD>/<domain>/<slug>.md`, added earlier the same day).

## Why
Day-per-folder was too deep for how few records land per day — hard to browse,
buried the domain grouping one level further. Date isn't lost: the filename
already carries the full `<YYYY-MM-DD>-<slug>` prefix.

## Scope
- `docs/specs/2026-07-02-archive-domain-folder-design.md` (amended in place)
- `docs/specs/2026-06-19-project-layout-standard-design.md` (mirror row)
- `.engineos/changes/README.md`
- `.engineos/archived/README.md`
- `skills/record-change/SKILL.md`

## Checklist
- [x] Amend spec: decision, example tree, non-goals
- [x] Update `.engineos/archived/README.md` layout section + example
- [x] Update `.engineos/changes/README.md` lifecycle line
- [x] Update `record-change` skill step 6 (`mkdir -p` / `git mv`) and step 8
- [x] Mirror path change in 2026-06-19 layout design doc
- [x] Relocate this session's own archived record into the new path

## What was made
Removed the `<DD>` segment from the archive path everywhere it was documented
(spec, both READMEs, skill steps 6 and 8, layout-standard-design mirror row).
Moved the domain-folder change's own archived record from
`2026/07/02/general/` to `2026/07/general/` to match. `.engineos/changes/_template.md`
needed no change — it never referenced the day folder directly.

## Verification
Docs/skill-instruction change only. Verified by re-reading each edited file and
confirming the `mkdir -p`/`git mv` example in `skills/record-change/SKILL.md`
step 6 matches the tree shown in `.engineos/archived/README.md`.

## Notes
Records archived before 2026-07-02 (day-only, no domain) and the single record
archived earlier today at `<DD>/<domain>/` stay/moved as noted — no broader
migration.
