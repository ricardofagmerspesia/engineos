---
name: 2026-09-03-exec-journal-spans
status: active
owner: backend-coordinator
spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md
domain: general
---

## What

Extended `scripts/exec-journal.sh` from the v1 schema contract to a v2 span
schema (twelve optional fields), added one span helper family to
`hooks/lib-common.sh`, and made four hooks its first real writers: the
dispatch/return pair writes `agent` spans, `prompt-advisor.sh` writes `router`,
`stop-verify.sh` writes `verification`. Registered the schema as
`registries/policy.json` `telemetry.exec_journal`, mirrored it in
`rules/observability.md` "Agent traces", and added C27 (four sub-checks), C28
and C29 to `scripts/checks/70-runtime.sh`.

## Why

EngineOS could already answer what it DECIDED — route, risk, gates,
backpressure, breaker, HITL — and could not say what actually HAPPENED when
agents ran. The exec journal existed as a schema contract with no writer. One
session is now one trace, and every dispatched agent, router decision and
verification gate is a span in it, which is the evidence the breaker's
consecutive-failure count, `usage-report.sh` and the retro were designed to
read.

## Scope

- `scripts/exec-journal.sh` — v2 fields on `append` and `validate`
- `scripts/test-exec-journal.sh` — 19 new cases
- `hooks/lib-common.sh` — `hook_slug`, `hook_now_ms`, `hook_span_open`,
  `hook_span_close`, `hook_span`
- `hooks/announce-agent-dispatch.sh`, `hooks/announce-agent-return.sh`,
  `hooks/prompt-advisor.sh`, `hooks/stop-verify.sh` — the four writers
- `hooks/ensure-project-layout.sh` — retention for the journal and the markers
- `registries/policy.json` — `telemetry.exec_journal` (version stays 1.6.0)
- `rules/observability.md` — `## Agent traces`
- `scripts/checks/70-runtime.sh`, `scripts/checks/lib.sh`,
  `scripts/test-validate-engineos.sh` — C27/C28/C29 and their negative cases
- `hooks/test-verify.sh`, `hooks/test-prompt-advisor.sh`,
  `hooks/test-agent-announce.sh` — behavioral coverage per writer

## Checklist

- [x] v2 fields accepted, validated and round-tripped by `append`
- [x] `validate` rejects every malformed v2 value, including a whitespace or
      newline slug, in any field position
- [x] a v1 line stays byte-identical and valid — no v2 key appears on it
- [x] one span helper in `lib-common.sh`, not four copies of the append
- [x] four writers wired; banner behavior and hook stdout unchanged
- [x] bypass, `ENGINEOS_TELEMETRY=0` and a non-adopted repo each write no spans
      and create no directory
- [x] `telemetry.exec_journal` registered; `version` untouched at 1.6.0
- [x] `## Agent traces` prose mirror added; `parallelism.md`'s forward
      reference is now live
- [x] C27a-d, C28 and C29 added to `70-runtime.sh`, not `validate-engineos.sh`
- [x] negative cases in `scripts/test-validate-engineos.sh`
- [ ] C28 and C29 green — red on this branch by construction, see Notes

## What was made

`append` gained twelve optional flags (`--trace-id --span-id --parent-span-id
--span-kind --tool --provider --model --cost-micros --retry-attempt
--cache-hit --route --risk`), each with its own `_set` flag so an unset field is
a key that never appears rather than a key holding `null`; `with_entries` drops
them, so a v1 line is byte-identical to what v1 wrote. Enumerated values go
through `in_list`, numbers through `is_nonneg_int`, and the seven remaining
strings through a new `is_slug` + `check_slug_flag` pair. `validate` gained the
matching predicate.

`hooks/lib-common.sh` gained five helpers under a new "Agent spans" heading:
`hook_slug` (sanitize to the span class), `hook_now_ms` (three clock rungs),
`hook_span_open` / `hook_span_close` (the PreToolUse/PostToolUse marker pair,
since the two are separate processes) and `hook_span` (the one append site).

The four writers each add only what they know. `announce-agent-return.sh` reads
the agent's tier from `registries/agents.json`, so a design-tier agent is
recorded as `design`; its `status` comes from the harness's own error flag or
from the return envelope's status when that is the first token of the response.
`ensure-project-layout.sh` documents that its existing `*.jsonl` glob already
covers `<session>.exec.jsonl`, and reaps the span start markers one level down
that the glob never reaches.

## Verification

Every suite the change touches, run in this worktree:

```
scripts/test-exec-journal.sh           rc=0  passed 33, failed 0
hooks/test-verify.sh                   rc=0  pass=22 fail=0 skip=0
hooks/test-prompt-advisor.sh           rc=0  65 passed, 0 failed
hooks/test-agent-announce.sh           rc=0  pass=21 fail=0
hooks/test-lib-common.sh               rc=0  11 passed, 0 failed
hooks/test-bypass.sh                   rc=0  pass=27 fail=0
hooks/test-layout.sh                   rc=0  pass=14 fail=0 skip=0
scripts/test-validate-engineos.sh      rc=0  passed 123, failed 0
```

`scripts/validate-engineos.sh --only C27` → passed 4, failed 0. Every other
check family, run in two batches by `--only`, is green (47 + 51 checks). C28 and
C29 are the two exceptions and are red on this branch by construction.

`shellcheck -S error` on the fourteen changed shell files: clean. CI runs the
same severity.

Refutability, not just green: the new tests were run against
`git show 0bcf267:scripts/exec-journal.sh` and produced 9 FAIL lines. Eight
planted breakages against C27 (span kind renamed on either side, `home` no
longer `.exec.jsonl`, `is_slug` weakened to accept whitespace, the section
renamed, `cost_micros` dropped from the prose, the router span deleted, the
marker reap deleted) were each caught. Eight more against C28/C29 on a sandbox
carrying Tasks 6 and 7 were each caught, and on that same sandbox C27, C28 and
C29 all pass.

## Human decisions

<none — no `hitl.required` reason fired; risk is low/medium, reversible by
`git revert`, no external effect>

## Changes registered

`git status --short`:

```
 M hooks/announce-agent-dispatch.sh
 M hooks/announce-agent-return.sh
 M hooks/ensure-project-layout.sh
 M hooks/lib-common.sh
 M hooks/prompt-advisor.sh
 M hooks/stop-verify.sh
 M hooks/test-agent-announce.sh
 M hooks/test-prompt-advisor.sh
 M hooks/test-verify.sh
 M registries/policy.json
 M rules/observability.md
 M scripts/checks/70-runtime.sh
 M scripts/checks/lib.sh
 M scripts/exec-journal.sh
 M scripts/test-exec-journal.sh
 M scripts/test-validate-engineos.sh
?? .engineos/changes/2026-09-03-exec-journal-spans.md
?? .superpowers/
```

`.superpowers/` holds the task brief, the amendments and the task report. It is
untracked in this repo by convention (`git ls-files .superpowers` is empty on
`main`) and is NOT part of the commit; `git check-ignore` confirms it is
untracked rather than ignored.

`git diff --stat 0bcf267`:

```
 hooks/announce-agent-dispatch.sh  |  15 ++
 hooks/announce-agent-return.sh    |  42 +++++
 hooks/ensure-project-layout.sh    |  13 +-
 hooks/lib-common.sh               | 118 ++++++++++++
 hooks/prompt-advisor.sh           |  16 ++
 hooks/stop-verify.sh              |  14 ++
 hooks/test-agent-announce.sh      | 148 ++++++++++++++++
 hooks/test-prompt-advisor.sh      |  80 +++++++++
 hooks/test-verify.sh              |  63 +++++++
 registries/policy.json            |  11 +-
 rules/observability.md            |  26 +++
 scripts/checks/70-runtime.sh      | 365 +++++++++++++++++++++++++++++++++++++-
 scripts/checks/lib.sh             |   1 +
 scripts/exec-journal.sh           | 158 ++++++++++++++++-
 scripts/test-exec-journal.sh      | 112 ++++++++++++
 scripts/test-validate-engineos.sh | 102 +++++++++++
 16 files changed, 1276 insertions(+), 8 deletions(-)
```

No renames, no deletions. One commit: `feat(telemetry): add span fields to the
exec journal and write agent spans from hooks`. This record is part of it; the
task report under `.superpowers/` is not, per the note above.

## Notes

### C28 and C29 are red on this branch, green on the merge

They assert artifacts Tasks 6 and 7 landed on other branches of the same epic —
`skills/eval-harness/references/retrieval-metrics.md`, the `## RAG` section's
metric names, `scripts/init-project.sh`, `commands/init.md`,
`hooks/scaffold-layout.sh` and `docs/ADOPTION.md`'s `/engineos:init`. None of
those paths exists at `0bcf267`, so both checks name every missing input as its
own finding and exit non-zero. Verified green on a sandbox that overlays both
branches. Their negative cases in `scripts/test-validate-engineos.sh` therefore
pass on the missing-file finding here rather than on the planted one, and become
refutable at the merge; a comment above them says so.

### Deviations from the brief, each deliberate

- `is_slug` is a shell `case` pattern, not `grep -Eq "$SLUG_RE"`. `grep` matches
  line by line, so a value of `"clean\nthen arbitrary prompt text"` passes on the
  strength of its first line — a prompt-text channel straight to disk through the
  one field designed to make that impossible. `SLUG_RE` stays as the documented
  constant and is quoted in the error message.
- The `validate` predicate uses `all(...)` and `\z`, not a bare generator and
  `$`. `X and (generator)` emits one result per output and `jq -e` reports only
  the LAST, so a malformed `trace_id` followed by a well-formed `route` would
  have validated; and Oniguruma's `$` also matches before a trailing newline,
  which is whitespace.
- The two numeric v2 fields go through `--arg` + `tonumber`, not `--argjson`
  (defect class A5.8): `is_nonneg_int` accepts `03`, which is not valid JSON.
- `have_exec_journal_inputs` mirrors `have_telemetry_inputs` instead of
  delegating to `have_kernel_inputs` as A1 suggested. This family reads
  `exec-journal.sh`; gating it on `kernel.sh` would be a guard that passes while
  the real input is missing.
- Five helpers in `lib-common.sh`, where A3 asked for one. One is the append
  (`hook_span`, as asked); the others are a sanitizer, a clock, and the
  open/close marker pair the PreToolUse/PostToolUse split requires. Each has one
  responsibility and its own header comment.
- The brief's test snippet calls `pass "msg"` / `fail "msg"`; those are integer
  counters in the real suite, not functions. The cases are verbatim in substance
  and run through the suite's own `check` helper.

### Known limitations, named rather than left to be discovered

[[agent-span-status-is-a-floor]] — an agent span's `status` is `FAILED` only when
the harness sets an error flag or the response stringifies with the envelope
status as its first token. A structured `tool_response` carrying the envelope
inside a text block reads as `OK`. So the breaker's consecutive-failure count
has its designed input, but that input UNDERCOUNTS: it is a floor, never a
ceiling. Wiring the counter is a later unit; a status source that observes
failure reliably belongs with the headless runner that owns the model call.

`duration_ms` resolution depends on the clock rung `hook_now_ms` reaches. On
macOS with bash 3.2 and BSD `date`, both fast rungs are unavailable and the
answer is whole seconds scaled by 1000 — so a sub-second router span records 0
or 1000. Measured on this machine. GNU `date` (Linux, CI) gives real
milliseconds. Deliberately no perl/python rung: spawning an interpreter to time
a sub-second call costs more than the imprecision it removes.

`capability_id` on the new spans is `dispatch` / `verify` / `route`;
`registries/capabilities.json` declares only `route` among those. This is the
brief's own vocabulary and `exec-journal.sh` documents that it does NOT validate
`capability_id` against the registry — but a consumer joining on that field will
find two ids it cannot resolve.

The prose block's "Consumers" line names `scripts/usage-report.sh` and the retro.
Neither reads `.exec.jsonl` today; both are forward references, like the breaker
count. Kept verbatim as briefed.

### Dangling forward references

The C27 header and the commit body cite
`docs/adr/2026-09-03-spans-extend-exec-journal.md`, and this record's `spec:`
field cites `docs/specs/2026-09-03-engineos-default-methodology-plan.md`. Neither
exists at `0bcf267` — `docs/adr/` does not exist at all. Tasks 3 and 4 shipped
the identical shape and recorded the same gap. Nothing validates these paths for
an active record; C21c would once this record is archived, so the spec and the
ADR must land before then.
