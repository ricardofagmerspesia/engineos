---
name: 2026-09-02-ci-run-all-suites
status: active
owner: ricardo.fagmer
spec: docs/specs/2026-09-02-deepen-runtime-modules-design.md
domain: devops
---

## What
Wire the 7 test suites CI never runs into `.github/workflows/ci.yml`; land the
deepen-runtime-modules design spec (PR0 of 8).

## Why
`scripts/test-kernel.sh` (the decision kernel's only suite), `hooks/test-bypass.sh`,
`hooks/test-docs.sh`, `hooks/test-route-advisor.sh`, `hooks/test-agent-announce.sh`,
`scripts/test-telemetry.sh`, `hooks/test-post-edit.sh` all pass locally and none run
in CI. Every later PR in the series depends on them running.

## Scope
`.github/workflows/ci.yml`, `docs/specs/2026-09-02-deepen-runtime-modules-design.md`,
this record.

## Checklist
- [x] Add the 7 suites as CI steps, same shape as the existing ones
- [x] Fix the invalid `run: { … }` flow mapping on the Tools-present step (CI had never executed)
- [x] Spec committed
- [ ] `scripts/validate-engineos.sh` green
- [ ] PR opened via gh

## What was made
Added seven CI steps (kernel, bypass, docs, route-advisor, agent-announce, telemetry,
post-edit suites) after the last existing suite step. Found and fixed the reason CI
had never run: `.github/workflows/ci.yml:15` used YAML flow-mapping syntax for
`run:`, which parses as a hash; GitHub rejected the file on every push since it was
created (`gh run list`: every `ci.yml` run failed in 0s). Converted to a block scalar,
same three commands. Landed the deepen-runtime-modules design spec.

## Verification
Ruby Psych parse of the workflow: `steps=28 non_string_run=0`. Local suites not run
(verification policy: once, at the end, on request). CI on the PR is the gate.

## Changes registered
<filled on completion>

## Notes
Design decisions and rejected alternatives live in the spec.
