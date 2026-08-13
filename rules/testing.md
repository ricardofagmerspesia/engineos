# Testing Rules — craft

Loaded when tests are ON for a task. Whether they are on at all, and the
definition of **the final gate** they run at, live in `rules/verification.md`
(always-on). Nothing in this file is a trigger to write tests.

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
