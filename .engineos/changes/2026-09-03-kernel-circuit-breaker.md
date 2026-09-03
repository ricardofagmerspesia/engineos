---
name: 2026-09-03-kernel-circuit-breaker
status: active
owner: backend-coordinator (borisenko)
spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md
domain: general
---

## What
Add `scripts/kernel.sh breaker` — a per-resource circuit breaker resolver — as a
new top-level `breaker` block in `registries/policy.json`, its prose mirror in
`rules/parallelism.md`, the C25 check family in `scripts/checks/70-runtime.sh`,
and fixtures in both test harnesses.

## Why
The kernel already answers two failure questions, and both are per-attempt:
`retry` asks "try this UNIT again?" against an agent envelope status, and
`repair` asks "fix this CHECK again?" against a nonzero exit. Neither notices
that the same provider, MCP server, tool or agent type has failed for every unit
that touched it — each fresh unit rediscovers a dead dependency from attempt one
and burns its whole retry budget on it.

The breaker is the third failure block: state is per resource, and the count is
consecutive failures on that resource rather than attempts on a unit. Keeping it
separate from `retry` is the point, not an oversight — folding a per-resource
health signal into a per-unit attempt counter is exactly the conflation that
produces the repeated-rediscovery behavior above. That distinction is frozen in
`docs/adr/2026-09-03-circuit-breaker-separate-from-retry.md` and restated in the
registry block's `note` so a later reader cannot collapse the three.

## Scope
- `registries/policy.json` — new top-level `breaker` block after `repair`;
  `description` extended to name the block and C25.
- `scripts/kernel.sh` — `cmd_breaker`, dispatcher arm, usage string, header
  synopsis lines.
- `rules/parallelism.md` — new `## Circuit breaker` section after
  `## Failure policy`.
- `scripts/checks/70-runtime.sh` — `have_breaker_inputs`, `breaker_threshold`,
  `check_C25` / `check_C25b` / `check_C25c`, immediately after the C24 family.
- `scripts/test-kernel.sh` — `-- breaker --` fixture block after `-- admit --`.
- `scripts/test-validate-engineos.sh` — three C25 negative cases.

Not touched: `docs/COMPATIBILITY.md` (a new subcommand is additive surface, not
a rename — same call Task 2 made for `admit`), and no hook.

## Checklist
- [x] `breaker` block added to `registries/policy.json` as a new top-level key
- [x] `policy.json` `description` names `breaker` and C25, block count 9 -> 10
- [x] `cmd_breaker` added with fail-fast arg parsing on every flag
- [x] `breaker` registered in the dispatcher, the usage string and the header
- [x] `rules/parallelism.md` `## Circuit breaker` section written
- [x] C25 / C25b / C25c added to `scripts/checks/70-runtime.sh` after C24's
- [x] Kernel fixtures written in `scripts/test-kernel.sh`
- [x] Validator negative cases written in `scripts/test-validate-engineos.sh`
- [x] `bash -n` on every touched shell file, `jq .` on `registries/policy.json`
- [x] Fix round 1 applied: fail-closed block guard, C25b state/allow across all
      three arms, discriminating leading-zero fixture, C25c heading + scope
      mirror, `have_kernel_inputs` extraction, accumulator and verdict wording
- [ ] Final gate (lint/typecheck/tests, `validate-engineos.sh`, `test-kernel.sh`,
      `test-validate-engineos.sh`) — deferred to the controller by explicit
      ruling; this unit is reported DEGRADED / unverified, not green

## What was made

**Registry — `registries/policy.json`.** A top-level `breaker` block after
`repair`: `failure_threshold: 3`, `cooldown_waves: 1`, `half_open_probes: 1`,
`states: ["closed", "half-open", "open"]` (stored sorted as a reading
convention only — C25a sorts before it compares, so the stored order is
irrelevant and its sortedness is enforced by nothing),
`scopes: ["provider", "mcp", "tool", "agent"]`, and a `note`
that spells out the three-way distinction between `retry` (agent units),
`repair` (checks) and `breaker` (resources), names the kernel subcommand, the
prose mirror, C25 and the ADR. `version` left at `1.6.0` per the brief. The
file-level `description` went from "nine blocks" to "ten blocks", gained
`breaker` in both the prose list and the parenthetical, and gained a "C25 checks
breaker" clause alongside the existing C24 clause.

**Kernel — `scripts/kernel.sh`.** `cmd_breaker` between `cmd_admit` and
`cmd_capability`: a pure transition table over the three states. `closed`
compares a numeric `--failures` against `failure_threshold` and answers `open`
at or above it, `closed` below; `open` reads `--cooldown-elapsed true|false` and
answers `half-open` or `open`; `half-open` reads `--probe-result ok|failed` and
answers `closed` or `open`. Every answer is `{state, allow, reason}`. The state
is validated before `need_reg`, so `--state bogus` is an error regardless of
registry health. Registered as `breaker)` in the dispatcher, added to the usage
string, and three synopsis lines added to the header comment (one per state,
because each takes a different flag).

**Prose — `rules/parallelism.md`.** A `## Circuit breaker` section after
`## Failure policy`: the per-unit / per-resource distinction, the instruction to
consult the breaker BEFORE `retry`, the invocation line, a three-row state
table quoting `failure_threshold` (3), `cooldown_waves` (1) and
`half_open_probes` (1), and where the consecutive-failure count comes from (the
exec journal's `span_kind` `tool`/`model` FAILED spans) plus the `breaker-open`
HITL reason.

**Checks — `scripts/checks/70-runtime.sh`.** The C25 family, mirroring C24's
conventions exactly (`have_jq` first, a `have_breaker_inputs` guard using
`skip_once`, a value-extractor helper that prints nothing for a value the block
check has already condemned, bare accumulators, one `ok`/`bad` verdict per
Check):

- `check_C25` (a) — `failure_threshold`, `cooldown_waves` and
  `half_open_probes` are integers >= 1; `states` sorted-joined equals exactly
  `closed,half-open,open`; `scopes` is a non-empty array.
- `check_C25b` (b) — a three-outcome canary against the live kernel:
  `--state closed --failures <threshold>` must answer `open`,
  `--state closed --failures <threshold - 1>` must answer `closed` (the outcome
  that must NOT trip), and `--state half-open --probe-result ok` must answer
  `closed`. Threshold read from the registry, never a literal.
- `check_C25c` (c) — `rules/parallelism.md` names `kernel.sh breaker`, quotes
  the registry threshold next to the field name, and carries a table row for
  every state the registry declares. A blank threshold is its own named finding
  (`failure-threshold-unusable-see-C25a`) rather than a vacuous grep match.

**Kernel fixtures — `scripts/test-kernel.sh`.** A `-- breaker --` block after
`-- admit --`, with the threshold read from the registry and the below-threshold
fixture derived arithmetically from it. Covers: the three happy transitions plus
their `allow` values; the exact `{allow, reason, state}` key set; one failure
below the threshold not tripping; each state's missing-flag error; `--state`
absent; `--state bogus`; a valueless trailing `--state` (the arg-loop hang);
leading-zero `--failures` normalising; and non-numeric / non-enum flag values.

**Validator fixtures — `scripts/test-validate-engineos.sh`.** Three C25
negative cases: a state dropped from `.breaker.states`, `failure_threshold` set
to 0, and (on `C25c` alone) the registry threshold raised without the prose
following.

**Fix round 1**, after the controller's review, in one commit on top of
`c4f0d1f`:

- *Fail-closed guard (the review's headline defect).* `cmd_breaker` fabricated
  an answer when `.breaker` was absent: `need_reg` proves the file exists, not
  the block, so `$b.failure_threshold` was null, jq sorts null below every
  number, `0 >= null` held, and a healthy resource came back
  `{"state":"open","allow":false,"reason":"... threshold null ... null wave(s)"}`
  with exit 0. Same fail-open class `cmd_risk` was fixed for. Added
  `jq -e '.breaker' "$P" || err ...` right after `need_reg`, copying
  `cmd_route_escalate`'s router-block guard in shape, plus a fixture that
  proves it.
- *C25b rewritten.* It read only `.state`, so `{"state":"open","allow":true}`
  passed the integrity gate, and it called two of the three state arms, so an
  inverted boolean in the `open` arm passed CI. It now asserts
  `state/allow` per call via a `breaker_answer` helper, across all six
  transitions of all three arms.
- *Leading-zero fixture made discriminating.* `--failures 00` expects `closed`,
  which is also the answer for 0, 1 and 2 — it proved nothing. Now
  `--failures "0$thr"` expecting `open`, mirroring how the admit fixture uses
  `capacity = cap - 2`.
- *C25c widened.* Requires the `## Circuit breaker` heading to exist (anchored),
  and requires every `scopes[]` id to appear in the prose — `scopes` was the
  only breaker field with neither a canary nor a prose mirror, and the one that
  actually drifted.
- *Rule of three.* The `have_*_inputs` body was in its third verbatim copy
  (`repair`, `backpressure`, `breaker`, all gating on `$PJ` + `$KSH`). Extracted
  as `have_kernel_inputs <label> <message>`; the three family guards now
  delegate to it, keeping their skip tokens and messages byte-identical so
  C20's and C24's behaviour is unchanged.
- *Cosmetics.* Accumulators renamed to C24's `b_bad`/`d_bad`/`p_bad`
  convention; C25a's verdict softened from "integers >= 1" to "each read as a
  whole number >= 1", because the check reads through `jq -r` and matches digit
  strings — the JSON string `"3"` passes it exactly as `3` does, and the old
  message claimed a type check nobody performs. Registry `note` gained a clause
  saying `scopes` is advisory with no kernel consumer. Prose names the four
  scope ids in backticks so C25c has something to match.

Not done, deliberately: `scripts/checks/70-runtime.sh` is now 491 lines and
past the ~300-line guidance in `rules/base.md`. Splitting it is a separate unit
of work on a file three check families share, and the controller ruled it out
of this commit.

## Verification

Run and green:

- `bash -n scripts/kernel.sh` -> `kernel.sh: syntax OK`
- `bash -n scripts/test-kernel.sh` -> `test-kernel.sh: syntax OK`
- `bash -n scripts/checks/70-runtime.sh` -> `70-runtime.sh: syntax OK`
- `bash -n scripts/test-validate-engineos.sh` -> `test-validate-engineos.sh: syntax OK`
- `jq . registries/policy.json > /dev/null` -> `policy.json parses`
- `jq -c '.breaker | {failure_threshold, cooldown_waves, half_open_probes, states, scopes}' registries/policy.json`
  -> `{"failure_threshold":3,"cooldown_waves":1,"half_open_probes":1,"states":["closed","half-open","open"],"scopes":["provider","mcp","tool","agent"]}`
- both new jq programs compiled parse-only (wrapped in `if false then (...) else
  empty end`, vars supplied, nothing evaluated) -> both compile
- C25c's three prose assertions replayed by hand as `grep`:
  `kernel.sh breaker` present, `failure_threshold[^0-9]*3\b` matches, and a
  `^\| \`<state>\`` row exists for `closed`, `open` and `half-open`

Fix round 1, run and green:

- `bash -n scripts/kernel.sh` -> `kernel.sh: syntax OK`
- `bash -n scripts/checks/70-runtime.sh` -> `syntax OK`
- `bash -n scripts/test-kernel.sh` -> `test-kernel.sh: syntax OK`
- `jq . registries/policy.json > /dev/null` -> `policy.json parses`
- `python3` assertion that `.breaker.note` carries the new advisory clause -> passes
- `grep -nE '^## Circuit breaker$' rules/parallelism.md` -> `112:## Circuit breaker`
  (C25c's new anchored heading assertion)
- `grep -noE '`provider`|`mcp`|`tool`|`agent`' rules/parallelism.md` -> all four
  scope ids present at lines 115-116 (C25c's new scope assertion)
- `grep -n 'k_bad\|m_bad\|n_bad' scripts/checks/70-runtime.sh` -> no output,
  the old accumulator names are gone

**Not run, by explicit ruling from the controller:** `scripts/test-kernel.sh`,
`scripts/test-validate-engineos.sh`, `scripts/validate-engineos.sh`, and
`shellcheck`. Verification is the controller's single final gate. This unit is
therefore reported DEGRADED — unverified by ruling — and the fixtures above are
written but unexecuted. In particular the fail-closed guard's own fixture, which
proves the review's headline defect is fixed, has not been executed.

## Changes registered

`git status --short` (before the commit, after the change record was written):

```
 M registries/policy.json
 M rules/parallelism.md
 M scripts/checks/70-runtime.sh
 M scripts/kernel.sh
 M scripts/test-kernel.sh
 M scripts/test-validate-engineos.sh
?? .engineos/changes/2026-09-03-kernel-circuit-breaker.md
```

`git diff --stat 17f0399`, real output, captured from the working tree
immediately before the fix-round commit:

```
 .../changes/2026-09-03-kernel-circuit-breaker.md   | 309 +++++++++++++++++++++
 registries/policy.json                             |  10 +-
 rules/parallelism.md                               |  25 ++
 scripts/checks/70-runtime.sh                       | 165 ++++++++++-
 scripts/kernel.sh                                  |  70 ++++-
 scripts/test-kernel.sh                             |  82 ++++++
 scripts/test-validate-engineos.sh                  |  26 ++
 7 files changed, 677 insertions(+), 10 deletions(-)
```

Every line above is exact except this record's own, which grew by the size of
this paragraph and the block above it after the capture — a file cannot report
its own final size from inside itself.

`git log --oneline 17f0399..HEAD`, real output:

```
c4f0d1f fix(registries): use the frozen breaker scope ids
a1f8d06 feat(kernel): add per-resource circuit breaker
```

Three commits once the fix-round commit lands; the third is
`fix(kernel): fail closed without a breaker block`, named by its subject
because a record cannot carry the sha of the commit that contains it. The
stable identifiers are the parent (`17f0399`) and the first commit
(`a1f8d06`).

No renames, no deletions, no moves.

## Notes

- **Frozen-contract breach, found in review and corrected.** The plan's frozen
  contract and the accepted ADR name the breaker scope ids `provider`, `mcp`,
  `tool` and `agent`. `a1f8d06` shipped `mcp-server` and `agent-type` instead —
  a unilateral rename of a frozen contract, which `rules/subagents.md` forbids
  outright, and one Task 4's `hitl` situations would have had to match against.
  The controller realigned them in `c4f0d1f`. Nothing in the kernel reads
  `scopes`, which is exactly why the drift survived implementation: C25a only
  checked the array was non-empty and there was no prose mirror for the ids at
  all. The fix round closes that hole — C25c now requires every declared scope
  id to appear in the prose section, and the registry `note` states that
  `scopes` is advisory with no kernel consumer, so the next reader knows the
  greps are all that hold it.

- **Deviations from the brief, and why.**
  1. **`--arg` + `tonumber` instead of `--argjson` for `--failures`.** The
     brief's snippet used `--argjson f "$failures"`. The digits-only guard above
     it accepts `03`, which is not valid JSON, so `--argjson` would abort inside
     jq with a parse error on stderr — breaking the kernel's contract that every
     failure is `{"error": ...}` on stdout. `cmd_admit` on the same base already
     solved this the other way with a comment saying so; `cmd_breaker` now
     matches its sibling. A fixture pins it.
  2. **Fail-fast `[ $# -ge 2 ]` on all four flags** (controller amendment 3),
     replacing the brief's `"${2:-}"`, plus a `run breaker --state` fixture.
  3. **Three-outcome canary in C25b** (controller amendment 2), including the
     below-threshold case that must NOT trip.
  4. **`half_open_probes >= 1` added to C25a**, beyond the four fields the brief
     listed. `cmd_breaker` interpolates that value straight into the half-open
     `reason`, so an absent or zero field would ship `allow null probe call(s)`
     to a caller and fail nowhere. The `ok` message names all three numeric
     fields it asserts, so the message still states exactly what was checked.
  5. **Two extra validator negative cases** beyond the brief's `states`
     mutation: `failure_threshold: 0` (the block check) and a threshold raised
     without the prose (the C25c mirror). The mirror had no negative case
     otherwise.
  6. **Extra kernel fixtures** beyond the brief's eleven: the exact key set, the
     below-threshold hold, the valueless-flag guard, leading-zero normalisation,
     and the non-enum flag values.
  7. **Header synopsis is three lines, not one**, because each state takes a
     different flag and a single line would misdescribe two of them.

- **Known, accepted gap this cycle:** nothing writes breaker failure counts yet.
  No hook produces the `span_kind` `tool`/`model` FAILED spans the count is
  defined over — Task 5 owns those writers — so `kernel.sh breaker` ships as a
  resolver with fixtures, C25 coverage and a prose contract, but no production
  caller. That is the planned sequencing, not an omission.

- **Narrower than it could be, deliberately:** C25c checks only
  `failure_threshold` against the prose, matching the brief and C24c's
  precedent of pinning the one number. The prose also quotes `cooldown_waves`
  (1) and `half_open_probes` (1); drift in either is currently uncaught. A
  follow-on can widen the same loop.

- **Downstream consumers already keyed to this work:** Task 4's `hitl` block
  goes in after `breaker` and keys `--situation breaker-open` off the
  `breaker-open` reason named in the new prose section. Task 5's exec-journal
  span writers are the failure count's source.
