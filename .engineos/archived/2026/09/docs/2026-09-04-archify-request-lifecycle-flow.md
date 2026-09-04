---
name: 2026-09-04-archify-request-lifecycle-flow
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: n/a — two-file docs artifact, below the >2-file spec threshold and no new behavior
domain: docs
---

## What
An Archify workflow diagram of the EngineOS request lifecycle: a typed JSON specification and the rendered self-contained HTML it produces, both under `docs/architecture/`.

## Why
The user asked for a complete flow based on `docs/BIG-PICTURE.html`. Its "Request lifecycle" section is prose plus a hand-drawn strip; this diagram gives one page that traces a typed request through the hooks, the kernel decisions, the agent wave, the final gate and the change record, with the exits (bypass, human decision, BLOCKED, report red) drawn as first-class terminals.

## Scope
`docs/architecture/engineos-request-lifecycle.workflow.json`, `docs/architecture/engineos-request-lifecycle.html`.

## Checklist
- [x] Author the workflow IR (4 lanes, 5 phases, 2 groups, 17 nodes, 17 edges, 3 cards) from BIG-PICTURE's lifecycle, hooks, kernel and fan-out sections
- [x] Pass `archify validate workflow --quality showcase` with 0 diagnostics
- [x] Deliver the HTML and pass `archify visual-check` on every viewport
- [x] Review the rendered PNG for overlaps and truthfulness

## What was made
- Added `docs/architecture/engineos-request-lifecycle.workflow.json` (schema v2): lanes for the Claude Code hooks, the agents, the orchestrator main loop and an exception lane for exits; phases Intake / Classify / Execute / Verify / Close; groups "Per Edit | Write" (route-before-change -> mark-unrecorded) and "One wave, disjoint file scopes" (specialists -> barrier); main path request -> prompt-advisor -> task contract -> [router] line -> dispatch -> specialists -> barrier -> FINAL GATE -> record-change -> Stop hooks; branches for bypass, spec + plan, the hitl exit, the admit-reject exit and the report-red exit; semantic checks pin the single root, the six allowed terminals and two required paths.
- Added `docs/architecture/engineos-request-lifecycle.html`: the Archify showcase render, self-contained, trace animation, signal-flow preset, legend relabelled (Hooks / Orchestrator / Agents / Human gate / User-exits).
- Layout rulings reached during validation: a first 7-lane draft overflowed the 1440x900 viewport (scrollHeight 1601), so kernel calls were folded into node sublabels the way BIG-PICTURE's own lifecycle strip does and the diagram compressed to 4 lanes; lanes are ordered so every vertical edge spans adjacent lanes; nodes are 124px wide because default 92px boxes could not hold the hook names; the label on the dispatch -> specialists edge was dropped because a short vertical edge under a group title made routing infeasible; cards and subtitle were shortened to remove the last 91px of vertical overflow.

## Verification
- `archify validate workflow ... --quality showcase`: ok, 0 diagnostics.
- `archify deliver`: 9/9 artifact checks passed, composition profile showcase status pass, 0 errors, 0 warnings; artifact SHA-256 `a13b1b31b7d678ae33f8018da792dc202d0bb1a99a55c765711ad0aa039827f9` (734787 bytes).
- `archify visual-check`: automated browser evidence pass at 1440x900, 1600x1000, 1920x1080 and 2048x1320, light and dark; no overflow, minimum projected node text 6.99px at 1440 (required 6px).
- Rendered PNG inspected once for overlaps and label truthfulness; no perceptual review beyond that was performed. Visual-check side files were not committed.
- No lint/typecheck applies (docs only).

## Human decisions
None fired. Risk low: additive documentation, trivially reverted, no consumer.

## Changes registered
```
?? docs/architecture/engineos-request-lifecycle.html
?? docs/architecture/engineos-request-lifecycle.workflow.json
```
Both files new; no renames.

## Notes
- Companion to `2026-09-04-archify-architecture-diagram` (structure view); this one is the behaviour view. Regenerate with `archify deliver workflow docs/architecture/engineos-request-lifecycle.workflow.json docs/architecture/engineos-request-lifecycle.html --quality showcase`.
- Archify workflow constraints worth remembering: vertical edges cannot pass over nodes in intermediate lanes; the rendered page must fit the viewport height, so lane count and card length are the two knobs.
