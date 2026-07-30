---
name: 2026-07-13-elias-web-to-mobile-mirror
status: done
owner: Ricardo Fagmer
spec: docs/specs/2026-07-13-elias-web-to-mobile-mirror-design.md
domain: general
completed: 2026-07-13
---

## What
Repurpose the `mobile-coordinator` agent (alias `elias`) from a general React
Native specialist into a web->mobile feature-mirror agent: its job is to take
features that already exist in the web frontend and reproduce them faithfully in
the mobile app, adapting web patterns to mobile idioms.

## Why
User wants elias to be the agent that mirrors all features created in web onto
the mobile app. The prior mobile-coordinator was a generic mobile specialist with
web frontend fully out of scope; a mirror agent instead reads the web frontend as
its source of truth (read-only reference) and writes only in the mobile tree.

## Scope
`agents/mobile-coordinator.md`, `commands/agents/mobile-coordinator.md`,
`commands/agents/elias.md`, `CLAUDE.md` (router mobile row),
`docs/specs/2026-07-13-elias-web-to-mobile-mirror-design.md`.

## Checklist
- [x] Write design spec
- [x] Rewrite `mobile-coordinator` agent def as web->mobile mirror (read web, write mobile)
- [x] Update alias dispatch commands (`mobile-coordinator`, `elias`)
- [x] Update router mobile row in CLAUDE.md
- [x] Record and archive the change

## What was made
Rewrote `agents/mobile-coordinator.md` (kept name + alias `elias`) into a
web->mobile feature-mirror agent. Its mission is now: take a feature that already
exists in the web frontend and reproduce it faithfully in the mobile app. The
scope fence was restructured into three tiers — (1) READ-ONLY reference: the web
frontend tree + existing API contracts (the source of truth to mirror, never
written); (2) IN SCOPE to write: the React Native app tree only; (3) OUT OF
SCOPE: web frontend writes -> frontend-coordinator, API/backend ->
backend-coordinator, infra -> devops-coordinator, with a `### Blocked` stop when
a mirror needs a missing/changed API. Dual-mode was reframed: AUDIT = parity
report (what's missing/drifted on mobile), IMPLEMENT = build the mobile mirror. A
mirroring `## Method` (locate web feature -> map web->mobile -> find gaps ->
audit/implement), a `## Fidelity checklist` (preserve business rules, validation,
states, data shape, a11y; add safe-area/offline/virtualization), and a `### Parity`
block in the output format were added.

Updated both dispatch commands (`commands/agents/elias.md`,
`commands/agents/mobile-coordinator.md`) to describe the mirror mission and prompt
for "which web feature to mirror / audit parity"; dropped a stray trailing
`</content>` line each. Updated the CLAUDE.md router mobile row with mirror
signals ("mirror to mobile", "port to mobile", "same feature on mobile", "mobile
parity") and the read-web/write-mobile framing. Added the design spec.

## Changes registered
```
 M CLAUDE.md
 M agents/mobile-coordinator.md
 M commands/agents/elias.md
 M commands/agents/mobile-coordinator.md
?? .engineos/changes/2026-07-13-elias-web-to-mobile-mirror.md
?? docs/specs/2026-07-13-elias-web-to-mobile-mirror-design.md

 CLAUDE.md                             |  2 +-
 agents/mobile-coordinator.md          | 96 +++++++++++++++++++++---------------
 commands/agents/elias.md              | 16 +++---
 commands/agents/mobile-coordinator.md | 16 +++---
 4 files changed, 79 insertions(+), 51 deletions(-)
```
No renames. New files: this record + the design spec.

## Verification
Markdown/config repo — no typecheck/lint/build target. Consistency verified:
`gen-agent-commands.sh` still reads `name: mobile-coordinator` + `Alias: elias`
from the agent def, so regeneration stays correctly wired; all four surfaces carry
the web->mobile mirror framing; CLAUDE.md mobile row is a well-formed 2-column
table row (3 pipes); no stale "scoped strictly to the React Native" framing
remains anywhere.

## Notes
Alias `elias` kept; agent name `mobile-coordinator` kept (rename would ripple
across commands + router with no benefit). Web frontend moves from out-of-scope
to read-only reference; backend/API and web writes stay out of scope.
</content>
</invoke>
