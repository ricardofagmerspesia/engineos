# <Project Name>

<!-- Copy to <repo>/CLAUDE.md. Declares the stack so the EngineOS router skips detection,
     and records ONLY what's project-specific. Team standards live in EngineOS — don't repeat them. -->

## Stack (router hints)
- Backend: NestJS (apps/api) — route backend work per EngineOS `rules/backend.md` + `nestjs-patterns`
- Frontend: Next.js (apps/web) — `rules/frontend.md` + `react-patterns`
- Mobile: <yes/no — React Native app lives in ...> — `rules/frontend.md` + `rules/backend.md` (API-consumption parts), `mobile-coordinator` agent
- DBA / data: <Postgres/Oracle/... — schema + migrations live in ...> — `rules/architecture.md` + `rules/data.md`, `dba-coordinator` agent
- DevOps: <CI/CD + infra — pipelines/IaC live in ...> — `rules/architecture.md` + `rules/observability.md`, `devops-coordinator` agent
- LLM: <yes/no — agents, RAG, prompts live in ...> — `rules/llm-apps.md` + `llm-engineering`; RAG features keep `evals/<feature>/retrieval/BASELINE.md`

## Commands
- Typecheck: `npm run typecheck`
- Test: `npm run test` (unit), `npm run test:e2e`
- Lint: `npm run lint`
- Run locally: `npm run dev`

## Project-specific conventions (deltas from EngineOS only)
- <e.g. "We use cursor pagination everywhere, not page/limit">
- <e.g. "Database migrations via TypeORM, never auto-sync">

## Domain glossary
- <term> — <meaning>

## ADRs
Decisions live in `docs/adr/`. Read related ADRs before structural changes.

## EngineOS
Adopted with `scripts/init-project.sh` (EngineOS 1.6.0). Tests are opt-in per `rules/verification.md`;
list any area where this project requires them: <none | e.g. "apps/api/src/billing/**">.
