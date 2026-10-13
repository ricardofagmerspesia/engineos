# LLM Application Rules

## Test and eval timing

Plan acceptance criteria, thresholds and cases before code. Every test/eval
instruction below requires integrated implementation and explicit current-task
user approval under `rules/verification.md`; features/security/release gates
supply no consent. Without approval, report evidence pending.

Use TypeScript, zod/JSON Schema and Mastra for all LLM apps, agents and chatbots.
Host APIs/workers in NestJS modules/providers under `rules/base.md`: Nest owns
startup, transport, auth and lifecycle; injected Mastra owns model calls, agents,
tools, workflows and memory. Never bootstrap a separate Mastra server beside
Nest. Node supports runtime/CLI/shared packages; pure domain helpers stay ordinary
TypeScript. Existing LangGraph/LangChain/other orchestration requires a reported
policy deviation and scoped migration before extension; preserve compatibility.

## Prompts

- Version prompts in named files/constants with changelog. Structure: role/context
  → task → constraints → output → examples. Validate explicit template variables.
- Customer-data prompts require three approved final tests: **fence-escape probe**
  (data delimiters cannot escape), **no-customer-string denylist** (no known tenant,
  product/person strings; synthetic few-shots), **prompt-version pin**
  (`PROMPT_VERSION` in every usage record; text changes require version bumps).
- Feature-flag prompt blocks and corresponding tool registrations together.
- Production prompt changes require approved eval evidence, never manual vibes.

## Structured output

- Use tool/function calling or structured-output APIs; never regex-parse free text.
- Schema-validate all returned JSON (verdicts/classifications/DSL) before use or
  trust-boundary crossing. Failure gets ONE retry with validation feedback, then
  typed failure; never regex/default fallbacks.

## Security (prompt injection)

- Delimit retrieved docs, user content and tool results as untrusted data,
  explicitly distinguished from instructions.
- Least-privilege tools; read-only agents receive no write/delete tools.
- Human confirmation for irreversible sends/deletes/payments; no credentials in prompts.
- Delimiting text never replaces retrieval ACLs or redaction below.

## Evals — no vibes-driven development

- Plan golden-set criteria before implementation; author cases in approved final stage.
- Approved evals cover every prompt/model/temperature change; track pass rates.
- LLM judges cover fuzzy criteria, exact match structured output.
- One successful manual example never proves a shippable prompt change.

## Reliability & cost

- Every model call: max_tokens, timeout, retry/backoff and fallback (degraded model,
  cached response or honest unavailable).
- Log prompt version, model, latency, tokens and outcome; budget per feature.
- Cache content-hashed embeddings permanently and repeated completions where valid;
  retrieval-dependent keys include principal, as specified below.

## RAG

### Corpus safety

**Access control at retrieval.** Implement object-level authorization (`rules/security.md`):

- Every chunk carries source-authoritative ACL/tenant metadata; never infer it from
  document content, frontmatter or filenames. Index writes lacking ACL fail;
  chunks lacking ACL are unretrievable.
- Derive principal server-side from authenticated session/token claims, never
  client/model-controlled body/query/tool arguments.
- Filter BEFORE ranking in EVERY dense and lexical branch; re-rank only filtered
  candidates. Never post-filter top-K (recall loss and existence leakage).
- Resolve groups/reference ids against authoritative permissions at query time,
  or declare maximum ACL staleness and permission-change re-index trigger.
- Derived/multi-source chunks inherit the intersection of every source ACL;
  an index unable to represent it cannot be built.
- Retrieval/completion cache keys include principal/ACL scope; only content-hashed
  embedding caches are principal-free.
- Required `retrieval-acl` artifact (`registries/decision-rules.json`,
  `rule-rag-corpus-safety`): feature README/spec `## Access` states principal source,
  ACL/tenant field, each branch's filter, freshness and fail-closed behavior.
  Approved golden set includes cross-tenant pairs.

**Redaction before indexing and before prompting.** Embeddings also copy sensitive data:

- Detect/redact/tokenize PII/secrets at ingestion BEFORE chunking/embedding, including
  metadata, titles, paths and rendered citations.
- Redact questions before query embedding/completion; emptied queries ask for
  rephrasing by default, never generate from nothing.
- Redact assembled chunks/tools/history/user context on EVERY request, including
  already-redacted/new corpora (unconditional defense in depth).
- Reversible token maps are PII: separately access-controlled, encrypted at rest,
  erased with source documents.
- Embedding cache keys include chunking AND redaction versions. Redaction bumps
  require re-ingestion and deletion of superseded chunks/vectors; cache invalidation
  alone leaves unredacted vectors behind.
- Declare intentionally unmasked classes/reasons; any such class triggers
  `rule-sensitive-data`: threat model, security review, human approval.
- Required `pre-index-redaction` artifact: feature README/spec `## Redaction`
  names detectors, classes, masking (drop/mask/reversible tokenize under retention),
  emptied-query behavior and intentional exceptions/reasons.

### Retrieval quality

- Semantic chunks (sections/paragraphs) with metadata; no blind fixed-char slicing.
- Measure retrieval Recall@K, Precision@K, MRR separately from generation
  groundedness (claims traceable to chunks) and faithfulness (no contradiction).
  End-to-end pass rate alone cannot diagnose either.
- Baseline: `evals/<feature>/retrieval/BASELINE.md` records metric/K/value/date/index
  version (`retrieval-evaluation` when knowledge volatile). Lower Recall@K blocks shipping.
- Hybrid dense+lexical retrieval, merge and re-rank before model top-N. Skip re-ranker
  only with recorded golden-set Precision@K above feature threshold without it.
- Feature README/spec `## Freshness` (`freshness-policy`) names re-index triggers,
  maximum staleness and stale-answer labeling.
- Cite sources; tune K against Recall@K/Precision@K rather than stuffing context.

### Ingestion

- Raw source store keyed by source id/content hash; vector index is rebuildable,
  never sole copy.
- Dedicated format parsers preserve PDF layout/tables and strip HTML boilerplate;
  metadata records parser name/version; changes trigger re-indexing.
- Dedupe content hashes before embedding; optional near-dedupe requires Precision@K evidence.
- Minimum metadata: source id/URI, title, section path, offsets, created/updated
  timestamps, type/tags, ACL, chunking/redaction/parser versions, embedding model/version.
- Idempotent upserts use chunk ids from source id/offsets/versions; ingest changes
  incrementally. Keep/rehearse full rebuild from source store in approved validation.
- One embedding model per index; model changes create a new index plus swap, never mixed vectors.

### Query pipeline

- Rewrites (normalization, history resolution, multi-hop decomposition) are untrusted
  model output: schema/length-bound before downstream use. Adopt only with improved
  golden-set Recall@K and before/after prompt-change evidence.
- Structured metadata filters (date/type/tags/source) accompany principal pre-ranking
  filters. Model filter extraction must be allowlist-validated; no free-text filter composition.
- Explicit context token budget: re-rank order, near-duplicate removal, parent-section
  expansion when needed and source-id stamps. Drop lowest whole chunks, never mid-chunk.
- Below tuned relevance threshold answer "not found in the sources", never from
  parametric memory; golden set includes no-answer cases.

### Operations

- Separate app data, cache/sessions, raw docs/backups and vectors with separate retention.
  Back up source store/metadata; rebuild vectors. History gets shortest viable retention;
  DBA data rules own stored retention/encryption.
- Prefer existing relational vector extension under monolith-first architecture;
  dedicated vector DB needs recorded scale/latency measurements.
- Cache keys: embedding = content hash (permanent, versioned above); retrieval =
  normalized-query hash + principal + index version (short TTL); answer = normalized
  query + principal + prompt/index versions (TTL within freshness policy).
- Tune semantic-cache similarity on golden set; wrong-answer hits are eval failures.
- Capture rating/correction and retry/abandon feedback with trace/prompt/chunk ids.
  Queue negative/low-groundedness answers for human review; reviewed failures become
  approved golden cases in the fixing PR.
- Extend call logs with rewrite/retrieve/re-rank/generate latency and chunk ids/scores;
  observability rules retain correlation/log-schema ownership.

## Agents

- Few precise tools (5–10 beats 30 vague); cap iterations and cost.
- Tool errors tell the model what failed and what to try.
- Multiple application agents begin `/engineos:design-agents` (`agent-system-design`):
  topology, roster, tools, protocol, scoped context, memory, harness, guardrails,
  failure policy, observability, evals and diagrams, one developer-answered step
  at a time. Topology spec is the design artifact; record developer approval in
  change-record `## Human decisions` with `topology-approval` BEFORE orchestration code.
  `mastra-patterns` implements approved topology, never chooses it. Single Mastra
  agents/ordinary chatbots trigger no topology approval.
