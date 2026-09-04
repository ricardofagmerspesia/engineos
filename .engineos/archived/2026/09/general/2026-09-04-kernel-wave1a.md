---
name: 2026-09-04-kernel-wave1a
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 1(a) of the TypeScript runtime migration: `lib/` helpers and `KernelError`,
typed registry loaders, the shared test harness, the `resolve` skeleton with the
route section in both forms, the kernel CLI adapter with the `route-path` and
`route-intent` projections, and the differential parity harness against the
pinned bash kernel.

## Why
Plan Tasks 5, 6, 6b, 7, 8, 8b and 9 (`docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
Wave 1(a)). Wave 0 landed the toolchain and entry point; the kernel port starts
here, on the plan as amended by the nine architecture-review PRs (#42-#51).

## Scope
- `src/lib/**`, `src/registry/**` (Tasks 5, 6, 9 loader)
- `src/testing/**` (Task 6b)
- `src/kernel/**` (Tasks 7, 8, 8b, 9)
- `test/fixtures/legacy-kernel/**` (Task 8b)
- `registries/routing.json`, `hooks/test-route.sh` (Task 7 `hint` field and
  guidance parity), `src/cli.ts` (kernel wiring), `dist/engineos.cjs` (rebuilt)

Branch `feat/kernel-wave1a` cut from `docs/route-guidance` (the docs stack tip),
because `main` does not yet carry the amended plan.

## Checklist
- [x] Task 5: `lib/json.ts`, `lib/glob.ts`, `KernelError`
- [x] Task 6: registry root resolution and typed loaders
- [x] Task 6b: shared test harness
- [x] Task 7: `resolve` skeleton, route section (path form), `route-path`
- [x] Task 8: kernel CLI adapter with `require_positional`
- [x] Task 8b: differential parity harness
- [x] Task 9: route section, intent form, `route-intent`
- [x] Final gate: typecheck + unit tests, once, after asking

## What was made
- `src/lib/json.ts` (`KernelError`, `readJsonFile`, `isRecord`, `stringArray`)
  and `src/lib/glob.ts` (`globToRegExp`, `globMatch`) with tests.
- `src/registry/paths.ts` (`resolveRoot`, `registryPath`, `RegistryName`),
  `load.ts` (`loadRegistry`), `routing.ts` (`RoutingDomain` with the new `hint`
  field, `loadRouting`), `intents.ts` (`IntentRow`, `IntentsRegistry`,
  `loadIntents`; also the home of `RiskTier`/`isRiskTier`) with tests.
- `src/testing/harness.ts`: `tempRoot`, `fixtureRepo`, `relocatedRoot`,
  `envelope`, `transcript`, `runCli`, `runInProcess`, `RunResult`; tests.
- `src/kernel/context.ts` (`Registries`, `KernelContext`, `lazyRegistries`),
  `route.ts` (`RouteSection = PathRouteSection | IntentRouteSection`,
  `renderGuidance`, `floorOf`, `routeByPath`, `routeByIntent`), `resolve.ts`
  (`DeclaredFacts { path?; prompt? }`, `Answer { route? }`, `resolve`),
  `cli.ts` (`runKernel`, `requirePositional`, `parseFlags`, `route-path` and
  `route-intent` arms), `index.ts`; tests for resolve, route and CLI.
- `src/kernel/parity.test.ts` plus `test/fixtures/legacy-kernel/` (byte copy of
  `scripts/kernel.sh`, snapshot of `registries/*.json`, README). The harness
  stages the fixture into a temp root because the bash kernel derives its root
  from its own path and ignores `ENGINEOS_ROOT`.
- `registries/routing.json`: `hint` on dba, devops, ios-release, android-release,
  mobile; `hook_guidance` for ios/android/mobile rewritten to what
  `renderGuidance` derives (mobile now also names `skill:react-patterns`).
  `hook_guidance`/`risk_floor` stay until plan Task 13. `hooks/test-route.sh`
  literals updated to match.
- `src/cli.ts` registers `kernel: runKernel`; `dist/engineos.cjs` rebuilt.

## Verification
Run once at the end, after asking (2026-09-04):
- `npm run typecheck`: clean. `npm run lint`: clean.
- `npm test`: 88 pass, 0 fail, 0 skipped (parity `route-intent` asserted).
- `npm run build`: dist rebuilt, no error.
- `bash hooks/test-route.sh`: pass=41 fail=0.
- `bash scripts/test-kernel.sh`: passed 334, failed 0.
- `bash scripts/validate-engineos.sh`: passed 108, failed 0.
- `cmp scripts/kernel.sh test/fixtures/legacy-kernel/kernel.sh`: identical;
  all seven fixture registries identical to the working tree.

## Human decisions
None fired: risk low (new files under `src/`, `git revert` undoes them, no
external effect), autonomy A2. The owner chose the full gate when asked.

## Changes registered
Agent deviations accepted, all internal to the plan's frozen interfaces:
- `routeByPath(file, regs, root)` takes a third `root` parameter (excluded-path
  resolution); `routeByIntent` returns the narrowed `IntentRouteSection`.
- `RiskTier` lives in `src/registry/intents.ts` (re-exported from
  `kernel/context.ts`) to avoid a registry -> kernel import cycle.
- Declaring both `path` and `prompt` facts throws `KernelError` until the
  Wave 1(d) composite lands.
- Unknown subcommand answers `{"error":"unknown subcommand: <x>"}`, exit 1;
  parity harness excludes this case by design.
- Mobile hook guidance gains `skill:react-patterns` (the design understated the
  parity change); `routing.json` version not bumped (Task 13 owns the MINOR).
- No `load.test.ts`: `loadRegistry` is covered through the loader tests.
- Intent-row fields with no kernel reader yet (`multi_match`, `hook_mirrored`,
  `suppressible`, `suppressed_by`, `required_sections`, `archive_contract`,
  `required_fields`) are not loaded.

`git status --short` before commit:
```
 M dist/engineos.cjs
 M hooks/test-route.sh
 M registries/routing.json
 M src/cli.ts
?? .engineos/changes/2026-09-04-kernel-wave1a.md
?? src/kernel/
?? src/lib/
?? src/registry/
?? src/testing/
?? test/
```
`git diff --stat HEAD -- . ':!dist/engineos.cjs'`:
```
 hooks/test-route.sh     |  6 +++---
 registries/routing.json | 13 +++++++++----
 src/cli.ts              |  3 ++-
```
New files: 4241 lines, of which 2697 are the byte-copied fixture
(`kernel.sh` + seven registries), 74 the fixture README, 1470 source and tests.

## Residual risk
- The fixture is pinned by copy, not by a guard: nothing yet fails when
  `test/fixtures/legacy-kernel/kernel.sh` drifts from `scripts/kernel.sh`.
  A `cmp` in the drift guard closes it (later wave).
- Astral characters at a signal boundary: a JS string index into an astral
  code point yields a lone surrogate (non-alphanumeric here, alphanumeric in
  jq). No registry signal reaches it; documented in `route.ts`.
- PR exceeds the 400-line guideline even after excluding the fixture copies
  (~1470 source lines). Called out in the PR description.

## Notes
Agents write tests but run nothing; the gate runs once at the end (owner's
verification rule). Wave order: A = Tasks 5+6 and 6b in parallel; B = Tasks 7+8;
C = Tasks 8b and 9 in parallel.
