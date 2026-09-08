---
name: 2026-09-05-hooks-wave3c
status: done
completed: 2026-09-05
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 3(c) of the TypeScript runtime migration (plan Task 27): `engineos settings-merge` replaces the three jq programs in the installers, `hooks/hooks.json` registers `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>` directly, `install.sh` / `install.ps1` check `node >= 18` instead of `jq` and stop resolving `bash.exe` for hooks, and `engineos bypass on|off|status` replaces the CLI half of `hooks/bypass.sh` (now a shim). Barrier 3 handoff closes Wave 3.

## Why
Plan Task 27. With every hook on node (3(b)), `jq` survives only in the installers' settings merge; a reinstall over a bash-era `settings.json` would also leave the `.sh` entries firing beside the node ones unless the scrub keys on both forms.

## Scope
`src/install/{settings-merge,cli}.ts` + tests, `src/bypass/cli.ts` + test, `src/cli.ts` (two arms), `hooks/hooks.json`, `install.sh`, `install.ps1`, `hooks/bypass.sh` (shim), `hooks/test-install-hooks.sh` (new form + reinstall case), `scripts/checks/10-rules.sh` (C1 prose), `README.md`, `docs/ADOPTION.md`, `docs/COMPATIBILITY.md` (1.7.0 section), `dist/engineos.cjs`, Barrier 3 handoff.

## Checklist
- [x] `settings-merge`: pure `mergeSettings`, `isEngineosCommand` (hooks dir OR `dist/engineos.cjs`), atomic write, `--dry-run`, permissions set-union preserving order
- [x] `hooks/hooks.json` node commands; installers call `settings-merge`, check node >= 18, Windows registers node directly
- [x] `hooks/test-install-hooks.sh` asserts the node form + reinstall-over-bash-era case with no duplicates
- [x] `engineos bypass on|off|status [cwd]`; `hooks/bypass.sh` shim; `hooks/test-bypass.sh` green unchanged
- [x] C1 prose, README, ADOPTION, COMPATIBILITY updated
- [x] `dist/engineos.cjs` rebuilt; Barrier 3 handoff written with bench budgets
- [x] Final gate run once at the end

## What was made
- `src/install/settings-merge.ts` (pure `mergeSettings`, `isEngineosCommand` matching `<root>/hooks/` slash-normalized OR `dist/engineos.cjs`, hook-name derivation with the abort rule, order-preserving `permissions.allow` union, shape refusals) and `src/install/cli.ts` (`runSettingsMerge`: `--settings`, `--plugin-root`, `--dry-run`, atomic tmp+rename write, missing-template warning on stderr with exit 0). 28 tests in `src/install/settings-merge.test.ts`.
- `src/bypass/cli.ts` (`engineos bypass on|off|status [cwd]`, bash-verbatim messages, exit 1 outside a git repo, exit 2 on usage) with 11 tests; `bypassFlagPath(env)` exported from `src/hooks/bypass.ts`; `hooks/bypass.sh` reduced to a shim that still returns early when sourced (`hooks/lib-common.sh` sources it).
- `src/cli.ts` gains the `settings-merge` and `bypass` arms.
- `hooks/hooks.json`: all 8 registered commands become `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>`.
- `install.sh` section 5 and `install.ps1` section 5/6: `node >= 18` gate replaces the `jq` check, one `settings-merge` call replaces the three jq programs, write-once `.engineos.bak` kept, Windows registers node directly (`cygpath -m` / `ToUnixPath` for the plugin root), `bash.exe` resolution for hooks removed, node-missing warning points at nodejs.org and hooks.json.
- `hooks/test-install-hooks.sh`: `expected()` substitutes the bare placeholder inside the quoted script argument; two reinstall cases (over node-form output, over bash-era entries) assert one entry per hook; 9 cases total.
- C1 prose in `scripts/checks/10-rules.sh` (jq is a validator/generator dependency only); stale shim-execution comments in `50-kernel.sh` and `70-runtime.sh` corrected.
- `README.md`, `docs/ADOPTION.md`, `docs/COMPATIBILITY.md` (`## 1.7.0 additions`, hooks.json node form, installers drop jq and bash.exe), `commands/bypass.md`.
- `dist/engineos.cjs` rebuilt; Barrier 3 handoff at `docs/specs/2026-09-05-typescript-runtime-migration-barrier3-handoff.md` with the bench budgets.
- Delivered by three disjoint-scope agents in one wave (settings-merge, installers, bypass-cli); orchestrator fixed two stale check comments and wired `src/cli.ts`.

## Verification
Run once, at the end, 2026-09-05:
```
$ npm run typecheck          -> rc=0
$ npm test                   -> tests 842 pass 842 fail 0
$ gate driver:
rc=0 :: build
rc=0 :: test-route
rc=0 :: test-kernel
rc=0 :: validate              passed 104, failed 0
rc=0 :: test-prompt-advisor   prompt-advisor: 65 passed, 0 failed
rc=0 :: bench
rc=0 :: test-exec-journal
rc=0 :: test-telemetry
rc=0 :: test-layout
rc=0 :: test-docs
rc=0 :: test-governance
rc=0 :: test-verify           pass=22 fail=0 skip=0
rc=0 :: test-bypass           pass=27 fail=0
rc=0 :: test-agent-announce
rc=0 :: test-post-edit
rc=0 :: test-install-hooks    install-hooks: 9 passed, 0 failed
rc=0 :: self-test             passed 141, failed 0
bench: route-intent 41.0ms/<250; resolve-task 43.8ms/<500; prompt-advisor e2e 69.6ms/<600; route-before-change cache hit 85.9ms/<150; always-on context 27275B/<32000
```
Not verified: manual `install.ps1` run on Windows with a Stop event observed (no Windows host) — recorded under Not done in the Barrier 3 handoff.

## Human decisions
None fired. Risk classified medium (reversible working-tree changes on a stacked branch; installer and hooks.json are a consumer-copied surface), autonomy A2, no external effect. The prompt-advisor's `high-risk` / spec-authoring HITL announcements came from keyword matches on agent-report text, not from the classified tier, and were not treated as gates. User approved the full final gate via AskUserQuestion (2026-09-05).

## Changes registered
`git status --short` (before commit):
```
 M README.md
 M commands/bypass.md
 M dist/engineos.cjs
 M docs/ADOPTION.md
 M docs/COMPATIBILITY.md
 M hooks/bypass.sh
 M hooks/hooks.json
 M hooks/test-install-hooks.sh
 M install.ps1
 M install.sh
 M scripts/checks/10-rules.sh
 M scripts/checks/50-kernel.sh
 M scripts/checks/70-runtime.sh
 M src/cli.ts
 M src/hooks/bypass.ts
?? .engineos/changes/2026-09-05-hooks-wave3c.md
?? src/bypass/
?? src/install/
```
`git diff --stat HEAD` (before commit):
```
 README.md                    |  35 ++--
 commands/bypass.md           |   7 +-
 dist/engineos.cjs            | 371 +++++++++++++++++++++++++++++++++++++++++--
 docs/ADOPTION.md             |  11 +-
 docs/COMPATIBILITY.md        |  45 ++++++
 hooks/bypass.sh              | 115 ++------------
 hooks/hooks.json             |  16 +-
 hooks/test-install-hooks.sh  |  50 +++++-
 install.ps1                  | 225 ++++++--------------------
 install.sh                   | 168 +++++++-------------
 scripts/checks/10-rules.sh   |  24 +--
 scripts/checks/50-kernel.sh  |   7 +-
 scripts/checks/70-runtime.sh |   5 +-
 src/cli.ts                   |  12 +-
 src/hooks/bypass.ts          |   8 +-
 15 files changed, 632 insertions(+), 467 deletions(-)
```
`git log --oneline bd05a91..HEAD`:
```
c67efef docs(specs): write the Barrier 3 handoff for the runtime migration
c36898e build: rebuild dist/engineos.cjs for settings-merge and bypass
b4466a2 chore(checks): update C1 prose and shim-execution comments
51317a2 feat(install): register node hooks directly and merge settings without jq
e8a2527 refactor(bypass): port the bypass CLI to the node runtime
```
Moves: `.engineos/changes/2026-09-05-hooks-wave3c.md` -> `.engineos/archived/2026/09/general/`.

## Notes
- Strictness beyond the plan: a hooks.json command matching neither accepted form aborts instead of registering verbatim. Widen if a third form appears.
- `permissions.allow` is no longer sorted by jq `unique`; the first 1.7.0 install over an existing allowlist reorders it once (documented in COMPATIBILITY).
- Orphaned libraries (`hooks/lib-common.sh`, `lib-runner.sh`, `scaffold-layout.sh`, `layout-manifest.sh`, `docs-ledger.sh`) stay until wave 6; C30 canaries untouched.
- Next: Wave 4 Tasks 28-32 per plan, starting with `gen agent-commands` + `gen agent-registry`.
