# Production Backend Standards — Project-Specific

> **DEPRECATED 2026-09-28** — removed after the deprecation window in
> `docs/COMPATIBILITY.md` (the next MAJOR, not before). No router row loads this
> file any more. Reason: it is a company-specific overlay (`@coresoft-sas/*`,
> `DefaultTypeOrmRepository`, "no snake_case" — which conflicts with PEP 8 for
> Python packages), not generic EngineOS policy. New home: the consuming
> project's own `CLAUDE.md` / `docs/rules/` — copy the sections that apply there;
> project conventions already win over EngineOS (non-negotiable #4). Nothing
> below is maintained.

Overlays on top of EngineOS `rules/backend.md`. These standards apply to every backend code change in this repository.

## Apply Scope

Every code change in the backend domain (NestJS, API, services, repositories, migrations) without exception.

---

## Non-Negotiable Rules

- Use real integrations and real data sources only. Never use mocks, fake payloads, placeholders, or TODO implementations.
- Write everything in English. No translated identifiers, comments, or messages.
- No emojis anywhere in code, comments, or logs.
- Comments explain *why* a decision exists, never *what* the code does. Keep them short.
- No code smell — adhere to SOLID principles.

### NestJS-Specific Rules

- Don't extend TypeORM repository directly.
- Don't use snake_case identifiers.
- Don't put business logic in controllers or call repositories from controllers.
- Don't perform calculations or data aggregation in controllers.
- Don't call entities or repositories from controllers.

**Do:**
- Extend `DefaultTypeOrmRepository<Entity>` for repositories.
- Keep controllers lean (<20 lines), only call services.
- Use `@Transaction({ connectionName: 'moduleName'})` for write operations.

---

## Logging & Configuration

- Do not use `console.log` or any unstructured logging. Use the structured logger from `@coresoft-sas/api-core`.
- Do not create `.env` files. Add new environment variables to the Zod-based config schema (`src/config/`).
- Always use `EnvService` for environment access; never read `process.env` directly outside the config layer.

---

## TypeScript and Contracts

- Use a single `import` statement per module. Do not split symbols from the same source across multiple import lines; combine them in one statement.
- Use `Number.parseFloat()` and `Number.parseInt()` instead of global `parseFloat()` and `parseInt()`.
- Strict mode is required. The compiler must never be relaxed to accommodate shortcuts.
- Never use `any`. If a type is genuinely unknown, use `unknown` and narrow it immediately with a runtime or type guard.
- Prefer utility types (`Partial`, `Pick`, `Omit`, `Required`, `ReturnType`, etc.) and discriminated unions over ad-hoc loose typing.
- DTOs at controller boundaries must be classes, never plain interfaces or type aliases.
- Every controller endpoint must declare both a request DTO and a response DTO.
- All external inputs must be validated with `class-validator`. Use `@ValidateNested()` and `@Type()` for nested objects.
- Response shapes must be typed explicitly — never return untyped service results directly to the controller.
- Mappers should always be created in a separate file to be reusable in all places.

---

## Shared Libraries First

Before creating any new endpoint path, message topic, DTO, constant, or enum:

1. Use **NestJsMcp** tools when generating NestJS code: prefer `nestjs_generate_controller`, `nestjs_generate_service`, `nestjs_generate_dto`, `nestjs_generate_resource`, etc., then align output with shared libs and this rule set. Use **api-docs-mcp** tools (`api_docs`, `api_search`) when implementing against an existing OpenAPI/GraphQL spec so request/response shapes match the contract.
2. Search `efy-nest-commons-library` (`@coresoft-sas/api-common`, `@coresoft-sas/api-core`) for an existing contract.
3. Reuse what exists. Do not duplicate.
4. If a new contract is genuinely required:
   - Centralize endpoint paths in the `api-shared` enums inside the commons library.
   - Centralize message topics in `@coresoft-sas/api-common` constants.
   - Export new shared items from the library's `src/index.ts`.
   - Never define inline string topics or path literals inside service code.

**Domain errors, constants, and shared types (`api-common` vs microservice):**

- Do not leave **domain error classes** (`Error` subclasses with stable machine-readable `code`), **domain-wide error-code enums**, **vertical-wide constants** (defaults, TTLs, sentinel values shared by that product domain), or **shared operational parameter types** (objects whose fields use only library types such as shared enums) inside a microservice when they define or stabilize behavior for a **shared vertical** (financial, client360, etc.). Add them under `libs/api-common/src/dto/<vertical>/` (for example `financial/`: `*.errors.ts`, `*.constants.ts`, enums, and small shared interfaces), re-export through that folder's `index.ts` and the package public API like other DTOs.
- Use **distinct class names** when two subdomains need the same phrase (e.g. `BankIntegrationUnavailableError` vs `CreditCardIntegrationUnavailableError`) so symbols imported from `@coresoft-sas/api-common` never collide.
- **Keep in the microservice:** TypeORM entities and DB-only shapes, repository internals, env-driven integration wiring (URLs, provider-specific maps), and private return types that reference local entities only unless you add matching shared DTOs or types in `api-common`.
- RabbitMQ **routing key / topic enums** stay in `@coresoft-sas/api-messaging` per existing convention; do not duplicate them as inline strings in service code.

**Message topics and queue binding pattern:** When defining a topic enum for a domain (e.g. `CLIENT360_TOPICS`), ensure every routing key matches a single binding pattern so one queue can receive all messages. Use a consistent prefix under the exchange (e.g. `integrations.clients.#`). All topics in that enum must start with that prefix (e.g. `integrations.clients.search.request`, `integrations.clients.accounts.list.request`, `integrations.clients.transactions.list-client.request`). Do not mix prefixes (e.g. `integrations.accounts.*` and `integrations.clients.*`) in the same enum if they should be consumed by one queue.

**Subpath imports to use:**

| Need | Import from |
|---|---|
| Validation pipe | `@coresoft-sas/api-common/pipes` |
| Exception filter | `@coresoft-sas/api-common/filters` |
| Logging / transform interceptors | `@coresoft-sas/api-common/interceptors` |
| `ApiResponseDocs`, `CurrentUser`, `ReqAccountId` | `@coresoft-sas/api-common/decorators` |
| `EnvModule`, `EnvService` | `@coresoft-sas/api-core/env` |
| `PermissionGuard`, `RequirePermission`, rate limit guards | `@coresoft-sas/api-core/guards` |
| `SecurityAuditService`, `RateLimitingService` | `@coresoft-sas/api-core/services` |

Never deep-import from `src/**` paths of any library.

---

## Controller Input Patterns (Mandatory)

Controllers must use **typed DTOs** for all inputs. Verbose inline decorators are **prohibited**.

**Prohibited:**
```typescript
// NEVER do this - verbose and repetitive
@ApiQuery({ name: 'page', required: false, type: Number, description: '...' })
@ApiQuery({ name: 'limit', required: false, type: Number, description: '...' })
@ApiParam({ name: 'clientId', description: 'Client ID', example: 'c1' })
async list(
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
  @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  @Param('clientId') clientId: string,
)
```

**Required:**
```typescript
// ALWAYS use typed DTOs
async list(
  @Param() params: ClientParamsDto,
  @Query() query: PaginationQueryDto,
)
```

Rules:
1. Never use inline `@ApiQuery` or `@ApiParam` — DTO `@ApiProperty` decorators handle Swagger docs
2. Never use `DefaultValuePipe` or `ParseIntPipe` inline — use `@Type(() => Number)` and defaults in DTOs
3. Always use typed DTO classes for `@Query()` and `@Param()`
4. Reuse existing DTOs from `@coresoft-sas/api-common`: `PaginationQueryDto`, `ClientParamsDto`, `AccountParamsDto`
5. Create new DTOs in commons library when patterns emerge

---

## Error Handling

- Every service method that can fail must have an explicit failure path — no unhandled promise rejections.
- Use custom exception classes for domain and integration failures. Extend NestJS `HttpException` or create a base domain exception.
- Message handlers must catch all exceptions and return the standard envelope:
  ```typescript
  // success
  { success: true, data: result }

  // failure — never throw out of a handler
  { success: false, error: { message: string, statusCode: number } }
  ```
- At HTTP boundaries, return explicit status codes with meaningful messages. Never expose stack traces or internal error details to clients.
- Normalize errors from external integrations before propagating. Upstream error shapes must not leak through service boundaries.
- Log errors at the appropriate severity level with enough context to reproduce the issue (correlation ID, affected entity ID, operation name).

---

## Security and Data Access

- Validate and sanitize all inputs at the controller boundary using class-validator. Do not trust data that has already passed through a service.
- Every protected endpoint must declare the required permission using `@RequirePermission` and `@UseGuards(PermissionGuard)`.
- Apply `@LoginRateLimit()`, `@RegistrationRateLimit()`, `@TokenRefreshRateLimit()`, or `@ApiRateLimit()` to all sensitive endpoints.
- Use parameterized queries (TypeORM repository methods or QueryBuilder with parameters). Never concatenate user input into queries.
- Protect tokens, credentials, and secrets: strip them from logs, responses, and error messages.
- Follow OWASP API Security Top 10 practices. Mass assignment must be blocked by whitelisting DTO properties (`whitelist: true` in ValidationPipe).
- Security events (failed logins, permission violations, suspicious patterns) must be recorded via `SecurityAuditService`.

---

## Performance and Scalability

- Avoid N+1 queries. Use `relations`, `leftJoinAndSelect`, or dataloader patterns to load related entities in a single round-trip.
- Paginate all endpoints that return collections. Use cursor or offset pagination consistently.
- Cache repeated reads with `CACHE_MANAGER` (Redis-backed). Invalidate cache on writes. Keep TTLs consistent — the cache module expects seconds.
- Do not load unbounded datasets into memory. Stream or paginate large result sets.
- Profile before optimizing. Add indexes to columns used in `WHERE`, `ORDER BY`, and `JOIN` conditions.
- Make decisions for long-term scalability. Convenience that creates technical debt must be called out and rejected.

---

## Folder Layout

For a new module (Nest services):

```
src/<module>/
  <module>.controller.ts     HTTP or TCP handler only
  <module>.service.ts        Business logic
  <module>.repository.ts     Data access
  <module>.module.ts         NestJS module wiring
  dto/
    <action>-<module>.dto.ts  One file per request/response pair
  entities/
    <module>.entity.ts
```

---

## Delivery Standard

Ship production-ready code only:

- No placeholders or stubs
- No partial flows — every code path that can be reached must produce a correct result
- No hidden failure paths — exceptions must be caught, logged, and handled
- No contract ambiguity — request and response types must be fully specified
- No magic values — every literal must be a named constant
- No direct environment variable access outside the config layer — always use `EnvService`
