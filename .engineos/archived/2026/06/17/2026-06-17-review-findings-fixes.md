---
name: 2026-06-17-review-findings-fixes
status: done
completed: 2026-06-17
owner: Ricardo Fagmer
---

## What

Fix the findings from the full pre-adoption codebase review: the critical secrets
gate, router/agent inconsistencies, change-governance correctness bugs, missing
LICENSE/CONTRIBUTING, spec↔code drift, and the highest-value big-system gaps.

## Why

EngineOS is about to be adopted into a real project as a reusable pattern. The
review found one CRITICAL (secrets gate non-functional on macOS), several HIGH
correctness/consistency bugs, and missing standard repo process. Must be resolved
before adoption. Also dogfoods the change-governance system on its own repo (the
review flagged it had never been exercised here).

## Scope

- `install.sh` — secrets gate regex (fail-closed), broadened patterns, guards.
- `hooks/routing-map.sh`, `CLAUDE.md` — remove phantom coordinator agents, reconcile router mirror, add DBA/DevOps/security rows.
- `hooks/mark-unrecorded.sh`, `hooks/record-verify.sh`, `hooks/post-edit-check.sh` — marker consistency, session scoping, find_up guard, ordering, `.sql`.
- `docs/superpowers/specs/2026-06-17-change-governance-design.md` — reconcile to flag-file mechanism.
- `LICENSE`, `CONTRIBUTING.md` — add.
- `README.md` — fix hook-count + command drift.
- `rules/` — dedup; add `observability.md`, `data.md` + router rows.
- `.github/workflows/` (repo CI) — shellcheck + hook tests.

## Verification

- `hooks/test-route.sh` → 12/12 pass.
- `hooks/test-governance.sh` → 6/6 pass (set, same-session block, cross-session
  isolation, loop guard, glob clear).
- `bash -n` on all hooks + install.sh + scripts → clean.
- `jq empty` on all JSON (hooks.json, plugin.json, marketplace.json, both
  templates) → valid.
- Secrets gate: repo clean (rc=1), planted secret detected (rc=0), no compile
  error (rc≠2 on bad-pattern path).
- All `agent:*` refs in routing-map resolve to a file in `agents/`.
- find_up terminates on relative/empty/dot paths.

## Changes registered

6 commits, 27 files (+697 / -96):
- `fix(security)` 3cbe917 — secrets gate fail-closed + hardening
- `fix(router)` 6089f17 — 5 coordinator agents + router reconcile + data/observability rules
- `fix(hooks)` 4723428 — marker consistency + session scoping + find_up guard
- `test` 3e80789 — governance test suite + repo CI
- `docs` 24a93c6 — LICENSE/CONTRIBUTING/CHANGELOG + spec/README reconcile
- `refactor(rules)` 6527a66 — backend dedup

Movement: this record `git mv`'d `changes/` → `archived/` on completion.

## Notes

Dogfooded the change-governance lifecycle on EngineOS itself (the review flagged it
had never been run here). Carried-forward (not in this branch): live-session check
of `additionalContext` injection; the `feat/specialist-agents` spec + MCP-leaf
agents + `/engineos:audit` orchestrator remain future work. See [[2026-06-17-change-governance-design]].
