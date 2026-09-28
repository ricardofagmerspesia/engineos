# <Project Name>

<!-- Copy to <repo>/CLAUDE.md (`engineos init` picks this variant when every package it
     resolves is Python). Declares the stack so the EngineOS router skips detection, and
     records ONLY what's project-specific. Team standards live in EngineOS — don't repeat
     them. `.engineos/config.json` (written by `engineos init`) is the machine-readable
     declaration; this file is the human one. A repo that also carries a Node package
     wants `templates/project-claude.md` instead — it has both blocks. -->

## Stack (router hints)
- Backend: FastAPI (<dir, e.g. backend/ or .>) — route backend work per EngineOS `rules/backend-python.md` + `python-patterns`
- Frontend: <none | Next.js/React (<dir>) — `rules/frontend.md` + `react-patterns`>
- DBA / data: <Postgres/OpenSearch/... — schema + Alembic migrations live in ...> — `rules/architecture.md` + `rules/data.md`, `dba-coordinator` agent
- DevOps: <CI/CD + infra — pipelines/compose/IaC live in ...> — `rules/architecture.md` + `rules/observability.md`, `devops-coordinator` agent
- LLM: <yes/no — agents, graph, tools, prompts live in ...> — `rules/llm-apps.md` + `llm-engineering`; RAG features keep `evals/<feature>/retrieval/BASELINE.md`

## Commands
<!-- Run from the package dir. The Stop gate resolves the runner the same way:
     `.venv/bin/<tool>` → `uv run <tool>` (when uv.lock exists) → `docker compose exec <service>`. -->
- Lint: `ruff check . && ruff format --check .`
- Typecheck: `pyright`
- Test: `pytest`
- Run locally: `uvicorn app.main:app --reload` (or `fastapi dev`)

## Project-specific conventions (deltas from EngineOS only)
- Database migrations via Alembic, never `create_all` at boot
- Settings via `pydantic-settings`: one model, secrets as `SecretStr`, read once in `main.py`; no `os.environ` elsewhere
- `.engineos/config.json` declares the stack per package (`dir`, `language`, `framework`, `compose_service`, `python_env`) — edit it when a package moves or a stack is added; the Stop gate and the coordinators read it before detection
- <e.g. "Dev JWT: `scripts/mint_dev_token.py --company <tenant>` — QA and local calls mint from it, there is no auth bypass">

## Domain glossary
- <term> — <meaning>

## ADRs
Decisions live in `docs/adr/`. Read related ADRs before structural changes.

## EngineOS
Adopted with `scripts/init-project.sh`. The test policy is defined once, in
`rules/verification.md` — read it there and do not restate it here. This section
declares only the delta: the areas where this project requires tests regardless of
what was asked for: <none | e.g. "app/domain/**">.
