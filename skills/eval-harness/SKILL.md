---
name: eval-harness
description: Scaffold a complete eval harness for an LLM feature — golden cases, runner, scorers, LLM-judge rubric, npm script. Use when an LLM feature has no evals yet, or when "set up evals", "eval harness", "golden set" is requested.
---

# Eval Harness Scaffold

## Boundary

Ownership boundary for eval guidance: `rules/llm-apps.md` (EngineOS rule, resolved
relative to EngineOS's `CLAUDE.md` — the repo/plugin root — not this project) sets
the eval rules (golden set before iterating, run on every change, judge vs exact
match), `llm-engineering` carries the how-to patterns, and this skill builds the
machinery. Do not restate the rules here.

Goal: `npm run eval:<feature>` printing a pass rate, runnable locally and in CI. No LLM feature merges without one (`rules/llm-apps.md`).

## Ownership boundary for eval guidance

`rules/llm-apps.md` sets the eval rules (golden set before iterating, run on every
change, judge vs exact match), `llm-engineering` carries the how-to patterns, and
this skill builds the machinery. Do not restate the rules here.

## Procedure

1. **Locate the feature contract.** Find the feature's input type and output schema (zod). No schema → stop and fix that first (structured output rule).
2. **Build the golden set with the user**, sized and paced per `rules/llm-apps.md`, in `evals/<feature>/cases.json`. Source priority: real production/log examples > hand-written realistic cases > synthetic. Each case:
   ```json
   { "id": "kebab-id", "input": {...}, "expected": {...}, "note": "why this case exists" }
   ```
   Must include: typical cases, edge cases (empty, long, ambiguous, adversarial/injection attempt), and known past failures.
   For RAG features, must also include:
   - One cross-tenant retrieval **pair**, same query, two principals: as principal B (the owner) it must return the target chunk at rank 1, and as principal A it must return zero hits — `expected.relevant_chunk_ids` empty, scored by a scorer asserting zero hits rather than low rank. Both halves are required; a zero-hit case on its own also passes against a retriever that is simply broken, so the positive control is what makes it evidence of a filter.
   - One case whose source document carries PII, asserting on the indexed artifact — the retrieved chunk text and the stored payload contain the mask, not the raw value — as well as on the generated output. A clean answer over a chunk that still holds the PII means redaction ran on the wrong side of the index.
3. **Pick scorers per field** — cheapest that proves correctness:
   - `exact` — enums, ids, booleans
   - `schema` — output parses against zod schema (always on)
   - `set` — array membership ignoring order
   - `numeric` — tolerance band
   - `contains` / `regex` — required fragments in text
   - `judge` — LLM-as-judge; scope per `rules/llm-apps.md` (fuzzy criteria such as tone, faithfulness, relevance — never exact-match-able fields)
   - `retrieval` — `recall_at_k`, `precision_at_k`, `mrr` over `expected.relevant_chunk_ids` vs. the retriever's ranked ids; see `references/retrieval-metrics.md`
   - `judge` criteria for RAG generation: `groundedness` (every claim maps to a retrieved chunk) and `faithfulness` (no claim contradicts one) — yes/no per claim, never a scale
4. **Write the runner** `evals/<feature>/run.ts`, matching project conventions:
   - Load cases → call the real feature code (same entrypoint production uses, NOT a copy of the prompt) → score → report.
   - Concurrency-limited (p-limit ~5), per-case try/catch (one crash ≠ dead run), prompt version + model logged in the report header.
   - Output: table of failures (id, field, expected vs got), then `PASS n/m (x%)`. Exit code 1 below threshold.
   - Threshold: define per feature (start: ≥90% or current baseline, never lower it silently).
   - For RAG features the runner calls the retriever and the generator separately and reports two tables — retrieval metrics per K, then generation pass rate — plus writes `evals/<feature>/retrieval/BASELINE.md`.
5. **Judge setup (only if used):** separate, cheaper model than the feature under test. Rubric prompt: criteria as yes/no questions, 1–5 scale forbidden (drift), output via structured output `{pass: boolean, reason: string}`. Spot-check 10 judge verdicts by hand once before trusting it.
6. **Wire up:** add `"eval:<feature>": "tsx evals/<feature>/run.ts"` to package.json. Mention CI: run on PRs touching the feature's prompts/ or feature dir.
7. **Baseline:** run once, record the rate in `evals/<feature>/BASELINE.md` with date + prompt version. Change cadence (every prompt/model change pastes before/after) per `rules/llm-apps.md`.

## Quality bar

- Eval calls the production code path — a harness testing a copied prompt drifts and lies.
- Cases include at least one prompt-injection attempt for any feature consuming untrusted content.
- Judge never judges its own model family's output if avoidable; never judge without spot-check calibration.
- Golden set grows: every production failure becomes a case in the same PR that fixes it.
- A RAG eval that has no `retrieval` scorer is incomplete: it cannot tell a retrieval failure from a generation failure.
- A RAG eval over a shared corpus that has no cross-tenant pair is incomplete: the zero-hit half alone cannot distinguish an ACL filter from a broken retriever, and without either half a retriever with no filter passes every other case.
- A RAG eval whose PII case asserts only on the generated text is incomplete: it cannot see raw PII sitting in the chunk store or the vectors.
