---
name: 2026-10-10-routing-replacement-plan
status: active
branch: feat/routing-replacement
owner: Ricardo Fagmer
spec: docs/specs/2026-10-10-routing-replacement-plan.md
domain: docs
---

## What
A proposed plan to replace prompt routing with a three-tier scored router, cut
per-hook spawn cost, and move small policy tables and state machines to data.

## Why
Phrase any-matching misrouted three requests in one session, and every Bash and
Edit call pays 60 to 95 ms of Node spawn. The developer asked whether Julia,
"jev" or another decision framework would make EngineOS faster and smarter.

## Scope
docs/specs/2026-10-10-routing-replacement-plan.md (new),
docs/specs/2026-10-10-jev-shadow-request.json (new). No code, registry or
hook change.

## Checklist
- [x] Map current routing, decision rules, path routing and hook runtime
- [x] Inventory non-routing decision logic (read-only Explore audit)
- [x] Evaluate Julia, GoRules Zen (JDM), JEXL/CEL, json-rules-engine, OPA, XState, embeddings, LLM classification, in-process hooks
- [x] Write the plan with phases, exit criteria and compatibility notes
- [x] Revise the plan with TypeSafe Jev as the semantic judge (section 4a, phases P1b and P1c)
- [x] Draft the Jev shadow-mode request file (docs/specs/2026-10-10-jev-shadow-request.json) with the shadow acceptance cases in plan section 4a
- [x] Developer approves a direction
- [x] Prototype preview approved (revision 71ce35fb93a0)
- [ ] Developer approves sending prompt text to TypeSafe for the first shadow run (external effect and spend)
- [ ] ADR recording the chosen direction, the intent-routing parity retirement and the Mastra non-applicability for the Jev judge
- [ ] Security review and recorded human decision before Jev leaves individual opt-in (rule-sensitive-data)

## What was made
Wrote the plan document, then revised it to adopt TypeSafe Jev as an opt-in semantic judge with a deterministic fallback. Added a ready-to-review Jev request body (49 questions generated from registries/intents.json and decision-rules.json) and its acceptance cases. The TypeSafe API was not called. Nothing in src/, registries/ or hooks/ changed.

## Verification
Document only. No executable checks apply. Evidence cited by path and line in the plan.

## Human decisions
- 2026-10-10, Ricardo Fagmer: chose the routing-replacement plan for /implement-spec and approved the direction (all phases P0-P5). Branch feat/routing-replacement from 0b2e442; uncommitted changes on main left untouched by the developer's choice.
- 2026-10-10, Ricardo Fagmer, scope "routing replacement P0-P5": preview requested (LOGIC branch).
- 2026-10-10, Ricardo Fagmer: preview-approved. Scope: routing replacement P0-P5. Artifact: scratchpad proto/routing-combination.PROTOTYPE.html (local pointer, not captured to a branch), revision sha256 71ce35fb93a0. Reason ids: high-risk (third-party data egress in P1b).
- Pending: consent before any request is sent to TypeSafe (external-effect); final-stage validation approval; security review before Jev leaves individual opt-in.

## Changes registered
?? docs/specs/2026-10-10-routing-replacement-plan.md
?? .engineos/changes/2026-10-10-routing-replacement-plan.md
?? docs/specs/2026-10-10-jev-shadow-request.json

## Notes
The UserPromptSubmit advisor classified a background-task notification as a
prompt and demanded a router dispatch. Recorded as misroute three in the plan.
