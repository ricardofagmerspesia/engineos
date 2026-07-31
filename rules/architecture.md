# Architecture Rules

## Boundaries
- DO organize by domain feature (`orders/`, `billing/`), not by technical layer (`controllers/`, `utils/`).
- DO give each module one public surface (index/barrel or module class); internals stay private.
- DON'T reach into another module's internals — if you need it, it belongs in the public surface.

## Dependency direction
- DO point dependencies inward: adapters (HTTP, DB, queues) depend on domain logic, never the reverse.
- DO inject I/O (db clients, http clients, clock, random) — domain code receives them, doesn't construct them.
- DON'T import framework types (request objects, ORM entities) into business logic signatures.

## Composition
- DO compose small functions/services; inheritance only for true is-a with shared invariants (rare).
- DO keep data and behavior separate where simpler: plain data + functions over deep class hierarchies.
- DON'T build plugin/strategy machinery before there are 3 real implementations (rule of three — see `base.md`).

## Configuration (12-factor)
- DO read config from environment once at startup, validate it (fail fast on missing), expose typed config object.
- DON'T read `process.env` deep inside business code.
- DON'T have per-environment code branches (`if (env === 'prod')`) — use config values.

## State & data
- DO keep services stateless; state lives in the database, cache, or queue.
- DO make operations idempotent where retries are possible (queues, webhooks, payments).
- DON'T cache without an invalidation story.

## When to split
- DO split a module when it has its own data, vocabulary, and rate of change.
- DON'T split into services/packages for "cleanliness" — split for independent deploy, scaling, or team ownership.
- DO go monolith-first. A modular monolith with clean boundaries beats premature microservices.

## Scalability defaults
- DO paginate every list endpoint from day one.
- DO set timeouts on every outbound call; no infinite waits.
- DO push slow work (>1s) to background jobs; HTTP handlers stay fast.
- DON'T do N+1 I/O in loops — batch (Promise.all with bounded concurrency, SQL `IN`, dataloader).
