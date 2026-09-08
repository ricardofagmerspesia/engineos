---
name: 2026-09-04-journal-wave2
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 2 of the TypeScript runtime migration: `scripts/exec-journal.sh` and
`scripts/telemetry.sh` ported to `src/journal/` behind the `journal` and
`telemetry` commands of `dist/engineos.cjs`; both bash files become shims.

## Why
Plan Tasks 14, 15 (`docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
Wave 2). The span schema is spelled seven times in bash and sed-parsed back
into agreement by C27e; the port declares it once (design "Journal schema",
deviation 4).

## Scope
- `src/cli.ts` (registers `journal`, `telemetry`) — frozen by the orchestrator
- Task 14: `src/journal/{schema,exec-journal,cli}.ts` + tests,
  `scripts/exec-journal.sh` (shim), `scripts/checks/70-runtime.sh` (C27 shrink,
  C27e + `ej_*` deleted), `scripts/test-exec-journal.sh`,
  `scripts/test-validate-engineos.sh`, `docs/COMPATIBILITY.md`
- Task 15: `src/journal/{telemetry,telemetry-cli}.ts` + tests,
  `scripts/telemetry.sh` (shim), `scripts/test-telemetry.sh`
- `test/fixtures/legacy-journal/` (byte copies for parity), `dist/engineos.cjs`

Branch `feat/journal-wave2` cut from `feat/kernel-wave1d` (f0c5c8e).

## Checklist
- [x] Task 14: schema table, append/validate/usage from the table, shim, C27 shrunk, C27e gone
- [x] Task 15: telemetry append/validate, shim
- [x] Final gate: typecheck + unit tests + build + test-exec-journal + test-telemetry +
      validator + validator self-test + hooks suites + bench, once, after asking

## What was made
- `src/journal/schema.ts`: the one 22-row span table (`EXEC_JOURNAL_FIELDS`,
  `Guard`/`JsonType`/`Presence`/`FieldSpec`, `SLUG_RE`); enum members resolved
  from registries via `JournalRegistries` (models + policy + exec_journal
  policy), no vocabulary literal. `src/journal/exec-journal.ts`: parse, append,
  validate and usage all walk the table; `src/journal/cli.ts` `runJournal`.
  `src/registry/policy-exec-journal.ts` strict reader for
  `telemetry.exec_journal` (256 fallback kept).
- `src/journal/telemetry.ts` + `telemetry-cli.ts` `runTelemetry`;
  `src/registry/policy-telemetry.ts` strict reader for `telemetry`
  (home, retention_days, value_pattern, events[].id/keys); `jqCompact`
  reproduces jq 1.6 number formatting so append bytes match.
- `src/cli.ts` registers `journal` and `telemetry`; `scripts/exec-journal.sh`
  and `scripts/telemetry.sh` are shims over `dist/engineos.cjs`.
- Parity: `test/fixtures/legacy-journal/{exec-journal,telemetry}.sh` byte
  copies + README; `src/journal/parity.test.ts`, `telemetry-parity.test.ts`
  (skip without bash/jq). 0 mismatches on append bytes, validate verdicts,
  exit codes.
- Checks: C27e and the ten `ej_*` sed parsers deleted; C27 shrunk to policy
  well-formedness + writer existence; `lib.sh` `EJ_POLICY_TS`; C27 span-kind
  rename canary moved to C27d; C27b canaries mutate `dist/engineos.cjs`.
  Validator total 106 -> 105. `README.md` check count 44 -> 63.
  `policy.json` exec_journal note no longer names the deleted bash constant.
- Suites: `test-exec-journal.sh` reads statuses from policy.json instead of the
  bash text; `test-telemetry.sh` missing-runtime case asserts rc!=0 and no line
  written.
- `docs/COMPATIBILITY.md`: MINOR notes for both shims.

## Verification
Run once at the end, after asking (2026-09-04). Fix loop: 2 rounds, test-only.
```
npm run typecheck                    rc=0
npm test                             # tests 469 / pass 469 / fail 0
npm run build                        rc=0
bash scripts/test-exec-journal.sh    passed 56, failed 0
bash scripts/test-telemetry.sh       passed 16, failed 0
bash hooks/test-route.sh             pass=41 fail=0
bash scripts/test-kernel.sh          passed 334, failed 0
bash hooks/test-prompt-advisor.sh    65 passed, 0 failed
bash scripts/validate-engineos.sh    passed 105, failed 0
bash scripts/bench-runtime.sh
  route-intent: median=37.2ms budget<250.0ms
  resolve-task: median=40.6ms budget<500.0ms
  prompt-advisor (end to end): median=267.6ms budget<600.0ms
  route-before-change (cache hit): median=61.7ms budget<150.0ms
bash scripts/test-validate-engineos.sh   passed 140, failed 0
```
Red -> green: `exec-journal.test.ts` assumed an empty flag value hits the row
guard; bash (and the port) treat empty as unset: required row -> usage,
optional row -> guard text, timestamp -> defaulted. Tests now encode that rule.

## Human decisions
None fired: risk low-to-medium (two CLIs behind shims; `git revert` undoes it;
no external effect), autonomy A2.

## Changes registered
```
 M README.md
 M dist/engineos.cjs
 M docs/COMPATIBILITY.md
 M registries/policy.json
 M scripts/checks/70-runtime.sh
 M scripts/checks/lib.sh
 M scripts/exec-journal.sh
 M scripts/telemetry.sh
 M scripts/test-exec-journal.sh
 M scripts/test-telemetry.sh
 M scripts/test-validate-engineos.sh
 M src/cli.ts
?? .engineos/changes/2026-09-04-journal-wave2.md
?? src/journal/
?? src/registry/policy-exec-journal.ts
?? src/registry/policy-telemetry.ts
?? test/fixtures/legacy-journal/
```
```
 README.md                         |   2 +-
 dist/engineos.cjs                 | 564 +++++++++++++++++++++++++++++++++++++-
 docs/COMPATIBILITY.md             |  59 ++++
 registries/policy.json            |   2 +-
 scripts/checks/70-runtime.sh      | 248 ++---------------
 scripts/checks/lib.sh             |   4 +
 scripts/exec-journal.sh           | 453 +-----------------------------
 scripts/telemetry.sh              | 118 +-------
 scripts/test-exec-journal.sh      |  16 +-
 scripts/test-telemetry.sh         |  16 +-
 scripts/test-validate-engineos.sh |  91 +++---
 src/cli.ts                        |   4 +-
 12 files changed, 726 insertions(+), 851 deletions(-)
```

## Residual risk
- Telemetry port is stricter than jq on trailing-newline values (`$` semantics);
  safe direction, documented in the parity test.
- Strict telemetry loader now requires `home`/`retention_days` (C22a already
  did).
- `hooks/stop-verify.sh:159` comment says telemetry.sh needs jq; stale, Wave 3
  owns that file.
- `policy.json .telemetry.exec_journal.schema` still points at the shim path.

## Notes
Wave A = Task 14, Task 15 in parallel (disjoint: 70-runtime.sh and
COMPATIBILITY.md belong to Task 14 only; Task 15 reports check/doc needs).

Wave A landed. Task 14: `JournalRegistries` (models+policy+execJournal) replaces
the plan's `Registries` in `FieldSpec.values` (kernel Registries has no
exec_journal block); `timestamp` is `required` and defaulted before the
completeness loop (`DEFAULTED_FIELD`, the only field name outside schema.ts);
`\u007f` escaped like jq; C27 span-kind-rename canary moved to C27d. Task 15:
`jqCompact` reimplements jq 1.6 number formatting (`-0`, `1e-06`, `1e+16`);
strict `.telemetry` loader (home/retention_days now required, C22a already
demanded them); trailing-newline values rejected where jq's `$` accepted them;
usage names `scripts/telemetry.sh` not `$0`; missing-runtime suite case asserts
rc!=0 and no line written. Orchestrator: appended telemetry README section and
COMPATIBILITY note, fixed policy.json exec_journal note clause, README check
count 44->63, dist rebuilt.
