---
name: llm-engineering
description: "Build Mastra LLM features/chatbots: typed prompts/tools, structured output, RAG and eval planning. Use for model calls, tool definitions, retrieval pipelines and prompt changes."
---

# LLM Engineering

Apply `rules/llm-apps.md` from the EngineOS install root first; this skill adds
procedures. All backend LLM APIs/workers run in NestJS modules/providers. Mastra
owns agents, tools, workflows and memory; NestJS owns startup, auth/transport and
lifecycle. Load `mastra-patterns`; use no separate Mastra server. Reusable
TypeScript helpers/CLI libraries follow `rules/base.md`.

## Feature procedure

1. Define typed input and zod/JSON Schema output; code validates structured output,
   never parses prose. Plan acceptance/eval criteria before implementation.
2. Export `{ version, system, buildUser(input) }` from `prompts/<feature>.ts`;
   bump version on prompt-text changes. Use synthetic few-shots and data fences.
3. Route every model call through the existing Mastra-backed NestJS provider;
   create that boundary first if absent. Apply `rules/llm-apps.md` timeouts,
   backoff, max_tokens, usage/latency and prompt-version tags.
4. Validate output; retry once with schema feedback, then return a typed failure.
5. After integration and explicit current-task final-stage approval, author golden
   cases/run `npm run eval:<feature>`, recording before/after evidence.
   Otherwise mark executable evidence pending. Plan fence-escape, customer-data
   denylist and version-pin probes before code; author/run only in that stage.

## Tools

Follow `rules/llm-apps.md` Agents/Security: few sharp tools (5–10 rather than 30),
least privilege, capped loops, human consent for destructive actions. Feature-flag
each tool together with its prompt block. Return actionable errors such as
`date must be ISO-8601, got '12/5'`, not bare “error”.

## RAG procedure

`rules/llm-apps.md` owns chunking, retrieval/re-ranking, freshness/citation,
ACLs and pre-index redaction. Apply these additions:

- Store chunking/redaction/parser/embedding versions. Chunking changes re-embed
  affected entries only; redaction changes re-ingest affected sources and delete
  superseded chunks/vectors, which otherwise retain unredacted text.
- Ingestion: `source → raw doc store/content hash → versioned parse → dedupe →
  redact → chunk(metadata, ACL from source permissions) → pinned embed → store`.
  Rebuilds replay this projection rather than re-downloading sources.
- Query: `bounded untrusted rewrite → redact query → [dense+ACL | lexical+ACL]
  → RRF merge → re-rank(filtered candidates) → top-N → token-budget assembly,
  parent expansion/source stamps → generate`. Dense/lexical search run in
  parallel; enforce principal ACL in **each** branch before search, never only
  before fan-out or after merge. Re-rank ~3–5×N already-filtered candidates to N.
- Derive chunk id as `hash(source id + offsets + chunking/redaction/parser/embedding
  versions)`: unchanged ingestion upserts identical rows; version changes identify
  superseded rows for deletion.
- Check cross-tenant leakage first: any foreign chunk is CRITICAL and stops quality
  diagnosis. Then low Recall@K → chunking/index/hybrid weights; good recall but low
  Precision@K → re-ranker; good retrieval but poor grounding → generation prompt.
- Query-rewrite/semantic-cache changes carry prompt-change evidence: before/after
  Recall@K and eval pass rate in the PR. Pending unapproved evals are not evidence.
- Capture trace id, prompt version, retrieved ids/scores, explicit ratings/corrections
  and implicit retry/abandon/no-citation-click signals. Send negative feedback or low
  grounding to human review; each reviewed failure becomes a golden case in its
  fixing PR, authored in the approved final test stage.

Load `skills/eval-harness/references/retrieval-metrics.md` for formulas/K/scorers;
invoke `eval-harness` for cases, runner, scorers, judge rubric and npm wiring.

## Model selection

Verify current models/prices through provider docs or available external
`claude-api` skill. Prefer the cheapest model meeting approved eval criteria;
start small and escalate on failure. Use prompt caching for repeated context and
batch APIs for offline jobs.
