---
name: 2026-09-03-agent-memory-architecture-design
status: active
owner: Ricardo Fagmer
spec: n/a — single design doc, below non-negotiable #1's threshold (>2 files or a new feature)
domain: llm
---

## What

A design spec naming four agent-memory tiers (short-term, episodic, semantic,
procedural) over the knowledge homes EngineOS already has, plus the missing
promotion detector — `scripts/kernel.sh promote-candidates` — that makes
`rules/memory.md`'s three-repetition rule countable. Design only; nothing
implemented.

## Why

`docs/specs/2026-08-02-ai-methodology-integration-analysis.md:274` records the
gap: `rules/memory.md:24` says promote a note repeated three times, with "no
mechanism to detect the third repetition". `skills/retro` clusters by reading,
and `skills/task-observer`'s entry template carries no stable grouping key, so
three occurrences spelled three ways never cluster. Separately, neither
`rules/memory.md` (where a fact lives) nor `rules/context.md` (what a turn
loads) says how durable a home is, who may write to it, or what retires an
entry.

## Scope

- Create: `docs/specs/2026-09-03-agent-memory-architecture-design.md`

No rule, skill, registry, kernel or hook file is touched. Task 8 of the
2026-09-03 "EngineOS as the default methodology" plan is a design deliverable by
decision; the implementable residue is enumerated in the spec's section 8 for a
follow-up plan.

## Checklist

- [x] Section 1 Problem — quotes the analysis at `:274` and `rules/memory.md:24`
- [x] Section 2 Tiers — table mapping four tiers onto existing homes, TTL per
      tier, `path:line` citation for every home; no new store introduced
- [x] Section 3 Write policy — writer + mechanism per tier, and the
      nothing-writes-upward-without-evidence rule
- [x] Section 4 Retrieval policy — defers to `rules/context.md`, adds only
      "episodic is read by retro and by `hitl --evidence thin`, never wholesale"
- [x] Section 5 Promotion mechanism — `promote-candidates --since`, the exact
      JSON output shape, and the `policy.memory.promotion_threshold` key (3)
- [x] Section 6 Forgetting — demotion trigger per tier; no confidence scores in
      v1, with the reason stated
- [x] Section 7 Rejected alternatives — vector store of past sessions;
      confidence-weighted recall
- [x] Section 8 Out of scope / next plan — the three follow-up units, and what
      is explicitly excluded
- [x] Heading/frontmatter style matches the newest spec
      (`docs/specs/2026-09-02-deepen-runtime-modules-design.md:1-6`: no YAML
      frontmatter, `# <Title> — design`, `Source:` line, then `## Problem`)
- [x] Change record created from `.engineos/changes/_template.md`

## What was made

`docs/specs/2026-09-03-agent-memory-architecture-design.md` (344 lines), eight
sections:

1. **Problem** — quotes `docs/specs/2026-08-02-ai-methodology-integration-analysis.md:274`
   ("no mechanism to detect the third repetition") and `rules/memory.md:24`, then
   names the two consequences: under-promotion when occurrences cannot cluster,
   and no vocabulary for durability/write-authority/retirement.
2. **Tiers** — a five-column table (tier, existing homes, contents, TTL,
   existing definition). Short-term = `rules/context.md` layers 3–4, TTL session.
   Episodic = `.engineos/archived/**` + `skill-observations/log.md` +
   `.git/engineos-telemetry/*.jsonl`, TTL archive-forever / telemetry 90 days
   (`registries/policy.json:196`, already policy). Semantic = project
   `CLAUDE.md` + `docs/adr/` + `docs/specs/`, TTL until superseded. Procedural =
   `rules/` + `skills/`, TTL the `docs/COMPATIBILITY.md:39-51` window. Four notes
   follow: no new store, personal memory deliberately excluded, the exec journal
   joins episodic once Task 5 gives it a writer, and one recorded discrepancy —
   `.engineos/memory/` exists with its own contract but has no row in
   `rules/memory.md`'s table.
3. **Write policy** — writer/mechanism/cost per tier, then the governing rule
   with its three sub-rules: episodic→semantic needs the cited episode,
   semantic→procedural needs three independent occurrences, an upward write with
   no home in the placement table is not a fact yet, and no tier writes to itself
   on the model's initiative.
4. **Retrieval policy** — states plainly that `rules/context.md` owns this and
   is not restated, then adds the single missing case: episodic is not loaded by
   an ordinary turn; its two bounded readers are `skills/retro` step 1 (a window)
   and `kernel.sh hitl --evidence thin` (the decision at hand). Never wholesale;
   a third reader states its bound first.
5. **Promotion mechanism** — `scripts/kernel.sh promote-candidates --since <date>`
   reads OPEN observations and archived records dated at/after `--since`, groups
   by a `tag:` field, returns groups at or above the threshold in the exact shape
   `{candidates: [{tag, count, first_seen, last_seen, sources: [...]}]}`.
   Threshold key `policy.memory.promotion_threshold`, default 3, following the
   policy-as-data pattern of `repair.max_fix_attempts_per_check` and
   `telemetry.retention_days`. Retro step 1 calls it instead of eyeballing; the
   detector counts and never decides.
6. **Forgetting** — demotion trigger per tier: session end; telemetry reaped by
   `hooks/ensure-project-layout.sh:58-61` at `retention_days`; observations
   archived on resolution while records stay forever; an ADR superseded retires
   the semantic entry; a deprecated rule stubs for one minor release then goes at
   the next MAJOR. Plus retro's expected deletion proposals, and the note that
   deleting public surface is a COMPATIBILITY event. Closes with why v1 has no
   confidence scores: a weight is a function of outcomes, no outcome series
   exists until the exec journal carries spans for several months, and a number
   fitted to no data is the author's prior wearing a decimal point.
7. **Rejected alternatives** — a vector store of past sessions, rejected on two
   independent grounds (no runtime to host or refresh an index, and
   `rules/security.md` via `rules/context.md:43-45` forbids carrying PII into
   anything summarised or stored — telemetry's ids-and-outcomes-only shape is the
   contrast); and confidence-weighted recall, rejected for having no data yet.
8. **Out of scope / next plan** — exactly three follow-up units (the
   `promote-candidates` subcommand with tests and the retro step-1 call; the
   `policy.memory` block with its validator mirror-check and COMPATIBILITY entry;
   the `tag:` convention in the observation template and record frontmatter,
   including the backfill question), plus four explicit exclusions.

Every mechanism the design maps a tier onto is cited by `path:line` from the
tree at `ef387ee` — `rules/memory.md`, `rules/context.md`, `skills/retro`,
`skills/task-observer`, `registries/policy.json`,
`hooks/ensure-project-layout.sh`, `docs/COMPATIBILITY.md`,
`scripts/kernel.sh`, `scripts/exec-journal.sh`, and the archived-record and
`.engineos/memory/` READMEs.

## Verification

Design document only — no executable surface, so no lint, typecheck or tests
apply, and none were run (per the brief: "No tests, no lint").

What was verified instead:

- Every `path:line` citation in the spec was read out of the worktree at
  `ef387ee` before being written, not recalled.
- Heading and frontmatter style checked against the newest spec,
  `docs/specs/2026-09-02-deepen-runtime-modules-design.md:1-6`.
- The change record follows `.engineos/changes/_template.md` section for section.
- `git status --short` confirms the working tree carries only the two intended
  files.

## Changes registered

```
?? .engineos/changes/2026-09-03-agent-memory-architecture-design.md
?? docs/specs/2026-09-03-agent-memory-architecture-design.md
```

Commit: `docs(specs): design the agent memory tiers over existing homes`, on
branch `docs/agent-memory-architecture` cut from `ef387ee` (origin/main).

## Notes

- **`.engineos/memory/` is absent from `rules/memory.md`'s placement table.**
  It exists with its own frontmatter contract
  (`.engineos/memory/README.md:8-16`), is referenced by
  `.engineos/archived/README.md:45` and by non-negotiable #5's project layout,
  yet has no row in the table. The spec lists it parenthetically in the semantic
  tier and records the gap rather than fixing it — adding the row is a rule edit
  outside this task's scope. Carried into the spec's section 8 exclusions.
- **Two forward references are to work that does not exist yet at `ef387ee`.**
  `kernel.sh hitl --evidence thin` (section 4) is the plan's Task 4, and the
  exec-journal spans/first writer (sections 2 and 6) are Task 5. Both are named
  as plan dependencies with that stated, not as present behaviour.
- **The `tag:` field does not exist yet**, so section 5's detector is specified
  against a convention the follow-up plan introduces. The one live observation
  (`.engineos/skill-observations/log.md:12-27`) is untagged, which is why the
  backfill question is called out as part of unit 3 rather than assumed away.
- No rule, skill, registry or agent file was touched — the design records what a
  future PR would change, and changes nothing itself.
