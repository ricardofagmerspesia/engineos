---
name: 2026-09-03-rag-retrieval-metrics
status: active
owner: llm-coordinator (hermsdorff)
spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md
domain: llm
---

## What
Name the RAG retrieval metrics (Recall@K, Precision@K, MRR) and the generation
criteria (groundedness, faithfulness) in `rules/llm-apps.md`, prescribe hybrid
retrieval plus re-ranking, require a per-corpus freshness policy, and add the
formulas and scorer implementation as an `eval-harness` reference.

## Why
The RAG section previously said "measure retrieval quality separately from
generation quality" without naming a single metric, so a feature could report one
end-to-end pass rate and satisfy the rule while being unable to say which half was
broken. It also left retrieval architecture unstated (dense-only by default in
practice) and had no freshness requirement, which left
`registries/decision-rules.json` `rule-volatile-knowledge` (`retrieval-evaluation`,
`freshness-policy`) pointing at artifacts no rule defined.

## Scope
- `rules/llm-apps.md` — `## RAG` section replaced
- `skills/llm-engineering/SKILL.md` — `## RAG checklist` extended (pipeline shape, diagnosis order)
- `skills/eval-harness/SKILL.md` — `retrieval` scorer + RAG judge criteria, RAG runner note, quality-bar line
- `skills/eval-harness/references/retrieval-metrics.md` — new

## Checklist
- [x] Replace the `## RAG` section of `rules/llm-apps.md`
- [x] Extend `skills/llm-engineering/SKILL.md` `## RAG checklist`
- [x] Extend `skills/eval-harness/SKILL.md` (scorers, runner, quality bar)
- [x] Create `skills/eval-harness/references/retrieval-metrics.md`
- [x] Commit the scoped file list

## What was made
`rules/llm-apps.md` `## RAG` now names the retrieval metrics (Recall@K,
Precision@K, MRR) and the generation criteria (groundedness, faithfulness),
requires the retrieval baseline at `evals/<feature>/retrieval/BASELINE.md` as the
`retrieval-evaluation` artifact of `rule-volatile-knowledge`, mandates hybrid
dense+lexical retrieval with a re-ranker (opt-out only against a recorded
Precision@K measurement), requires a per-corpus freshness policy as the
`freshness-policy` artifact, and ties top-k tuning to Recall@K vs. Precision@K.
The existing deferral to `security.md` and the `## Agents` section were left
untouched.

`skills/llm-engineering/SKILL.md` `## RAG checklist` now carries the concrete
pipeline shape (`query -> [dense, lexical] -> RRF merge -> re-rank -> top-N ->
generator`, re-ranker sized at ~3-5x N candidates) and a fixed diagnosis order
(Recall@K first, then Precision@K, then groundedness), and points at the new
reference for formulas.

`skills/eval-harness/SKILL.md` gained a `retrieval` scorer and the RAG-specific
`judge` criteria in the scorer list, a runner requirement that RAG features report
retrieval and generation as two separate tables and write the retrieval baseline,
and a quality-bar line making a RAG eval without a `retrieval` scorer incomplete.

`skills/eval-harness/references/retrieval-metrics.md` is new: the metric table,
the report-at-two-Ks rule, TypeScript implementations of `recallAtK`,
`precisionAtK`, `reciprocalRank` and `meanReciprocalRank`, and starting thresholds
(Recall@K >= 0.9, MRR >= 0.7).

## Verification
Not verified by this agent, by instruction: lint, shellcheck and the validate
suite run once at the plan's final gate. Documentation-only change; no executable
code paths touched (the TypeScript in the new reference is illustrative, not
compiled by this repo).

## Changes registered
Branch `feat/rag-retrieval-metrics`, based on `ef387ee`.

`ea8c37c` — docs(llm): name the retrieval metrics, prescribe hybrid search and
re-ranking, define freshness policy

```
M  rules/llm-apps.md
M  skills/eval-harness/SKILL.md
M  skills/llm-engineering/SKILL.md
A  skills/eval-harness/references/retrieval-metrics.md
A  .engineos/changes/2026-09-03-rag-retrieval-metrics.md
```

Fix round 1 (this commit, one on top of `ea8c37c`) — review findings applied:

```
M  rules/llm-apps.md
M  skills/eval-harness/references/retrieval-metrics.md
M  .engineos/changes/2026-09-03-rag-retrieval-metrics.md
```

A commit cannot carry its own sha, so the fix-round-1 sha is reported in
`.superpowers/sdd/2026-09-03-engineos-default-methodology-plan/task-6-report.md`
and should be pasted here by whoever archives this record (`git log --oneline
ef387ee..HEAD` resolves both).

## Notes
- Controller ruling amended the brief: Step 5 (validate check C28 in
  `scripts/validate-engineos.sh` / `scripts/test-validate-engineos.sh`) was skipped
  and moved to another task, so the commit file list drops those two scripts. Until
  that check lands, nothing mechanically enforces that the metric names stay in
  `rules/llm-apps.md`.
- The new rule text references `registries/decision-rules.json` and
  `skills/eval-harness/references/retrieval-metrics.md`. Neither is a `rules/*.md`
  path, so the router-closure check (C3/C4, which extracts only `rules/[a-z0-9-]+\.md`)
  is unaffected.
- `skills/eval-harness/SKILL.md` still carries a pre-existing duplicated ownership
  boundary section ("## Boundary" and "## Ownership boundary for eval guidance");
  out of scope here, left alone.
