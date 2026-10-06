# API contracts and parallel delivery

Risk: medium — shared engineering guidance, reversible working-tree changes.
Autonomy: A2. No publishing, consumer migration, dependency installation or git writes.

## Scope and decision

Strengthen existing NestJS/React skills and parallelism rules rather than add
overlapping skills or a new scheduler. NestJS owns the backend; Next.js/React
consumes its wire contract; Mastra remains hosted through Nest providers.
Existing kernel admission remains authoritative for policy capacity; host slots
can reduce that capacity. Scheduling is executor discipline, not new runtime code.

## Acceptance criteria

- Shared API contracts identify an owner, revision and authoritative schema, and
  capture routes, request/response shapes, errors and applicable streaming semantics.
- Consumers use wire types/schemas without importing Nest decorators, ORM entities
  or backend runtime dependencies. Runtime validation remains a separate obligation.
- A dependency graph records task ids, exclusive paths, prerequisites and consumed
  contract revisions; ready tasks refill free host slots without unrelated barriers.
- A contract change pauses affected consumers, resolves through its owner, and
  updates the revision before resuming; unrelated work continues.
- Worker completion means implementation returned; integration and final validation
  remain separate. Generated files and shared wiring have one owner.
- React guidance creates no tests or test scaffolds before integrated implementation
  and explicit current-task approval. Build/typecheck remain final non-test checks.
- Existing public names, router rows and required handoff headings remain unchanged.

## Frozen file ownership and tasks

1. backend-coordinator: rules/backend.md, skills/nestjs-patterns/SKILL.md,
   templates/api-contract.md. Owns contract detail and reusable contract template.
2. frontend-coordinator: rules/frontend.md, skills/react-patterns/SKILL.md.
   References backend wire contracts; corrects unconditional test instructions.
3. workflow-policy: rules/parallelism.md, templates/handoff.md.
   Owns scheduling procedure and handoff detail; preserves heading contracts.
4. Orchestrator: this spec, change record, commands/implement.md and its Cursor
   adapter, release note, final integration and non-test validation.

Contract: API contract guidance lives in rules/backend.md and the referenced
templates/api-contract.md. Parallel scheduling lives in rules/parallelism.md.
Cross-domain consumers refer to frozen project contracts, not a new rule import.
No new router load dependency, registry schema, command or executable is introduced.

## Verification and rollback

At the final gate inspect focused diffs and reference/heading consistency, run
git diff --check and existing non-test typecheck/build scripts. Behavioral tests,
evals and test authoring remain pending explicit approval; go ahead authorizes
the proposed guidance upgrade only. Rollback restores only this task's additions
and edits; preserve all earlier uncommitted work and unrelated pnpm files.
