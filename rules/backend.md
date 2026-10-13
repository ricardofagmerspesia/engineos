# Backend Rules — NestJS

## Application hosting
- Apply the mandatory NestJS backend policy in `rules/base.md`, including existing-service migration handling.
- DO bootstrap HTTP services with `NestFactory.create()` and worker-only services with `NestFactory.createApplicationContext()`; register work in modules and injectable providers.
- Express is permitted as Nest's HTTP adapter; keep routes and lifecycle inside Nest controllers/providers rather than a separately bootstrapped Express server.

## Module structure
- DO one Nest module per domain feature; module exports only its service surface.
- DO keep controllers thin: parse/validate → call service → map response. No business logic.
- DON'T inject repositories into controllers — controllers know services only.

## Validation & DTOs
- DO validate every external input with class-validator DTOs (or zod pipes) at the controller edge. (`rules/security.md` owns the boundary-validation rule; this is the NestJS mechanism for it.)
- DO use separate DTOs for input and output — never expose ORM entities in responses.
- DO make every endpoint declare both a request DTO and a response DTO; never return an untyped service result.
- DO make boundary DTOs classes, not interfaces/type aliases (decorators need a class). Use `@ValidateNested()` + `@Type()` for nested objects.
- DO whitelist: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` globally — also blocks mass assignment.
- DON'T trust internal callers either at module boundaries that cross trust zones.

## Services & data access
- DO put data access behind repository providers; services orchestrate, repositories query.
- DO wrap multi-write operations in transactions; the transaction boundary lives in the service, not repository.
- DO make webhook/queue handlers idempotent via a dedupe key or upsert. (The idempotency principle lives in `rules/architecture.md`; this is the mechanism.)
- DON'T leak ORM query builders out of repositories.

## API design
- DO follow REST resource naming: plural nouns, nested only one level (`/orders/:id/items`).
- DO give `rules/architecture.md`'s paginate-every-list rule concrete numbers here: default limit 20, max 100, and return total/cursor metadata.
- DO version breaking changes (`/v2/...` or header) — never break existing consumers silently.
- DO return structured errors via a global exception filter, shaped
  `{ statusCode, code, message, correlationId }` — where `code` is the stable
  taxonomy value defined in `rules/observability.md`. `statusCode` is the HTTP
  status it maps to; clients switch on `code`, never on prose in `message`.

## Contracts before parallel implementation
- For a new or changed API consumed by another unit, freeze a project contract
  using `templates/api-contract.md` before dispatching backend/frontend/agent
  consumers. Name one owner, a revision, the authoritative schema path and the
  exact revision each consumer uses. The contract is ready when every consumed
  operation and wire shape is defined and unresolved blocking decisions are closed.
- Record method/path, auth requirements, request inputs, response/status variants,
  stable error codes and pagination; include streaming events, completion/error
  behavior and cancellation semantics when applicable. Declare serialization
  (dates, null versus omitted fields, numeric limits) rather than leaking entity types.
- Keep separate Nest input/output DTOs and explicit response mapping. Export or
  generate frontend wire types/schemas through a framework-independent boundary;
  consumers import neither Nest decorators nor ORM/backend runtime dependencies.
- Use the project's existing schema/codegen toolchain, with one owner for generated
  artifacts and shared wiring. Record source-to-output paths and the existing
  generation command; use plain TypeScript wire definitions if no generator exists.
  Reconcile those definitions with the authoritative schema through their owner.
- TypeScript types and OpenAPI descriptions are static contracts, not runtime
  validation. Keep executable input validation at Nest boundaries and response
  mapping consistent with the wire shape; runtime response checks, where required,
  use the project's existing validator. A response DTO annotation alone checks no payload.
- A contract change pauses only affected consumers. Its owner resolves the change,
  increments the revision and records compatibility/migration needs before those
  consumers resume; unrelated ready work continues.

## Async & jobs
- DO use queues (Bull/BullMQ) for the slow work `rules/architecture.md` says belongs in the background, with retries + backoff and dead-letter handling.
- DO set concurrency limits on workers; unbounded `Promise.all` over user-sized arrays is a DoS on yourself.

## Observability
- Follow `rules/observability.md` for the log schema, correlation-id propagation,
  and error taxonomy. NestJS mechanism: `nestjs-pino` as the structured logger.
  (PII/secrets never in logs — `rules/security.md`.)

## Config & lifecycle
- DO validate env at boot via a `ConfigModule` schema — missing var crashes at
  startup, not at a 3am request. (The fail-fast-config principle is in `rules/architecture.md`.)
- DO implement graceful shutdown (`enableShutdownHooks`) — drain queues, close DB pools.
- Liveness/readiness endpoints are required by `observability.md` (loaded alongside this
  file on the backend row). NestJS mechanism: `@nestjs/terminus` for `/health`, with
  readiness reflecting real dependencies (DB, queue).
