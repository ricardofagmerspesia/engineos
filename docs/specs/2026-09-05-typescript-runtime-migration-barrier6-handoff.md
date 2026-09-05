# Handoff — TypeScript runtime migration, Barrier 6 (end of Wave 6(b))

> Written at a wave barrier (`rules/parallelism.md` step 6). Plan:
> `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`; design:
> `docs/specs/2026-09-04-typescript-runtime-migration-design.md`. Previous
> barrier: `docs/specs/2026-09-05-typescript-runtime-migration-barrier5-handoff.md`.

## Objective

Move the EngineOS runtime from bash + jq + python3 to a single TypeScript
bundle (`dist/engineos.cjs`, node >= 18) with every `scripts/*.sh` and
`hooks/*.sh` entry point reduced to a shim, byte-identical behaviour for every
consumer, and one test runner. Wave 6 (Tasks 42-59) ports the fifteen bash test
suites to `node:test` e2e files, deletes the bash libraries they sourced, and
then brings CI, the installers and the 1.7.0 release surface to their final
form.

## State

Tasks 42-57 are complete: all fifteen bash suites are ported to
`src/**/*.e2e.test.ts` and deleted, together with their CI steps. Wave 6(a)
(PR #64) ported six; this branch ports the remaining nine. `hooks/lib-common.sh`,
`hooks/lib-runner.sh` and `hooks/docs-ledger.sh` are deleted — nothing sourced
them any more — and `install.sh`'s `ENGINEOS_HOOK_LIBRARIES` is
`"layout-manifest.sh scaffold-layout.sh"`. Those two files stay as frozen bash:
`src/init/project.ts` requires them as siblings until 2.0. CI's bash is now
shellcheck, the validate shim, run-evals, bench and the secrets gates. Work sits
on stacked branches, unmerged: ... -> `feat/suites-wave6a` (PR #64) ->
`feat/suites-wave6b` (this barrier). Tasks 58-59 have not started.

Gate: validation — 4 of 4 per `rules/gates.md` (local rung: typecheck, `npm
test` including the nineteen e2e files, build, drift guards, validator, evals,
bench, shellcheck run once at the end; integration rung n/a: no external
dependency; pre-production and production rungs n/a: library, not a deployed
service)
Risk: medium — reversible working-tree changes on a stacked branch with no
external effect; the deleted libraries had no consumer outside the deleted
suites, and the `ENGINEOS_HOOK_LIBRARIES` value is consumer-visible only
through C30, which was updated in the same change (`rules/risk-autonomy.md`
contract-surface input; no shortcut floor hit)

## Done

- Nine suites ported 1:1 (one bash assertion site -> one test, bash order,
  bash failure message as the test name), each on its own commit:
  `test-exec-journal` (56), `test-telemetry` (16), `test-agent-announce` (24),
  `test-layout` (36), `test-docs` (15 sites -> 14 tests, one loop's two
  branches merged), `test-gen-agent-registry` (7), `test-install-hooks` (9),
  `test-governance` (15), `test-post-edit` (4). Evidence below.
- Two shim-only cases stay `spawnSync('bash', ...)` inside their e2e files
  (`telemetry.sh` under a node-free PATH; `ensure-project-layout.sh` under a
  jq-free PATH) because their claim is about the shim's environment.
- `install-hooks.e2e.test.ts` spawns the real `bash install.sh` against a fake
  `HOME`; the installer stays bash per the plan.
- Libraries deleted; C30 fixtures in `src/checks/runtime-surface-adoption.test.ts`
  now break `layout-manifest.sh` / `scaffold-layout.sh` instead.
- Docs repointed: README (announce row, docs-probe row), COMPATIBILITY (ported
  list, library and `ENGINEOS_HOOK_LIBRARIES` rows, gen paragraph),
  CONTRIBUTING (verification list), BIG-PICTURE (md + html integrity table),
  `registries/docs-ledger.json` note, comments in `layout-manifest.sh`,
  `scaffold-layout.sh`, `gen-agent-registry.sh`, `bypass.sh`, two test files.

## Decisions

- `hooks/layout-manifest.sh` and `hooks/scaffold-layout.sh` are NOT deleted,
  against the wave brief and Task 58's list. `engineos init` shells out to the
  frozen bash scaffold, which sources the manifest; deleting them breaks init.
  They remain the only two entries in `ENGINEOS_HOOK_LIBRARIES` until 2.0.
- Stateful bash flows (governance markers, install-over-install, telemetry
  appends) became independent tests that rebuild the state they assert on —
  except `install-hooks`, which keeps one outer test with nine ordered
  subtests because reinstall-over-existing IS the behaviour under test.
- `prose-layer.e2e.test.ts` reads its six lists from
  `registries/docs-ledger.json` (already the source of truth), never from the
  deleted `docs-ledger.sh`. Greps are reproduced line by line to keep grep's
  no-cross-newline semantics.
- `gen-agent-registry.e2e.test.ts` copies only `agents/` + `registries/` into
  the temp root instead of the whole checkout; the generator reads nothing else.
- Dated design/plan/handoff documents that name the deleted suites are left as
  historical record; only `2026-08-12-prose-layer-probes-design.md` (the probe's
  design of record) got a dated pointer to the new file.

## Files

| File | What changed and why |
|---|---|
| `src/journal/journal.e2e.test.ts` | port of `scripts/test-exec-journal.sh` |
| `src/journal/telemetry.e2e.test.ts` | port of `scripts/test-telemetry.sh` |
| `src/hooks/announce-agent.e2e.test.ts` | port of `hooks/test-agent-announce.sh` |
| `src/hooks/ensure-project-layout.e2e.test.ts` | port of `hooks/test-layout.sh` |
| `src/docs/prose-layer.e2e.test.ts` | port of `hooks/test-docs.sh` |
| `src/gen/gen-agent-registry.e2e.test.ts` | port of `scripts/test-gen-agent-registry.sh` |
| `src/install/install-hooks.e2e.test.ts` | port of `hooks/test-install-hooks.sh` |
| `src/hooks/governance.e2e.test.ts` | port of `hooks/test-governance.sh` |
| `src/hooks/post-edit-check.e2e.test.ts` | port of `hooks/test-post-edit.sh` |
| nine `hooks/test-*.sh` / `scripts/test-*.sh` | deleted |
| `hooks/lib-common.sh`, `hooks/lib-runner.sh`, `hooks/docs-ledger.sh` | deleted, no consumer left |
| `install.sh` | `ENGINEOS_HOOK_LIBRARIES` shrinks to the two frozen scaffold files |
| `.github/workflows/ci.yml` | nine bash-suite steps removed |
| `src/checks/runtime-surface-adoption.test.ts` | C30 fixtures use the surviving libraries |
| `src/checks/runtime-surface-modes.ts`, `hooks/bypass.sh`, `hooks/layout-manifest.sh`, `hooks/scaffold-layout.sh`, `scripts/gen-agent-registry.sh`, `src/gen/agent-registry.test.ts`, `src/hooks/mark-unrecorded.test.ts` | comments repointed |
| `README.md`, `docs/COMPATIBILITY.md`, `docs/CONTRIBUTING.md`, `docs/BIG-PICTURE.md`, `docs/BIG-PICTURE.html`, `registries/docs-ledger.json`, `docs/specs/2026-08-12-prose-layer-probes-design.md` | prose repointed |

## Evidence

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

## Known failures and open risks

- `post-edit-check.e2e.test.ts` case A shells out to `npx --no-install eslint
  --version` (inherited verbatim); it stays green only while no eslint resolves
  globally on the runner.
- `install-hooks.e2e.test.ts` runs the real `install.sh`, which `chmod +x`es
  `hooks/*.sh` in the checkout; a tracked mode difference would show as
  ` M hooks/...` after `npm test`.
- Carried from Barrier 5: `isExecutable` duplicated between
  `runtime-governance-shared.ts` and `runtime-surface-fs.ts`;
  `Registries.capabilities`/`agents` untyped; provenance comments in
  `src/kernel/*.test.ts` still name `scripts/test-kernel.sh`.
- The stack is 18 unmerged PRs deep (#47-#64 plus this one); each PR's base is
  the previous branch.

## Not done

- [ ] Task 58 — CI and installers final form: drop `jq` from the "Tools
      present" CI step, keep shellcheck for `install.sh` and the shims.
- [ ] Task 59 — release surface: COMPATIBILITY shim rows (deprecated 1.7.0,
      removed 2.0), `docs/release-notes/1.7.0.md` via the `release-notes`
      skill, README/ADOPTION prerequisites, the `CLAUDE.md` "hooks need jq"
      paragraph (already says node; confirm C23/C22c mirrors), `plugin.json`
      and `marketplace.json` version 1.7.0, human release gate.
- [ ] Manual Windows run of `install.ps1` (carried from Barrier 3).

## Next step

Cut `feat/release-wave6c` from this branch's head and do Task 58 first: edit
`.github/workflows/ci.yml` "Tools present" to check `node >= 18` and
`shellcheck` only, then Task 59 in the same branch.

## Resume

```bash
# exact commands to get back to a working state
git checkout feat/suites-wave6b
npm ci
npm run typecheck && npm test
npm run build && node dist/engineos.cjs validate
```
