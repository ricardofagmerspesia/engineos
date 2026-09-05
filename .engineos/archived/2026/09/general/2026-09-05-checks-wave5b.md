---
name: 2026-09-05-checks-wave5b
status: done
completed: 2026-09-05
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 5(b) of the TypeScript runtime migration (plan Tasks 34-41): the seven bash check families under `scripts/checks/` port to `src/checks/<family>.ts` against the Wave 5(a) contracts; `scripts/validate-engineos.sh` becomes a shim over `engineos validate`; `scripts/checks/*.sh` are deleted; `scripts/test-validate-engineos.sh` shrinks to its harness cases; the shellcheck CI step drops `scripts/checks/*.sh`. Barrier 5 handoff.

## Why
Plan Wave 5. The validator is the last jq consumer; every check becomes findings on a typed context, tested through values rather than substrings (design deviation 8).

## Scope
`src/checks/{testing,rules,registries,agents-skills,decision-registries,kernel,contracts,runtime-governance,runtime-surface}.ts` + tests, `src/checks/index.ts` (+ `index.test.ts`), `scripts/validate-engineos.sh` (shim), `scripts/checks/` (deleted), `scripts/test-validate-engineos.sh` (harness cases only), `.github/workflows/ci.yml` (shellcheck glob), `docs/COMPATIBILITY.md`, `dist/engineos.cjs`, Barrier 5 handoff under `docs/specs/`.

## Checklist
- [x] Wave 1 agents: 20-registries, 40-decision-registries, 50-kernel, 60-contracts, 70-runtime part 1, 70-runtime part 2
- [x] Wave 2 agents: 10-rules (C1 becomes node >= 18), 30-agents-skills
- [x] `index.ts` wires all families; `index.test.ts` asserts 62 ids registered once, codes unique per check, mirror row ids in code lists
- [x] Shim swap, bash checks deleted, self-test shrunk, CI shellcheck glob, COMPATIBILITY
- [x] Final gate run once at the end; Barrier 5 handoff

## What was made
Eight family modules landed under `src/checks/` against the Wave 5(a) contracts: `rules.ts` (C1 now `node >= 18 present`, C2, C3, C5, C5b), `registries.ts` + `registries-coherence.ts` (C6-C15), `agents-skills.ts`, `decision-registries.ts` + `-data`/`-intents`/`-policy` (C16 mirrors and well-formedness), `kernel.ts` + `kernel-router.ts` + `kernel-suppression.ts` + `kernel-lib.ts` (C17*, router checks), `contracts.ts` + `contracts-archive.ts` + `contracts-intents.ts` (C21*, C19, intents), `runtime-governance*.ts` (C20-C26 with the in-process HITL canary) and `runtime-surface*.ts` (C27* with the in-process journal canary, C28/C29 via `skipPending`, C30). Each family exports `<FAMILY>_CHECKS`, declares its codes via `declare module './codes'`, and carries one `node:test` case per former bash self-test row plus a clean-tree test and a coverage test proving every declared code is produced (375 family tests). `src/checks/testing.ts` is the shared checkout-copy helper. `src/checks/index.ts` now spreads all eight arrays and `index.test.ts` asserts the 62 ids register once, codes are unique and valid, and every mirror row id is declared. `scripts/validate-engineos.sh` is a shim (`ENGINEOS_ROOT=<root> exec node dist/engineos.cjs validate "$@"`), `scripts/checks/*.sh` (8 files) are deleted, `scripts/test-validate-engineos.sh` keeps six harness cases, `.github/workflows/ci.yml` and `hooks/test-docs.sh` drop the `scripts/checks/*.sh` glob, README and `docs/COMPATIBILITY.md` describe the swap and C1's message change. Barrier 5 handoff written to `docs/specs/2026-09-05-typescript-runtime-migration-barrier5-handoff.md`. `dist/engineos.cjs` rebuilt.

## Verification
Run once at the end, after asking. `npm run typecheck` rc=0. `npm test` first run 1413/1415: two failures in `runtime-governance-repair.test.ts` from a fixture looking up `repair.by_situation` rows by `id` instead of `situation`; added `rowWhere` to the fixtures, rerun 1415/1415. Full gate driver rc=0 for every step: build, drift, test-gen-agent-registry, evals, usage-report, test-route, test-kernel, validate (`passed 104, failed 0`, 62 checks, no skip lines), test-prompt-advisor, bench (route-intent 44.4ms, resolve-task 48.6ms, prompt-advisor 73.7ms, cache hit 90.4ms, always-on 27275 B — all within budget), test-exec-journal, test-telemetry, test-layout, test-docs, test-governance, test-verify, test-bypass, test-agent-announce, test-post-edit, test-install-hooks, self-test (`passed 6, failed 0`). `bash scripts/validate-engineos.sh` via the shim rc=0; `--list` prints 62 ids, C1 first, C31 last.

## Human decisions
2026-09-05 | Ricardo Fagmer | none fired | approved | Risk classified medium (reversible working-tree changes on a stacked branch, no external effect; validator ids, verdicts, header, summary and exit codes kept byte-identical), autonomy A2. User approved the full gate via AskUserQuestion. Prompt-advisor "high-risk"/router-escalation/decision-rule hook notes were keyword matches on agent-report text, not this work; waived. No HITL reason from `registries/policy.json` applies.

## Changes registered
```
$ git status --short (before commit)
A .engineos/changes/2026-09-05-checks-wave5b.md
 M .github/workflows/ci.yml
 M README.md
 M dist/engineos.cjs
 M docs/COMPATIBILITY.md
 M hooks/test-docs.sh
D  scripts/checks/10-rules.sh
D  scripts/checks/20-registries.sh
D  scripts/checks/30-agents-skills.sh
D  scripts/checks/40-decision-registries.sh
D  scripts/checks/50-kernel.sh
D  scripts/checks/60-contracts.sh
D  scripts/checks/70-runtime.sh
D  scripts/checks/lib.sh
 M scripts/test-validate-engineos.sh
 M scripts/validate-engineos.sh
 A src/checks/agents-skills.test.ts
 A src/checks/agents-skills.ts
 A src/checks/contracts-archive.ts
 A src/checks/contracts-intents.ts
 A src/checks/contracts.test.ts
 A src/checks/contracts.ts
 A src/checks/decision-registries-data.ts
 A src/checks/decision-registries-intents.ts
 A src/checks/decision-registries-policy.ts
 A src/checks/decision-registries.test.ts
 A src/checks/decision-registries.ts
 A src/checks/index.test.ts
 M src/checks/index.ts
 A src/checks/kernel-lib.ts
 A src/checks/kernel-router.ts
 A src/checks/kernel-suppression.ts
 A src/checks/kernel.test.ts
 A src/checks/kernel.ts
 A src/checks/registries-coherence.ts
 A src/checks/registries.test.ts
 A src/checks/registries.ts
 A src/checks/rules.test.ts
 A src/checks/rules.ts
 A src/checks/runtime-governance-backpressure.ts
 A src/checks/runtime-governance-breaker.test.ts
 A src/checks/runtime-governance-breaker.ts
 A src/checks/runtime-governance-constitution.test.ts
 A src/checks/runtime-governance-constitution.ts
 A src/checks/runtime-governance-fixtures.ts
 A src/checks/runtime-governance-hitl-canary.test.ts
 A src/checks/runtime-governance-hitl-canary.ts
 A src/checks/runtime-governance-hitl.test.ts
 A src/checks/runtime-governance-hitl.ts
 A src/checks/runtime-governance-repair.test.ts
 A src/checks/runtime-governance-repair.ts
 A src/checks/runtime-governance-shared.ts
 A src/checks/runtime-governance-telemetry.test.ts
 A src/checks/runtime-governance-telemetry.ts
 A src/checks/runtime-governance.test.ts
 A src/checks/runtime-governance.ts
 A src/checks/runtime-surface-adoption.test.ts
 A src/checks/runtime-surface-adoption.ts
 A src/checks/runtime-surface-canary.ts
 A src/checks/runtime-surface-fs.ts
 A src/checks/runtime-surface-journal.test.ts
 A src/checks/runtime-surface-journal.ts
 A src/checks/runtime-surface-modes.ts
 A src/checks/runtime-surface-prose.test.ts
 A src/checks/runtime-surface-wiring.ts
 A src/checks/runtime-surface.test.ts
 A src/checks/runtime-surface.ts
 A src/checks/testing.ts

$ git diff --stat HEAD (before commit, tail)
 68 files changed, 13590 insertions(+), 3875 deletions(-)

$ git log --oneline 1c9b1d0..HEAD
74589e7 build: rebuild dist/engineos.cjs with the check families
d780427 feat(checks): register the families and shim scripts/validate-engineos.sh
0513be6 feat(checks): port family 70-runtime part 2 (surface)
ac635f4 feat(checks): port family 70-runtime part 1 (governance)
94bf142 feat(checks): port family 60-contracts
06a082b feat(checks): port family 50-kernel
b7aca70 feat(checks): port family 40-decision-registries
5e60086 feat(checks): port family 30-agents-skills
133f0da feat(checks): port family 20-registries
d11d18f feat(checks): port family 10-rules
```
No renames; `scripts/checks/` deleted outright (8 files) in the barrier commit.

## Notes
Eight `general-purpose` agents (opus, MODE IMPLEMENT, tests in scope, none ran anything): six in wave 1 (registries, decision-registries, kernel, contracts, runtime part 1, runtime part 2), two as slots freed (rules, agents-skills). Follow-ups for Wave 6: fold the duplicated `isExecutable`, type `Registries.capabilities`/`agents`, port the six harness cases to `src/validate/validate.e2e.test.ts`. The 5(b) diff exceeds the 400-line PR guideline; per-family commits allow a split on request.
