# Audit remediation wave 2: port C32–C35 to the TypeScript validator, platform-aware exec-bit checks

**Date:** 2026-09-08
**Status:** approved (owner picked "U6 + validator tri-state" after wave 1; audit `.engineos/audits/2026-09-08-all.md`)
**Risk:** medium — validator and CI only, no hook that executes repository code, `git revert` undoes it. Blast radius: CI of this repo and any consumer running `validate`; four new checks can turn a consumer's CI red (MINOR per `docs/COMPATIBILITY.md`).
**Autonomy:** A2.

## Problem

1. `scripts/checks/80-portability.sh` (C32 adapter-mirror parity, C33 CRLF guard) and
   `scripts/checks/85-skill-enablement.sh` (C34 `skills`/`skills_suppressed` pair, C35
   domain emptied by disablement) run nowhere: the 1.7.0 port registered 62 ids ending at
   C31 (`src/checks/ids.ts`), `validate --only C34` exits 2, and the two bash files ship
   in the release zip and are allowlisted as "sourced libraries" in
   `scripts/package-release.sh` while nothing sources them. `ids.ts:2-3` claims the id
   list was verified against `grep '^check_C' scripts/checks/*.sh`, which is false.
2. Four checks (C18f adapter mode, C27 schema mode, C29 init script mode, C30 hook
   modes) read `stat().mode & 0o111`. On Windows libuv reports no execute bit for any
   regular file, so inside an unzipped artifact on `windows-latest` they fail regardless
   of the artifact (`passed 100, failed 4` on a tree ubuntu validates 104/0). Wave 1
   skipped the whole validator on the Windows leg of the `package` job as a stopgap.

## Decision

Port the four checks to `src/checks` as two new families, delete the bash, and make
the execute-bit reading tri-state so the validator answers "not representable here"
instead of "not executable" on Windows; then remove the wave-1 Windows skip.

Rejected: delete C32–C35 outright (the owner chose to keep the guards; C33 is the only
regression check on the EOL policy that broke 509 files once). Rejected: keep the
Windows skip and document it (the validator would stay unrunnable on one supported
platform, and the skip hides every other Windows-specific defect).

The bash files are not public surface (`docs/COMPATIBILITY.md` "What is public
surface": validator internals and scripts nothing invokes are not listed; the surface
is `validate-engineos.sh`, its flags, verdict lines and exit codes, which do not
change). Adding four ids to `--list` and four checks that can fail is MINOR.

## Frozen contracts

### Unit A — port C32–C35 (`src/checks/portability.ts`, `src/checks/portability.test.ts`, `src/checks/skill-enablement.ts`, `src/checks/skill-enablement.test.ts`, `src/checks/ids.ts`, `src/checks/index.ts`, `src/checks/index.test.ts`, `scripts/checks/80-portability.sh` and `scripts/checks/85-skill-enablement.sh` (deleted), `scripts/package-release.sh`)

Registration:
- `ids.ts`: append `'C32', 'C33', 'C34', 'C35'` after `'C31'`; rewrite the header comment
  (lines 2-3) so it states the truth: the ids are the bash families' ids as of the 1.7.0
  port plus the four ported in this wave, and the bash is gone.
- `index.ts`: `...PORTABILITY_CHECKS, ...SKILL_ENABLEMENT_CHECKS` appended after
  `RUNTIME_SURFACE_CHECKS` (bash source order 80, 85). Any "62" in comments becomes a
  statement that does not hard-code the count.
- Each family declares its codes with `as const` arrays and augments `CheckCodes` via
  `declare module './codes'`, exactly like `runtime-surface-adoption.ts`. Titles are one
  English sentence each; the shell prose is not carried over.
- Checks read the tree through `CheckContext` (`readText`, `exists`, `list`, `root`) and
  the kernel through `runKernel` from `../kernel/cli` with `memoryIo`, following the
  helper in `src/checks/kernel-lib.ts` (around line 87). No `child_process`, no `git`
  spawn: the check must give the same answer on an unzipped artifact and on a checkout,
  which is why the tree, not the index, is the source. This deliberately drops the bash's
  `git ls-files` branch; the consequence (an untracked file counts) is accepted and
  stated in the C32 comment.

C32 — id `C32`, title states that `.trae/skills` and `.windsurf/skills` are byte-identical
to `.agents/skills`:
- Gate: `skipPending(ctx, 'C32', C32_TITLE, '.agents/skills')` when the base dir is
  absent (mirrors enter the zip only with `--with-ide-mirrors`).
- Codes: `mirror-missing` (subject: mirror dir), `file-missing-in-mirror`,
  `file-diverged`, `file-only-in-mirror` (subject: `<mirror>/<rel>`). Compare bytes
  (`Buffer.equals`), recurse directories, sorted byte order.
- Tests (checkoutCopy + mutate): clean tree → `[]`; one mirror file edited → `file-diverged`;
  one mirror file deleted → `file-missing-in-mirror`; extra file in a mirror →
  `file-only-in-mirror`; `.trae/skills` removed → `mirror-missing`; `.agents/skills`
  removed → `artifact-pending`.

C33 — id `C33`, title states every POSIX-parsed text file is LF with `*.ps1` the one
`.gitattributes` exception:
- Walk the tree from `ctx.root`; consider files with extensions
  `.sh .md .json .jsonl .ts .tsx .mjs .cjs .yaml .yml .py .sql`; skip directories named
  `.git`, `node_modules`, `build`, `dist-release`, `.next`, `.claude`, `coverage` at any
  depth. A file whose bytes contain `0x0d` is a finding.
- Code: `crlf` (subject: path relative to root, `/`-separated). Cap the subjects
  reported at 5 in the rendered line only if `result()` has such a facility; otherwise
  report every offender (the renderer already lists codes).
- Tests: clean copy → `[]`; `rules/base.md` rewritten with CRLF → `crlf` with that
  subject; `install.ps1` rewritten with CRLF → no finding; a CRLF file planted under
  `node_modules/x/y.ts` in the copy → no finding.

C34 — id `C34`, title states the three answer sites (`route-path`, `route-intent`,
`resolve-task`) emit `skills` together with `skills_suppressed`:
- Pick the first `registries/routing.json` domain with a non-empty `skills` and a
  `sample_path`; if none, report through `skipPending` with subject
  `registries/routing.json` (a registry with no skill anywhere is not a broken tree).
- Run in-process: `route-path <sample_path>` → answer has both keys; `route-intent
  "create a new nestjs endpoint"` → `matches` empty or every match has both keys;
  `resolve-task --prompt "create a new nestjs endpoint"` → `task_contract` has both.
- Code: `answer-lacks-suppressed-pair` (subject: the arm name).
- Tests: clean copy → `[]`. Negative: the pair is produced by the kernel, not by the
  tree, so plant the breakage by pointing the check at a fake answer — structure the
  arm assertions as a pure function `pairFindings(arm, answer: unknown): Finding[]` and
  unit-test it with an object lacking `skills_suppressed`, plus one integration run on
  the clean copy.

C35 — id `C35`, title states that no routing domain is left without an enabled skill by
disablement:
- `readSkillState(ctx.root)` from `../kernel/skill-state`; for every routing domain
  with non-empty `skills`, if every declared skill is disabled → finding.
- Code: `domain-emptied-by-disablement` (subject: domain id).
- Tests: clean copy → `[]`; copy with `skills/nestjs-patterns/SKILL.md` frontmatter set
  to `enabled: false` → finding for `backend`; copy with `skills/adr/SKILL.md` disabled →
  `[]` (no domain declares it).

Removal:
- `git rm` both `scripts/checks/*.sh` (the directory disappears). Remove
  `./scripts/checks/*.sh` from `is_sourced_lib` in `scripts/package-release.sh`
  (`hooks/layout-manifest.sh|hooks/scaffold-layout.sh` stay). Verify with `bash -n` and
  one `bash scripts/package-release.sh --out <scratch>/rel` run; paste the verification
  block.
- `index.test.ts` keeps asserting ids registered exactly once; no count literal.

### Unit B — tri-state execute bit (`src/checks/runtime-surface-fs.ts`, `src/checks/runtime-surface-fs.test.ts` (new), `src/checks/kernel-lib.ts`, `src/checks/kernel-router.ts`, `src/checks/runtime-surface-modes.ts`, `src/checks/runtime-surface-adoption.ts`, `src/checks/runtime-surface-journal.ts`, `src/checks/runtime-surface-adoption.test.ts`, `src/checks/kernel.test.ts`, `.github/workflows/ci.yml` package job only)

- `runtime-surface-fs.ts`: `export type ExecutableBit = boolean | null;`
  `export function executableBit(root: string, relativePath: string, platform: NodeJS.Platform = process.platform): ExecutableBit`.
  `null` when `platform === 'win32'` — the comment says WHY: NTFS carries no POSIX mode
  and libuv reports none for regular files, so neither "executable" nor "not executable"
  is a fact about the file; the modes are asserted from the commit by
  `scripts/package-release.sh` and by this validator on POSIX runners. Otherwise
  `(mode & 0o111) !== 0`; a missing or unreadable file is `false`.
- `kernel-lib.ts`: `isExecutable(ctx, rel)` becomes `executableBit(ctx.root, rel)` and
  returns `ExecutableBit`; the duplicate `statSync` body goes away.
- Callers: a must-be-executable site reports only on `=== false` (C18f `adapter-not-
  executable`, C27 `schema-not-executable`, C29 `init-script-not-executable`, C30
  `hook-entry-point-is-not-executable`); the must-not-be-executable site (C30
  `library-carries-the-executable-bit`) reports only on `=== true`. `null` reports
  nothing in either direction. No other code path changes.
- Tests: new `runtime-surface-fs.test.ts` — on a temp root, a `0o755` file answers `true`
  and a `0o644` file `false` with platform `'linux'`, both answer `null` with platform
  `'win32'`, a missing file answers `false` on linux and `null` on win32. Existing chmod
  tests in `runtime-surface-adoption.test.ts` and `kernel.test.ts` keep every assertion.
- `ci.yml`, package job: remove both wave-1 `if [ "$RUNNER_OS" = "Windows" ]` blocks and
  their comment; `bash scripts/validate-engineos.sh` and `node dist/engineos.cjs validate`
  run unconditionally again. The lines you add are English; do not touch other lines.

### Orchestrator

`docs/COMPATIBILITY.md` "Unreleased" table gains two rows: C32–C35 (added, MINOR — a
consumer's CI can start failing on CRLF or mirror drift) and the execute-bit checks
(narrowed on Windows: not evaluated where the filesystem cannot answer). Barrier gate,
commit, PR.

## Out of scope

Prose that says "62-check" (U9), the console (U5), kernel fail-closed loaders (U7),
other CI hygiene (U8), `post-edit-check.ts`, `findUpAny` on Windows paths,
`install.ps1` scratch-profile parameter. If the Windows `package` leg fails after the
skip is removed for a reason other than execute bits, that is a barrier decision for
the orchestrator, not a change either unit makes.

## Verification

Orchestrator only, once: `npm run build`, `npm run typecheck`,
`node dist/engineos.cjs validate` (expect `passed 108, failed 0`), `npm test`,
gen-agent drift, `bash -n scripts/package-release.sh`. Tests are IN SCOPE for both
units (the checks' evidence is their planted-breakage cases). Neither agent runs
`npm run build` or `npm test`. Then commit, push, PR, watch CI on both package legs.
