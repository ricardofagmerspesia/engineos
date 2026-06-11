---
name: llm-engineering
description: Patterns for building LLM features and agents — prompt design, tool schemas, structured output, RAG, and eval harnesses. Use when writing or modifying code that calls LLM APIs, defines agent tools, builds RAG pipelines, or iterates on prompts.
---

# LLM Engineering

Apply `rules/llm-apps.md` from EngineOS first. This skill adds procedures.

## Adding/changing an LLM feature — procedure

1. **Define the contract first**: input type → output schema (zod). The model fills the contract; code never parses prose.
2. **Write the golden set BEFORE the prompt**: 10+ real input cases with expected outputs in `evals/<feature>/cases.json`. No golden set = no merge.
3. **Prompt as versioned artifact**: `prompts/<feature>.ts` exporting `{ version, system, buildUser(input) }`. Bump version on change; note why in a comment.
4. **Call wrapper**: every call goes through the project's LLM client wrapper (timeout, retry w/ backoff, max_tokens, token/latency logging, prompt version tag). If the project has none, create it before the feature.
5. **Validate output** against the zod schema; on failure retry once with the validation error appended to the conversation; then fall back/error honestly.
6. **Run evals**: script `npm run eval:<feature>` printing pass rate. Compare before/after on any prompt or model change. Paste the numbers in the PR.

## Tool design for agents

- 5–10 sharp tools max. Each tool: clear name, one-line description stating WHEN to use it, strict input schema with described fields.
- Tool results returned to the model: structured, concise, and on error say what failed + what to try (`"date must be ISO-8601, got '12/5'"`).
- Least privilege: read-only agents get read-only tools. Destructive tools require human confirmation in the loop.
- Cap loops: max iterations and max cumulative tokens per run; log when caps hit.

## RAG checklist

- Chunking: semantic units with metadata (source, section, date). Store the chunking version with the embedding.
- Embeddings cached by content hash — re-embed only changed content.
- Eval retrieval separately: for each golden question, is the right chunk in top-k? Fix retrieval before touching the generation prompt.
- Answers cite sources (ids/links) so users can verify.

## Eval harness shape (minimum viable)

```
evals/<feature>/
  cases.json        # [{ input, expected, note }]
  run.ts            # loads cases, calls feature, scores
```

Scoring: exact/schema match for structured output; LLM-judge (separate cheap model, rubric prompt) for fuzzy text. Output: pass rate + failures table. Track rate in PR descriptions over time.

## Model selection defaults

- Check current models/pricing via the `claude-api` skill or provider docs — don't hardcode from memory.
- Cheapest model that passes evals wins. Start small, escalate only on eval failure.
- Prompt caching for repeated system prompts/context; batch API for offline jobs.
