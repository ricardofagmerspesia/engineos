---
name: 2026-09-08-ci-hygiene-release
status: done
completed: 2026-09-08
owner: ricardo.fagmer
spec: docs/specs/2026-09-08-ci-hygiene-release.md
domain: devops
---

## What
Audit U8: `ci.yml` concurrency/timeouts/step order, `npm audit` non-blocking on PRs plus a weekly blocking audit workflow, dependabot for `console/`, `release.yml` on `v*` tags creating a GitHub Release with the packaged artifact, `install.ps1 -ClaudeDir` parameter with PSScriptAnalyzer and a real run on the Windows CI leg, English packaging script and manifest header.

## Why
`.engineos/audits/2026-09-08-all.md` row U8 and the devops report: hung runs and duplicate PR runs, advisories reddening unrelated PRs, no release path, an installer nobody has ever executed on CI, Portuguese output in the release tooling.

## Scope
Two disjoint units (spec "Frozen contracts"), then security-reviewer on the installer and release workflow, then the final gate. One PR.

## Checklist
- [x] Unit A workflows + dependabot (devops-coordinator)
- [x] Unit B package-release.sh English + install.ps1 param + test comment (devops-coordinator)
- [x] security-reviewer AUDIT over release.yml and install.ps1 diff
- [x] Barrier: COMPATIBILITY rows, final gate, PR

## What was made
- `.github/workflows/ci.yml`: per-ref `concurrency` (cancel-in-progress on pull_request only), `timeout-minutes` verify 20 / console 15, `Tools present` after `setup-node`, `Dependency audit` `continue-on-error` on pull_request, idempotency grep on `^# generated:`, Windows-only PSScriptAnalyzer (pinned 1.25.0, three installer-style rules excluded with the reason in a comment) and a real `install.ps1 -ClaudeDir <scratch>` run asserting `settings.json` contains `engineos.cjs`, `retention-days: 30`.
- `.github/workflows/release.yml` (new): `v*` tag push, `contents: write`, checkout `persist-credentials: false`, no `npm ci`, tagged commit must be an ancestor of `origin/main` and equal `v<package.json version>`, `package-release.sh`, `sha256sum -c`, `gh release create` with zip + sha256 + manifest, notes from `docs/release-notes/<version>.md` or generated.
- `.github/workflows/dependency-audit.yml` (new): weekly Monday 07:00 UTC + dispatch, blocking `npm audit --audit-level=high` for `/` and `console/`.
- `.github/dependabot.yml`: npm `/console` weekly, `open-pull-requests-limit: 5`, minor+patch groups.
- `install.ps1`: `param([ValidateNotNullOrEmpty()][string]$ClaudeDir = (Join-Path $HOME '.claude'))`, made absolute, refused inside the repository, success strings print the real path.
- `scripts/package-release.sh`: English banners, comments and manifest header (`# generated:`, `# files:`, `# sha256  path`).
- `src/install/install-hooks.e2e.test.ts`: comment now names the Windows CI leg as install.ps1's coverage.
- `docs/COMPATIBILITY.md`: four Unreleased rows. Spec carries the security re-pass amendments.

## Verification
2026-09-08, orchestrator, on the integrated tree:
- `npm run typecheck`: clean. `node dist/engineos.cjs validate`: `passed 110, failed 0` (main's dist; 113 once #91 merges).
- `npm test`: `# tests 2074 / # pass 2058 / # fail 0 / # skipped 16`.
- `bash -n scripts/package-release.sh` and `shellcheck -S error scripts/package-release.sh`: clean; Unit B ran the script for real: 11 ok / 0 FAIL, manifest header matches the contract.
- `git diff --check`: clean.
- YAML: no local parser available (no python yaml, no new deps); GitHub Actions is the parser of record, checked on the PR's CI run.
- `install.ps1`: no PowerShell on this machine; first execution is the PR's windows-latest package leg.
- security-reviewer AUDIT: MERGE WITH FIXES; 2 MEDIUM + 3 LOW fixed in the same commit, 1 LOW accepted as pre-existing (unreadable-file secret-gate blind spot), 2 INFO noted.

## Human decisions
2026-09-08 | owner | high-risk, external-effect (release.yml holds contents: write and publishes a GitHub Release) | approved with the tag as the gate: nothing fires until the owner pushes a v* tag; rollback = delete the Release and the tag, or `git revert` the workflow | first v* tag push is a separate, later human action
2026-09-08 | owner | release.yml on v* tag push; npm audit non-blocking on PRs + weekly blocking job; install.ps1 param + PSScriptAnalyzer + Windows run | approved | picked in-session via AskUserQuestion

## Changes registered
- Branch `feat/ci-hygiene-release` off main; commits: spec + record, `ci: hygiene, weekly dependency audit, tag-driven release, installer verification`, record close. One PR to main.
- Residual risks accepted (spec "Amended at the security re-pass"): no tag protection on this GitHub plan; secret gates read undecodable files as clean; checksum produced and verified by the same job.
- What to watch after merge: first PR run's windows-latest package leg (PSScriptAnalyzer install + install.ps1 first execution); first `v*` tag run of release.yml.

## Notes
Branch cut from main after #85-#90 merged; independent of #84 and #91.
