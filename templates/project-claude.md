# <Project Name>

<!-- Copy to <repo>/CLAUDE.md. Declares the stack so the EngineOS router skips detection,
     and records ONLY what's project-specific. Team standards live in EngineOS — don't repeat them. -->

## Stack (router hints)
- Backend: NestJS (apps/api) — route backend work per EngineOS `rules/backend.md` + `nestjs-patterns`
- Frontend: Next.js (apps/web) — `rules/frontend.md` + `react-patterns`
- LLM: <yes/no — agents, RAG, prompts live in ...> — `rules/llm-apps.md` + `llm-engineering`

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
