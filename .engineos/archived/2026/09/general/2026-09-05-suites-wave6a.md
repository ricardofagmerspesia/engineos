---
name: 2026-09-05-suites-wave6a
status: done
completed: 2026-09-05
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 6(a) of the TypeScript runtime migration (plan Tasks 42-57, first batch): six bash suites port to `node:test` e2e files through the shared harness — `scripts/test-validate-engineos.sh` -> `src/validate/validate.e2e.test.ts`, `scripts/test-kernel.sh` -> `src/kernel/kernel.e2e.test.ts`, `hooks/test-route.sh` -> `src/hooks/route-before-change.e2e.test.ts`, `hooks/test-prompt-advisor.sh` -> `src/hooks/prompt-advisor.e2e.test.ts`, `hooks/test-bypass.sh` -> `src/bypass/bypass.e2e.test.ts`, `hooks/test-verify.sh` -> `src/hooks/stop-verify.e2e.test.ts`. Each `.sh` suite and its CI step are deleted.

## Why
Plan Wave 6: the suites are the last bash + jq consumers on the test path; `npm test` already runs `build/**/*.test.js`, so each port removes a CI step and adds nothing.

## Scope
The six `*.e2e.test.ts` files above, the six deleted suites, `.github/workflows/ci.yml` (six steps removed), `README.md`/`docs/COMPATIBILITY.md` where they name the suites, `dist/engineos.cjs` if the harness needs a rebuild.

## Checklist
- [x] Six agents, one suite each, disjoint scopes; each case ported one-to-one with its stdout/marker assertions kept; suites that read a transcript run each case in both transcript forms
- [x] `.sh` suites deleted; CI steps removed; gate driver updated
- [x] Docs naming the suites updated
- [x] Final gate run once at the end

## What was made
Six bash suites ported to `node:test` e2e files driven through the shared harness (`runCli` spawning `dist/engineos.cjs`, `tempRoot`, `fixtureRepo`, `relocatedRoot`, `envelope`, `transcript`): `scripts/test-validate-engineos.sh` -> `src/validate/validate.e2e.test.ts` (6 cases); `scripts/test-kernel.sh` -> five `src/kernel/kernel*.e2e.test.ts` files (~182 tests over route-path, route-intent, policy arms, route-escalate, resolve-task, admit, breaker, hitl; relocated-registry cases use `relocatedRoot` + `ENGINEOS_ROOT` instead of copying dist); `hooks/test-route.sh` -> `src/hooks/route-before-change.e2e.test.ts` (41 cases, ten guidance literals whole); `hooks/test-prompt-advisor.sh` -> `src/hooks/prompt-advisor.e2e.test.ts` (65 cases); `hooks/test-bypass.sh` -> `src/bypass/bypass.e2e.test.ts` (27 cases, hook-side silencing plus CLI, `ENGINEOS_BYPASS_FLAG` pinned per case); `hooks/test-verify.sh` -> `src/hooks/stop-verify.e2e.test.ts` (22 cases x 2 transcript forms = 43 tests). Three shim-only cases stay as `spawnSync('bash', ...)`: kernel.sh delegation, the advisor no-jq PATH case, the Stop gate ancient-node infra skip. The six `.sh` suites are deleted; their six CI steps removed; CI now runs the dist drift guard before `npm test` so a stale bundle fails as drift, not as an e2e assertion. Pointers refreshed: `registries/policy.json` router note, `scripts/kernel.sh`, `evals/RUBRIC.md`, `hooks/test-agent-announce.sh`, `src/bypass/cli.test.ts`, `src/hooks/prompt-advisor*.ts`; README, `docs/COMPATIBILITY.md` (ported-suites row) and `docs/CONTRIBUTING.md` (Integrity Check contribution path now `src/checks/`, verification list) updated. `dist/engineos.cjs` unchanged (comment-only source edits).

## Verification
Run once at the end, after asking. `npm run typecheck` rc=0. `npm run build` rc=0, then `npm test` 1779/1779, 0 skipped, first run (364 new e2e tests). Remaining gate driver rc=0 for every step: build, drift (both gen guards clean), test-gen-agent-registry, evals, usage-report, validate (`passed 104, failed 0`), bench (route-intent 44.9ms, resolve-task 46.5ms, prompt-advisor 70.8ms, cache hit 91.6ms, always-on 27275 B — all within budget), test-exec-journal, test-telemetry, test-layout, test-docs, test-governance, test-agent-announce, test-post-edit, test-install-hooks. `dist/engineos.cjs` byte-identical after rebuild.

## Human decisions
2026-09-05 | Ricardo Fagmer | none fired | approved | Risk classified medium (reversible working-tree changes on a stacked branch, no external effect; test-only code plus CI step removal, validator and hook surfaces untouched), autonomy A2. User approved the full gate via AskUserQuestion. Prompt-advisor "high-risk"/router-escalation/spec-authoring hook notes were keyword matches on agent-report text, not this work; waived. No HITL reason from `registries/policy.json` applies.

## Changes registered
```
$ git status --short (before commit)
A .engineos/changes/2026-09-05-suites-wave6a.md
 M .github/workflows/ci.yml
 M README.md
 M docs/COMPATIBILITY.md
 M docs/CONTRIBUTING.md
 M evals/RUBRIC.md
 M hooks/test-agent-announce.sh
 D hooks/test-bypass.sh
 D hooks/test-prompt-advisor.sh
 D hooks/test-route.sh
 D hooks/test-verify.sh
 M registries/policy.json
 M scripts/kernel.sh
 D scripts/test-kernel.sh
 D scripts/test-validate-engineos.sh
 A src/bypass/bypass.e2e.test.ts
 M src/bypass/cli.test.ts
 M src/hooks/prompt-advisor-guidance.ts
 A src/hooks/prompt-advisor.e2e.test.ts
 M src/hooks/prompt-advisor.test.ts
 M src/hooks/prompt-advisor.ts
 A src/hooks/route-before-change.e2e.test.ts
 A src/hooks/stop-verify.e2e.test.ts
 A src/kernel/kernel-backpressure.e2e.test.ts
 A src/kernel/kernel-hitl.e2e.test.ts
 A src/kernel/kernel-policy-arms.e2e.test.ts
 A src/kernel/kernel-route-escalate.e2e.test.ts
 A src/kernel/kernel.e2e.test.ts
 A src/validate/validate.e2e.test.ts

$ git diff --stat HEAD (before commit, tail)
 29 files changed, 3540 insertions(+), 2240 deletions(-)

$ git log --oneline 8fb603b..HEAD
fd54112 ci: drop six ported suite steps, run the drift guard before npm test
bc0bb38 test(hooks): port test-verify.sh to node:test
8dfce23 test(bypass): port test-bypass.sh to node:test
2e2ec11 test(hooks): port test-prompt-advisor.sh to node:test
c9a8ebf test(hooks): port test-route.sh to node:test
96bf3db test(kernel): port test-kernel.sh to node:test
1b47b20 test(validate): port test-validate-engineos.sh to node:test
```
No renames; six `.sh` suites deleted outright.

## Notes
Six `general-purpose` agents (opus, MODE IMPLEMENT, none ran anything), one suite each, dispatched in one wave. No handoff written: Wave 6 continues in 6(b) on this stack; the Barrier 6 handoff lands with the last suite batch. Remaining for 6(b)/6(c): test-governance, test-layout, test-docs (source `hooks/layout-manifest.sh`/`docs-ledger.sh`, deleted with them), test-agent-announce, test-post-edit, test-exec-journal, test-telemetry, test-gen-agent-registry, test-install-hooks; then Task 58 (CI/installers final form) and Task 59 (docs, release notes 1.7.0). Sibling in-process kernel tests still carry `scripts/test-kernel.sh` provenance comments (harmless; sweep in 6(b)).
