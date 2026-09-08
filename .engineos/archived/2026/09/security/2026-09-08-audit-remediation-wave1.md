---
name: 2026-09-08-audit-remediation-wave1
status: done
completed: 2026-09-08
owner: Ricardo Fagmer
spec: docs/specs/2026-09-08-audit-remediation-wave1.md
domain: security
---

## What
Close the four #70-blocking units of the 2026-09-08 self-audit
(`.engineos/audits/2026-09-08-all.md`): Stop-gate root containment (U1),
return-banner bound (U3), installer secret-scan excludes (U2), and a `package` CI
job that asserts artifact properties instead of running the dev suite inside the
release zip (U4).

## Why
The audit confirmed the Stop gate executes `package.json` scripts from any
ancestor of an edited path, outside the adopted repo (reproduced). The `package`
job is red on `main` and on #70 by construction and hides an installer abort that
reaches real zip installs. #70 cannot merge green without U4, and should not
merge with U1 open.

## Scope
src/hooks/stop-verify.ts, src/hooks/verify-targets.ts (+ tests)
src/hooks/announce-agent-dispatch.ts, src/hooks/announce-agent-return.ts (+ tests)
install.sh, install.ps1
.github/workflows/ci.yml (package job), scripts/package-release.sh
dist/engineos.cjs (rebuilt)

## Checklist
- [x] U1: package dirs bounded to the adopted root; sibling and ancestor packages never run
- [x] U3: return banner through bannerField; `"` stripped in both banners
- [x] U2: non-git scan excludes node_modules, dist-release, build, .next in both installers
- [x] U4: package job asserts version, validate, kernel answer, scratch install; modes and CRLF read from the commit
- [x] security-reviewer re-pass on U1–U3 diff
- [x] dist rebuilt, typecheck, validator, tests green; PR #70 verify + package green

## What was made
- U1: `findUpAny(start, names, stop?)` gained a ceiling; `packageDirs(files, root)` walks
  from the realpath'd file dir with the realpath'd root as ceiling and keeps an owner only
  when its realpath is the root or under it. A sibling checkout, an ancestor package.json,
  and a committed symlink pointing outside the root no longer have their scripts run; a
  root reached through a symlinked form (`/tmp` vs `/private/tmp`) still verifies.
  Decision stays `silent` when nothing is contained.
- U3: `bannerField`/`MAX_TYPE_CHARS` exported from the dispatch hook; the return banner
  bounds `subagent_type` through them; `BANNER_UNSAFE` now strips `"`, `(`, `)`.
  Telemetry keeps the raw type so span open/close still match.
- U2: non-git fallback scan in `install.sh` and `install.ps1` excludes `node_modules`,
  `dist-release`, `build`, `.next`; git-tracked branch unchanged; WHY comments extended.
- U4: `package` CI job gains `needs: verify`, `timeout-minutes: 25`, `cache: npm`;
  `npm test` inside the artifact replaced by runtime assertions (`--version` parity,
  `validate`, one `route-path` answer, `HOME=<scratch> bash install.sh` registers hooks);
  idempotency step diffs the manifests minus the generated-at line. `package-release.sh`
  forces `core.autocrlf=false core.eol=lf` on both archives, reads CRLF and exec-bit
  checks from the commit (`git grep`, `git ls-tree`), drops dead `hooks/lib-*.sh` from
  the sourced-lib list, and checks `marketplace.json` version parity.
- Audit report line 46 reworded: it quoted a credential-shaped URL literally and tripped
  the installer's tracked-file scan (the suite caught it).
- `dist/engineos.cjs` rebuilt.

## Verification
- `npm run build`, `npm run typecheck`: clean.
- `node dist/engineos.cjs validate`: passed 104, failed 0.
- `npm test`: tests 2025, pass 2009, fail 0, skipped 16.
- gen-agent-commands / gen-agent-registry: no drift.
- `bash scripts/package-release.sh --out <scratch>/rel` on HEAD: 11 ok, 0 FAIL (U4 agent);
  `HOME=<scratch> bash install.sh` on the extracted zip with working-tree install.sh: exit 0,
  8 `engineos.cjs` hook entries.
- security-reviewer re-pass over U1–U3: PASS-WITH-NOTES; the two MEDIUMs (symlink under
  root followed; symlinked root form disabled the gate) and the LOW banner forgery were
  fixed in a second pass, each with a negative-control test proving the fix load-bearing.
- Not verified locally: `install.ps1` parse (no pwsh on this machine); the CI Windows leg
  exercises it. Windows leg of the install smoke omitted (install.ps1 has no scratch-profile
  parameter) — follow-up.

## Residual risk
- Containment on Windows paths is `/`-only in `findUpAny`/`parentOf`; the gate fails
  closed (silent) there rather than open. Follow-up unit.
- An adopted repo whose package.json sits above the git root gets no verification and no
  message. Accepted.
- Banner hardening bounds shape and size; imperative text within 64/160 chars still
  reaches hook context as quoted data.
- `post-edit-check.ts` shares the unbounded pattern; unwired, untouched (spec).
- Non-git installer fallback no longer scans `.next`/`build`; official tarballs already
  exclude them.

## Human decisions
2026-09-08, Ricardo Fagmer, reasons: high-risk (U1 edits a hook that executes
repository scripts outside the permission prompt). Approved: dispatch U1–U4 now,
land them on `fix/hook-hardening` (PR #70) together with the audit report; port
C32–C35 to `src/checks` in a later unit rather than deleting the bash. Not
approved in this wave: U5–U11.

## Changes registered
- M src/hooks/verify-targets.ts, src/hooks/verify-targets.test.ts
- M src/hooks/stop-verify.ts, src/hooks/stop-verify.test.ts, src/hooks/stop-verify.e2e.test.ts
- M src/hooks/announce-agent-dispatch.ts, src/hooks/announce-agent-dispatch.test.ts
- M src/hooks/announce-agent-return.ts, src/hooks/announce-agent-return.test.ts
- M install.sh, install.ps1
- M .github/workflows/ci.yml (package job), scripts/package-release.sh
- M dist/engineos.cjs (rebuilt)
- M .engineos/audits/2026-09-08-all.md (line 46 reworded)
- A docs/specs/2026-09-08-audit-remediation-wave1.md
- moved .engineos/changes/2026-09-08-audit-remediation-wave1.md -> .engineos/archived/2026/09/security/
- M package-lock.json — regenerated from package.json's declared ranges (typescript 5.9.3,
  @types/node 18.19.130); the dependabot typescript 7.0.2 bump had landed in the lock only and
  `npm ci` failed on main. Own commit 88c67dc; dist rebuilt with esbuild 0.28.2 in the same commit.
- Branch rebased onto origin/main (88ad7db) after PR #70 turned out merged; opened PR #78.
