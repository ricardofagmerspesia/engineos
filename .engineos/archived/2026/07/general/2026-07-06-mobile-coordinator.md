---
name: 2026-07-06-mobile-coordinator
status: done
owner: Ricardo Fagmer
spec: docs/specs/2026-07-06-mobile-coordinator-design.md
domain: general
completed: 2026-07-06
---

## What
Add a new EngineOS domain agent, `mobile-coordinator` (alias `elias`), for React
Native mobile app work, and route mobile intent to it in the CLAUDE.md router.

## Why
No agent existed for mobile. Frontend-coordinator is web-scoped (Next.js/App
Router) and doesn't fit RN. User wants a dedicated mobile specialist that never
touches API/backend, web frontend, or DevOps — only the mobile app, following
FE+BE conventions adapted mobile-way.

## Scope
`agents/mobile-coordinator.md`, `commands/agents/mobile-coordinator.md`,
`commands/agents/elias.md`, `CLAUDE.md` (router table row),
`docs/specs/2026-07-06-mobile-coordinator-design.md`.

## Checklist
- [x] Write design spec
- [x] Create `mobile-coordinator` agent definition with scope fence
- [x] Create alias dispatch commands (`mobile-coordinator`, `elias`)
- [x] Add router table row in CLAUDE.md
- [x] Record and archive the change

## What was made
Created `agents/mobile-coordinator.md`: a dual-mode (AUDIT/IMPLEMENT) domain
coordinator for React Native work, following `rules/architecture.md` +
`rules/testing.md` plus the transferable parts of `rules/frontend.md` (component/
state/data-fetching) and `rules/backend.md` (API-consumption), adapted to mobile
(React Navigation, no server/client split, platform-aware styling, offline
handling). It has a hard scope fence: it must never implement APIs/backend, web
frontend, or DevOps/infra — if a task needs one of those, it reports a
`### Blocked` section naming the owning coordinator instead. Added two
alias-dispatch slash commands (`commands/agents/mobile-coordinator.md` and
`commands/agents/elias.md`) mirroring the existing `arturo`/`frontend-coordinator`
pattern. Added a router table row in `CLAUDE.md` so mobile-signal requests load
the right rules/agent. Left `hooks/routing-map.sh` untouched — RN and web share
`.tsx`, and file-pattern auto-routing would need repo-layout context to
disambiguate; deferred until a real mixed-repo case appears.

## Verification
No runtime code changed (agent/command/doc definitions only). Verified by
reading the new files back and confirming the pattern matches the existing
`frontend-coordinator`/`arturo` pair exactly (frontmatter shape, tools list,
output format, alias wiring).

## Changes registered
```
 M CLAUDE.md
?? .engineos/changes/2026-07-06-mobile-coordinator.md
?? agents/mobile-coordinator.md
?? commands/agents/elias.md
?? commands/agents/mobile-coordinator.md
?? docs/specs/2026-07-06-mobile-coordinator-design.md
```

## Notes
None.
</content>
