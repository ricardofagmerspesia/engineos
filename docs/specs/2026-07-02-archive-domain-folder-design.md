# Archive tree: add domain folder, drop day folder

**Date:** 2026-07-02
**Status:** Approved (design), amended same day (day folder dropped)
**Author:** Ricardo Fagmer

## Problem

`.engineos/archived/<YYYY>/<MM>/<DD>/<slug>.md` groups records by date only. On a
day with several unrelated changes (e.g. an api fix and a frontend tweak), the
date folder mixes domains with no way to scan "what changed in the api lately"
without opening every file. A day-per-folder tree is also deep for how few
records land on any given day — hard to browse, not much payoff.

## Decision (locked with user)

Drop the day folder; add a domain folder instead:

```
.engineos/archived/<YYYY>/<MM>/<domain>/<slug>.md
```

- **Day folder removed.** The exact date isn't lost — the filename still
  carries the full `<YYYY-MM-DD>-<slug>` prefix — it's just not a folder level.
  Month is kept as the coarse time bucket.
- **Domain vocabulary:** the same fixed set `hooks/routing-map.sh` already
  routes by — `backend`, `frontend`, `llm`, `dba`, `devops`, `security`, `test`
  — plus `general` for changes that don't fit one domain (tooling, docs,
  cross-cutting governance changes like this one).
- **Granularity:** filename only. No extra feature-name folder — the slug in
  the filename already carries the feature name (e.g.
  `2026-07-02-user-role-modification.md`).

Example:

```
.engineos/archived/
  2026/
    07/
      backend/  2026-07-02-user-role-modification.md
      devops/   2026-07-02-ci-cache-fix.md
```

## Change-record requirement

The change record gets a `domain:` front-matter field, set when the record is
created (same place `spec:` is set). `record-change` reads it to build the
archive path; a record with no `domain:` cannot be archived — set `general` if
none of the specific domains fit.

## Files touched

- `.engineos/changes/_template.md` — add `domain:` field.
- `.engineos/changes/README.md` — mirror the field in the inline example.
- `.engineos/archived/README.md` — document the domain segment in the layout tree.
- `skills/record-change/SKILL.md` — step 1 requires `domain:` be set; step 6
  builds the domain segment into the archive path.

## Non-goals

- No migration of existing archived records into domain folders — additive
  going forward only.
- No change to `hooks/layout-manifest.sh` — it only seeds the `archived/`
  README, it doesn't build the date/domain tree (that's manual, in the skill).
