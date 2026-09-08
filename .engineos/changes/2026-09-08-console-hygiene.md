---
name: 2026-09-08-console-hygiene
status: in-progress
owner: Ricardo Fagmer
spec: docs/specs/2026-09-08-console-hygiene.md
domain: frontend
---

## What
Console hygiene from the audit: pure GET, seed-on-write, write-path containment,
kernel argument caps, YAML-safe frontmatter quoting, true config invariant, English
comments; UI accessibility floor (valid table semantics, focus trap, tabs focus
follow, generated ids), derived drawer state, dead code and stale copy removed,
focus-ring token.

## Why
Audit console report MEDIUM/LOW findings plus two LOWs deferred from U5
(`GET /api/skills` store write, `needsQuoting`).

## Scope
See spec Unit S and Unit U file lists.

## Checklist
- [ ] GET /api/skills pure; PUT seeds on first write
- [ ] resolveInside on writeSkills + publish compare
- [ ] kernel argument guard + effective route 400
- [ ] needsQuoting covers ': ', ' #', leading '#' and '- '
- [ ] cwd read only in config.ts; English comments
- [ ] tr has no role=button; drawer focus trap; tabs focus follows; useId
- [ ] drawer derives, key remount; stale copy, TODOs, dead badge gone; landing page
- [ ] focus-ring token replaces inline copies
- [ ] console gate green; root validate green

## What was made
(pending)

## Verification
(pending)

## Human decisions
2026-09-08, Ricardo Fagmer: chose "U11 console hygiene" as the next unit. Risk
medium, autonomy A2, no HITL reason fires. Decision recorded: unreferenced read-only
handlers `api/agents`, `api/models`, `api/effective` are kept (file reads, no side
effect; `effective` gets caps).

## Changes registered
(pending)
