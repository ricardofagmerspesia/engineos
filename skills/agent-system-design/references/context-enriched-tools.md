> Active runtime: Mastra on Node.js/TypeScript inside NestJS providers. Python
> citations are historical design provenance, not JS APIs/tooling. Resolve APIs
> against installed dependencies. Tests/evals are plans until integration and
> explicit current-task final-stage approval.

# Context-enriched tools

Step-3 reference for `references/form.md`; implementation uses
`mastra-patterns`. Historical citations are relative to
`labv-opensearch-agent-demo/backend` unless a full path is given.
Each tool owns context, internal reasoning, error vocabulary and scope behind a
typed interface; the router chooses tools rather than constructing their queries.

## 1. Three knowledge layers

| Layer | Ownership/storage/refresh | Consumer |
|---|---|---|
| Semantic model: naming, lookup/join/language rules | Human PRs; `data/profiles/_default/semantic_layer.yaml` + tenant file | Router summary (`services/schema_registry.py:148-152`, `graph/workflow.py:207-217`); detail stays in tool |
| Curated index fields/gotchas/aggregations/notes | Human PRs; _default/index_context.yaml + tenant overlay + hand_notes.yaml | Tool sub-agent only |
| Sampled live paths/enums/counts | Scheduler; gitignored `profiles/<tenant>/index_facts.yaml` (`.gitignore:100`); weekly, daily check/startup (`services/index_facts.py:282-328`) | Tool sub-agent only |

Overlay rules: agg_fields union(default-first, ordered); fields override by field
path, appending new paths; notes concatenate(default-first)
(`data/profiles/_default/index_context.yaml:1-12`,
`services/index_context_registry.py:88-135`). Machine facts win mechanical
claims; curated descriptions/notes remain. Drop nonexistent curated paths from
prompts and report contradictions (`index_context_registry.py:249-288`,
`index_facts.py:335-355`); plan an approved-final check rather than only a warning.
Reject writes below _MIN_ENTITIES_TO_WRITE or the allowed known-field retention
threshold _MAX_FIELD_LOSS_RATIO (`index_facts.py:38-39,191-196,232-243`).
Sample documents rather than _mapping under tenant DLS credentials (`:10-12`).

## 2. Tenant registry and injection

Build registry once per (profile, tenant), with restricted credentials and explicit
tenant term on **every** live aggregation (`graph/workflow.py:107-110`,
`index_context_registry.py:167-171,227-230`); internal _-principals aggregate
nothing. Shared index prefixes make unscoped value discovery leak tenant data.
Render/get context by index (`:290-332`); inject field detail between mappings
and output instruction in the tool sub-agent prompt
(`tools/search.py:146,156-164`, `agents/dsl_agent.py:41-64`), never router.

## 3. Bounded self-repair

Internal dsl-role model receives previous attempt/error up to MAX_DSL_RETRIES,
then typed failure (`tools/search.py:19,152-194,251`). Handle invalid JSON,
ERROR_SYNTAX and guard rejection (global aggregation;
`utils/guardrails.py:256-264`). Router sees only final output/failure.
D10 additionally requires strict zod parsing, one schema-feedback retry then typed
failure; extract_first_json/match_all fallback is an anti-pattern
(`dsl_agent.py:87-111`).

## 4. Contracts and feature flags

Historical contract provenance: name/description/input schema
(`graph/workflow.py:93-120`). Give every input field actionable usage/default
instructions (`tools/schemas.py:45-52,115-118`), dependencies and sentinels
(`workflow.py:101,136-138`). Register tool and prompt block behind the same
flag (`:171-174,212-217`). Model session_id guidance says leave empty;
server overrides regardless (`graph/nodes.py:156-159`).

## 5. Envelope, memo and handoff

Envelope fields remain `_dsl`, `_result`, `_handoff_result`: model gets capped
preview; pop/cache full payload server-side before state insertion
(`tools/search.py:246-249`, `graph/nodes.py:177-190,330,338-355`). Nexxus
SQL LAST_QUERY uses the same contract (`portal_nexxus/backend/src/infrastructure/agent/state.py:21-26`,
`tools.py:100-115`). Plot/extract/compute resolve empty or sentinel data_json
from handoff (`nodes.py:18-22,74-86`). Memo index::question returns cached
content with execution_time_ms=0 (`:118-131,356-359`). Same-turn small lookup
≤_LOOKUP_MAX_HITS cannot replace derived rows; data-shaped searches/new turns may
(`:24-30,339-355`). Exhaust set pagination server-side before consumers compute;
model sees page one plus note (`search.py:25-31,34-109`).

## 6. Errors, limits and scoping

Return ERROR_<REASON> plus actionable details; empty results get SEARCH_HINT
before declaring absence (`nodes.py:194-204`). ERROR_RESPONSE_TOO_LARGE explains
slim _source/split/stable paging/aggregate, never silent truncation
(`search.py:196-234`). Narration excludes ERROR_/Error: findings
(`nodes.py:274-279`); shared constants live in one protocol module.

Bind tenant-restricted credentials/term through factories, not model arguments
(`config/opensearch_credentials.py:52-64`, `tools/search.py:112-128`,
`tools/document_search.py:22-43`). Fail closed: inject bool.filter, reject global
aggregation, strip forbidden clauses, charset-allowlist index before prefix check
(`utils/guardrails.py:151-187,194-224,245-286`). Historical SQL analogue:
parsed single SELECT, allowlisted views, forced LIMIT, not regex
(`portal_nexxus/backend/src/infrastructure/agent/guardrails.py:17-50`).
Load `references/tenant-profiles.md` for credential/model resolution.

## 7. Approved-final eval plan

Golden fake-provider query pairs assert **post-guard** tenant/script/index behavior;
negative global aggregation repairs or fails typed. Plan curated+overlay versus
committed-facts contradiction checks (`index_context_registry.py:261-263`)
and fence-escape/no-customer-string/version-pin probes. D13 prohibits provider
calls. Author/run via eval-harness only in the approved final stage; any CI
automation needs separate approval.

## 8. Eight decisions per tool

Record every cell in §3; blank means undecided:

1. Inventory: PascalCaseTool, purpose, guided input schema, envelope, callers.
2. Dependencies: prerequisite tool, description and flagged prompt block.
3. Context: applicable layers, owners, facts refresh and tool-agent injection.
4. Internal reasoning: yes/no, role, repair N then ERROR_<REASON>.
5. Errors/limits: codes, empty hint, response cap and replanning text.
6. Prior calls: memo key, sentinel, derived-data guard.
7. Scoping: construction tenant, output guards, overridden model ids.
8. Evals: golden-pair file and contradiction-check plan.
