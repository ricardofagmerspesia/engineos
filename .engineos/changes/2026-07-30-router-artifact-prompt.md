---
name: 2026-07-30-router-artifact-prompt
status: active
owner: Ricardo Fagmer
spec: n/a — single-file constitution edit, below the >2-file spec threshold
domain: docs
---

## What
Add an "Output artifact" step to the EngineOS router: after every request, offer the user a
choice of follow-up artifact (scaffold, flowchart, reusable template, UI/UX design, or none),
with template and UI/UX design restricted to frontend and mobile intents. Recorded both as a
Router section and as non-negotiable #8.

## Why
The behavior was being supplied ad hoc as a session-level instruction, so it governed one
conversation and died with it. Making it part of the versioned constitution gives every
teammate the same post-request handoff instead of it depending on who remembered to paste it.

## Scope
- `CLAUDE.md` — new `## Output artifact — offer after every request` section, one new bullet
  under "Rules for routing", new non-negotiable #8.

No hook mirror: this is request-driven, not file-pattern-driven, so `hooks/routing-map.sh`
and `hooks/route-before-change.sh` are untouched.

## Checklist
- [x] Router section with the option table and filtering rules
- [x] Cross-reference bullet under "Rules for routing"
- [x] Non-negotiable #8
- [ ] Committed on `feat/router-artifact-prompt` and opened as a PR

## What was made
<filled on completion: past-tense, concrete account of what actually landed>

## Verification
Markdown-only change to the constitution — no typecheck/lint/test surface. Checked that the
new section is referenced from both the routing rules list and the non-negotiables, and that
no existing rule is contradicted (`@rules/*` always-on set unchanged).

## Notes
Template and UI/UX design are deliberately gated to frontend/mobile — offering them on a
migration or a CI change would be a dead option, which the section calls out as a defect.
