# elias — web->mobile feature mirror — design

## Problem

`mobile-coordinator` (alias `elias`) was a generic React Native specialist with
the web frontend fully out of scope. The user wants elias to do one specific
thing well: mirror features that already exist in the web app onto the mobile
app. A generic mobile agent that treats the web tree as forbidden can't read the
source it is supposed to reproduce.

## Decision

Repurpose `mobile-coordinator` (keep the name and the `elias` alias) into a
web->mobile feature-mirror agent:

- **Reads the web frontend as its source of truth** (read-only reference) — the
  feature to mirror, its state, data fetching, validation, flows, and edge/empty/
  error states.
- **Writes only in the mobile app tree** — screens, navigation, mobile state,
  data fetching from existing APIs, native glue, storage, config, mobile tests.
- **Never writes** to the web frontend, API/backend, or DevOps/infra. If
  mirroring needs an endpoint that does not exist, it states the contract and
  stops (`### Blocked`).

Dual-mode is kept but reframed:
- **AUDIT** = parity report — which web features exist / are missing / have
  drifted on mobile, with the gap for each.
- **IMPLEMENT** = build the mobile mirror of the target web feature, preserving
  behavior and adapting patterns to mobile idioms.

Rules unchanged: `rules/architecture.md` + `rules/testing.md` always, plus the
component/state/data-fetching principles of `rules/frontend.md` and the
API-consumption/error-handling principles of `rules/backend.md`, adapted to
mobile (React Navigation, no server/client split, platform-aware styling,
offline/network handling); `react-patterns` skill where it transfers.

## Scope

- Changed: `agents/mobile-coordinator.md` (mission, scope fence, method, output),
  `commands/agents/mobile-coordinator.md`, `commands/agents/elias.md`,
  `CLAUDE.md` (router mobile row).
- Not changed: agent name (`mobile-coordinator`) and alias (`elias`) — renaming
  would ripple across command files, router, and the recent commit history with
  no benefit. `hooks/routing-map.sh` untouched (mobile intent is request-driven,
  not file-pattern routed).

## Alternatives considered

- New separate mirror agent with its own alias, keeping mobile-coordinator
  generic — rejected by the user: they want elias itself to be the mirror agent.
- Rename the agent to `mobile-mirror` — rejected: churn across commands/router
  for a cosmetic gain; `mobile-coordinator` still describes the role.

## Fidelity contract (what a mirror must preserve)

Same business rules and validation, same states (loading/empty/error/success),
same data shape consumed from the API, equivalent accessibility. Mobile-specific
additions: safe-area/keyboard handling, offline/error handling on network calls,
list virtualization for large sets, no secrets in the bundle, native modules only
when there is no JS alternative.
</content>
</invoke>
