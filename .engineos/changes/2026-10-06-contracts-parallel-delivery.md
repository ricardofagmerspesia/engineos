---
status: active
domain: general
spec: docs/specs/2026-10-06-contracts-parallel-delivery.md
---

# API contracts and parallel delivery

Spec: docs/specs/2026-10-06-contracts-parallel-delivery.md
Risk: medium. Autonomy: A2. Gate: non-test validation passed; tests/evals pending approval.

## Human decisions

2026-10-06: User said go ahead to the proposed API contracts + parallel delivery
upgrade and React testing correction. No test/eval approval, git write or external
effect is inferred.

## Checklist

- [x] Scope, acceptance criteria, frozen ownership and rollback recorded
- [x] Contract guidance and template integrated
- [x] Frontend consumption and test approval guidance integrated
- [x] Dependency scheduling and handoff guidance integrated
- [x] Implement command and Cursor adapter aligned; unreleased guidance note added
- [x] Final non-test validation
- [ ] Tests/evals — pending explicit current-task approval

## What was made

Added a reusable API contract template and owner/revision/schema requirements to
NestJS guidance. Frontend guidance now consumes framework-independent wire types,
distinguishes runtime validation from static typing and handles contract drift.
Removed unconditional React test scaffolding and aligned separate Nest DTO/client
validation implementations with the same transport contract.

Parallelism now carries a task ledger, integrated-prerequisite readiness, immediate
slot refilling, shared-output ownership and affected-consumer pause/rebriefing.
Handoffs capture those facts without changing required headings. The implement
command and Cursor adapter reference the procedure. No runtime scheduler was added.

## Changes registered

This task changed rules/backend.md, rules/frontend.md, rules/parallelism.md,
skills/nestjs-patterns/SKILL.md, skills/react-patterns/SKILL.md,
templates/api-contract.md (new), templates/handoff.md, commands/implement.md,
templates/cursor/commands/implement.md, docs/specs/2026-10-06-contracts-parallel-delivery.md
(new), docs/release-notes/2026-10-06-contracts-parallel-delivery.md (new), and this
record (new). No renames. Earlier uncommitted changes and unrelated pnpm files preserved.

## Evidence and limits

2026-10-06, final integrated working tree:

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
exit 0 (also the repository's lint implementation)

npm run build
> node scripts/build.mjs
exit 0

git diff --check
exit 0, no output
```

Read-only inspection confirmed coherent contract owner/revision semantics, no new
rule load dependencies, unchanged public handoff headings and no backend runtime
imports prescribed to frontend consumers. Scheduling remains executor discipline.
No tests/evals, behavioral integrity validator, installs, git writes or publishing
performed. If approved, final existing framework tests and integrity checks can
validate routing/adapter compatibility; any test edits need approval as well.
Record remains active because that testing evidence is pending, not passed.
