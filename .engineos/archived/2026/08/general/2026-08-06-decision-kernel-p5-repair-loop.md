---
name: 2026-08-06-decision-kernel-p5-repair-loop
status: done
owner: ricardo
spec: docs/specs/2026-08-06-decision-kernel-p5-repair-loop.md
domain: general
completed: 2026-08-06
---

## What

Decision Kernel Phase 5: the check-level repair loop. A red validation
command (lint/typecheck/test/build/startup) now has a bounded, data-backed
policy — `registries/policy.json`'s `repair` block, answered per attempt by
`scripts/kernel.sh repair`, stated in the Stop-gate hook's block message, and
mirrored in the two prose homes that used to say only "until clean".

## Why

The parent plan's surviving wording for this phase was one line: "what
happens when a gate or check fails mid-run." Investigation found this splits
into three failure kinds — agent-unit failure was already solved (P1/P2's
`retry`), gate failure isn't a loop at all (unmet criteria, `rules/gates.md`
already owns the response), and check-level failure was the real gap: an
unbounded promise ("fix loop until clean") with no cap, no escalation, no
honest give-up-and-report-red exit. Same defect class P3/P4 fixed for
suppression and handoff sections.

## Scope

registries/policy.json (1.3.0: `repair` block), scripts/kernel.sh (`repair`
subcommand), registries/intents.json (1.2.1: verify-done note) + CLAUDE.md
(verify-done row) — both prose mirrors, hooks/stop-verify.sh (bound sentence
in the block message) + hooks/test-verify.sh (new case),
scripts/validate-engineos.sh (C20) + scripts/test-validate-engineos.sh (7
cases) + scripts/test-kernel.sh (11 cases), the P5 spec. Ten files.

## Checklist

- [x] Spec with frozen contracts before code (fable, most-capable tier —
      investigated the real gap rather than the parent plan's assumed one)
- [x] P5-U1: policy.json repair block + kernel.sh repair + prose mirrors
- [x] P5-U2: hooks/stop-verify.sh bound sentence + hooks/test-verify.sh case
- [x] P5-U3 (barrier): validate-engineos.sh C20 + 7 planted-breakage +
      test-kernel.sh repair section
- [x] Full verification green, all prior suites unchanged

## What was made

- `registries/policy.json` 1.3.0: new `repair` block — `checks`
  (lint/typecheck/test/build/startup), `max_fix_attempts_per_check: 2`,
  `escalations: 1`, `by_situation` {red, infra, flaky}, `never_repair`
  {weaken-the-check, behavior-change-required}. Structurally parallel to
  `retry` (same evidenced bound: two attempts, one escalation, then a human)
  but a separate block and verb — a red check has no agent envelope
  (`BLOCKED`/`DEGRADED` have no check analog; `infra`/`flaky` have no agent
  analog), and mutating `retry` would break frozen P2 surface.
- `scripts/kernel.sh` `repair --check <id> --attempt <n> [--situation
  <sit>]`: never-list first, then situation (`infra`/`flaky`), then the red
  ladder — breakpoints computed from `max_fix_attempts_per_check` and
  `+escalations`, never hardcoded. Fixed my own bug mid-build: the ladder
  formula had to match the spec's literal example table (attempt 1 → same
  tier, 2 → escalate, 3 → stop with maxfix=2/esc=1) — the correct breakpoints
  are exclusive upper bounds (`attempt < maxfix`, `attempt < maxfix+esc`),
  not inclusive, which I initially got backwards.
- `hooks/stop-verify.sh`: the block message states the bound, numbers read
  from the registry at runtime — the Stop gate is the one automated red
  signal the loop gets, so it's the loop's starting gun. No-jq fallback
  untouched (a degraded hook stating no bound is honest; stating a stale
  hardcoded one is not).
- `registries/intents.json` 1.2.1 + `CLAUDE.md`: both "until clean"
  occurrences rewritten to name the actual bound and point at
  `kernel.sh repair`.
- `scripts/validate-engineos.sh` C20: block well-formed (C20a), a live
  behavioral canary against the running kernel — not a copied fixture
  (C20b), prose mirrors agree and "until clean" stays dead, including a
  number extracted from the CLAUDE.md row compared against the registry
  (C20c, same pattern as P1), the hook carries no private copy (C20d).
- Real bug found and fixed while building C20b: when the `repair` block is
  deleted, `jq -r '.repair.max_fix_attempts_per_check'` on the missing path
  returns the literal string `"null"`, which is non-empty and passed my
  `[ -n "$maxfix" ]` guard, then crashed the whole script on unbound-variable
  arithmetic under `set -u` — and the harness read that crash as exit 0
  ("nothing caught") instead of a real failure. Fixed by normalizing
  non-integer `maxfix`/`esc` to empty string inside C20a's own validation,
  so C20b's guard correctly sees them as unusable and reports the cascading
  failure instead of crashing.
- Rejected (8 numbered alternatives in the spec): extending `retry` to cover
  checks, a generic failure abstraction (rule of three), the kernel running
  fixes itself, disk-persisted attempt counters, removing `stop-verify.sh`'s
  loop guard, prose-only fix, a standalone `repair.json`, different bound
  constants with no evidence.

## Verification

All output shown at the barrier:
- `scripts/validate-engineos.sh`: passed 72, failed 0 — 4 new `ok` lines
- `scripts/test-validate-engineos.sh`: passed 56, failed 0 (7 new
  planted-breakage cases; caught the C20b crash bug on the first real run,
  fixed, re-ran clean)
- `scripts/test-kernel.sh`: passed 153, failed 0 (11 new `repair` cases;
  existing `retry` cases unchanged)
- `hooks/test-verify.sh`: pass=11 fail=0 (10 existing cases UNCHANGED + 1
  new bound-sentence case)
- `hooks/test-route.sh`: 38/0 UNCHANGED; `hooks/test-route-advisor.sh`: 12/0
  UNCHANGED; `hooks/test-gate-advisor.sh`: 16/0 UNCHANGED;
  `hooks/test-task-scale.sh`: 12/0 UNCHANGED
- `scripts/run-evals.sh`: 11/0, 33 skipped — UNCHANGED
- `bash -n` and `jq empty` clean on every changed file
- Manual smoke: `kernel.sh repair --check lint --attempt 3` returns
  `stop-report-red`; a forced-red `stop-verify.sh` invocation's block
  `reason` states "The fix loop is bounded: 2 fix attempts per check, 1
  model-tier escalation..."

## Changes registered

Commit `6e477d5` on `feat/decision-kernel-p1` (follows P1's `9d718f9`, P2's
`cb04a66`, P3's `5ebce4a`, P4's `e4bca47`):

```
docs/specs/2026-08-06-decision-kernel-p5-repair-loop.md | new
registries/policy.json                                  | repair block, 1.3.0
registries/intents.json                                 | verify-done note rewritten, 1.2.1
scripts/kernel.sh                                        | repair subcommand
hooks/stop-verify.sh                                     | bound sentence in block message
hooks/test-verify.sh                                     | 1 new case
CLAUDE.md                                                | verify-done row rewritten
scripts/validate-engineos.sh                             | C20 added
scripts/test-validate-engineos.sh                        | 7 cases added
scripts/test-kernel.sh                                   | repair section added
10 files changed, 809 insertions(+), 5 deletions(-)
```

No renames. `hooks/{layout-manifest,lib-common}.sh` mode-only changes remain
unstaged (pre-existing, unrelated to this branch's work).

## Notes

- P5 explicitly stated what it does NOT own: gate failure (no loop exists to
  bound), `hooks/record-verify.sh` (its failure is a missing change record,
  a debt flag, not a red command), and executing any fix — the kernel
  answers, it never acts.
- The spec's own "boundary" section is explicit: these tests prove the
  answer and the announcement exist as data — they prove nothing about
  whether the model actually obeys the bound at runtime. That's model
  behavior, reachable only by eval golden cases or the `critic` agent,
  neither of which P5 ships.
- Next: P6 (spec-conformance), P7 (telemetry — the phase that would justify
  changing the repair bound's numbers with real data), P8
  (28-contradiction cleanup), and the ai-se-os runner-adoption follow-on
  (deleting its hardcoded `MAX_ATTEMPTS`/`ESCALATION_ORDER` in favor of
  kernel calls) are not started and not yet requested for this session.
