---
name: 2026-09-05-checks-wave5a
status: done
completed: 2026-09-05
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 5(a) of the TypeScript runtime migration (plan Tasks 33c, 33, 33b): the findings module (`src/checks/findings.ts`), the `engineos validate` harness with an explicit check registry (`src/checks/{ids,codes,lib,index}.ts`, `src/validate/cli.ts`) and the mirror runner plus the registry-to-doc pair table (`src/checks/{mirror,mirrors}.ts`). Contracts for the seven check families (Tasks 34-41) are frozen here.

## Why
Plan Wave 5. Sixty-two bash checks discover themselves by `declare -F`, report by printed sentence and re-derive section slicing fifteen times. The port makes the finding the value, the registry explicit and the mirror relation a table — the families then port against these three modules in parallel.

## Scope
`src/checks/ids.ts`, `src/checks/codes.ts`, `src/checks/findings.ts` + test; `src/checks/lib.ts`, `src/checks/index.ts`, `src/validate/cli.ts` + tests; `src/checks/mirror.ts`, `src/checks/mirrors.ts` + tests; `src/cli.ts` (`validate` arm); `dist/engineos.cjs`. `scripts/validate-engineos.sh` stays the bash driver until the last family ports (Wave 5(b)); the TS harness ships as `engineos validate` with an empty registry so the bash self-test keeps its 62-check discovery assertions green.

## Checklist
- [x] Findings module: `Finding`, `CheckResult`, `HARNESS_FINDINGS`, `finding`, `result`, `render`; `CheckId` union of the 62 ids; `CodeOf<C>` via module augmentation of `CheckCodes`
- [x] Harness: `Check`, `CheckContext`, `CHECKS`, `orderIds`, `runValidate` (`--only`, `--list`, exit 0/1/2, header, `passed N, failed N`), `skipOnce`, `skipPending`, `deferralsOf`
- [x] Mirror: `MirrorPair`, `MIRRORS` (15 checks' rows from the bash bodies, exact grep strings as data), `runMirrors` with the five invariants, `rowsOf`
- [x] `src/cli.ts` `validate` arm; `dist/engineos.cjs` rebuilt
- [x] Final gate run once at the end

## What was made
- `src/checks/ids.ts` (`CHECK_IDS`, 62 ids verified identical to `grep check_ scripts/checks/*.sh`, `CheckId`, `isCheckId`), `src/checks/codes.ts` (empty augmentable `CheckCodes` — families add `declare module './codes'` beside their `as const` code lists), `src/checks/findings.ts` (`Finding`, `CheckResult`, `HARNESS_FINDINGS`, `CodeOf<C>`, `CODE_PATTERN`, `finding()` type-gated and runtime-guarded, `result()` status derivation, `render()` as the single producer of validator lines, `isHarnessCode`). 22 tests incl. a `@ts-expect-error` negative.
- `src/checks/lib.ts` (`CheckContext`, `makeContext`, `skipOnce` -> one counted fail `precondition-missing:<token>` per token, `skipPending` -> one uncounted skip `artifact-pending:<path>`, keyed `once:`/`pending:` so they never collide, `deferralsOf` over `src/lib/deferrals`), `src/checks/index.ts` (`Check`, `CHECKS = []`, `orderIds` natural order, `selectIds` parent/sub-check selection), `src/validate/cli.ts` (`runValidate(argv, io, checks = CHECKS)`: `--only`/`--list`, `== EngineOS integrity ==`, `passed N, failed N`, exit 0/1/2, one shared context per run, a throwing check is one counted FAIL plus `validate: <id> threw: <msg>` on stderr). 35 tests.
- `src/checks/mirror.ts` (`resolveRegistryPath` with `.` / `[]` / `[id=<value>]` segments, `sliceSection` to the next `## `, `runMirrors` enforcing doc/section/registry non-emptiness, refusing a `names` row without `{x}` or a `quotes` row without `{n}`, frozen subjects `doc-missing:`, `section-missing:`, `section-empty:`, `registry-empty:`, `registry-ambiguous:`, `undeclared:`, `pattern-missing`, `pattern-ambiguous`, `<captured>!=<scalar>`), `src/checks/mirrors.ts` (26 rows over 11 checks: C16 5, C19b 2, C19c 2, C20c 1, C21b 2, C21e 3, C23 1, C24c 3, C25c 3, C26c 1, C27d 3; bash grep strings kept as data; three `both` rows on closed vocabularies). Additive to the design: `ignoreCase?: true` (gates ladder Title Case vs lowercase ids, C19c lowercases both sides) and the `[id=<value>]` segment. 17 tests; `runMirrors(MIRRORS)` over the shipped tree returns `[]`.
- `src/cli.ts` gains the `validate` arm; `docs/COMPATIBILITY.md` 1.7.0 names it and says the registry is empty until Wave 5(b). `dist/engineos.cjs` rebuilt.
- Delivered by three disjoint-scope agents in one wave (findings, harness, mirror); orchestrator wired `src/cli.ts`, COMPATIBILITY, and fixed one harness defect at the gate (the `== EngineOS integrity ==` header was not written).

## Verification
Run once, at the end, 2026-09-05, after asking:
```
$ npm run typecheck                          -> rc=0
$ npm test                                   -> tests 1036, pass 1036, fail 0 (first run: 7 fails in validate/cli.test — missing header line; fixed, rerun green)
$ gate driver (build, drift.sh, test-gen-agent-registry, evals, usage-report 30, test-route, test-kernel, validate, test-prompt-advisor, bench, test-exec-journal, test-telemetry, test-layout, test-docs, test-governance, test-verify, test-bypass, test-agent-announce, test-post-edit, test-install-hooks, self-test) -> rc=0 each
$ node dist/engineos.cjs validate            -> "no Checks registered", rc=2 (expected: empty registry until Wave 5(b))
```
`scripts/validate-engineos.sh` and `scripts/test-validate-engineos.sh` are untouched and green (62 checks, self-test discovery cases intact).

## Human decisions
2026-09-05 | Ricardo Fagmer | none fired | approved | Risk classified medium (reversible working-tree changes on a stacked branch, no external effect, private module surface — the new `engineos validate` arm is additive and documented), autonomy A2. Prompt-advisor "high-risk"/router-escalation/decision-rule (`rule-volatile-knowledge`) hook notes were keyword matches on agent-report text, not this work; waived. No HITL reason from `registries/policy.json` applies.

## Changes registered
```
$ git status --short (before commit)
 M dist/engineos.cjs
 M docs/COMPATIBILITY.md
 M src/cli.ts
?? .engineos/changes/2026-09-05-checks-wave5a.md
?? src/checks/
?? src/validate/

$ git diff --stat HEAD (before commit)
 dist/engineos.cjs           | 262 +++++++++++++++++++++++++++++++++-------
 docs/COMPATIBILITY.md       |  12 ++
 src/checks/codes.ts         |   9 ++
 src/checks/findings.test.ts | 133 +++++++++++++++++++++
 src/checks/findings.ts      |  85 +++++++++++++
 src/checks/ids.ts           |  77 ++++++++++++
 src/checks/index.ts         |  80 +++++++++++++
 src/checks/lib.test.ts      | 117 ++++++++++++++++++
 src/checks/lib.ts           |  94 +++++++++++++++
 src/checks/mirror.test.ts   | 188 +++++++++++++++++++++++++++++
 src/checks/mirror.ts        | 232 ++++++++++++++++++++++++++++++++++++
 src/checks/mirrors.test.ts  |  84 +++++++++++++
 src/checks/mirrors.ts       | 284 ++++++++++++++++++++++++++++++++++++++++++++
 src/cli.ts                  |   2 +
 src/validate/cli.test.ts    | 181 ++++++++++++++++++++++++++++
 src/validate/cli.ts         | 113 ++++++++++++++++++
 16 files changed, 1912 insertions(+), 41 deletions(-)

$ git log --oneline 91b2fd5..HEAD
585b723 build: rebuild dist/engineos.cjs with the validate arm
016ff6a feat(checks): mirror runner and the registry-to-doc pair table
e4ef1ba feat(checks): explicit check registry and validate harness
420a613 feat(checks): findings module — checks report values, the harness renders
```

## Notes
- Transitional decision: the bash validator stays CI's validator until the last family ports; `engineos validate` exits 2 (`no Checks registered`) until then. The bash self-test's `declare -F` discovery assertions therefore keep working unchanged.
- C28 has no registry side (`RETRIEVAL_METRICS` is a bash constant; assertions are doc-to-doc) — stays code in the 70-runtime family PR, or the metric list moves into a registry first.
- Family PR contract (Tasks 34-41): `const C<n>_FINDINGS = [...] as const` + `declare module './codes'`; include that check's mirror row ids in the list; keep the `skipOnce` precondition guard BEFORE `rowsOf()` (runMirrors reports `doc-missing:` otherwise); port bash `case_` rows to `<family>.test.ts` asserting codes; assert every declared code is produced by at least one case.
- Two mirror rows match across a line wrap (`precedence-domain-missing` for `ios-release`, `span-kind-missing`/`scope-vocabulary-missing`) — verified by the shipped-tree test, worth watching when the prose is edited.
- Plan says `deferralsOf` lives in `src/checks/lib.ts`; it wraps `src/lib/deferrals.ts` (Wave 4(b)) rather than duplicating it.
- An `index.test.ts` asserting `CHECKS` ids are unique belongs to the first family PR that registers a check.
