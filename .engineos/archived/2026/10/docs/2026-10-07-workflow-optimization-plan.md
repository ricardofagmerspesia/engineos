---
name: 2026-10-07-workflow-optimization-plan
status: done
completed: 2026-10-07
owner: codex
spec: docs/specs/2026-10-07-workflow-optimization-plan.md
domain: docs
---

## What

Analyze EngineOS against the developer's ten-area optimization checklist and
propose a prioritized, dependency-based implementation plan.

## Why

Reduce unnecessary tasks/handoffs, make safe parallelism operational and expose
useful verified results sooner, with measurable performance evidence.

## Scope

One assessment/plan, one proposed ADR and this record. No runtime, policy,
constitution, dependency or Git/forge changes. Existing untracked pnpm files
were present before work and are outside scope.

## Checklist

- [x] Inspect canonical rules, kernel, workflow skills, existing Fast Core plans and telemetry.
- [x] Dispatch scoped read-only architecture/workflow research.
- [x] Map all ten checklist areas to existing behavior and concrete gaps.
- [x] Propose six delivery units with dependencies, ownership, acceptance and rollout criteria.
- [x] Record proposed architecture alternatives and current-policy conflicts.
- [x] Verify final artifact links, scope and research conclusions.

## What was made

Created an evidence-linked architecture assessment and six-unit DAG plan.
Created a proposed ADR for risk-proportional execution using the existing kernel.
Separated existing runtime capabilities, historical designs and recommended changes.

## Verification

Read-only checks confirmed all local Markdown links resolve, fences are balanced,
all ten checklist mappings exist, and six delivery units are present. Both scoped
audits returned evidence supporting current/planned capability distinctions.
The plan has 177 lines; the proposed ADR has 49 lines. No implementation tests,
evals or benchmarks were performed. Lint/typecheck/build/startup gates are not
applicable to this docs-only scope. No performance improvement is claimed.

## Human decisions

No runtime/topology/release approval was sought or recorded. This request
authorized analysis and a plan; the proposed ADR remains unaccepted.

## Changes registered

Final status after record archival:

```text
?? .engineos/archived/2026/10/docs/
?? docs/adr/2026-10-07-risk-proportional-workflow-execution.md
?? docs/specs/2026-10-07-workflow-optimization-plan.md
?? pnpm-lock.yaml
?? pnpm-workspace.yaml
```

`git diff --stat HEAD` produced no output because the new documents are untracked.
The record moved from `.engineos/changes/` to the archive shown above. The two
pnpm files predated this task and were not modified. No git/forge writes performed.

## Notes

Current work risk low, autonomy A1. Future public execution behavior must receive
its own risk classification, compatibility handling and applicable gates.
