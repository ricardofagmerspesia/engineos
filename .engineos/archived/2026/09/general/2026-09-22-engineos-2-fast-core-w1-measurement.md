---
name: 2026-09-22-engineos-2-fast-core-w1-measurement
status: done
completed: 2026-09-22
owner: orchestrator
spec: docs/specs/2026-09-22-engineos-2-fast-core-design.md
domain: general
---

## What
Wave 1 of the EngineOS 2.0 fast-core program: the measurement surface the other
six waves will be judged against. Adds `engineos bench lifecycle` and
`engineos bench baseline [--write]` over a new per-host baseline store, and
flips the exec-journal's two token fields so a count nobody observed is recorded
as `null` rather than `0`.

## Why
Every other improvement in the 2.0 design is a performance or proportionality
claim, and the repo could not measure the thing those claims are about. The five
existing bench budgets time individual hook invocations; nothing timed a task's
lifecycle end to end, and nothing recorded a per-host baseline to compare a later
run against. A wave that cannot be measured can only be argued about.

The token change is the same defect one layer down. The dispatch and return
hooks cannot observe a subagent's usage, so they wrote `tokens_in: 0` /
`tokens_out: 0` and `rules/observability.md` carried a prose warning not to read
those zeros as free. A consumer summing the column got a number, and the number
was fabricated. The schema already supported `presence: 'always'`, which emits
JSON `null` for an unset field; the guarantee belongs there, not in prose.

## Scope
Created:
- `src/bench/host.ts` + test — host identity for a baseline (platform, cpu model,
  cpu count; deliberately NOT the EngineOS version, so a version bump does not
  orphan a recorded baseline)
- `src/bench/lifecycle.ts` + test — the `LifecycleSample` / `ScenarioResult` /
  `LifecycleReport` schema (F6) and the percentile statistics
- `src/bench/scenarios.ts` + test — the six measurable scenarios, driven through
  the existing spawn seam in `src/bench/measure.ts`
- `src/bench/baseline.ts` + test — `baselinePath` / `readBaseline` /
  `writeBaseline` / `compare`, the sanctioned baseline read path per program
  reconciliation R4
- `docs/perf/baselines/.gitkeep`
- this record

Modified:
- `src/bench/run.ts` + `run.test.ts` — the two new subcommand arms
- `src/journal/schema.ts` — `tokens_in` / `tokens_out` from `presence: 'required'`
  to `'always'`
- `src/journal/exec-journal.ts` — `emit()`'s comment on which fields keep an
  explicit null
- `src/hooks/telemetry.ts` — the zero defaults removed from `writeSpan`
- `src/hooks/announce-agent-return.ts` — the comment that used to warn about the
  zeros
- `src/hooks/telemetry.test.ts`, `announce-agent-return.test.ts`,
  `announce-agent.e2e.test.ts`, `src/journal/schema.test.ts` — assertions
- `src/checks/runtime-surface-journal.ts` + `runtime-surface-prose.test.ts` —
  C27d rebound from the `0 as free` claim to the null claim
- `registries/policy.json` — the `telemetry.exec_journal` note, which C27 checks
  against the prose and the running CLI together
- `rules/observability.md` — the "Who writes what" bullet
- `docs/COMPATIBILITY.md` — four `## Unreleased` rows
- `dist/engineos.cjs` — rebuilt

Merged in, not authored here: `origin/fix/ts7-eslint10-ci` (PR #103), without
which no gate on this branch can run — see Verification.

## Checklist
- [x] Task 1 — host identity (`77b7a62`)
- [x] Task 2 — lifecycle schema and statistics, F6 frozen (`aaf6086`)
- [x] Task 3 — the six lifecycle scenarios (`f36a71b`)
- [x] Task 4 — baseline read/write/compare (`5b03035`)
- [x] Task 5 — the two subcommand arms (`3608ec2`)
- [x] Task 6 — unobserved token counts emit null (`5bdca67`)
- [x] Barrier — COMPATIBILITY rows integrated, bundle rebuilt (`533da0a`)
- [x] Barrier — C27d rebound to the claim the code now makes (`5c148f8`)
- [x] Task 7 — the final gate, output shown
- [x] Task 7 — record this host's baseline (`bench baseline --write`)
- [x] Task 7 — wave handoff written per `templates/handoff.md`
- [x] Barrier — the baseline gate made honest after it failed against its own recording

## What was made
The bench entry point grew two arms. `engineos bench lifecycle` runs six named
scenarios — `prompt-routing`, `direct-edit-cold`, `direct-edit-warm`,
`agent-dispatch`, `agent-return`, `final-gate` — and prints a p50/p95 line each.
`engineos bench baseline` compares this host's current run against
`docs/perf/baselines/<host-id>.json` and names every scenario whose p50 exceeds
the recording by both 10% and 25ms; `--write` records one. The comparison is
advisory and exits 0 — see **Notes** for why, and `--strict` for the gating
form. A missing baseline is exit 1 either way, because absent evidence is not a
measured regression. An argument that is neither subcommand now exits 1 instead
of being ignored.

The exec-journal's two token fields became always-present. `--tokens-in` and
`--tokens-out` are optional on `append` as a consequence, an omitted count emits
`null`, and the two announce hooks supply neither. A caller that does observe
usage — the headless runner the design plans — still passes its own integers
through `facts.fields`, and a supplied count is validated exactly as before.

Task 6 reached five files the plan did not name. `registries/policy.json`'s
`telemetry.exec_journal` note asserted the zeros in prose that C27 compares
against `rules/observability.md` and the running CLI, so leaving it would have
failed `validate`. `src/checks/runtime-surface-journal.ts` pinned the literal
`0 as free`: the check was guarding a sentence the code had just made false, so
it was rebound to `a null is an unknown rather than a zero` and its finding id
renamed to match. The prose bullet carrying that phrase was reflowed onto one
line, because C27d reads the section raw and a claim split across a line break
cannot be asserted.

## Verification
Run on the merge commit, from the branch with PR #103 merged in.

- `npx tsc -p tsconfig.json --noEmit` -> `TypeScript: No errors found`, exit 0
- `node scripts/build.mjs` then `git status --short dist/` -> no drift
- `node dist/engineos.cjs validate` -> `passed 113, failed 0`
  (first run: `passed 112, failed 1`, `[zero-is-not-free-caveat-missing]` —
  C27d catching the prose change, fixed in `5c148f8` and re-run)
- `npm test` — see the appended result below

Before the merge, the gate could not run at all: `tsconfig.json(5,25): error
TS5108: Option 'moduleResolution=node10' has been removed`, because
`typescript` is pinned at 7.0.2 and TS 7 removed that resolution mode. This is
the breakage PR #103 fixes and it predates this wave by two weeks; main has been
red since 2026-09-09. Merging #103 into this branch was the human's explicit
choice among four, taken so the wave could be verified rather than declared.

The full suite reported `2132 tests, 2113 pass, 3 fail, 16 skipped`. All three
failures were this wave's own, all from Task 6 — C27d's `field-not-named` case
(the Agent-traces section names the token fields in two bullets now, so deleting
one site is no longer a deletion), the meta-case downstream of it, and the
presence roster expecting two always-fields instead of four. Fixed in `06aaf30`;
`26 tests, 26 pass, 0 fail` on re-run of the two files.

Then the baseline itself was recorded — and failed its own comparison four runs
out of four, on an idle machine, with nothing changed between them. See
**Notes**. No lint step exists for the root package.

## Human decisions
<!-- date | who | reasons | approved/refused | note -->
2026-09-22 | Ricardo Fagmer | high-risk | approved | The 2.0 program itself, at
risk=high / autonomy=A3, recorded in `2026-09-22-engineos-2-fast-core-design.md`.
This wave inherits that classification: public surface changes (two new
subcommands, a journal schema field presence change) and a consumer-visible
journal break.

2026-09-22 | Ricardo Fagmer | — | approved | Merge `origin/fix/ts7-eslint10-ci`
into this branch so the wave's gate can run, accepting that the 2.0 branch
carries PR #103's commits until #103 lands on main. Chosen over three
alternatives (scratchpad tsconfig override, duplicating the fix here, or
reporting the wave unverified). Not a hitl reason — recorded because it changes
what this branch contains.

2026-09-22 | Ricardo Fagmer | — | approved | Make `bench baseline` advisory
(exit 0, drift reported) with `--strict` as the gating opt-in, after the
mechanical fixes left it still red on an unchanged tree. Chosen over amortising
the spawn cost across N operations per process (the real fix, declined at this
barrier), raising the floor to ~60ms, and halting to redesign the scenarios.
Not a hitl reason — recorded because it narrows what the 2.0 program can claim
to have measured.

## Changes registered
Branch `codex/engineos-2-fast-core`, Wave 1 commits on top of `07eb57f`:

```
5c148f8 fix(checks): rebind C27d's token caveat to the null claim
dee4281 Merge remote-tracking branch 'origin/fix/ts7-eslint10-ci'
533da0a chore(dist): rebuild the bundle for the Wave 1 measurement surface
5bdca67 feat(journal): report an unobserved token count as null, not zero
3608ec2 feat(bench): add the lifecycle and baseline subcommands
5b03035 feat(bench): record and compare per-host lifecycle baselines
f36a71b feat(bench): drive the six measurable lifecycle scenarios
aaf6086 feat(bench): add the lifecycle sample schema and its statistics
77b7a62 feat(bench): identify the host a performance baseline belongs to
```

Carried in by the merge, authored on PR #103: `eb3439d`, `e39ec2b`, `9c60414`.

Barrier commits after the gate:

```
4a1bfd7 feat(bench): make the baseline comparison advisory, gated only under --strict
feff8e5 fix(bench): make the baseline gate survive its own recording
06aaf30 test(journal): follow the token fields into their new presence
7e18212 chore(engineos): record the Wave 1 measurement change
5c148f8 fix(checks): rebind C27d's token caveat to the null claim
```

Handoff: `docs/specs/2026-09-22-engineos-2-fast-core-wave1-handoff.md`.

## Notes
- **The measurement instrument cannot resolve the effect it measures on this
  host, and that is the wave's real finding.** `bench baseline` failed against a
  baseline recorded minutes earlier, four runs out of four. Three mechanical
  fixes landed and all helped — samples 5 -> 21, a regression must clear both
  10% and a 25ms absolute floor, and `prompt-routing` discards a warm-up run
  because it drifted systematically (133.6 -> 104.3 -> 97.0ms across three
  consecutive processes, being the hook that reads most of the tree). They were
  not enough: run-to-run spread here is 30-50ms on 70-95ms process spawns, and
  the noise is correlated background load that more samples inside one process
  cannot average away. The comparison is therefore ADVISORY — it prints drift
  and exits 0 — with `--strict` restoring the failing exit. Raising the floor
  until it passed was rejected: at a 70ms p50 that catches only an ~85%
  regression while still reporting green. Waves 5 and 6 must read these numbers
  as evidence with an error bar, never as a gate.
- A bug found on the way: `cacheHit` was keyed on the `warm` flag, so warming the
  page cache would have been recorded as a cache hit. It is keyed on the one
  scenario that measures a cache now.
- `dist/engineos.cjs` was owned by `root` at mode 644 in this checkout, so
  esbuild could not open it for writing. `dist/` itself is user-owned, so the
  file was removed and regenerated rather than reaching for sudo; it is owned by
  the checkout user again. Something in this clone has run as root — worth
  finding out what before it happens to a file whose directory is not writable.
- Program reconciliation R4 named the baseline read path twice, as
  `resolveBaseline` and as `readBaseline`. `readBaseline` / `baselinePath` is
  what shipped. Waves 5 and 6 must be briefed against those names.
- The plan's Task 6 said no change was needed in `src/journal/exec-journal.ts`.
  One was: `emit()`'s comment named `agent` and `note` as the only fields that
  keep an explicit null.
- Two divergences from the pinned v1 bash CLI now exist and the differential
  parity suite covers neither, because every one of its cases passes both token
  flags: `validate` accepts a null count that bash rejects, and an `append` that
  omits the flags succeeds here and fails there. Both are recorded in
  `docs/COMPATIBILITY.md`.
