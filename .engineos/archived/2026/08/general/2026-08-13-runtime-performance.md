---
name: 2026-08-13-runtime-performance
status: done
completed: 2026-08-13
owner: Ricardo Fagmer
spec: docs/specs/2026-08-13-runtime-performance-design.md
domain: general
---

## What

Deepen the EngineOS runtime behind one prompt-resolution interface and remove
avoidable shell, validation, edit-routing, and always-on context overhead.

## Why

Measured prompt-hook work is about 4.34 seconds cumulatively, file routing costs
about 478 ms per edit, the negative validator has a theoretical sequential floor
above 52 minutes, and the always-on corpus is 56,276 bytes.

## Scope

Decision kernel, prompt and file hooks, hook registration/tests, validator and
negative tests, CI performance budget, constitution/import mirrors, and docs.

## Checklist

- [x] Add fast in-process matching and `resolve-task`
- [x] Register and test one prompt advisor
- [x] Cache file routing with safe invalidation
- [x] Add targeted validator execution
- [x] Reduce always-on context without weakening the fallback
- [x] Add and pass performance budgets
- [x] Run the final integrity and behavioral gates

## What was made

Added a deep `kernel.sh resolve-task` interface and moved intent, decision-rule,
and scale matching into bounded in-process `jq` passes. Replaced three registered
prompt hooks with one non-blocking prompt adapter while leaving the legacy
entrypoints available for compatibility.

Added per-session file-route and encoded-output caching under the worktree git
directory, with registry/buster invalidation and SessionStart cleanup. Added
targeted validator check selection and four-way isolated negative-test execution.

Reduced the always-on corpus to the constitution plus the base/security/git/
context core; substantive requests receive a closed policy bundle from the task
contract. Added executable CI performance budgets and updated all user-facing
mirrors and probes.

## Verification

- `bash scripts/test-kernel.sh` — 194 passed, 0 failed
- `bash hooks/test-prompt-advisor.sh` — 7 passed, 0 failed
- `bash hooks/test-route.sh` — 40 passed, 0 failed
- `bash hooks/test-docs.sh` — 189 passed, 0 failed
- `bash scripts/validate-engineos.sh` — 88 passed, 0 failed
- `bash scripts/test-validate-engineos.sh` — 78 passed, 0 failed in 116.48 s
  after targeted groups and four-way isolation (the first run exposed and fixed
  a prefix-only telemetry wiring assertion)
- Remaining hook/script suites — all passed (195 behavioral checks)
- `bash scripts/run-evals.sh` — 11 passed, 0 failed, 33 live cases skipped by
  normal opt-in policy
- `shellcheck -S error hooks/*.sh install.sh scripts/*.sh` — clean
- `bash scripts/bench-runtime.sh` — route-intent 50.2 ms, resolve-task 219.1 ms,
  prompt-advisor 377.3 ms, cached route hook 110.8 ms, always-on 27,757 bytes;
  all below budgets

## Changes registered

```text
M .github/workflows/ci.yml
M CLAUDE.md
M README.md
M docs/ADOPTION.md
M docs/COMPATIBILITY.md
M docs/START.md
M hooks/docs-ledger.sh
M hooks/ensure-project-layout.sh
M hooks/hooks.json
M hooks/lib-common.sh
M hooks/route-before-change.sh
M hooks/test-docs.sh
M hooks/test-route.sh
M registries/policy.json
M rules/context.md
M scripts/kernel.sh
M scripts/run-evals.sh
M scripts/test-kernel.sh
M scripts/test-validate-engineos.sh
M scripts/validate-engineos.sh
?? docs/specs/2026-08-13-runtime-performance-design.md
?? hooks/prompt-advisor.sh
?? hooks/test-prompt-advisor.sh
?? scripts/bench-runtime.sh
```

Movement on closure: `.engineos/changes/2026-08-13-runtime-performance.md` →
`.engineos/archived/2026/08/general/2026-08-13-runtime-performance.md`.

## Notes

The existing Opus bindings and mandatory-dispatch policy are explicitly out of
scope; the user previously selected them as quality policy.
