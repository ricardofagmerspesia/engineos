---
name: agent-system-design
description: "Interview the developer through 12 product multi-agent topology decisions; record contracts, two diagrams and approval before implementation. Use for product multi-agent orchestration, supervisors, A2A or handoffs; single chatbots and development-worker dispatch skip this gate."
---

# Agent-system design

Apply EngineOS's `rules/llm-apps.md` first. This gate designs a **product** with
multiple agents before any agent/workflow/tool implementation. Development-worker
dispatch follows `rules/parallelism.md`, not this interview. A single Mastra
chatbot/agent loads `mastra-patterns` directly.

Vocabulary: **developer** drives the coding session; **user** uses the product;
**Claude** is the model. Developer topology consent is recorded once in the change
record. Product-user action consent is the `user-approval-interrupt` pattern.

## Trigger and procedure

Fire when `agent-system` matches (`/engineos:design-agents`, multi-agent,
orchestration, supervisor, Mastra workflows, A2A, handoff), or
`rule-multi-agent-design` announces HITL reason `topology-approval`.
Use `patterns/3-Agent-topology-interview.md`, with `llm-coordinator`
(alias `hermsdorff`) in INTERVIEW mode in the developer's main session;
interactive interviews never run in a subagent.

1. Read `references/form.md` before step 1; consult the current step again as
   needed. Ask one step at a time: options, trade-offs, one grounded recommendation,
   then wait. No skipped/unanswered steps, inferred defaults or model-chosen topology.
   “Use your judgement” gets the recommendation restated for explicit agreement.
2. Record each developer answer immediately in
   `docs/specs/<date>-<slug>-agent-topology.md`, from
   `templates/agent-topology.md` at the EngineOS root. Resume through
   `/engineos:design-agents resume`. Cite reference implementations as
   `file:line` where available; otherwise state there is no reference.
3. Complete the 12 decisions below. Step 12 renders both diagrams for developer
   review, then records consent. Before that record, create no multi-agent
   implementation files, including tools/workflows. Reading `mastra-patterns`
   for planning is permitted.

| Step | Decision | Spec obligation |
|---|---|---|
| 1 | Catalog pattern or named combination | `pattern_ids` + §1 pattern/reason |
| 2 | Purpose, model role, exclusions per agent | §2 roster |
| 3 | Eight sub-decisions per tool | §3 contracts + context |
| 4 | State, envelopes or A2A; sync/async | §4 every hop |
| 5 | Scoped typed packet and output per agent | §5 zod models |
| 6 | None, scoped Mastra memory or store; retention | §6 memory rows |
| 7 | Entry point, iterations/transitions, timeout, retries, tokens/cost, evaluator | §7 numeric bounds/enforcement |
| 8 | Tenant binding, tool allowlists, sanitization | §8 guards |
| 9 | Degrade/fail/fallback per agent | §9 policies |
| 10 | Run/correlation ids, spans, per-role usage | §10 tracing |
| 11 | Per-tool, per-agent, end-to-end golden criteria | §11 eval plan |
| 12 | Flowchart + sequence review and consent | §12 diagrams; `status: approved` |

## Pattern catalog

Read only the applicable pattern files before recommending. Each retains selection
criteria, forced decisions, Mastra shape, failures, eval plan and provenance.

| id | Shape | File |
|---|---|---|
| `react-tool-loop` | One agent, contextual tools, evaluator, bounded retry | `references/patterns/react-tool-loop.md` |
| `grounded-pipeline` | Normalize/generate, deterministic grounding, one correction, warnings | `references/patterns/grounded-pipeline.md` |
| `supervisor-workers` | Router dispatches specialist packets and assembles outputs | `references/patterns/supervisor-workers.md` |
| `typed-pipeline` | Fixed stages with zod input/output | `references/patterns/typed-pipeline.md` |
| `rule-first-router` | Deterministic classification; model handles residue | `references/patterns/rule-first-router.md` |
| `evaluator-optimizer` | Generator/critic; typed verdict; mirrored retry guard | `references/patterns/evaluator-optimizer.md` |
| `fanout-aggregate` | Bounded independent branches, merge/vote, failure policy | `references/patterns/fanout-aggregate.md` |
| `plan-execute-replan` | Typed plan, one-step execution, eligible tail replanning | `references/patterns/plan-execute-replan.md` |
| `user-approval-interrupt` | Product-user consent through durable suspend/resume | `references/patterns/user-approval-interrupt.md` |
| `handoff-swarm` | Explicit peer transfers without a product supervisor | `references/patterns/handoff-swarm.md` |

At step 3 load `references/context-enriched-tools.md`: semantic/curated/machine
context, registry, internal agent, `_result`/`_handoff_result`, guards.
For profile/model/memory/security decisions load `references/tenant-profiles.md`:
JWT identity, `${ENV}`, role overrides, secret-free UI projection, overlay merge.

## Runtime and implementation handoff

Mastra on Node.js/TypeScript inside NestJS providers is fixed policy. NestJS owns
transport, authentication and lifecycle; never ask to reselect the framework.
Historical Python citations are design provenance, not executable APIs. Resolve
active APIs/lifecycle against installed dependencies and official
[agents](https://mastra.ai/docs/agents/overview),
[workflows](https://mastra.ai/docs/workflows/overview),
[suspend/resume](https://mastra.ai/docs/workflows/suspend-and-resume) docs
(reviewed 2026-10-06). Catalog shapes are architecture recommendations.

The router announces this gate but never runs the form. The change record's
`spec:` points to the topology spec; consent lives under `## Human decisions`
with policy reason `topology-approval`. After approval, derive exclusive worker
scopes/dependencies from §2/§3 under `rules/parallelism.md`; integrate shared
workflow wiring after dependencies. All agents follow `rules/llm-apps.md`.
`mastra-patterns` implements the approved shape; deterministic stages may use
plain typed helpers. `eval-harness` authors/runs §11 only after integration and
explicit current-task final-stage test approval.

## Pre-flight before reporting the gate passed

- All 12 sections contain developer decisions; no placeholders/TBD.
- `pattern_ids` matches §1; §3 records all eight decisions for every tool.
- §5 has packet/output models for every §2 agent.
- Both Mermaid blocks render and the developer confirmed this.
- Spec fields are `status: approved`, `approved_by`, `approved_on`.
- Under the change record's `## Human decisions` appears:
  `<date> | <developer> | topology-approval | approved | docs/specs/<file>`.
- No agent/workflow/tool implementation was written during the interview.
