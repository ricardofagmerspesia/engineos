# RAG pipeline completeness: ingestion, query pipeline, state, caching, feedback

Date: 2026-09-11. Status: accepted. Owner: llm-coordinator (hermsdorff).
Follows `docs/specs/2026-09-11-rag-corpus-safety-design.md`, which closed the two
security floors from the same gap analysis. This spec closes the remaining quality
gaps against the eight-block production-RAG reference map.

## Problem

`rules/llm-apps.md` `## RAG` now covers corpus safety and retrieval quality
(chunking, hybrid retrieval, re-ranking, metrics, freshness, citations, K tuning).
It is silent on:

| Map block | Missing |
|---|---|
| 1 Indexing pipeline | sources and parsing, dedupe, idempotent and incremental ingestion, embedding-model pinning, the minimum chunk metadata set |
| 2 Query pipeline | query rewrite, context assembly under a token budget, no-result handling |
| 3 Knowledge store | the document store as the source of truth; the vector index as a rebuildable projection |
| 4 Retrieval quality | metadata filters (date, type, tags) as structured pre-filters |
| 6 State layer | separation of app data, cache and sessions, raw documents and backups, vector index |
| 8 Safety and operations | caching layers beyond the embedding cache; the feedback loop into the golden set and a human review queue |

Each of these is a quality or operability gap. None is a security floor, so this
spec adds no decision rule and no reviewer checklist item.

## Decision

Extend `## RAG` in `rules/llm-apps.md` with three subsections after
`### Retrieval quality`: `### Ingestion`, `### Query pipeline`, `### Operations`
(state layer, caching, feedback). Mirror the procedure parts in
`skills/llm-engineering/SKILL.md` and the measurable parts in
`skills/eval-harness/SKILL.md`. Extend `agents/llm-coordinator.md` Method step 2
so the audit checks the new areas.

### Ingestion (frozen intent)

- The raw source lives in a document store (object storage or equivalent) keyed by
  source id and content hash; the vector index is a derived, rebuildable projection
  and never the only copy.
- Parse per format with a dedicated parser (PDF layout, HTML boilerplate strip,
  tables kept as tables); parser name and version are chunk metadata and a parser
  change is a re-index trigger under the freshness policy.
- Dedupe by content hash before embedding; near-duplicate detection is optional
  and measured on Precision@K.
- Minimum chunk metadata: source id, source URI, title, section path, offsets,
  created and updated timestamps, type or tags, ACL, chunking version, redaction
  version, parser version, embedding model and version.
- Ingestion is idempotent (upsert keyed by a chunk id derived from source id,
  offsets and versions) and incremental (changed sources only); a full rebuild
  path exists and has been rehearsed.
- One embedding model per index. A model change is a new index plus a swap, never
  mixed vectors in one index.

### Query pipeline

- Query rewrite (normalization, history-aware reference resolution, decomposition
  into sub-queries for multi-hop) is a model call whose output is untrusted: schema
  and length bounded, and adopted only when it raises Recall@K on the golden set.
- Metadata filters (date range, type, tags, source) are structured pre-filters
  applied alongside the principal filter; values come from structured extraction
  validated against an allowlist, never free text the model composes into a filter.
- Context assembly runs under an explicit token budget: order by re-rank score,
  drop near-identical chunks, expand to the parent section when a chunk alone lacks
  context, stamp every chunk with its source id, truncate by dropping the
  lowest-ranked whole chunk, never mid-chunk.
- Below a relevance threshold the answer is "not found in the sources", never a
  completion from parametric memory; the threshold is tuned on the golden set and
  the case is in it.

### Operations

- State layer: app data, cache and sessions, raw documents and backups, vector
  index are separate stores with separate retention. Back up the document store
  and chunk metadata; vectors are rebuilt, not restored. Conversation history is
  PII-bearing and gets the shortest viable retention.
- Vector store choice follows the monolith-first rule: the existing relational
  store's vector extension first; a dedicated vector database only when a
  measured scale or latency need is recorded.
- Three cache layers with distinct keys: embedding (content hash, permanent),
  retrieval result (normalized query hash, principal, index version; short TTL),
  answer (exact or semantic match on the normalized query; principal, prompt
  version, index version in the key; TTL bounded by the freshness policy). A
  semantic-cache hit that serves a wrong answer is an eval failure, so the
  similarity threshold is tuned on the golden set.
- Feedback loop: explicit (rating, correction) and implicit (retry, abandon)
  signals are captured per answer with trace id, prompt version and retrieved
  chunk ids. Negative feedback and low-groundedness answers go to a human review
  queue; every reviewed failure becomes a golden case in the PR that fixes it.
- Observability: per-stage latency (rewrite, retrieve, re-rank, generate) and
  chunk ids with scores join the existing per-call log fields.

## Rejected alternatives

- **A new decision rule with `ingestion-manifest` / `feedback-loop` artifacts.**
  Registry requirements are for gates; these rules describe how to build well,
  and `rule-volatile-knowledge`'s `freshness-policy` already owns re-index
  triggers. Adding artifacts would be requirement theatre on every RAG prompt.
- **A separate `rules/rag.md`.** Would force every router row that loads
  `llm-apps.md` to also load it (closure rule) and split one topic across two
  files. `llm-apps.md` stays under 300 lines with the addition.
- **Putting the state-layer rules in `rules/architecture.md` / `rules/data.md`.**
  The LLM router row does not load either, so the guidance would be invisible to
  the agent doing RAG work. Cross-reference by phrase, not by path.

## Files

- `rules/llm-apps.md`, `skills/llm-engineering/SKILL.md`, `skills/eval-harness/SKILL.md` — hermsdorff
- `agents/llm-coordinator.md`, this spec, the change record — orchestrator

## Verification

Final gate only: `scripts/validate-engineos.sh`, `npm run lint`. Tests not in scope.
