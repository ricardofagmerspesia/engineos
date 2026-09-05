# Handoff — TypeScript runtime migration, Barrier 5 (end of Wave 5)

> Written at a wave barrier (`rules/parallelism.md` step 6). Plan:
> `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`; design:
> `docs/specs/2026-09-04-typescript-runtime-migration-design.md`. Previous
> barrier: `docs/specs/2026-09-05-typescript-runtime-migration-barrier3-handoff.md`.

## Objective

Move the EngineOS runtime from bash + jq + python3 to a single TypeScript
bundle (`dist/engineos.cjs`, node >= 18) with every `scripts/*.sh` and
`hooks/*.sh` entry point reduced to a shim, byte-identical behaviour for every
consumer, and every bash suite plus the validator still green at each barrier.
Wave 5 (Tasks 33c, 33, 33b, 34-41) ports the validator: the findings model and
harness in 5(a), the seven check families in 5(b), then the shim swap.

## State

Wave 5 is complete and gated. `engineos validate` runs all 62 checks from the
explicit registry in `src/checks/index.ts`; `scripts/validate-engineos.sh` is a
shim that execs it; `scripts/checks/*.sh` are deleted; the bash self-test keeps
only the six harness cases (`--list`, `--only`, exit codes, a planted failure)
while every planted-breakage case lives beside its family as
`src/checks/<family>.test.ts`. `jq` is no longer a dependency of anything the
validator runs; check C1 asks for `node >= 18` in its place. Work sits on
stacked branches, unmerged: ... -> `feat/checks-wave5a` (PR #62) ->
`feat/checks-wave5b` (this barrier). Wave 6 (Tasks 42-59) has not started.

Gate: validation — 4 of 4 per `rules/gates.md` (local rung: typecheck, unit
tests, build, all bash suites and the validator run once at the end;
integration rung n/a: no external dependency; pre-production and production
rungs n/a: library, not a deployed service)
Risk: medium — reversible working-tree changes on a stacked branch; the
validator's ids, verdicts, header, summary and exit codes are consumer-visible
surface and were kept byte-identical (`rules/risk-autonomy.md` contract-surface
input; no shortcut floor hit)

## Done

- Tasks 33c/33/33b (5(a), PR #62): findings model, harness, mirror runner and
  table. Evidence: `.engineos/archived/2026/09/general/2026-09-05-checks-wave5a.md`.
- Tasks 34-41 (5(b), this branch): eight family modules under `src/checks/`
  (`rules`, `registries`, `agents-skills`, `decision-registries`, `kernel`,
  `contracts`, `runtime-governance`, `runtime-surface`), 375 family tests plus
  `index.test.ts`; `CHECKS` wired; shim swap; `scripts/checks/` deleted;
  self-test shrunk; CI shellcheck glob and `hooks/test-docs.sh` refscan drop
  the deleted directory; README and COMPATIBILITY updated. Evidence below.

## Decisions

- Every check reports findings (`code`, optional `subject`) and tests assert on
  codes, never on rendered lines (design deviation 8). The bash self-test's
  per-check cases therefore moved into the family test files; the bash file
  keeps only what exercises the harness itself.
- Well-formedness checks over `registries/policy.json` and the decision
  registries read the raw JSON, not the typed `Registries` loader: a malformed
  registry must produce a finding, and the typed loader would throw first.
  Kernel checks report an unparseable registry as `precondition-missing:<path>`.
- Five bash rows that mutated `dist/engineos.cjs` to provoke a failure are
  re-expressed as registry breaks (C20-C26); the C27b canary's four
  dist-mutating rows became three in-process mutations through `runJournal`.
  One code, C26b `situation-cites-undeclared-reason`, is unproducible by any
  tree mutation and is listed in `UNPRODUCIBLE_BY_MUTATION` with the reason.
- C5b walks rule names itself instead of `deferralsOf`, because the bash check
  matched route-loaded references, not deferrals. Same verdicts on the
  shipped tree.
- `Registries.capabilities` and `Registries.agents` stay `unknown` in
  `src/kernel/context.ts`; the families that need them read raw JSON. Typing
  them is a Wave 6 follow-up, not a blocker.
- The 5(b) diff is far over the 400-line PR guideline. Landed as one commit per
  family plus the barrier and build commits so it can be split into stacked
  PRs on request without rewriting history.

## Files

| File | What changed and why |
|---|---|
| `src/checks/testing.ts` | shared test helper: checkout copy, context, `findingsOf`, `hasFinding`, `editFile` |
| `src/checks/rules.ts` (+test) | C1 (`node >= 18`), C2, C3, C5, C5b |
| `src/checks/registries.ts`, `registries-coherence.ts` (+test) | C6-C15, C14 coherence walk |
| `src/checks/agents-skills.ts` (+test) | agent/skill/alias/model-tier checks incl. C31 |
| `src/checks/decision-registries*.ts` (+test) | C16 mirrors, decision-rule/intent/policy well-formedness |
| `src/checks/kernel*.ts` (+test) | C17* kernel checks, router checks, suppression walk |
| `src/checks/contracts*.ts` (+test) | C21* archive, intent contract, handoff (C19) checks |
| `src/checks/runtime-governance*.ts` (+tests) | C20-C26 repair, telemetry, constitution, backpressure, breaker, HITL + canary |
| `src/checks/runtime-surface*.ts` (+tests) | C27* journal + canary, C28/C29 adoption, C30 modes |
| `src/checks/index.ts`, `index.test.ts` | `CHECKS` spreads the eight families; registry invariants |
| `scripts/validate-engineos.sh` | shim: `ENGINEOS_ROOT=<root> node dist/engineos.cjs validate "$@"` |
| `scripts/test-validate-engineos.sh` | six harness cases only |
| `scripts/checks/*.sh` | deleted (8 files) |
| `.github/workflows/ci.yml`, `hooks/test-docs.sh` | globs drop `scripts/checks/*.sh` |
| `README.md`, `docs/COMPATIBILITY.md` | validator prose; 1.7.0 rows for the shim, the deleted checks, C1's message |
| `dist/engineos.cjs` | rebuilt |

## Evidence

```
$ npm run typecheck          -> rc=0
$ npm test                   -> tests 1415 pass 1415 fail 0
  (first run: 2 failures in runtime-governance-repair.test.ts, a fixture that
   looked up repair.by_situation rows by `id` instead of `situation`; fixed,
   rerun green)
$ gate driver (build + drift + bash suites), 2026-09-05:
rc=0 :: build
rc=0 :: drift                 both gen drift guards clean
rc=0 :: test-gen-agent-registry
rc=0 :: evals
rc=0 :: usage-report
rc=0 :: test-route
rc=0 :: test-kernel
rc=0 :: validate              passed 104, failed 0 (62 checks, no skip lines)
rc=0 :: test-prompt-advisor
rc=0 :: bench
rc=0 :: test-exec-journal
rc=0 :: test-telemetry
rc=0 :: test-layout
rc=0 :: test-docs
rc=0 :: test-governance
rc=0 :: test-verify
rc=0 :: test-bypass
rc=0 :: test-agent-announce
rc=0 :: test-post-edit
rc=0 :: test-install-hooks
rc=0 :: self-test             passed 6, failed 0 (harness cases)

$ bash scripts/validate-engineos.sh   -> rc=0, header + "passed 104, failed 0"
$ node dist/engineos.cjs validate --list | wc -l   -> 62 (C1 first, C31 last)

bench (Barrier 5, warm medians):
ok   route-intent: median=44.4ms budget<250.0ms
ok   resolve-task: median=48.6ms budget<500.0ms
ok   prompt-advisor (end to end): median=73.7ms budget<600.0ms
ok   route-before-change (cache hit): median=90.4ms budget<150.0ms
ok   always-on context: 27275 bytes budget<32000 bytes
```

## Known failures and open risks

- None red. Open risks: `isExecutable` is duplicated between
  `runtime-governance-shared.ts` and `runtime-surface-fs.ts` (fold in Wave 6);
  `Registries.capabilities`/`agents` untyped; the stricter section-scoped
  greps in C22c/C24c/C25c/C26c pass on the shipped tree but will flag prose
  edits the bash versions tolerated — treat a new FAIL there as a real drift,
  not a false positive, before loosening a row.
- The stack is 16 unmerged PRs deep (#47-#62 plus this one); merge order
  matters and each PR's base is the previous branch.

## Not done

- Wave 6 in full: Tasks 42-57 (port the 16 bash suites to `node:test` e2e
  files, delete each `.sh` suite and its CI step), Task 58 (CI and installers
  final form: drop `jq`/`shellcheck` except for `install.sh` and remaining
  shims, delete `hooks/lib-common.sh`, `lib-runner.sh`, `layout-manifest.sh`,
  `docs-ledger.sh` with the last suites that source them, C30's list follows),
  Task 59 (COMPATIBILITY shim rows, `docs/release-notes/1.7.0.md`, README /
  ADOPTION prerequisites, `CLAUDE.md` router paragraph, plugin version 1.7.0,
  human release gate).
- Manual Windows run of `install.ps1` (carried from Barrier 3).

## Next step

Cut `feat/suites-wave6a` from this branch's head and port the first suite
batch per plan Tasks 42-57, largest first: `scripts/test-validate-engineos.sh`
(six harness cases) -> `src/validate/validate.e2e.test.ts`, then
`hooks/test-kernel.sh` -> `src/kernel/kernel.e2e.test.ts`, each PR deleting its
`.sh` suite and CI step.

## Resume

```bash
# exact commands to get back to a working state
git checkout feat/checks-wave5b
npm ci
npm run typecheck && npm test
npm run build && node dist/engineos.cjs validate
```
