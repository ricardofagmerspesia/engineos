# API contract — <feature>

Freeze before parallel consumer implementation. Replace placeholders, mark
irrelevant fields `N/A`, and close blocking decisions before setting `frozen`.

## Ownership and revision

- Owner: <one person/agent responsible for schema and shared generated files>
- Revision / state: <revision> / <draft | frozen>
- Authoritative schema: <project path; Nest DTO/OpenAPI source or existing schema>
- Consumers: <task ids and the revision each consumes>
- Blocking decisions: <none when frozen>

## Operations

Repeat for each consumed operation.

- Method / path / operation id: <...>
- Auth / resource authorization / tenant scope: <...>
- Inputs: <path/query/header/body fields, wire types, required/optional, constraints>
- Nest input DTO / runtime validator: <paths; validation and coercion rules>
- Success status / response / output DTO / mapping: <wire fields and project paths>
- Errors: <HTTP status, stable code, recoverability; shape
  `{ statusCode, code, message, correlationId }`; no internal details>
- Pagination: <default/max limit, cursor or page semantics, metadata, ordering>
- Serialization: <dates, null versus omission, numeric range, enums>
- Retry / idempotency: <applicable key, conflict and replay behavior, or N/A>

## Streaming and cancellation — if applicable

- Transport / event shapes: <SSE, WebSocket or existing transport; typed payloads>
- Lifecycle: <start, chunks, ordering, completion and terminal error behavior>
- Cancellation: <client abort/disconnect signal, server propagation, work that stops
  or continues, timeout and cleanup behavior>
- Reconnect / resume / correlation: <supported semantics or explicitly unsupported>

## Consumer boundary and generation

- Wire types/schemas: <framework-independent export paths; no Nest/ORM runtime imports>
- Existing generation command / source → outputs: <command and paths, or N/A>
- Generated files and shared wiring owner: <one owner; consumers leave these files to owner>
- No generator: <plain TypeScript wire definitions and owner reconciliation process>
- Runtime validation: <Nest input boundary and any required response/client checks>
  TypeScript and OpenAPI describe shapes; they do not validate incoming payloads.

## Revision changes and readiness

- Compatibility / migration: <breaking versus compatible changes and affected consumers>
- Change procedure: pause affected consumers → owner resolves schema and wire
  definitions → increment revision → consumers acknowledge revision → resume.
- Ready: every consumed operation/shape specified, owner and consumers named,
  source/output paths identified, blocking decisions closed. Acceptance criteria
  may be listed here; executable tests wait for integration and user approval.
