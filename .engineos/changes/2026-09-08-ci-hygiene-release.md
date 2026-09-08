---
name: 2026-09-08-ci-hygiene-release
status: active
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
- [ ] Unit A workflows + dependabot (devops-coordinator)
- [ ] Unit B package-release.sh English + install.ps1 param + test comment (devops-coordinator)
- [ ] security-reviewer AUDIT over release.yml and install.ps1 diff
- [ ] Barrier: COMPATIBILITY rows, final gate, PR

## What was made
<filled on completion>

## Verification
<filled on completion>

## Human decisions
2026-09-08 | owner | release.yml on v* tag push; npm audit non-blocking on PRs + weekly blocking job; install.ps1 param + PSScriptAnalyzer + Windows run | approved | picked in-session via AskUserQuestion

## Changes registered
<filled on completion>

## Notes
Branch cut from main after #85-#90 merged; independent of #84 and #91.
