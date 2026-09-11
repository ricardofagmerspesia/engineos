---
name: 2026-09-11-rag-corpus-safety
status: active
owner: llm-coordinator (hermsdorff); orchestrator for registry, reviewer and docs
spec: docs/specs/2026-09-11-rag-corpus-safety-design.md
domain: llm
---

## What
Add two security requirements to EngineOS's RAG guidance: access control enforced
at retrieval time (per-chunk ACL metadata, principal filter before ranking in every
branch) and PII/secret redaction before embedding and prompting. Register them as
the `retrieval-acl` and `pre-index-redaction` artifacts of a new decision rule and
add them to the security reviewer's pass order.

## Why
A gap analysis against a production-RAG reference map (2026-09-11) found EngineOS
strong on retrieval quality, answer quality and evals but silent on two security
floors. A shared vector index without a per-chunk ACL filter is an IDOR on
documents, and an embedding is a copy of the source text that both the
logs rule (`rules/security.md`) and encryption-at-rest (`rules/data.md`) miss.
Neither `rules/llm-apps.md` nor `agents/security-reviewer.md` named either.

## Scope
- `rules/llm-apps.md` — `## RAG` split into `### Corpus safety` (new) and `### Retrieval quality` (existing bullets, unchanged); cross-reference in `## Security`; principal-in-cache-key pointer in `## Reliability & cost`
- `skills/llm-engineering/SKILL.md` — pipeline shape gains ingestion half, per-branch filter, query redaction; cache-key and cross-tenant bullets
- `skills/eval-harness/SKILL.md` — mandatory cross-tenant pair and PII index-side case; two quality-bar lines
- `registries/decision-rules.json` — new `rule-rag-corpus-safety` (priority 95, `gate: design`)
- `agents/security-reviewer.md` — Method step 3 bullet; three hardening-checklist items
- `docs/specs/2026-09-11-rag-corpus-safety-design.md` — new

## Checklist
- [x] Write the design spec with rejected alternatives
- [x] Add `rule-rag-corpus-safety` to `registries/decision-rules.json`
- [x] Extend `agents/security-reviewer.md` method and checklist
- [x] hermsdorff: `rules/llm-apps.md`, `skills/llm-engineering/SKILL.md`, `skills/eval-harness/SKILL.md`
- [x] security-reviewer AUDIT over the diff (16 findings: 5 HIGH, 9 MEDIUM, 2 LOW)
- [x] Fix round: all 16 findings applied (hermsdorff on rules/skills, orchestrator on registry/reviewer)
- [x] Final gate (validate suite, lint) once, output shown
- [x] Commit the scoped file list

## What was made
`rules/llm-apps.md` `## RAG` now opens with `### Corpus safety`: an access-control
half (ACL in chunk metadata assigned from source permissions never from content,
principal derived server-side from session/token never from a model-writable
argument, filter before ranking in every retriever branch and bounding the
re-ranker, fail closed on missing ACL, bounded ACL staleness, intersection ACL for
derived chunks, principal in retrieval and completion cache keys) ending in the
`retrieval-acl` artifact definition; and a redaction half (detectors at ingestion,
on the user's query, over metadata/titles/paths/citations, and unconditionally over
the assembled context; reversible token map treated as PII; redaction version in
the cache key; a version bump re-ingests and purges; an unmasked data class raises
the feature to `rule-sensitive-data`) ending in the `pre-index-redaction` artifact
definition. Existing RAG bullets moved verbatim under `### Retrieval quality`.

`skills/llm-engineering/SKILL.md` pipeline is now two halves with the filter
visible per branch: `parse -> redact -> chunk (+ acl metadata from source
permissions, never from content) -> embed -> store` and `redact query -> [dense
search | filter, lexical search | filter] -> merge (RRF) -> re-rank (filtered
candidates only) -> top-N -> generator`. Cross-tenant leak is a CRITICAL stop
before the Recall/Precision diagnosis ladder.

`skills/eval-harness/SKILL.md` requires the cross-tenant pair (owner rank 1,
outsider zero hits) and a PII case asserting on the indexed payload, not only the
answer.

`registries/decision-rules.json` gained `rule-rag-corpus-safety`: `gate: design`,
no `risk: high`, ten signals verified against 7 target prompts (all hit) and 4
decoys (all miss) with node.

`agents/security-reviewer.md` hunts retrieval authorization in Method step 3 and
carries three checklist items; the redaction exception is a finding unless the
`## Redaction` block is in scope, names the class, and `rule-sensitive-data`
applies.

## Verification
Final gate run once on 2026-09-11: `bash scripts/validate-engineos.sh` -> passed 113, failed 0
(C14 on the new rule, router closure on `rules/llm-apps.md` included); `npm run lint`
(`tsc --noEmit`) -> exit 0. Tests not in scope. Signal regexes verified
with a node one-liner (7/7 hit, 4/4 miss). Security review: one AUDIT pass, 16
findings, all applied; no second pass run.

## Human decisions
none required — risk classified medium (prose rules, `git revert` undoes, no data
handled). The prompt advisor matched `rule-sensitive-data` on the word "pii" inside
agent return text, not on data this change handles; the tier is not raised on that
basis.

## Changes registered
Branch `feat/rag-acl-pii-rules`, based on `045b69d`.

```
M  agents/security-reviewer.md
M  registries/decision-rules.json
M  rules/llm-apps.md
M  skills/eval-harness/SKILL.md
M  skills/llm-engineering/SKILL.md
A  docs/specs/2026-09-11-rag-corpus-safety-design.md
A  .engineos/changes/2026-09-11-rag-corpus-safety.md
```

## Notes
- Deliberately no `risk: high` on the new rule: raising `any_high` on every prompt
  containing "rag" would fire HITL on ordinary LLM work.
- `rules/llm-apps.md` says "the DBA row's data rules" instead of `rules/data.md`:
  the LLM router row does not load `data.md`, and the closure check rejects a path
  citation to a rule outside the row.
- The keyword tier evaluates only `signals`; `when.retrieval_over_shared_corpus`
  documents intent for the model tier.
- Quality gaps from the same analysis (ingestion pipeline, query rewrite, metadata
  filters, feedback loop) left for a follow-up; not security floors.
