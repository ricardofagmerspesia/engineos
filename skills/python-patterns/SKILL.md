---
name: python-patterns
description: Team FastAPI conventions for building domain use cases, ports and adapters, routers, Pydantic schemas, settings, migrations, and tests. Use when creating or modifying Python backend code — new endpoints, use cases, adapters, workers, or migrations.
---

# Python Patterns — FastAPI

Apply `rules/backend-python.md` and `rules/architecture.md` from EngineOS first (EngineOS
rules — resolved relative to EngineOS's `CLAUDE.md`, the repo/plugin root, not this
project). This skill adds the concrete shapes, taken from a production FastAPI + Pydantic v2 + Azure OpenAI service.

## Feature layout — ports and adapters

```
app/
  main.py                   # composition root: create_app(llm=None, documents=None) builds adapters, injects use cases
  domain/                   # framework-free — stdlib imports only (enforced by a test, see Testing doubles)
    models.py               # frozen dataclasses, tuples not lists
    ports.py                # typing.Protocol per dependency; async for I/O, sync for pure CPU
    errors.py               # DomainError hierarchy, one subclass per failure class
    limits.py               # every size cap in one module
    use_cases/describe.py   # orchestration + transaction boundary; raises domain errors
  adapters/                 # all I/O: azure_llm.py, usage_log.py, repositories
  api/                      # HTTP only: dto.py, routes_<feature>.py, errors.py, auth.py, middleware.py
  normalizers/  prompts/    # pure-CPU implementations of domain ports, top-level packages
  config/settings.py        # pydantic-settings, the only reader of os.environ
tests/conftest.py           # env vars set BEFORE app.main is imported; the fakes live here
```

Agent projects add `graph/`, `agents/`, `tools/` on the adapter side: they may import `domain/`, never `api/`. Constructor injection, no DI container — `create_app` builds every adapter once and parks the use case on `app.state`.

## Building a new endpoint — checklist

1. Schema: `BaseModel` with `model_config = ConfigDict(extra="forbid")`, separate `<Feature>Request` / `<Feature>Response` — boundary validation rule per `rules/backend-python.md`.
2. Router: `@router.post("/x", response_model=XResponse, responses=_RESPONSES)`; body → domain command → `await request.app.state.<use_case>.execute(command)` → response. Nothing else — thin-router rule per `rules/backend-python.md`.
3. Use case in `domain/use_cases/`: business logic; raises `DomainError` subclasses; owns the transaction boundary (`async with session.begin():`) — the repository never commits.
4. Port + adapter: a `Protocol` in `domain/ports.py`; the adapter takes keyword-only args and an injectable `client=None`, raising `ValueError` at construction when neither client nor credentials exist.
5. Response mapping: a `from_result(cls, result)` classmethod on the response schema — tuples become lists here; never the domain object itself.
6. Tests: use-case unit test with an in-memory fake per port; route test through `TestClient(create_app(llm=FakeLLM.returning("text")))` for the happy path and one auth/validation failure.
7. List endpoints: `page`/`limit` (bounded with `le=`) or cursor; never an unbounded `.all()` — defaults per `rules/backend-python.md`.

## Router input — typed schemas, no inline parsing

Bind query and path input to Pydantic models via `Annotated[..., Query()]`. Inline coercion in the route body is prohibited.

```python
# NO — inline parsing, magic defaults, unknown fields silently accepted
@router.get("/orders")
async def list_orders(page: str = "1", limit: str = "20"):
    page_n = int(page) if page.isdigit() else 1

# YES — the schema carries defaults, bounds and OpenAPI docs; the router stays thin
class OrderListQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    status: OrderStatus | None = None

@router.get("/orders", response_model=OrderPage)
async def list_orders(query: Annotated[OrderListQuery, Query()], request: Request) -> OrderPage:
    return OrderPage.from_result(await request.app.state.list_orders.execute(query.page, query.limit, query.status))
```
- No `int(...)` / `.split(...)` on request values in a route — bounds and coercion live on the schema.
- `response_model` on every route; a route returning a domain dataclass or ORM row is a defect.

## Codegen

None. There is no MCP or generator for this stack: write the files by hand following the layout above. Do not reach for the `nestjs` MCP tools on a Python package.

## Common team decisions (defaults)

- Errors: `register_error_handlers(app)` maps each `DomainError` subclass, `RequestValidationError` and a catch-all `Exception` to one shape `{statusCode, code, message, correlationId}`; `code` is a **closed** set clients switch on (`invalid_request`, `auth_invalid_token`, `llm_unavailable`, …). Upstream error text never leaves the server.
- Auth: `principal: Principal = Depends(current_principal)` decodes the JWT (HS256, `require: ["exp"]`); the tenant comes from the token claim only — a tenant id in the body is ignored.
- Queues: arq or Celery; one task module per queue; every job idempotent via a dedupe key stored with the job.
- Settings: `pydantic_settings.BaseSettings` with `env_prefix`, `extra="forbid"`, `SecretStr` for every credential and **no defaults** for them; a model-level validator (not a field validator) for secret sanity so `input_value=` cannot print the secret; a validator that fails startup on unknown `PREFIX_*` variables. `@lru_cache get_settings()` is the only reader of `os.environ`.
- Logging: stdlib `logging` with a named hierarchy (`<service>.api`, `<service>.usage`); one structured JSON usage line per LLM call (tenant, model, tokens, `durationMs`, `correlationId`, `promptVersion`, `outcome`) emitted in the use case's `finally`, so failures are metered too. Correlation-id middleware honours the inbound header, truncated to 64 chars.
- Health: `/healthz` liveness (process up) and `/readyz` readiness (`app.state.ready`, 503 until then) — neither makes a provider round-trip.
- Structured output (design §D10): every JSON the model returns is validated with Pydantic; one retry carrying the validation error as feedback; no regex-and-defaults parsing.
  ```python
  feedback = ""
  for _attempt in range(MAX_VALIDATION_RETRIES + 1):  # 1, from limits.py
      raw = await self._llm.generate(build_prompt(records, feedback), n_variants=1)
      try:
          return Batch.model_validate_json(raw.texts[0])
      except ValidationError as exc:
          feedback = f"\n\nYour previous answer failed validation:\n{exc}\nReturn the complete JSON again."
  raise GenerationFailedError(f"output not valid after {MAX_VALIDATION_RETRIES + 1} attempts")
  ```

## Testing doubles — dataclass fakes over mocks

`tests/conftest.py` sets every `PREFIX_*` variable **before** importing `app.main` (the composition root reads settings at import; a missing variable must fail collection, not one test). Fakes are `@dataclass` classes implementing the port `Protocol`, shipped in `conftest.py`, with a `.returning(*texts)` factory and a `calls` list. SDK clients are stubbed with `types.SimpleNamespace` and the adapter test asserts the exact kwargs sent, and that the API key never appears in `str(exc)`. Tests read as sentences and cite the spec section in the module docstring. **No test calls the provider.**

```python
@dataclass
class FakeLLM:
    results: list[LLMResult] = field(default_factory=list)
    calls: list[tuple] = field(default_factory=list)

    @classmethod
    def returning(cls, *texts: str) -> "FakeLLM":
        return cls(results=[LLMResult(texts=tuple(texts), model="test-model")])

    async def generate(self, prompt, n_variants: int) -> LLMResult:
        self.calls.append((prompt, n_variants))
        return self.results[min(len(self.calls) - 1, len(self.results) - 1)]  # last result repeats
```

Import purity (design §D12) is a test, not a review comment — `tests/unit/test_import_purity.py`:

```python
def imports_of(path: Path) -> list[str]:
    tree = ast.parse(path.read_text())
    return [(n.module or ".") if isinstance(n, ast.ImportFrom) else n.names[0].name
            for n in ast.walk(tree) if isinstance(n, ast.Import | ast.ImportFrom)]

def test_the_domain_imports_only_the_stdlib_and_itself():
    for path in Path("app/domain").rglob("*.py"):
        for name in imports_of(path):
            assert name.split(".")[0] in sys.stdlib_module_names or name.startswith(("app.domain", ".")), f"{path} imports {name}"

@pytest.mark.parametrize("package", ["adapters", "graph", "agents", "tools"])
def test_the_adapter_side_never_imports_the_api_package(package):
    for path in Path("app", package).rglob("*.py"):
        assert not any(name.startswith("app.api") for name in imports_of(path)), f"{path} imports app.api"
```

## HTTP integration tests — `TestClient` / `httpx.AsyncClient`

Route tests go through the app factory, never a running server: a `client` fixture yielding `TestClient(create_app(llm=fake_llm), raise_server_exceptions=False)` for sync tests; `httpx.AsyncClient(transport=ASGITransport(app=create_app(llm=fake_llm)), base_url="http://test")` when the test itself must `await`. Mint bearer tokens with a `make_token(company="acme", ttl_seconds=-1)` helper — never a hardcoded token. Assert on `status_code`, the `code` field and `X-Correlation-Id`, not on message prose.

## Alembic (when the project uses a relational database)

- SQLAlchemy 2.0 `Mapped[]` models; `MetaData(naming_convention=...)` so constraints get deterministic names.
- One migration per change: `alembic revision --autogenerate -m "<module>-<change>"`, reviewed by hand before commit; never edit an applied migration.
- Migration safety (expand/contract, backfills, locks) lives in `rules/data.md`.

## Anti-patterns to flag in existing code

- Business logic in a router → move to a use case.
- Domain dataclass or ORM row returned from a route → add a response schema with `from_result`.
- `os.environ` outside `config/settings.py` → move to settings.
- Unbounded `.all()` / `scalars().all()` on a list route → paginate.
- `asyncio.gather` over a user-sized list → bound it with a `Semaphore` or a cap from `limits.py`.
- Bare `except:` / `except Exception: pass` → catch the SDK's error class, raise one domain error.
- Mutable default arguments → `field(default_factory=...)` or `None`.
- Sync I/O (`requests`, `time.sleep`, a blocking driver) in an `async def` route → async client or `asyncio.to_thread`.
- `Optional[X]` where the project writes `X | None` → one idiom per project.
- A magic string shared across modules as a literal → one constant in one module.
- Regex-and-defaults parsing of model JSON → Pydantic validation with retry-with-feedback (above).

## Tooling — `pyproject.toml` and the Stop gate

```toml
[project.optional-dependencies]
dev = ["ruff==0.6.9", "pyright==1.1.385", "pytest==8.3.3", "pytest-asyncio==0.24.0", "httpx==0.27.2"]  # exact pins, bumped deliberately

[tool.ruff]
line-length = 120
[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
ignore = ["B008"]  # `Depends(...)` in a default argument is the FastAPI DI idiom, not a shared mutable default
[tool.ruff.format]
quote-style = "double"

[tool.pyright]
typeCheckingMode = "basic"
reportOptionalMemberAccess = "error"

[tool.pytest.ini_options]
asyncio_mode = "auto"
pythonpath = ["."]
markers = ["eval: golden-set evals, run with `pytest -m eval`"]
```

Lockfile committed (`uv.lock` or `requirements.lock`); `.env.example` tracked; `.env`, `.env.*` and `*payloads*.json` ignored. The Stop gate runs three commands per Python package and blocks once on a failure — `ruff check . && ruff format --check .`, `pyright`, `pytest -q` (tests per `rules/verification.md`); an unpinned tool gets an advisory line, not a pass.
