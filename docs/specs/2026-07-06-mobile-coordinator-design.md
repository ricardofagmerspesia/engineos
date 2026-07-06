# Mobile coordinator agent — design

## Problem

EngineOS had no domain agent for mobile (React Native) work. Mobile features
fell through to `frontend-coordinator`, which is scoped to web (Next.js/App
Router) and would give wrong-shaped guidance.

## Decision

Add `mobile-coordinator` (alias `elias`) as a new domain coordinator, dual-mode
(AUDIT/IMPLEMENT) like the other coordinators, but with a hard scope fence:
mobile app code only — never API/backend, web frontend, or DevOps/infra. If a
task needs one of those, it reports a `### Blocked` section naming the owning
coordinator instead of doing the work itself.

Rules it follows: `rules/architecture.md` + `rules/testing.md` always, plus the
component/state/data-fetching principles from `rules/frontend.md` and the
API-consumption/error-handling principles from `rules/backend.md`, adapted to
mobile (React Navigation instead of App Router, no server/client component
split, platform-aware styling, offline/network handling).

## Scope

- New: `agents/mobile-coordinator.md`, `commands/agents/mobile-coordinator.md`,
  `commands/agents/elias.md`.
- Changed: `CLAUDE.md` router table — new row for mobile intent.
- Not changed: `hooks/routing-map.sh` (file-pattern auto-routing) — `.tsx`
  already routes to frontend-coordinator and RN projects typically live in a
  separate repo/tree from the web app, so no new pattern was added to avoid
  ambiguity with web frontend routing. Revisit if a mixed monorepo needs it.

## Alternatives considered

- Extend `frontend-coordinator` to cover RN — rejected: user wants a hard
  boundary (mobile agent must never touch API/frontend/devops), which a shared
  agent can't enforce as cleanly as a separate one with its own scope fence.
</content>
