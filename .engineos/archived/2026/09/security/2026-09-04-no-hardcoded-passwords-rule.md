---
name: 2026-09-04-no-hardcoded-passwords-rule
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: n/a — single-file rule edit, below the >2-file spec threshold
domain: security
---

## What
Add an explicit rule to `rules/security.md` forbidding hardcoded passwords or any
credential anywhere a production deploy can reach, with a matching pre-merge
checklist item.

## Why
The existing Secrets section forbade "keys in code" but did not name the common
production leak shapes: literal password fallbacks (`process.env.X ?? 'admin'`),
default admin accounts, seed users with fixed passwords, and "temporary" values
behind an environment guard. Requested by the user on 2026-09-04.

## Scope
- `rules/security.md` — Secrets section (two new bullets), pre-merge checklist (one new item)

## Checklist
- [x] Add DON'T bullet naming the production hardcoded-password shapes
- [x] Add the local-only-defaults exception with its bounds
- [x] Add the pre-merge checklist item

## What was made
Added two bullets to the Secrets section of `rules/security.md`: a DON'T that
forbids hardcoded passwords or credentials reachable by a production deploy and
lists the concrete shapes (literal passwords, env fallbacks, default admin
accounts, fixed-password seed users, env-guarded "temporary" values), stating
that production reads from the environment or crashes at startup; and the single
exception for local-only defaults (dev docker-compose, test fixtures), bounded to
non-production scope, no real system, and absence from every production image,
chart, and env file. Added a pre-merge checklist item for the same check.

## Verification
Manual review of the diff. No lint/typecheck applies to a Markdown rule edit.
`scripts/validate-engineos.sh` not run (per user verification rule: run only when
asked) — reported as unverified.

## Human decisions
None fired. Risk low (reversible docs edit, no data, private rule surface), autonomy A2.

## Changes registered
```
$ git status --short
 M rules/security.md

$ git diff --stat HEAD
 rules/security.md | 10 ++++++++++
 1 file changed, 10 insertions(+)
```
Plus this record, created directly in the archive tree.

## Notes
Branch `docs/no-hardcoded-passwords` cut from `origin/main` at `f3d5594`.
