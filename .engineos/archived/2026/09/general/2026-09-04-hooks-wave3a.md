---
name: 2026-09-04-hooks-wave3a
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 3(a) of the TypeScript runtime migration: the hook library (plan Tasks 16 and 17) — envelope, decision output, bypass, the telemetry span lifecycle, scaffold, runner, the situation classifier, the route cache, and the layout/docs manifests as JSON registries. The eight hooks, `init`, `settings-merge` and the installers follow in 3(b)-3(d).

## Why
Plan `docs/specs/2026-09-04-typescript-runtime-migration-plan.md` Tasks 16-27. The hooks are the last bash consumers of the kernel and journal ported in Waves 1-2; until they move, every hook still needs `jq` and reimplements the telemetry gate, slug classes and id derivation in five places.

## Scope
`src/hooks/{envelope,output,bypass,telemetry,span-writer,scaffold,runner,classify-failure,cache}.ts` + tests, `src/lib/{git,slug,time}.ts` + tests, `src/registry/capabilities.ts` + literal unions on `models.ts`, `policy-exec-journal.ts`, `policy-telemetry.ts`, `src/cli.ts` (node-guard skip branch), `registries/{layout-manifest,docs-ledger}.json`, `hooks/{layout-manifest,docs-ledger}.sh`, `hooks/test-lib-common.sh` (deleted), `.github/workflows/ci.yml`, `scripts/checks/70-runtime.sh` (C27f deleted), `scripts/test-validate-engineos.sh`, `README.md`, `dist/engineos.cjs`.

## Checklist
- [x] Task 16: hook library part 1 (envelope, output, bypass, telemetry, git/slug/time) + node-guard skip re-point + C27f deleted + test-lib-common.sh replaced
- [x] Task 17: hook library part 2 (scaffold, runner, classifier, cache, manifests as JSON)
- ~~Tasks 18-25, 26, 27, Barrier 3 handoff~~ — moved to the 3(b)-3(d) records; this record closes the library only
- [x] Final gate run once at the end

## What was made
- `src/hooks/envelope.ts` (`HookEnvelope`, `readEnvelope` -> null on a non-object payload, `hookContext`), `src/hooks/output.ts` (`HookDecision` union silent/context/block/message/fail, the five constructors, `render` as the single stdout/exit-code writer, `HookContext`; imports only types), `src/hooks/bypass.ts` (`bypassMarker`, `bypassActive`: env > flag file > repo marker), `src/lib/git.ts` (`gitDir`, `repoRoot`, `findUp`, `findUpFile`). `src/cli.ts`'s node-guard `skip` branch renders `message(...)` through `render` instead of an inline `writeJson`.
- `src/hooks/telemetry.ts` + `src/hooks/span-writer.ts`: the span lifecycle from the design — `telemetrySink(env, ctx, { bypassed })` decides the opt-in gate once (`.engineos/` at the working-tree root, `ENGINEOS_TELEMETRY != 0`, not bypassed) and returns null otherwise; `withSpan`, `spanIdFrom` (tool_use_id else sha1 of `type:description`, 12 hex, slugged), `openSpan`/`closeSpan` over start markers, `event` refusing keys outside the registry's declared keys. `SpanWriter` seam with a file adapter (through `journal/appendLine` and `journal/telemetry.appendEvent`, so line formats are unchanged) and a memory adapter for tests. `src/lib/slug.ts` (`hookSlug` byte-level like `tr -c`, `hookPathSlug`), `src/lib/time.ts` (`nowMs`, `plausibleMs`, `parseMs`, `clampMs`).
- Literal unions pinned to their registries by tests: `CapabilityId` (`src/registry/capabilities.ts`, new loader), `ModelTierId` (`models.ts`), `SpanKind`/`SpanStatus` (`policy-exec-journal.ts`), `TelemetryEventId` (`policy-telemetry.ts`). `check_C27f` deleted (deviation 6: a wrong capability id is a compile error); its self-test case removed; README count 63 -> 62.
- `src/hooks/scaffold.ts` (`loadLayoutManifest`, `scaffoldLayout`: lstat per component, refuses symlinks and `..`, mkdir one level at a time), `src/hooks/runner.ts` (`runnerSelect`, `runnerHandle`, `runnerHasTarget`, `runnerRun` with spawnSync timeout, `runnerEnv` = the one node-20 PATH fix; `SpawnSyncLike` injection type), `src/hooks/classify-failure.ts` (`SITUATIONS` pinned to `policy.repair.by_situation`; the ordered verdict table incl. deviation 7 timeout -> infra), `src/hooks/cache.ts` (`routeCachePaths`).
- `registries/layout-manifest.json` and `registries/docs-ledger.json` are the data form of the two sourced bash libraries; `hooks/layout-manifest.sh` and `hooks/docs-ledger.sh` read them with jq and keep the literal as the jq-free fallback (the literal is also read by `scripts/init-project.sh`'s sed until Task 26).
- `hooks/test-lib-common.sh` (11 assertions, not the plan's 13) replaced by `envelope/output/bypass/telemetry.test.ts`; its CI step removed.
- Orchestrator fixes after the parallel wave: `SpawnSyncLike` default bound through a utf8 wrapper and `error?: Error | undefined` (exactOptionalPropertyTypes); `lstatOrNull` typed `Stats | null`.

## Verification
Run once at the end, after asking (user: "Yes, full gate").
- `npm run typecheck`: 5 errors on first run (runner.ts x3, scaffold.ts x2), fixed, then 0.
- `npm test`: `# tests 601 / # pass 601 / # fail 0`.
- `npm run build`: rc 0, `dist/engineos.cjs` rebuilt.
- `hooks/test-route.sh` pass=41 fail=0; `scripts/test-kernel.sh` passed 334; `hooks/test-prompt-advisor.sh` 65 passed; `scripts/test-exec-journal.sh` rc 0; `scripts/test-telemetry.sh` rc 0; `hooks/test-layout.sh` pass=35; `hooks/test-docs.sh` pass=190; `hooks/test-governance.sh`, `test-verify.sh`, `test-bypass.sh`, `test-agent-announce.sh`, `test-post-edit.sh`, `test-install-hooks.sh` all rc 0.
- `scripts/validate-engineos.sh`: passed 104, failed 0 (105 - C27f).
- `scripts/test-validate-engineos.sh`: passed 139, failed 0 (140 - the C27f case).
- `scripts/bench-runtime.sh`: route-intent 41.1ms (<250), resolve-task 40.9ms (<500), prompt-advisor e2e 274.8ms (<600), route-before-change cache hit 59.1ms (<150), always-on context 27223 bytes (<32000).

## Human decisions
None fired. Risk classified medium (reversible working-tree changes on a stacked branch, no external effect, no data, internal contract surface). The prompt advisor's `high-risk` announcement came from keyword matches on agent report text ("deleted", "DDL"-shaped words), not from the work; no hitl reason applies. The gate ran on the user's "Yes, full gate" answer.

## Changes registered
```
$ git status --short
 M .github/workflows/ci.yml
 M README.md
 M dist/engineos.cjs
 M hooks/docs-ledger.sh
 M hooks/layout-manifest.sh
 D hooks/test-lib-common.sh
 M scripts/checks/70-runtime.sh
 M scripts/test-validate-engineos.sh
 M src/cli.ts
 M src/registry/models.test.ts
 M src/registry/models.ts
 M src/registry/policy-exec-journal.ts
 M src/registry/policy-telemetry.ts
?? .engineos/changes/2026-09-04-hooks-wave3a.md
?? registries/docs-ledger.json
?? registries/layout-manifest.json
?? src/hooks/
?? src/lib/git.test.ts
?? src/lib/git.ts
?? src/lib/slug.test.ts
?? src/lib/slug.ts
?? src/lib/time.test.ts
?? src/lib/time.ts
?? src/registry/capabilities.test.ts
?? src/registry/capabilities.ts
?? src/registry/policy-exec-journal.test.ts
?? src/registry/policy-telemetry.test.ts
```
```
$ git diff --stat feat/journal-wave2..HEAD
 .github/workflows/ci.yml                 |   3 -
 README.md                                |   2 +-
 dist/engineos.cjs                        |  52 ++++--
 hooks/docs-ledger.sh                     |  49 ++++++
 hooks/layout-manifest.sh                 |  32 ++++
 hooks/test-lib-common.sh                 | 110 ------------
 registries/docs-ledger.json              |  25 +++
 registries/layout-manifest.json          |  35 ++++
 scripts/checks/70-runtime.sh             |  40 -----
 scripts/test-validate-engineos.sh        |   9 +-
 src/cli.ts                               |   6 +-
 src/hooks/bypass.test.ts                 | 103 +++++++++++
 src/hooks/bypass.ts                      |  42 +++++
 src/hooks/cache.test.ts                  |  57 ++++++
 src/hooks/cache.ts                       |  35 ++++
 src/hooks/classify-failure.test.ts       | 113 ++++++++++++
 src/hooks/classify-failure.ts            |  80 +++++++++
 src/hooks/envelope.test.ts               | 112 ++++++++++++
 src/hooks/envelope.ts                    |  73 ++++++++
 src/hooks/output.test.ts                 |  47 +++++
 src/hooks/output.ts                      |  76 ++++++++
 src/hooks/runner.test.ts                 | 185 ++++++++++++++++++++
 src/hooks/runner.ts                      | 252 +++++++++++++++++++++++++++
 src/hooks/scaffold.test.ts               | 153 ++++++++++++++++
 src/hooks/scaffold.ts                    | 156 +++++++++++++++++
 src/hooks/span-writer.ts                 | 161 +++++++++++++++++
 src/hooks/telemetry.test.ts              | 289 +++++++++++++++++++++++++++++++
 src/hooks/telemetry.ts                   | 238 +++++++++++++++++++++++++
 src/lib/git.test.ts                      |  83 +++++++++
 src/lib/git.ts                           |  62 +++++++
 src/lib/slug.test.ts                     |  48 +++++
 src/lib/slug.ts                          |  46 +++++
 src/lib/time.test.ts                     |  42 +++++
 src/lib/time.ts                          |  46 +++++
 src/registry/capabilities.test.ts        |  55 ++++++
 src/registry/capabilities.ts             |  59 +++++++
 src/registry/models.test.ts              |  10 +-
 src/registry/models.ts                   |  13 ++
 src/registry/policy-exec-journal.test.ts |  23 +++
 src/registry/policy-exec-journal.ts      |  17 ++
 src/registry/policy-telemetry.test.ts    |  19 ++
 src/registry/policy-telemetry.ts         |  12 ++
 42 files changed, 2897 insertions(+), 173 deletions(-)
```
```
$ git log --oneline feat/journal-wave2..HEAD
5b6252b build: rebuild dist/engineos.cjs for the hook library
5c0f8ae feat(hooks): port scaffold, runner, the situation classifier and route cache
0956d7e feat(hooks): port the hook envelope, decision output, bypass and telemetry library
```

## Notes
Stacked on `feat/journal-wave2` (PR #56). Wave A dispatched as three parallel agents (16a envelope/output/bypass/git, 16b telemetry/slug/time/registry unions/C27f, 17 scaffold/runner/classifier/cache) with interfaces frozen from the plan; zero shared files, zero contract drift at the barrier.

Residual risk / follow-ups for 3(b)+:
- `registries/policy.json .telemetry.exec_journal.written_by` and `.events[].written_by` still name the bash hooks; C22c/C27c grep bash idioms (`hook_telemetry`, `hook_span`). Both get re-pointed when the hooks move (Tasks 18-25) — one owner, not one per hook.
- `hooks/layout-manifest.sh` keeps its literal array because `scripts/init-project.sh:79` reads the manifest out of the file's text with sed; Task 26 removes that reader.
- Plan's Task 16 says 13 assertions in `test-lib-common.sh`; the file had 11. Plan text owed a fix.
- `render` emits compact JSON + newline; `writeJson` (kernel/journal CLIs) stays pretty. Both parse identically for jq consumers; nothing asserted the skip branch's stdout.
- `runnerRun` maps `timedOut` from spawnSync's ETIMEDOUT/SIGTERM, not from exit 124: with no `timeout` wrapper left in the chain, 124 is a code the target chose.
- `hookSlug` is byte-level (UTF-8) to match `tr -c` during the migration window; the events file name is now path-slugged (closes a traversal the bash left open).
- `src/registry/load.ts` `RegistryName` union does not include the two new registries; `loadLayoutManifest` reads via `readJsonFile` + `strictReader`.
- `findUp` takes one name; bash `find_up` accepted several (no caller passes more than one).
- Windows: `bypass.test.ts` compares a `/`-joined marker path against `path.join`; the wave-3 Windows run (Task 27) is where that shows.
