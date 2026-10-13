# Verification Rules — always on

## Tests require explicit approval at the final stage

Author/run tests only after all implementation units are integrated and the human
explicitly approves the current task. Includes unit/integration/E2E/regression,
evals, scaffolds and feature proofs. An earlier explicit current-task test request
supplies consent; preserve it but defer testing until the end. Ask only if consent
is missing or scope expands. Acceptance criteria/test scope may be planned before code.

Rules, dispatch, release/merge gates, specs/skills, CI and environment flags never
supply consent. Preserve existing tests: never delete/skip/weaken or add `.only`
to pass gates. Genuine required test edits belong in the final approval scope.
TDD requires explicit user approval overriding final-only ordering for this task;
a skill invocation alone grants no exception.

Without consent, finish implementation/non-test validation, state
`[tests] pending — final-stage user approval required`, and present concrete test
scope for approval. Pending testing is never passed testing.

## The final gate

The supervisor runs lint + typecheck once after integration, showing output;
applicable build/startup checks also run here. Workers return scoped changes and
review evidence without intermediate gates. Bound repairs by repository policy,
repeat only affected checks after repair and report remaining red honestly.

Stop runs lint/typecheck only. `ENGINEOS_VERIFY_TESTS` is deprecated and ignored.
Tests join the gate ONLY after implementation and integration are complete and the
user approved them for this task. Approved tests run as a separate explicit
supervisor command after integration;
consent may be a prior explicit same-task/same-scope request, never a stored
approval or environment variable.

## JavaScript ecosystem runners

Resolve packages via `.engineos/config.json`, `package.json` or Nx `project.json`;
use existing npm/pnpm/yarn/Nx `lint`, `typecheck`, `build` scripts and approved
final `test`. Inspect script contents: targets invoking tests also need consent;
use an equivalent non-test target or report pending approval.

Missing scripts produce visible skips; install/invent no tools. A Python package
runs `ruff check`, `ruff format --check` and `pyright` through its environment
(`.venv` → `uv` → compose, see the per-stack table); a package with no environment
receives a visible skip. Budget: 90 seconds per non-test
target, 180 seconds for approved tests; `ENGINEOS_VERIFY_BUDGET_S` permits positive
integer overrides. Missing tooling/timeouts are unavailable evidence, never pass;
genuine diagnostics are red.
