---
name: 2026-07-02-archive-domain-folder
status: done
completed: 2026-07-02
owner: Ricardo Fagmer
spec: docs/specs/2026-07-02-archive-domain-folder-design.md
domain: general
---

## What
Add a domain folder to the archived-change path: `.engineos/archived/<YYYY>/<MM>/<DD>/<domain>/<slug>.md`,
so same-day archived records are grouped by domain (backend, frontend, llm, dba,
devops, security, test, general) not just date.

## Why
Date-only grouping mixes unrelated work on busy days — no way to scan "what
changed in the api lately" without opening every file in a day folder.

## Scope
- `docs/specs/2026-07-02-archive-domain-folder-design.md` (new spec)
- `docs/specs/2026-06-19-project-layout-standard-design.md` (mirror row update)
- `.engineos/changes/_template.md`
- `.engineos/changes/README.md`
- `.engineos/archived/README.md`
- `skills/record-change/SKILL.md`

## Checklist
- [x] Write design spec locking path order, domain vocabulary, granularity
- [x] Add `domain:` field to change-record template + README example
- [x] Document domain segment in `.engineos/archived/README.md`
- [x] Update `record-change` skill steps 1 and 6 to require/use `domain:`
- [x] Mirror the path change in the 2026-06-19 layout design doc

## What was made
Added a `domain:` front-matter field to the change-record template and README
example. Updated `.engineos/archived/README.md` to document the
`<YYYY>/<MM>/<DD>/<domain>/` tree (existing pre-2026-07-02 records stay flat,
not migrated). Updated `skills/record-change/SKILL.md` step 1 to require
`domain:` be set before archiving, and step 6 to build the domain segment into
the `mkdir -p` / `git mv` archive path. Added a new design spec
(`docs/specs/2026-07-02-archive-domain-folder-design.md`) recording the
decision, and a one-line mirror update in the 2026-06-19 project-layout spec's
canonical table.

## Verification
Docs/skill-instruction change only, no executable code. Verified by re-reading
each edited file end-to-end and confirming the archive-path example in
`.engineos/archived/README.md` matches the `mkdir -p` command in
`skills/record-change/SKILL.md` step 6.

## Notes
No migration of pre-existing archived records (2026/06/17, 2026/06/19) into
domain folders — additive going forward only, per the spec's non-goals.
