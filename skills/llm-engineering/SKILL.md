---
name: llm-engineering
description: Patterns for building LLM features and agents — prompt design, tool schemas, structured output, RAG, and when to set up evals (via `eval-harness`). Use when writing or modifying code that calls LLM APIs, defines agent tools, builds RAG pipelines, or iterates on prompts.
---

# LLM Engineering

Apply `rules/llm-apps.md` from EngineOS first (EngineOS rules — resolved relative to
EngineOS's `CLAUDE.md`, the repo/plugin root, not this project). This skill adds
procedures.

## Adding/changing an LLM feature — procedure

1. **Define the contract first**: input type → output schema (zod). The model fills the contract; code never parses prose.
2. **Write the golden set BEFORE the prompt**: sized per `rules/llm-apps.md`, real input cases with expected outputs in `evals/<feature>/cases.json`. No golden set = no merge.
3. **Prompt as versioned artifact**: `prompts/<feature>.ts` exporting `{ version, system, buildUser(input) }`. Bump version on change; note why in a comment.
4. **Call wrapper**: every call goes through the project's LLM client wrapper — reliability/cost fields per `rules/llm-apps.md` (timeout, retry-with-backoff, max_tokens, token/latency logging, prompt version tag). If the project has none, create it before the feature.
5. **Validate output** against the zod schema — retry-once-then-fallback per `rules/llm-apps.md`.
6. **Run evals**: script `npm run eval:<feature>` printing pass rate. Compare before/after on any prompt or model change. Paste the numbers in the PR.

## Tool design for agents

Tool design follows `rules/llm-apps.md` (Agents + Security sections): few sharp tools
(5–10 beat 30 vague ones), least privilege, human confirmation for destructive actions,
capped loops. Team addition — tool-error messages returned to the model must say what
failed and what to try, not just "error":

```
"date must be ISO-8601, got '12/5'"
```

## RAG checklist

Chunking, metrics, hybrid retrieval, re-ranking, freshness and source citation are ruled by
`rules/llm-apps.md` (RAG + Reliability sections). Team additions:

- Store the chunking version alongside the embedding, so re-chunking invalidates the right cache entries.
- Pipeline shape: `query -> [dense search, lexical search] -> merge (RRF) -> re-rank -> top-N -> generator`.
  Dense and lexical run in parallel; Reciprocal Rank Fusion merges without score calibration; the
  re-ranker (cross-encoder or LLM pointwise) sees ~3-5x N candidates and returns N.
- Diagnose in this order, never the reverse: Recall@K low -> fix chunking/index/hybrid weights;
  Recall fine but Precision@K low -> add or tune the re-ranker; retrieval fine but groundedness
  low -> fix the generation prompt. Touching the prompt while Recall@K is low hides the real fault.
- Formulas, K choice and the scorer implementation: `skills/eval-harness/references/retrieval-metrics.md`.

## Eval harness

Scaffolding the harness itself (golden cases, runner, scorers, judge rubric, npm script)
is the `eval-harness` skill's job — invoke it rather than hand-rolling the tree here.

## Model selection defaults

- Check current models/pricing via the `claude-api` skill (external/global — availability varies by machine) or provider docs — don't hardcode from memory.
- Cheapest model that passes evals wins. Start small, escalate only on eval failure.
- Prompt caching for repeated system prompts/context; batch API for offline jobs.
