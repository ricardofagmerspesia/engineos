# Agent-topology interview procedure

Design a **product** multi-agent system before any agent/workflow implementation:
twelve decisions, immediate spec updates, two diagrams and recorded developer consent.
Questions/options/gates: `skills/agent-system-design/references/form.md`;
schema: `templates/agent-topology.md`; persona: `llm-coordinator`
(alias `hermsdorff`) INTERVIEW via `/engineos:design-agents`.
Resolve these from EngineOS install root (`${CLAUDE_PLUGIN_ROOT}` for plugins),
not the target project. Development-worker dispatch follows parallelism rules;
it does not enter this product interview.

## Preconditions

- agent-system intent or rule-multi-agent-design announced topology-approval.
- Active `.engineos/changes/` record, linked through spec: when the spec exists.
- Developer main session; no subagent interview because each decision waits.
- agent-system-design loaded; form.md read before step 1.
- Fixed stack: Mastra/Node.js/TypeScript in NestJS providers. Ask only unresolved
  project facts, never reselect the framework. Single-agent chatbots load
  mastra-patterns directly and skip the gate.

## The loop

1. Ask the form question with options/trade-offs and one recommendation grounded
   in prior answers/reference file:line evidence. End with the question.
2. Wait for the developer; partial answers require missing facts. “Whatever you
   think” becomes a proposal for explicit consent. Infer no decision/default.
3. Record immediately in `docs/specs/<date>-<slug>-agent-topology.md`, created
   from the template at step 1. Preserve free text, shape its required table and
   show it for same-turn confirmation. Replace only the answered section's placeholders.
4. Apply that step's “do not proceed until” condition; ask the next only when met.
   Never skip/merge steps or ask several together. Revisited decisions replace
   their section and trigger re-asking every dependent later step.

## Resume

`/engineos:design-agents resume` reads the newest draft topology spec, or its
named argument. Summarize filled sections, identify the first placeholder and
resume there. Check saved answers with the developer; re-ask completed decisions
only on request or changed dependencies.

## What the persona may and may not do

Read relevant target docs/code/settings/tests and cited historical reference repos
(labv-opensearch-agent-demo/backend, labv-assist/app)/catalog files for grounding.
Write/rewrite only the spec; step 12 also writes approval/frontmatter in the change
record. Render both diagrams. Read mastra-patterns for planning when needed.

Before approval write no agent/workflow/tool implementation, prompts or tests;
dispatch no builders/other agents during the form. Offer recommendations, never
choose topology/tools/budgets/policies on the developer's behalf.

## Exit condition

Developer says approved at step 12; under change-record `## Human decisions`:

```
<date> | <developer> | topology-approval | approved | docs/specs/<date>-<slug>-agent-topology.md
```

Spec status is approved with approved_by/approved_on; pattern_ids matches §1.
Every pre-flight item in agent-system-design must pass. Otherwise leave draft for
resume. Approval permits implementation, not tests.

## Hand-off to implementation

After consent, use mastra-patterns for agents/typed workflow steps in NestJS
providers; deterministic stages may use typed helpers. Derive exclusive units for
each §2 agent (implementation + packet) and §3 tool (schema + implementation),
with spec path/sections in each dispatch. Integrate shared Mastra wiring after its
dependencies under parallelism rules. Builders read the spec, not chat history.
Only after integration and explicit current-task final-stage test approval may
`eval-harness` author/run §11.
