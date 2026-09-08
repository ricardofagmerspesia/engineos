---
name: 2026-09-08-codebase-map-and-hardening-checklist
status: done
completed: 2026-09-08
owner: Ricardo Fagmer
spec: n/a — documentation and a prose checklist, no new behavior
domain: docs
---

## What
Generated `docs/CODEBASE_MAP.md` with the Cartographer plugin (six parallel Sonnet
mappers over the full tree), added a `## Codebase Overview` pointer section to
`CLAUDE.md` and `AGENTS.md`, and added a nineteen-item `## Hardening checklist` to
`agents/security-reviewer.md`.

## Why
The repo had no single navigational map; onboarding relied on `docs/BIG-PICTURE.md`
plus reading source. The owner also asked for the security reviewer to walk an explicit
hardening list (secrets, RLS, encryption, cookies, hashing, rate limits, uploads,
headers, HTTPS, dependency scanning) rather than only the OWASP categories.

## Scope
docs/CODEBASE_MAP.md (new)
CLAUDE.md, AGENTS.md (appended section)
agents/security-reviewer.md (new section before `## Output format`; frontmatter untouched)

## Checklist
- [x] Scan tree with the Cartographer scanner (862 files, 1.54M tokens)
- [x] Six disjoint-scope Sonnet mappers: checks, hooks, kernel/registries, tooling ring, prose layer, docs/console/state
- [x] Synthesize into docs/CODEBASE_MAP.md
- [x] Point CLAUDE.md and AGENTS.md at the map
- [x] Add hardening checklist to security-reviewer

## What was made
Wrote the map: system overview diagram, directory tree, module guide (prose layer,
registries, kernel, hooks, journal, checks, tooling, console, state), four data-flow
diagrams, conventions, gotchas found by the mappers, navigation guide. Appended the
same short overview to both constitution files. Inserted the hardening checklist in
English, framed as the reviewer's pass order and deferring policy to `rules/security.md`.

## Verification
Run 2026-09-08 after the owner approved:
- `scripts/validate-engineos.sh` -- passed 104, failed 0
- `npm test` -- 1961 pass, 0 fail (112s)

## Human decisions
none — risk low (reversible prose, no runtime or registry change)

## Changes registered
```
 M AGENTS.md
 M CLAUDE.md
 M agents/security-reviewer.md
?? docs/CODEBASE_MAP.md
```

## Notes
Mapper findings worth a follow-up, recorded in the map's Gotchas: `/analisy-architecture`
typo in both constitutions, duplicate 1.6.0 release notes, stale `docs/PRD.md`, empty
`.engineos/memory/`, `console/` unwired from CI. Re-run `/cartographer` to update the map.
