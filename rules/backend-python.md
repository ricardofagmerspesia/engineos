# Backend Rules — FastAPI / Python

## Layout (ports and adapters)
- DO keep `domain/` framework-free: `Protocol` ports, frozen dataclasses (tuples, never lists) for values, a `DomainError` hierarchy, `limits.py` for every size cap, `use_cases/` for orchestration. Stdlib imports only — a pytest test walks `domain/` and fails on any other import.
- DO put I/O in `adapters/` (DB, HTTP clients, LLM SDKs, queues) and HTTP in `api/` (routers, schemas, auth, middleware, error handlers); pure-CPU implementations (normalizers, prompt builders) are top-level packages. Agent projects add `graph/`, `agents/`, `tools/` on the adapter side; a second import-purity test asserts they never import `api/`.
- DO wire everything in ONE composition root, `create_app()` in `main.py`: constructor injection, no DI container; adapters are built there and the use case is stored on `app.state`. (Dependency direction is `rules/architecture.md`'s; this is the Python layout for it.)
- DO keep routers thin: parse → build the command → call the use case → map the response. No business logic, no repository calls.

## Validation & schemas
- DO validate every external input with Pydantic v2 models at the router edge, `model_config = ConfigDict(extra="forbid")`: the model IS the allowlist — an unexpected field is a 422, not a silently dropped one, and mass assignment is closed. (`rules/security.md` owns boundary validation; this is the FastAPI mechanism.)
- DO keep separate In/Out models (`XRequest` / `XResponse`) with a `from_result()` mapper on the response; DON'T return the ORM row or the domain dataclass.
- DO declare `response_model=` on every route, plus `responses={<status>: {"model": ErrorResponse}}` for the errors it can answer; never an untyped dict.
- DO bind query and path parameters with `Annotated[type, Query(...)]` / `Path(...)` carrying bounds (`ge`, `le`, `max_length`); DON'T read `request.query_params` by hand.
- DO bound every string and collection in the schema (`Field(max_length=…)`) and cap the body with a size-limit middleware on the declared `Content-Length`.
- DON'T trust internal callers either at module boundaries that cross trust zones.

## Use cases & data access
- DO make the use case the transaction boundary: it opens the session / `begin()`; repositories receive the session and query — a repository never commits or rolls back.
- DO define repositories as `Protocol` ports in `domain/`; the SQLAlchemy implementation lives in `adapters/`. DON'T leak `Session` or query objects out of it; DON'T `.all()` without a bound.
- DO take the tenant from the token only: `Depends(current_principal)` → `Principal(tenant_id, user_id)` from the JWT claim; a tenant id in a body or query is ignored, never merged. An adapter over a shared store takes the tenant at construction or as a required keyword argument and raises when it is missing — no tenant means no query, never "all".
- DO make webhook/queue handlers (Celery/arq) idempotent via a dedupe key or upsert. (The principle is `rules/architecture.md`'s; this is the mechanism.)

## Domain & adapters
- DO model domain values as `@dataclass(frozen=True)` with tuples; `dataclasses.replace()` to derive, never mutate.
- DO make every adapter constructor keyword-only (`def __init__(self, *, endpoint, api_key, ..., client=None)`), with an injectable `client=None` that raises `ValueError` at construction when neither a client nor the config to build one is given. Tests pass a stub client; production passes settings.
- DO set a timeout on every outbound call, let the SDK manage retries, and map every SDK exception to ONE domain error (`LLMUnavailableError`) — the key and the upstream text never land in the message.
- DO treat warnings as a response channel: `warnings: tuple[str, ...]` on the result, `warnings: list[str]` on the response. An optional feature that degrades (retrieval down, enrichment skipped, identity call failed) appends a warning and returns; only the core path raises.

## API design
- DO follow REST resource naming: plural nouns, nested only one level (`/orders/{id}/items`); version under `/v1` (`APIRouter(prefix="/v1")`) — never break existing consumers silently.
- DO give `rules/architecture.md`'s paginate-every-list rule concrete numbers here: default limit 20, max 100 (`Annotated[int, Query(ge=1, le=100)]`), and return total/cursor metadata.
- DO return structured errors from one module of `@app.exception_handler`s, shaped `{ statusCode, code, message, correlationId }` — where `code` is the stable taxonomy value defined in `rules/observability.md`. The set of `code` values is CLOSED: enumerated in that module, listed in the route's OpenAPI `responses`; clients switch on `code`, never on the prose in `message`. One `DomainError` subclass → one `code`; `RequestValidationError` → `invalid_request`; the catch-all `Exception` handler → `internal`, logged with `logger.exception`.
- DON'T echo the credential or upstream text on 401/502: "Authentication failed." and "The language model backend is unavailable." are the whole message; the detail goes to the server log under the correlation id.

## Async & jobs
- DO keep I/O ports and route handlers `async`; a pure-CPU port stays sync (no thread hop for work that never waits). Blocking I/O inside an `async def` route freezes the worker — use the async client or `asyncio.to_thread`.
- DO use a queue (Celery/arq) for the slow work `rules/architecture.md` sends to the background, with retries + backoff and a dead-letter path.
- DO bound concurrency: `asyncio.gather` over a user-sized list is a DoS on yourself — `asyncio.Semaphore` or batches.

## Observability
- Follow `rules/observability.md` for the log schema, correlation-id propagation and error taxonomy. Python mechanism: a `CorrelationIdMiddleware` that honours an inbound `X-Correlation-Id` (truncated to 64 chars), generates `uuid4().hex` when absent, stores it on `request.state`, echoes it on the response and puts it in every error body; stdlib `logging` with a named hierarchy (`logging.getLogger("<service>.api")`, `.usage`, `.adapters`) — no `print()` in library code.
- DO emit ONE structured JSON usage line per LLM call (`event`, `tenantId`, `model`, `promptTokens`, `completionTokens`, `durationMs`, `correlationId`, `promptVersion`, `outcome`), recorded in a `finally:` so a timeout or an empty completion is billed visibly, not silently. (PII/secrets never in logs — `rules/security.md`.)

## Config & lifecycle
- DO load config once with `pydantic-settings`, fail-closed: `env_prefix="<SERVICE>_"`, `extra="forbid"`, secrets typed `SecretStr`, credentials REQUIRED with no default — a deploy with a wiped secret crashes at startup instead of coming up green and 502-ing every call. Validate at model level (`@model_validator(mode="after")`) so a rejected secret never prints as `input_value=`; a second model validator fails startup on any `<PREFIX>_*` variable the model does not declare (`extra="forbid"` covers the `.env` file, not the process environment). (The fail-fast-config principle is `rules/architecture.md`'s.)
- DON'T read `os.environ` outside the settings module; inject `Settings` with `Depends(get_settings)` (`@lru_cache`).
- DO expose `/healthz` (liveness: the process is up, nothing else) and `/readyz` (readiness: settings validated and adapters constructed — `app.state.ready`, 503 until then) with NO provider round-trip: a readiness probe that spends tokens is a bill, not a health check. `rules/observability.md` requires both.
- DO use `lifespan` for shutdown: close connection pools (`await adapter.aclose()`), drain workers — an unclosed pool leaks sockets across a reload.
- DO manage schema with Alembic, one migration per change; migration safety (expand-contract, reversibility, locking) is `rules/data.md`'s.

## Tests (when tests are on for the task)
- DO write in-memory fakes that implement the `Protocol` port (a `@dataclass` with a `.returning(*texts)` factory and a `calls` list) instead of `MagicMock`: a fake that drifts from the port fails `pyright`, a mock never does. Craft is `rules/testing.md`'s.
- DO set env vars in `conftest.py` BEFORE importing `app.main` (the composition root reads settings at import) and build the app with `create_app(llm=FakeLLM(...))`; route tests go through `TestClient` / `httpx.AsyncClient`, never the network.
- DO keep the two import-purity tests (`domain/` stdlib-only; `graph/`, `agents/`, `tools/` never import `api/`).
- DO pin `ruff`, `pyright` and `pytest` to exact `==` versions in the dev dependencies and commit the lockfile (`uv.lock` or `requirements.lock`); the Stop gate reports an unpinned tool.

## Anti-patterns
Business logic in routes · domain objects or ORM rows in responses · `os.environ` outside settings · unbounded `.all()` · `asyncio.gather` over user-sized lists · bare `except:` · mutable default arguments · sync I/O in `async def` routes · `Optional[X]` where `X | None` is the project idiom · magic strings shared across modules as literals (one constants module) · `MagicMock` standing in for a port · a tenant id read from the body · a readiness check that calls the provider.
