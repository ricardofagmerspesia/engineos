# Verification Rules — always on

## Tests are opt-in — the default is NO tests

EngineOS writes no tests and runs no suite unless asked. Test work is real work:
requested, scoped, and paid for like any other task, never smuggled into every
change.

**Tests are ON for a task only when one of these holds:**
- The user asks — "write tests", "add coverage", "integration tests for X",
  "E2E", "TDD this", "run the suite".
- The project's own `CLAUDE.md` requires tests for the area being touched
  (project conventions beat EngineOS defaults).
- A test agent is dispatched on purpose: `test-writer` (ameer) or `qa-tester` (qa).
- The user named a release/merge gate that includes tests.

**Otherwise: write no tests, run no suite.** State the omission in one line so it
is never silent:

`[tests] skipped — not requested`

The two rationalizations to refuse: "just a couple of quick tests" beside a
feature nobody asked to test (including a scaffold "for later"), and a suite run
to "check nothing broke" — lint, typecheck, and the user's own review carry that
load.

- DON'T delete, skip, `.only`, or weaken EXISTING tests to make a gate pass. Code
  you didn't touch keeps its tests. If a change genuinely invalidates a test, say
  so and ask — never silently neutralize it.
- Bug fixes: a regression test is RECOMMENDED, not automatic. Offer it in one
  line ("this fix ships without a regression test — want one?") and move on
  unless the user takes it up.
- When in doubt, ask before writing tests — never write them and ask after.

Craft guidance for when tests ARE on — what to cover, the pyramid, mocking, how
to write one — is a separate file, loaded by the test-writing router row.

## The final gate

**The final gate** is EngineOS's single verification point: lint + typecheck, run
ONCE, after the last unit of work is integrated, with output shown
(`superpowers:verification-before-completion`). This is the only place the gate is
defined — every other document names it and stops. The `Stop` hook
(`hooks/stop-verify.sh`) automates it.

- Tests join the gate ONLY when tests were ON for the task per the section
  above. Then they run once, at the same moment — never per edit, per file, or
  per wave.
- `ENGINEOS_VERIFY_TESTS=1` forces tests into the gate unconditionally, for a team,
  project, or session that wants them there.
- Never mid-task: no test/typecheck run per edit or per intermediate step. Write
  freely; verify at the end.
- Narrowing the gate makes what remains MORE mandatory, not optional. Red means a
  fix loop until green, with output shown.
- Wave barriers (`rules/parallelism.md`) integrate contracts; the gate runs at the
  last barrier only.

### Per stack

The gate resolves the stack per package directory (`scripts/kernel.sh resolve-stack
<dir>`: explicit `.engineos/config.json` first, manifests second) and runs the same
targets through that stack's tools. A directory holding both manifests runs both.

| Stack (marker) | `lint` | `typecheck` | `test` (when on) | Runner |
|---|---|---|---|---|
| Node (`package.json`, Nx `project.json`) | `lint` package script | `typecheck` package script | `test` package script | npm / pnpm / yarn / Nx, whichever the package declares |
| Python (`pyproject.toml`; `requirements.txt` only when no `pyproject.toml` sits above it) | `ruff check .` then `ruff format --check .` | `pyright` | `pytest -q` | `.venv/bin/<tool>` (package, then repo root) → `uv run --directory <pkg> <tool>` when `uv.lock` exists → `docker compose exec <service> <tool>` when `.engineos/config.json` declares `compose_service` → skipped, with the visible line `[engineos] stop-verify skipped for <pkg>: no Python environment found (venv, uv or compose)` |

- A target the package does not declare (no script; no `[tool.ruff]` /
  `[tool.pyright]` / pytest config and no resolvable tool) is skipped and
  announced, never failed.
- **Pinned versions.** `ruff`, `pyright` and `pytest` are pinned to exact `==`
  versions in the package's dev dependencies, and a lockfile (`uv.lock` or
  `requirements.lock`) is committed. The gate installs nothing; when a declared
  tool is unpinned it still runs and emits a one-line advisory
  (`<tool> not pinned to exact versions (rules/verification.md)`).
- **Budget.** 90 s per target, 180 s for tests. `ENGINEOS_VERIFY_BUDGET_S=<seconds>`
  raises every target's budget (pyright's first run over a large repo); a value
  that is not a positive integer is ignored.
- **Red vs infra.** The gate blocks ONCE, only on genuine red — ruff/pyright
  diagnostics, pytest failures, eslint/tsc errors. A missing environment, a
  missing tool (`No module named ruff`, `command not found`), a budget timeout or
  a node too old for the toolchain is infra: announced as a skip, no fix attempt
  consumed, never a block.
