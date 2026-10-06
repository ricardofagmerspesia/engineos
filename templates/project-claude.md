# <Project Name>

<!-- Seeded as <repo>/CLAUDE.md only when absent. Record project deltas, not team
     rules. JS/TS packages only; retain used rows. Machine stack: .engineos/config.json. -->

## Stack (router hints)
<!-- Backend block — delete if this repo has no application backend -->
- Backend: NestJS (apps/api), running on Node.js — route backend work per EngineOS `rules/backend.md` + `nestjs-patterns`
<!-- Shared rows -->
- Frontend: Next.js (apps/web) — `rules/frontend.md` + `react-patterns`
- Mobile: <yes/no — React Native app lives in ...> — `rules/frontend.md` + `rules/backend.md` (API-consumption parts), `mobile-coordinator` agent
- DBA / data: <Postgres/Oracle/... — schema + migrations live in ...> — `rules/architecture.md` + `rules/data.md`, `dba-coordinator` agent
- DevOps: <CI/CD + infra — pipelines/IaC live in ...> — `rules/architecture.md` + `rules/observability.md`, `devops-coordinator` agent
- LLM/chatbot: <yes/no — Mastra agents, tools, workflows and memory live in ...>, hosted by NestJS providers — `rules/llm-apps.md` + `llm-engineering` + `mastra-patterns`; RAG features keep `evals/<feature>/retrieval/BASELINE.md`

## Commands
<!-- Node block — delete if this repo has no Node package -->
- Typecheck: `npm run typecheck`
- Test: `npm run test` (unit), `npm run test:e2e`
- Lint: `npm run lint`
- Run locally: `npm run dev`

## Project-specific conventions (deltas from EngineOS only)
- <e.g. "We use cursor pagination everywhere, not page/limit">
- <e.g. NestJS: "Database migrations via TypeORM, never auto-sync">
- `.engineos/config.json` declares the stack per package (`dir`, `language`, `framework`) — edit it when a package moves or a stack is added; the Stop gate and the coordinators read it before detection

## Domain glossary
- <term> — <meaning>

## ADRs
Decisions live in `docs/adr/`. Read related ADRs before structural changes.

## Agent skills
<!-- Matt skills read this during new-feature. init seeds missing docs/agents
     files and preserves edits. -->

### Issue tracker

Local markdown in the EngineOS layout: PRDs in `docs/prds/`, tickets in `docs/specs/<feature>/tickets/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` — recorded on a ticket's `Triage:` line; the `**Status:**` line keeps its own closed vocabulary (`docs/agents/issue-tracker.md`). See `docs/agents/triage-labels.md` (create it only to override a default).

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/` (`YYYY-MM-DD-<slug>.md`). See `docs/agents/domain.md`.

## tlc-spec-lean
<!-- SPEC/build profile; .specs/features/<feature>/ indexed from docs/specs/. -->
profile: light
budget: 150k

## EngineOS
Adopted with `scripts/init-project.sh`. The test policy is defined once, in
`rules/verification.md` — read it there and do not restate it here. This section
records requested test scope only: <none | named areas>. It never grants
automatic test approval; the human approves current-task testing after integration.
