# RAG corpus safety: access control at retrieval and redaction before indexing

Date: 2026-09-11. Status: accepted. Owner: llm-coordinator (hermsdorff), security-reviewer (leo-ely) for the review lens.

## Problem

A gap analysis of `rules/llm-apps.md`, `skills/llm-engineering`, `skills/eval-harness` and
`agents/security-reviewer.md` against a standard production-RAG reference map found
two security holes with no rule behind them:

1. **No access control at retrieval.** Nothing requires per-chunk ACL or tenant
   metadata, nor that the retriever filter by the caller's principal. A shared
   vector index without that filter is an IDOR on documents: user A retrieves
   user B's chunks by asking the right question. `rules/security.md` owns
   object-level authorization for endpoints but never names the retrieval path,
   and `agents/security-reviewer.md` does not hunt for it.
2. **No redaction before embedding or prompting.** `rules/security.md` keeps PII
   out of logs and `rules/data.md` requires encryption at rest, but an embedding
   is a copy of the source text that both rules miss: raw PII reaches the
   embedding provider, sits in the vector store, and can be partially inverted
   from the vector.

Quality gaps found alongside (ingestion pipeline, query rewrite, metadata filters,
feedback loop) are deliberately out of scope here; they are not security floors.

## Decision

Add two named artifacts to the RAG section of `rules/llm-apps.md`, mirror them in
the two skills that carry the how-to, register them as a decision rule, and add the
hunting items to the security reviewer's pass order.

### Artifacts

| Artifact id | Where it lives in an adopting project | What it must state |
|---|---|---|
| `retrieval-acl` | `## Access` block in the feature README or spec | principal source (session, token claim), the chunk metadata field carrying the source document's ACL or tenant, and the point where the filter is applied — before ranking, server-side, never by prompt instruction |
| `pre-index-redaction` | `## Redaction` block in the same document | detector(s), data classes covered, masking strategy (drop, mask, tokenize with a reversible map under the data's own retention), and what is intentionally left unmasked and why |

### Rules (frozen text intent, exact wording owned by `rules/llm-apps.md`)

- Filter before ranking. Post-filtering the top-K leaks: recall drops silently for
  the legitimate caller, and a non-empty result set before the filter tells an
  attacker the document exists.
- A cross-tenant golden case that must return zero hits is part of the retrieval
  eval; a RAG eval without one is incomplete, same footing as the existing
  "no `retrieval` scorer" line in `skills/eval-harness/SKILL.md`.
- Redaction happens at ingestion, before chunking and embedding, and again on the
  assembled context if the corpus predates the policy. The redaction version joins
  the chunking version in the cache key so a policy change invalidates the right
  embeddings.
- The pipeline shape in `skills/llm-engineering/SKILL.md` gains an ingestion half:
  `parse -> redact -> chunk (+ acl metadata) -> embed -> store`, and the query half
  starts with the principal filter.

### Registry

New rule `rule-rag-corpus-safety` in `registries/decision-rules.json`:
`when: { retrieval_over_shared_corpus: true }`, `require: ["retrieval-acl",
"pre-index-redaction"]`, priority 95 (below `rule-sensitive-data` at 100, above
`rule-verification` at 90), `gate: design` so the two artifacts are design-gate
exit criteria rather than advisory. Signals name the vocabulary of retrieval over a
corpus (`rag`, `semantic search`, `hybrid search`, `vector (db|database|store|index|search)`,
store names, `bm25`, `re-rank`, `knowledge base`) and require `retriev*`,
`embeddings`, `chunk*` to appear within 40 characters of a corpus word (`corpus`,
`documents`, `index`, `knowledge`, `tenant`) so "fix the data retrieval bug" and
"rename the embeddings util" do not fire. The keyword tier evaluates only
`signals`; the `when` key is documentation for the model tier. No `risk: high`: a
plain "rag" prompt must not raise `any_high` and fire HITL on every LLM task;
`rule-sensitive-data` already raises the tier when PII is actually named.

### Security review additions (fix round, 2026-09-11)

The security-reviewer pass over the first draft found the text closeable to the
letter while still leaking. The rules therefore also state: the principal is
derived server-side from session or token, never a model- or client-writable
argument; ACL metadata comes from the source system's permissions, never from
document content or filenames; a chunk with no ACL is unretrievable and ACL
staleness is bounded; the filter is pushed into every retriever branch and bounds
the re-ranker's candidates; retrieval and completion cache keys include the
principal; derived chunks carry the intersection of their sources' ACLs; a
redaction-version bump re-ingests and purges, cache invalidation is not
remediation; the user's query and chunk metadata, titles, paths and citations are
redacted too; a reversible token map is itself PII; the assembled-context pass is
unconditional; an unmasked data class raises the feature to `rule-sensitive-data`.
The eval cases became a pair (outsider zero hits, owner rank 1) and the PII case
asserts on the indexed payload, not only the answer.

### Reviewer

`agents/security-reviewer.md` Method step 3 gains a retrieval-authorization bullet;
the hardening checklist gains one item for retrieval filtering and one for
redaction before embedding and prompting.

## Rejected alternatives

- **Extend `rule-volatile-knowledge`'s `require` list.** Cheapest edit, but that rule
  is about knowledge freshness; ACL and redaction apply to a static corpus too, and
  a reader looking for the security requirement would never look under
  "volatile knowledge".
- **Mark the new rule `risk: high`.** Would make every RAG prompt a HITL gate. The
  tier should rise when sensitive data is present (`rule-sensitive-data` does that),
  not because the word "retrieval" appeared.
- **Put the rules in `rules/security.md`.** Security is always-on and every row may
  cite it, but the mechanism (chunk metadata, pre-filter, embedding cache key) is
  RAG-specific vocabulary; `security.md` owns WHAT is sensitive, `llm-apps.md` owns
  HOW a retrieval pipeline honours that. Cross-reference instead.

## Files

- `rules/llm-apps.md`, `skills/llm-engineering/SKILL.md`, `skills/eval-harness/SKILL.md` — hermsdorff
- `registries/decision-rules.json`, `agents/security-reviewer.md`, this spec, the change record — orchestrator
- Review: security-reviewer AUDIT over the diff before the final gate

## Verification

Final gate only: `scripts/validate-engineos.sh` (C14 checks the new decision rule's
id uniqueness, regex validity and source path), lint. Tests not in scope.
