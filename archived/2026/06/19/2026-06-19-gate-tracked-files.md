---
name: 2026-06-19-gate-tracked-files
status: done
completed: 2026-06-19
owner: Ricardo Fagmer
---

## What
Secrets gate now scans git-TRACKED files only (with a recursive fallback when not a
git work tree), instead of the whole directory. Moved the pattern-compile probe
inside `set +e` (it was aborting under set -e/pipefail on a no-match rc=1).

## Why
A stray untracked dir (leo-curso/, a Prisma course) with an interpolated
connection-string template literal (a postgres URL built from `${}` placeholders)
false-tripped the gate and would abort every install. A secrets gate should check
what could be committed (tracked), not
random untracked junk (node_modules, build output, other projects).

## Scope
- install.sh — tracked-files scan + probe fix.
- .github/workflows/ci.yml — planted-secret test now `git add`s the file (tracked).

## Verification
- clean install PASS with leo-curso present; tracked planted secret ABORTS;
  pattern-probe no longer aborts on no-match.
- routing 12/12, governance 6/6, bash syntax ok.

## Notes
leo-curso/ is untracked and unrelated to EngineOS — flagged to user (move it out).
