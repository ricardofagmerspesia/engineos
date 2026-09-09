---
name: 2026-09-08-hook-path-containment
status: done
completed: 2026-09-08
owner: ricardo.fagmer
spec: docs/specs/2026-09-08-hook-path-containment.md
domain: devops
---

## What
Audit deferrals: `findUpAny` made separator-agnostic via `node:path` so the Stop gate's containment works on Windows paths; `post-edit-check` bounded and contained to the session cwd like `stop-verify` (U1), with `containedIn`/`startDir` shared from `verify-targets.ts`.

## Why
On Windows the Stop gate's `/`-only prefix test never matched a realpath'd `C:\...` root, so the gate verified nothing while looking green. `post-edit-check` still walked to `/` and ran any `package.json` above the edited file, the defect U1 fixed only in its wired twin.

## Scope
One unit, one agent, tests in scope; security-reviewer AUDIT; final gate; one PR.

## Checklist
- [x] Unit: findUpAny + post-edit-check containment + tests (devops-coordinator)
- [x] security-reviewer AUDIT over the diff
- [x] Barrier: dist rebuild, COMPATIBILITY row, final gate, PR

## What was made
- `src/hooks/verify-targets.ts`: `findUpAny(start, names, stop?)` rewritten over `node:path` (`resolve`, `relative`, `dirname`, `sep`); `isWithin` decides containment on the first segment of `relative`; `startDir(file)` and `containedIn(root, candidate)` exported (realpath both sides, refuse `node_modules` segments); `parentOf` deleted.
- `src/hooks/stop-verify.ts`: `packageDirs` uses the shared `startDir`/`containedIn`, so a dependency's `package.json` under the root is refused.
- `src/hooks/post-edit-check.ts`: bounded to `env.cwd` (realpath; `''` or unresolvable cwd = silent); package, workspace and linter-config owners each pass `containedIn`.
- Tests: `verify-targets.test.ts` (+4: shared-prefix sibling, unbounded walk terminates, `..hidden` inside stop, node_modules refusal), `post-edit-check.test.ts` (+4: package above cwd, node_modules edit, no-cwd envelope, sibling checkout).
- `docs/COMPATIBILITY.md`: 3 rows (post-edit-check tightened, node_modules refusal in both hooks, findUpAny/Windows changed with the "unit-tested, not Windows-CI-tested" caveat).
- `dist/engineos.cjs` rebuilt.
- Security re-pass (leo-ely, MERGE WITH FIXES): five fixes folded in, listed under "Amended at the security re-pass" in the spec.

## Verification
Run once at the barrier, 2026-09-08, on `fix/hook-path-containment`:
- `npm run build` ok; `npm run typecheck` clean
- `node dist/engineos.cjs validate`: `passed 110, failed 0`
- `git diff --check` ok
- `npm test`: `# tests 2082 / # pass 2066 / # fail 0 / # skipped 16`
Windows behaviour of `findUpAny` is asserted only by unit tests over `node:path` semantics on macOS; CI has no Windows test leg.

## Human decisions
2026-09-08 | owner | none required (risk medium, A2, reversible) | approved | picked the deferrals batch via AskUserQuestion; console leftovers deferred until PR #84 merges

## Changes registered
- ac1181a fix(hooks): bound and contain the per-edit gate; path-agnostic containment
- d2cef9a docs: spec and record for hook path containment
- Accepted residual: a vendored (git-untracked, non-`node_modules`) `package.json` under the cwd is still run; requiring a tracked owner is a follow-up.

## Notes
Branch `fix/hook-path-containment` off main (b9152db). Independent of #84, #91, #92.
