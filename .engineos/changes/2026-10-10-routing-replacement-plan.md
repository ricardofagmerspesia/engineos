---
name: 2026-10-10-routing-replacement-plan
status: active
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
- [ ] Developer approves a direction
- [ ] Developer approves sending prompt text to TypeSafe for the first shadow run (external effect and spend)
- [ ] ADR recording the chosen direction, the intent-routing parity retirement and the Mastra non-applicability for the Jev judge
- [ ] Security review and recorded human decision before Jev leaves individual opt-in (rule-sensitive-data)

## What was made
Wrote the plan document, then revised it to adopt TypeSafe Jev as an opt-in semantic judge with a deterministic fallback. Added a ready-to-review Jev request body (49 questions generated from registries/intents.json and decision-rules.json) and its acceptance cases. The TypeSafe API was not called. Nothing in src/, registries/ or hooks/ changed.

## Verification
Document only. No executable checks apply. Evidence cited by path and line in the plan.

## Human decisions
none (A1 plan; no hitl.required fired for the plan itself)

## Changes registered
?? docs/specs/2026-10-10-routing-replacement-plan.md
?? .engineos/changes/2026-10-10-routing-replacement-plan.md
?? docs/specs/2026-10-10-jev-shadow-request.json

## Notes
The UserPromptSubmit advisor classified a background-task notification as a
prompt and demanded a router dispatch. Recorded as misroute three in the plan.
