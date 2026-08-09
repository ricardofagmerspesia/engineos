---
name: 2026-08-08-verify-at-end-distribute-always
status: active
owner: Ricardo Fagmer
spec: this record (rules + hook-wiring change; the What/Why/Scope below is the spec)
domain: docs
---

## What
Two policy shifts across the EngineOS constitution:
1. **Verify at finalization, not mid-flight** — the full lint + typecheck + test
   pass runs ONCE, when the task is done (the existing `Stop` gate), never per
   edit or per wave. The blocking per-edit hook is retired from default wiring.
2. **Decompose and distribute always** — every substantive task starts as a task
   list, and every task without an in-flight dependency is dispatched to a
   sub-agent. The old >3-files/>1-domain/≥3-tasks thresholds are gone; the
   orchestrator's job is contracts, dispatch, integration, and the final gate.

## Why
`post-edit-check.sh` blocked after every single Edit/Write with a scoped
typecheck+lint (up to ~2min per edit), stalling the build loop — and
`rules/parallelism.md` demanded a full verify at every wave barrier on top of
that. The Stop hook (`stop-verify.sh`) already runs the same scoped verification
at exactly the right moment, so the mid-flight layers were pure drag. Separately,
fan-out only triggered above size thresholds, so most tasks ran single-threaded
by default; the user wants distribution to be the standing default, not a
big-task exception.

## Scope
- `hooks/hooks.json` — `post-edit-check.sh` removed from PostToolUse(Edit|Write);
  `mark-unrecorded.sh` kept
- `hooks/post-edit-check.sh` — header rewritten: opt-in, not wired by default
- `install.sh` — no longer adds the per-edit hook; new jq `drop` strips it from
  earlier installs on upgrade
- `install.ps1` — per-edit Add-HookEntry removed (`Remove-EngineOSHooks` already
  strips stale entries each run)
- `rules/testing.md` — new "Verification timing" section; Process section defers
  suite execution to finalization
- `rules/parallelism.md` — "Decompose-and-distribute" replaces threshold-gated
  fan-out; barriers integrate only, final barrier verifies
- `CLAUDE.md` — non-negotiables #2 (verification at finalization) and #7
  (decompose and distribute) rewritten
- `README.md`, `docs/START.md` — hook tables updated

## Checklist
- [x] Per-edit gate unwired from hooks.json, plugin path
- [x] Both installers stop wiring it; bash installer drops stale entries on upgrade
- [x] `rules/testing.md` "Verification timing": once at finalization, gate stays
      mandatory, wave barriers don't run the suite, regression-test exception noted
- [x] `rules/parallelism.md`: task list first, distribute always, orchestrator
      never does distributable tasks inline
- [x] `CLAUDE.md` #2 and #7 aligned with both rules
- [x] User-facing docs (README, START) no longer describe the per-edit hook as wired
- [x] Verification run (see below)

## What was made
<filled on completion>

## Verification
- `bash -n install.sh`, `bash -n hooks/post-edit-check.sh` — syntax OK
- PowerShell `Parser::ParseFile(install.ps1)` — 0 errors
- `jq empty hooks/hooks.json` — valid; PostToolUse(Edit|Write) has exactly 1 hook
  (mark-unrecorded) remaining
- Fixture test of install.sh's jq program: settings.json containing the old
  per-edit entry → after upgrade, post-edit-check entries=0, mark-unrecorded=1
  (first run failed due to MSYS argument path-mangling in the test harness, not
  the logic; re-run with `MSYS2_ARG_CONV_EXCL='*'` passes)
- `hooks/test-route.sh` pass=21 fail=0; `hooks/test-agent-announce.sh` pass=5 fail=0

## Notes
`stop-verify.sh` is untouched — it was already the correct shape (scoped to
changed packages, runs lint+typecheck+test once at Stop, blocks only on genuine
red). Deferring verification to the end makes that gate MORE load-bearing:
red there means a fix loop, never "ship anyway". Historical specs under
`docs/specs/` that describe the per-edit hook as wired were left as-is — they
document decisions of their date.
