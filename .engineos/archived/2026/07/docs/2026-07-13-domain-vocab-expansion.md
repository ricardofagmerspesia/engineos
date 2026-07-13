---
name: 2026-07-13-domain-vocab-expansion
status: done
completed: 2026-07-13
owner: Ricardo Fagmer
spec: docs/specs/2026-07-13-domain-vocab-expansion-design.md
domain: docs
---

## What
Extend the change-record `domain:` enum with `mobile` and `docs`.

## Why
`mobile-coordinator` (elias) shipped 2026-07-06 with no matching domain slot;
doc-only changes had no home besides `general`.

## Scope
`.engineos/changes/_template.md`, `.engineos/changes/README.md`,
`.engineos/archived/README.md`, `skills/record-change/SKILL.md`.

## Checklist
- [x] Add `mobile`, `docs` to `_template.md` enum
- [x] Mirror in `changes/README.md`
- [x] Mirror in `archived/README.md`
- [x] Mirror in `skills/record-change/SKILL.md` step 1
- [x] Write design spec

## What was made
Enum in the four listed files extended from
`backend|frontend|llm|dba|devops|security|test|general` to
`backend|frontend|mobile|dba|llm|devops|security|test|docs|general`. No code
or routing logic touched — `domain:` is a manually-set front-matter field, not
derived from file path.

## Verification
Docs-only change; verified by re-grepping all four files for the old enum
string (no remaining hits) and reading each edited file back.

## Notes
`dba` kept as-is (not renamed `database`) to stay 1:1 with the `dba-coordinator`
agent name. No archived records use the old enum yet, so no backfill needed.
