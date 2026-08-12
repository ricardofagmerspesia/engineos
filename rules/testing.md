# Testing Rules

## Tests are opt-in — the default is NO tests

EngineOS does not write tests and does not run test suites unless asked. Test
work is real work: it gets requested, scoped, and paid for like any other task,
never smuggled into every change. Automatic test authoring and reflexive suite
runs were the main thing stalling the build loop; they are gone.

**Tests are ON for a task only when one of these holds:**
- The user asks — "write tests", "add coverage", "integration tests for X",
  "E2E", "TDD this", "run the suite".
- The project's own `CLAUDE.md` requires tests for the area being touched
  (project conventions beat EngineOS defaults).
- A test agent is dispatched on purpose: `test-writer` (alias `ameer`) or
  `qa-tester` (alias `qa`).
- The user named a release/merge gate that includes tests.

**Otherwise: write no tests, run no suite.** State the omission in one line so it
is never silent:

`[tests] skipped — not requested`

- DON'T author "just a couple of quick tests" beside a feature nobody asked to
  test, and don't scaffold a test file "for later".
- DON'T run the suite to "check nothing broke". Lint, typecheck, and the user's
  own review carry that load by default.
- DON'T delete, skip, `.only`, or weaken EXISTING tests to make a gate pass. Code
  you didn't touch keeps its tests. If a change genuinely invalidates a test, say
  so and ask — never silently neutralize it.
- Bug fixes: a regression test is RECOMMENDED, not automatic. Offer it in one
  line ("this fix ships without a regression test — want one?") and move on
  unless the user takes it up.
- When in doubt, ask before writing tests — never write them and ask after.

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

---

Everything below is craft guidance for **when tests are ON**. None of it is a
trigger to write tests.

## What to cover first (when asked for coverage without a named target)
- Business logic: calculations, state transitions, domain rules.
- Trust boundaries: input validation, authz checks.
- Public contracts: API response shapes, exported library functions.
- The specific bug, when writing a regression test: it must fail without the fix.

## What not to test
- Framework internals, ORMs, third-party libs.
- Trivial pass-throughs and getters.
- Implementation details (private methods, internal state) — test behavior through the public surface.

## Pyramid
- Many fast unit tests (pure logic, no I/O) → fewer integration tests (module + real DB via testcontainers or API + mocked externals) → few E2E happy-path tests.
- DON'T invert it: an E2E-heavy suite is slow, flaky, and pins implementation.
- When the user asks specifically for **integration tests**, build those and stop
  there — don't backfill a unit layer they didn't ask for.

## Writing tests
- DO follow Arrange-Act-Assert; one behavior per test.
- DO name tests as behavior statements: `rejects expired tokens`, not `test1` / `should work`.
- DO use test factories/builders for fixtures; no 50-line inline setup copy-pasted between tests.
- DO test edge cases deliberately: empty, null, boundary values, duplicates, concurrent calls where relevant.
- DON'T assert on implementation (called X internally) when you can assert on outcome.
- DON'T share mutable state between tests; each test sets up and tears down its own world.

## Mocking
- DO mock at architectural boundaries only (external APIs, clock, random, queues).
- DON'T mock what you own and can run (your own services, in-memory logic) — too many mocks = testing your mocks.

## Process
- `superpowers:test-driven-development` is the discipline to follow when the user
  asks for TDD or for tests up front — not a default mode for every feature.
- DO keep the suite fast (unit suite <30s) so that running it, when asked, stays cheap.
- Flaky test = broken test. Fix or delete within the week; never retry-until-green.
- Run tests when they are ON at the final gate only.
