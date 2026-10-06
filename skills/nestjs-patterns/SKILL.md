---
name: nestjs-patterns
description: "NestJS modules, controllers, DTOs, services, repositories, workers and queues. Use for backend endpoints, migrations or Node/Express migration assessment; tests require final approval."
---

# NestJS Patterns

Apply `rules/backend.md` and `rules/architecture.md` from the EngineOS root.
NestJS is required: HTTP uses `NestFactory.create()`; workers/non-HTTP agent hosts
use `createApplicationContext()`. Nest modules compose injectable providers.
Express is permitted as Nest's adapter. Existing standalone Node/Express services
need a reported deviation and scoped migration before extension, never silent conversion.

## Feature layout

```
src/orders/
  orders.module.ts
  orders.controller.ts        # validate → service → map
  orders.service.ts           # orchestration/transactions
  orders.repository.ts        # data access only
  dto/create-order.dto.ts     # class-validator input
  dto/order.response.dto.ts   # output, never entity
  entities/order.entity.ts
```

## New-endpoint checklist

Before parallel API/UI/agent work, freeze `templates/api-contract.md` under
backend rules. Consumers pin revision and framework-independent wire types;
one owner controls schemas/generated artifacts. DTO/OpenAPI types do not replace
runtime validation.

1. Input DTO: explicit `@IsOptional()` for optional fields; boundary validation.
2. Controller: route, typed DTO, service call, response DTO; target <20 lines.
3. Service: business logic, domain exceptions (NotFoundException/DomainError),
   transaction boundaries.
4. Repository: queries only, returning entities/primitives.
5. Response mapping: explicit toResponse() or class-transformer `@Expose` allowlist.
6. Plan service/repository/controller acceptance criteria; tests only after
   integration and explicit current-task final-stage approval.
7. Paginate list endpoints (page/limit or cursor) with backend defaults.

## Typed controller inputs

Bind `@Query()`/`@Param()` to DTO classes; DTO defaults, `@Type(() => Number)`
and `@ApiProperty` supply coercion/docs. Prohibit inline named binding pipes,
DefaultValuePipe/ParseIntPipe and per-param ApiQuery/ApiParam:

```typescript
// Avoid inline coercion/documentation:
async list(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1) {}
// DTO contains validation, defaults, coercion and Swagger metadata:
async list(@Param() params: ClientParamsDto, @Query() query: PaginationQueryDto) {}
```

Use available nestjs MCP resource/service generators, then adapt their output;
disable test generation until final approval.

## Defaults

- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- One exception filter: `{ statusCode, code, message, correlationId }`, optional
  validation details/timestamp. Map validation/domain/HttpException consistently;
  backend/observability rules own code taxonomy.
- Secure-by-default controller guards; `@Public()` exceptions. Read principal
  through `@CurrentUser()` or `@CurrentUser('id')`, never request.user.
- BullMQ processor per queue; idempotent jobs with dedupe keys.
- ConfigModule with joi/zod boot validation and typed config service; no service
  process.env. nestjs-pino plus correlation middleware; log boundaries only.

## Approved final tests

Test files/fakes/executable HTTP collections/suite runs follow verification rules.
For service/use-case tests use concrete Map/array repository-contract fakes beside
contracts (`*.in-memory.repository.ts`), not jest.fn repository mocks; reserve
mocks for external I/O (HTTP/clock).

Place `*.integration.http` beside controllers: variables first, `###` requests,
`@name` response chains; tokens from request steps/env, never literals. These
runnable manual checks supplement rather than replace endpoint E2E coverage.

## Prisma, when present

Split domain models into `prisma/models/<module>.prisma`. Use TypeScript model
names with `@@map("<snake_case_plural>")` tables and `@map` columns. Name
incremental kebab-case migrations `<module>`, then `<module>-<change>`;
`rules/data.md` owns migration safety.

## Review traps

Move controller business logic/math/aggregation into services, repository injection
through services, and exposed entities into response DTOs. Flag unbounded find(),
inline controller pipes/docs, direct principal access, service env reads and mock
repositories; apply the concrete alternatives above.
