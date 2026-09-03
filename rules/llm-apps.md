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

## Evals — no vibes-driven development
- DO build a golden set (10–50 real cases with expected outputs) before iterating on any prompt/agent.
- DO run evals on every prompt/model/temperature change; track pass rate over time.
- DO use LLM-as-judge for fuzzy criteria, exact match for structured outputs.
- DON'T ship a prompt change because one manual test looked good.

## Reliability & cost
- DO set max_tokens, timeouts, and retry-with-backoff on every model call.
- DO design fallbacks: degraded model, cached answer, or honest "unavailable" — never hang.
- DO log every call: prompt version, model, latency, token counts, outcome. Tokens are money — budget per feature.
- DO cache aggressively: embeddings permanently (content-hash key), completions where inputs repeat (prompt caching).

## RAG
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
