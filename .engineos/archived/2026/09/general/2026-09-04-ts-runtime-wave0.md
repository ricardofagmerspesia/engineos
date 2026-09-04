---
name: 2026-09-04-ts-runtime-wave0
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 0 of the bash-to-TypeScript runtime migration: the Node toolchain, the `Io` seam, the CLI entry with the two-floor node-version guard, and CI coverage for the committed bundle. No bash was replaced yet; `hooks.json` still calls the shell scripts.

## Why
The design spec (`docs/specs/2026-09-04-typescript-runtime-migration-design.md`, ADR `docs/adr/2026-09-04-typescript-runtime-over-bash.md`) moves the hooks, `scripts/kernel.sh` and the checks to a single committed bundle `dist/engineos.cjs`. Wave 0 lands the scaffolding every later wave builds on, so the guard semantics, the bundle reproducibility and the test harness are reviewed once, in isolation.

## Scope
`package.json`, `package-lock.json`, `tsconfig.json`, `scripts/build.mjs`, `.gitignore`, `.gitattributes`, `.github/workflows/ci.yml`, `src/{io,dispatch,node-guard,cli}.ts` and their `*.test.ts`, `dist/engineos.cjs`.

## Checklist
- [x] Task 1: toolchain (package.json, lockfile, tsconfig, esbuild build script, build/ ignored)
- [x] Task 2: `Io` contract with `processIo` / `memoryIo` / `writeJson` and tests
- [x] Task 3: `node-guard`, `dispatch`, `cli` entry with guard; committed bundle
- [x] Task 4: CI steps — setup-node 20, npm ci / typecheck / test, dist drift guard
- [x] Final whole-branch review and one fix round (guard failure paths, bundle smoke in CI, hygiene)
- [x] Startup cost measured per plan Task 4

## What was made
- Added a zero-runtime-dependency Node toolchain: `typescript`, `esbuild` (exact-pinned 0.24.2) and `@types/node` 18 as devDependencies; strict `tsconfig.json`; `scripts/build.mjs` bundling `src/cli.ts` to `dist/engineos.cjs` with a single shebang banner and the package version inlined via `define`.
- Added `src/io.ts`: the `Io` contract (stdin read-once, stdout, stderr, env, cwd), `processIo()` for the real process and `memoryIo()` for tests, plus `writeJson()`.
- Added `src/node-guard.ts`: node-version parsing that fails closed on junk input (NaN becomes 0), `findNewerNode()` over nvm versions (numeric major/minor/patch ordering, unreadable directories swallowed, executable check) then homebrew and `/usr/local`, and the pure `guardOutcome()` policy returning `proceed | reexec | silent | skip | refuse` with `SILENT_HOOKS` exported.
- Added `src/dispatch.ts` (command table, `--version`, unknown-command error envelope, typed package-version read) and `src/cli.ts` (effects only: re-exec via `spawnSync` with `ENGINEOS_REEXEC=1`, falling through to the degradation policy when the re-exec cannot start).
- Added 24 `node:test` tests covering `Io`, dispatch, version parsing, node discovery and all five guard outcomes with the exact message strings the spec pins.
- Extended CI: Node 20 setup, `npm ci`, typecheck, tests, a drift guard that rebuilds the bundle and fails on any diff, and a smoke run of `node dist/engineos.cjs --version` against the package version. `.gitattributes` forces LF on the bundle.

## Verification
- `npm run typecheck` clean; `npm test` 24 passed, 0 failed (run by the fix implementer and reproduced by the final re-reviewer).
- `npm run build` reproduces `dist/engineos.cjs` byte-identical; one shebang on line 1; `node dist/engineos.cjs --version` prints `engineos 1.6.0`.
- Final reviewer patched a bundle copy to force the guard and confirmed all four unusable-node outcomes match the spec table; `scripts/validate-engineos.sh` still passes 108/108 with the new root files.
- Startup cost (plan Task 4, spec open risk): `node dist/engineos.cjs --version` wall time 30-50 ms over 10 runs on node v22.23.2, macOS.
- Not exercised by an automated test: the `cli.ts` wiring that falls through to the policy when `spawnSync` returns `error` or a null status. The policy it falls into is unit-tested.

## Human decisions
None fired. Risk classified low (additive, reversible, nothing consumes the bundle yet); the user approved executing wave 0 via subagents before dispatch.

## Changes registered
```
384bba7 chore(runtime): pin esbuild, lf for dist, smoke the bundle in CI
a4f7a50 fix(runtime): harden node guard failure paths and cover it with tests
73625d5 ci: build, test and drift-guard the node runtime
479610a refactor(runtime): single imports, numeric node sort, typed package read
d761e09 fix(runtime): run node:test from build/ so only compiled tests are discovered
4c67e26 feat(runtime): add CLI entry with node-version guard
acd13a3 feat(runtime): add Io contract for CLI adapters
cba360b chore(runtime): add TypeScript toolchain for the node runtime
```
```
 .gitattributes           |   1 +
 .github/workflows/ci.yml |  23 +++
 .gitignore               |   1 +
 dist/engineos.cjs        | 155 ++++++++++++++
 package-lock.json        | 518 +++++++++++++++++++++++++++++++++++++++++++++++
 package.json             |  19 ++
 scripts/build.mjs        |  23 +++
 src/cli.ts               |  53 +++++
 src/dispatch.test.ts     |  23 +++
 src/dispatch.ts          |  40 ++++
 src/io.test.ts           |  25 +++
 src/io.ts                |  58 ++++++
 src/node-guard.test.ts   | 121 +++++++++++
 src/node-guard.ts        |  90 ++++++++
 tsconfig.json            |  20 ++
 15 files changed, 1170 insertions(+)
```
PR size excluding `dist/engineos.cjs` and `package-lock.json`: 497 lines, of which 169 are tests. Base `e4966e9`.

## Notes
- The spec, ADRs and plan were authored on branch `docs/ts-runtime-migration-design` (commit 303cdaf) and cherry-picked onto this branch (stacked shape: if the docs branch merges first, this PR shrinks to the code). The plan text was then updated here to the as-built code.
- Execution rulings that diverged from the original plan text (now folded into the plan): no shebang in `src/cli.ts` (esbuild banner only); package version read via `readFileSync` + `JSON.parse` into `unknown`, not a JSON import attribute; test script `tsc -p tsconfig.json && cd build && node --test`; one import statement per module; numeric version tiebreak; refuse message `node >= 18 required, found vX` (spec wording, plan lacked the `v`); guard policy extracted to `guardOutcome()`.
- Parked review findings, carried to later waves: esbuild leaves a reference to the tree-shaken `readPackageVersion` inside a constant-folded dead branch (inert); `lint` script is an alias of `typecheck` (real linter before wave 3); `npm ci` runs before the installer secrets-gate steps that copy the tree (CI time only); no-args prints an unknown-command error instead of usage (lands with the shims).
- Constraint for wave 1 onward: esbuild inlines imported module bodies above the guard, so command modules must be required lazily inside each `Command`, never at `cli.ts` top level. A node-16 container probe of the guard outcomes in CI would enforce this.
- Known minor risk: `readFileSync(0)` in `processIo` can hit EAGAIN on a non-blocking stdin pipe on some CI runners; it already answers an empty string on error, matching the bash fallback. Watch CI.
