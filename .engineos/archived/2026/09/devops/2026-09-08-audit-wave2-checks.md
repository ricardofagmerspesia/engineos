---
name: 2026-09-08-audit-wave2-checks
status: done
completed: 2026-09-08
owner: Ricardo Fagmer
spec: docs/specs/2026-09-08-audit-wave2-checks.md
domain: devops
---

## What
Port the four bash-only validator checks (C32 adapter-mirror parity, C33 CRLF guard,
C34 skills/skills_suppressed pair, C35 domain emptied by disablement) to `src/checks`,
delete the dead bash, and make the validator's execute-bit reading tri-state so the
Windows leg of the `package` job runs the validator again instead of skipping it.

## Why
Audit HIGH 3: the four guards run nowhere since the 1.7.0 port; the bash ships in the
release zip unlinted. Audit HIGH 6 / wave-1 follow-up: exec-bit checks fail by
construction on NTFS, and wave 1 skipped the whole validator on Windows as a stopgap.

## Scope
src/checks/portability.ts (+ test), src/checks/skill-enablement.ts (+ test),
src/checks/ids.ts, src/checks/index.ts, src/checks/index.test.ts,
scripts/checks/80-portability.sh, scripts/checks/85-skill-enablement.sh (deleted),
scripts/package-release.sh,
src/checks/runtime-surface-fs.ts (+ new test), src/checks/kernel-lib.ts,
src/checks/kernel-router.ts, src/checks/runtime-surface-{modes,adoption,journal}.ts,
src/checks/runtime-surface-adoption.test.ts, src/checks/kernel.test.ts,
.github/workflows/ci.yml (package job), docs/COMPATIBILITY.md, dist/engineos.cjs.

## Checklist
- [x] C32–C35 registered, `validate --list` shows 108 ids, each family has planted-breakage tests
- [x] bash checks deleted; package-release.sh no longer allowlists them
- [x] execute bit tri-state; null on win32 reports nothing in either direction
- [x] Windows skip removed from the package job; both legs green
- [x] COMPATIBILITY.md Unreleased rows added
- [x] dist rebuilt, typecheck, validate 108/0, tests green

## What was made
- `src/checks/portability.ts` (C32 adapter-mirror parity, C33 CRLF guard) and
  `src/checks/skill-enablement.ts` (C34 `skills`/`skills_suppressed` pair on the three
  kernel answer sites, C35 no routing domain emptied by disablement), each with
  planted-breakage tests (25 cases). C32/C33 read the tree, never `git ls-files`, so an
  unzipped artifact and a checkout answer alike. C34 asserts through the in-process
  kernel (`kernelAnswer`); its arm assertions are the pure `pairFindings`.
- `ids.ts` carries C32–C35 (66 ids, 108 results); the header comment no longer claims a
  parity with bash that no longer exists. `scripts/checks/` deleted; `is_sourced_lib` in
  `scripts/package-release.sh` no longer allowlists it.
- `executableBit(root, rel, platform)` in `runtime-surface-fs.ts` is tri-state: `null` on
  win32. C18f, C27, C29, C30 report `not-executable` only on `false` and
  `library-carries-the-executable-bit` only on `true`. `kernel-lib.isExecutable` delegates.
- `.github/workflows/ci.yml` package job runs `validate-engineos.sh` and
  `dist/engineos.cjs validate` on Windows again (wave-1 skip removed).
- Three tests that hard-coded 62 ids / C31-last updated to 66 / C35.
- `.trae/skills` and `.windsurf/skills` synced with `.agents/skills` (200 files): C32
  caught drift from c7fc5ba the moment it ran. Owner chose sync over dropping the skills.
- `docs/COMPATIBILITY.md` Unreleased: two rows; `docs/CAPABILITIES.md` C32 count 47 -> 147.
- `dist/engineos.cjs` rebuilt.

## Verification
Run once at the barrier (2026-09-08): `npm run build` exit 0; `npm run typecheck` exit 0;
`node dist/engineos.cjs validate` -> `passed 108, failed 0` (after the mirror sync; before
it `passed 107, failed 1` with C32 reporting 200 `file-missing-in-mirror`); `npm test` ->
2055 tests, 4 failures, all four being the count literals and the clean-tree e2e above,
re-run green after the fixes (`findings.test`, `cli.test`: 43/43; `validate.e2e.test`:
6/6); gen drift (`gen-agent-commands.sh`, `gen-agent-registry.sh`): none;
`bash -n scripts/package-release.sh` exit 0 and a packager run from a probe commit green
(agent evidence). Windows CI leg runs the validator for the first time since wave 1 —
watched on the PR.

## Human decisions
2026-09-08, Ricardo Fagmer: chose "U6 + validator tri-state" as the next unit and,
earlier, "port to src/checks" over deleting C32–C35. Risk classified medium, autonomy
A2; no HITL reason fires. Decision-rule keyword match `rule-large-change` (design-doc,
adr, architecture-review): design-doc is the spec; adr waived — a port that changes no
answer records no architectural choice; architecture-review is the barrier gate plus
this record.

## Changes registered
- b9acfed docs(spec): audit wave 2 — port C32–C35, tri-state exec bit
- 32b9e06 feat(validate): port C32–C35 to src/checks, tri-state exec bit (22 files)
- 7cc6fbb chore(adapters): sync .trae and .windsurf skill mirrors with .agents/skills (200 files)
- <next> chore: record audit wave 2 (this record, CAPABILITIES count)

Residual: on Windows the four exec-bit checks assert nothing; mode integrity there rests
on `package-release.sh` reading modes from the commit plus the POSIX legs. Follow-ups
unchanged from wave 1: U5, U7, U8, U9/U10 (incl. "62-check" prose sites), U11,
`findUpAny` Windows paths, `install.ps1` scratch profile, `post-edit-check.ts`.
