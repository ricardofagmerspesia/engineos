# Handoff — TypeScript runtime migration, Barrier 3 (end of Wave 3)

> Written at a wave barrier (`rules/parallelism.md` step 6). Plan:
> `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`; design:
> `docs/specs/2026-09-04-typescript-runtime-migration-design.md`.

## Objective

Move the EngineOS runtime from bash + jq + python3 to a single TypeScript
bundle (`dist/engineos.cjs`, node >= 18) with every `scripts/*.sh` and
`hooks/*.sh` entry point reduced to a shim, byte-identical behaviour for every
consumer, and every bash suite plus `scripts/validate-engineos.sh` still green
at each barrier. Wave 3 (Tasks 16-27) ports the hook library, the eight
registered hooks, `init`, `settings-merge` and the bypass CLI.

## State

Wave 3 is complete and gated. Every registered hook runs from
`dist/engineos.cjs` through a `hooks/*.sh` shim (3(a)/3(b)); `hooks/hooks.json`
now registers `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>`
directly; `install.sh` / `install.ps1` gate on `node >= 18` instead of `jq`
and call `engineos settings-merge`, which scrubs both the old `.sh` form and
the node form on reinstall; `engineos bypass on|off|status` replaces the CLI
half of `hooks/bypass.sh`. Work sits on stacked branches, unmerged:
`feat/hooks-wave3a` (PR #57) -> `feat/hooks-wave3b` (PR #58) ->
`feat/hooks-wave3c` (this barrier). The one Wave 3 exit criterion not met is
the manual Windows run of `install.ps1` (see Not done). Wave 4 (Tasks 28-32)
has not started.

Gate: validation — 4 of 4 per `rules/gates.md` (local rung: typecheck, unit
tests, build, all 17 bash suites run once at the end; integration rung n/a:
no external dependency; pre-production and production rungs n/a: library, not a
deployed service)
Risk: medium — reversible working-tree changes on a stacked branch, but the
installer and `hooks.json` are a public surface consumers copy (per
`rules/risk-autonomy.md` contract-surface input; no shortcut floor hit)

## Done

- Tasks 16-17 (3(a), PR #57): hook library — envelope, output, bypass,
  telemetry writer, scaffold, runner, situation classifier, route cache.
  Evidence: PR #57 record `.engineos/archived/2026/09/general/2026-09-04-hooks-wave3a.md`.
- Tasks 18-26 (3(b), PR #58): the eight registered hooks + `post-edit-check` +
  `init` on node; shims; checks re-pointed at `src/hooks/*.ts`. Evidence:
  `.engineos/archived/2026/09/general/2026-09-04-hooks-wave3b.md` (typecheck 0,
  798/798 unit, validator 104/0, self-test 141/0).
- Task 27 (3(c), this branch): `src/install/settings-merge.ts` (pure merge,
  28 tests), `src/install/cli.ts` (`runSettingsMerge`), `src/bypass/cli.ts`
  (11 tests), `hooks/hooks.json` node form, installers rewired,
  `hooks/test-install-hooks.sh` 9 cases incl. two reinstall cases, C1 prose,
  README / ADOPTION / COMPATIBILITY 1.7.0 section. Evidence below.

## Decisions

- Hook-name derivation and the abort rule live in `settings-merge`, not in the
  installers — one home, tested once; the installers only call it. Rejected:
  keeping a parser in each installer (three copies drifted before).
- A `hooks.json` command matching neither accepted form
  (`"${CLAUDE_PLUGIN_ROOT}"/hooks/<x>.sh` or `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <n>`)
  aborts. The plan only required aborting on an empty/unsafe derived name;
  strictness closes the `foo.sh` case that would register an entry nothing
  scrubs. Widen if a third form ever appears.
- `permissions.allow` union preserves existing order then appends template
  extras (plan invariant). jq's `unique` used to sort, so the first 1.7.0
  install over an existing allowlist reorders it once. Accepted, documented in
  `docs/COMPATIBILITY.md`.
- `hooks/bypass.sh` shim returns early when sourced because
  `hooks/lib-common.sh:134` still sources it (lib-common is orphaned but not
  removed until wave 6 per C30).
- `--plugin-root` is used verbatim; the installer decides path flavour
  (`cygpath -m` / `ToUnixPath`) so registered commands carry forward slashes.

## Files

| File | What changed and why |
|---|---|
| `src/install/settings-merge.ts` | pure merge: derivation, scrub (both forms), append in hooks.json order, permissions union, shape refusals |
| `src/install/cli.ts` | `runSettingsMerge`: flags, reads, warnings, atomic tmp+rename write, `--dry-run` |
| `src/install/settings-merge.test.ts` | 28 `node:test` cases over both |
| `src/bypass/cli.ts`, `src/bypass/cli.test.ts` | `engineos bypass on\|off\|status [cwd]`, bash-verbatim messages, exit 1 outside git, exit 2 usage |
| `src/hooks/bypass.ts` | `bypassFlagPath(env)` exported for the CLI |
| `src/cli.ts` | `settings-merge` and `bypass` arms |
| `hooks/hooks.json` | 8 commands become `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>` |
| `hooks/bypass.sh` | shim over the bundle; sourced-guard kept |
| `install.sh`, `install.ps1` | node >= 18 gate, `settings-merge` call, jq / bash.exe hook wiring removed |
| `hooks/test-install-hooks.sh` | expects the node form; two reinstall cases (over node-form output, over bash-era entries) |
| `scripts/checks/10-rules.sh`, `50-kernel.sh`, `70-runtime.sh` | C1 prose; stale comments about who executes the `.sh` shims |
| `README.md`, `docs/ADOPTION.md`, `docs/COMPATIBILITY.md`, `commands/bypass.md` | prerequisites, 1.7.0 additions section, bypass CLI row |
| `dist/engineos.cjs` | rebuilt |

## Evidence

```
$ npm run typecheck          -> rc=0
$ npm test                   -> tests 842 pass 842 fail 0
$ gate driver (build + 16 bash suites), 2026-09-05:
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

bench-runtime.sh (Barrier 3 budgets, warm medians):
ok   route-intent: median=41.0ms budget<250.0ms
ok   resolve-task: median=43.8ms budget<500.0ms
ok   prompt-advisor (end to end): median=69.6ms budget<600.0ms
ok   route-before-change (cache hit): median=85.9ms budget<150.0ms
ok   always-on context: 27275 bytes budget<32000 bytes
```

## Known failures and open risks

- Windows `install.ps1` manual run with a Stop event observed firing: NOT DONE
  (no Windows host in this session). `install.ps1` changes are reviewed and
  mirror `install.sh`, but unexecuted.
- `stop-verify` node-too-old rung is unreachable through the CLI
  (`process.versions.node` is the running node); `hooks/test-verify.sh` case 16
  proves only shim silence under a fake node (carried from 3(b)).
- First 1.7.0 install over an existing `permissions.allow` reorders it once
  (order-preserving union replaces jq `unique` sort).
- Orphaned libraries still present until wave 6: `hooks/lib-common.sh`,
  `lib-runner.sh`, `scaffold-layout.sh`, `layout-manifest.sh`,
  `docs-ledger.sh`; C30 canaries still sed `ENGINEOS_HOOK_LIBRARIES` in
  `install.sh`.
- `registries/{agents,decision-rules,intents,layout-manifest}.json` notes still
  name `hooks/*.sh` entry points (prose only, nothing reads them as paths).
- Plan Task-22 row names `src/kernel/resolve-task.ts`, which does not exist
  (resolve-task lives in the kernel module tree); stale row, not a defect.
- Several `*.test.ts` exceed the 300-line guideline (`settings-merge.test.ts`
  400 lines).

## Not done

- [ ] Windows: run `install.ps1` on a Windows host, trigger a Stop event, confirm
  `stop-verify` fires from `node "<root>/dist/engineos.cjs" hook stop-verify`.
  Blocked on a Windows machine.
- [ ] Merge the stack #47 -> #58 -> 3(c) PR (human).
- [ ] Wave 4, Tasks 28-32: `gen agent-commands`, `gen agent-registry`, `evals`,
  `bench`, `usage-report` -> `src/gen/`, `src/evals/`, `src/bench/`,
  `src/report/`; each `.sh` becomes a shim; commit
  `refactor(<area>): port <unit> to the node runtime`.

## Next step

Cut `feat/gen-wave4a` from the 3(c) head and port Task 28 (`gen agent-commands`)
plus Task 29 (`gen agent-registry`) as two disjoint-scope agents in one wave:
`src/gen/frontmatter.ts` + `src/gen/agent-commands.ts` (marker text verbatim,
untouched files without the marker) and `src/gen/agent-registry.ts` +
`src/registry/capabilities.ts` (missing `tier:` hard error,
`Wrote N agents to <file>`), with the CI drift guards as acceptance.

## Resume

```bash
git checkout feat/hooks-wave3c
npm ci
npm run typecheck && npm test && npm run build
bash scripts/validate-engineos.sh
bash hooks/test-install-hooks.sh && bash hooks/test-bypass.sh
bash scripts/bench-runtime.sh
```
