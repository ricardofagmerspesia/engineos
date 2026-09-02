---
name: 2026-09-02-verify-runner-seam
status: done
owner: Ricardo Fagmer
spec: docs/specs/2026-09-02-deepen-runtime-modules-design.md
domain: devops
completed: 2026-09-02
---

## What
`hooks/stop-verify.sh` now runs ONE verification ladder. Nx and pnpm/yarn/npm
became adapters behind a new runner seam, `hooks/lib-runner.sh`. PR6 of the
deepen-runtime-modules design.

## Why
The Validation gate wrote its ladder twice — an Nx arm and a package-manager arm
— each with its own timeout table, failure accumulation and infra-vs-red
judgment, which is this hook's entire charter. The two had already diverged: the
"target was never really there" guard existed in the Nx arm only, so a
package-manager run reporting a missing script went red instead of skipping.

## Scope
- `hooks/lib-runner.sh` (new, source-only, no exec bit) — the runner seam.
- `hooks/stop-verify.sh` — one ladder; one jq/no-jq decision instead of six.
- `hooks/test-verify.sh` +2 cases; `hooks/lib-common.sh` +2-line pointer;
  `CONTEXT.md` **Runner** entry.

## Checklist
- [x] One ladder: targets, timeout table, accumulation, skip-vs-red stated once
- [x] Runner seam: 5 documented functions, two adapters (nx, npm-family)
- [x] False-positive guard applies to both adapters; four jq/no-jq paths -> one
- [x] Contract frozen: all 17 existing cases pass unchanged; 2 added
- [x] Validator green without editing it

## What was made
`hooks/lib-runner.sh` holds five documented functions: `runner_select` (nx vs
npm-family, reusing `runner_detect`, requiring jq for Nx), `runner_handle` (what
each runner addresses a package by), `runner_has_target`, `runner_run` (under
`TO`, budget passed in by the caller) and `runner_infra_skip`. `stop-verify.sh`
iterates the targets once against that seam, so the 90s/180s table, the
`FAILED`/`OUT` accumulation and the stale-probe guard are each written exactly
once; the six `command -v jq` probes became one `HAVE_JQ` determination, with
every grep/sed fallback the tests protect untouched. The `policy.json`
repair-bound read and the `hook_telemetry verify` call stay in the hook, so the
validator Checks greping for those literals needed no edits. 223 -> 186 lines.

## Verification
- `shellcheck -S error hooks/*.sh scripts/*.sh` — clean (rc=0)
- `bash hooks/test-verify.sh` — pass=19 fail=0 skip=0 (real npm, no fake adapter)
- `bash hooks/test-lib-common.sh` — 11/0; `bash hooks/test-bypass.sh` — 27/0;
  `bash hooks/test-docs.sh` — 190/0 (the last two drive stop-verify.sh directly)
- `bash scripts/validate-engineos.sh` — 89/0; `scripts/test-validate-engineos.sh`
  — 79/0. `bench-runtime.sh` carries no stop-verify budget; not run.

## Changes registered
```
 .engineos/changes/2026-09-02-verify-runner-seam.md |  78 ++++++++
 CONTEXT.md                                        |   5 +
 hooks/lib-common.sh                                |   2 +
 hooks/lib-runner.sh                               |  95 ++++++++++
 hooks/stop-verify.sh                              | 199 ++++++--------
 hooks/test-verify.sh                               |  31 ++++
 6 files changed, 292 insertions(+), 118 deletions(-)
```
332 changed lines of code, 410 with this record. `rules/git.md` caps a PR at 400;
the code is inside it and the record is bookkeeping, called out here as overflow.

## Notes
- **Behaviour change, intended:** the guard now covers the package-manager arm. A
  non-zero run whose output carries the runner's own missing-script wording
  (`Missing script:`, `Command "<target>" not found`, `find a script named
  "<target>"`) is an infra skip, not red. `npm run -s` silences npm's report, so
  in practice this fires for pnpm and yarn. A missing binary or a genuinely
  failing check matches nothing and still goes red.
- `stop-verify.sh` landed at 186 lines against a ~150 target: what remains is WHY
  comments carrying real knowledge (BSD sed alternation, node 16 infra skips,
  mixed Read/Edit JSONL lines). The duplicate ladder — the defect — is gone.
- Case 18 asserts the shared timeout table at the source; proving it through
  behaviour needs the fake adapter the design rejected.
