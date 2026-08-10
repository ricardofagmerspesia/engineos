# Decision Kernel — Phase 8: Contradiction Cleanup (Epic Close)

- **Date:** 2026-08-06
- **Status:** Approved (P8 slice, final phase of the user-approved "EngineOS
  Decision Kernel" plan)
- **Risk:** low — prose/comment corrections, two PATCH registry-description
  bumps, three seeded layout files, and one additive validator check family
  (C23). No behavior change anywhere: no hook logic, no kernel logic, no
  registry data field. Trivially reversible by revert. Autonomy A2.
- **Depends on:** P1–P7 (all landed on `feat/decision-kernel-p1`, commits
  `9d718f9`, `cb04a66`, `5ebce4a`, `e4bca47`, `6e477d5`, `4f5922b`, `243cf52`).
- **Parent plan:** "EngineOS Decision Kernel" (8 phases). The parent plan
  calls this phase "cleanup of 28 audited contradictions". This spec keeps the
  name for cross-reference continuity (P3–P7's change records all point at
  "P8 (28-contradiction cleanup)") and **rejects the number** — see "Where the
  28 went" below. Same move as P3's rejection of `escalate = ambiguous`, P4's
  rejection of frontmatter, P5's rejection of the literal "gate or check"
  framing, and P6's narrowing to the record: the phase's intent (no live
  contradiction survives the epic) is delivered on evidence; the parent plan's
  literal wording is not.

## Problem

The epic's premise is that prose and data must not disagree in silence. P1–P7
built the machinery (six registries, `kernel.sh`, C16–C22) and, in passing,
fixed every contradiction that sat *on* a checked surface. What no phase did
is sweep the surfaces **adjacent** to the checked ones — the CLAUDE.md router
preamble (checked only for its table), `docs/COMPATIBILITY.md`, the
validator's own self-description, the registries' `description` strings, and
the repo's conformance to its own layout rule.

A fresh, evidence-based sweep of the current tree (post-P7, validator at
82/0) was run for this spec. Method and results below. **Finding count: 6.**
All six are documentation-class — stale prose or comments contradicting a
registry, a hook, or the repo itself. Zero functional defects: no hook
misroutes, no registry field is wrong, no kernel answer disagrees with policy.

## The sweep — what was checked and found clean

Every check below was run against the working tree at P7's HEAD (`77f8731`),
with output observed, not assumed:

| Surface | Check performed | Result |
|---|---|---|
| Validator | `scripts/validate-engineos.sh` run fresh | `passed 82, failed 0` — matches P7's exit state |
| Check letters | `grep -n -- '-- C[0-9]' scripts/validate-engineos.sh` | C1–C22 all present, no gap, no duplicate. C13 ("no empties") is physically last in the file by design — P4's spec (line 244) already confirmed this ordering knowingly |
| Registry versions | `version` of all 7 registries vs the frozen-contract sections of the P1–P7 specs | Monotonic and exact: intents 1.0.0→1.1.0(P3)→1.2.0(P4)→1.2.1(P5)→1.3.0(P6); policy 1.0.0→1.1.0(P2)→1.2.0(P3)→1.3.0(P5)→1.4.0(P7); routing 1.1.0(P2); capabilities 1.1.0(P3); models/agents/decision-rules 1.0.0 |
| Router table vs intents.json | Own-eyes row count, not just C16: 28 table rows, 29 intents | Consistent — the +1 is P1's documented store-release split (one row → `ios-release` + `android-release` intents) |
| Agent triple-mirror | `agents/{router,critic,mobile-coordinator,product-spec}.md` frontmatter vs generated `registries/agents.json` vs their CLAUDE.md rows | All three agree on tools, model, description for all four spot-checks. `router` (P3, newest): tools `Read, Grep, Glob, Bash`, model `opus`, tier `design`, capability `route` — exactly as C18 pins |
| jq-silence claim | `grep -n 'command -v jq' hooks/*.sh` | Exactly six hooks `exit 0` silently without jq (route-before-change, mark-unrecorded, record-verify, task-scale-advisor, gate-advisor, route-advisor); stop-verify/post-edit-check degrade to grep/sed, ensure-project-layout keeps a grep fallback. CLAUDE.md's "those six" sentence is **correct** |
| Rule cross-references | Every backticked `rules/`, `registries/`, `scripts/`, `hooks/`, `templates/` path in `rules/*.md`, CLAUDE.md, COMPATIBILITY.md resolved against the tree | All resolve. (The `docs/adr/`, `docs/prds/` etc. hits in `rules/memory.md` are generic consuming-project homes, not claims about this repo — but see F6) |
| Dead-phrase checks | `grep -rn "until clean" / "resume commands"` across CLAUDE.md, rules/, registries/, hooks/, skills/, templates/ | Both stay dead everywhere C20c/C19 demand — and everywhere else too |
| Deletions/renames | `git diff --name-status --diff-filter=DR 96f9821..HEAD` (pre-epic base → P7) | Empty. The epic deleted and renamed nothing; COMPATIBILITY.md's deprecation machinery was correctly never needed |
| Capabilities | `registries/capabilities.json` entries | Six: author-spec, implement, validate, document, security-review, route. Note: `route` (P3) is the epic's only new *capability*; `repair` and `telemetry` are policy.json blocks, not capabilities — any recollection of "repair/telemetry capabilities" is imprecise |

## Findings — the six live contradictions

Each row names the two things that disagree, with file:line for both sides.

### F1 — CLAUDE.md still crowns `hooks/routing-map.sh` the routing authority (P2 made it a shim)

- **Side A:** `CLAUDE.md:48–49` — "Its canonical path→domain map is
  `hooks/routing-map.sh` — that file is authoritative for file-pattern
  routing"; and `CLAUDE.md:52` still speaks of "the hook map" as a third
  independent thing the validator reconciles.
- **Side B:** `hooks/routing-map.sh:2–9` — "THIS FILE IS NOW A SHIM. …that
  data now lives as machine-readable match/excluded globs in
  registries/routing.json, resolved by scripts/kernel.sh route-path. …
  CLAUDE.md's stack/domain table stays the human mirror of the registry, not
  of this file." `registries/routing.json`'s own description says the same.
- **Why it matters:** the constitution sends a reader (human or model) to a
  file that contains no routing data, in direct contradiction of the shim's
  own header — the exact "human mirror drifts from reality" defect the epic
  exists to kill. Unchecked: no C-check reads this sentence.
- **Decision: fix in P8** (prose rewrite of the bullet), plus a stays-dead
  guard in C23c.

### F2 — CLAUDE.md's hook-routing claims count 8 domains; the registry has 10

- **Side A:** `CLAUDE.md:46–47` — "The stack/domain rows below (backend,
  frontend, mobile, LLM, DBA, DevOps, security, test) are mirrored
  deterministically by the PreToolUse hook"; `CLAUDE.md:53–54` — "All other
  rows are request-driven and have no hook equivalent"; `CLAUDE.md:56–57` —
  "first match wins, in this precedence chain: security → test → backend →
  dba → devops → mobile → frontend → llm" (8 domains).
- **Side B:** `registries/routing.json` `.precedence` = `security, test,
  backend, dba, ios-release, android-release, devops, mobile, frontend, llm`
  (10 domains); `registries/intents.json` has **10** `hook_mirrored` intents,
  including `ios-release` and `android-release` — the store-release row IS
  hook-routed (C17 proves each domain's `sample_path` resolves through the
  kernel; validator green includes both release domains).
- **Why it matters:** the "human mirror" misstates which edits the hook
  routes and in what order — a store-release path edit produces a `[router]`
  line the constitution says cannot exist. This predates the epic (the
  store-builder arms landed 2026-07-16; P1 mirrored the registry to the hook's
  reality but nobody re-read this preamble prose). C14 checks
  precedence-vs-domain-order *inside* the registry only; nothing reads this
  sentence.
- **Decision: fix in P8** (list all 10 in both sentences; delete the false
  "no hook equivalent" claim for store-release), plus **C23a**: the
  precedence-chain sentence must name every `.precedence` domain in registry
  order — the next domain added to routing.json re-drifts this sentence
  silently otherwise.

### F3 — the validator's own header undercounts the jq-silent hooks ("four"; the truth is six)

- **Side A:** `scripts/validate-engineos.sh:7` — `"The hooks need jq" (four
  hooks no-op silently without it)`. Also `scripts/validate-engineos.sh:202`
  — comment "precedence must list every domain exactly once, in
  routing-map.sh arm order" (the arms no longer exist; the order is the
  registry's own `.domains` order).
- **Side B:** six hooks exit 0 silently without jq (grep evidence above);
  `CLAUDE.md:60–66` states six and names them correctly. And C14's `p_dom` is
  computed from `.domains[].id`, not from any arm.
- **Why it matters:** the integrity checker's self-description is itself
  stale — cosmetic, but this epic's whole thesis is that stale prose is a
  defect, and the checker should not be the one exception.
- **Decision: fix in P8** (two comment edits). **No check**: a comment about
  the validator inside the validator has no independent second side to
  compare against; C-checks guard cross-file contracts, not comments.

### F4 — COMPATIBILITY.md's always-on enumeration omits `rules/gates.md`

- **Side A:** `docs/COMPATIBILITY.md:63–64` — "the always-on set
  (`rules/base.md`, `security.md`, `git.md`, `memory.md`, `parallelism.md`,
  `models.md`, `risk-autonomy.md`, `context.md`)" — eight files.
- **Side B:** `CLAUDE.md:10–18` — nine `@rules/` always-on imports, including
  `@rules/gates.md`. The validator's C2/C5b derive the always-on set from
  these imports, so the machine already treats gates.md as always-on.
- **Why it matters:** that paragraph sets the highest review bar ("never
  batched with unrelated work") for always-on changes; `rules/gates.md` — the
  file every risk tier's ceremony hangs off — silently escapes it.
- **Decision: fix in P8** (add `gates.md` to the sentence), plus **C23b**:
  every `@rules/` import in CLAUDE.md must be named in COMPATIBILITY.md's
  always-on enumeration — the next always-on promotion re-drifts it otherwise.

### F5 — two registry `description` strings describe pre-epic contents

- **Side A:** `registries/policy.json` `.description` — "source of truth for
  EngineOS risk, autonomy, gates, parallelism and retry policy …
  validate-engineos.sh's C16 checks…". That enumerates only the P1 blocks.
- **Side B:** the same file at 1.4.0 also holds `prompt_signals` (P2),
  `router` (P3), `repair` (P5) and `telemetry` (P7), checked by C17, C18, C20
  and C22 — four phases bumped `version` and none touched `description`.
  Lesser sibling: `registries/intents.json` `.description` says "One entry
  per row of CLAUDE.md's table" (it is 29 entries for 28 rows — the
  store-release split) and names only C16 as its reader (C18d, C19 and C21
  also read it).
- **Why it matters:** the description is the first thing a consumer (hook
  author, the ai-se-os runner) reads to decide what lives here; both
  understate their file's scope by several phases.
- **Decision: fix in P8** (rewrite both descriptions; PATCH bumps
  `policy.json` 1.4.0 → 1.4.1 and `intents.json` 1.3.0 → 1.3.1, same
  wording-only precedent as P5's 1.2.1). **No check**: whether a description
  matches its file's contents is semantic, not extractable — exactly the
  boundary P6 drew.

### F6 — the constitution's own repo violates non-negotiable #5's layout

- **Side A:** CLAUDE.md non-negotiable #5 — "every project carries
  `.engineos/{changes,archived,memory}` + `docs/{specs,prds,rules}`" — and
  `hooks/layout-manifest.sh:14–16`, which mandates `docs/prds` (README +
  template) and `docs/rules` (README) as the standard layout.
- **Side B:** `ls docs/` in this repo — `specs/` exists; `prds/` and `rules/`
  do not. The repo carries `.engineos/`, so it has opted in to the standard;
  the seeds it would receive already exist in `templates/project-layout/`
  (`prds-README.md`, `prd-template.md`, `rules-README.md`).
- **Why it matters:** the repo that ships the rule is the one project
  visibly not following it.
- **Decision: fix in P8** — commit the three seeded files
  (`docs/prds/README.md`, `docs/prds/_template.md`, `docs/rules/README.md`),
  exactly what `ensure-project-layout.sh` would write. **No new CI check**:
  layout conformance is already owned at runtime by the SessionStart hook;
  duplicating it in CI would give the fact two enforcers (`rules/memory.md`:
  one home per fact).

## Where the 28 went

The parent plan named this phase "cleanup of 28 audited contradictions". The
number cannot be sourced: `grep -rn "28 audited\|28 contradiction"` across the
entire tree including `.engineos/` archives finds only the P3–P7 change
records' forward references to the phase's *name* — no list, no audit artifact.
The closest real artifact,
`.engineos/archived/2026/07/general/2026-07-30-full-config-audit-fixes.md`,
is a **pre-epic** audit (72 files fixed, five parallel auditors, 2026-07-30)
that predates both the phrase and the epic; its Deferred section lists six
owner decisions, none of them a contradiction inventory.

Plausible explanations, in decreasing order of likelihood — stated, not
claimed as fact:

1. **A stale estimate made at plan-authoring time**, before anyone knew P1–P7
   would fix most drift classes structurally in passing. They demonstrably
   did: P1 re-mirrored `rules/models.md` and recorded 3 spec deviations, P3
   retired the unreachable suppression notes, P4 fixed 3 already-shipped
   handoff drifts, P5 killed both "until clean" promises, P6 reconciled four
   drifted prose homes and one defective archived record. An early-August
   inventory of ~28 would have been mostly consumed by the epic itself.
2. **A numeric echo of P1's own 28** — the router table's 28 rows / the
   original 28 intents — conflated into the phase name. Unverifiable;
   noted only because the coincidence is exact.

Either way the discipline is the one every prior phase used: the number is
whatever the evidence says. Today the evidence says **six**, all
documentation-class, and reconstructing 22 more to honor a name would be
manufacturing defects — rejected alternative 1.

## Frozen contract 1 — the CLAUDE.md preamble corrections (F1, F2)

The routing bullet (`CLAUDE.md:46–54`) is rewritten to say: the stack/domain
rows **and the mobile store-release row** are mirrored deterministically by
`hooks/route-before-change.sh`; the canonical path→domain map is
`registries/routing.json` (`match`/`excluded` globs) resolved by
`scripts/kernel.sh route-path`; `hooks/routing-map.sh` is a compatibility shim
kept only for its function contracts; the table remains the human mirror of
the **registry**; all other rows are request-driven with no hook equivalent.

The precedence sentence (`CLAUDE.md:56–57`) becomes, frozen verbatim:

> first match wins, in this precedence chain: security → test → backend →
> dba → ios-release → android-release → devops → mobile → frontend → llm.

Ten domains, registry order. C23a holds it there.

## Frozen contract 2 — COMPATIBILITY.md and the registry descriptions (F4, F5)

- `docs/COMPATIBILITY.md` always-on sentence gains `gates.md` (nine files,
  matching CLAUDE.md's imports). C23b holds it there.
- `registries/policy.json` 1.4.0 → **1.4.1**: description rewritten to
  enumerate all nine blocks (risk, autonomy, gates, parallelism, retry,
  prompt_signals, router, repair, telemetry) and to name C16/C17/C18/C20/C22
  as its checks.
- `registries/intents.json` 1.3.0 → **1.3.1**: description states 29 entries
  for 28 rows (store-release split) and names C16/C18d/C19/C21 as readers.
- Both are wording-only: PATCH per COMPATIBILITY.md's own ladder, precedent
  P5's 1.2.1.

## Frozen contract 3 — validator comment fixes and C23 (F1–F4 guards)

Comment edits (no C-number, no `ok` line): header line 7 "four" → "six";
C14's line-202 comment drops "routing-map.sh arm order" for "registry domain
order". While in the header: the summary block stays the three original
invariants plus one added line pointing at C16–C23 for the decision-kernel
era — a full 23-family inventory in a comment would itself rot (F3's lesson).

**C23 — constitution preamble mirrors** (inside the existing jq guard, house
style of C16c/C19c/C20c):

- **C23a** — extract the arrow-chain from CLAUDE.md's precedence sentence;
  it must equal `jq -r '.precedence | join(" → ")' registries/routing.json`.
  Fails on a missing, extra, or reordered domain.
- **C23b** — every `@rules/*.md` always-on import in CLAUDE.md must appear
  (basename match) in COMPATIBILITY.md's always-on enumeration sentence.
- **C23c** — stays-dead: CLAUDE.md no longer contains "authoritative for
  file-pattern routing" applied to `routing-map.sh` (same pattern as C19a's
  purged note and C21e's dead README copy).

Three planted-breakage cases in `scripts/test-validate-engineos.sh`: reorder
a precedence domain in the CLAUDE.md sentence (C23a fires), drop `gates.md`
from COMPATIBILITY.md (C23b fires), restore the authority sentence (C23c
fires).

## Frozen contract 4 — the layout seeds (F6)

`docs/prds/README.md`, `docs/prds/_template.md`, `docs/rules/README.md` —
byte-copies of their `templates/project-layout/` sources, exactly as
`ensure-project-layout.sh` would seed them. No other layout change.

## Rejected alternatives

1. **Reconstruct a 28-item list to make the phase name true.** Rejected with
   the same evidentiary discipline P3–P6 applied to their parent-plan
   wordings: the number has no source artifact, and padding findings to hit
   it would fabricate the very prose-vs-reality drift this epic removes.
2. **A fresh N-agent parallel audit fan-out.** Rejected: the checked surfaces
   are machine-verified already (C1–C22, 82/0, run fresh for this spec); the
   unchecked residue is a small, enumerable set of adjacent prose surfaces
   that one careful pass covered in full. `rules/parallelism.md`'s own
   don't-fan-out clause applies — the units here are neither numerous nor
   independent enough to pay for six briefs.
3. **A generic "every CLAUDE.md sentence matches some registry" mega-check.**
   Rejected: not mechanically extractable. The house style (C16c, C19c, C20c,
   now C23a/b) is targeted extraction of one specific list or number per
   check, each with a planted-breakage proof.
4. **A CI check on the repo's own docs layout (F6).** Rejected: the
   SessionStart hook already owns layout at runtime; one fact, one enforcer.
5. **MINOR/MAJOR version bump now.** Rejected: P8's registry edits are
   wording-only (PATCH), and the epic's single MINOR bump of
   `.claude-plugin/plugin.json` on merge — already called out in P1's change
   record — covers the additive C23 the same way it covers C16–C22.

## Verification

All to be shown at the barrier, house standard:

- `scripts/validate-engineos.sh`: expected **passed 85, failed 0** (82 + 3 new
  `ok` lines from C23a/b/c) — the green C23 run doubles as proof that F1, F2
  and F4 are actually fixed, since C23 fails against the pre-P8 text.
- `scripts/test-validate-engineos.sh`: expected **passed 77, failed 0**
  (74 + 3 planted-breakage cases).
- `scripts/test-kernel.sh` 153/0, `hooks/test-route.sh` 38/0,
  `hooks/test-route-advisor.sh` 17/0, `hooks/test-gate-advisor.sh` 20/0,
  `hooks/test-task-scale.sh` 12/0, `hooks/test-verify.sh` 15/0,
  `scripts/test-telemetry.sh` 16/0 — all UNCHANGED (P8 touches no hook or
  kernel logic).
- `bash -n` on the validator; `jq empty` on both edited registries.
- Manual smoke: `jq -r '.precedence | join(" → ")' registries/routing.json`
  and the corrected CLAUDE.md sentence print the same 10-domain chain;
  `ls docs/prds docs/rules` lists the three seeded files.

## Epic closing statement

This sweep is the epic's exit evidence. After P1–P7:

- **Every drift class the epic set out to fix is now held closed by
  C16–C22** — registry↔prose numbers and enums (C16, C20c), routing patterns
  and precedence behaviorally through the kernel (C17), agent/capability
  wiring (C18), handoff and change-record section contracts (C19, C21),
  telemetry policy and plumbing (C22). The fresh validator run (82/0) and the
  clean checks in the sweep table above are the observation, not the hope.
- **The six residual contradictions all sat on surfaces no check pointed
  at** — preamble prose, a policy doc's enumeration, the checker's own
  comments, description strings, the repo's own layout. P8 fixes all six and
  adds checks only where recurrence is structural (a new routing domain, a
  new always-on rule); the rest are one-time fixes whose classes are either
  self-referential (comments), semantic (descriptions), or already owned by
  a runtime enforcer (layout).
- **What remains permanently manual/judgment territory** is exactly the
  boundary P5 and P6 drew and P8 confirms: whether verification output
  pasted into a record is real, whether code matches a spec's intent, and
  whether the model obeys the bounds at runtime — `critic`, the
  `code-review` skill's Spec axis, and eval golden cases own those; no C-check
  ever will.

## Out of scope

The ai-se-os runner adoption (kernel calls replacing its hardcoded
`ESCALATION_ORDER`/`MAX_ATTEMPTS`/security-path copies, exec-journal's writer,
the conformance-capture reader) — the epic's only remaining follow-on once P8
lands; a separate unit in that repo, not this one.
