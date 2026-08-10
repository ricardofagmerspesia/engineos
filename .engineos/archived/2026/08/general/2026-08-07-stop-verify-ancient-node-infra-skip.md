---
name: 2026-08-07-stop-verify-ancient-node-infra-skip
status: done
owner: ricardo
spec: n/a — single-hook bug fix, below the >2-file spec threshold (3 files, one mechanism)
domain: general
completed: 2026-08-07
---

## What

`hooks/stop-verify.sh` no longer blocks sessions when the PATH it inherited
resolves an ancient node: a new `ensure_modern_node()` in `lib-common.sh`
prefers the nvm default when PATH's node is <20, and if node is still <18
the hook skips verification entirely as an infra gap.

## Why

The Stop hook inherits the launching app's environment. Observed live: the
Claude Code process's PATH carried nvm bin dirs stacked oldest-first, so
`node`/`npm` resolved to v16.17.0 — ESLint 9 crashed on missing
`structuredClone`, vitest on missing `util.styleText`, and the gate misread
those startup crashes as genuine red checks. Both target repos verified
green under node 22 in an interactive shell; the block recurred purely from
the hook's stale runtime. The hook's own charter is "never blocks on infra
quirks — only on genuine red"; a runtime too old to start the toolchain is
the textbook infra quirk.

## Scope

hooks/lib-common.sh (ensure_modern_node), hooks/stop-verify.sh (call +
infra skip), hooks/test-verify.sh (case 16). Plus a mode-only executable-bit
normalization on layout-manifest.sh/lib-common.sh that predated the branch.

## Checklist

- [x] Root cause traced to the real process env (ps eww on the session's
      ancestor: v16.17.0/bin first on PATH), not guessed
- [x] Resolver in lib-common.sh, wired in stop-verify.sh before the run loop
- [x] test-verify.sh case 16: v16-first PATH with no nvm rescue → no block
- [x] All lib-common consumers re-verified green

## What was made

- `ensure_modern_node()`: reads `node -v`'s major; if <20 and
  `~/.nvm/alias/default` exists, prepends that version's bin dir to PATH and
  re-reads; echoes the final major (0 if no node). Best-effort — no nvm, no
  change.
- `stop-verify.sh` calls it after resolving the repo root; if the major is
  still <18 (no `structuredClone` — ESLint 9 and vitest cannot start), it
  exits 0 before running any check, per its own never-block-on-infra rule.
- Direct resolver tests both ways: fake v16 PATH + fake nvm default 22 →
  node resolves to 22; no rescue available → reports 16 and the hook skips.

## Verification

- `hooks/test-verify.sh`: pass=16 fail=0 (15 existing unchanged + case 16)
- `scripts/validate-engineos.sh`: passed 84, failed 0
- lib-common consumers: `hooks/test-route.sh` 38/0,
  `hooks/test-route-advisor.sh` 17/0, `hooks/test-gate-advisor.sh` 20/0,
  `hooks/test-task-scale.sh` 12/0
- `bash -n` clean on all three edited hooks

## Changes registered

Commit `f371628` on `feat/decision-kernel-p1`:

```
hooks/lib-common.sh  | 23 +++++++++++++++++++++++ (+ mode 755)
hooks/stop-verify.sh |  7 +++++++
hooks/test-verify.sh | 18 ++++++++++++++++++
hooks/layout-manifest.sh | mode 755 only
4 files changed, 48 insertions(+)
```

## Notes

- The deeper fix is outside this repo's reach: the launching app's PATH
  accumulates nvm entries oldest-first. Relaunching the app from a clean
  shell (or pruning `~/.nvm/versions/node/v16.17.0` and v18.x once nothing
  needs them) removes the trigger; the hook now degrades honestly either
  way.
- Same stale-PATH class could affect `post-edit-check.sh`'s linter probes —
  it only emits per-edit advice (exit 2 noise, never a block), so it was
  deliberately left out of this fix's scope.
