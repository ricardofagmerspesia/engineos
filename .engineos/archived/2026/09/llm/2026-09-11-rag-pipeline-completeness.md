---
name: 2026-09-11-rag-pipeline-completeness
status: done
completed: 2026-09-11
owner: llm-coordinator (hermsdorff); orchestrator for agent method and docs
spec: docs/specs/2026-09-11-rag-pipeline-completeness-design.md
domain: llm
---

## What
Close the remaining quality gaps between EngineOS's RAG guidance and the
eight-block production-RAG reference map: ingestion (document store, parsing,
dedupe, idempotent incremental indexing, pinned embedding model, minimum chunk
metadata), query pipeline (bounded rewrite, structured metadata filters, context
assembly under a token budget, no-answer path), and operations (state-layer
separation, three cache layers, feedback loop into a human review queue and the
golden set, per-stage latency).

## Why
The first unit on this branch (`2026-09-11-rag-corpus-safety`) closed the two
security floors from the same 2026-09-11 gap analysis. Five quality blocks stayed
open: a team following `rules/llm-apps.md` to the letter could ship a RAG feature
with no rebuild path, mixed embedding models in one index, a query rewrite adopted
on vibes, context truncated mid-chunk, a semantic cache with no eval, and no way
for a bad answer to become a golden case.

## Scope
- `rules/llm-apps.md` — `## RAG` gains `### Ingestion`, `### Query pipeline`, `### Operations`
- `skills/llm-engineering/SKILL.md` — pipeline shape gains doc store, dedupe, rewrite, assembly; chunk-id idempotency; rewrite/cache judged on evals; feedback fields
- `skills/eval-harness/SKILL.md` — no-answer case, history-dependent case, per-stage latency in the report, cache/rewrite before-after line, review-queue -> golden case
- `agents/llm-coordinator.md` — Method step 2 audit list extended
- `docs/specs/2026-09-11-rag-pipeline-completeness-design.md` — new

## Checklist
- [x] Write the design spec with rejected alternatives
- [x] Extend `agents/llm-coordinator.md` Method step 2
- [x] hermsdorff: `rules/llm-apps.md`, `skills/llm-engineering/SKILL.md`, `skills/eval-harness/SKILL.md`
- [x] Final gate (validate suite, lint) once, output shown
- [x] Commit the scoped file list

## What was made
`rules/llm-apps.md` `## RAG` gained `### Ingestion` (document store as source of
truth, versioned per-format parser as re-index trigger, content-hash dedupe,
minimum chunk metadata set, idempotent incremental upsert on a derived chunk id,
rehearsed full rebuild, one embedding model per index), `### Query pipeline`
(rewrite as bounded untrusted model output adopted only on a Recall@K gain,
structured allowlisted metadata pre-filters, context assembly under a token
budget with parent expansion and source stamps, whole-chunk truncation, "not
found in the sources" floor), and `### Operations` (separated stores and
retention, back up documents and metadata not vectors, monolith-first vector
store choice, three cache layers with distinct keys, semantic-cache threshold
tuned on the golden set, feedback capture fields, review queue -> golden case,
per-stage latency). 82 -> 114 lines, zero deletions.

`skills/llm-engineering/SKILL.md` pipeline halves carry doc store, dedupe, pinned
model, rewrite and assembly; chunk-id derivation as the idempotency key; rewrite
and semantic-cache changes owe before/after eval numbers; feedback-capture bullet.

`skills/eval-harness/SKILL.md` requires a no-answer case and a history-dependent
case, reports per-stage latency for RAG, and merges the review-queue path into
the "Golden set grows" line.

`agents/llm-coordinator.md` Method step 2 audits the new areas.

## Verification
Final gate run once on 2026-09-11: `bash scripts/validate-engineos.sh` -> passed
113, failed 0; `npm run lint` (`tsc --noEmit`) -> exit 0. Tests not in scope. No
security pass: quality rules only, no new trust boundary.

## Human decisions
none required — risk medium (prose rules, `git revert` undoes, no data handled).

## Changes registered
Branch `feat/rag-acl-pii-rules`, second unit, based on `349bc7d`.

`5180728` — feat(llm): cover RAG ingestion, query pipeline and operations

```
M  agents/llm-coordinator.md
M  rules/llm-apps.md
M  skills/eval-harness/SKILL.md
M  skills/llm-engineering/SKILL.md
A  docs/specs/2026-09-11-rag-pipeline-completeness-design.md
A  .engineos/changes/2026-09-11-rag-pipeline-completeness.md
```

## Notes
- No new decision rule: these are how-to-build-well rules, not gate artifacts;
  `rule-volatile-knowledge`'s `freshness-policy` already owns re-index triggers.
- Cross-references to architecture, data and observability rules are by phrase,
  not path: the LLM router row loads none of them and the closure check rejects
  a path citation outside the row.
