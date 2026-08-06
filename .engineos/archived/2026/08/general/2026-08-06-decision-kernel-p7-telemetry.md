---
name: 2026-08-06-decision-kernel-p7-telemetry
status: done
owner: ricardo
spec: docs/specs/2026-08-06-decision-kernel-p7-telemetry.md
domain: general
completed: 2026-08-06
---

## What

Decision Kernel Phase 7: kernel-decision event capture. The hooks that
already hold a kernel answer (route-advisor, gate-advisor, stop-verify) now
append it — ids and outcomes only, never prompt text — as one JSONL line per
event to a session-scoped file under `.git/`, with the schema, event
vocabulary and retention policy as registry data, and both of the repo's
existing mining tools (`retro`, `usage-report.sh`) wired to read it.

## Why

Every kernel answer was computed, injected into one turn's context, and
discarded. Two artifacts that looked like telemetry already existed and
neither was: `exec-journal.sh` is a schema with no writer, `usage-report.sh`
is a reader with no reliable source (transcript-grepping, admitted fragile).
Two prior specs named a concrete backlog — P5's repair/retry bound
justification, P6's capture of which decision rules fired — and investigation
found exactly one honest capture point per capturable event, and no
mediation point at all for repair/retry.

## Scope

registries/policy.json (1.4.0: telemetry block), scripts/telemetry.sh (new)
+ scripts/test-telemetry.sh (new), hooks/route-advisor.sh + hooks/gate-
advisor.sh + hooks/stop-verify.sh (event writes) + their 3 test files
extended, hooks/ensure-project-layout.sh (retention reaper), skills/
retro/SKILL.md + scripts/usage-report.sh (reader wiring),
scripts/validate-engineos.sh (C22) + scripts/test-validate-engineos.sh (8
cases), the P7 spec. Fourteen files.

## Checklist

- [x] Spec with frozen contracts before code (fable, most-capable tier —
      investigated the real consumer(s): P5's and P6's own named deferrals)
- [x] P7-U1: policy.json telemetry block + telemetry.sh + test-telemetry.sh
- [x] P7-U2: 3 hook writes + reaper + test extensions
- [x] P7-U3: reader wiring in retro/SKILL.md + usage-report.sh
- [x] P7-U4 (barrier): validate-engineos.sh C22 + 8 planted-breakage cases
- [x] Full verification green, all prior suites unchanged

## What was made

- `registries/policy.json` 1.4.0: new `telemetry` block — three events
  (`route` written by route-advisor including zero-match as the
  denominator; `decision-rules` written by gate-advisor on real matches
  only; `verify` written by stop-verify on both red and green), a closed
  per-event key vocabulary, `value_pattern` with no whitespace class (the
  structural anti-prompt-text guard), `retention_days: 90`.
- `scripts/telemetry.sh`: append/validate CLI in the `exec-journal.sh`
  mold, registry-driven and fail-closed. Two real bugs found and fixed
  while building it: `validate_data`'s jq call was missing `-n`, so it
  silently read an empty stdin instead of evaluating — every append
  appeared to reject a valid sample until traced; and
  `"${data:-{}}"` — bash parameter expansion stops at the first
  unescaped `}`, so a non-empty `$data` silently gained a stray trailing
  brace, corrupting every line `validate` then rejected.
- Three hook writes, each best-effort (`2>/dev/null`, final `|| true` —
  hook behavior is byte-identical with or without the write) and gated on
  `.engineos/` adoption + `ENGINEOS_TELEMETRY != 0`. Found and fixed a
  wrong-directory bug in the stop-verify.sh wiring (`$DIR/telemetry.sh`
  instead of `$DIR/../scripts/telemetry.sh`) during smoke testing.
- `hooks/ensure-project-layout.sh`: reaps session files past
  `retention_days`, read from the registry at runtime, next to the
  existing 7-day flag reaper.
- `skills/retro/SKILL.md` + `scripts/usage-report.sh`: both wired to read
  `.git/engineos-telemetry/*.jsonl` alongside their existing sources.
- `scripts/validate-engineos.sh` C22: the policy is well-formed (C22a);
  the writer round-trips every registry sample and rejects malformed data
  live against the running CLI, not a copy (C22b); the wiring has no
  private copies and no prompt-text source (C22c). Validates policy and
  plumbing only — events live in `.git/` on developer machines and a CI
  clone has none by construction.
- Real bug found and fixed while building C22b's planted-breakage case:
  when a mutated sample makes `append` fail, it leaves an empty file, and
  `validate` on an empty file trivially passes (zero lines, zero bad
  lines) — the canary's `append && validate` check needed an explicit
  `[ -s "$cf" ]` to catch the append failure itself, not just trust
  validate's vacuous truth.
- Rejected (8 numbered alternatives in the spec): in-kernel logging
  (can't distinguish sessions from test/CI noise, breaks the pure-
  answer contract), a remote backend, an analytics layer, capturing
  prompt text, merging into exec-journal.sh, committing events to the
  worktree, capturing route-path per-edit events, and capturing
  repair/retry via a disk counter or a bypassable wrapper.

## Verification

All output shown at the barrier:
- `scripts/validate-engineos.sh`: passed 82, failed 0 — 3 new `ok` lines
- `scripts/test-validate-engineos.sh`: passed 74, failed 0 (8 new
  planted-breakage cases; caught the C22b vacuous-pass bug on the first
  real run, fixed, re-ran clean)
- `scripts/test-telemetry.sh`: passed 16, failed 0 (new)
- `hooks/test-route-advisor.sh`: 17/0 (12 unchanged + 5 new);
  `hooks/test-gate-advisor.sh`: 20/0 (16 unchanged + 4 new);
  `hooks/test-verify.sh`: 15/0 (11 unchanged + 4 new)
- `scripts/test-kernel.sh`: 153/0; `scripts/test-exec-journal.sh`: 14/0;
  `hooks/test-route.sh`: 38/0; `hooks/test-task-scale.sh`: 12/0 — all
  UNCHANGED
- `scripts/run-evals.sh`: 11/0, 33 skipped — UNCHANGED
- `bash -n` and `jq empty` clean on every changed file
- Manual smoke: an escalating prompt through `route-advisor.sh` produces
  a byte-identical escalation notice AND writes one valid `route` line;
  `telemetry.sh append` with a two-word value fails live with an `error`
  body (the privacy guard, demonstrated, not just asserted)

## Changes registered

Commit `243cf52` on `feat/decision-kernel-p1` (follows P1's `9d718f9`,
P2's `cb04a66`, P3's `5ebce4a`, P4's `e4bca47`, P5's `6e477d5`, P6's
`4f5922b`):

```
docs/specs/2026-08-06-decision-kernel-p7-telemetry.md | new
scripts/telemetry.sh                                   | new (executable)
scripts/test-telemetry.sh                               | new (executable)
registries/policy.json                                  | telemetry block, 1.4.0
hooks/route-advisor.sh                                   | route event write
hooks/gate-advisor.sh                                    | decision-rules event write
hooks/stop-verify.sh                                     | verify event write
hooks/ensure-project-layout.sh                            | retention reaper
hooks/test-route-advisor.sh                               | 5 cases added
hooks/test-gate-advisor.sh                                | 4 cases added
hooks/test-verify.sh                                      | 4 cases added
skills/retro/SKILL.md                                     | 1 bullet added
scripts/usage-report.sh                                   | telemetry section added
scripts/validate-engineos.sh                               | C22 added
scripts/test-validate-engineos.sh                          | 8 cases added
15 files changed, 1367 insertions(+), 6 deletions(-)
```

No renames. `hooks/{layout-manifest,lib-common}.sh` mode-only changes
remain unstaged (pre-existing, unrelated to this branch's work).

## Notes

- P7 delivers P6's fired-rules capture in full but names the check half as
  a follow-on: it needs a session-side reader (record-change mining the
  session's own telemetry into the record) before a CI check over the
  resulting field makes sense — building stages 2-3 now would check data
  that needs to exist for a while first.
- P5's repair/retry bound-justification use case is explicitly deferred:
  no hook mediates those model-invoked kernel calls, so `verify` (the
  loop's starting gun) is the closest honest proxy this phase ships. The
  attempt-level data has a designed home already — exec-journal's
  `status` field — whose writer is the ai-se-os runner follow-on.
- Next: P8 (28-contradiction cleanup) and the ai-se-os runner-adoption
  follow-on (including exec-journal's writer and the conformance-capture
  reader named above) are not started and not yet requested for this
  session.
