---
name: 2026-06-17-review-findings-fixes
status: active
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

(to be filled at close — typecheck N/A for bash; run hooks/test-route.sh, the
marker dry-run, and a secrets-gate self-test; show output.)

## Notes

Closing this record via the record-change skill proves the lifecycle end-to-end.
