---
name: langgraph-patterns
description: Team LangGraph conventions for tool-using agent loops — state, nodes, tools with context, evaluator + bounded retry, memory, per-role models, streaming, tenant scoping. Use only after the agent topology was approved via /engineos:design-agents; for linear pipelines use python-patterns.
---

# LangGraph patterns

Apply `rules/llm-apps.md` and `rules/backend-python.md` from EngineOS first (EngineOS
rules — resolved relative to EngineOS's `CLAUDE.md`, the repo/plugin root, not this
project). The layout is the `python-patterns` skill's, with `graph/`, `agents/`, `tools/`
on the adapter side. This skill adds the shapes of a tool-using loop. Grounding: the
LangGraph reference implementation (`labv-opensearch-agent-demo/backend`, cited as
`file:line`); the pattern ids come from the `agent-system-design` skill's catalog.

## 1. When this skill applies

- A loop where the model picks tools and observes results (`react-tool-loop`,
  `evaluator-optimizer`, `supervisor-workers`, …): LangGraph, these shapes.
- A linear pipeline with at most one corrective retry (`grounded-pipeline`,
  `typed-pipeline`): a plain `async` use case per `python-patterns`. No graph.
- Either way the topology spec is approved before `graph/` gets its first file.

## 2. State

```python
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]   # the ONLY reducer
    iteration: int                                              # replace-on-write
    tool_execution_details: list[dict[str, Any]]
    artifacts: NotRequired[dict[str, Any]]
    retry_count: NotRequired[int]
    search_cache: NotRequired[dict[str, str]]
    run_id: NotRequired[str]
```

- `add_messages` is the one reducer; every other key is replace-on-write and `NotRequired` (`graph/state.py:8-28`). A node returns only the keys it changed.
- State stays JSON-serializable. Per-request objects — stream run, narration, callbacks — ride in `config["configurable"]`, never in state: the compiled graph is shared across requests and tenants (`services/agent_service.py:296-299`).

## 3. Nodes and wiring

- Factory functions close over their dependencies and return `async def node(state, config=None)`; the node reads `config["configurable"]` for per-request objects (`graph/nodes.py:294-298`, `agents/opensearch_agent.py:89-96`). Async so callbacks fire on the event loop, not a worker thread.
- A custom tool executor runs the batch with `asyncio.gather`, applies hand-offs and caches, and pops server-side payloads before results enter state (`graph/nodes.py:316-330`). The prebuilt `ToolNode` / `create_react_agent` cannot do any of that.
- Wiring: `add_edge(START, "agent")`, conditional edges keyed by string labels, `tools -> agent`, evaluator's conditional edge back to `agent` or `END` (`graph/workflow.py:239-265`). Optional nodes are added under their feature flag, and the edge target moves with them.
- Compile once per `(profile, tenant)` behind a double-checked `asyncio.Lock`: check the cache, take the lock, check again, build (`services/agent_service.py:67-85`).

## 4. Bounds, evaluator, retry

Three independent bounds, all present: an iteration cap in the routing function
(`should_continue`, `graph/workflow.py:36`), `recursion_limit` sized from the retry budget
(`agent_service.py:248`), and `asyncio.wait_for(graph.ainvoke(...), timeout=...)` around
the whole run (`agent_service.py:301-323`).

```python
class Verdict(BaseModel):                 # D10: typed, validated, never regex-and-defaults
    passed: bool
    retry_recommended: bool = False
    retry_instruction: str | None = None
    diagnosis: str = ""

def should_retry(state: AgentState) -> str:
    """Mirrors the evaluator node's guard EXACTLY. Without the retry_instruction check a
    null instruction loops the agent forever without consuming retries (workflow.py:48-55)."""
    ev = state.get("evaluation_result") or {}
    if (state.get("allow_retry") and ev.get("retry_recommended") and ev.get("retry_instruction")
            and state.get("retry_count", 0) < state.get("max_retries", 0)):
        return "retry"
    return "end"
```

- The evaluator node parses the model's JSON with `Verdict.model_validate_json`; on `ValidationError` it retries once with the error text appended as feedback, then degrades to "no audit" (the Nexxus shape) — never `json.loads` plus `setdefault` (`agents/evaluator_agent.py:85-106` is the anti-pattern).
- On retry the node appends `RETRY_PREFIX + instruction + original question` as a message, increments `retry_count` and resets `iteration` so the retry pass gets a full budget (`graph/nodes.py:467-471`). The agent node extends its window back to the original question when the latest message carries `RETRY_PREFIX` (`agents/opensearch_agent.py:49-56`).
- Evals per D13: pytest golden sets per tool (question → query) and per agent (task packet → output contract), no test calls the provider — scaffold with the `eval-harness` skill.

## 5. Tools with context

```python
class SearchToolInput(BaseModel):
    question: str = Field(..., description="User intent in natural language, not DSL")
    index: str = Field(..., description="Target index. Call IndexMappingTool first.")
    mappings: str = Field(..., description="Output of IndexMappingTool; empty = auto-fetch")

def create_search_tool(registry: IndexContextRegistry, profile: DataProfile, *, tenant_id: str, model) -> StructuredTool:
    async def search(question: str, index: str, mappings: str) -> str:
        context = registry.get_context(index)                      # the three layers, pre-rendered
        previous_dsl = previous_error = None
        for _ in range(MAX_DSL_ATTEMPTS):                          # bounded self-repair
            dsl = await generate_dsl(question, index, mappings, context, previous_dsl, previous_error, model=model)
            query = ensure_tenant_filter(strip_forbidden_clauses(dsl), tenant_id)
            result = await run_search(index, query, profile=profile)
            if result.startswith(ERROR_SYNTAX):
                previous_dsl, previous_error = dsl, result
                continue
            if len(result) > MAX_RESULT_CHARS:
                return json.dumps({"_dsl": query, "_result": REPLAN_TOO_LARGE, "_handoff_result": result})
            return json.dumps({"_dsl": query, "_result": result})
        return json.dumps({"_dsl": None, "_result": f"{ERROR_DSL_FAILED}: {previous_error}"})
    return StructuredTool(name="SearchTool", description=SEARCH_TOOL_DESCRIPTION, coroutine=search, args_schema=SearchToolInput)
```

- **Contract**: `StructuredTool(name="PascalCaseTool", description=…, coroutine=…, args_schema=<Name>Input)`; the description states ordering ("call IndexMappingTool first") and sentinels (`data_json='LAST_SEARCH'`); every `Field(description=…)` carries usage guidance, not a type restatement (`graph/workflow.py:93-120`, `tools/schemas.py:43-52`).
- **Binding**: tenant, profile and per-role model are bound by closure or factory at graph build; the model never passes them (`tools/search.py:112-130`, `tools/document_search.py:22-43`).
- **Three context layers**, all curated for a retrieval tool: (1) the *semantic layer* — data model, naming, lookup fields, join keys; (2) *curated per-index context* — field descriptions, gotchas, aggregation fields, a default file plus a per-tenant overlay with declared merge rules: `agg_fields` union, `fields` override-by-key, `notes` concatenate (`services/index_context_registry.py:124-135`); (3) *machine-owned facts* — live field paths, enums with counts, doc counts, regenerated by an in-backend scheduler, gitignored, write-guarded (minimum entities, maximum field-loss ratio), facts win on mechanical claims, curated paths missing from live data reported as contradictions (`services/index_facts.py:1-17,38-39,223-248,335`).
- **Registry**: built once at startup per `(profile, tenant)`, its live aggregations tenant-filtered (`index_context_registry.py:167-171,227-230`); it injects the rendered context into the **tool's own sub-agent prompt** (DSL generation, `agents/dsl_agent.py:41-64`), never into the router prompt.
- **Self-repair**: previous attempt + error fed back through a retry appendix, N attempts, then a typed failure (`tools/search.py:19,155-194`).
- **Envelope**: `{"_dsl", "_result", "_handoff_result"}` — `_result` is the preview the model sees; `_handoff_result` stays server-side, cached under the `LAST_SEARCH` sentinel so consumer tools (plot, extract, compute) read it without the model copying JSON (`tools/search.py:246-249`, `graph/nodes.py:74-86,177-190`).
- **Memo**: key `f"{index}::{question}"` in `search_cache`; a hit returns the cached content with `execution_time_ms=0` (`graph/nodes.py:118-131,356-359`).
- **Derived-data guard**: a small lookup (≤ N hits) in the same turn does not overwrite derived rows under the hand-off key; data-shaped searches and new turns always do (`graph/nodes.py:339-355`).
- **Errors**: typed strings `ERROR_<REASON>: …` the router can branch on; empty results get a `SEARCH_HINT` appended ("retry with broader terms before concluding the data is missing"); a size cap returns `ERROR_RESPONSE_TOO_LARGE` telling the model to **replan** (slim `_source`, split filters, paginate, aggregate) — never a silent truncation (`graph/nodes.py:194-204`, `tools/search.py:196-234`). Narration filters out `ERROR_`/`Error:` payloads (`nodes.py:274-279`).
- **Feature flags**: a tool's prompt block is registered together with the tool behind one flag (`workflow.py:171-174`, `utils/prompts_router.py:809-827`); one without the other is a bug.

## 6. Per-role models

- A profile resolves the model per role — `router`, `dsl`, `evaluator`, `narrator`, `title`, `compute` — with `default_roles` in the profiles file and a per-tenant `openai.roles` override, field by field; `build_model(profile, role=…)` is the only constructor (`config/settings.py:282-342`, `data/profiles.yaml`).
- Never mix a profile's endpoint with another flavor's deployment: take one connection wholesale (`settings.py:338-342`).
- Internal calls (DSL, evaluator, title) run `model.with_config(tags=["nostream"])` so their raw output never reaches a streamed client (`agents/dsl_agent.py:74`, `agents/evaluator_agent.py:76`); every model is built with `stream_usage=True` (`settings.py:276`).

## 7. Streaming

- One run object per request, backed by an `asyncio.Queue` with a sequenced replay buffer; SSE/WS consume it, every producer (progress callback, narrator, chart events) calls `run.publish()` (`services/stream_registry.py:38-100`). `publish` hops threads with `call_soon_threadsafe` because sync callbacks may fire off-loop.
- Only the narrator streams tokens (model built with `streaming=True`, `services/stream_service.py:92`); the router, DSL and evaluator do not. Narration beats are spawned, not awaited, so they cost no wall-clock time (`graph/nodes.py:393-398`).
- The LangGraph stream writer is avoided: writer events are dropped once the graph generator is exhausted, and the last beat outlives the run (`graph/nodes.py:376-378`).

## 8. Memory and sessions

- Summary-buffer strategy (raw turns until a token budget, then a rolling summary), one instance per session key; `save_turn` may call the model synchronously, so it runs via `asyncio.to_thread` (`utils/memory/summary.py`, `agents/opensearch_agent.py:131-133`).
- No checkpointer. A custom store persists turns, summary, artifacts and `last_data`; the service re-seeds `artifacts` and `search_cache[LAST_DATA]` into the input state each turn (`services/agent_service.py:250-253,306-317`, `utils/memory/persistence.py:330-400`).
- Storage key `company__user__profile__session` derived from JWT claims (`utils/session_scope.py:4-22`); the raw client id is only the last segment and is unwrapped if a client sends the full key back (`session_scope.py:25-46`).
- Any session id the model can emit (a sandbox key, a memory key) is overridden server-side in the tool executor; the schema says "leave empty" (`graph/nodes.py:156-159`, `tools/schemas.py:115-118`).

## 9. Tenant scoping and guardrails

- Tenant comes from the JWT claim, with an optional profile-level override for demo data (`config/tenant_resolution.py:10-35`); credentials are scoped per tenant at construction — `effective_profile()` returns a copy with `user_company_<tenant>` auth (`config/opensearch_credentials.py:52-64`).
- Everything the model generates passes fail-closed guards before execution: tenant filter injected under `bool.filter` (a `global` aggregation is rejected), forbidden clauses stripped (`script`), index names charset-allowlisted then prefix-checked (`utils/guardrails.py:151-186,202-285`). Nexxus's SQL variant: one `SELECT`, allowlisted views, row cap.
- Three guardrail layers: input regex + allowlist at the API edge (`guardrails.py:14-83`), a guardrail block in the system prompt (`utils/prompts_router.py:6`), an output sanitizer on the final answer plus a token gate that holds streamed tokens until a control sentinel is ruled out (`guardrails.py:122-144`, `agents/narrator_agent.py:195-210`).

## 10. Observability

- `run_id` in state and on every event; correlation id from the request middleware per `rules/observability.md`.
- A callback-based trace collector builds the span tree (chain / llm / tool) and token sums per run (`services/trace_collector.py:42-72,218-236`); a progress callback turns tool start/end into user-facing step events and never raises (`services/progress_callback.py:147-188`).
- Token accounting per role and per model: account in the callback or the tool result, tagged with the role. The known undercount: summing only the AI messages in graph state misses every model call a tool makes internally (DSL, compute) (`agent_service.py:644-649`); and a streamed response carries usage in `usage_metadata`, not `response_metadata["token_usage"]` (`agent_service.py:632-640`).

## 11. Protocol constants

One module (`graph/protocol.py`) owns every string two modules agree on:
`RETRY_PREFIX = "Retry."`, `ARTIFACT_STORED = "ARTIFACT_STORED:"`, `CHART_CONFIG = "CHART_CONFIG::"`,
`LAST_SEARCH = "LAST_SEARCH"`, `LAST_DATA = "__LAST_DATA__"`, `SEARCH_HINT`, `ERROR_PREFIX = "ERROR_"`,
plus the handoff sentinel set. Producers and consumers import them; a literal repeated in a
second module is the bug the reference implementation still carries (`graph/nodes.py:22` vs `:94-96`).

## 12. Anti-patterns to flag

- `graph/`, `agents/` or `tools/` importing `api/` (`graph/workflow.py:10`) → pass a request-context value in; D12's pytest walk asserts the direction.
- Deferred imports (`# noqa: PLC0415`) to break a cycle (`workflow.py:105`, `nodes.py:268`) → fix the dependency direction.
- Magic strings across modules (`"Retry."` checked in the agent node, evaluator node, formatter, service) → section 11.
- `print()` in library code (`utils/memory/summary.py:140`) → `logging.getLogger(__name__)`.
- `Optional[X]` mixed with `X | None` in one package (`workflow.py:3` vs `document_search.py:17`) → the project idiom, everywhere.
- Manifests that disagree (`pyproject.toml` vs `requirements.txt` vs CI) → one manifest, one lockfile.
- Regex-and-defaults JSON parsing of a model reply (`evaluator_agent.py:80-106`, `dsl_agent.py:87-111`) → Pydantic validate, one retry with the error as feedback (D10).
- `ToolNode` / `create_react_agent` where hand-offs, caches or tenant binding are needed → section 3.
- A tool registered without its prompt block, or the reverse → section 5, feature flags.
- A retry guard present in the node but not in the routing function (or vice versa) → section 4.
