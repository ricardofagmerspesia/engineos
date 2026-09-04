---
name: 2026-09-02-close-stack-records
status: active
owner: Ricardo Fagmer
spec: n/a — one installer line plus eight bookkeeping archive moves; no design surface
domain: devops
---

## What
Two loose ends left by the nine-PR runtime-deepening stack: `install.sh` no longer
re-marks the two sourced hook libraries executable, and the stack's eight change
records are closed and archived.

## Why
- `install.sh` step 5 ran `chmod +x "$REPO_DIR"/hooks/*.sh`. `hooks/lib-common.sh`
  and `hooks/lib-runner.sh` are sourced, never executed, and PR7 set them to mode
  644 in git on purpose — the blanket glob undid that on every install, so the
  tracked mode and the installed mode disagreed after any `./install.sh`. PR7's own
  record named this as the follow-up.
- Seven of the eight stack records were still `status: active` and one was `done`
  but unarchived, so `.engineos/changes/` did not reflect what had shipped, and the
  C21 archive Checks never saw the records at all.

## Scope
- `install.sh` — the step 5 chmod only; the Windows `bash.exe` hook-wrap logic
  below it is untouched.
- `.engineos/changes/2026-09-02-*.md` (eight records) -> `.engineos/archived/2026/09/`
  under `devops/` and `general/` per each record's `domain:`.
- This record.

## Checklist
- [x] Narrow the chmod so `hooks/lib-*.sh` keeps mode 644 and every real hook keeps `+x`
- [x] Confirm the narrowing does not disturb the Windows hook-wrap in
      `2026-08-15-install-sh-windows-hook-wrap.md`, and check `install.ps1` for an equivalent
- [x] Close the eight stack records: real `## What was made`, real `## Changes registered`,
      `status: done`, `completed: 2026-09-02`
- [x] Derive each account from the branch commit, not the draft text; correct where they disagree
- [x] Archive under `.engineos/archived/<YYYY>/<MM>/<domain>/`
- [x] Final gate: shellcheck + the six suites, run once at the end

## What was made
`install.sh` step 5's single `chmod +x "$REPO_DIR"/hooks/*.sh` became a loop that
skips `lib-*.sh` by name, with a comment saying why. The Windows path is unaffected:
the hook-wrap registers `"<git>/bin/bash.exe" "<hook>.sh"` and never relies on the
execute bit, and `install.ps1` has no chmod equivalent because NTFS has no execute
bit — so there was nothing to mirror there.

The eight records for the stack (PR0 `ci-run-all-suites` through PR7
`agent-tier-frontmatter`) were closed against their actual commits — `fd790f6`,
`418db21`, `aba76e2`, `15b3531`, `4e67fdc`, `68cf842`, `96cce8d`, `05d8c93` — and
moved into `.engineos/archived/2026/09/`. Three carried a `## Changes registered`
section that was prose or a `000 +++++` placeholder rather than real output; those
now carry the commit's own `git diff --stat`. Two draft claims contradicted their
commit and were corrected in place, with the correction stated in the record:
`hook-envelope` omitted `scripts/validate-engineos.sh` and
`scripts/test-validate-engineos.sh` from its file list, and `one-prompt-adapter`
claimed to stack on PR0 when its parent is PR1 (`418db21`).

**The eight were closed while their pull requests were still open.** `status: done`
here means the commit landed on its branch and the work is finished, not that the PR
merged; a later reader finding a `done` record whose PR shows unmerged is looking at
that gap, not at a lie.

## Verification
Final gate only, run once at the end. See `## Changes registered` for the diff.

- `shellcheck -S error hooks/*.sh install.sh scripts/*.sh scripts/checks/*.sh` — clean
- `bash hooks/test-install-hooks.sh`, `bash scripts/validate-engineos.sh`,
  `bash scripts/test-validate-engineos.sh`, `bash hooks/test-docs.sh`,
  `bash hooks/test-governance.sh`, `bash hooks/test-layout.sh` — all green
- The chmod change was demonstrated, not asserted: on a throwaway copy of `hooks/`,
  the old glob left `lib-common.sh` and `lib-runner.sh` at `-rwxr-xr-x`; the new loop
  leaves them at `-rw-r--r--` while 23 of 25 `*.sh` (every non-`lib-` file) keep `+x`.

## Changes registered

`git diff --cached --stat 05d8c93`, staged for this change's single commit:

```
 .../09/devops}/2026-09-02-ci-run-all-suites.md     |  3 +-
 .../09/devops}/2026-09-02-one-prompt-adapter.md    | 11 ++-
 .../09/devops}/2026-09-02-verify-runner-seam.md    |  1 +
 .../general}/2026-09-02-agent-tier-frontmatter.md  | 22 +++---
 .../09/general}/2026-09-02-delete-routing-map.md   |  3 +-
 .../2026/09/general}/2026-09-02-hook-envelope.md   | 34 ++++++++-
 .../2026/09/general}/2026-09-02-kernel-loader.md   | 16 ++--
 .../09/general}/2026-09-02-validator-checks.md     |  3 +-
 .../changes/2026-09-02-close-stack-records.md      | 87 ++++++++++++++++++++++
 install.sh                                         |  8 +-
 10 files changed, 160 insertions(+), 28 deletions(-)
```

Movements: eight `git mv` from `.engineos/changes/` into
`.engineos/archived/2026/09/{devops,general}/`, all recorded as renames. One file
added (this record). None deleted. Well under the 400-line cap.

## Notes
- The ten older unarchived records (2026-07-30 through 2026-08-16) are pre-existing
  drift and were deliberately left alone: writing a "what was made" account for work
  this change did not do would be fabrication.
- `.engineos/changes/2026-08-16-agent-tier-from-frontmatter.md` has no YAML front
  matter at all — no `status:`, `name:`, `owner:`, `spec:` or `domain:` — and nothing
  fails. The C21 family in `scripts/checks/60-contracts.sh` reads only
  `.engineos/changes/_template.md` (and `README.md`, for a negative assertion); the
  instance Checks walk `.engineos/archived` alone. An in-flight record is unchecked
  by construction. Not fixed here.
