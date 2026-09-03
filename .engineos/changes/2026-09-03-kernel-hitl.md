---
name: 2026-09-03-kernel-hitl
status: active
owner: backend-coordinator (borisenko)
spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md
domain: general
---

## What
Human-in-the-loop became a first-class kernel entity: a new `hitl` block in
`registries/policy.json` (a closed eight-id reason vocabulary, a situation
vocabulary, and the record home), a new `scripts/kernel.sh hitl` subcommand
that answers `{required, reasons, autonomy_after, record_home}`, the answer
folded into `resolve-task` as `.hitl`, announced by `hooks/prompt-advisor.sh`
as a context line plus a `hitl` telemetry event, and guarded by a new C26
check family. `telemetry.events[].written_by` became an array on every event,
and C22's wiring check now runs in both directions.

## Why
Before this change, "a human must decide here" was an *implication* of a risk
tier rather than a fact anything could query. `autonomy.ceiling_by_risk`
answers "how far may this unit go alone"; nothing answered "must a human
decide, and why". The consequences were concrete:

- Task 2's backpressure `reject` message already said `hitl:
  budget-exhausted` — citing a vocabulary that did not exist anywhere.
- `rules/gates.md` required "human approval recorded before the external
  effect" at high risk, with no named place to record it and no reason ids to
  record, so the record could not be checked and in practice was not written.
- A gate that cites a reason nobody enumerated produces an audit trail no one
  can argue with or override, which is the failure mode `rules/risk-autonomy.md`
  exists to prevent ("a tier without its reason cannot be argued with").

Making it a kernel entity means the reasons are a closed list, the answer is
deterministic, the prompt advisor can announce it before the first write, and
the decision has one checked home.

## Scope
- `registries/policy.json` — new top-level `hitl` block after `breaker`;
  `telemetry.events[].written_by` scalar -> array on every event; new `hitl`
  telemetry event; `description` extended to name `hitl` and C26.
- `registries/intents.json` — `record-change.required_sections` gains
  `Human decisions` (forced by C21b, see Deviations).
- `scripts/kernel.sh` — new `cmd_hitl`, usage header, dispatcher entry, usage
  string; `cmd_resolve_task` resolves the floor/ceiling, publishes `risk_floor`,
  and folds in `.hitl` only for a classified tier (see Deviations 8).
- `scripts/test-kernel.sh` — new `hitl` section.
- `hooks/prompt-advisor.sh` — `hitl` telemetry event, a `hitl_note` in the
  context payload, and (fix round 2) a `classify_note` for a high floor with no
  classified tier.
- `hooks/test-prompt-advisor.sh` — two existing assertions became stale by
  design (see Deviations 7); updated, plus a new mirror case.
- `scripts/checks/70-runtime.sh` — new C26/C26b/C26c/C26d; C22a reads
  `written_by` as an array; C22c iterates it and adds the reverse assertion.
- `scripts/test-validate-engineos.sh` — 13 new negative cases (4x C22, 9x C26,
  the last one pinning the fix-round-1 ruling from the failing side).
- `rules/risk-autonomy.md` — new `## Human-in-the-loop` section, including the
  rule that HITL is answered from a classified tier and never from a floor.
- `rules/gates.md` — one release-checklist line.
- `.engineos/changes/_template.md` — new `## Human decisions` section.
- `skills/record-change/SKILL.md` — step 3 names `## Human decisions` so the
  section cannot archive with its placeholder (fix round 2, Deviations 12).

Not touched, and deliberately: `registries/routing.json`, the agent files, and
`CLAUDE.md`. HITL adds no router row and no new domain.

## Checklist
- [x] `hitl` block added to `registries/policy.json` with the frozen values
- [x] `telemetry.events[].written_by` is an array on every event
- [x] `hitl` telemetry event registered with `keys` and a `sample`
- [x] `cmd_hitl` added, fail-closed on a missing block, fail-fast on arg values
- [x] `hitl` registered in the dispatcher, the usage string and the usage header
- [x] `cmd_resolve_task` folds in `.hitl` for a classified tier only, and
      publishes `risk_floor` beside it (both null when there is no evidence)
- [x] `hooks/prompt-advisor.sh` emits the event and the context line
- [x] C26a/C26b/C26c/C26d added to `scripts/checks/70-runtime.sh`
- [x] C22a accepts arrays; C22c iterates them and asserts the reverse direction
- [x] `rules/risk-autonomy.md`, `rules/gates.md` and the change-record template
      mirror the block
- [x] `budget-exhausted` coupled to Task 2's literal (C26d + a kernel fixture)
- [x] Negative cases planted for every new check
- [x] `hooks/test-prompt-advisor.sh`'s two now-stale assertions updated to the
      new intended behaviour, with a mirror case so the new line cannot fire
      unconditionally and still pass
- [x] Fix round 1: HITL asks a classified tier only; `--conflict` no longer
      synthesized; `risk_floor` published beside `hitl`; prose, canary and a
      failing-side negative case all retargeted
- [x] Fix round 1: `telemetry.note` records the `written_by` supersession
- [x] Fix round 2: `autonomy_after` is a clamped one-level drop that never
      raises, with the high landing read from
      `autonomy.high_with_thin_evidence` and fail-closed on a bad read
- [x] Fix round 2: the dead top-level `risk_floor` deleted; the advisor emits a
      classification-owed instruction instead, asserted present by the tests
- [x] Fix round 2: `skills/record-change/SKILL.md` step 3 names
      `## Human decisions`
- [x] `scripts/test-kernel.sh` (308 passed), `hooks/test-prompt-advisor.sh`
      (50 passed) and `scripts/test-validate-engineos.sh` (103 passed) run
      green in fix round 1
- [ ] Final gate: `scripts/validate-engineos.sh` and shellcheck — NOT RUN;
      they belong to the controller (see Verification)

## What was made
`policy.hitl` carries the three frozen values verbatim: `reasons` (eight ids,
in the kernel's emission order), `situations` (four ids, disjoint from
`retry.never_retry`), and `record_home`
(`.engineos/changes/<record>.md#human-decisions`).

`kernel.sh hitl --risk T --autonomy A0..A4 [--evidence thin|adequate]
[--external-effect true|false] [--conflict true|false] [--situation S]` returns
`{required, reasons, autonomy_after, record_home}`. `required` is
`reasons != []`. The four `retry.never_retry` ids collapse to the single reason
`never-retry-situation` (they are one decision: stop, escalate, do not retry);
each `hitl.situations` id carries its own reason. Three fail-closed properties,
each with a fixture:

1. A missing `hitl` block is an error, not a null `record_home` with exit 0 —
   the class `cmd_risk` and `cmd_breaker` were both fixed for.
2. Every flag checks `[ $# -ge 2 ]` before `shift 2`; without it a trailing
   flag spins the arg loop forever (`set -uo pipefail`, no `-e`).
3. An unknown `--situation` is an error, never an ignored flag — a silently
   dropped situation would read as `required: false`, "no human needed".

`resolve-task` asks `hitl` only from a CLASSIFIED tier — `decisions.any_high`,
a registered rule that matched this prompt's own text and declared risk=high.
It reads the ceiling from `autonomy.ceiling_by_risk` for whatever floor it
resolved (a floor with no entry there is a registry error, so the lookup and its
`err` run either way), and publishes the floor as a top-level `risk_floor`
sibling of `hitl`. A prompt whose only risk evidence is `route.risk_floor` gets
`hitl: null` plus that floor: a classification is owed, and nothing about a
human is claimed until someone does it. A prompt with no risk evidence at all
gets `hitl: null` and `risk_floor: null` rather than an invented "low" — no risk
evidence is not low risk. No `--conflict` is synthesized from `any_high`; see
deviation 8.

`hooks/prompt-advisor.sh` appends the `hitl` telemetry event (ids and booleans
only) and adds a `hitl_note` to the context payload naming the reasons and the
record home.

C26 is four checks: (a) the block is well-formed and the two situation
vocabularies are disjoint; (b) a canary that exercises a `required: false` case
and a `required: true` case, both pinned on `required` AND `autonomy_after`,
plus the thin-evidence drop against `autonomy.high_with_thin_evidence`, both
flag-driven reasons, every declared situation, an unknown situation, and the
`resolve-task` fold; (c) the prose mirrors, every grep scoped to its own
section; (d) the backpressure coupling.

## Verification
**Partially verified.** Fix round 1 was authorized to run the three suites that
cover the changed surface; `scripts/validate-engineos.sh` itself and the final
gate remain the controller's. What was run, in fix round 1:

```
$ bash scripts/test-kernel.sh
passed 308, failed 0

$ bash hooks/test-prompt-advisor.sh
prompt-advisor: 50 passed, 0 failed

$ bash scripts/test-validate-engineos.sh
ok   resolve-task folding hitl off a bare risk floor is caught
passed 103, failed 0

$ bash -n scripts/kernel.sh scripts/test-kernel.sh \
         scripts/test-validate-engineos.sh scripts/checks/70-runtime.sh \
         hooks/prompt-advisor.sh hooks/test-prompt-advisor.sh
bash-n-rc=0

$ jq . registries/policy.json > /dev/null
jq-rc=0
```

Fix round 2 re-ran the same three suites after its changes:

```
$ bash scripts/test-kernel.sh
passed 322, failed 0

$ bash hooks/test-prompt-advisor.sh
prompt-advisor: 58 passed, 0 failed

$ bash scripts/test-validate-engineos.sh
passed 104, failed 0
```

The two items round 1 left open were closed by the task reviewer, not by this
agent, and are recorded here as the reviewer reported them:

```
$ bash scripts/validate-engineos.sh
passed 98, failed 0

$ shellcheck -S warning <the six changed shell files>
(clean)
```

What remains outside this record is the merged-tree gate, which the controller
runs once every branch of the epic is integrated.

What was run in the first round (the ruling then in force forbade every suite):

```
$ bash -n scripts/kernel.sh scripts/test-kernel.sh \
         scripts/test-validate-engineos.sh scripts/checks/70-runtime.sh \
         hooks/prompt-advisor.sh
(no output — all parse)

$ jq . registries/policy.json > /dev/null
policy.json valid

$ jq -e '.hitl.reasons | length == 8' registries/policy.json
true

$ jq -c '.telemetry.events[] | {id, written_by, keys}' registries/policy.json
{"id":"route","written_by":["hooks/prompt-advisor.sh"],"keys":["escalate","reasons","intents","suppressed","agents"]}
{"id":"decision-rules","written_by":["hooks/prompt-advisor.sh"],"keys":["rules","any_high"]}
{"id":"verify","written_by":["hooks/stop-verify.sh"],"keys":["failed","targets"]}
{"id":"hitl","written_by":["hooks/prompt-advisor.sh"],"keys":["required","reasons"]}

$ jq -n --slurpfile pol /dev/null --arg r "" --arg a "" --arg e "" --arg s "" \
       --argjson x false --argjson c false -f <cmd_hitl's jq program, def-wrapped>
compile-rc=0

$ jq -n -f <prompt-advisor's NOTES program with hitl_note, def-wrapped>
notes-compile-rc=0

$ bash scripts/validate-engineos.sh --list | grep C26
(NOT RUN — forbidden by the ruling; C26/C26b/C26c/C26d are declared as
 check_C26* in scripts/checks/70-runtime.sh and grep confirms the four
 function definitions exist for the harness to discover)
```

The two jq compiles are parse-only: the program is wrapped in a `def` that is
never invoked, so jq compiles it (including undefined-variable errors) without
evaluating it.

## Human decisions
<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
2026-09-03 | controller (dispatching agent) | `external-effect` | approved with a bound | Autonomy A2 inside this worktree: commit locally, never push, never merge. No external effect was taken — nothing pushed, nothing merged, no other branch touched.
2026-09-03 | controller (dispatching agent) | `evidence-insufficient` | refused at dispatch, withdrawn in fix round 1 | The first commit shipped on parse-only evidence because the dispatch brief refused every suite. Fix round 1 authorized the three suites covering the changed surface, fix round 2 re-ran them, and the task reviewer ran `scripts/validate-engineos.sh` (98 passed, 0 failed) and `shellcheck -S warning` (clean on all six changed shell files). The refusal no longer applies; `## Verification` records what was run and by whom.

## Changes registered
Three commits on `feat/kernel-hitl`, base `5fca050` (which carries Tasks 2 and
3). Real output, captured at `3642ba6` — before the amend that added this
section's own text, which touched nothing but this file, so every number below
is exact except this record's own line count.

```
$ git status --short
?? .superpowers/          (untracked, deliberately never committed)

$ git log --oneline 5fca050..HEAD
3642ba6 fix(kernel): clamp the thin-evidence autonomy drop
58504dd fix(kernel): gate hitl on a classified tier
66fd2d5 feat(kernel): make human-in-the-loop queryable

$ git diff --stat 58504dd
 .engineos/changes/2026-09-03-kernel-hitl.md | 195 +++++++++++++++++-----------
 hooks/prompt-advisor.sh                     |  14 +-
 hooks/test-prompt-advisor.sh                |  41 ++++--
 registries/policy.json                      |   2 +-
 rules/risk-autonomy.md                      |   9 +-
 scripts/checks/70-runtime.sh                |  44 +++++--
 scripts/kernel.sh                           |  50 ++++++-
 scripts/test-kernel.sh                      |  80 ++++++++++--
 scripts/test-validate-engineos.sh           |   9 ++
 skills/record-change/SKILL.md               |   9 ++
 10 files changed, 335 insertions(+), 118 deletions(-)

$ git diff --stat 5fca050
 .engineos/changes/2026-09-03-kernel-hitl.md | 545 ++++++++++++++++++++++++++++
 .engineos/changes/_template.md              |   4 +
 hooks/prompt-advisor.sh                     |  29 +-
 hooks/test-prompt-advisor.sh                |  53 ++-
 registries/intents.json                     |   1 +
 registries/policy.json                      |  23 +-
 rules/gates.md                              |   3 +
 rules/risk-autonomy.md                      |  36 ++
 scripts/checks/70-runtime.sh                | 290 ++++++++++++++-
 scripts/kernel.sh                           | 164 +++++++-
 scripts/test-kernel.sh                      | 225 +++++++++++
 scripts/test-validate-engineos.sh           | 108 ++++++
 skills/record-change/SKILL.md               |   9 +
 13 files changed, 1430 insertions(+), 24 deletions(-)
```

The whole-branch stat above is reproduced from `git diff --stat 5fca050` at the
same sha; the per-file numbers for the twelve files other than this record are
exact, and this record's own line grew by the length of this section.

No renames, no deletions. Two additions across the three commits:
`.engineos/changes/2026-09-03-kernel-hitl.md` (this record) and nothing else —
every other path already existed.

`58504dd` was NOT amended: fix round 2 is its own commit so the review of round
1 stays reviewable against the sha it was written for.

## Notes

### Deviations from the brief, and why

1. **`hooks/prompt-advisor.sh` uses the `NOTES` jq pipeline, not `printf`.**
   The brief's step 6 writes the line with a bare `printf` to stdout and calls
   `scripts/telemetry.sh append` directly, using `$TASK` and `$REPO_DIR`. This
   tree's advisor is the consolidated adapter: it builds one `NOTES` payload
   and emits it through `hook_context`, which prints the hook's JSON envelope
   on the same stdout. A loose `printf` would corrupt that envelope. The line
   became a `hitl_note` def in the pipeline, and the append became
   `hook_telemetry hitl "$HITL_DATA"` — the shared emitter that
   `hooks/lib-common.sh` now owns, and the form C22c accepts.

2. **`written_by` arrays list only the real writers.** The brief's step 3 says
   to set the `route` event's array to `["hooks/prompt-advisor.sh",
   "hooks/route-advisor.sh"]` and `decision-rules` to
   `["hooks/prompt-advisor.sh", "hooks/gate-advisor.sh"]`. Neither
   `hooks/route-advisor.sh` nor `hooks/gate-advisor.sh` exists in this tree —
   both were consolidated into `hooks/prompt-advisor.sh`. Listing them would
   fail C22a (`written_by-names-a-missing-file`) and C22c's forward check.
   Each event therefore carries exactly its one real writer, and the new
   reverse check is what keeps a future second writer from going undeclared.

3. **`registries/intents.json` was edited, though the brief did not list it.**
   The brief's step 7 says "if C21 asserts the change-record template's heading
   list, add `## Human decisions` there in the same PR". C21b asserts it in
   BOTH directions — every registry-required section must be in the template,
   and every template section must be declared in the registry — so adding the
   section to `_template.md` without declaring it in
   `record-change.required_sections` would fail C21b. Added to
   `required_sections` only, NOT to `archive_contract.instance_sections` or
   `instance_sections_since`: those gate archived records, and retroactively
   requiring a section on already-archived records would fail C21c for work
   that predates the concept.

4. **`resolve-task` uses an explicit branch, not a word-split substitution.**
   The brief writes `$( [ "$any_high" = true ] && printf -- '--conflict true' )`,
   which depends on unquoted word-splitting of a command substitution. An
   explicit branch does not. (The `--conflict` argument itself was dropped in
   fix round 1 — deviation 8.)

5. **`.hitl` is `null` when there is no risk floor.** The brief does not say
   what `resolve-task` should do when `route.risk_floor` is null and no
   decision rule matched (a non-substantive prompt). Defaulting to `low` would
   fabricate a tier, which is exactly the fail-open `cmd_risk` was fixed for;
   `null` matches the sibling fields `risk_floor` and
   `autonomy_ceiling_at_floor`, and the advisor's `.hitl.required // false`
   already reads it correctly. Recorded here as an interpretation of the
   contract, not a change to it.

6. **C26 lives in `scripts/checks/70-runtime.sh`, not
   `scripts/validate-engineos.sh`.** The validator is split into discovered
   `check_C<id>` functions; the brief predates the split.

7. **`hooks/test-prompt-advisor.sh` was edited, though the brief did not list
   it.** Two of its assertions became false the moment the advisor gained the
   HITL line, and shipping a knowingly-red test is worse than editing one
   outside the listed scope:
   - The telemetry-stream case uses "deploy the billing service to
     production", which trips `rule-production-write` (risk=high), so a third
     event now fires. Updated from `2` lines / `route,decision-rules,` to `3`
     lines / `route,decision-rules,hitl,`.
   - The "exactly one deterministic line" case uses "fix the auth guard bug",
     which resolves to the `security-files` intent — `risk_floor: high`. In
     the first round the HITL line joined the contract line there and the case
     was updated to two lines; fix round 1 put it back to one line, because a
     floor no longer answers HITL at all. It now also asserts that the
     contract line publishes `risk_floor=high` and that no HITL line appears,
     and the mirror case moved to a prompt that trips a high-risk decision
     rule, where the line must appear with its reason id.

   Neither existing assertion was weakened or deleted: both got tighter (the
   reason id and the second line are now named), per
   `rules/verification.md`'s prohibition on neutralizing tests to make a gate
   pass.

8. **Fix round 1: HITL fires on a confirmed tier, never on a risk floor — and
   no `--conflict` is synthesized.** The controller ruled on the concern this
   record raised in the first round (see "Noise concern, resolved in fix round
   1" below): a floor is an input to classification, not a classification, so
   `cmd_resolve_task` no longer synthesizes `--risk <floor>`. It asks `hitl`
   only on `decisions.any_high` — a registered rule that matched the prompt's
   text and declared risk=high — and publishes `route.risk_floor` as a
   top-level `risk_floor` sibling of `hitl` so a caller reading `hitl: null`
   still sees that a classification is owed. Announcing a gate off a bare floor
   is the gate theatre `rules/gates.md` names: "a gate you passed by lowering
   its bar is worse than no gate", and its everyday form is a gate that fires
   on everything, which teaches readers to skip the one that matters.

   The `--conflict true` argument went with it. `policy-conflict` is the reason
   for a decision rule demanding more than the CLASSIFIED tier permits; on a
   task nobody has classified there is no tier to disagree with, so asserting a
   conflict was the same unearned claim one level down. The flag stays on
   `cmd_hitl`'s own surface for a caller that has actually observed both, and
   `rules/risk-autonomy.md`'s `policy-conflict` row was reworded to say so —
   it previously read "or a matched rule carries risk=high on a lower-tier
   task", which described exactly the inference that was removed.

   Pinned from the failing side rather than only asserted: C26b now requires
   `resolve-task` on a floor-only prompt to answer `hitl: null` with the floor
   the registry declares, and `scripts/test-validate-engineos.sh` carries a
   negative case that widens the guard back to any floor and confirms C26b goes
   red. A check that pinned the old behaviour would have been worse than no
   check.

9. **Fix round 1: `telemetry.note` records the `written_by` supersession.**
   `docs/specs/2026-08-06-decision-kernel-p7-telemetry.md` carries a
   one-writer-per-event invariant that this change's arrays supersede. The
   historical spec was NOT rewritten — it records what was true then. One line
   in `telemetry.note` names the supersession instead, so the registry (the
   source of truth) is the place the two shapes are reconciled.

10. **Fix round 2: `autonomy_after` is a clamped one-level DROP, never an
    assignment.** The reviewer refuted the shipped expression
    `(if $e == "thin" then "A1" else $a end)` from two directions and both were
    real: at `--autonomy A0` it RAISED the ceiling from "explain only, no
    writes" to "propose a diff" in response to WEAKER evidence, inverting the
    rule the field exists to enforce; and at `medium/A3` it dropped two levels
    where `rules/risk-autonomy.md` says "drop autonomy one level" and scopes
    the A1 landing to the high row. It also hardcoded a literal the registry
    already carries under the self-describing name
    `autonomy.high_with_thin_evidence`.

    Now: one level below the ceiling passed in, never above it (so A0 stays
    A0), never below A1, and at risk high capped by
    `autonomy.high_with_thin_evidence` read from the registry — with two
    fail-closed guards on that read, because a missing value or a value that is
    not a level id would make jq index the level list with `null` and answer a
    confident wrong ceiling. Fixtures cover low/medium/high across A0..A4 plus
    the identity case for adequate evidence, and C26b asserts seven tier/level
    pairs derived from the rule rather than from the kernel.

    One disclosure. The ruling's step 1 said "clamped so `A0` stays `A0`",
    which taken alone sends `A1` to `A0`; its enumerated expectations said
    "any tier+A1 to A1". Those two cannot both hold, and the enumerated list
    was implemented: the drop bottoms out at A1 because A0 ("explain only") is
    a consequence of the task being a question rather than of thin evidence,
    and because `rules/risk-autonomy.md`'s high row lands thin evidence on A1
    and not A0. Flagged here rather than silently chosen.

11. **Fix round 2: the top-level `risk_floor` was deleted and replaced with a
    signal.** Round 1 added `risk_floor` beside `hitl` so a caller would see
    that a classification was owed. The reviewer showed it had no reader:
    `hooks/prompt-advisor.sh` reads `task_contract.risk_floor` and always did,
    so the second name was exported surface with no caller outside its own
    tests (`rules/base.md`). Worse, the compensating control was inert —
    `rotate the stripe secret key` and `fix the auth guard bug` produced
    byte-identical advisor output, and secret rotation is a shortcut floor
    `rules/risk-autonomy.md` calls high outright.

    The field is gone. In its place `hooks/prompt-advisor.sh` gained a
    `classify_note` def — inside the same `NOTES` pipeline, so there is still
    one `hook_context` call and no printf — which fires when
    `task_contract.risk_floor == "high"` and `hitl == null`. It is worded as an
    instruction to classify and says in the line itself that it is not an
    approval gate: re-announcing a gate off a floor under another name would
    reintroduce exactly the theatre round 1 removed. The advisor test asserts
    the line IS present on a high-floor prompt (including the secret-rotation
    prompt), that no HITL line joins it, that a classified prompt gets the HITL
    line and NOT the classify line, and that a low-floor prompt gets neither.

12. **Fix round 2: `skills/record-change/SKILL.md` was edited, though no brief
    listed it.** `rules/gates.md` requires the `## Human decisions` section to
    exist and nothing required it to be filled, so a record could archive with
    the template placeholder verbatim — an unrecorded human decision wearing
    the shape of a recorded one. Step 3 now names the section alongside the
    checklist and "what was made".

### The `budget-exhausted` coupling

Task 2's `cmd_admit` reject message embeds the literal `hitl:
budget-exhausted`. Two independent guards now tie it to the registry, so the
literal and the vocabulary cannot be renamed apart:

- **C26d** (`scripts/checks/70-runtime.sh`) asserts three things agree: the
  registry declares `budget-exhausted` in BOTH `hitl.reasons` and
  `hitl.situations`; `scripts/kernel.sh` contains the literal `hitl:
  budget-exhausted`; and `kernel.sh hitl --situation reject` answers with
  exactly that id. The id is spelled once, in the check, because something has
  to state WHICH reason backpressure exhaustion maps to — and a rename in the
  registry fails the first assertion by name rather than letting the grep match
  an empty string.
- **`scripts/test-kernel.sh`** reads the id out of `hitl.reasons`, asserts it
  is non-empty as its own named case, and only then asserts that `admit`'s
  reject reason matches `hitl: <id>` and that `hitl --situation reject`
  answers `[<id>]`.

### Compatibility and versioning

`registries/policy.json` `version` stays `1.6.0` on instruction — the epic
ships as one minor and Task 3 already bumped it.

The `written_by` scalar -> array change is not a break under
`docs/COMPATIBILITY.md`, which names `registries/*.json` **top-level shape** as
the public surface; `telemetry.events[].written_by` is a nested field, and a
repo-wide grep confirms its only readers are C22a and C22c inside this repo. No
hook, skill or script reads it, so no deprecation window applies.

One consequence is worth naming: `docs/specs/2026-08-06-decision-kernel-p7-telemetry.md`
documents the scalar shape and states "One writer per event; two hooks writing
one event would be the drift pair". That invariant is now superseded — the
array plus C22c's new reverse assertion is the replacement, and it is strictly
stronger (the old shape could not express a second writer at all, so the drift
it feared was undetectable). The shipped spec was deliberately NOT rewritten: it
is a historical record of the P7 decision, not a live contract. Fix round 1
added the supersession line to `telemetry.note` so the reconciliation lives in
the registry that is the source of truth (deviation 9).

Fix round 1 adds a top-level `risk_floor` to `resolve-task`'s output and narrows
what `.hitl` answers. Neither is a break: kernel subcommand output is not on
`docs/COMPATIBILITY.md`'s public-surface list, the new field is additive, and
the narrowed `.hitl` never shipped — `66fd2d5` is unmerged on this branch, so
there is no released consumer to deprecate against. The only in-repo consumer,
`hooks/prompt-advisor.sh`, already gated on `.hitl.required // false` and needed
no edit.

### Noise concern, resolved in fix round 1

The first round shipped the brief's frozen contract: `resolve-task` passed the
risk FLOOR to `hitl`, and `high-risk` fires on tier high, so every prompt
resolving to a high-floor intent (`dba`, `devops`, `security-files`,
`ios-release`, `android-release`, `critic-verification`) got a
"human-in-the-loop required — reasons: high-risk" line. "Fix the auth guard
bug" announced a human gate nobody owed, while the advisor's own contract line
in the same payload said "the risk floor is a floor, not the final tier". It
was implemented verbatim and reported as a CRITICAL finding rather than
redesigned mid-task — `rules/subagents.md`: report a contract that looks wrong,
never redefine one unilaterally.

The controller ruled in favour of the finding and assigned the fix to this same
unit. Deviation 8 above is what shipped.

### Known accepted gap — only one reason has a producer

Stated in full, because the earlier version of this section named only
`breaker-open` and that understated it. `resolve-task` can emit exactly ONE of
the eight declared `hitl.reasons`: `high-risk`, on `decision_rules.any_high`.
The other seven are reachable only by a caller invoking `kernel.sh hitl`
directly with the matching flag or situation.

| Reason | In-repo producer |
|---|---|
| `high-risk` | `resolve-task`, via `decision_rules.any_high` |
| `evidence-insufficient` | none — no hook passes `--evidence thin` |
| `external-effect` | none — no hook passes `--external-effect true` |
| `policy-conflict` | none — no hook passes `--conflict true`; round 1 removed the synthesized one deliberately |
| `never-retry-situation` | none — no hook passes `--situation` |
| `destructive-action` | none — same |
| `budget-exhausted` | none — `admit` embeds the literal in its reject MESSAGE, but nothing turns that into a `hitl` call |
| `breaker-open` | none, and no hook even writes breaker failure counts |

This is a vocabulary landed ahead of its producers, which was the intent of the
task (Task 5 and the runner follow-on consume it), not a regression. Recorded
so nobody later reads the gap as one.

### Dangling forward references

The `hitl` block's note and C26's header cite
`docs/adr/2026-09-03-hitl-as-kernel-entity.md`, and this record's `spec:` field
cites `docs/specs/2026-09-03-engineos-default-methodology-plan.md`. Neither
path exists on this branch — `docs/adr/` does not exist at all. Both live on
other branches of the same epic, and Task 3's shipped `breaker` note and change
record carry the identical shape. Nothing validates these paths for an active
record; C21c would, once this record is archived, so the spec must land before
then.

[[fail-closed-on-a-missing-policy-block]] — `need_reg` proves the FILE exists,
never the BLOCK. Three kernel subcommands in a row (`risk`, `breaker`, `hitl`)
needed the same `jq -e '.<block>'` guard, because jq's `null` comparisons
produce a confident wrong answer instead of an error.
