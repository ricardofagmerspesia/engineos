---
name: 2026-09-08-audit-wave2-checks
status: in-progress
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
- [ ] C32–C35 registered, `validate --list` shows 108 ids, each family has planted-breakage tests
- [ ] bash checks deleted; package-release.sh no longer allowlists them
- [ ] execute bit tri-state; null on win32 reports nothing in either direction
- [ ] Windows skip removed from the package job; both legs green
- [ ] COMPATIBILITY.md Unreleased rows added
- [ ] dist rebuilt, typecheck, validate 108/0, tests green

## What was made
(pending)

## Verification
(pending)

## Human decisions
2026-09-08, Ricardo Fagmer: chose "U6 + validator tri-state" as the next unit and,
earlier, "port to src/checks" over deleting C32–C35. Risk classified medium, autonomy
A2; no HITL reason fires. Decision-rule keyword match `rule-large-change` (design-doc,
adr, architecture-review): design-doc is the spec; adr waived — a port that changes no
answer records no architectural choice; architecture-review is the barrier gate plus
this record.

## Changes registered
(pending)
