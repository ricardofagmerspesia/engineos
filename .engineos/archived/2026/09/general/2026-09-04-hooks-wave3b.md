---
name: 2026-09-04-hooks-wave3b
status: done
completed: 2026-09-05
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 3(b) of the TypeScript runtime migration: the nine hooks and `init` move from bash onto the node runtime (plan Tasks 18-26). Each `hooks/<name>.sh` becomes a four-line shim that execs `dist/engineos.cjs hook <name>`; the behaviour lives in `src/hooks/<name>.ts` behind one `run(env, ctx): HookDecision` seam, and the self-integrity checks that grepped the bash files are re-pointed at the TS sources.

## Why
Plan `docs/specs/2026-09-04-typescript-runtime-migration-plan.md` Tasks 18-26. Wave 3(a) shipped the library (envelope, output, bypass, telemetry, scaffold, runner, classifier, cache); the hooks are its only callers, and until they move every hook still needs `jq`, duplicates the telemetry gate, and cannot be unit-tested in-process.

## Scope
`src/hooks/{cli,ensure-project-layout,mark-unrecorded,record-verify,route-before-change,prompt-advisor,prompt-advisor-guidance,announce-agent-dispatch,announce-agent-return,stop-verify,post-edit-check,verify-targets}.ts` + tests, `src/hooks/scaffold-equivalence.test.ts`, `src/init/{cli,project}.ts` + test, `src/registry/agents.ts` + test, `src/hooks/envelope.ts` (root = EngineOS checkout), `src/cli.ts` (hook/init arms), shims `hooks/{ensure-project-layout,mark-unrecorded,record-verify,route-before-change,prompt-advisor,announce-agent-dispatch,announce-agent-return,stop-verify,post-edit-check}.sh`, `scripts/init-project.sh`, bash suites `hooks/test-{layout,prompt-advisor,agent-announce,verify,post-edit}.sh` where an assertion could not hold on the node runtime, `registries/policy.json` (`written_by` lists, verify event keys), `scripts/checks/*.sh` re-points, `scripts/test-validate-engineos.sh` canaries, `README.md`, `dist/engineos.cjs`, and the mislaid 3(a) record moved to the archive.

## Checklist
- [x] Task 18: ensure-project-layout + Task 26: init-project on the runtime (scaffold equivalence test)
- [x] Tasks 19-20: mark-unrecorded + record-verify
- [x] Task 21: route-before-change (route cache, two git calls per fire)
- [x] Task 22: prompt-advisor (in-process resolve-task, router span, hitl event)
- [x] Tasks 23-24: announce-agent-dispatch/return + agents registry reader
- [x] Task 25: stop-verify + post-edit-check + verify-targets
- [x] Wave B2: checks C1 prose, C18f, C20d, C22c, C27c, C29 re-pointed; policy.json written_by; canaries; README
- [x] `src/hooks/cli.ts` adapter + `src/cli.ts` arms; `dist/engineos.cjs` rebuilt
- [x] 3(a) record moved to `.engineos/archived/2026/09/general/`
- [x] Final gate run once at the end

## What was made
- Nine hooks run on the node runtime behind one seam, `run(env: HookEnvelope, ctx: HookContext): HookDecision`, dispatched by `src/hooks/cli.ts` (`engineos hook <name>`): ensure-project-layout, mark-unrecorded, record-verify, route-before-change, prompt-advisor (+ guidance builders), announce-agent-dispatch, announce-agent-return, stop-verify (+ verify-targets), post-edit-check. Every `hooks/<name>.sh` is a four-line shim that exports `ENGINEOS_ROOT` and execs `dist/engineos.cjs hook <name>`.
- `engineos init` (`src/init/project.ts`, `scripts/init-project.sh` shim) shares `src/hooks/scaffold.ts` with the SessionStart hook; `scaffold-equivalence.test.ts` pins both against `registries/layout-manifest.json`.
- `src/registry/agents.ts` replaces the jq/`head -1` tier lookup with the same first-row-with-a-tier semantics; `HookContext.root` is the EngineOS checkout (`resolveRoot`, honours `ENGINEOS_ROOT`), hooks derive the project root from the payload cwd.
- prompt-advisor calls the kernel's resolve-task projection in-process (no `kernel.sh` spawn) and writes the `router` span plus `route` / `decision-rules` / `hitl` events; the announce pair opens/closes the `agent` span with the structural status floor; stop-verify writes the `verification` span and `verify` event (keys gained `situation`, `reason`), asks `src/kernel/repair` for its block reason, and closes a timeout-only ladder `DEGRADED`.
- 13 unit test files, 197 new node:test cases (601 -> 798). Bash suites adjusted only where an assertion could not hold on node: test-layout.sh (3 sites), test-prompt-advisor.sh (no-jq case now proves jq is not a dependency), test-verify.sh (case 11 compares the reason against `kernel.sh repair`; case 18 reads budgets from the TS).
- Checks C1, C18f, C20d, C22c, C27c, C29 re-pointed at the TS sources and their telemetry idioms (`event(sink, '<id>'`, `withSpan`/`openSpan`/`closeSpan`, `kind: '<kind>'`); 11 canaries re-pointed, 2 added (C18f TS half, C29 init import), C27b length-bound canary matches the esbuild-suffixed identifier by pattern. `registries/policy.json` writer rosters, `written_by_helper`, repair/telemetry/hitl notes name `src/hooks/*.ts`. CLAUDE.md, README, `rules/observability.md`, `docs/{ADOPTION,BIG-PICTURE,COMPATIBILITY}.md` stop claiming the hooks need jq.
- `dist/engineos.cjs` rebuilt. The 3(a) record, committed to `.engineos/changes/` by mistake, moved to the archive.

## Verification
Final gate run once, 2026-09-05, after all units integrated:
- `npm run typecheck` rc=0 (after removing a five-line leftover from the rewritten hookContext test).
- `npm test` 798/798 pass, 0 fail.
- `npm run build` rc=0.
- Bash suites (driver `run.sh`, each once): test-route 41/0, test-kernel 334/0, validate-engineos 104/0, test-prompt-advisor 65/0, bench-runtime all budgets ok (route-intent 41.3ms <250, resolve-task 42.7ms <500, prompt-advisor e2e 68.2ms <600, route-before-change cache hit 84.0ms <150, always-on context 27275 B <32000), test-exec-journal 56/0, test-telemetry 16/0, test-layout 36/0, test-docs 190/0, test-governance 15/0, test-verify 22/0, test-bypass 27/0, test-agent-announce 28/0, test-post-edit 4/0, test-install-hooks 7/0.
- `scripts/test-validate-engineos.sh` first run 140/1: "the length bound no longer enforced on append is caught" — the canary's sed literal `text.length > maxLength` no longer matched because esbuild renamed the local to `text2` once the bundle gained more modules using `text`. Fixed the canary to match `text[0-9]*` and re-ran: 141/0. `dist/engineos.cjs` confirmed byte-identical after the run.

## Human decisions
- 2026-09-04 | Ricardo Fagmer | none required | approved | risk classified medium (reversible working-tree changes, no external effect, no data, hook contracts preserved); autonomy A2. The prompt advisor's keyword `high-risk` HITL matches on agent-report text were noise, not a classified tier. Gate run and PR approved via "Yes, full gate".

## Changes registered
`git status --short` before the layered commits:
```
R  .engineos/changes/2026-09-04-hooks-wave3a.md -> .engineos/archived/2026/09/general/2026-09-04-hooks-wave3a.md
 M CLAUDE.md
 M README.md
 M dist/engineos.cjs
 M docs/ADOPTION.md
 M docs/BIG-PICTURE.md
 M docs/COMPATIBILITY.md
 M hooks/announce-agent-dispatch.sh
 M hooks/announce-agent-return.sh
 M hooks/ensure-project-layout.sh
 M hooks/mark-unrecorded.sh
 M hooks/post-edit-check.sh
 M hooks/prompt-advisor.sh
 M hooks/record-verify.sh
 M hooks/route-before-change.sh
 M hooks/stop-verify.sh
 M hooks/test-layout.sh
 M hooks/test-prompt-advisor.sh
 M hooks/test-verify.sh
 M registries/policy.json
 M rules/observability.md
 M scripts/checks/10-rules.sh
 M scripts/checks/50-kernel.sh
 M scripts/checks/70-runtime.sh
 M scripts/checks/lib.sh
 M scripts/init-project.sh
 M scripts/test-validate-engineos.sh
 M src/cli.ts
 M src/hooks/envelope.test.ts
 M src/hooks/envelope.ts
 M src/hooks/output.ts
?? .engineos/changes/2026-09-04-hooks-wave3b.md
?? src/hooks/announce-agent-dispatch.test.ts
?? src/hooks/announce-agent-dispatch.ts
?? src/hooks/announce-agent-return.test.ts
?? src/hooks/announce-agent-return.ts
?? src/hooks/cli.ts
?? src/hooks/ensure-project-layout.test.ts
?? src/hooks/ensure-project-layout.ts
?? src/hooks/mark-unrecorded.test.ts
?? src/hooks/mark-unrecorded.ts
?? src/hooks/post-edit-check.test.ts
?? src/hooks/post-edit-check.ts
?? src/hooks/prompt-advisor-guidance.ts
?? src/hooks/prompt-advisor.test.ts
?? src/hooks/prompt-advisor.ts
?? src/hooks/record-verify.test.ts
?? src/hooks/record-verify.ts
?? src/hooks/route-before-change.test.ts
?? src/hooks/route-before-change.ts
?? src/hooks/scaffold-equivalence.test.ts
?? src/hooks/stop-verify.test.ts
?? src/hooks/stop-verify.ts
?? src/hooks/verify-targets.test.ts
?? src/hooks/verify-targets.ts
?? src/init/
?? src/registry/agents.test.ts
?? src/registry/agents.ts
```
`git diff --stat HEAD` (same point):
```
.../2026/09/general}/2026-09-04-hooks-wave3a.md    |    0
 .engineos/changes/2026-09-04-hooks-wave3b.md       |   43 +
 CLAUDE.md                                          |   15 +-
 README.md                                          |    6 +-
 dist/engineos.cjs                                  | 1816 +++++++++++++++++++-
 docs/ADOPTION.md                                   |    6 +-
 docs/BIG-PICTURE.md                                |   28 +-
 docs/COMPATIBILITY.md                              |   42 +-
 hooks/announce-agent-dispatch.sh                   |   41 +-
 hooks/announce-agent-return.sh                     |   79 +-
 hooks/ensure-project-layout.sh                     |   98 +-
 hooks/mark-unrecorded.sh                           |   53 +-
 hooks/post-edit-check.sh                           |   83 +-
 hooks/prompt-advisor.sh                            |  120 +-
 hooks/record-verify.sh                             |   36 +-
 hooks/route-before-change.sh                       |  131 +-
 hooks/stop-verify.sh                               |  205 +--
 hooks/test-layout.sh                               |   22 +-
 hooks/test-prompt-advisor.sh                       |   19 +-
 hooks/test-verify.sh                               |   54 +-
 registries/policy.json                             |   24 +-
 rules/observability.md                             |    2 +-
 scripts/checks/10-rules.sh                         |   16 +-
 scripts/checks/50-kernel.sh                        |    9 +-
 scripts/checks/70-runtime.sh                       |  174 +-
 scripts/checks/lib.sh                              |    5 +
 scripts/init-project.sh                            |  117 +-
 scripts/test-validate-engineos.sh                  |   65 +-
 src/cli.ts                                         |    4 +-
 src/hooks/announce-agent-dispatch.test.ts          |  109 ++
 src/hooks/announce-agent-dispatch.ts               |   81 +
 src/hooks/announce-agent-return.test.ts            |  303 ++++
 src/hooks/announce-agent-return.ts                 |  111 ++
 src/hooks/cli.ts                                   |   54 +
 src/hooks/ensure-project-layout.test.ts            |  218 +++
 src/hooks/ensure-project-layout.ts                 |  191 ++
 src/hooks/envelope.test.ts                         |   31 +-
 src/hooks/envelope.ts                              |   14 +-
 src/hooks/mark-unrecorded.test.ts                  |  165 ++
 src/hooks/mark-unrecorded.ts                       |   67 +
 src/hooks/output.ts                                |    8 +-
 src/hooks/post-edit-check.test.ts                  |  274 +++
 src/hooks/post-edit-check.ts                       |  126 ++
 src/hooks/prompt-advisor-guidance.ts               |  129 ++
 src/hooks/prompt-advisor.test.ts                   |  372 ++++
 src/hooks/prompt-advisor.ts                        |  121 ++
 src/hooks/record-verify.test.ts                    |  162 ++
 src/hooks/record-verify.ts                         |   45 +
 src/hooks/route-before-change.test.ts              |  203 +++
 src/hooks/route-before-change.ts                   |  244 +++
 src/hooks/scaffold-equivalence.test.ts             |  160 ++
 src/hooks/stop-verify.test.ts                      |  425 +++++
 src/hooks/stop-verify.ts                           |  282 +++
 src/hooks/verify-targets.test.ts                   |  159 ++
 src/hooks/verify-targets.ts                        |  162 ++
 src/init/cli.ts                                    |   22 +
 src/init/project.test.ts                           |  202 +++
 src/init/project.ts                                |  222 +++
 src/registry/agents.test.ts                        |   71 +
 src/registry/agents.ts                             |   67 +
 60 files changed, 6901 insertions(+), 1212 deletions(-)
```
`git log --oneline d63129c..HEAD`:
```
9dc7727 build: rebuild dist/engineos.cjs for the ported hooks
c0359da chore(checks): re-point self-integrity checks at the node hooks
3708a63 refactor(hooks): port stop-verify and post-edit-check to the node runtime
d8d5671 refactor(hooks): port prompt-advisor and the announce pair to the node runtime
a25ac48 refactor(init): port init-project to the node runtime
2343ad9 refactor(hooks): port layout, governance and route hooks to the node runtime
e9f7ab8 refactor(hooks): add the hook adapter and root the context at the EngineOS checkout
```
Rename: `.engineos/changes/2026-09-04-hooks-wave3a.md -> .engineos/archived/2026/09/general/2026-09-04-hooks-wave3a.md` (closing commit).

## Notes
- Three wave-B1 agents (advisor, announce, verify) were killed by an API rate limit mid-task; their partial files were complete on disk and fresh finish agents audited and closed the test gaps rather than rewriting.
- Deviations from the plan text: no `src/kernel/resolve-task.ts` exists — the projection is `resolveTaskProjection` in `src/kernel/cli.ts`; the announce hooks infer no mode and filter no tool (hooks.json's matcher does that, as in bash); `src/registry/agents.ts` reads `registries/agents.json`, not frontmatter, and exposes no alias (none is consumed).
- Not done, carried to 3(c)/Task 27: `hooks/lib-common.sh`, `hooks/lib-runner.sh`, `hooks/scaffold-layout.sh`, `hooks/layout-manifest.sh`, `hooks/docs-ledger.sh` are sourced by nothing live (only `hooks/test-*.sh` and install.sh's `ENGINEOS_HOOK_LIBRARIES`, pinned by C30); `install.sh:340` and `install.ps1:442-456` still claim jq is every hook's dependency; `registries/{agents,decision-rules,intents,layout-manifest}.json` notes still name `hooks/*.sh` as entry points (true until hooks.json moves to node commands).
- Residual risk: stop-verify derives the node major from `process.versions.node`, so the `node-too-old` rung is unreachable through the CLI (the entry guard refuses below 18 first) — covered by injection in unit tests only. `hooks/test-verify.sh` case 16 now proves only that the shim emits no decision under an unusable fake node. The stop gate always renders the first-red repair rung (`attempt: 1`); the bound-exhausted text lives in the kernel and is exercised there. `announce-agent-return.test.ts` (303 lines) and `stop-verify.test.ts` (424) exceed the ~300-line guideline.
- Plan Task-22 row is stale (names a module that does not exist) — one-line spec correction owed when the plan is next touched.
