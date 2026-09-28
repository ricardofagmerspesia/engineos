---
name: 2026-09-28-python-stack-and-agent-design
status: active
owner: Sergio Hermsdorff
spec: docs/specs/2026-09-28-python-stack-and-agent-design-design.md
domain: llm
---

## What
Make EngineOS run its verification gate, routing and coordinators on Python/FastAPI
packages, and add an interactive, developer-approved design gate for any project
with more than one agent (12-step form, pattern catalog, Mermaid review).

## Why
The Stop gate, path routing and intent signals only know JavaScript; seven of the
developer's eight Python repos get no lint/typecheck/test gate and no routing. The
one multi-agent repo's working mechanisms (tenant profiles, three-layer index
context feeding tools, bounded self-repair, preview-vs-handoff envelopes) exist
nowhere reusable, and nothing makes a new project design its agent topology
before code.

## Scope
See spec §5. Runtime (`src/hooks`, `src/kernel`, `src/init`, `src/checks`),
registries, rules, three new skills, agents, templates, commands, patterns, docs,
one ADR. Branch: `feat/python-stack-and-agent-design`; PR to upstream after the
developer approves the branch.

## Checklist
- [x] Wave 0 — spec written (this record's `spec:`)
- [x] Developer reviews and approves the spec (recorded below)
- [ ] Wave 0 — contracts frozen: `RunnerSelection`, `.engineos/config.json` schema, registry diffs, pattern skeleton
- [ ] Wave 1 — Python runner + stack resolution + registries/mirrors/validator
- [ ] Wave 2 — rules + `python-patterns` + `langgraph-patterns` + agents/templates
- [ ] Wave 3 — `agent-system-design` skill, form, command, catalog, hitl reason + ADR
- [ ] Wave 4 — docs, deprecation header, final gate, manual verification on `labv-assist` and `labv-opensearch-agent-demo`
- [ ] Developer re-runs `install.sh`

## What was made
<filled on completion>

## Verification
Planned (spec §6): `npm run typecheck && npm run lint && npm test`,
`scripts/validate-engineos.sh`, `scripts/run-evals.sh`, manual gate/routing runs
on both labv repos.

## Human decisions
<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
- 2026-09-28 | Sergio Hermsdorff | design | approved | branch-first then PR; ruff/pyright/pytest pinned; Pydantic-validated structured output; pytest import-purity test; keep all 8 new catalog patterns; tools get their own form step; developer approval (not product HITL) gates topology
- 2026-09-28 | Sergio Hermsdorff | design | approved | spec docs/specs/2026-09-28-python-stack-and-agent-design-design.md approved; add hitl reason `topology-approval` (with ADR); enforcement instruction-level for now, blocking hook deferred (spec §7)

## Changes registered
<filled on completion>

## Notes
- Grounding repos: `~/Documents/labv-assist` (ports-and-adapters reference, built under
  EngineOS, audit `.engineos/audits/2026-09-04-all.md`) and
  `~/Documents/labv-opensearch-agent-demo` (LangGraph reference). Both English, Azure
  OpenAI only, pytest + hand-written fakes, no type checker today.
- Vocabulary fixed in the spec: developer (drives Claude) vs user (uses the product).
- Auto mode blocks Claude from running `install.sh` (self-modification of `~/.claude`);
  the developer runs it.
