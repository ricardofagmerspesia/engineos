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
- DO measure retrieval quality separately from generation quality — most RAG failures are retrieval failures.
- DO include source references in outputs so answers are verifiable.
- DON'T stuff context: retrieval top-k is a tuned parameter, more ≠ better.

## Agents
- DO give agents few, well-described tools (5–10 sharp tools beat 30 vague ones).
- DO cap agent loops (max iterations, max cost) — runaway agents burn money.
- DO make tool errors informative to the model: return what went wrong and what to try, not just "error".
