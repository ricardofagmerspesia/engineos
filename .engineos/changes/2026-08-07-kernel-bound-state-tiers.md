---
name: 2026-08-07-kernel-bound-state-tiers
status: active
owner: Ricardo Fagmer
spec: n/a — one defect found while demonstrating the system, fixed in the two files that hold it; below non-negotiable #1's threshold
domain: general
---

## What
The ai-se-os runner adopted only half of each kernel capability binding: it read
`capabilities[].agent` and discarded `capabilities[].model_tier`, so the retry
ladder started every workflow state at a single global default (`build`). Fixed
by threading the bound tier into the runner as `stateTiers`, plus a one-word fix
to `scripts/kernel.sh`'s usage string, which never listed `repair`.

## Why
Found by running the system end to end rather than by reading it. The exec
journal recorded `model_tier: "build"` for `author-spec`, which the kernel binds
to `most-capable`. Tracing that to its source showed the tier was not a
reporting artifact but the ladder's real starting point, with two consequences
on live runs:

- `author-spec` is bound most-capable and its agent (`product-spec`) is pinned
  `model: fable`. Escalating from `build` resolved `design` -> `opus`, so the
  escalated attempt — the last one, the one that most needs capability — ran a
  *weaker* model than attempts 1 and 2. A demotion disguised as an escalation.
- `security-review` is bound design. Escalating from `build` resolved `design`,
  the tier it already had, so its one escalation bought nothing.

`agent-sdk-executor.ts` already carried a comment about not wanting to "wrongly
demote an agent pinned above the default tier"; the guard it describes covers
attempts 1-2 only, and attempt 3 walked straight into the case it names.

Separately, `kernel.sh`'s usage error listed 11 of its 12 subcommands. `repair`
shipped in P5 and reached the dispatcher and the header comment, but not the
line a user actually sees when they guess wrong.

## Scope
- `scripts/kernel.sh` (engineos) — usage string.
- `bin/ai-se-os.js` — capture and validate `bound.model_tier`, thread it out.
- `src/cli.ts` — `stateTiers` on `RunCliDeps`, passed to the runner.
- `src/workflow/runner.ts` — `stateTiers` option; per-state ladder seed.
- `test/failure-policy.test.ts` — 3 cases.
- `test/kernel-conformance.live.test.ts` — conformance item 5.

## Checklist
- [x] Confirm the defect from a real run, not from reading (exec journal + kernel cross-check)
- [x] Confirm the kernel side is internally consistent before changing the runner
- [x] Thread the bound tier through bin -> cli -> runner
- [x] Fail closed on a binding whose `model_tier` is absent or unknown
- [x] Tests that fail without the fix (planted breakage, verified red)
- [x] Conformance case making the agent/tier agreement self-checking against the real kernel
- [x] Fix the `kernel.sh` usage string
- [x] Re-run every suite in both repos

## What was made
`bin/ai-se-os.js` now reads `bound.model_tier` in the same loop that reads
`bound.agent`, validates it against the pinned registry's own tier set
(`kernelPolicy.tierToModel` keys) and exits non-zero when it is absent or
unknown — a registry the runner cannot honor is a stop, not a silent fallback
to the global default, since that fallback is the whole defect. The map travels
`loadKernelAgents` -> `buildAgentExecutorOverride` -> `runCli` ->
`WorkflowRunnerOptions.stateTiers`, where `runAgentState` seeds
`let tier = this.stateTiers[state] ?? DEFAULT_TIER`.

No change to the ladder's shape: still 2 attempts plus 1 escalation, still
`escalateTier` over the registry's order. Because `most-capable` has
`escalates_to: null`, a most-capable-bound state now correctly holds its tier
across all three attempts instead of dropping to opus on the last one.

Three runner cases in `failure-policy.test.ts`: a most-capable-bound state that
holds its tier across an escalation, an unbound state that stays at the default,
and a design-bound state that now reaches most-capable instead of standing
still. The third deliberately seeds `validate` rather than the genuinely
design-bound `security-review`: that state is conditional and the test objective
touches no security-sensitive path, so asserting on it would have passed
vacuously on zero calls.

Conformance item 5 in the live tier asks the real kernel for each of the five
dispatched capabilities and checks three things agree: the bound tier is one the
registry knows, the model the kernel resolves matches its own tier table, and
the agent definition's pinned `model:` matches that model. This is the check
that would have caught the defect's precondition, and it is now the kernel's job
to keep true rather than the runner's job to be trusted about.

`scripts/kernel.sh`'s usage string gained `repair`.

## Verification
Planted breakage first — reverted the one-line runner seed and re-ran:

```
=== suite com a correcao REVERTIDA (deve dar RED) ===
 Test Files  1 failed (1)
      Tests  2 failed | 10 passed (12)
```

Restored, then green everywhere:

- ai-se-os `npm run typecheck` exit 0; `npm run build` exit 0
- ai-se-os `npm test` — 289 passed | 8 skipped (297), 24 files (was 286 | 7)
- ai-se-os conformance live tier against the real kernel —
  `AI_SE_OS_ENGINEOS_KERNEL_PATH=... npx vitest run test/kernel-conformance.live.test.ts`
  PASS (5) FAIL (0), including the new item 5
- engineos `./scripts/test-kernel.sh` — passed 153, failed 0
- engineos `./scripts/validate-engineos.sh` — passed 84, failed 0

End-to-end runs used for the demonstration that surfaced this (fake mode, no
API spend): `outcome: done` over 9 states with an honest gate ledger, and the
strict fixture correctly blocked at `author-spec` on the spec-artifact gate.

## Changes registered
engineos:

```
 M scripts/kernel.sh
 scripts/kernel.sh | 2 +-
```

ai-se-os, branch `fix/kernel-bound-state-tiers` off `main` (`c4016de`):

```
 M bin/ai-se-os.js                      | 42 +++++++++++++++-----
 M src/cli.ts                           |  7 ++++
 M src/workflow/runner.ts               | 14 ++++++-
 M test/failure-policy.test.ts          | 77 ++++++++++++++++++++++++++++++++++++
 M test/kernel-conformance.live.test.ts | 37 +++++++++++++++++
 5 files changed, 166 insertions(+), 11 deletions(-)
```

## Notes
- The defect class is "half-adopted binding": P9 wired the agent half of
  `capabilities.json` and left the tier half on the floor. Worth checking the
  remaining registry reads for the same shape — a consumer that destructures
  one field of a multi-field binding is the pattern to grep for, not this
  specific field.
- Two observations recorded but deliberately not fixed here, both operator
  ergonomics rather than correctness: `ai-se-os --help` falls through to the
  fixture-loading path and reports `invalid fixture --help` instead of printing
  usage (exit code is correctly 1), and a failed run writes its whole JSON
  report to stderr, so `| jq` needs `2>&1` on exactly the runs worth inspecting.
- `kernel.sh route-intent` matches literal signal substrings, not meaning:
  "the login endpoint returns 500" matches nothing, while "broken"/"fails" do.
  That is the documented design (P3 rejected treating ambiguity as escalation),
  not a defect — but it surprises on first use.
