---
name: eval-harness
description: "Plan LLM golden cases/scorers; scaffold production-path eval runners only at the approved final stage. Use for eval setup, missing feature evals, golden sets or judge rubrics."
---

# Eval Harness Scaffold

Author executable tests/evals **only after integrated implementation and explicit
current-task final-stage approval** (`rules/verification.md`). Earlier invocation
plans cases/metrics then returns pending approval. Use Node.js/TypeScript,
zod/JSON Schema and the existing npm/pnpm/yarn runner. Exercise production Mastra
agents/workflows through NestJS providers with production authenticated context and
tool permissions; verify installed evaluation APIs against official docs.

`rules/llm-apps.md` owns eval policy; `llm-engineering` owns techniques;
this skill owns machinery. Legacy Python interfaces are historical only.

## Procedure

1. Locate typed input/output schema. If absent, stop and establish the structured
   contract before the harness.
2. Build golden cases **with the user**, paced/sized by `rules/llm-apps.md`, in
   `evals/<feature>/cases.json`. Prefer production/log examples, then realistic
   hand-written cases, then synthetic:

   ```json
   { "id": "kebab-id", "input": {}, "expected": {}, "note": "why this exists" }
   ```

   Include typical, empty/long/ambiguous/adversarial injection and past failures.
   For RAG also require:
   - Cross-tenant **pair**: same query, owner B returns target at rank 1; principal
     A gets zero hits with empty `expected.relevant_chunk_ids` and a zero-hit
     scorer. Positive control distinguishes ACL filtering from broken retrieval.
   - PII source: assert masked values in retrieved chunk **and stored payload**,
     plus generated output. Clean output alone cannot prove pre-index redaction.
   - No-answer query genuinely outside corpus: assert the “not found” response
     **and no fabricated claims**, measuring relevance threshold.
   - With query rewrite, a history-dependent follow-up carrying its prior turn;
     score rewritten-query retrieval, not a plausible wrong-topic answer.
3. Choose cheapest adequate scorer: exact(enums/ids/bools), schema(always),
   set(unordered members), numeric(tolerance), contains/regex(fragments),
   judge(fuzzy criteria only), retrieval(Recall@K/Precision@K/MRR on ranked vs
   relevant ids; load `references/retrieval-metrics.md`). For generation judge
   groundedness/faithfulness as yes/no **per claim**, never a scale.
4. Write `evals/<feature>/run.ts`: load → production entrypoint → score → report,
   never a copied prompt. Limit concurrency (~5/p-limit), isolate case crashes,
   log prompt version/model, print failures(id/field/expected/got) then
   `PASS n/m (x%)`. Exit 1 below feature threshold (start ≥90% or baseline;
   never silently lower). For RAG call retriever/generator separately, print
   retrieval-per-K and generation tables, write retrieval/BASELINE.md and report
   rewrite/retrieve/re-rank/generate latency.
5. If judging, use a separate cheaper model, preferably outside feature family.
   Yes/no rubric, structured `{pass: boolean, reason: string}`, no 1–5 scale.
   Manually calibrate 10 verdicts before trusting it.
6. Add `"eval:<feature>": "tsx evals/<feature>/run.ts"` in package.json. CI
   automation needs separate request/approval; current-task test consent cannot
   authorize automatic future runs.
7. Run once within approved scope; record date/prompt version/pass rate in
   `evals/<feature>/BASELINE.md`. Prompt/model changes show before/after per
   `rules/llm-apps.md`.

## Completion checks

Production path, injection case and calibrated judge are required. RAG requires
retrieval scorers, both cross-tenant controls and indexed-PII assertions. Reviewed
negative-feedback/low-grounding failures become golden cases in the fixing PR.
Semantic-cache/query-rewrite changes need before/after eval evidence to merge;
unapproved evidence stays pending. No automatic CI/testing authorization is implied.
