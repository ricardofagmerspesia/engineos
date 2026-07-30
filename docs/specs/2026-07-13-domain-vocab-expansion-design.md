# Change-record domain vocab: add mobile, docs

**Date:** 2026-07-13
**Status:** Approved (design)
**Author:** Ricardo Fagmer

## Problem

The `domain:` enum on change records (`backend|frontend|llm|dba|devops|security|test|general`)
predates the `mobile-coordinator` agent (elias), added 2026-07-06. Mobile work has
no domain to file under, and doc-only changes (README/rules/spec edits with no
code surface) get dumped into `general` alongside everything else that doesn't fit.

## Decision

Extend the enum to `backend|frontend|mobile|dba|llm|devops|security|test|docs|general`.

- `mobile` — mirrors the existing `mobile-coordinator` agent, closing the gap.
- `docs` — for documentation-only changes (this one included), so `general` stays
  reserved for genuinely cross-cutting/ungrouped work.
- `dba` already covers the database domain; not renamed to `database` to keep the
  1:1 match with the `dba-coordinator` agent name.
- No new domains beyond these two — every other coordinator (backend, frontend,
  llm, dba, devops, security, test) already has a matching domain slot.

## Files touched

- `.engineos/changes/_template.md` — `domain:` enum.
- `.engineos/changes/README.md` — mirrored enum in the inline example.
- `.engineos/archived/README.md` — mirrored enum in the layout description.
- `skills/record-change/SKILL.md` — step 1 enum confirmation.

## Non-goals

- No migration of existing archived records (none use `dba`/`mobile`/`docs` yet).
- No change to `hooks/routing-map.sh` or the CLAUDE.md router table — those route
  by file pattern / stack, not by the change-record `domain:` field.
