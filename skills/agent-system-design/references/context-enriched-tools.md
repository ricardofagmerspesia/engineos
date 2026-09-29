# Context-enriched tools

*Reference for step 3 of the design form (`references/form.md`); folded into every catalog pattern. Grounding: `labv-opensearch-agent-demo/backend`, cited as `file:line`. The implementation shapes are the `langgraph-patterns` skill's §5 — that file says how to write it; this one says what to decide and why.*

The developer called this "the most important feature": the demo's answer quality comes from what each tool knows before it acts, not from the router prompt. A tool that owns its context, its own sub-agent, its own error vocabulary and its own scoping is a small agent behind a typed interface; the router only chooses which one to call.

## 1. The three knowledge layers

| Layer | Owner | Lives in | Refresh | Reaches |
|---|---|---|---|---|
| **Semantic layer** — data model: naming pattern, lookup fields per entity, join keys, language rules | humans, git-reviewed | `data/profiles/_default/semantic_layer.yaml` (+ per-tenant file) | on PR | the router, as a rendered index/relationship summary (`services/schema_registry.py:148-152`, `graph/workflow.py:207-217`); field detail stays out of it |
| **Curated per-index context** — field descriptions, gotchas, aggregation fields, advisory notes | humans, git-reviewed | `_default/index_context.yaml` + per-tenant overlay (+ `hand_notes.yaml`) | on PR | the tool's sub-agent only |
| **Machine facts** — live field paths with presence counts, enums with doc counts, doc counts | the backend's scheduler | `profiles/<tenant>/index_facts.yaml`, **gitignored** (`.gitignore:100`) | weekly, checked daily and on startup (`services/index_facts.py:282-328`) | the tool's sub-agent only |

Merge rules for the curated overlay, declared in the file header and implemented once (`data/profiles/_default/index_context.yaml:1-12`, `services/index_context_registry.py:88-135`):
- `agg_fields` → union, default first, order kept.
- `fields` → override by `field` path; overlay entries with a new path are appended.
- `notes` → concatenate, default first.

Facts on top (`index_context_registry.py:249-288`): facts win on mechanical claims (field paths, types, enums); curated text keeps descriptions and notes; a curated path missing from live data is dropped from the prompt and reported as a contradiction (`index_facts.py:335-355`) — a startup warning in the demo, a test in the target project (§9).

Write guards on the facts file (`index_facts.py:38-39,191-196,232-243`): a run that discovers fewer than `_MIN_ENTITIES_TO_WRITE` populated entities is treated as failed; a new file carrying fewer than `_MAX_FIELD_LOSS_RATIO` of the known fields is refused. A flaky cluster must never poison a tenant's context. Discovery samples documents instead of calling `_mapping`, because tenant-scoped credentials are DLS-restricted (`index_facts.py:10-12`).

## 2. The registry

Built once at startup per `(profile, tenant)` with **tenant-restricted credentials** and an explicit tenant term on every live aggregation (`graph/workflow.py:107-110`, `index_context_registry.py:167-171,227-230`): all tenants share one index prefix, so an unscoped `terms` aggregation would enumerate other tenants' values into this tenant's prompt. Internal principals (`_`-prefixed) aggregate nothing (`:171`). The registry renders one context string per index (`:290-326`) and serves it by index name (`:328-332`).

## 3. Injection point

The rendered per-index context goes into the **tool's own sub-agent prompt**, between the mappings and the output instruction (`tools/search.py:146,156-164`, `agents/dsl_agent.py:41-64`). Never into the router: the router decides *which* tool and *which* index from the semantic-layer summary; the field-level knowledge belongs to the agent that writes the query. In the router it bloats every turn and invites the router to "help" with DSL fragments the tool then has to trust.

## 4. Bounded self-repair

The tool embeds its own model call under its own role (`dsl`, langgraph-patterns §6) and repairs its own output: previous attempt + error fed back through a retry appendix, `MAX_DSL_RETRIES` attempts, then a typed failure (`tools/search.py:19,152-194,251`, `dsl_agent.py:41-46`). Repair triggers: invalid JSON from the sub-agent, `ERROR_SYNTAX` from the store, a guardrail rejection (`ensure_company_filter` raises on a `global` aggregation, `utils/guardrails.py:256-264`). The router never sees an intermediate failure — only the final result or the typed failure.

D10 applies to the sub-agent's output: the demo's `extract_first_json` with a `match_all` fallback (`dsl_agent.py:87-111`) is the anti-pattern. Validate with Pydantic, retry once with the error, then the typed failure.

## 5. Tool contract

- `StructuredTool(name="PascalCaseTool", description=…, coroutine=…, args_schema=<Name>Input)` (`graph/workflow.py:93-120`).
- Every `Field(description=…)` carries **usage guidance**, not a type restatement: "Leave as 'LAST_SEARCH' (the default) … you do NOT need to copy the data" (`tools/schemas.py:45-52,115-118`).
- Ordering rules and sentinels live in the description: "Call IndexMappingTool first", "call this tool with data_json='LAST_SEARCH'" (`workflow.py:101,136-138`).
- A tool's prompt block is registered together with the tool behind one feature flag (`workflow.py:171-174,212-217`; rules/llm-apps.md); one without the other is a bug.
- Any argument the model could use to reach another session (`session_id`) says "Leave empty — the system fills this" and is overridden server-side (`schemas.py:115-118`, `graph/nodes.py:156-159`).

## 6. Envelope, memo, hand-off

- Envelope `{"_dsl", "_result", "_handoff_result"}`: `_result` is the preview the model sees; `_handoff_result` is popped before results enter state and cached server-side under the hand-off key (`tools/search.py:246-249`, `graph/nodes.py:177-190,330,338-355`). Nexxus's `LAST_QUERY` is the same envelope over SQL (`portal_nexxus/backend/src/infrastructure/agent/state.py:21-26`, `tools.py:100-115`).
- Consumer tools (plot, extract, compute) read the hand-off when their `data_json` is empty or a sentinel (`nodes.py:18-22,74-86`).
- Memo key `f"{index}::{question}"` in `search_cache`; a hit returns the cached content with `execution_time_ms=0` (`nodes.py:118-131,356-359`).
- Derived-data guard: a lookup of at most `_LOOKUP_MAX_HITS` in the same turn does not overwrite derived rows under the hand-off key; data-shaped searches and new turns do (`nodes.py:24-30,339-355`).
- Server-side exhaustion: a query that asked for a set is paginated to completion behind the scenes so consumers never compute on a truncated population; the model still sees page one plus a note (`search.py:25-31,34-109`).

## 7. Errors and limits

- Typed strings `ERROR_<REASON>: …` the router can branch on; empty results get a `SEARCH_HINT` appended — retry with broader terms before concluding the data is missing (`nodes.py:194-204`).
- A size cap returns `ERROR_RESPONSE_TOO_LARGE` telling the model how to **replan** (slim `_source`, split filters, paginate with a stable sort, aggregate) — never a silent truncation (`search.py:196-234`).
- Narration filters `ERROR_` and `Error:` payloads out so an error is never narrated as a finding (`nodes.py:274-279`).
- Every constant two modules agree on lives in one protocol module (langgraph-patterns §11).

## 8. Scoping

- Tenant baked in at construction: closures and factories over tenant-restricted credentials (`effective_profile`, `config/opensearch_credentials.py:52-64`), the tenant term passed explicitly (`tools/search.py:112-128`, `tools/document_search.py:22-43`); the model never passes a tenant.
- Fail-closed guards on everything the model generates: tenant filter merged under `bool.filter` with `global` aggregations rejected (`utils/guardrails.py:245-286`); forbidden clauses stripped (`:194-224`); index names charset-allowlisted **before** the prefix check (`:151-187`). Nexxus's SQL variant: one `SELECT`, allowlisted views, forced `LIMIT`, parsed with sqlglot rather than regex (`portal_nexxus/backend/src/infrastructure/agent/guardrails.py:17-50`).
- Where the credentials and per-role models come from: `references/tenant-profiles.md`.

## 9. Evals

- Golden `question → query` pairs per tool: run the sub-agent with a fake model returning the golden DSL and assert the query **after** guardrails (tenant filter present, no script clause, index inside the prefix); plus a negative set where the fake returns a `global` aggregation and the tool must repair or fail typed. Scaffold with the `eval-harness` skill; no test calls the provider (D13).
- The curated-vs-facts contradiction check as a test: load `index_context.yaml` (+ overlay) and a committed fixture `index_facts.yaml`, assert `detect_contradictions(...) == []`. The demo runs it only as a startup warning (`index_context_registry.py:261-263`); the target project makes it fail CI.
- The three prompt tests of rules/llm-apps.md on the sub-agent prompt (fence-escape, no-customer-string, version pin) — curated notes are customer-adjacent text.

## 10. Per-tool checklist — the form's eight sub-decisions

One row per tool in the topology spec; a blank cell is a decision not taken.

1. **Inventory** — `PascalCaseTool`, purpose, `<Name>Input` with guidance in every `Field`, envelope (`_result` / `_handoff_result`), agents allowed to call it.
2. **Dependencies** — which tool runs first; stated in the description and in the flagged prompt block.
3. **Context** — which of the three layers apply (retrieval tool: all three), who owns each, the machine layer's refresh cadence, the injection point (the tool's sub-agent).
4. **Internal reasoning** — sub-agent yes or no, its role, the self-repair budget (`N` attempts, then `ERROR_<REASON>`).
5. **Errors and limits** — the `ERROR_<REASON>` set, hints on empty results, the size cap and its replan text.
6. **Memory of prior calls** — memo key, hand-off sentinel, derived-data guard.
7. **Scoping** — what is baked in at construction, which guards run on generated output, which model-supplied ids are overridden.
8. **Evals** — the golden-pairs file and the contradiction test.
