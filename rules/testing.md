# Testing Rules

## What must be tested (P0 — no merge without)
- Business logic: calculations, state transitions, domain rules.
- Trust boundaries: input validation, authz checks.
- Bug fixes: every fix ships with a test that fails without the fix.
- Public contracts: API response shapes, exported library functions.

## What not to test
- Framework internals, ORMs, third-party libs.
- Trivial pass-throughs and getters.
- Implementation details (private methods, internal state) — test behavior through the public surface.

## Pyramid
- Many fast unit tests (pure logic, no I/O) → fewer integration tests (module + real DB via testcontainers or API + mocked externals) → few E2E happy-path tests.
- DON'T invert it: an E2E-heavy suite is slow, flaky, and pins implementation.

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

## Verification timing — test at finalization, not mid-flight
- DO run the full verification pass (lint + typecheck + tests) ONCE, at task
  finalization — after the last unit of work is integrated, before claiming done
  (`superpowers:verification-before-completion`). The `Stop` hook
  (`hooks/stop-verify.sh`) is the automated gate for exactly this moment.
- DON'T block the build loop with verification mid-task: no test/typecheck run per
  edit, per file, or per intermediate step. Write freely; verify at the end.
- DON'T ship without the final pass either — deferring verification to the end
  makes it MORE mandatory there, not optional. Red at the gate means a fix loop
  until green, with output shown.
- Wave barriers (`rules/parallelism.md`) integrate contracts; they do not each run
  the full suite. Only the FINAL barrier of a task runs verification.
- Exception: a bug fix's regression test may be run in isolation to confirm the
  failure is captured — one targeted test file, not the suite.

## Process
- When implementing features/fixes, write tests alongside the code
  (`superpowers:test-driven-development` for the design discipline), but defer
  suite execution to task finalization per **Verification timing** above.
- DO keep the suite fast (unit suite <30s) so the finalization gate stays cheap;
  slow tests get tagged and run in CI.
- Flaky test = broken test. Fix or delete within the week; never retry-until-green.
