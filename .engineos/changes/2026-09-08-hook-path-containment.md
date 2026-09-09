---
name: 2026-09-08-hook-path-containment
status: active
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
- [ ] Unit: findUpAny + post-edit-check containment + tests (devops-coordinator)
- [ ] security-reviewer AUDIT over the diff
- [ ] Barrier: dist rebuild, COMPATIBILITY row, final gate, PR

## What was made
<filled on completion>

## Verification
<filled on completion>

## Human decisions
2026-09-08 | owner | none required (risk medium, A2, reversible) | approved | picked the deferrals batch via AskUserQuestion; console leftovers deferred until PR #84 merges

## Changes registered
<filled on completion>

## Notes
Branch `fix/hook-path-containment` off main (b9152db). Independent of #84, #91, #92.
