# Audit U8: CI hygiene, dependency audit cadence, release automation, installer verification

**Date:** 2026-09-08
**Status:** approved (owner picked U8 and settled the three forks in-session; audit
`.engineos/audits/2026-09-08-all.md` row U8, detail in the devops report)
**Risk:** medium. `release.yml` is new and holds `contents: write`; `install.ps1`
gains a parameter (installer = security-sensitive surface). Everything is
`git revert`-able and nothing fires without a human pushing a tag.
**Autonomy:** A3. The external effect (a GitHub Release) is gated by the owner
pushing a `v*` tag. `security-reviewer` AUDIT pass over `release.yml` and the
`install.ps1` diff before the final gate.

## Problem

1. `ci.yml` has no `concurrency` group and `verify`/`console` have no
   `timeout-minutes`; a hung step holds a runner for six hours and every push to
   a PR queues a full duplicate run.
2. `Tools present` (`ci.yml:25-29`) runs before `setup-node`, so it validates the
   runner's default node, not the one the jobs use.
3. `npm audit --audit-level=high` (`ci.yml:41-42`) blocks every PR. A new upstream
   advisory reddens unrelated work, and the fix is never in the PR that is red.
4. `.github/dependabot.yml` covers `/` only; `console/` has its own lockfile and
   receives no updates.
5. No release automation: 0 tags, 0 GitHub Releases; the only artifact is a CI
   upload that expires. `docs/release-notes/1.7.0.md` exists with nothing to attach to.
6. `install.ps1` is never linted or executed although `windows-latest` is in the
   package matrix. `src/install/install-hooks.e2e.test.ts:21` says "no PowerShell
   on CI", which is false. PowerShell's `$HOME` is read-only, so the installer
   cannot be pointed at a scratch profile without a parameter.
7. `scripts/package-release.sh` still prints Portuguese banners and writes a
   Portuguese manifest header (`# gerado:`, `# arquivos:`, `# sha256  caminho`),
   which `ci.yml:259-260` greps by the Portuguese key.

Already fixed in wave 1 (U4) and out of this unit: `needs: verify`, package
timeout, `cache: npm`, manifest-diff idempotency, `marketplace.json` version
parity, dead `lib-*.sh` glob. `scripts/checks/*.sh` no longer exists (U6), so the
"recursive lint" finding is moot.

## Decision

Two disjoint units in one wave, then a `security-reviewer` AUDIT pass, then the
final gate once.

- Release: `release.yml` triggers on `push: tags: ['v*']`. It uses the runner's
  `gh` CLI with `GITHUB_TOKEN` to create the Release, not a third-party action.
  Rejected: `softprops/action-gh-release` (one more SHA-pinned supply-chain
  dependency for what `gh release create` does natively). Rejected: manual
  `workflow_dispatch` only (owner chose the tag as the gate).
- Dependency audit: non-blocking on `pull_request`, blocking on push to `main`,
  plus a weekly scheduled workflow with manual dispatch that fails hard.
  Rejected: remove from the PR path entirely (advisories should still be visible
  on the PR, just not block it).
- Installer: `install.ps1` gains an optional `-ClaudeDir` parameter whose default
  is today's `Join-Path $HOME '.claude'`, so the no-argument path is unchanged.
  CI lints it with PSScriptAnalyzer and executes it against a scratch directory
  on the Windows leg of the package job. Rejected: PSScriptAnalyzer only (a lint
  that never runs the script would have missed the install.sh scan abort too).
- Shellcheck stays at `-S error`: `-S warning` currently fails on SC2034 in a
  sourced hook shim scheduled for removal at 2.0. Recorded, not changed.
- Manifest header keys become English. `ci.yml`'s idempotency grep changes in the
  same PR; the two files belong to different units, so the key is a frozen
  contract below.

## Frozen contracts

### Manifest header (package-release.sh writes it, ci.yml and release.yml read it)

```
# EngineOS release manifest
# version:    <version>
# commit:     <sha>
# generated:  <ISO-8601 UTC>
# files:      <count>
#
# sha256  path
```

The idempotency step strips lines matching `^# generated:`. Nothing else in the
manifest changes.

### install.ps1 parameter

```powershell
param(
    [string]$ClaudeDir = (Join-Path $HOME '.claude')
)
```

Must be the first statement after the header comments (PowerShell requires
`param` before any other code). Every later `Join-Path $HOME '.claude'` derives
from `$ClaudeDir`. Success output unchanged. CI asserts that, after running
`pwsh -File install.ps1 -ClaudeDir <scratch>`, `<scratch>\settings.json`
contains `engineos.cjs` — the same assertion the Linux leg makes for install.sh.

### release.yml behaviour

- `on: push: tags: ['v*']`; `permissions: contents: write` at workflow level
  (this is the one workflow that needs it); every action SHA-pinned like ci.yml.
- Steps: checkout with `fetch-depth: 0`; setup-node 20; `npm ci`; assert the tag
  equals `v$(node -p "require('./package.json').version")` and fail otherwise;
  `bash scripts/package-release.sh --out dist-release`; verify the sha256;
  `gh release create "$GITHUB_REF_NAME" dist-release/*.zip dist-release/*.sha256
  dist-release/*.MANIFEST.txt --title "EngineOS $GITHUB_REF_NAME"` with
  `--notes-file docs/release-notes/<version>.md` when that file exists and
  `--generate-notes` otherwise. `timeout-minutes: 20`.
- No publish to npm or any registry. No `workflow_dispatch`.

## Amended at the security re-pass

`security-reviewer` returned MERGE WITH FIXES (2 MEDIUM, 4 LOW, 2 INFO). Applied:

- `release.yml`: `persist-credentials: false` on checkout and no `npm ci`
  (`package-release.sh` archives the committed `dist/` and runs no
  `node_modules` code), so the write-capable token never sits in `.git/config`
  beside dependency lifecycle scripts. A `Tagged commit is on main` step asserts
  `git merge-base --is-ancestor "$GITHUB_SHA" origin/main`, so a tag on an
  arbitrary commit cannot run that commit's own workflow with `contents: write`.
  `VERSION` reaches `$GITHUB_ENV` in delimiter form.
- `ci.yml`: PSScriptAnalyzer pinned (`-RequiredVersion 1.25.0 -Repository
  PSGallery`), the one previously unpinned third-party dependency in CI.
- `install.ps1`: `[ValidateNotNullOrEmpty()]` on `-ClaudeDir`, the value made
  absolute against the caller's location, a target inside the repository
  refused (it would rewrite the repo's own `CLAUDE.md`), and the two success
  strings now print the real path instead of a `~/.claude` literal.

Accepted residuals, recorded here and in the change record: no tag protection
or rulesets are available on the repository's GitHub plan, so "the tag is the
human gate" rests on push access (two collaborators); the secret gates in
`install.ps1`, `install.sh` and `package-release.sh` read an undecodable file as
clean (pre-existing, unchanged by this unit); the release checksum is produced
and verified by the same job (provenance attestation needs a plan that allows
`attestations: write`).

## Unit A: workflows and dependabot (devops-coordinator)

Files: `.github/workflows/ci.yml`, `.github/workflows/release.yml` (new),
`.github/workflows/dependency-audit.yml` (new), `.github/dependabot.yml`.

- `ci.yml`: workflow-level `concurrency: { group: ci-${{ github.workflow }}-${{
  github.ref }}, cancel-in-progress: ${{ github.event_name == 'pull_request' }} }`
  (pushes to main are never cancelled). `timeout-minutes`: verify 20, console 15.
  Move `Tools present` after `setup-node`. `Dependency audit` step gets
  `continue-on-error: ${{ github.event_name == 'pull_request' }}`. Idempotency
  grep switches to `^# generated:`. Package job Windows leg adds, after the
  install.sh assertion: a PSScriptAnalyzer step (`Invoke-ScriptAnalyzer -Path
  install.ps1 -Severity Error,Warning -EnableExit`, installing the module with
  `Install-Module PSScriptAnalyzer -Force -Scope CurrentUser` if absent;
  **amended at the barrier:** `-ExcludeRule PSAvoidUsingWriteHost,
  PSUseShouldProcessForStateChangingFunctions,PSAvoidUsingEmptyCatchBlock`, since
  both agents reported those Warning-severity rules fire on the installer's
  legitimate style) and an
  install.ps1 run against `$(mktemp -d)` asserting `settings.json` contains
  `engineos.cjs`. Both steps `if: matrix.os == 'windows-latest'`, `shell: pwsh`.
  `upload-artifact` gets `retention-days: 30`.
- `dependency-audit.yml`: `schedule: cron "0 7 * * 1"` + `workflow_dispatch`;
  `permissions: contents: read`; `npm ci && npm audit --audit-level=high` at `/`
  and in `console/`; `timeout-minutes: 15`.
- `release.yml`: per the frozen contract.
- `dependabot.yml`: add `npm` at `/console` weekly; `open-pull-requests-limit: 5`
  on every npm entry; `groups` collecting minor+patch updates per directory.
- Every line added is English. Comments say WHY (the cancel-in-progress
  exception, the write permission, the PR non-blocking).
- Verify locally with `node -e` YAML parse is unavailable; use
  `python3 -c 'import yaml'` if present, otherwise `npx --yes yaml@2 ...` is
  NOT allowed (no new deps) — rely on careful quoting and report that CI is the
  parser. Colons inside unquoted step names break the file; quote them.

## Unit B: packaging script and installer (devops-coordinator)

Files: `scripts/package-release.sh`, `install.ps1`,
`src/install/install-hooks.e2e.test.ts` (comment at line 21 only).

- `package-release.sh`: every Portuguese word in echo output, comments and the
  manifest header becomes English; manifest header per the frozen contract.
  Behaviour otherwise identical; `bash -n` clean; one local run
  `bash scripts/package-release.sh --out <scratchpad>/rel` pasted in the return.
- `install.ps1`: the `param` block per the contract; replace every
  `Join-Path $HOME '.claude'` with `$ClaudeDir`; user-facing strings that say
  `~/.claude` keep saying it when the default is in use. No other behaviour
  change. No pwsh is available locally; state that in the return so the
  orchestrator knows CI's Windows leg is the first execution.
- Test comment: replace "install.ps1 mirrors this logic and is unverified here
  (no PowerShell on CI)" with the truth: it is exercised by the package job's
  Windows leg, not by this suite.

## Barrier (orchestrator)

`docs/COMPATIBILITY.md` Unreleased rows: `install.ps1 -ClaudeDir` (added),
manifest header keys (changed), `release.yml` (added), `dependency-audit.yml`
(added). `security-reviewer` AUDIT over `release.yml` and the `install.ps1`
diff. Final gate: `npm run typecheck`, `node dist/engineos.cjs validate`,
`npm test`, `bash -n scripts/package-release.sh`, `shellcheck -S error
scripts/package-release.sh`, `git diff --check`. Tests are NOT in scope for
either unit (no runtime code changes); the e2e edit is a comment.

## Out of scope

`shellcheck -S warning` (SC2034 in a 2.0-removal shim); npm publish; console
source; Windows path containment in `findUpAny`; `post-edit-check.ts`.
