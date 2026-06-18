# Backend Rules — NestJS / Node

## Module structure
- DO one Nest module per domain feature; module exports only its service surface.
- DO keep controllers thin: parse/validate → call service → map response. No business logic.
- DON'T inject repositories into controllers — controllers know services only.

## Validation & DTOs
- DO validate every external input with class-validator DTOs (or zod pipes) at the controller edge.
- DO use separate DTOs for input and output — never expose ORM entities in responses.
- DO make every endpoint declare both a request DTO and a response DTO; never return an untyped service result.
- DO make boundary DTOs classes, not interfaces/type aliases (decorators need a class). Use `@ValidateNested()` + `@Type()` for nested objects.
- DO whitelist: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` globally — also blocks mass assignment.
- DON'T trust internal callers either at module boundaries that cross trust zones.

## Services & data access
- DO put data access behind repository providers; services orchestrate, repositories query.
- DO wrap multi-write operations in transactions; the transaction boundary lives in the service, not repository.
- DO make webhook/queue handlers idempotent (dedupe key or upsert).
- DON'T leak ORM query builders out of repositories.

## API design
- DO follow REST resource naming: plural nouns, nested only one level (`/orders/:id/items`).
- DO paginate lists (default limit 20, max 100) and return total/cursor metadata.
- DO version breaking changes (`/v2/...` or header) — never break existing consumers silently.
- DO return structured errors: `{ statusCode, error, message, correlationId }` via a global exception filter.

## Async & jobs
- DO use queues (Bull/BullMQ) for work >1s, retries with backoff, dead-letter handling.
- DO set concurrency limits on workers; unbounded `Promise.all` over user-sized arrays is a DoS on yourself.

## Observability
- Follow `rules/observability.md` for the log schema, correlation-id propagation,
  and error taxonomy. NestJS mechanism: `nestjs-pino` as the structured logger.
  (PII/secrets never in logs — `rules/security.md`.)

## Config & lifecycle
- DO validate env at boot via a `ConfigModule` schema — missing var crashes at
  startup, not at a 3am request. (The fail-fast-config principle is in `rules/architecture.md`.)
- DO implement graceful shutdown (`enableShutdownHooks`) — drain queues, close DB pools.
- DO add `/health` (liveness) and readiness checks for orchestrators.
