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
  string; `cmd_resolve_task` computes the floor/ceiling and folds in `.hitl`.
- `scripts/test-kernel.sh` — new `hitl` section.
- `hooks/prompt-advisor.sh` — `hitl` telemetry event and a `hitl_note` in the
  context payload.
- `hooks/test-prompt-advisor.sh` — two existing assertions became stale by
  design (see Deviations 7); updated, plus a new mirror case.
- `scripts/checks/70-runtime.sh` — new C26/C26b/C26c/C26d; C22a reads
  `written_by` as an array; C22c iterates it and adds the reverse assertion.
- `scripts/test-validate-engineos.sh` — 12 new negative cases (4x C22, 8x C26).
- `rules/risk-autonomy.md` — new `## Human-in-the-loop` section.
- `rules/gates.md` — one release-checklist line.
- `.engineos/changes/_template.md` — new `## Human decisions` section.

Not touched, and deliberately: `registries/routing.json`, the agent files, and
`CLAUDE.md`. HITL adds no router row and no new domain.

## Checklist
- [x] `hitl` block added to `registries/policy.json` with the frozen values
- [x] `telemetry.events[].written_by` is an array on every event
- [x] `hitl` telemetry event registered with `keys` and a `sample`
- [x] `cmd_hitl` added, fail-closed on a missing block, fail-fast on arg values
- [x] `hitl` registered in the dispatcher, the usage string and the usage header
- [x] `cmd_resolve_task` folds in `.hitl` (null when there is no risk floor)
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
- [ ] Final gate: `scripts/test-kernel.sh`, `scripts/validate-engineos.sh`,
      `scripts/test-validate-engineos.sh`, `hooks/test-prompt-advisor.sh`,
      shellcheck — NOT RUN, by the controller's ruling (see Verification)

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

`resolve-task` computes the floor the same way its output object already did
(`any_high ? high : route.risk_floor`), reads the ceiling from
`autonomy.ceiling_by_risk`, and passes `--conflict true` when `any_high`. When
there is no risk floor at all, `.hitl` is `null` rather than an invented "low":
no risk evidence is not low risk.

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
**Unverified by ruling.** The controller's brief forbade running
`scripts/test-kernel.sh`, `scripts/validate-engineos.sh`,
`scripts/test-validate-engineos.sh`, `hooks/test-*.sh` and shellcheck; they
belong to the controller's own final gate. What was run:

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
2026-09-03 | controller (dispatching agent) | `external-effect` | approved with a bound | The brief grants autonomy A2 inside this worktree: commit locally, never push, never merge. No external effect was taken.
2026-09-03 | controller (dispatching agent) | `evidence-insufficient` | refused | Running the suites was refused by ruling, so this record ships with parse-only evidence and status DEGRADED rather than a green claim. Verification moves to the controller's final gate.

## Changes registered
One commit. Real output, captured at `287d9d0` — the commit this record was
part of, before the amend that added this section's own text. The amend touched
nothing but this file, so every number below is exact except this record's own
line count, which grew.

```
$ git status --short
(empty — working tree clean)

$ git log --oneline 5fca050..HEAD
287d9d0 feat(kernel): make human-in-the-loop queryable

$ git diff --stat 5fca050
 .engineos/changes/2026-09-03-kernel-hitl.md | 279 ++++++++++++++++++++++++++++
 .engineos/changes/_template.md              |   4 +
 hooks/prompt-advisor.sh                     |  15 +-
 hooks/test-prompt-advisor.sh                |  28 ++-
 registries/intents.json                     |   1 +
 registries/policy.json                      |  21 ++-
 rules/gates.md                              |   3 +
 rules/risk-autonomy.md                      |  27 +++
 scripts/checks/70-runtime.sh                | 257 ++++++++++++++++++++++++-
 scripts/kernel.sh                           | 109 ++++++++++-
 scripts/test-kernel.sh                      | 123 ++++++++++++
 scripts/test-validate-engineos.sh           |  91 +++++++++
 12 files changed, 935 insertions(+), 23 deletions(-)
```

No renames, no deletions, one addition
(`.engineos/changes/2026-09-03-kernel-hitl.md`). The post-amend diffstat is in
the task report
(`.superpowers/sdd/2026-09-03-engineos-default-methodology-plan/task-4-report.md`).

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

4. **`resolve-task` uses an explicit `if/else` for `--conflict`.** The brief
   writes `$( [ "$any_high" = true ] && printf -- '--conflict true' )`, which
   depends on unquoted word-splitting of a command substitution. The explicit
   branch is equivalent and does not.

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
     which resolves to the `security-files` intent — `risk_floor: high` — so
     the HITL line joins the contract line. Updated to assert exactly two
     lines and to name the expected reason, and a mirror case was added on a
     low-floor prompt so a `hitl_note` that fired unconditionally could not
     pass the new count.

   Neither existing assertion was weakened or deleted: both got tighter (the
   reason id and the second line are now named), per
   `rules/verification.md`'s prohibition on neutralizing tests to make a gate
   pass.

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
is a historical record of the P7 decision, not a live contract.

### Noise concern, raised not fixed

`resolve-task` passes the risk FLOOR to `hitl`, and `high-risk` fires on tier
high, so every prompt resolving to a high-floor intent (`dba`, `devops`,
`security-files`, `ios-release`, `android-release`, `critic-verification`) now
gets a "human-in-the-loop required — reasons: high-risk" line. "Fix the auth
guard bug" announces a human gate. The advisor's own contract line says "the
risk floor is a floor, not the final tier", so firing HITL off the floor
over-announces by construction.

This is the brief's frozen contract and Task 5 stacks on it, so it was
implemented verbatim rather than redesigned — `rules/subagents.md`: report a
contract that looks wrong, never redefine one unilaterally. If the noise proves
real in telemetry, the narrowest fix is for `resolve-task` to pass the floor
only when it is also the resolved tier, or for `high-risk` to require a
confirmed tier rather than a floor. Neither belongs in this task.

### Known accepted gap

No hook writes breaker failure counts yet, so `--situation breaker-open` has
no production producer this cycle. The situation is exercised by the kernel
fixtures and by C26b, and the orchestrator can pass it by hand, but nothing
emits it automatically. Accepted, not fixed here.

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
