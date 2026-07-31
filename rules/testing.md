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

## Process
- Prefer TDD (`superpowers:test-driven-development`, red → green → refactor) for new features and fixes; backfilling tests for existing untested code is acceptable.
- DO keep the suite fast enough to run on every change (unit suite <30s); slow tests get tagged and run in CI.
- Flaky test = broken test. Fix or delete within the week; never retry-until-green.
