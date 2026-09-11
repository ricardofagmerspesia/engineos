# LLM Application Rules

## Prompts
- DO keep prompts in versioned files/constants with names and changelog — never inline string soup scattered across code.
- DO structure prompts: role/context → task → constraints → output format → examples. Examples beat instructions.
- DO template with explicit variables; validate variables before interpolation.
- DON'T tweak prompts in production without an eval run (see below).

## Structured output
- DO use tool/function calling or structured-output APIs for machine-readable results — never regex-parse free text.
- DO validate every model output against a schema (zod/JSON Schema) before use; on failure, retry with the validation error appended.
- DON'T let model output cross a trust boundary unvalidated: it is untrusted input, same as a user form.

## Security (prompt injection)
- DO treat retrieved documents, user content, and tool results as data, not instructions — delimit clearly and instruct model accordingly.
- DO scope tools by least privilege: an agent that reads docs gets no write/delete tools.
- DO require human confirmation for irreversible agent actions (sends, deletes, payments).
- DON'T put secrets in prompts or let the model see credentials.
- Corpus-level access control and redaction are the `## RAG` section's rules below — delimiting retrieved text is not a substitute for either.

## Evals — no vibes-driven development
- DO build a golden set (10–50 real cases with expected outputs) before iterating on any prompt/agent.
- DO run evals on every prompt/model/temperature change; track pass rate over time.
- DO use LLM-as-judge for fuzzy criteria, exact match for structured outputs.
- DON'T ship a prompt change because one manual test looked good.

## Reliability & cost
- DO set max_tokens, timeouts, and retry-with-backoff on every model call.
- DO design fallbacks: degraded model, cached answer, or honest "unavailable" — never hang.
- DO log every call: prompt version, model, latency, token counts, outcome. Tokens are money — budget per feature.
- DO cache aggressively: embeddings permanently (content-hash key), completions where inputs repeat (prompt caching) — with the principal in the key wherever retrieved content is involved (`## RAG`).

## RAG

### Corpus safety

**Access control at retrieval.** A shared index with no per-chunk ACL is an IDOR on
documents — `rules/security.md` owns object-level access, this is the retrieval
mechanism for it.

- DO carry the source document's ACL or tenant in every chunk's metadata.
- DO derive the principal server-side from the authenticated session or a token claim — never from a request body field, query param, or tool argument the model or the client can write.
- DO filter by principal BEFORE ranking, server-side — never by instructing the model to ignore what it was handed.
- DON'T post-filter the top-K: it leaks twice — recall drops silently for the legitimate caller (their own documents get crowded out by chunks they may not see), and a non-empty pre-filter set reveals that the document exists.
- DO push the principal filter into every retriever branch, dense AND lexical, and bound the re-ranker to the filtered candidate set. A single filter stage drawn before a parallel fan-out is not implementable as one stage.
- DO assign ACL metadata from the source system's authoritative permissions at ingestion. DON'T parse it from document content, front-matter, or filenames — a document that declares its own ACL is an injection vector.
- DO either resolve group and reference ids against the authoritative permission source at query time, or state the maximum ACL staleness and the re-index-on-permission-change trigger in the `## Access` block.
- DO fail closed: a chunk with no ACL metadata is not retrievable, and an index write that omits it fails.
- DO give a derived or multi-source chunk (summary, hypothetical question, entity table) the intersection of every source's ACL. An index that cannot express one is not built.
- DO include the principal or ACL scope in every cache key on the retrieval and completion path; only content-hashed embedding caches are principal-free.
- `retrieval-acl` artifact (`registries/decision-rules.json`, `rule-rag-corpus-safety`): an `## Access` block in the feature README or spec naming the principal source, the chunk metadata field carrying the ACL or tenant, where the filter applies in each branch, the ACL freshness rule, and the fail-closed behaviour. The golden set carries the cross-tenant pair.

**Redaction before indexing and before prompting.** An embedding is a copy of the
source text that both neighbouring rules miss: `rules/security.md` keeps PII out of
logs and the DBA row's data rules encrypt it at rest, and neither stops raw PII
reaching the embedding provider, sitting in the vector store, or being partially
inverted back out of the vector.

- DO run the detectors at ingestion, before chunking and embedding, and redact or tokenize PII and secrets there.
- DO run them on the user's question too, before query embedding and before the completion call. State the behaviour when a query redacts to nothing — default: ask the user to rephrase, never answer from the emptied query.
- DO redact chunk metadata, titles, source paths and the rendered citation string, not only the chunk body.
- DO run a redaction pass over the assembled context — retrieved chunks, tool results, history, user message — on every request. It is unconditional defense in depth, not a migration step for corpora predating the policy.
- DO treat a reversible token map as PII itself: encrypted at rest, access-controlled separately from the index, and deleted on the same erasure path as the source document.
- DO join the redaction version to the chunking version in the embedding cache key.
- DO treat a redaction-version bump as remediation: re-ingest the affected sources and delete the superseded chunks and vectors. Cache invalidation is not remediation — the unredacted vectors survive it.
- DO name any data class intentionally left unmasked in the `## Redaction` block; leaving one unmasked raises the feature to `rule-sensitive-data` (threat model, security review, human approval).
- `pre-index-redaction` artifact of the same rule: a `## Redaction` block stating the detectors, the data classes covered, the masking strategy (drop, mask, or reversible tokenize under the data's own retention), the query-side behaviour on an emptied query, and what is intentionally left unmasked and why.

### Retrieval quality

- DO chunk by semantic units (sections, paragraphs) with metadata, not fixed char counts blindly.
- DO measure retrieval quality separately from generation quality — most RAG failures are retrieval failures. Retrieval is measured with **Recall@K**, **Precision@K** and **MRR** against the golden set; generation with **groundedness** (every claim traceable to a retrieved chunk) and **faithfulness** (no claim contradicts the chunks). A feature that reports only an end-to-end pass rate cannot say which half is broken.
- DO keep the retrieval baseline in `evals/<feature>/retrieval/BASELINE.md` (metric, K, value, date, index version) — this is the `retrieval-evaluation` artifact `registries/decision-rules.json` requires when knowledge is volatile. A prompt or index change that lowers Recall@K does not ship.
- DO retrieve hybrid by default — dense (vector) AND lexical (BM25/full-text) — then re-rank the merged candidate set before the top-N reaches the model. Dense-only misses exact identifiers, codes and rare terms; lexical-only misses paraphrase. Skip the re-ranker only when Precision@K on the golden set is already above the feature's threshold without it — and record that measurement.
- DO declare a freshness policy per corpus: what triggers re-indexing, the maximum acceptable staleness, and how a stale answer is labelled — the `freshness-policy` artifact of the same decision rule, declared as a `## Freshness` block in the feature's README or spec.
- DO include source references in outputs so answers are verifiable.
- DON'T stuff context: retrieval top-k is a tuned parameter, more ≠ better; tune K on Recall@K vs. Precision@K, not on vibes.

## Agents
- DO give agents few, well-described tools (5–10 sharp tools beat 30 vague ones).
- DO cap agent loops (max iterations, max cost) — runaway agents burn money.
- DO make tool errors informative to the model: return what went wrong and what to try, not just "error".
