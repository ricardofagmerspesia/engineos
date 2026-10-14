---
name: 2026-10-08-prototype-preview-gate
status: done
completed: 2026-10-08
owner: codex
spec: docs/specs/2026-10-08-prototype-preview-gate-design.md
domain: llm
---

## What

Require a pre-implementation prototype choice and conditional preview approval,
and offer optional Matt Pocock session retro at task completion.

## Why

Let the user inspect planned behavior before production code is written.

## Scope

One consolidated prose/procedure update; no runtime contracts or external effects.
Branch main, PR unknown; existing unrelated working-tree changes preserved.

## Checklist

- [x] Confirm intended prototype skill and freeze design contract.
- [x] Integrate scoped workflow guidance.
- [x] Independent critic and final applicable non-test validation.

## What was made

Added the central prototype-choice/approval and completion-retro procedures in
rules/parallelism.md. Updated implement/new-feature/implement-spec commands,
native spec/implement-spec skills, AGENTS/CLAUDE constitution pointers,
Codex/Cursor instruction adapters and compatibility notes (11 guidance files).
No runtime code, schemas, vendor skills or generated bundles changed in this task.

Unanswered preview choices pause production writes/dispatch; yes generates a
throwaway prototype and requires separate scope/revision-bound implementation
approval. Declined/approved unchanged-scope decisions persist on resume.
Completion offers upstream session retro once, with explicit opt-in and no
recursive offer or automatic implementation of recommendations.

## Human decisions

2026-10-08 | developer | high-risk | authorized reversible working-tree guidance
update and confirmed engineos:prototype as the intended skill. This confirmation
identifies the skill; it does not approve a future preview or external effect.

2026-10-08 | developer | also requested optional Matt Pocock /retro offer at end
of task; execution of the retro remains conditional on a separate yes.

## Verification

node dist/engineos.cjs validate: exit 0, passed 113, failed 0.
git diff --check: exit 0. Local Markdown links on 12 relevant files: no missing links.
Independent preview_critic read-only review: CLEAR, no blocking findings.
Build/typecheck/startup not applicable to this prose-only patch; no tests/evals
executed or newly authorized. No preview or retro executed: user requested workflow
changes, not a current preview or retro run. Instruction enforcement remains
conventional; no release/consumer rollout, commit or PR performed.

## Changes registered

Working-tree guidance update only, branch main, PR unknown. No Git/forge writes.
Repository-wide snapshots include previous workflow implementation and unrelated
concurrent aliases, architecture/visual docs, registries and preexisting pnpm files.
These are not attributed to this task; preserved shared-file edits were not reverted.

Snapshot after archival; untracked additions appear in status only:

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
?? docs/specs/2026-10-08-prototype-preview-gate-design.md
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
 AGENTS.md                                |   18 +-
 CLAUDE.md                                |   20 +-
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
 commands/implement.md                    |   22 +-
 commands/new-feature.md                  |  195 ++----
 dist/engineos.cjs                        | 1011 ++++++++++++++++++++++++++++--
 docs/BIG-PICTURE-lifecycle.html          |   26 +-
 docs/BIG-PICTURE.html                    |   18 +-
 docs/BIG-PICTURE.md                      |    2 +-
 docs/COMPATIBILITY.md                    |   42 ++
 docs/START.md                            |   16 +-
 evals/intent-routing-cases.jsonl         |    2 +-
 registries/agents.json                   |   36 +-
 registries/intents.json                  |   16 +-
 registries/policy.json                   |   16 +-
 registries/routing.json                  |    1 +
 rules/gates.md                           |    3 +-
 rules/parallelism.md                     |   95 ++-
 rules/subagents.md                       |   23 +-
 rules/verification.md                    |   25 +-
 skills/retro/SKILL.md                    |   10 +
 src/cli.ts                               |    4 +
 src/kernel/cli.ts                        |   13 +
 src/kernel/resolve.ts                    |   45 ++
 src/registry/policy.test.ts              |    8 +-
 src/registry/policy.ts                   |   38 +-
 templates/adapters/README.md             |   10 +
 templates/adapters/codex.md              |   21 +
 templates/cursor/commands/implement.md   |   20 +-
 56 files changed, 1483 insertions(+), 439 deletions(-)
```
