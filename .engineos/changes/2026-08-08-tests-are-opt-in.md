---
name: tests-are-opt-in
status: active
owner: ricardo
spec: none (policy change to the constitution, no code surface)
domain: docs
---

## What

Tests become opt-in across EngineOS. The default is now: write no tests, run no
test suite. The finalization gate narrows to **lint + typecheck**, and tests join
it only when they were explicitly turned ON for the task.

Tests are ON only when one of these holds:
- the user asks ("write tests", "add coverage", "integration tests for X", "E2E",
  "TDD this", "run the suite");
- the project's own `CLAUDE.md` requires tests for the area being touched;
- a test agent is dispatched on purpose (`test-writer` / `qa-tester`);
- the user named a release/merge gate that includes tests (store submissions
  count — the `ios-builder` / `android-builder` quality gates keep running tests).

When tests are off, the session says so in one line: `[tests] skipped — not requested`.

`ENGINEOS_VERIFY_TESTS=1` forces tests back into the Stop gate for a team,
project, or session that wants them there unconditionally.

## Why

Reflexive test authoring and suite runs were the remaining thing stalling the
build loop. The previous change (`2026-08-08-verify-at-end-distribute-always`)
moved verification to task finalization, which removed per-edit blocking but left
every coordinator still writing tests beside each change and still folding a full
suite run into the final gate. On a repo with a slow suite that is the same stall,
just relocated.

Narrowing the gate is not weakening it: lint + typecheck stay mandatory, run once,
with output shown, and red still means a fix loop until green. What changed is
that test work is now requested, scoped, and paid for like any other work instead
of being smuggled into every change.

Existing tests are explicitly protected: nothing may delete, skip, `.only`, or
weaken a test that already exists in order to make a gate pass.

## Scope

Canonical contract:
- `rules/testing.md` — rewritten. "Tests are opt-in" + "Verification timing —
  lint + typecheck at finalization" are the two normative sections; everything
  below the horizontal rule is craft guidance that applies only when tests are ON.

Propagated (4 parallel agents over disjoint scopes, then an inline gap pass):
- `CLAUDE.md` — non-negotiable #2 (gate = lint + typecheck); router row 81 recast
  as the explicit opt-in path; spec-archived row's gate description.
- `hooks/stop-verify.sh` — `TARGETS` built once from `ENGINEOS_VERIFY_TESTS`;
  both the Nx and non-Nx loops iterate it instead of a hardcoded
  `lint typecheck test`. Per-target timeouts unchanged.
- `hooks/test-verify.sh` — `invoke()` takes the env state per case; new cases
  prove a failing `test` script does NOT block by default and DOES block under
  `ENGINEOS_VERIFY_TESTS=1`.
- `agents/{backend,frontend,mobile,llm,dba,devops}-coordinator.md` — IMPLEMENT
  steps and parallel-discipline lines: verify with lint + typecheck, write tests
  only when the dispatch brief marks them in scope, still never run the suite.
- `agents/test-writer.md` — unchanged in mandate; one line added noting it is the
  deliberate opt-in vehicle, not something invoked automatically.
- `agents/{ios,android}-builder.md` — quality gates keep tests, now explicitly
  justified as a release gate under the new policy.
- `commands/implement.md` — step 7 gate; step 6 corrected (intermediate barriers
  integrate only, they do not verify).
- `templates/cursor/commands/implement.md` — mirrored, with a note that Cursor has
  no hook system so nothing enforces the gate automatically there.
- `rules/parallelism.md` — step 5 now requires the brief to state whether tests are
  in scope; step 6 final-barrier gate narrowed.
- `rules/models.md` — clarifier that the build-tier "tests" row is a tier
  assignment, not a mandate to produce tests.
- `README.md`, `docs/START.md`, `docs/ADOPTION.md`, `docs/PRD.md` — hook tables,
  lifecycle diagrams, walkthroughs, and the R5 requirement aligned; START.md and
  ADOPTION.md carry an explicit "tests are opt-in" callout for new developers.
- `.cursor/rules/testing-opt-in.mdc` — new. Cursor mirror of the policy
  (`alwaysApply: true`), same shape as `subagent-dispatch.mdc`: the ON conditions,
  the `[tests] skipped — not requested` line, the lint + typecheck gate, and the
  hard limits. Prompt-only, with the absence of a Cursor hook point stated in the
  file itself.

Not touched: `docs/specs/2026-06-19-stop-verify-runs-tests-design.md` and archived
change records — point-in-time records of what was decided then, not live policy.

## Checklist

- [x] `rules/testing.md` rewritten as the canonical contract
- [x] Non-negotiable #2 in `CLAUDE.md` narrowed to lint + typecheck
- [x] Router row for test writing recast as the explicit opt-in path
- [x] `stop-verify.sh` drops `test` by default, gains `ENGINEOS_VERIFY_TESTS=1`
- [x] `test-verify.sh` proves both the default and opt-in paths
- [x] All six coordinators + `implement` command aligned
- [x] `test-writer` / `qa-tester` left intact as the opt-in vehicles
- [x] Store-release gates keep tests, with the exception stated explicitly
- [x] Cursor `implement` command mirror aligned
- [x] Cursor rule mirror created (`.cursor/rules/testing-opt-in.mdc`)
- [x] Onboarding docs make the opt-in rule discoverable
- [x] Verification gate run, output shown

## What was made

Two normative shifts, one contract file, sixteen propagated files.

The contract was frozen first in `rules/testing.md`, then four `general-purpose`
agents propagated it in one wave over disjoint scopes (CLAUDE.md / hooks /
agents+commands / docs+remaining rules). A grep sweep afterwards caught four
files no unit owned — `docs/ADOPTION.md`, `docs/PRD.md`,
`templates/cursor/commands/implement.md`, and the two store builders — which were
fixed inline. That gap was a decomposition miss, not an agent failure: the fan-out
scopes were drawn from the earlier survey and the survey did not cover
`templates/cursor/` or `docs/ADOPTION.md`.

Two pre-existing contradictions from the previous change were also cleared while
in the same lines: `commands/implement.md` still told the orchestrator to
barrier-verify between waves, and `docs/PRD.md` R5 still specified the retired
per-edit `PostToolUse` typecheck hook.

## Verification

This repo has no `package.json`; its verification surface is shell syntax, JSON
validity, and the hook smoke suites. Tests were IN SCOPE for this change — the
change modifies the verification machinery itself, so its own smoke suites are
the thing under test.

```
=== bash -n (all hooks + install.sh + scripts) ===
all parsed OK

=== jq ===
hooks.json OK
permissions template OK

=== smoke suites ===
hooks/test-verify.sh          pass=9  fail=0
hooks/test-route.sh           pass=21 fail=0
hooks/test-agent-announce.sh  pass=5  fail=0
```

`test-verify.sh` grew from 8 to 9 cases; the new/repurposed ones assert that a
failing `test` script does not block with `ENGINEOS_VERIFY_TESTS` unset, and does
block with it set to `1`. The env var was confirmed unset in the shell before the
run so the default-path assertions were not passing on environment leakage.

`stop-verify.sh` runs `set -uo pipefail` (no `-e`), so the
`[ "${ENGINEOS_VERIFY_TESTS:-}" = "1" ] && TARGETS=...` short-circuit cannot abort
the hook when the variable is unset.

## Notes

- `.cursor/rules/` now holds two mirrors: `subagent-dispatch.mdc` and
  `testing-opt-in.mdc`. Both are prompt-only — Cursor has no hook system, so
  neither has the backstop its Claude Code counterpart gets. The pattern for any
  future mirror is set by these two: state the rule, then state plainly that
  nothing enforces it there.
- Nothing committed. All changes sit uncommitted on `feat/subagent-dispatch-rule`.
