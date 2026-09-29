# Python stack + agent-system design gate — design

*Status: draft for developer review · 2026-09-28 · Sergio Hermsdorff (owner), spec drafted with Claude*
*Grounding: `labv-assist` (ports-and-adapters FastAPI service, built under EngineOS, audited 2026-09-04) and `labv-opensearch-agent-demo` (LangGraph agent over OpenSearch). Where the two disagree, labv-assist wins on hygiene and the demo wins on agent mechanics.*

## Vocabulary

| Word | Means |
|---|---|
| **developer** | The person driving Claude Code with EngineOS installed. Every approval in this spec is the developer's, given inside the Claude session and recorded in the change record. |
| **user** | The person who uses the product being built. Never the one approving Claude's design. |
| **Claude** | The model executing under the constitution. It proposes; the developer decides. |
| **stack** | The language/framework set a package is built with (`node`, `python`), resolved per package directory. |

## 1. Problem

EngineOS is stack-specific where it claims to be stack-agnostic, and it has no
design gate for multi-agent systems.

**Stack.** The runtime layer only knows JavaScript. `src/hooks/stop-verify.ts`
runs `lint`/`typecheck` as `package.json` scripts through npm/pnpm/yarn/Nx and
counts only `ts|tsx|js|jsx` edits (`src/hooks/verify-targets.ts:17`); in a
Python-only repo it returns silently, so non-negotiable #2 ("the final gate")
never fires. `registries/routing.json` has no `.py` pattern: `app/routers/users.py`
routes nowhere and `test_users.py` misses the test row. `registries/intents.json`
has no Python framework signal — "fix the Django view" resolves to nothing.
The prose layer has zero Python mentions: `rules/backend.md`, `rules/frontend.md`
and `rules/production-backend-standards.md` are NestJS/React vocabulary, the
always-on `rules/base.md` carries a TypeScript idioms block, `skills/nestjs-patterns`
and `skills/react-patterns` are framework guides, `eval-harness` and
`llm-engineering` assume zod/tsx/npm, `qa-tester` boots via npm scripts,
`templates/project-claude.md` ships `npm run` commands. The audit EngineOS ran on
labv-assist (2026-09-04) was good — but the Stop gate that would have caught
"no lint, no typecheck, no lockfile" never ran, because the repo is Python.

**Agents.** Seven of the developer's eight Python repos are LLM products and one is
a multi-agent LangGraph system. Nothing in EngineOS makes a new project stop and
design its agent topology before code: which pattern, which agents, what each one
is allowed to see, how they talk, what they remember, what bounds the loop, which
tools with which context. The demo's orchestration is bespoke to one product; the
mechanisms that made it work (per-tenant profiles, a three-layer index context
feeding the search tool, bounded self-repair, preview-vs-handoff envelopes) are
not written down anywhere reusable.

## 2. Decisions taken (developer, 2026-09-28)

| # | Decision | Choice | Consequence |
|---|---|---|---|
| D1 | Branch or upstream | Branch on the developer's clone first; PR to upstream after approval | Public-surface changes follow `docs/COMPATIBILITY.md` so the PR is mergeable |
| D2 | Python baseline tooling | `ruff` (lint + format check), `pyright` (typecheck), `pytest` (tests) — **all pinned to exact versions** in the project's dev dependencies | Three verify targets, mirroring the Node trio; a lockfile is required (labv-assist audit finding) |
| D3 | Runner cascade | `.venv/bin/<tool>` → `uv run <tool>` when `uv.lock` exists → `docker compose exec <service>` when declared → skip with a visible message | Prefers the venv because both labv repos run tests from a local venv; a lockfile is a hint, not the truth (the demo's `uv.lock` is stale) |
| D4 | Framework scope | FastAPI only; Django/Flask deferred | All five Python backends are FastAPI + Pydantic v2 |
| D5 | `production-backend-standards.md` | Removed from the shared backend row via the deprecation window | It is a company overlay (`@coresoft-sas/*`), contradicts PEP 8 (`no snake_case`), and is loaded by `CLAUDE.md` but not by `routing.json` (drift) |
| D6 | Layout | Ports and adapters (labv-assist): framework-free `domain/` with `Protocol` ports, frozen dataclasses, `DomainError` hierarchy, `limits.py`, `use_cases/`; I/O in `adapters/`; HTTP in `api/`; pure-CPU implementations as top-level packages; one composition root in `main.py`; constructor injection, no DI container | For agent projects `graph/`, `agents/`, `tools/` sit on the adapter side and never import `api/` |
| D7 | Identifier language | English for code, comments, logs, tests, commits; product content bilingual in `{"en": …, "de": …}` dicts | Portuguese never appears in code |
| D8 | Orchestration shape | Linear pipeline with ≤1 corrective retry → plain `async` use case. Tool-using loop → LangGraph, with the demo's conventions | Two shapes, chosen by the work, both documented |
| D9 | Provider port | Domain: a `Protocol` with one `async generate` returning a frozen result (texts, tokens, finish reasons); adapter with injectable client, 12 s timeout, SDK-managed retries, one domain error, key never in an error string. Graph: the LangChain chat model is the port, built per role from a profile. Azure OpenAI only, `base_url` escape hatch | LangChain stays out of `domain/` |
| D10 | Structured output | Every JSON the model returns is validated with Pydantic; on validation failure, one retry carrying the validation error as feedback (Nexxus shape). No regex-and-defaults parsing | Verdicts, classifications, DSL all typed |
| D11 | Prompts | Python modules, `UPPER_SNAKE` constants, `str.format`, builder functions; `PROMPT_VERSION` constant stamped into every usage record; synthetic-only few-shots; unescapable data fence; task line last; three test kinds (fence-escape probe, no-customer-string denylist, version pin); tool prompt blocks feature-flagged together with tool registration | Not files |
| D12 | Import purity | A pytest test walks `domain/` and fails on any non-stdlib import; a second one asserts `graph/`, `agents/`, `tools/` never import `api/` | No new tool needed |
| D13 | Evals | pytest golden sets (per tool: question → query; per agent: task packet → output contract; one end-to-end), no test calls the provider; runtime evaluator node + deterministic grounding check are the only in-product scoring | The Python eval-harness scaffolds exactly this |
| D14 | Multi-agent design gate | Interactive, 12-step form between Claude and the developer; every step waits for the developer's answer; two Mermaid diagrams reviewed before any code; approval recorded under `## Human decisions` | Claude never chooses a topology on its own |
| D15 | Pattern catalog | Ten patterns (two extracted from the labv repos + eight new) plus two cross-cutting references (context-enriched tools, tenant profiles) | Offered to the developer at step 1 of the form, with a recommendation, never applied automatically |
| D16 | Tools step | Its own step (step 3), eight sub-decisions per tool, the longest step by design | "The most important feature" — the demo's results come mostly from this layer |
| D17 | Runtime approval interrupt | A catalog pattern the developer may pick when the *product* needs its *user* to confirm an action. Not the gate | Keeps developer approval and product HITL separate |
| D18 | Git writes | Per-developer setting `ENGINEOS_GIT_WRITES=ask\|auto` (personal, in `settings.local.json`), **default `ask`**: every git/forge command that writes (commit, push, add, branch, checkout, merge, rebase, reset, stash, tag, `gh pr create/merge`, …) is turned into a permission prompt by a PreToolUse hook; read-only git needs no prompt; the guard survives `/engineos:bypass` | Sergio: `ask`; Ricardo: `auto` (set in his local settings). Flagged for upstream review because the default changes his experience |

## 3. Part A — Python stack

### A1. Verification gate runner (`src/hooks/`)

Extend, do not fork, `stop-verify`. Today: transcript → changed files → filter by
extension → walk up to the nearest `package.json`/`project.json` → pick runner →
run `lint`/`typecheck` (+`test` when on) with a budget → classify failure → block once.

Changes, each additive:

1. **Package markers** gain `pyproject.toml` (and `requirements.txt` as a weaker
   marker only when no `pyproject.toml` sits above it). A directory may hold both a
   `package.json` and a `pyproject.toml` (labv-opensearch-agent-demo root);
   each resolves to its own runner, and both run.
2. **Verify extensions** gain `py` (and `pyi`). The existing per-package grouping
   walks Python files up to their marker exactly as it does for TS.
3. **A Python runner** (`src/hooks/runner-python.ts`) implements the same
   `RunnerSelection` contract as the npm-family/Nx runner: `select(packageDir)`,
   `hasTarget(target)`, `run(target, budget)`. Targets and the commands they map to:

   | Target | Command | "exists" check |
   |---|---|---|
   | `lint` | `ruff check <dir>` then `ruff format --check <dir>` | `[tool.ruff]` in `pyproject.toml` **or** `ruff` resolvable in the chosen environment |
   | `typecheck` | `pyright <dir>` | `[tool.pyright]` in `pyproject.toml` **or** `pyright` resolvable |
   | `test` | `pytest -q <dir>` (only when `ENGINEOS_VERIFY_TESTS=1` or tests in scope — unchanged policy) | `[tool.pytest.ini_options]` or `pytest.ini`/`conftest.py` **or** `pytest` resolvable |

   Environment resolution (D3), first hit wins, resolved once per package dir and
   cached for the session:
   `<pkg>/.venv/bin/` → `<repo>/.venv/bin/` → `uv run --directory <pkg>` when
   `uv.lock` is present → `docker compose exec <service>` when
   `.engineos/config.json` declares `stack.python.compose_service` → **skip**, with
   the visible message `[engineos] stop-verify skipped for <pkg>: no Python environment found (venv, uv or compose)`.
   A target that resolves to no environment is *skipped*, never *failed*; the
   Stop gate stays honest about what it did not run, the same way the Node runner
   treats a missing script.
4. **Failure classification** gains Python signatures: `No module named` and
   `command not found: ruff|pyright|pytest` are `infra` (message, no block);
   ruff/pyright diagnostics and pytest failures are `verify` (block once).
5. **Budget**: 90 s per target, 180 s for tests — unchanged. Pyright's first run
   in a large repo can exceed 90 s; the runner passes `--threads` where supported
   and the budget is a setting (`ENGINEOS_VERIFY_BUDGET_S`), not a new constant.
6. **Pinned versions** (D2): the runner does not install anything. If a tool's
   version is not pinned in the package's dev dependencies, the gate emits a
   one-line advisory (`ruff is not pinned; rules/verification.md requires exact versions`)
   and still runs. The `python-patterns` skill and `init --stack fastapi` write
   pinned versions; the advisory catches drift.

`post-edit-check.ts` (unwired, opt-in) gets the same runner for parity; no new
wiring.

### A2. Stack resolution

Today there is no notion of stack; the gate assumes Node. This introduces one,
resolved per package directory, explicit first and detected second:

1. **Explicit**: `.engineos/config.json` (new, written by `init-project.sh`)
   ```json
   { "version": 1, "stack": { "python": { "framework": "fastapi", "compose_service": null }, "node": { "framework": "react" } } }
   ```
   `init-project.sh --stack fastapi,react` writes it; `--stack auto` (default)
   writes what detection found, so the file is always present after init and the
   developer can edit it.
2. **Detected**: `pyproject.toml`/`requirements.txt` → `python`; `package.json` →
   `node`. Framework from the dependency list: `fastapi`/`django`/`flask`;
   `next`/`react`/`@nestjs/core`. Detection runs per package dir and a repo may
   resolve to several stacks.
3. **Fallback**: no manifest → no gate, with a visible message.

The resolved stack feeds: the runner (A1), the routing domain set (A3), the
coordinator's skill pick (A6), `qa-tester`'s boot command (A6), the starter
`CLAUDE.md` block (A6), and one SessionStart line:
`[engineos] stack: fastapi (backend/) + react (frontend/) · runners: ruff/pyright/pytest · eslint/tsc`.

`scripts/kernel.sh resolve-stack <dir>` exposes it (new kernel verb, same
envelope as `route-path`), so hooks, `init` and the coordinators read one answer.

### A3. Routing and intents

`registries/routing.json` — additive:

- New domain **`backend-python`**, precedence right after `dba` (so `*/alembic/versions/*` and `*.sql` keep routing to `dba`):
  `paths: ["*/routers/*.py", "*/api/*.py", "*/services/*.py", "*/use_cases/*.py", "*/adapters/*.py", "*/domain/*.py", "*/repositories/*.py"]`,
  `basenames: ["schemas.py", "models.py", "ports.py", "main.py", "dependencies.py", "settings.py"]`;
  rules `backend-python, architecture, data, testing, observability`; skill
  `python-patterns`; agent `backend-coordinator`; `sample_path: /tmp/api/app/routers/users.py`.
- **`test`** basenames gain `test_*.py`, `*_test.py`, `conftest.py`.
- **`dba`** paths gain `*/alembic/versions/*`.
- **`llm`** paths gain `*/graph/*`, `*/agents/*`, `*/tools/*` (Python agent
  projects), basenames gain `*_agent.py`, `workflow.py`, `state.py`,
  `nodes.py`, `prompts_*.py`. `llm` stays last in precedence, so a
  `tools/search.py` under `app/` routes to `llm`, not `backend-python`
  (`*/tools/*` is not a backend-python glob on purpose).
- **`security`** basenames gain `auth.py`, `guardrails.py`, `*_credentials.py`.
- `excluded.basenames` gain `uv.lock`, `poetry.lock`.

`registries/intents.json`:

- `backend` signals gain `FastAPI`, `router`, `endpoint`, `Pydantic`, `SQLAlchemy`,
  `Alembic`; `title` becomes "Backend work (NestJS or FastAPI)".
- `llm` signals gain `LangGraph`, `LangChain`, `orchestrat`, `supervisor`,
  `multi-agent`, `agent-to-agent`, `A2A`.
- New intent **`agent-system`** (Part B): signals `multi-agent`, `agents that`,
  `orchestrat`, `supervisor`, `agent topology`, `LangGraph`, `A2A`,
  `handoff between agents`; rules `llm-apps`; skill `agent-system-design`;
  agents `llm-coordinator`; `model_tier: design`; `risk_floor: medium`;
  `hook_mirrored: false`.

`CLAUDE.md` router table and `AGENTS.md` mirror every row above (the validator
fails otherwise). `docs/COMPATIBILITY.md`: all additions are additive surface;
D5 is a deprecation and follows the window.

### A4. Rules

- **New `rules/backend-python.md`** — mirrors `backend.md`'s section order with
  the labv-assist mechanisms: layout (D6); Pydantic v2 schemas with
  `extra="forbid"` as the whitelist, separate In/Out models, `response_model` on
  every route, never the ORM/domain object; typed query binding via `Annotated`;
  transaction boundary in the use case, repository never commits; the global
  exception handler producing `{statusCode, code, message, correlationId}` with
  a **closed** set of `code` values clients switch on; `Depends` for auth and
  settings, use case pulled from `app.state` at the composition root; queues
  (Celery/arq) idempotent by dedupe key; **fail-closed settings** (pydantic-settings,
  env prefix, `extra="forbid"`, `SecretStr`, required with no defaults,
  model-level validators so `input_value` never prints a secret, unknown-prefixed
  env vars fail startup); `/healthz` liveness vs `/readyz` readiness with no
  provider round-trip; lifespan for pool shutdown; correlation-id middleware,
  inbound header honoured and truncated; stdlib `logging` with a named hierarchy
  and one structured JSON usage line per LLM call, metered in `finally`;
  Alembic with a pointer to `data.md`; `Protocol`-based in-memory fakes over
  `MagicMock`; keyword-only args on adapters; injectable `client=None` with
  fail-fast `ValueError`; frozen dataclasses and tuples in the domain; warnings
  as a first-class response channel; degrade-don't-fail for optional features.
  Anti-patterns: business logic in routes, domain objects in responses,
  `os.environ` outside settings, unbounded `.all()`, `asyncio.gather` over
  user-sized lists, bare `except:`, mutable default args, sync I/O in async
  routes, `Optional[X]` where `X | None` is the project idiom, magic strings
  shared across modules as literals.
- **`rules/base.md`** — add a "Language idioms (Python)" block beside the
  TypeScript one: type hints everywhere, `X | None`, no `Any` at boundaries,
  `Literal` unions, PEP 8 names, `from __future__ import annotations` only when
  needed, `typing.Protocol` for ports, frozen dataclasses for domain values,
  Pydantic only at boundaries. The TypeScript block is unchanged.
- **`rules/security.md`** — `npm audit` line becomes "`npm audit` / `pip-audit`
  (or `uv audit`) / dependabot"; the postinstall line adds "and `setup.py`
  build hooks".
- **`rules/llm-apps.md`** — "zod/JSON Schema" becomes "zod / Pydantic / JSON
  Schema"; adds the D10 rule (validate-then-retry-with-feedback) and names the
  three prompt tests (D11) as required for any prompt that carries customer data.
- **`rules/verification.md`** — "lint + typecheck" wording unchanged; adds a
  per-stack table (Node: `lint`/`typecheck` scripts; Python: ruff, pyright,
  pytest), the pinned-version requirement (D2), and the runner cascade (D3).
  The sentence "the automated Stop-gate half covers JS/TS-family packages only"
  in `CLAUDE.md` non-negotiable #2 is corrected.
- **`rules/backend.md`** — title gains "(NestJS)"; no other change. The
  `production-backend-standards.md` load is removed from the backend row (D5);
  the file gains a deprecation header pointing to project `CLAUDE.md` as its new
  home, and is deleted at the end of the window.

### A5. Skills

- **New `skills/python-patterns`** — mirrors the ten sections of
  `nestjs-patterns`, one for one:
  1. Layout tree (D6, with the agent-project extension).
  2. New-endpoint checklist, seven steps (schema → thin router → use case with
     domain errors and transaction boundary → port + adapter → response mapping
     → tests (use-case unit with in-memory fake, route test through
     `TestClient` over `create_app(llm=FakeLLM)`) → pagination).
  3. Router input: typed schemas, no inline parsing — NO/YES example.
  4. Codegen: none (no MCP); the section says so rather than being absent.
  5. Common team decisions: the exception handler, `Depends(current_principal)`
     from JWT (tenant from the token only), queues, pydantic-settings, logging,
     `/healthz` + `/readyz`.
  6. Testing doubles: `conftest.py` sets env vars *before* importing `app.main`;
     dataclass fakes with a `.returning(*texts)` factory; `SimpleNamespace`
     stubs for SDK clients; tests read as sentences and cite the spec section.
  7. HTTP integration tests: `httpx.AsyncClient` against the app factory.
  8. Alembic: naming, one migration per change, pointer to `data.md`.
  9. Anti-patterns (from A4).
  10. Tooling block: `pyproject.toml` `[tool.ruff]` (`E,F,I,UP,B`, line 120,
      `B008` ignored with the FastAPI comment), `[tool.pyright]` (`strict` off,
      `reportOptionalMemberAccess` on), `[tool.pytest.ini_options]`
      (`asyncio_mode="auto"`), dev deps pinned, `uv.lock` or `requirements.lock`
      committed, `.env.example` tracked, `.env` and `*payloads*.json` ignored.
- **New `skills/langgraph-patterns`** — the demo's mechanics as shapes:
  state (`TypedDict`, `add_messages` the only reducer, everything else
  replace-on-write and `NotRequired`, state serializable, per-request objects in
  `config["configurable"]`); node factories returning async closures; a custom
  tool executor with `asyncio.gather`, not `ToolNode`/`create_react_agent`;
  wiring with `START`/`END` and conditional edges; no checkpointer, a custom
  store re-seeds artifacts and last-data; iteration cap **+** `recursion_limit`
  **+** `asyncio.wait_for`; evaluator node returning a Pydantic verdict (D10)
  with a bounded retry whose guard is mirrored in the routing function; per-role
  models from a profile with `nostream` tags on internal calls; streaming through
  an `asyncio.Queue`-backed run, only the narrator streams tokens; graph compiled
  once per `(profile, tenant)` behind a double-checked `asyncio.Lock`;
  summary-buffer memory saved via `asyncio.to_thread`; session storage key
  `company__user__profile__session`, never the raw client id; protocol
  constants (`RETRY_PREFIX`, `ARTIFACT_STORED`, `CHART_CONFIG`, `LAST_SEARCH`)
  in **one** module. Anti-patterns to flag: upward imports from `graph/` into
  `api/`, deferred imports to break cycles, magic strings repeated across
  modules, `print()` in library code, `Optional[]`/`X | None` mixed, manifests
  that disagree (`pyproject` vs `requirements.txt`).
- **`skills/eval-harness`** — parametrized by stack: Python variant scaffolds
  `tests/evals/<feature>/{golden.jsonl, test_golden.py, judge.py}` runnable with
  `pytest -m eval`, Pydantic output schema, `asyncio` concurrency with a
  semaphore; `references/retrieval-metrics.md` gains a Python block.
- **`skills/llm-engineering`** — "zod" → "Pydantic", `prompts/<feature>.py`,
  `pytest -m eval`; adds the D11 prompt rules and the D10 structured-output rule.
- **`skills/record-change`, `retro`, `adr`, `release-notes`, `strategy`,
  `task-observer`** — unchanged (already agnostic).

### A6. Agents and templates

- **`agents/backend-coordinator.md`** — description "NestJS or FastAPI backend";
  method step 0 reads the resolved stack (`kernel.sh resolve-stack`) and loads
  `nestjs-patterns` or `python-patterns` accordingly; the `mcp__nestjs` tool
  stays listed and is used only on the Node stack.
- **`agents/qa-tester.md`** — boot detection: `Makefile` targets → `uv run` →
  `docker compose up` → npm script; endpoint discovery adds `/openapi.json`
  route inspection of FastAPI `APIRouter`s; Newman stays the runner (it is
  stack-neutral).
- **`agents/architecture-analyst.md`** — manifest list gains `pyproject.toml`,
  `requirements*.txt`, `alembic.ini`, `uv.lock`.
- **`agents/security-reviewer.md`** — "DTO whitelists, `forbidNonWhitelisted`"
  becomes "DTO/schema whitelists (`forbidNonWhitelisted`, `extra=\"forbid\"`)";
  `npm audit` line as in A4.
- **`templates/project-claude.md`** — stack block and commands generated from
  the resolved stack by `init`; a Python variant
  (`templates/project-claude-python.md`) ships:
  `ruff check . && ruff format --check .`, `pyright`, `pytest`,
  `uvicorn app.main:app --reload` (or `fastapi dev`), Alembic in place of
  TypeORM. `init --stack fastapi,react` concatenates both blocks.
- **`templates/permissions.template.json`** — adds `Bash(python --version:*)`,
  `Bash(uv --version:*)`, `Bash(ruff --version:*)`, `Bash(pyright --version:*)`,
  `Bash(pip list:*)`; all read-only.
- **`templates/github/claude-security.yml`** — path triggers add
  `pyproject.toml`, `requirements*.txt`, `uv.lock`, `**/auth*.py`,
  `**/guardrails*.py`, `**/routers/**`, `**/dependencies/**`.
- **`templates/mcp.template.json`** — unchanged (no Python MCP in the baseline
  yet; `nestjs` stays).

### A7. Self-integrity

`scripts/validate-engineos.sh` gains: C17 fixtures for the new domains
(`sample_path` self-validation already exists); a check that every
`routing.json` domain's `rules` are mirrored in the `CLAUDE.md` row (exists;
new rows included); a check that `rules/verification.md`'s per-stack table names
exactly the targets `stop-verify` knows. `src/hooks/runner-python.test.ts` and an
e2e over a fixture Python package (`test/fixtures/py-fastapi/`) join `npm test`.

## 4. Part B — Agent-system design gate

### B1. Trigger

`registries/decision-rules.json` gains:

```json
{
  "id": "rule-multi-agent-design",
  "priority": 85,
  "source": "docs/specs/2026-09-28-python-stack-and-agent-design-design.md §4",
  "when": { "multi_agent_system": true },
  "then": { "require": ["agent-topology-spec", "mermaid-workflow", "developer-approval"], "gate": "design" },
  "signals": [
    "\\b(multi[- ]?agent|agents? (that|which) (talk|hand ?off|coordinate)|supervisor agent|agent topology|orchestrat(e|ion|or) .{0,30}agents?)\\b",
    "\\b(langgraph|a2a|agent[- ]to[- ]agent)\\b"
  ]
}
```

`registries/policy.json` `hitl.reasons` gains **`topology-approval`** (additive;
C26 couples the list to the kernel's emission order and the prose in
`rules/risk-autonomy.md`, all three are updated together; ADR
`docs/adr/2026-09-28-topology-approval-hitl-reason.md` records it). The kernel
emits it when `rule-multi-agent-design` matches, so the prompt advisor announces
"human-in-the-loop required — reasons: topology-approval" and the record home is
the change record's `## Human decisions`.

Enforcement level: the same as spec-before-code today — a contract requirement
the prompt advisor injects and the change record must satisfy. A hook that blocks
`Write` under `graph/` until the record carries an approval line is a follow-up,
not part of this change (see §8).

### B2. The form (skill `agent-system-design`, command `/engineos:design-agents`)

Interactive. Claude asks **one step at a time**, offers options with trade-offs and
a recommendation grounded in the answers so far, and **waits for the developer**.
Nothing is filled in by default. The answers are written into the spec (B3) as
they are given, so an interrupted session resumes from the file.

| Step | Decision | Output in the spec |
|---|---|---|
| 1 | **Topology** — pick from the catalog (B4), or a combination | Pattern id(s) + why |
| 2 | **Agent roster** — per agent: purpose, model role, what it must never see | Roster table |
| 3 | **Tools** — per tool, the eight sub-decisions below | Tool contract table + context table |
| 4 | **Communication protocol** — shared graph state · typed message envelopes · network protocol (A2A) for agents in different services; sync/async | Protocol section |
| 5 | **Context scoping** — per agent, a typed *task packet*: inputs, constraints, budget, output contract. The agent gets its task, not the whole picture | One Pydantic model per agent, in the spec |
| 6 | **Memory per agent** — none · summary buffer · store; per session/user/tenant; what survives a turn | Memory table |
| 7 | **Harness** — entry point, iteration cap, recursion limit, wall-clock timeout, retry budget, token/cost budget, evaluator | Harness table |
| 8 | **Guardrails** — tenant scoping, per-agent tool allowlist, input/output sanitization | Guardrail list |
| 9 | **Failure policy** — degrade-to-warning vs fail-the-run per agent; fallback agent | Policy table |
| 10 | **Observability** — run/correlation ids, per-agent traces, token accounting per role | Observability section |
| 11 | **Evals** — golden set per tool, per agent, and one end-to-end, before the first real run | Eval plan |
| 12 | **Diagram review** — flowchart (nodes, conditional edges) and sequence diagram (one sample run: what each agent receives and returns) rendered, developer approves | Two Mermaid blocks + the approval line |

**Step 3 — tools**, per tool (the longest step by design):

1. **Inventory** — name (`PascalCaseTool`), purpose, Pydantic input schema whose
   every `Field(description=…)` carries usage guidance, output envelope
   (`_result` preview for the model, `_handoff_result` server-side), and the
   agents allowed to call it.
2. **Dependencies** — which tool must run first, and where the rule is stated
   (tool description + the prompt block that is registered with the tool behind
   one feature flag).
3. **Context the tool needs before acting** — which of the three layers apply:
   *semantic layer* (curated data model: naming, lookup fields, join keys),
   *curated context* (per-index field descriptions, gotchas, aggregation fields;
   default file + per-tenant overlay with declared merge rules: union / override
   by key / concatenate), *machine facts* (live enums with counts, doc counts,
   field paths discovered by sampling; gitignored; refreshed by a scheduler;
   write-guarded: minimum entities, maximum field-loss ratio; facts win on
   mechanical claims; contradictions against curated text reported). Who owns
   each layer, how often the machine layer refreshes, and **where** the context
   is injected (into the tool's own sub-agent prompt, never into the router).
   Default for a retrieval tool: all three.
4. **Internal reasoning** — whether the tool embeds its own model call (e.g. a
   DSL agent), which role it uses, and the self-repair budget (previous attempt +
   error fed back, N attempts, then a typed failure).
5. **Errors and limits** — typed error codes (`ERROR_<REASON>`), hints appended
   on empty results, response size cap that tells the model to **replan**, not a
   silent truncation.
6. **Memory of prior calls** — memo key (`index::question`), handoff sentinel
   (`LAST_SEARCH`), and the guard that keeps a small lookup from overwriting
   derived data in the same turn.
7. **Scoping** — tenant baked in at construction (closures/factories over
   tenant-restricted credentials), fail-closed guardrails on anything the model
   generates (filter injection, forbidden clauses, index prefix), server-side
   override of any model-supplied session id.
8. **Evals** — golden question → query pairs; the curated-vs-facts contradiction
   check as a test.

### B3. Spec template (`templates/agent-topology.md`)

Sections in step order, front-matter `status: draft | approved`, `approved_by`,
`approved_on`, plus two Mermaid blocks. `init --stack fastapi` copies it to
`docs/specs/_agent-topology-template.md`; the form writes
`docs/specs/<date>-<slug>-agent-topology.md`. The change record's `spec:` field
points at it and `## Human decisions` carries
`<date> | <developer> | topology-approval | approved | <spec path>`.

### B4. Pattern catalog (`skills/agent-system-design/references/patterns/`)

One file per pattern, same skeleton: *use when · decisions it forces · LangGraph
shape · failure modes · eval strategy · example from the developer's repos when
one exists*.

| id | Pattern | Origin |
|---|---|---|
| `react-tool-loop` | Single agent, tool loop, evaluator + bounded retry | labv-opensearch-agent-demo |
| `grounded-pipeline` | Normalize → prompt → generate → deterministic ground-check → one corrective regeneration → warnings | labv-assist |
| `supervisor-workers` | One router agent dispatches typed task packets to specialists and assembles their output contracts; decision: does the supervisor see worker reasoning or only outputs | new |
| `typed-pipeline` | Fixed stages, Pydantic in/out per stage, testable stage by stage | portal_nexxus (normalize → rule-classify → LLM-classify) |
| `rule-first-router` | Deterministic classification first, LLM only for the residue | portal_nexxus |
| `evaluator-optimizer` | Generator + critic, standard verdict schema, retry guard mirrored in the routing function | demo (extracted) |
| `fanout-aggregate` | Independent sub-tasks via `Send`, reducer merges/votes; decision: what to do when one branch fails | new |
| `plan-execute-replan` | Planner emits a typed step list, executor runs, replanner revises on failure | new |
| `user-approval-interrupt` | `interrupt()` + `Command(resume=…)` for actions with external effect; **product** pattern (D17) | new |
| `handoff-swarm` | Agents transfer control by explicit handoff tools, no supervisor; the file says when it is *not* the right choice | new |

Cross-cutting references (not patterns, folded into every entry):
`references/context-enriched-tools.md` (the three layers, the registry, the
tool-embedded sub-agent, the envelope, the guards — B2 step 3) and
`references/tenant-profiles.md` (profile resolved from the JWT claim, `${ENV}`
placeholders, per-role model defaults with per-tenant overrides, secret-free
projection for the UI, default + overlay merge rules).

### B5. Mechanics

- `skills/agent-system-design/SKILL.md` — the form (B2), the catalog index, and
  the rule that no step is skipped or defaulted.
- `commands/design-agents.md` — `/engineos:design-agents [resume]`.
- `patterns/3-Agent-topology-interview.md` — the interview procedure, sibling of
  `2-Interview-brainstorm.md`, used by the skill and by `llm-coordinator`
  (alias `hermsdorff`) when the `agent-system` intent matches.
- `registries/intents.json` — `agent-system` (A3); `registries/decision-rules.json`
  and `registries/policy.json` (B1); `registries/capabilities.json` — workflow
  step `design-agent-topology` → `llm-coordinator`.
- `CLAUDE.md` — one router row: "Multi-agent system design (…signals…) →
  `/engineos:design-agents`; skill `agent-system-design`; agent
  `llm-coordinator` in INTERVIEW mode; developer approval required before
  implementation". Mirrored in `AGENTS.md`.
- `rules/llm-apps.md` — one paragraph: any system with more than one agent
  starts at `/engineos:design-agents`; the topology spec is the design-gate
  artifact; the LangGraph skill is loaded only after approval.
- `docs/START.md`, `docs/BIG-PICTURE.md` (request lifecycle gains the topology
  gate branch), `docs/COMPATIBILITY.md` (new public surface listed).

## 5. Part C — Git-write confirmation (developer setting)

The developer, not the constitution, decides whether Claude may write to git on
its own. `rules/git.md` says how to commit; nothing today says *whether Claude may*.

### C1. Setting

`ENGINEOS_GIT_WRITES` = `ask` (default) | `auto`. Personal: set in the developer's
`~/.claude/settings.local.json` `env` block, never in the repo. `ask` means every
git write becomes a permission prompt the developer answers; `auto` restores
today's behaviour. There is no per-repo override — this is about the person, not
the project. `/engineos:bypass` does **not** disable it: the guard is the
developer's own safety net, and turning EngineOS off must not turn it off.

### C2. What counts as a write

Read-only (never prompted): `status`, `log`, `diff`, `show`, `blame`, `branch`
with no args or `--list`/`-a`/`-r`/`--show-current`, `remote -v`/`remote show`,
`rev-parse`, `ls-files`, `check-ignore`, `describe`, `shortlog`, `cat-file`,
`config --get`/`--list`, `merge-base`, `stash list`, `tag` with no args or `-l`.

Everything else asks — including `add`, `fetch`, `checkout`, `switch`,
`commit`, `push`, `pull`, `merge`, `rebase`, `reset`, `restore`, `stash` (other
than `list`), `tag <name>`, `cherry-pick`, `revert`, `branch <name>`/`-d`/`-D`,
`worktree`, `submodule`, `clone`, `init`, `config` writes, and the forge writes
`gh pr create|merge|close|edit`, `gh release *`, `gh repo *`, `gh api` with
`-X POST|PUT|PATCH|DELETE`. An unknown subcommand asks: the set is closed on the
read side, open on the write side.

### C3. Hook

New PreToolUse hook `git-write-guard`, matcher `Bash`, registered in
`hooks/hooks.json` like the others (node shim, `dist/engineos.cjs hook git-write-guard`).
It parses `tool_input.command`: splits on shell operators (`&&`, `||`, `;`, `|`,
newlines, `$(`…`)`), skips leading env assignments and `cd <dir> &&`, and for
every segment whose first word is `git` or `gh` reads the subcommand after global
options (`-C <dir>`, `-c k=v`, `--no-pager`). If any segment is a write and the
setting is `ask`, the hook answers
`{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "[engineos] git write: <subcommand> — ENGINEOS_GIT_WRITES=ask" } }`.
Otherwise it is silent. It never denies: the decision is the developer's, at the
prompt Claude Code shows. `src/hooks/output.ts` gains the `ask` decision kind for
this (the only hook that uses it in this change).

A command the parser cannot understand (unbalanced quotes, heredoc) is treated as
a write when it contains the token `git ` or `gh ` at all — fail closed.

### C4. Prose

`rules/git.md` gains a first section "Who may write" stating the setting and
that, under `ask`, Claude does the file work, stops, and asks with the proposed
commit message; an approval covers one action, never a session. `CLAUDE.md`
non-negotiables gain #12: "Git writes follow the developer's `ENGINEOS_GIT_WRITES`
setting — `rules/git.md`". `docs/START.md` and `docs/ADOPTION.md` show the
`settings.local.json` snippet. `templates/permissions.template.json` is
unchanged (it already lists only read-only git).

### C5. Tests

`src/hooks/git-write-guard.test.ts`: the read-only list passes silently; each
write subcommand asks; compound commands (`git status && git commit -m x`) ask;
`-C`/`-c` prefixes are skipped; `gh pr create` asks; `auto` is silent on
everything; bypass on + `ask` still asks; an unparsable command asks.
`evals/*.jsonl` gains no case (no intent involved).

## 6. Scope

**Runtime (`src/`)**: `hooks/stop-verify.ts`, `hooks/verify-targets.ts`,
`hooks/runner.ts` (interface extraction), new `hooks/runner-python.ts`,
`hooks/classify-failure.ts`, `hooks/post-edit-check.ts`, `hooks/ensure-project-layout.ts`
(stack line), new `kernel/stack.ts` + `kernel.sh resolve-stack`, `init/project.ts`
(`--stack`, `config.json`), `registry/*.ts` loaders for the new fields,
`checks/*.ts` additions, new `hooks/git-write-guard.ts` + `output.ts` `ask` kind +
`hooks/hooks.json` Bash entry (Part C), tests for each.

**Registries**: `routing.json`, `intents.json`, `decision-rules.json`,
`policy.json`, `capabilities.json`, `layout-manifest.json` (`.engineos/config.json`).

**Prose**: new `rules/backend-python.md`; edits to `base.md`, `security.md`,
`llm-apps.md`, `verification.md`, `backend.md`, `git.md` (Part C); deprecation header on
`production-backend-standards.md`; new `skills/python-patterns`,
`skills/langgraph-patterns`, `skills/agent-system-design` (+ 10 pattern files +
2 references); edits to `eval-harness`, `llm-engineering`; agents
`backend-coordinator`, `qa-tester`, `architecture-analyst`, `security-reviewer`;
new `commands/design-agents.md`, `patterns/3-Agent-topology-interview.md`,
`templates/agent-topology.md`, `templates/project-claude-python.md`; edits to
`templates/project-claude.md`, `permissions.template.json`,
`github/claude-security.yml`; `CLAUDE.md`, `AGENTS.md`, `docs/START.md`,
`docs/BIG-PICTURE.md`, `docs/COMPATIBILITY.md`, `docs/CODEBASE_MAP.md`; ADR for
the hitl reason; `registries/docs-ledger.json` if any budget is exceeded.

**Fixtures**: `test/fixtures/py-fastapi/` (minimal pinned-tool package for the
runner e2e), `evals/*.jsonl` cases for the new intents and the topology rule.

## 7. Verification

- `npm run typecheck`, `npm run lint`, `npm test` (includes
  `prose-layer.e2e.test.ts`, the new runner tests, and the C-checks).
- `scripts/validate-engineos.sh` green: router/registry mirror, load-list
  closure for `backend-python`, C17 sample paths, C26 hitl vocabulary.
- `scripts/run-evals.sh` green on the new intent cases.
- **Manual, against `labv-assist`** (the only Python repo that already carries
  `.engineos/`): edit one file under `app/`, stop → the gate runs ruff, pyright and
  pytest from `.venv/bin` and blocks once on an injected ruff error; PreToolUse
  routes `app/api/routes_describe.py` to `backend-python` and
  `tests/unit/test_health.py` to `test`; SessionStart prints the stack line.
- **Manual, against `labv-opensearch-agent-demo`**: `graph/workflow.py` routes to
  `llm`; the stale `uv.lock` does not win over `.venv/bin`; the prompt
  "add a supervisor agent that coordinates the DSL and narrator agents" produces
  the topology-approval contract and `/engineos:design-agents` starts at step 1.
- **Part C, manual**: with `ENGINEOS_GIT_WRITES` unset, `git status` runs silently
  and `git commit -m x` produces the permission prompt; with `auto`, neither prompts.
- Both installers re-run cleanly (`install.sh` idempotency), which the developer
  runs (auto mode blocks Claude from self-modifying `~/.claude`).

## 8. Non-goals

- Django, Flask, Gemini, Anthropic providers (D4, D9).
- A hook that blocks writes under `graph/` until the topology approval line
  exists — follow-up once the prose gate has run on two real projects.
- Genericizing `rules/backend.md`/`frontend.md`; they stay NestJS/React.
- A Python MCP in the baseline.
- Porting the form to the Cursor/Codex/Copilot adapters (they get the catalog as
  prose only, per `templates/adapters/`).
- Migrating the demo's own code to these rules.

## 9. Alternatives considered

- **Genericize the Node files instead of adding Python siblings.** Rejected:
  the mechanisms (validation pipes vs `extra="forbid"`, TypeORM vs Alembic) do
  not share prose, and a generic file would be vaguer for both stacks.
- **Detect stack only, no explicit config.** Rejected: the demo's manifests
  disagree with each other and with CI; detection alone would pick the wrong
  runner. Explicit-then-detected keeps a single answer per package.
- **Prompt files instead of Python prompt modules.** Considered earlier in the
  discussion; reversed because both labv repos and their tests (version pin,
  fence probes, denylist) are built around modules.
- **LangChain chat model as the domain port.** Rejected (D9): labv-assist
  keeps LangChain out of `domain/` and its adapter test asserts the exact SDK
  kwargs; a LangChain port would move that contract out of the domain's reach.
- **Reuse an existing hitl reason (`high-risk`) for the topology gate.**
  Rejected: the vocabulary is closed on purpose so a record says *why* a human
  decided; "high-risk" would be a lie for a design review.
- **One combined "orchestration" step instead of a dedicated tools step.**
  Rejected by the developer (D16): tools are where the retrieval quality comes
  from and deserve their own step.

## 10. Implementation plan (waves)

Contracts frozen first (wave 0), then disjoint scopes per wave, one message per
wave, barrier-verify between waves (`rules/parallelism.md`).

| Wave | Units (disjoint scopes) | Tier |
|---|---|---|
| 0 | Freeze (written to `docs/specs/2026-09-28-python-stack-and-agent-design-contracts.md`): `RunnerSelection` union in `runner.ts`; `.engineos/config.json` schema; git-write-guard parser contract; `routing.json`/`intents.json`/`decision-rules.json`/`policy.json` diffs; the pattern-file skeleton | design |
| 1 | (a) `runner-python.ts` + `verify-targets.ts` + `classify-failure.ts` + tests + fixture · (b) `kernel/stack.ts` + `init --stack` + config loader + tests · (c) registries + `CLAUDE.md`/`AGENTS.md` mirror rows + validator checks + evals · (d) `git-write-guard.ts` + `output.ts` `ask` + `hooks.json` + tests + `rules/git.md` (Part C) | build |
| 2 | (a) `rules/backend-python.md` + `base.md`/`security.md`/`llm-apps.md`/`verification.md` edits · (b) `skills/python-patterns` · (c) `skills/langgraph-patterns` · (d) agents + templates edits | build |
| 3 | (a) `skills/agent-system-design` SKILL + form + command + pattern file + template · (b) the ten pattern files + two references · (c) ADR + `policy.json` hitl + `rules/risk-autonomy.md` prose + C26 | design (a, c) / build (b) |
| 4 | Docs (`START`, `BIG-PICTURE`, `COMPATIBILITY`, `CODEBASE_MAP`), `docs-ledger`, deprecation header (D5), final gate, manual verification on both labv repos, change record closed | build |

Each wave ends with `npm test` + `validate-engineos.sh` green before the next
starts. Wave 1(a) is the unit with the highest value and the only one that
touches the runtime's hot path; it lands first inside the wave.
