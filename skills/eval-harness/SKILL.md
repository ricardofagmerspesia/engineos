---
name: eval-harness
description: Scaffold a complete eval harness for an LLM feature — golden cases, runner, scorers, LLM-judge rubric, npm script or pytest marker. Use when an LLM feature has no evals yet, or when "set up evals", "eval harness", "golden set" is requested.
---

# Eval Harness Scaffold

## Boundary

Ownership boundary for eval guidance: `rules/llm-apps.md` (EngineOS rule, resolved
relative to EngineOS's `CLAUDE.md` — the repo/plugin root — not this project) sets
the eval rules (golden set before iterating, run on every change, judge vs exact
match), `llm-engineering` carries the how-to patterns, and this skill builds the
machinery. Do not restate the rules here.

Goal: `npm run eval:<feature>` (Node) or `pytest -m eval tests/evals/<feature>` (Python) printing a pass rate, runnable locally and in CI. No LLM feature merges without one (`rules/llm-apps.md`).

## Stack

The procedure below is the Node shape. Resolve the stack first (`scripts/kernel.sh resolve-stack <dir>`); on a Python package apply the same seven steps with the substitutions in **Python variant** at the end.

## Ownership boundary for eval guidance

`rules/llm-apps.md` sets the eval rules (golden set before iterating, run on every
change, judge vs exact match), `llm-engineering` carries the how-to patterns, and
this skill builds the machinery. Do not restate the rules here.

## Procedure

1. **Locate the feature contract.** Find the feature's input type and output schema (zod / Pydantic). No schema → stop and fix that first (structured output rule).
2. **Build the golden set with the user**, sized and paced per `rules/llm-apps.md`, in `evals/<feature>/cases.json`. Source priority: real production/log examples > hand-written realistic cases > synthetic. Each case:
   ```json
   { "id": "kebab-id", "input": {...}, "expected": {...}, "note": "why this case exists" }
   ```
   Must include: typical cases, edge cases (empty, long, ambiguous, adversarial/injection attempt), and known past failures.
   For RAG features, must also include:
   - One cross-tenant retrieval **pair**, same query, two principals: as principal B (the owner) it must return the target chunk at rank 1, and as principal A it must return zero hits — `expected.relevant_chunk_ids` empty, scored by a scorer asserting zero hits rather than low rank. Both halves are required; a zero-hit case on its own also passes against a retriever that is simply broken, so the positive control is what makes it evidence of a filter.
   - One case whose source document carries PII, asserting on the indexed artifact — the retrieved chunk text and the stored payload contain the mask, not the raw value — as well as on the generated output. A clean answer over a chunk that still holds the PII means redaction ran on the wrong side of the index.
   - One **no-answer** case: a question the corpus genuinely cannot answer. `expected` is the feature's "not found in the sources" response, and the scorer asserts the absence of any fabricated claim, not just the presence of the phrase. Without it nothing measures the relevance threshold, and a retriever tuned only on answerable questions is rewarded for always answering.
   - One **history-dependent** case wherever query rewrite is used: a follow-up whose pronoun or reference only resolves against the prior turn (`input` carries that turn). Scored on the retrieval metrics of the rewritten query — an unresolved reference retrieves the previous topic, which looks plausible and is wrong.
3. **Pick scorers per field** — cheapest that proves correctness:
   - `exact` — enums, ids, booleans
   - `schema` — output parses against the zod / Pydantic schema (always on)
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
   - For RAG features also report per-stage latency (rewrite, retrieve, re-rank, generate) in the report header or as a column, so a regression is attributed to a stage instead of to the feature.
5. **Judge setup (only if used):** separate, cheaper model than the feature under test. Rubric prompt: criteria as yes/no questions, 1–5 scale forbidden (drift), output via structured output `{pass: boolean, reason: string}`. Spot-check 10 judge verdicts by hand once before trusting it.
6. **Wire up:** add `"eval:<feature>": "tsx evals/<feature>/run.ts"` to package.json (Python: the `eval` marker, see below). Mention CI: run on PRs touching the feature's prompts/ or feature dir.
7. **Baseline:** run once, record the rate in `evals/<feature>/BASELINE.md` with date + prompt version. Change cadence (every prompt/model change pastes before/after) per `rules/llm-apps.md`.

## Quality bar

- Eval calls the production code path — a harness testing a copied prompt drifts and lies.
- Cases include at least one prompt-injection attempt for any feature consuming untrusted content.
- Judge never judges its own model family's output if avoidable; never judge without spot-check calibration.
- Golden set grows: every production failure — including each one routed through the human review queue by negative feedback or low groundedness — becomes a case in the same PR that fixes it.
- A semantic-cache or query-rewrite change with no before/after eval numbers pasted does not merge. Both change what the retriever is asked and what the user is served, so they carry a prompt change's evidence burden.
- A RAG eval that has no `retrieval` scorer is incomplete: it cannot tell a retrieval failure from a generation failure.
- A RAG eval over a shared corpus that has no cross-tenant pair is incomplete: the zero-hit half alone cannot distinguish an ACL filter from a broken retriever, and without either half a retriever with no filter passes every other case.
- A RAG eval whose PII case asserts only on the generated text is incomplete: it cannot see raw PII sitting in the chunk store or the vectors.

## Python variant

Same seven steps; these are the substitutions (design §D13 of the Python stack spec):

- **Tree**: `tests/evals/<feature>/{golden.jsonl, test_golden.py, judge.py}` — one case per line in `golden.jsonl` with the same `{id, input, expected, note}` fields; `BASELINE.md` beside them.
- **Contract**: the feature's Pydantic output model, imported from the feature — never redefined in the test. The `schema` scorer is `Model.model_validate(got)`.
- **Runner**: `test_golden.py` marked `pytestmark = pytest.mark.eval`; register the marker in `[tool.pytest.ini_options]` and keep it out of the default run (`addopts = "-m 'not eval'"`). `pytest -m eval tests/evals/<feature>` is the command CI wires.
- **Concurrency**: `asyncio.gather` over the cases behind an `asyncio.Semaphore(5)`; per-case `try/except` so one crash is one failure, not a dead run.
- **Three golden-set kinds** for agent projects: per tool (question → expected query/arguments), per agent (task packet → output contract), and one end-to-end. **No test calls the provider by default** — the port is the `FakeLLM` from `conftest.py` and the assertion is on the contract. A live run (`EVAL_LIVE=1`, real adapter, spend cap) is the explicit opt-in that produces the before/after numbers a prompt change pastes in its PR.
- **In-product scoring** stays limited to the runtime evaluator node (a Pydantic verdict, bounded retry) and the deterministic grounding check; the eval suite never ships in the product path.
- **Judge** (`judge.py`): same rubric rules as step 5, output as a Pydantic `Verdict(pass_: bool, reason: str)` with `model_validate_json` and one retry-with-feedback on `ValidationError`.

```python
# tests/evals/<feature>/test_golden.py — spec §D13
pytestmark = pytest.mark.eval
CASES = [json.loads(line) for line in (Path(__file__).with_name("golden.jsonl").read_text().splitlines()) if line.strip()]
THRESHOLD = 0.90  # or the current BASELINE.md rate; never lowered silently
LIMIT = asyncio.Semaphore(5)

async def run_case(use_case, case: dict) -> tuple[str, bool, str]:
    async with LIMIT:
        try:
            got = await use_case.execute(Command(**case["input"]))   # the production entrypoint, not a copied prompt
        except Exception as exc:  # one crash is one failed case
            return case["id"], False, f"raised {type(exc).__name__}: {exc}"
    return case["id"], *score(case["expected"], Output.model_validate(got))

async def test_golden_set_meets_the_threshold(use_case):
    results = await asyncio.gather(*(run_case(use_case, case) for case in CASES))
    failures = [(case_id, why) for case_id, ok, why in results if not ok]
    rate = 1 - len(failures) / len(results)
    report = "\n".join(f"{case_id}: {why}" for case_id, why in failures) + f"\nPASS {len(results) - len(failures)}/{len(results)} ({rate:.0%})"
    assert rate >= THRESHOLD, report
```
