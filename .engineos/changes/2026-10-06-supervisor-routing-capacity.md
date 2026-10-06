---
status: active
domain: general
spec: docs/specs/2026-10-06-supervisor-routing-capacity.md
---

# Mandatory supervisor routing and useful concurrency

Risk: medium. Autonomy: A2. Gate: final non-test validation passed.

## Human decisions

2026-10-06: User explicitly requires supervisor routing and maximum useful worker
dispatch following rules, roles and patterns. Earlier same-PR and approval-only
final-testing decisions remain in force; no testing approval or artifact offer.

## Checklist

- [x] Intent classified, deterministic kernel consulted, ownership/spec recorded
- [x] Mandatory routing and worker briefs integrated
- [x] Useful-capacity scheduling integrated
- [x] Canonical router and implementation entry points aligned
- [x] Final non-test validation

## What was made

Canonical routing, worker rules, parallelism and implementation commands now route
every project write through one supervisor, including small mechanical edits and
follow-ups. Workers receive resolved roles/rules/skills/patterns and exclusive
ownership; new scope returns to the supervisor. Ready independent units fill useful
host/policy capacity, including multiple units in one domain, with prompt refilling
and recorded reasons for capacity limits. Deterministic routing stays the fast path;
the read-only router remains a planner for unresolved residue.

## Changes registered

rules/subagents.md, rules/parallelism.md, CLAUDE.md, commands/implement.md,
templates/cursor/commands/implement.md, this new change record, and
docs/specs/2026-10-06-supervisor-routing-capacity.md (new). No renames or registry
schema changes. Earlier uncommitted work, AGENTS.md, .agents and unrelated pnpm
files preserved. All three available worker slots used for independent scopes.

## Evidence and limits

Read-only integrated inspection confirmed matching entrypoint/worker/scheduler
guidance, unchanged domain table loads, flat workers, same-PR continuity and final
testing consent. npm run typecheck (also repository lint implementation) exited 0;
git diff --check exited 0 with no output. Runtime/build inputs unchanged, so no
additional build run. No tests, evals, benchmarks, git/forge writes or installs.
Testing remains pending explicit user approval. This remains executor discipline
under Codex; no automatic runtime scheduler or performance claim is introduced.
