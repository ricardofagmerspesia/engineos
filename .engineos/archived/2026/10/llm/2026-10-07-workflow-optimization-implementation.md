---
name: 2026-10-07-workflow-optimization-implementation
status: done
completed: 2026-10-07
owner: codex
spec: docs/specs/2026-10-07-workflow-optimization-plan.md
domain: llm
---

## What

Implement the approved workflow optimization plan in the working tree.

## Why

Make Fast Path, safe DAG scheduling and incremental evidence operational while
preserving risk, compatibility, test consent and host permissions.

## Scope

Existing kernel, deterministic scheduler, lifecycle metrics, native workflow
skills, policy mirrors and adapter guidance. No model provider, cloud service,
deployments, git/forge writes or unrelated pnpm changes.

## Checklist

- [x] U1: policy and frozen contracts.
- [x] U2: Fast Path.
- [x] U3: scheduler and incremental actions.
- [x] U4: performance report and retro.
- [x] U5: native workflow and host integration.
- [x] U6: targeted tests, independent review, compatibility checks and synthetic CLI evidence. Real-workload comparison remains pending and no measured savings are claimed.

## What was made

Implemented shared workflow-v1.1 contracts; risk-aware Fast Path and soft task budgets;
a dependency-ready scheduler with exclusive scopes, bounded retries and integration-based
release; evidence-backed incremental results; bounded journals and performance reports;
and EngineOS-owned spec, implement-spec, PR and retro procedures. Updated canonical
policies, constitution mirrors, compatibility notes, host guidance and runtime bundle.

Host launching and durable persistence remain conventional integration responsibilities.
No built-in native Codex/Claude launcher or crash-recovery guarantee is claimed.

## Verification

Targeted tests explicitly authorized on 2026-10-07, after integration.
Final directed suite: 73/73 passing, including 43 new behavior cases. Build and
typecheck passed; integrity validation passed 113/113; diff whitespace check passed.
Built-bundle Fast Path and DAG CLI smoke checks passed. Independent critic and security
reviews found no remaining blocking issue in the reviewed workflow scope after fixes.

Wider related suite: 209/212 passed; three existing Python stack/intent expectations
remain failing. Tests were not skipped or rewritten. Empirical workload TTFR/cost
comparison and release gates remain open. Full evidence and boundaries are recorded in
`docs/perf/2026-10-07-workflow-validation.md`; repository-wide green is not claimed.

## Human decisions

- 2026-10-07 | developer | high-risk | approved working-tree implementation
  via “go for it”; no release or external-effect approval.
- 2026-10-07 | developer | test scope: Fast Path, scheduler, metrics and integration |
  explicitly authorized test authoring/execution after integration.

## Changes registered

Working-tree implementation only. Active branch main; PR unknown; no Git/forge writes.
The following repository-wide snapshots include concurrent work, not just this task.
Agent/agent-command alias changes, analyze-architecture, START/BIG-PICTURE documents,
agent registry/eval changes and pnpm files are excluded from this task. Shared intent
and constitution files preserve concurrent alias edits.

Snapshot after archival (untracked additions are listed in status, not diff stat):

```text
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
 M registries/intents.json
 M registries/policy.json
 M registries/routing.json
 M rules/gates.md
 M rules/parallelism.md
 M rules/subagents.md
 M rules/verification.md
 M skills/retro/SKILL.md
 M src/cli.ts
 M src/kernel/cli.ts
 M src/kernel/resolve.ts
 M src/registry/policy.test.ts
 M src/registry/policy.ts
 M templates/adapters/README.md
 M templates/adapters/codex.md
 M templates/cursor/commands/implement.md
?? .engineos/archived/2026/10/docs/
?? .engineos/archived/2026/10/llm/
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
?? docs/specs/2026-10-07-workflow-optimization-plan.md
?? pnpm-lock.yaml
?? pnpm-workspace.yaml
?? skills/engineos-implement-spec/
?? skills/engineos-spec/
?? skills/pr/
?? src/journal/workflow.test.ts
?? src/journal/workflow.ts
?? src/kernel/execution.test.ts
?? src/kernel/execution.ts
?? src/report/workflow-cli.ts
?? src/report/workflow.test.ts
?? src/report/workflow.ts
?? src/scheduler/
?? src/workflow/
```

```text
 AGENTS.md                                |   11 +-
 CLAUDE.md                                |   13 +-
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
 commands/implement.md                    |   13 +-
 commands/new-feature.md                  |  190 ++----
 dist/engineos.cjs                        | 1011 ++++++++++++++++++++++++++++--
 docs/BIG-PICTURE-lifecycle.html          |   26 +-
 docs/BIG-PICTURE.html                    |   18 +-
 docs/BIG-PICTURE.md                      |    2 +-
 docs/COMPATIBILITY.md                    |   25 +
 docs/START.md                            |   16 +-
 evals/intent-routing-cases.jsonl         |    2 +-
 registries/agents.json                   |   36 +-
 registries/intents.json                  |   16 +-
 registries/policy.json                   |   16 +-
 registries/routing.json                  |    1 +
 rules/gates.md                           |    3 +-
 rules/parallelism.md                     |   44 +-
 rules/subagents.md                       |   23 +-
 rules/verification.md                    |   25 +-
 skills/retro/SKILL.md                    |   10 +
 src/cli.ts                               |    4 +
 src/kernel/cli.ts                        |   13 +
 src/kernel/resolve.ts                    |   45 ++
 src/registry/policy.test.ts              |    8 +-
 src/registry/policy.ts                   |   38 +-
 templates/adapters/README.md             |   10 +
 templates/adapters/codex.md              |   14 +
 templates/cursor/commands/implement.md   |   11 +-
 56 files changed, 1375 insertions(+), 435 deletions(-)
```

## Notes

Risk high: public execution contracts; autonomy A2. No new application agent
topology or model calls are being introduced. Existing plans/ADR and untracked
pnpm files predate implementation and are preserved.
