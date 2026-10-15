---
name: 2026-10-08-final-approval-and-retro-improvements
status: done
completed: 2026-10-08
owner: codex
spec: docs/specs/2026-10-08-final-approval-and-retro-improvements-design.md
domain: llm
---

## What

Make checks final-only and approval-bound; implement five retro improvements.

## Why

Avoid repeated automatic validation and ambiguous approval while preserving proof.

## Scope

Runtime gates/hook/launcher/CLI, policy/CI/docs/discovery, final approved regression
coverage and three legacy test expectation corrections. Branch main, PR unknown.
No external effects or unrelated changes.

## Checklist

- [x] Freeze design and obtain preview decision.
- [x] U1 runtime gate.
- [x] U2 policy/mirrors/discovery.
- [x] U3 final test edits and approved checks.
- [x] Independent critic/security review.

## What was made

Integrated pure workflow gate, scope-bound launcher/manual verification,
advisory-only automatic Stop and post-edit hooks, final approval policy and CI
mirrors, bounded skill-reference lookup and single-question decision guidance.
Final-stage regressions and legacy corrections were integrated and validated.
Evidence: docs/perf/2026-10-08-final-approval-validation.md.

## Human decisions

2026-10-08 | developer | high-risk | requested reversible working-tree changes
for final-only explicitly approved checks and all five retro recommendations.
2026-10-08 | developer | preview-declined | declined prototype for this scope.
2026-10-08 | developer | final validation approved | explicitly approved final
regression authoring/legacy corrections, one emitting TypeScript compile (also
provides typecheck), bundle build, directed tests, integrity and diff check after
U1/U2 integration. No separate duplicate lint compiler run.

## Verification

Approved final validation: compiler/build passed, 309 directed cases covered by
initial307/309 plus affected103/103 repaired rerun; integrity113/113 and diffcheckpassed.
Independent read-onlycritic/security reviewclear. No duplicated lint/compileraliasrun.
No global suite or measured real-workload savings claimed. Git integration pending.

2026-10-08 | developer | external-effect | requested merge to main. No topicbranch
or PR yet; preparatory Git writes follow developer ask policy.
2026-10-08 | developer | external-effect | clarified local merge only and update
EngineOS on this Mac. No remote push/PR or release requested.

## Changes registered

Implementation scope validated and completed. Local Git integration and machine
installer update were separately requested by developer and are being prepared.
No Git write occurred before this snapshot. Concurrent aliases/visual docs/pnpm
changes are preserved and excluded from proposed integration; shared files will
be partially staged from the prepared owned patch.

Snapshot before local Git integration:

```text
 M .github/workflows/ci.yml
 M .github/workflows/live-evals.yml
 M AGENTS.md
 M CLAUDE.md
 M agents/architecture-analyst.md
 M agents/audit-consolidator.md
 M agents/critic.md
 M agents/docs-writer.md
 M agents/gcp-specialist.md
 M agents/kubernetes-specialist.md
 M agents/product-spec.md
 M agents/qa-tester.md
 M agents/test-writer.md
 M commands/agents/ameer.md
 D commands/agents/analyst.md
 M commands/agents/architecture-analyst.md
 M commands/agents/audit-consolidator.md
 M commands/agents/corradin.md
 M commands/agents/critic.md
 M commands/agents/docs-writer.md
 M commands/agents/gcp-specialist.md
 D commands/agents/kovac.md
 M commands/agents/kubernetes-specialist.md
 D commands/agents/mariana.md
 D commands/agents/nakamura.md
 M commands/agents/product-spec.md
 M commands/agents/qa-tester.md
 D commands/agents/qa.md
 M commands/agents/test-writer.md
 D commands/agents/tomasz.md
 D commands/agents/vera.md
 M commands/analyze-architecture.md
 M commands/implement.md
 M commands/new-feature.md
 M dist/engineos.cjs
 M docs/BIG-PICTURE-lifecycle.html
 M docs/BIG-PICTURE.html
 M docs/BIG-PICTURE.md
 M docs/COMPATIBILITY.md
 M docs/START.md
 M evals/intent-routing-cases.jsonl
 M registries/agents.json
 M registries/decision-rules.json
 M registries/intents.json
 M registries/policy.json
 M registries/routing.json
 M rules/context.md
 M rules/gates.md
 M rules/parallelism.md
 M rules/subagents.md
 M rules/verification.md
 M skills/retro/SKILL.md
 M src/checks/registries-coherence.ts
 M src/checks/registries.test.ts
 M src/cli.ts
 M src/hooks/post-edit-check.test.ts
 M src/hooks/post-edit-check.ts
 M src/hooks/stop-verify.test.ts
 M src/hooks/stop-verify.ts
 M src/kernel/cli.test.ts
 M src/kernel/cli.ts
 M src/kernel/resolve.test.ts
 M src/kernel/resolve.ts
 M src/registry/policy.test.ts
 M src/registry/policy.ts
 M templates/adapters/README.md
 M templates/adapters/claude-code.md
 M templates/adapters/codex.md
 M templates/adapters/cursor.md
 M templates/cursor/commands/implement.md
?? .engineos/archived/2026/10/docs/
?? .engineos/archived/2026/10/llm/
?? .engineos/changes/2026-10-08-final-approval-and-retro-improvements.md
?? commands/agents/caio-badu.md
?? commands/agents/dalollio.md
?? commands/agents/danilo.md
?? commands/agents/gcp.md
?? commands/agents/ricardo-fagmer.md
?? commands/agents/rogerio.md
?? commands/agents/sameer.md
?? commands/implement-spec.md
?? commands/pr.md
?? docs/adr/2026-10-07-risk-proportional-workflow-execution.md
?? docs/perf/2026-10-07-workflow-validation.md
?? docs/perf/2026-10-08-final-approval-validation.md
?? docs/specs/2026-10-07-workflow-optimization-plan.md
?? docs/specs/2026-10-08-final-approval-and-retro-improvements-design.md
?? docs/specs/2026-10-08-prototype-preview-gate-design.md
?? pnpm-lock.yaml
?? pnpm-workspace.yaml
?? registries/skill-references.json
?? skills/engineos-implement-spec/
?? skills/engineos-spec/
?? skills/pr/
?? src/journal/workflow.test.ts
?? src/journal/workflow.ts
?? src/kernel/execution.test.ts
?? src/kernel/execution.ts
?? src/kernel/skill-reference.test.ts
?? src/kernel/skill-reference.ts
?? src/report/workflow-cli.ts
?? src/report/workflow.test.ts
?? src/report/workflow.ts
?? src/scheduler/
?? src/workflow/
```

```text
 .github/workflows/ci.yml                 |   24 +-
 .github/workflows/live-evals.yml         |    9 +-
 AGENTS.md                                |   25 +-
 CLAUDE.md                                |   22 +-
 agents/architecture-analyst.md           |    2 +-
 agents/audit-consolidator.md             |    2 +-
 agents/critic.md                         |    2 +-
 agents/docs-writer.md                    |    2 +-
 agents/gcp-specialist.md                 |    2 +-
 agents/kubernetes-specialist.md          |    2 +-
 agents/product-spec.md                   |    2 +-
 agents/qa-tester.md                      |    2 +-
 agents/test-writer.md                    |    2 +-
 commands/agents/ameer.md                 |    4 +-
 commands/agents/analyst.md               |   18 -
 commands/agents/architecture-analyst.md  |    4 +-
 commands/agents/audit-consolidator.md    |    4 +-
 commands/agents/corradin.md              |    4 +-
 commands/agents/critic.md                |    4 +-
 commands/agents/docs-writer.md           |    4 +-
 commands/agents/gcp-specialist.md        |    4 +-
 commands/agents/kovac.md                 |   14 -
 commands/agents/kubernetes-specialist.md |    4 +-
 commands/agents/mariana.md               |   14 -
 commands/agents/nakamura.md              |   14 -
 commands/agents/product-spec.md          |    4 +-
 commands/agents/qa-tester.md             |    4 +-
 commands/agents/qa.md                    |   14 -
 commands/agents/test-writer.md           |    4 +-
 commands/agents/tomasz.md                |   14 -
 commands/agents/vera.md                  |   14 -
 commands/analyze-architecture.md         |    2 +-
 commands/implement.md                    |   29 +-
 commands/new-feature.md                  |  195 +--
 dist/engineos.cjs                        | 2757 +++++++++++++++++-------------
 docs/BIG-PICTURE-lifecycle.html          |   26 +-
 docs/BIG-PICTURE.html                    |   18 +-
 docs/BIG-PICTURE.md                      |    2 +-
 docs/COMPATIBILITY.md                    |   76 +
 docs/START.md                            |   16 +-
 evals/intent-routing-cases.jsonl         |    2 +-
 registries/agents.json                   |   36 +-
 registries/decision-rules.json           |    8 +-
 registries/intents.json                  |   18 +-
 registries/policy.json                   |   16 +-
 registries/routing.json                  |    1 +
 rules/context.md                         |    8 +-
 rules/gates.md                           |   14 +-
 rules/parallelism.md                     |  111 +-
 rules/subagents.md                       |   23 +-
 rules/verification.md                    |   81 +-
 skills/retro/SKILL.md                    |   15 +
 src/checks/registries-coherence.ts       |    4 +-
 src/checks/registries.test.ts            |    4 +-
 src/cli.ts                               |    4 +
 src/hooks/post-edit-check.test.ts        |  430 +----
 src/hooks/post-edit-check.ts             |  187 +-
 src/hooks/stop-verify.test.ts            |  101 +-
 src/hooks/stop-verify.ts                 |  136 +-
 src/kernel/cli.test.ts                   |   30 +-
 src/kernel/cli.ts                        |   27 +
 src/kernel/resolve.test.ts               |   13 +-
 src/kernel/resolve.ts                    |   45 +
 src/registry/policy.test.ts              |    8 +-
 src/registry/policy.ts                   |   38 +-
 templates/adapters/README.md             |   17 +-
 templates/adapters/claude-code.md        |   11 +-
 templates/adapters/codex.md              |   30 +-
 templates/adapters/cursor.md             |    6 +-
 templates/cursor/commands/implement.md   |   29 +-
 70 files changed, 2529 insertions(+), 2289 deletions(-)
```
