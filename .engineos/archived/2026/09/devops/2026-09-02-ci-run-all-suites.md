---
name: 2026-09-02-ci-run-all-suites
status: done
owner: ricardo.fagmer
spec: docs/specs/2026-09-02-deepen-runtime-modules-design.md
domain: devops
completed: 2026-09-02
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
- [x] `scripts/validate-engineos.sh` green (in CI)
- [x] PR opened via gh (#23, stacked on #22)
- [x] Fix the three upstream defects the first real CI run exposed

## What was made
Added seven CI steps (kernel, bypass, docs, route-advisor, agent-announce, telemetry,
post-edit suites) after the last existing suite step. Found and fixed the reason CI
had never run: `.github/workflows/ci.yml:15` used YAML flow-mapping syntax for
`run:`, which parses as a hash; GitHub rejected the file on every push since it was
created (`gh run list`: every `ci.yml` run failed in 0s). Converted to a block scalar,
same three commands. Landed the deepen-runtime-modules design spec.

The first executing run then exposed four pre-existing defects on `origin/main`, fixed
here so the series starts from green: `registries/agents.json` stale after the router
trigger rename (fixed on the PR-A branch); a router row ("Coordinated multi-domain
change") published by the admin console with no registry intent (dropped, it duplicated
the big/multi-domain row); the admin-console archived record missing `## Changes
registered` and linking a spec outside `docs/specs/` (section added, spec moved); and
the validator negative case for closure targeting wording that no longer existed
(retargeted at the backend row).

## Verification
Ruby Psych parse of the workflow: `steps=28 non_string_run=0`. Local suites not run
(verification policy: once, at the end, on request). CI on the PR is the gate:
run 33630046598 on `chore/ci-run-all-suites` — all 28 steps green, the first green
run of `ci.yml` since the file was created.

## Changes registered
```
.github/workflows/ci.yml                                            | 26 +-
CLAUDE.md                                                           |  1 -
.engineos/archived/2026/08/frontend/2026-08-15-admin-console-...md  |  6 +-
docs/superpowers/specs/... -> docs/specs/2026-08-15-engineos-admin-console-design.md
scripts/test-validate-engineos.sh                                   |  2 +-
docs/specs/2026-09-02-deepen-runtime-modules-design.md              | new
.engineos/changes/2026-09-02-ci-run-all-suites.md                   | new
```

## Notes
Design decisions and rejected alternatives live in the spec.
