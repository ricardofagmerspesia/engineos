---
name: nestjs-patterns
description: Team NestJS conventions for building modules, services, controllers, DTOs, repositories, queues, and tests. Use when creating or modifying NestJS backend code — new endpoints, services, modules, workers, or migrations.
---

# NestJS Patterns

Apply `rules/backend.md` and `rules/architecture.md` from EngineOS first. This skill adds the concrete shapes.

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

1. Input DTO with class-validator decorators (every field validated, `@IsOptional()` explicit).
2. Controller method: route decorator, DTO param, call service, return response DTO. Nothing else.
3. Service method: business logic; wrap multi-write in transaction; throw domain exceptions (`NotFoundException`, custom `DomainError` subclasses).
4. Repository method: query only; return entities or primitives.
5. Response DTO mapping (explicit `toResponse()` or class-transformer with `@Expose` allowlist).
6. Tests: service unit test (repository mocked) + controller e2e for the happy path and one auth/validation failure.
7. List endpoints: pagination params (`page/limit` or cursor), default 20, max 100, return metadata.

## Codegen

Use the `nestjs` MCP tools for scaffolding (`nestjs_generate_resource`, `nestjs_generate_service`, etc.) — then adapt output to the layout above. MCP output is a starting point, not gospel.

## Common team decisions (defaults)

- Global pipes: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Global exception filter returning `{ statusCode, error, message, correlationId }`.
- Auth: guards at controller level, `@Public()` decorator for exceptions — secure by default.
- Queues: BullMQ; one processor class per queue; jobs idempotent via dedupe key.
- Config: `ConfigModule` with schema validation (joi/zod); typed config service; no raw `process.env` outside config layer.
- Logging: nestjs-pino, correlation id middleware, log boundaries only.

## Anti-patterns to flag in existing code

- Business logic in controllers → move to service.
- Entities returned from controllers → add response DTO.
- `process.env` in services → move to config.
- Repository injected into controller → route through service.
- Unbounded `find()` without pagination on list routes.
