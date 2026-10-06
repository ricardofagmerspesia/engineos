---
status: draft            # draft | approved — approved only after the step-12 approval line exists in the change record
approved_by: <developer>
approved_on: <YYYY-MM-DD>
pattern_ids: [<react-tool-loop | grounded-pipeline | supervisor-workers | typed-pipeline | rule-first-router | evaluator-optimizer | fanout-aggregate | plan-execute-replan | user-approval-interrupt | handoff-swarm>]
---

# Agent topology — <system or feature name>

> Fill sections in order from developer answers via /engineos:design-agents.
> Approved specs contain no placeholders. Change record spec: points here;
> ## Human decisions records §12 approval.

Change record: `.engineos/changes/<YYYY-MM-DD>-<slug>.md`
Grounding repos consulted: <paths, or "none">
Stack: Node.js/TypeScript; Mastra agents/tools/workflows/memory hosted by NestJS providers.

## 1. Topology

- Shape of the work: <linear pipeline | tool loop>
- Decision makers: <one | several — which>
- Pattern id(s): `<id>`<, `<id>`>
- Why: <the reason in the developer's words>
- Rejected alternative: `<id>` — <why not>
- Orchestration: <Mastra agent with tools | Mastra workflow with typed steps>

## 2. Agent roster

| Agent | Purpose (one sentence) | Model role | Never sees | Tools (from §3) |
|---|---|---|---|---|
| `<agent_1>` | <purpose> | `<router | dsl | evaluator | narrator | compute | …>` | <raw user message / other agents' reasoning / tool payloads / credentials / other tenants' data> | `<ToolA>`, `<ToolB>` |
| `<agent_2>` | <purpose> | `<role>` | <…> | <…> |

## 3. Tools

Envelope shape shared by every tool that returns data:

```json
{ "_dsl": "<what was executed>", "_result": "<preview the model sees, capped>", "_handoff_result": "<full payload, server-side only>", "_pagination": "<optional note>" }
```

### 3a. Tool contract table

| Tool | Purpose | Input schema (every field described) | Envelope | Callers | Depends on | Sub-agent role | Self-repair N | Error codes | Size cap | Memo key | Handoff sentinel | Tenant binding | Fail-closed guards |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `<ToolNameTool>` | <purpose> | `<ToolNameInput>` | <`_result` only / `_result` + `_handoff_result`> | `<agent_1>` | `<OtherTool>` — stated in <description + prompt block behind flag `<ENABLE_X>`> | <none / `<role>`> | <n> | `ERROR_<REASON>`, … | <n chars → replan> | `<index::question>` / none | `<LAST_SEARCH>` / none | <closure over tenant-restricted credentials at construction> | <tenant filter injected, forbidden clauses stripped, index prefix checked, session id overridden> |

### 3b. Context table

| Tool | Semantic layer (owner, refresh) | Curated context (default + overlay; merge rules) | Machine facts (refresh cadence; write guards) | Injected into |
|---|---|---|---|---|
| `<ToolNameTool>` | <yes — developer, on PR / no> | <yes — `<default file>` + `<overlay file>`; union / override by key / concatenate / no> | <yes — <weekly + startup>; min entities <n>, max field-loss ratio <r> / no> | <the tool's own sub-agent prompt> |

### 3c. Tool evals

| Tool | Golden pairs (question → query) | Curated-vs-facts contradiction test |
|---|---|---|
| `<ToolNameTool>` | <n> | <yes / n.a.> |

## 4. Communication protocol

- Carrier: <typed workflow state | typed message envelopes | network protocol (A2A)>
- Protocol constants module: `<src/mastra/protocol.ts>`

| From | To | Carrier | Sync / async | Envelope type |
|---|---|---|---|---|
| `<agent_1>` | `<agent_2>` | <state key `<key>` / envelope / HTTP> | <sync | async + join> | `<Agent2TaskPacket>` |

## 5. Context scoping — task packets

One strict, readonly zod task-packet schema per agent, in roster order.
Unexpected keys fail schema validation at the boundary.

```typescript
import { z } from 'zod';

const Budget = z.object({
  maxTokens: z.number().int().positive(),
  maxToolCalls: z.number().int().positive(),
  timeoutMs: z.number().positive(),
}).strict().readonly();
const TaskPacket = z.object({
  runId: z.string(), tenantId: z.string(), task: z.string(),
  inputs: AgentInputsSchema,
  constraints: AgentConstraintsSchema,
  budget: Budget, outputContract: z.literal('AgentOutput'),
}).strict().readonly();
type AgentTaskPacket = z.infer<typeof TaskPacket>;
// Define a strict AgentOutput schema for the fields the next agent consumes.
```

## 6. Memory

| Agent | Memory kind | Scope | Survives a turn | Storage key |
|---|---|---|---|---|
| `<agent_1>` | <none | scoped Mastra conversation/working memory | store> | <session | user | tenant> | <what, exactly — or "nothing"> | `<company__user__profile__session>` |

## 7. Harness

Entry point: `<NestJS controller/worker → Mastra provider | approved CLI>`

| Bound | Value | Where enforced |
|---|---|---|
| Iteration cap | <n> | <agent-step guard and workflow routing> |
| Workflow transition cap | <bounded loops/handoffs> | <NestJS provider and bounded workflow routing> |
| Wall-clock timeout | <n s> | <AbortSignal timeout propagated through the run> |
| Retry budget | <n> | <state `max_retries`, mirrored in `should_retry`> |
| Token / cost budget | <n tokens / <currency> per run> | <callback per role> |
| Evaluator | `<evaluator>` — verdict `<Verdict>` | <workflow branch: retry only on `retry_recommended` and non-empty `retry_instruction`> |

## 8. Guardrails

| Guard | Agent(s) | Where it runs | Fails closed? |
|---|---|---|---|
| Tenant scoping — <source of the tenant fact> | <all> | <tool construction> | <yes> |
| Tool allowlist | `<agent_1>` | <tool executor, from `constraints.tool_allowlist`> | <yes> |
| Input sanitization | <agents that read the raw user message> | <API edge> | <yes / no — on purpose because …> |
| Output sanitization + token gate | <agents whose output reaches the user> | <final node / stream> | <yes> |

## 9. Failure policy

| Agent | On failure | Fallback | What the user sees |
|---|---|---|---|
| `<agent_1>` | <degrade to warning | fail the run> | <`<fallback_agent>` / none> | <a sentence> |

## 10. Observability

- Run id: <where minted, where carried>; correlation id: <request middleware>
- Spans: <one per agent and per tool sub-agent — chain / llm / tool, with role tag>
- Token accounting: <per role and per model, in <callback | tool result>; internal tool model calls included>
- Usage record: <once per prompt version, in a `finally`>
- Trace destination: <log | Mastra observability | OpenTelemetry | decided later on <date>>

## 11. Evals

Plan criteria here; author and run executable cases only after integration and
explicit current-task final-stage user approval (rules/verification.md).

| Level | Fixture | Assertion | Count | Owner |
|---|---|---|---|---|
| Per tool | question → query | <query equals / matches> | <n> | <who> |
| Per agent | `<Agent>TaskPacket` → `<Agent>Output` | zod schema parsing + <fields the next agent reads> | <n> | <who> |
| End-to-end | <the one input §12 draws> | <final output contract> | 1 | <who> |

No test calls the provider. Runtime scoring: <Mastra evaluator agent/workflow step + deterministic check `<name>`>.

## 12. Diagrams and approval

### Flowchart — nodes and conditional edges (labels are the routing function's return values)

```mermaid
flowchart TD
    START([START]) --> <agent_1>
    <agent_1> -->|continue| <tools>
    <tools> --> <agent_1>
    <agent_1> -->|evaluate| <evaluator>
    <agent_1> -->|end| END([END])
    <evaluator> -->|retry| <agent_1>
    <evaluator> -->|end| END
```

### Sequence — one sample run (the §11 end-to-end input): what each agent receives and returns

```mermaid
sequenceDiagram
    participant U as user
    participant A1 as <agent_1> (<role>)
    participant T as <ToolNameTool>
    participant E as <evaluator> (<role>)
    U->>A1: <input>
    Note over A1: receives <Agent1>TaskPacket{…}
    A1->>T: <ToolNameTool>(<args>)
    T-->>A1: {"_result": …, "_handoff_result": server-side}
    A1->>E: <Agent1>Output{…}
    E-->>A1: <Verdict>{passed, retry_recommended, retry_instruction}
    A1-->>U: <what the user receives>
```

### Approval

Recorded in the change record under `## Human decisions`:

```
<YYYY-MM-DD> | <developer> | topology-approval | approved | docs/specs/<YYYY-MM-DD>-<slug>-agent-topology.md
```

Only after this line exists: front-matter `status: approved`, multi-agent
implementation authorized, wave plan derived from §2 and §3 per
`rules/parallelism.md`. `mastra-patterns` may be read earlier for planning.
