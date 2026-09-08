# Audit remediation wave 1: Stop-gate containment, banner bound, installer scan, package job

**Date:** 2026-09-08
**Status:** approved (owner picked U1–U4 in-session; audit `.engineos/audits/2026-09-08-all.md`)
**Risk:** high — U1 changes a security-sensitive hook that executes repository
scripts outside the tool-permission prompt. U2 medium (narrows a secret scan),
U3 low, U4 medium (CI-only, reversible). The wave takes the highest tier.
**Autonomy:** A3 — human approved the wave; `security-reviewer` re-pass on U1–U3
before the final gate; rollback is `git revert` of the wave commit plus
`npm run build`.

## Problem

1. `src/hooks/stop-verify.ts:93` gates on `.engineos/` at the session repo root,
   but `packageDirs` (`:187-194`) walks every edited `file_path` upward with
   `findUpAny` to `/`. Any `package.json` above an edited file runs its `lint` and
   `typecheck` scripts: a second non-adopted checkout touched in the session, or a
   `package.json` planted in world-writable `/private/tmp` above a scratchpad.
   Reproduced by the audit.
2. `src/hooks/announce-agent-return.ts:19` re-emits `subagent_type` verbatim into
   PreToolUse context; the `bannerField` bound from 567d0db landed on the dispatch
   hook only. `BANNER_UNSAFE` does not strip `"`.
3. `install.sh:33` and `install.ps1:60-67` fall back to a recursive filesystem scan
   when the install dir is not a git work tree. `node_modules/@types/node/*.d.ts`
   matches the credential-in-URL alternation, so an install from the release zip
   aborts once `npm ci` has run. This is the abort behind the red `package` CI job.
4. `.github/workflows/ci.yml:199` runs `npm test` inside the extracted release
   artifact, whose inputs (`test/fixtures/legacy-*`, `.engineos/archived/**`,
   `.git`) do not ship: 24 failures, red on `main` and on PR #70.
   `scripts/package-release.sh:139-163` tests the exec bit with `[ -x ]`, which on
   MSYS answers from the shebang, and tests CRLF with `grep -U` on extracted files,
   which reflects the extractor's EOL conversion, not the artifact.

## Decision

Four disjoint units, one wave, then a `security-reviewer` re-pass on U1–U3 and the
final gate once. Rejected alternative: make the `package` job non-blocking
(`continue-on-error`) and leave U4 for later. Rejected because the job hides the
install.sh abort that reaches real users, and because U2's fix needs a gate that
exercises the zip install path or it regresses silently.

## Frozen contracts

### U1 — Stop-gate root containment (`src/hooks/stop-verify.ts`, `src/hooks/verify-targets.ts`, `src/hooks/verify-targets.test.ts`, `src/hooks/stop-verify.test.ts`, `src/hooks/stop-verify.e2e.test.ts`)

- `findUpAny(start, names, stop?: string)` in `verify-targets.ts`: when `stop` is
  given, the walk probes `stop` itself and never ascends above it; a `start` that
  is not `stop` or under `stop + '/'` returns `null` without probing. Existing
  two-argument callers keep their behaviour.
- `packageDirs(files, root)` in `stop-verify.ts`: calls
  `findUpAny(dirname(file), PACKAGE_MARKERS, root)`; a returned owner is kept only
  if `owner === root || owner.startsWith(root + '/')`.
  **Amended at the security re-pass:** containment is decided on PHYSICAL paths.
  `root`, the walk's start (`dirname(file)`) and every returned owner go through
  `realpathSync` (a root that fails to resolve returns no packages; an owner that
  fails is skipped). Reason: the lexical form let a committed symlink under the
  root (`vendor -> /outside`) run `/outside`'s scripts, and disabled the gate
  silently whenever git's `--show-toplevel` (`/private/tmp/x`) and the
  transcript's path form (`/tmp/x/...`) disagreed. The decision stays `silent`
  when nothing is contained: edits outside the repo are routine.
  The comment says WHY: consent was given for THIS repo; a package above the root
  or beside it never consented.
- `post-edit-check.ts` is unwired and out of scope; do not touch it. Report under
  `### Out of scope` if it shares the pattern.
- Tests (in scope, this is the fix's evidence): `findUpAny` with `stop` — marker
  at stop found, marker above stop not found, start outside stop returns null;
  stop-verify unit: adopted root, transcript edits a file in a sibling directory
  carrying a red `lint` script → decision `silent`, spawn never called; adopted
  root nested inside an outer directory with a `package.json` → the outer package
  is not in the run set. Keep every existing assertion.

### U3 — Return banner bound (`src/hooks/announce-agent-dispatch.ts`, `src/hooks/announce-agent-return.ts`, their two test files)

- `announce-agent-dispatch.ts` exports `bannerField` and `MAX_TYPE_CHARS`
  (currently module-private). `BANNER_UNSAFE` becomes
  `/[\u0000-\u001f\u007f`"()]/g` (adds the double quote; the parentheses were
  added at the security re-pass so a type cannot forge a second `agent(type=...)`
  field). Nothing else in the dispatch hook changes.
- `announce-agent-return.ts`: `returnBanner(bannerField(type, MAX_TYPE_CHARS))`.
  The telemetry path keeps `hookSlug(type)` on the RAW type: `spanIdFrom` and the
  `agent` field must keep matching what the dispatch hook wrote.
- Tests: dispatch — a description containing `"` yields a banner without `"`;
  return — a 2 KB `subagent_type` with a newline, a closed code fence and a
  backtick yields a single-line banner whose `type=` field is at most
  `MAX_TYPE_CHARS + 3` characters and contains none of those characters.
- U1 and U3 both change `src/hooks/**` and both need `dist/engineos.cjs` rebuilt.
  They run as ONE agent so no two agents write under `src/hooks/`. The agent does
  NOT run `npm run build`; the orchestrator rebuilds at the barrier.

### U2 — Installer scan excludes (`install.sh`, `install.ps1`)

- `install.sh:33` non-git branch adds
  `--exclude-dir=node_modules --exclude-dir=dist-release --exclude-dir=build --exclude-dir=.next`.
  The git branch (`:31`) is unchanged: tracked files are the scan's definition.
- `install.ps1` non-git branch: the `Where-Object` filter also excludes paths
  matching `\\(node_modules|dist-release|build|\.next)\\`.
- One comment at each site, in English, saying WHY: dependency and build output
  is not "secrets in the repo" and only produces false positives (the existing
  header comment at `install.sh:20-22` already argues this for the git branch —
  extend it, do not duplicate it).
- No test change: `src/install/install-hooks.e2e.test.ts` already asserts exit 0
  on a scratch install and will start passing in the package job once U4 runs it
  against the zip.

### U4 — Package job asserts artifact properties (`.github/workflows/ci.yml` package job only, `scripts/package-release.sh`)

`ci.yml`, `package` job:
- `needs: verify`; `timeout-minutes: 25`; `cache: npm` on `setup-node`.
- The extraction step keeps `sha256sum -c`, `unzip`, `bash scripts/validate-engineos.sh`,
  `npm ci --no-audit --no-fund`, `npm run typecheck`, and REPLACES `npm test` with a
  runtime smoke run from inside the extracted tree:
  - `node dist/engineos.cjs --version` equals the `version` in `package.json`;
  - `node dist/engineos.cjs validate` exits 0;
  - one kernel answer, e.g. `bash scripts/kernel.sh route-path <a path the
    registry routes>` exits 0 and prints JSON (read `src/kernel/cli.ts` for the
    exact argv);
  - `HOME="$(mktemp -d)" bash install.sh` exits 0 and the scratch
    `$HOME/.claude/settings.json` contains the EngineOS hooks (read `install.sh`
    for the flags it needs to run unattended; use them).
  - Windows leg only: `pwsh -File install.ps1` against a scratch profile with the
    same assertion. If install.ps1 cannot be pointed at a scratch profile without
    changing it, DO NOT change install.ps1 (U2 owns it): leave the step out and
    return `DEGRADED` naming the missing flag.
- The idempotency step compares the two `*.MANIFEST.txt` files with the
  `# gerado:` / generated-at line stripped, and fails on a diff; the zip hash
  echo goes away.
- Lines you add or change are in English. Lines you do not touch stay as they
  are (the English sweep is a later unit).

`scripts/package-release.sh`:
- Both `git archive` calls run as `git -c core.autocrlf=false -c core.eol=lf archive ...`.
- Check 1 (CRLF) reads the COMMIT, not the extracted stage:
  `git grep -lI $'\r' "$COMMIT" -- <the same extension list>` restricted to
  `"${PATHS[@]}"`; `*.ps1` stays excluded from the list as today.
- Check 2 (exec bit) reads modes from `git ls-tree -r "$COMMIT" -- "${PATHS[@]}"`:
  a `*.sh` that `is_sourced_lib` must be `100644`, any other `*.sh` must be
  `100755`. Remove `./hooks/lib-*.sh` from `is_sourced_lib` (the files are gone).
  `./scripts/checks/*.sh` stays listed (the C32–C35 decision is a later unit).
- Version parity (`:93-97`) also checks `.claude-plugin/marketplace.json`.
- Messages on lines you touch are English; untouched lines stay.
- Verify locally with `bash -n scripts/package-release.sh` and one run of
  `bash scripts/package-release.sh --out <scratchpad>/rel` on HEAD; paste the
  verification block's output in the return.

## Out of scope

Console (U5), C32–C35 (U6, decision: port to `src/checks`), kernel fail-closed
loaders (U7), CI hygiene beyond the package job (U8), prose and English sweeps
(U9, U10), console hygiene (U11), `post-edit-check.ts`.

## Verification

At the barrier, orchestrator only: `npm run build`, `npm run typecheck`,
`node dist/engineos.cjs validate`, `npm test`, gen-agent drift check; then a
`security-reviewer` AUDIT pass over the U1–U3 diff; then commit, push, and watch
PR #70's `verify` and `package` jobs. Tests are IN SCOPE for U1 and U3 (the fix's
evidence) and out of scope for U2 and U4.
