# <Project Name>

<!-- Copy to <repo>/CLAUDE.md (`engineos init` does this when the project has none).
     Declares the stack so the EngineOS router skips detection, and records ONLY what's
     project-specific. Team standards live in EngineOS — don't repeat them.
     The Stack and Commands sections carry one block per backend stack — Node (NestJS)
     and Python (FastAPI). Keep the block(s) your repo uses and delete the other; a repo
     with both stacks keeps both. `.engineos/config.json` (written by `engineos init`)
     is the machine-readable declaration; this file is the human one. -->

## Stack (router hints)
<!-- Node block — delete if this repo has no Node backend -->
- Backend: NestJS (apps/api) — route backend work per EngineOS `rules/backend.md` + `nestjs-patterns`
<!-- Python block — delete if this repo has no Python backend -->
- Backend: FastAPI (<dir, e.g. backend/>) — `rules/backend-python.md` + `python-patterns`
<!-- Shared rows -->
- Frontend: Next.js (apps/web) — `rules/frontend.md` + `react-patterns`
- Mobile: <yes/no — React Native app lives in ...> — `rules/frontend.md` + `rules/backend.md` (API-consumption parts), `mobile-coordinator` agent
- DBA / data: <Postgres/Oracle/... — schema + migrations live in ...> — `rules/architecture.md` + `rules/data.md`, `dba-coordinator` agent
- DevOps: <CI/CD + infra — pipelines/IaC live in ...> — `rules/architecture.md` + `rules/observability.md`, `devops-coordinator` agent
- LLM: <yes/no — agents, RAG, prompts live in ...> — `rules/llm-apps.md` + `llm-engineering`; RAG features keep `evals/<feature>/retrieval/BASELINE.md`

## Commands
<!-- Node block — delete if this repo has no Node package -->
- Typecheck: `npm run typecheck`
- Test: `npm run test` (unit), `npm run test:e2e`
- Lint: `npm run lint`
- Run locally: `npm run dev`
<!-- Python block (run from <dir>) — delete if this repo has no Python package -->
- Lint: `ruff check . && ruff format --check .`
- Typecheck: `pyright`
- Test: `pytest`
- Run locally: `uvicorn app.main:app --reload` (or `fastapi dev`)

## Project-specific conventions (deltas from EngineOS only)
- <e.g. "We use cursor pagination everywhere, not page/limit">
- <e.g. Node: "Database migrations via TypeORM, never auto-sync">
- <e.g. Python: "Database migrations via Alembic, never `create_all` at boot; settings via `pydantic-settings`, one model, read once in `main.py`">
- `.engineos/config.json` declares the stack per package (`dir`, `language`, `framework`, `compose_service`, `python_env`) — edit it when a package moves or a stack is added; the Stop gate and the coordinators read it before detection

## Domain glossary
- <term> — <meaning>

## ADRs
Decisions live in `docs/adr/`. Read related ADRs before structural changes.

## EngineOS
Adopted with `scripts/init-project.sh`. The test policy is defined once, in
`rules/verification.md` — read it there and do not restate it here. This section
declares only the delta: the areas where this project requires tests regardless of
what was asked for: <none | e.g. "apps/api/src/billing/**">.
