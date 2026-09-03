---
name: 2026-09-03-kernel-admit-backpressure
status: active
owner: borisenko (backend-coordinator)
spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md
domain: general
---

## What
Adds the backpressure primitive to the policy kernel: a `parallelism.backpressure`
registry block, a `kernel.sh admit` resolver that answers `dispatch|defer|reject`
for the orchestrator's dispatch loop, integrity check C24 (data + live canary +
prose mirror) and the `rules/parallelism.md` "Backpressure" mirror. Also closes a
fail-open hole in `kernel.sh risk`: an empty `--signals` payload now errors
instead of answering `low`.

## Why
The wave cap says how many agents may run; nothing said what happens when work
arrives faster than the cap drains it, so an overloaded orchestrator improvised.
`admit` makes that a deterministic, data-owned answer, and `reject` gives the
HITL path (`budget-exhausted`) a defined trigger instead of an unbounded plan.

The `risk` fix is the same class of defect one step earlier: `risk --signals '{}'`
returned `low` with `A2` autonomy, so a caller that forgot to pass evidence was
handed the loosest gate in the system. Absence of evidence is not evidence of low
risk — the resolver now refuses.

Capacity is deliberately NOT duplicated under `backpressure`: per
`docs/adr/2026-09-03-backpressure-reuses-wave-cap.md` it IS
`parallelism.wave_concurrency_cap`, and C24a fails on any `max_inflight*` key so
a second copy of the number cannot appear later as a mirror nobody checks.

## Scope
- `registries/policy.json` — `parallelism.backpressure` block; `description`
  sentence extended to name the block and C24; `version` 1.5.0 -> 1.6.0.
- `scripts/kernel.sh` — `cmd_admit` (new), `admit` in the dispatcher and usage
  string, `cmd_risk` fail-closed guard.
- `scripts/test-kernel.sh` — `admit` cases and `risk` fail-closed cases.
- `scripts/checks/70-runtime.sh` — `check_C24` / `check_C24b` / `check_C24c`
  plus the `have_backpressure_inputs` / `backpressure_maxq` helpers.
- `scripts/test-validate-engineos.sh` — two C24 negative cases.
- `rules/parallelism.md` — `## Backpressure` section (prose mirror).

## Checklist
- [x] `parallelism.backpressure` added verbatim from the spec's A2.1
- [x] `cmd_risk` fails closed on an empty `inputs{}` + `floors[]` payload
- [x] `cmd_admit` added, wired into the dispatcher and the usage string
- [x] kernel tests for `admit` and for the `risk` fail-closed behaviour
- [x] C24a/C24b/C24c added, including the ADR's `max_inflight` guard
- [x] C24 negative cases added to `scripts/test-validate-engineos.sh`
- [x] `rules/parallelism.md` "Backpressure" mirror written
- [x] fix round 1: `cmd_admit` arg-loop guards, `--arg`+`tonumber`, header
      subcommand list, C24a `>= 1` bound, C24b dispatch canary, C24c
      non-vacuous bound + per-action prose rows, `version` 1.6.0, six more
      `admit` fixtures
- [ ] final gate (`scripts/test-kernel.sh`, `scripts/validate-engineos.sh`,
      `scripts/test-validate-engineos.sh`, shellcheck) — owned by the controller

## What was made
`registries/policy.json` gained `parallelism.backpressure`
(`max_queued_units: 12`, `overload_action: "defer"`,
`actions: ["dispatch","defer","reject"]`) with the A2.1 note, and its
`description` now names the block and C24 alongside the existing C16/C17/C18/
C20/C22 sentence.

`scripts/kernel.sh` gained `cmd_admit`: it validates `--inflight` and `--queued`
as non-negative integers, then answers from the registry — `dispatch` with the
remaining capacity while `inflight < wave_concurrency_cap`, the registry's
`overload_action` with `capacity: 0` while the queue is below
`max_queued_units`, and `reject` at cap with a full queue, whose reason names
the HITL trigger (`budget-exhausted`). The subcommand is in the dispatcher
`case` and in the usage string.

`cmd_risk` now short-circuits before its unknown-id checks: an empty payload
(no `inputs`, no `floors`) returns the kernel's `{error: ...}` shape and exits
non-zero. The previously reachable `elif ($in | length) > 0 then "low"` branch
became redundant once the empty payload is rejected — with `$fl` empty and the
payload non-empty, `$in` is necessarily non-empty — so the tier chain ends on a
single `else "low" end`.

`scripts/checks/70-runtime.sh` gained C24 as three functions in the runtime
family: C24a (block well-formed: `max_queued_units` a non-negative integer,
`overload_action` a member of `actions`, and no `max_inflight*` key), C24b (live
canary — the shipped kernel must answer `reject` at cap with a full queue, both
numbers read from the registry), and C24c (prose mirror — `rules/parallelism.md`
names `kernel.sh admit` and quotes the registry's queue bound).

`scripts/test-kernel.sh` gained the `admit` block (idle -> `dispatch` with
`capacity == cap`, at cap -> the registry's `overload_action` with `capacity 0`,
at cap with a full queue -> `reject`, non-numeric `--inflight` and a missing
`--queued` -> error) and the `risk` fail-closed block (`{}` and `{"inputs":{}}`
error; a lone floor still resolves to `high`).

`scripts/test-validate-engineos.sh` gained two C24 negative cases:
`max_queued_units` set to `"many"`, and a `max_inflight` copy of the wave cap
planted under `backpressure` — the second is the ADR's decision under test.

`rules/parallelism.md` gained `## Backpressure` between `## Hard rules` and
`## Failure policy`: the `admit` invocation, a three-row answer table, and the
statement that capacity is the wave cap itself while the queue bound lives in
the registry.

Fix round 1 (coordinator review) then hardened the same surface. `cmd_admit`'s
argument loop checks `[ $# -ge 2 ]` before every `shift 2`, so a flag with no
value errors instead of spinning forever — the loop could not terminate, since
a failed `shift` leaves `$#` unchanged and the same flag re-matches. The two
numbers now cross into jq as `--arg` + `tonumber` rather than `--argjson`, so a
shell-shaped integer like `02` normalises instead of dying as a bare jq parse
error outside the kernel's `{"error": ...}` contract, and `admit` joined the
subcommand list in the file header. C24a now requires `max_queued_units >= 1`
(a bound of 0 makes `defer` unreachable and turns `overload_action` into dead
data), with `backpressure_maxq` blanking on the same condition so its comment
is true. C24b asserts both ends of the ladder — `dispatch` when idle as well as
`reject` at cap with a full queue — so a kernel answering one action
unconditionally cannot pass. C24c no longer matches vacuously when the bound is
unusable (that is now its own finding) and asserts what its verdict claims: a
prose table row for every declared action, and an overload row that explains
the bound. `policy.json` `version` went to `1.6.0` (Tasks 3-5 stack on it;
Task 9 bumps `plugin.json` to match). The `admit` fixtures gained the
`cap - inflight` case, an exact key-set assertion, the over-cap `defer` case,
the `budget-exhausted` reason assertion, a non-numeric `--queued` case and a
leading-zero normalisation case.

## Verification
NOT VERIFIED — by explicit ruling of the dispatching controller this unit wrote
its tests but ran none of them; the final gate runs once, by the controller.

What was run here, syntax-only:
- `jq -e '.parallelism.backpressure' registries/policy.json` — parses, block present.
- `bash -n scripts/kernel.sh scripts/test-kernel.sh scripts/checks/70-runtime.sh
  scripts/test-validate-engineos.sh` — all clean.
- Both new/edited jq programs (`admit`, `risk`) compiled parse-only by extracting
  them and wrapping in `def _p: (...); empty` — exit 0, never evaluated.

Fix round 1, same ruling, same limits: `bash -n` clean on `scripts/kernel.sh`,
`scripts/test-kernel.sh`, `scripts/checks/70-runtime.sh`; the rewritten `admit`
jq program re-extracted and compiled parse-only with `--arg` bindings (exit 0);
`jq -r '.version'` reads `1.6.0`; the three `actions` prose rows and the
overload row located by grep at `rules/parallelism.md:80-82`.

The arg-loop fix is confirmed by construction, not by execution: with
`--inflight 1`, `[ $# -ge 2 ]` holds, `shift 2` empties `$@`, the loop exits and
`queued` is empty, so the numeric `--queued` guard errors. The old code reached
the same `shift 2` with `$# = 2` as well, so the brief's fixture never hung —
the hang needed a trailing flag (`admit --inflight`), which is now guarded.

Not run: `scripts/test-kernel.sh`, `scripts/validate-engineos.sh`,
`scripts/test-validate-engineos.sh`, shellcheck.

## Changes registered
`git status --short`:

```
A  .engineos/changes/2026-09-03-kernel-admit-backpressure.md
M  registries/policy.json
M  rules/parallelism.md
M  scripts/checks/70-runtime.sh
M  scripts/kernel.sh
M  scripts/test-kernel.sh
M  scripts/test-validate-engineos.sh
```

`git diff --stat ef387ee` (after fix round 1):

```
 .../2026-09-03-kernel-admit-backpressure.md        | 160 +++++++++++++++++++++
 registries/policy.json                             |  10 +-
 rules/parallelism.md                               |  18 +++
 scripts/checks/70-runtime.sh                       | 100 ++++++++++++-
 scripts/kernel.sh                                  |  56 +++++++-
 scripts/test-kernel.sh                             |  59 ++++++++
 scripts/test-validate-engineos.sh                  |  18 +++
 7 files changed, 414 insertions(+), 7 deletions(-)
```

`git log --oneline ef387ee..HEAD`:

```
411949f feat(kernel): add admit backpressure resolver
<fix round 1 commit — sha in the task-2 report, created by this record's own commit>
```

(The record's own line count grew by these pastes; everything else is exact.)

No renames, no deletions, no file moves.

## Notes
- Deviation from the task brief, forced by jq syntax: the brief's `cmd_risk`
  guard ends with a bare `else` followed by a line starting with `|`, which jq
  refuses to parse. The guard is written `else .` so the existing pipeline
  continues unchanged; behaviour is exactly as specified.
- Deviation, forced by the current tree: the brief places C24 inside
  `scripts/validate-engineos.sh` with a `want C24` guard. That harness has since
  been split — Checks are `check_C<id>` functions under `scripts/checks/`,
  selected by discovery. C24 is therefore three functions in
  `scripts/checks/70-runtime.sh` following the C20/C22 shape (`have_jq`,
  a `skip_once` precondition guard, one `ok`/`bad` verdict per Check). Run order
  is unchanged: ids are sorted numerically by the harness.
- The brief's C24 recomputed `$maxq` inline; with one function per Check that
  value is now produced by a `backpressure_maxq` helper that mirrors the
  existing `repair_bound`, blanking on malformed data exactly as C24a does.
- Added beyond the brief: a second negative case for the `max_inflight` guard.
  The guard encodes the ADR's decision, and an unexercised guard is a claim, not
  a check.
- Fix round 1 offered a choice on C24c — assert the actions in the prose, or
  narrow the verdict message to what was actually checked. Took the first: the
  check now loops `actions[]` from the registry and requires a prose table row
  per action, plus an overload row that mentions the bound. A weaker message
  would have kept the mirror unmirrored.
- Fix round 1 addition beyond the listed fixtures: `admit --inflight 02` proving
  the leading-zero input normalises. It is the only assertion that pins the
  `--arg`/`tonumber` decision; without it the fix is invisible to the suite.
