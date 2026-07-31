---
name: eval-harness
description: Scaffold a complete eval harness for an LLM feature — golden cases, runner, scorers, LLM-judge rubric, npm script. Use when an LLM feature has no evals yet, or when "set up evals", "eval harness", "golden set" is requested. Ownership boundary for eval guidance: `rules/llm-apps.md` sets the eval rules (golden set before iterating, run on every change, judge vs exact match), `llm-engineering` carries the how-to patterns, and this skill builds the machinery. Do not restate the rules here.
---

# Eval Harness Scaffold

Goal: `npm run eval:<feature>` printing a pass rate, runnable locally and in CI. No LLM feature merges without one (`rules/llm-apps.md`).

## Procedure

1. **Locate the feature contract.** Find the feature's input type and output schema (zod). No schema → stop and fix that first (structured output rule).
2. **Build the golden set with the user.** 10–50 cases in `evals/<feature>/cases.json`. Source priority: real production/log examples > hand-written realistic cases > synthetic. Each case:
   ```json
   { "id": "kebab-id", "input": {...}, "expected": {...}, "note": "why this case exists" }
   ```
   Must include: typical cases, edge cases (empty, long, ambiguous, adversarial/injection attempt), and known past failures.
3. **Pick scorers per field** — cheapest that proves correctness:
   - `exact` — enums, ids, booleans
   - `schema` — output parses against zod schema (always on)
   - `set` — array membership ignoring order
   - `numeric` — tolerance band
   - `contains` / `regex` — required fragments in text
   - `judge` — LLM-as-judge, ONLY for genuinely fuzzy criteria (tone, faithfulness, relevance)
4. **Write the runner** `evals/<feature>/run.ts`, matching project conventions:
   - Load cases → call the real feature code (same entrypoint production uses, NOT a copy of the prompt) → score → report.
   - Concurrency-limited (p-limit ~5), per-case try/catch (one crash ≠ dead run), prompt version + model logged in the report header.
   - Output: table of failures (id, field, expected vs got), then `PASS n/m (x%)`. Exit code 1 below threshold.
   - Threshold: define per feature (start: ≥90% or current baseline, never lower it silently).
5. **Judge setup (only if used):** separate, cheaper model than the feature under test. Rubric prompt: criteria as yes/no questions, 1–5 scale forbidden (drift), output via structured output `{pass: boolean, reason: string}`. Spot-check 10 judge verdicts by hand once before trusting it.
6. **Wire up:** add `"eval:<feature>": "tsx evals/<feature>/run.ts"` to package.json. Mention CI: run on PRs touching the feature's prompts/ or feature dir.
7. **Baseline:** run once, record the rate in `evals/<feature>/BASELINE.md` with date + prompt version. Every prompt/model change PR pastes before/after.

## Quality bar

- Eval calls the production code path — a harness testing a copied prompt drifts and lies.
- Cases include at least one prompt-injection attempt for any feature consuming untrusted content.
- Judge never judges its own model family's output if avoidable; never judge without spot-check calibration.
- Golden set grows: every production failure becomes a case in the same PR that fixes it.
