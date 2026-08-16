---
name: nestjs-patterns
description: Team NestJS conventions for building modules, services, controllers, DTOs, repositories, queues, and tests. Use when creating or modifying NestJS backend code — new endpoints, services, modules, workers, or migrations.
---

# NestJS Patterns

Apply `rules/backend.md` and `rules/architecture.md` from EngineOS first (EngineOS
rules — resolved relative to EngineOS's `CLAUDE.md`, the repo/plugin root, not this
project). This skill adds the concrete shapes.

## Feature module layout

```
src/orders/
  orders.module.ts
  orders.controller.ts        # thin: validate → service → map
  orders.service.ts           # orchestration + transaction boundaries
  orders.repository.ts        # all data access
  dto/
    create-order.dto.ts       # input DTO, class-validator decorators
    order.response.dto.ts     # output DTO, never the entity
  entities/order.entity.ts
  orders.service.spec.ts
```

## Building a new endpoint — checklist

1. Input DTO — `@IsOptional()` explicit on every optional field; boundary validation rule per `rules/backend.md`.
2. Controller method: route decorator, DTO param, call service, return response DTO — thin-controller rule per `rules/backend.md`.
3. Service method: business logic; domain exceptions (`NotFoundException`, custom `DomainError` subclasses); transaction boundary per `rules/backend.md`.
4. Repository method: query only; return entities or primitives.
5. Response DTO mapping: explicit `toResponse()` or class-transformer with `@Expose` allowlist — separate-DTO rule per `rules/backend.md`.
6. Tests: service unit test (repository backed by an in-memory fake) + controller e2e for the happy path and one auth/validation failure.
7. List endpoints: pagination params (`page/limit` or cursor) — defaults per `rules/backend.md`.

## Controller input — typed DTOs, no inline pipes

Bind `@Query()` / `@Param()` to typed DTO classes. Inline binding decorators are prohibited.

```typescript
// NO — inline pipes + per-param Swagger decorators
@ApiQuery({ name: 'page', required: false, type: Number })
async list(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1) {}

// YES — DTO carries defaults, coercion (@Type(() => Number)), and @ApiProperty docs
async list(@Param() params: ClientParamsDto, @Query() query: PaginationQueryDto) {}
```
- No inline `@ApiQuery` / `@ApiParam` — DTO `@ApiProperty` covers Swagger.
- No inline `DefaultValuePipe` / `ParseIntPipe` — use `@Type()` + defaults in the DTO.
- Controllers stay lean (target <20 lines) — thin-controller rule per `rules/backend.md`.

## Codegen

Use the `nestjs` MCP tools for scaffolding (`nestjs_generate_resource`, `nestjs_generate_service`, etc.) — then adapt output to the layout above. MCP output is a starting point, not gospel.

## Common team decisions (defaults)

- Global pipes: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` — whitelisting per `rules/backend.md`; `transform: true` additionally auto-coerces payloads into DTO instances.
- Global exception filter returning `{ statusCode, code, message, correlationId }` (+ optional `details` for validation errors, `timestamp`) — shape and the `code` taxonomy per `rules/backend.md` / `rules/observability.md`. Map `ValidationException` / domain errors / `HttpException` to this one shape.
- Auth: guards at controller level, `@Public()` decorator for exceptions — secure by default. Read the authenticated principal with a `@CurrentUser()` param decorator (supports `@CurrentUser()` for the whole object or `@CurrentUser('id')` for a field) — never reach into `request.user` in controllers.
- Queues: BullMQ; one processor class per queue; jobs idempotent via dedupe key.
- Config: `ConfigModule` with schema validation (joi/zod), typed config service — env-validated-at-boot per `rules/backend.md`.
- Logging: nestjs-pino, correlation id middleware, log boundaries only — mechanism for `rules/backend.md` / `rules/observability.md`.

## Testing doubles — prefer in-memory fakes over mocks

For service/use-case tests, back each repository contract with a concrete
**in-memory fake** (a `Map`/array implementing the same interface) rather than
ad-hoc mocks. Ship the fake next to the contract (`*.in-memory.repository.ts`).
Fakes give real behavior (queries, ordering, conflicts) and don't rot when the
interface changes the way `jest.fn()` mocks silently do. Reserve mocks for true
external I/O (HTTP, clock).

## HTTP integration tests — `*.integration.http`

For endpoint checks, keep REST Client `*.integration.http` files next to the
controller: variables at the top, `###`-delimited requests, `@name` labels to chain
responses. Never hardcode tokens/secrets — pull them from a request step or an env
var. These are runnable docs + a fast manual smoke; they don't replace the e2e in
the endpoint checklist.

## Prisma (when the project uses it)

- **Modular schema:** split the schema by domain — `prisma/models/<module>.prisma`,
  one file per feature — instead of one giant `schema.prisma`.
- **Mapping:** TypeScript naming in models; `@@map("<snake_case_plural>")` for table
  names and `@map` for columns so the DB stays snake_case.
- **Migrations:** name per module in kebab-case, incremental (`<module>`, then
  `<module>-<change>`). Migration safety rules live in `rules/data.md`.

## Anti-patterns to flag in existing code

- Business logic in controllers → move to service.
- Entities returned from controllers → add response DTO.
- `process.env` in services → move to config.
- Repository injected into controller → route through service.
- Unbounded `find()` without pagination on list routes.
- Inline `ParseIntPipe`/`DefaultValuePipe`/`@ApiQuery` on params → move to a typed DTO.
- Controller doing math/aggregation or >20 lines → push into a service.
- Reaching into `request.user` in a controller → use the `@CurrentUser()` decorator.
- Service/use-case tests mocking repositories with `jest.fn()` → use an in-memory fake.
