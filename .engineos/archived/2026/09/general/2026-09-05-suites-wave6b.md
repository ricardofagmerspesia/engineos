---
name: 2026-09-05-suites-wave6b
status: done
completed: 2026-09-05
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 6(b) of the TypeScript runtime migration (plan Tasks 42-57, second batch): the nine remaining bash suites port to `node:test` e2e files — `hooks/test-exec-journal.sh`, `test-agent-announce.sh`, `test-layout.sh`, `test-docs.sh`, `scripts/test-gen-agent-registry.sh`, `hooks/test-install-hooks.sh`, `scripts/test-telemetry.sh`, `hooks/test-governance.sh`, `hooks/test-post-edit.sh`. Each `.sh` suite and its CI step are deleted. With the last suites that source them gone, `hooks/lib-common.sh`, `hooks/lib-runner.sh` and `hooks/docs-ledger.sh` are deleted and `install.sh`'s `ENGINEOS_HOOK_LIBRARIES` shrinks; `hooks/layout-manifest.sh` and `hooks/scaffold-layout.sh` stay (sourced by the frozen bash scaffold `engineos init` requires as siblings).

## Why
Plan Wave 6: after this batch no bash test suite remains; CI's bash steps reduce to shellcheck, the installer and the shims, clearing Task 58.

## Scope
Nine `*.e2e.test.ts` files, nine deleted suites, three deleted libraries, `install.sh` (library list), `.github/workflows/ci.yml` (nine steps removed), `hooks/bypass.sh` (comment), README/COMPATIBILITY where they name the suites or libraries, `dist/engineos.cjs` if a source file changes.

## Checklist
- [x] Wave 1 agents: exec-journal, agent-announce, layout, docs, gen-agent-registry, install-hooks
- [x] Wave 2 agents: telemetry, governance, post-edit
- [x] `.sh` suites deleted; CI steps removed; gate driver updated
- [x] `lib-common.sh`, `lib-runner.sh`, `docs-ledger.sh` deleted; `ENGINEOS_HOOK_LIBRARIES` shrunk; C30 green
- [x] Docs naming suites/libraries updated; Barrier 6 handoff
- [x] Final gate run once at the end

## What was made
Nine bash suites ported 1:1 to `node:test` e2e files (one bash assertion site -> one test, bash order, bash failure message as the test name) and deleted with their CI steps: `test-exec-journal` (56) -> `src/journal/journal.e2e.test.ts`; `test-telemetry` (16, one shim case stays bash) -> `src/journal/telemetry.e2e.test.ts`; `test-agent-announce` (24) -> `src/hooks/announce-agent.e2e.test.ts`; `test-layout` (36, one shim case stays bash) -> `src/hooks/ensure-project-layout.e2e.test.ts`; `test-docs` (15 sites -> 14 tests) -> `src/docs/prose-layer.e2e.test.ts`; `test-gen-agent-registry` (7) -> `src/gen/gen-agent-registry.e2e.test.ts`; `test-install-hooks` (9, spawns the real `bash install.sh`) -> `src/install/install-hooks.e2e.test.ts`; `test-governance` (15) -> `src/hooks/governance.e2e.test.ts`; `test-post-edit` (4) -> `src/hooks/post-edit-check.e2e.test.ts`. No bash test suite remains; test count 1779 -> 1961.

`hooks/lib-common.sh`, `hooks/lib-runner.sh` and `hooks/docs-ledger.sh` deleted (no consumer left). `install.sh` `ENGINEOS_HOOK_LIBRARIES` is now `"layout-manifest.sh scaffold-layout.sh"`; the C30 fixtures in `src/checks/runtime-surface-adoption.test.ts` break those two files instead. Deviation from the brief: `layout-manifest.sh` and `scaffold-layout.sh` are kept because `src/init/project.ts` requires them as frozen bash siblings until 2.0.

Docs repointed: README (announce row, docs-probe row), COMPATIBILITY (ported list of all fifteen, library and `ENGINEOS_HOOK_LIBRARIES` rows, gen paragraph), CONTRIBUTING verification list, BIG-PICTURE md + html integrity table, `registries/docs-ledger.json` note, dated pointer in `docs/specs/2026-08-12-prose-layer-probes-design.md`, comments in `layout-manifest.sh`, `scaffold-layout.sh`, `gen-agent-registry.sh`, `bypass.sh`, `runtime-surface-modes.ts`, `agent-registry.test.ts`, `mark-unrecorded.test.ts`. Barrier 6 handoff: `docs/specs/2026-09-05-typescript-runtime-migration-barrier6-handoff.md`. Nine `general-purpose` agents (model opus, MODE IMPLEMENT) wrote the e2e files in two waves (6 + 3); wave 1 was redispatched once after a 429 killed all six (transient, retry once, same model). `dist/engineos.cjs` unchanged (comment-only source edits).

## Verification
Run once at the end, after asking (user picked "Yes, full gate"):

```
$ npm run typecheck          -> rc=0
$ npm run -s build           -> rc=0, dist/engineos.cjs unchanged (comment-only source edits)
$ npm test                   -> tests 1961 pass 1961 fail 0 skipped 0
  (first execution of the nine new e2e files; green on the first run)
$ gate driver, 2026-09-05:
rc=0 :: build
rc=0 :: drift                 commands/agents and registries/agents.json clean
rc=0 :: evals
rc=0 :: usage-report
rc=0 :: validate              passed 104, failed 0 (62 checks; C30 green with
                              ENGINEOS_HOOK_LIBRARIES="layout-manifest.sh scaffold-layout.sh")
rc=0 :: bench
rc=0 :: shellcheck            hooks/*.sh install.sh scripts/*.sh, no output

bench (Barrier 6, warm medians):
ok   route-intent: median=44.8ms budget<250.0ms
ok   resolve-task: median=48.4ms budget<500.0ms
ok   prompt-advisor (end to end): median=71.8ms budget<600.0ms
ok   route-before-change (cache hit): median=91.4ms budget<150.0ms
ok   always-on context: 27275 bytes budget<32000 bytes
```

## Human decisions
| 2026-09-05 | Ricardo Fagmer | (none fired) | approved | Risk classified medium (reversible working-tree changes on a stacked branch, no external effect, test-only code plus dead-library deletion), autonomy A2. The prompt advisor's `high-risk` announcements were keyword matches on agent-report text, not on this work; no `hitl.reasons` id fired. User approved running the full gate at the end via AskUserQuestion. |

## Changes registered
```
$ git status --short   (before commits)
 M .github/workflows/ci.yml
 M README.md
 M docs/BIG-PICTURE.html
 M docs/BIG-PICTURE.md
 M docs/COMPATIBILITY.md
 M docs/CONTRIBUTING.md
 M docs/specs/2026-08-12-prose-layer-probes-design.md
 A docs/specs/2026-09-05-typescript-runtime-migration-barrier6-handoff.md
 M hooks/bypass.sh
 D hooks/docs-ledger.sh
 M hooks/layout-manifest.sh
 D hooks/lib-common.sh
 D hooks/lib-runner.sh
 M hooks/scaffold-layout.sh
 D hooks/test-agent-announce.sh
 D hooks/test-docs.sh
 D hooks/test-governance.sh
 D hooks/test-install-hooks.sh
 D hooks/test-layout.sh
 D hooks/test-post-edit.sh
 M install.sh
 M registries/docs-ledger.json
 M scripts/gen-agent-registry.sh
 D scripts/test-exec-journal.sh
 D scripts/test-gen-agent-registry.sh
 D scripts/test-telemetry.sh
 M src/checks/runtime-surface-adoption.test.ts
 M src/checks/runtime-surface-modes.ts
 A src/docs/prose-layer.e2e.test.ts
 M src/gen/agent-registry.test.ts
 A src/gen/gen-agent-registry.e2e.test.ts
 A src/hooks/announce-agent.e2e.test.ts
 A src/hooks/ensure-project-layout.e2e.test.ts
 A src/hooks/governance.e2e.test.ts
 M src/hooks/mark-unrecorded.test.ts
 A src/hooks/post-edit-check.e2e.test.ts
 A src/install/install-hooks.e2e.test.ts
 A src/journal/journal.e2e.test.ts
 A src/journal/telemetry.e2e.test.ts
?? .engineos/changes/2026-09-05-suites-wave6b.md

$ git diff --stat HEAD   (tail)
 src/journal/journal.e2e.test.ts                    | 579 +++++++++++++++++++++
 src/journal/telemetry.e2e.test.ts                  | 270 ++++++++++
 39 files changed, 3258 insertions(+), 2191 deletions(-)

$ git log --oneline 82beebd..HEAD
ad0f60b docs: repoint prose to the e2e suites; Barrier 6 handoff
e499d62 chore(hooks): delete sourced bash libraries with no consumer left
e15a1a7 ci: drop the nine ported bash-suite steps
1ecfac6 test(hooks): port test-post-edit.sh to node:test
d48b2fc test(hooks): port test-governance.sh to node:test
34d34fb test(install): port test-install-hooks.sh to node:test
6b909fb test(gen): port test-gen-agent-registry.sh to node:test
a796136 test(docs): port test-docs.sh to node:test
4eb5c47 test(hooks): port test-layout.sh to node:test
61dcef0 test(hooks): port test-agent-announce.sh to node:test
25f2c19 test(journal): port test-telemetry.sh to node:test
f33cf73 test(journal): port test-exec-journal.sh to node:test
```

## Notes
- Base: `feat/suites-wave6a` head 82beebd (PR #64). PR over the 400-line guideline: nine new test files plus nine deleted suites and three deleted libraries; one commit per suite so it can be split on request.
- Follow-ups carried to Barrier 6 handoff: `post-edit-check.e2e.test.ts` case A depends on no global eslint; `install-hooks.e2e.test.ts` chmods `hooks/*.sh` in the checkout; `isExecutable` duplication; `Registries.capabilities`/`agents` untyped; `src/kernel/*.test.ts` provenance comments.
- Next: Wave 6(c) = Task 58 (CI/installers final form) + Task 59 (1.7.0 release surface).
