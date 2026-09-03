# Agent memory architecture — design

Source: Task 8 of the 2026-09-03 "EngineOS as the default methodology" plan.
Grounded in the tree at `ef387ee`. Vocabulary: `rules/memory.md` (home,
placement, promotion), `rules/context.md` (layer, budget, evidence),
`skills/retro` (pattern, occurrence, proposal), `skills/task-observer`
(observation, status).

**This document designs; it implements nothing.** No kernel, rule, registry or
skill changes here — section 8 hands the implementable residue to a follow-up
plan.

## Problem

EngineOS already has a memory policy and a context policy. What it does not have
is the machinery that connects them: a way to notice that something has been
learned often enough to be worth writing down.

The gap is on the record. `docs/specs/2026-08-02-ai-methodology-integration-analysis.md:274`:

> `.engineos/archived/` holds 21 closed change records; nothing ever reads them.
> `rules/memory.md` has a promotion rule ("repeated 3 times → project CLAUDE.md;
> adopted by a second project → EngineOS rules") with **no mechanism to detect
> the third repetition**.

The rule it names is `rules/memory.md:24`:

> - DO promote: a personal note you've repeated to Claude 3 times → project
>   CLAUDE.md; a project convention a second project adopts → EngineOS rules.

That is a counting instruction addressed to a human with no counter. `skills/retro`
was built to close half of it — `skills/retro/SKILL.md:26-51` gathers the window
and `:53-57` restates the three-occurrence threshold — but step 2 clusters "by
reading", so the count depends on whoever runs the retro noticing that three
entries written weeks apart are the same entry. `skills/task-observer` writes
those entries with no field to group them by: the template at
`skills/task-observer/SKILL.md:96-113` carries `Skill`, `Type` and `Phase/Area`,
all free text, and no stable key.

Two consequences, both observable today:

1. **Under-promotion.** A pattern with three occurrences spread across a
   `Skill:` value written three slightly different ways is invisible. The live
   log has one entry (`.engineos/skill-observations/log.md:12-27`) — the corpus is
   small now, which is exactly when the convention is cheap to add.
2. **No shared vocabulary for what memory even is.** `rules/memory.md` is a
   placement table (where a fact lives) and `rules/context.md` is a budget (what
   a turn loads). Neither says how durable a given home is, who may write to it,
   or what retires an entry. Those questions get answered ad hoc, per skill.

This design answers them by naming four tiers **over the homes that already
exist**. It adds no store.

## Tiers mapped onto existing homes

The tier is a property of a home that already exists, not a new place to put
things. Every row below cites the home's current definition in the tree.

| Tier | Homes (existing) | What it holds | TTL | Existing definition |
|---|---|---|---|---|
| **Short-term** | the turn's own context — `rules/context.md` layers 3 (task state) and 4 (retrieved evidence) | the request, the plan, what has been done, the specific files/diffs/outputs consulted | **session.** Dies with the turn chain; `rules/memory.md:20` already says session-only context has no home | `rules/context.md:17-18`; drop-from-the-bottom budget at `:22-24` |
| **Episodic** | `.engineos/archived/**` change records; `.engineos/skill-observations/log.md`; `.git/engineos-telemetry/*.jsonl` | what actually happened, once, with a date: what was made, what verification ran, which friction surfaced, which routes and gates fired | archive **forever** (git-versioned narrative); telemetry **90 days** — already policy, not a new number | records `rules/memory.md:14`; observations `rules/memory.md:16` + `skills/task-observer/SKILL.md:24`; telemetry `registries/policy.json:195-196` (`home`, `retention_days: 90`) |
| **Semantic** | project `CLAUDE.md`; `docs/adr/`; `docs/specs/`; (this repo also uses `.engineos/memory/`) | the distilled fact or decision and its reason — what is true now, independent of the episode that taught it | **until superseded.** For an ADR the status field is the TTL; for a spec, the shipped implementation is | `rules/memory.md:9-11`; `.engineos/memory/README.md:8-16` |
| **Procedural** | EngineOS `rules/` and `skills/` | how the team works — the rule that fires, the procedure that runs | **the deprecation window.** Nothing is removed in the release that deprecates it; earliest removal is one minor release later | `rules/memory.md:7-8`; window at `docs/COMPATIBILITY.md:39-51` |

Notes on the mapping, so it is not read as more than it is:

- **Nothing here is a new store.** Every cell names a path that exists at
  `ef387ee`. The tier names are analytic; they let sections 3–6 say "write policy
  for episodic" instead of re-listing three paths each time.
- **This table says where a tier lives and how long; section 3's Promotion
  column says how a fact leaves it.** The two are read together — and the
  Promotion column is where the missing mechanisms are named against their
  follow-up units (section 8), rather than being implied by this table's
  existence.
- **Personal memory is deliberately absent.** `~/.claude/.../memory/` is
  personal recall (`rules/memory.md:19`, `:30`) and never the team's source of
  truth. It is out of this architecture; a fact that matters to the team gets
  promoted out of it, which is the very rule section 5 mechanises.
- **The exec journal joins the episodic tier when it has a writer.**
  `scripts/exec-journal.sh:2` is today a schema contract with an append/validate
  CLI and no production writer; the plan's Task 5 adds spans and the first
  writer. Its home is the journal file passed on the command line, so this design
  claims no path for it — once Task 5 lands, journal lines are episodic evidence
  with the same read discipline as telemetry (section 4).
- **One discrepancy, recorded not fixed.** `.engineos/memory/` exists with its
  own frontmatter contract (`.engineos/memory/README.md:8-16`) and is referenced
  by `.engineos/archived/README.md:45` and by non-negotiable #5's project layout,
  but it has **no row in `rules/memory.md`'s placement table**. It is listed in
  parentheses above rather than silently promoted into the table: closing that
  gap is a rule edit, out of scope here (section 8).

## Write policy

One writer per tier. Two columns carry the weight: **Mechanism**, which is what
makes a write legitimate, and **Promotion**, which is the path out of the tier
and upward. Where a promotion path has no mechanism in the tree today, the cell
says so and names the follow-up unit rather than describing an intention as if
it were behaviour.

| Tier | Who may write | Mechanism | Promotion (path upward) | What a write costs |
|---|---|---|---|---|
| Short-term | the session itself | ordinary tool use within the turn | → **episodic**, via the change record at close (`record-change` skill, `rules/memory.md:14`). This path works today and is the only one that does not depend on counting | nothing — it is discarded |
| Episodic | `record-change` skill; `task-observer` skill; the hooks | `record-change` on close (`rules/memory.md:14`); `task-observer` appends OPEN entries (`skills/task-observer/SKILL.md:63-94`); `hooks/prompt-advisor.sh` / `hooks/stop-verify.sh` append telemetry ids (`registries/policy.json:194`) | → **semantic**, via `skills/retro` clustering plus the `adr` skill or a project PR. The clustering step exists; the three things it needs to be mechanical do not — grouping key: **no mechanism today — follow-up unit 1**; threshold as data: **no mechanism today — follow-up unit 2**; the count itself: **no mechanism today — follow-up unit 3** | an append. Cheap by design — appends are the safe mutation (`skills/task-observer/SKILL.md:120-123`) |
| Semantic | `adr` skill; the spec workflow; a PR to the project | `rules/memory.md:9-11`, `:26` ("record decisions when made") | → **procedural**, via a PR to the engineos repo: `skills/retro` proposes, a human merges (`skills/retro/SKILL.md:112-117`). The path exists; what it lacks is the evidence to trigger it, which is the same three units above | a reviewed commit in the consuming project |
| Procedural | a PR to the engineos repo | `rules/memory.md:7-8`; `skills/retro` proposes and **a human merges** (`skills/retro/SKILL.md:13-15`, `:112-117`) | **none — this is the top tier.** Its lifecycle is forgetting (section 6), not promotion: a rule that never fires gets proposed for deletion (`skills/retro/SKILL.md:145-146`) | a PR, CI green, human approval, and a COMPATIBILITY assessment if it touches public surface |

Read down the Promotion column and the shape of the problem in section 1 is
visible in one place: the two upward paths that need a count are both blocked on
the same three missing pieces, which is why section 8 ships them as one plan in
dependency order.

**The rule that governs all four: nothing writes upward without evidence.**

Upward means episodic → semantic → procedural. Each step up buys durability and
blast radius, and each therefore demands a stronger warrant:

- **Episodic → semantic** needs the episode. A `CLAUDE.md` fact or an ADR cites
  the change record, commit or observation that produced it — `rules/context.md:31-33`
  already requires origin and date on anything retrieved ("evidence without a
  source is an assertion"), and a promoted fact is retrieved evidence that
  outlived its turn.
- **Semantic → procedural** needs three independent occurrences. This is
  `rules/memory.md:24`'s number and `skills/retro/SKILL.md:53-57`'s threshold;
  section 5 makes it countable. Below three it goes on retro's watch list
  (`skills/retro/SKILL.md:68`), which is a real answer, not a rejection.
- **A write with no home is not a write.** `skills/retro/SKILL.md:85` states it
  for proposals: "a fix with no home in this table is usually not a fix — it is a
  complaint." Generalised: an upward write that cannot name its target row in
  `rules/memory.md`'s placement table has not identified a fact yet.
- **No tier writes to itself on the model's initiative.** Nothing in this
  architecture lets an agent decide mid-task that a rule should change. It logs
  an observation (episodic, cheap, reversible) and the retro proposes. A system
  that edits its own constitution unsupervised is drifting, not improving
  (`skills/retro/SKILL.md:13-15`).

## Retrieval policy

**`rules/context.md` already owns this and is not being restated.** Its layer
order (`:13-20`), its drop-from-the-bottom rule (`:22-24`), its prohibition on
loading a rule the route did not name (`:39-41`), and its no-secrets-into-carried-context
rule (`:43-45`) all apply unchanged to the tiers above.

This design adds exactly one thing, because it is the one case the existing rule
does not cover: **when episodic memory is read at all.**

| Tier | What a turn loads |
|---|---|
| Procedural | always-on rules (layer 1) plus what the route names (layer 2) — `rules/context.md:15-16` |
| Semantic | project `CLAUDE.md` at layer 1; ADRs and specs only when the task touches their subject, as layer-4 evidence |
| Short-term | layers 3–4, by definition |
| **Episodic** | **not loaded by an ordinary turn.** It is read by `skills/retro` step 1 (`skills/retro/SKILL.md:26-51`), and by `kernel.sh hitl` when evidence is thin — `hitl --evidence thin` yields reason `evidence-insufficient` (the plan's Task 4), where the human deciding needs the prior episodes. **Never wholesale.** |

"Never wholesale" is the operative half. `.engineos/archived/**` is an
append-only narrative that only grows; loading it into a feature turn is the
whole-repository sweep `rules/context.md:8-11` forbids, dressed as diligence.
The two legitimate readers are both bounded: retro reads a **window**
(`skills/retro/SKILL.md:29-31`, last N records since the previous retro's
recorded range, `:129-132`), and a `hitl` read is scoped to the **decision at
hand**. A third reader would need to state its bound before it gets one.

The same discipline covers telemetry: it lives in `.git` and never reaches CI
(`registries/policy.json:194`), so it is not context an agent can accidentally
sweep — reading it is `skills/retro/SKILL.md:47-51` or `scripts/usage-report.sh`,
and nothing else.

## Promotion mechanism

The missing detector. One new log field, one new policy key, one new kernel
subcommand — in that dependency order (section 8, units 1 → 2 → 3) — and
`skills/retro` stops eyeballing.

```
scripts/kernel.sh promote-candidates --since <date>
```

**What it reads** (both episodic sources, both already on retro's gather list):

1. `.engineos/skill-observations/log.md` — entries whose `**Status:**` line is
   `OPEN`. Resolved entries are excluded: `ACTIONED` means a proposal already
   covered it and `DECLINED` means it was triaged out
   (`skills/task-observer/SKILL.md:158-160`, `skills/retro/SKILL.md:119-127`).
2. `.engineos/archived/**/*.md` — records whose `completed:` frontmatter date is
   at or after `--since`, matching the shape at
   `.engineos/archived/2026/08/general/2026-08-26-degraded-status-scope.md:1-8`.

**Where the `--since` filter's date comes from, and where its guarantee stops.**
`completed:` is not part of the record template — `.engineos/changes/_template.md`
carries `name`, `status`, `owner`, `spec` and `domain`, and no completion date,
because an active record does not have one. The `record-change` skill adds it at
close: `skills/record-change/SKILL.md:54` — "set front matter `status: done` and
add `completed: <YYYY-MM-DD>`" — and only after `## What was made` is written and
the checklist is fully resolved. In practice the field is universal today: all 26
records under `.engineos/archived/2026/08/` carry it.

The guarantee is therefore **procedural, not structural**: it holds for records
closed through the skill, and nothing in the repository's shape enforces it on a
record archived by hand. A record without `completed:` cannot be placed in the
window, so the detector **skips it and reports the skipped count** — on stderr,
leaving the stdout shape exactly as frozen below. Silently dropping undated
records would let the window under-count, which is the same failure mode this
detector exists to remove.

**How it groups:** by a `tag:` field — a stable kebab-case key naming the
recurring thing, added to the observation template and available in record
frontmatter (follow-up unit 1, section 8). Grouping by `tag:` rather than by the
existing free-text `Skill:` line is the entire point: three occurrences only
cluster if all three spell the key identically, and free text does not.

**What it returns:** groups whose occurrence count is at or above the threshold.

```json
{
  "candidates": [
    {
      "tag": "verification-contract-drift",
      "count": 3,
      "first_seen": "2026-08-13",
      "last_seen": "2026-09-01",
      "sources": [
        ".engineos/skill-observations/log.md#observation-1",
        ".engineos/archived/2026/08/general/2026-08-26-degraded-status-scope.md",
        ".engineos/archived/2026/08/general/2026-08-26-agents-prompt-advisor-refs.md"
      ]
    }
  ]
}
```

The shape is fixed: `{candidates: [{tag, count, first_seen, last_seen, sources: [...]}]}`.
`sources` carries the origin of every occurrence, so the retro's proposal can
cite them (`skills/retro/SKILL.md:95` requires the occurrence ids) and so
`rules/context.md:31-33`'s origin-and-date requirement is satisfied by the
detector rather than by whoever runs it. An empty `candidates` array is a valid,
informative answer: nothing has recurred three times in the window.

**The threshold lives in the registry, not in the script** (follow-up unit 2,
section 8):

- Key: **`policy.memory.promotion_threshold`**
- Default: **3**

Three is not a new number — it is `rules/memory.md:24` and
`skills/retro/SKILL.md:53-57`. Putting it in `registries/policy.json` follows the
policy-as-data pattern the rest of the kernel already uses (`repair.max_fix_attempts_per_check`
at `registries/policy.json:181`, `telemetry.retention_days` at `:196`): the
number is stated once, read at runtime, and mirror-checked rather than
duplicated in prose. The subcommand slots into the dispatch table at
`scripts/kernel.sh:618-630` alongside `retry`, `repair` and `decision-rules`.

**How retro consumes it.** `skills/retro/SKILL.md` step 1 currently lists
sources to read and step 2 says "cluster, do not list". The change is that step 1
calls `promote-candidates --since <last retro date>` and step 2 clusters **its
output**, so the three-occurrence rule is applied by a counter instead of by
recall. That edit ships with the subcommand (follow-up unit 3, section 8), which
is the only unit permitted to write `skills/retro/SKILL.md`. Two properties are
preserved deliberately:

- **Sub-threshold groups still exist.** They go on the watch list
  (`skills/retro/SKILL.md:68`); the detector reporting them is a later
  refinement, not a requirement of v1.
- **The detector counts; it does not decide.** It emits no proposal, edits no
  rule, and merges nothing. Retro's placement table (`skills/retro/SKILL.md:71-86`)
  and the human merge gate (`:112-117`) are untouched. What changes is that the
  retro can no longer miss the third repetition — which is precisely the defect
  `docs/specs/2026-08-02-ai-methodology-integration-analysis.md:274` names.

## Forgetting

Memory that only grows is not memory. Each tier gets a demotion trigger, and
each trigger is an existing mechanism rather than a new one.

| Tier | Demotion trigger | What happens |
|---|---|---|
| Short-term | end of session | discarded. `rules/memory.md:20` — session-only context has no home, and volatile facts are barred from any `CLAUDE.md` (`:28`) |
| Episodic — telemetry | age > `telemetry.retention_days` (90) | reaped by `hooks/ensure-project-layout.sh:58-61`, which reads the number from `registries/policy.json:196` at runtime rather than hardcoding it |
| Episodic — records & observations | never for records; resolution for observations | archived records are read-only history (`.engineos/archived/README.md:3-5`). A resolved observation (`ACTIONED`/`DECLINED` dated before today) moves to `.engineos/skill-observations/archive/log-YYYY-MM-DD.md` on the next log write (`skills/task-observer/SKILL.md:139-148`) — it leaves the OPEN set without leaving the record |
| Semantic | **an ADR is superseded** | the semantic entry is retired: the ADR's status changes and the superseding decision names it. A retired ADR stays in `docs/adr/` — the history of the decision is the point — but it stops being loaded as current truth. `rules/context.md:46-47` is the same rule from the reader's side: a summary stops being the source of truth once the underlying file changes |
| Procedural | **a rule or skill is deprecated** | the COMPATIBILITY window runs: deprecate with the replacement shipped alongside (`docs/COMPATIBILITY.md:43-45`), then **stub for one minor release** — for a renamed rule, a stub file pointing at the replacement (`:46-49`) — then remove at the next MAJOR, and never earlier than one minor release after deprecation (`:50-51`) |

Two forgetting rules that cut across the table:

- **Retro is expected to propose deletions.** `skills/retro/SKILL.md:145-146`:
  every retro should ask which rule has never once been the reason something was
  caught, and propose deleting it. Telemetry supplies the evidence — an intent or
  rule that never fires is prune evidence (`skills/retro/SKILL.md:47-51`). This is
  the procedural tier's forgetting path, and it is already written; the detector
  in section 5 does not change it.
- **Deletion is a public-surface change when the thing deleted is public.**
  Non-negotiable #11 and `docs/COMPATIBILITY.md` govern rule paths, skill
  directories and agent names. Forgetting is not a licence to `git rm`.

### No confidence scores in v1

A tempting design is to attach a confidence or decay weight to each memory entry
and recall by weight. **v1 does not, and the reason is that there is nothing to
compute the weight from.**

A confidence score is a function of outcomes: this fact was recalled, acted on,
and the action succeeded or failed. EngineOS captures no such series today.
Telemetry records which routes, decision rules and verifications fired, as ids
and outcomes only (`registries/policy.json:194`) — session-scoped, reaped at 90
days, and deliberately missing attempt-level repair/retry outcomes, whose
"designed home is the exec-journal schema" (same line). That journal is currently
a schema with an append/validate CLI and no production writer
(`scripts/exec-journal.sh:2`); the plan's Task 5 gives it spans and its first
writer.

So the honest sequence is: spans first, then **several months** of outcome-labelled
spans, then a weight computed from them. Assigning confidence numbers before the
data exists would produce a ranking that looks quantitative and is in fact the
author's prior — worse than the count in section 5, which is at least a count of
real occurrences. Revisit when the journal has carried outcomes long enough that
a decay curve can be fitted rather than chosen.

## Rejected alternatives

**A vector store of past sessions.** Embed transcripts and archived records, and
retrieve by similarity at the start of each turn. Rejected on two independent
grounds:

1. **No runtime.** EngineOS is hooks, shell scripts, markdown and JSON
   registries; there is no service to host an index, no embedding budget, and no
   process to keep it fresh. Every home in section 2 is a file in git for that
   reason. A vector store would be the first component that cannot be inspected
   with `cat` or diffed in a PR — and the first that can be silently stale, which
   `rules/context.md:46-47` treats as a defect.
2. **`rules/security.md` forbids what it would have to store.** Sessions contain
   whatever the work contained. `rules/context.md:43-45` states the prohibition
   at exactly this point: don't carry secrets, tokens or PII into context that
   will be summarized, logged, or handed off — "this is where it usually gets
   violated by accident". An index of past sessions is that context, persisted.
   Telemetry's design shows the accepted shape instead: ids and outcomes only,
   never prompt text, enforced by a `value_pattern` with no whitespace class
   (`registries/policy.json:194`, `:197`). A transcript index cannot meet that
   bar, because free text is the thing it stores.

The retrieval policy in section 4 is the alternative actually chosen: bounded
reads by two named readers, over files a human can open.

**Confidence-weighted recall.** Rank what gets loaded by a learned confidence
weight per entry. Rejected because **there is no data yet** — the argument in
"No confidence scores in v1" above, with the same conclusion: it needs
outcome-labelled exec-journal spans over several months, and today there is not
one production writer. A weight fitted to no data is a preference with a decimal
point.

## Out of scope / next plan

Nothing in this document is implemented. A follow-up plan implements exactly
three things, **in the order given below.** The order is a dependency, not a
preference: the detector is untestable without both the grouping key it clusters
on and the threshold key it compares against, so the two data changes land
before the code that reads them.

1. **The `tag:` convention** — a `tag:` field in the observation-log template
   (`skills/task-observer/SKILL.md:96-113`) and in change-record frontmatter, so
   occurrences group on a stable key instead of free text. Includes the
   backfill question for existing entries: leave them untagged and let the
   detector ignore them, or tag them once. Validate the value against a
   kebab-case slug pattern, the way `telemetry.value_pattern`
   (`registries/policy.json:197`) constrains telemetry values — a grouping key
   that accepts free text is the problem it was added to solve.
2. **The `policy.memory` block** — a new top-level key in
   `registries/policy.json` carrying `promotion_threshold` (default 3), with the
   validator mirror-check that keeps it agreeing with `rules/memory.md:24` and
   `skills/retro/SKILL.md:53-57`, and a COMPATIBILITY entry (additive, MINOR).
   The check **reads** those two files to compare the numbers and **does not
   edit either.** Editing `skills/retro/SKILL.md` belongs to unit 3, which owns
   that file — two units writing one file is the collision `rules/parallelism.md`
   forbids.
3. **The `promote-candidates` subcommand** — `scripts/kernel.sh promote-candidates
   --since <date>`, emitting the section 5 shape
   (`{candidates: [{tag, count, first_seen, last_seen, sources: [...]}]}`),
   registered in the dispatch table at `scripts/kernel.sh:618-630`, with kernel
   tests, and `skills/retro/SKILL.md` step 1 calling it. Owns the retro edit.

Explicitly **not** in that plan, and not in this design:

- **Any change to `rules/context.md`.** Section 4 adds a policy that the
  `promote-candidates` and `hitl` call sites carry; the layer model is unchanged.
- **Adding `.engineos/memory/` to `rules/memory.md`'s placement table.** A real
  gap (section 2, last note), but a rule edit with its own review.
- **Confidence scores, decay curves, or weighted recall.** Blocked on
  outcome-labelled exec-journal spans (section 6); revisit after several months
  of them.
- **A third reader of the episodic tier.** Section 4 admits retro and `hitl`.
  Anything else states its bound first.
