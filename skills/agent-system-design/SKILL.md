---
name: agent-system-design
description: Interactive design gate for any system with more than one agent — a 12-step form Claude walks with the developer one decision at a time, a pattern catalog, and a topology spec with two Mermaid diagrams the developer approves before any graph code. Use when a request involves multiple agents, orchestration, a supervisor, LangGraph, or agent-to-agent handoff.
---

# Agent-system design

Apply `rules/llm-apps.md` from EngineOS first (EngineOS rules — resolved relative to
EngineOS's `CLAUDE.md`, the repo/plugin root, not this project). This skill is the
design gate that rule names: before a system with more than one agent gets its first
line of graph code, its topology is designed in a form the **developer** answers step
by step, written to a spec, drawn twice, and approved.

Vocabulary, fixed: **developer** = the person driving Claude with EngineOS;
**user** = the person who uses the product being built; **Claude** = the model.
Every approval here is the developer's, given in the Claude session and recorded in
the change record. A product that needs its *user* to confirm an action picks the
`user-approval-interrupt` catalog pattern — that is a product feature, not this gate.

## When it fires

- The `agent-system` intent matched (`/engineos:design-agents`, or a request with
  multi-agent, orchestration, supervisor, LangGraph, A2A, handoff signals), or
- decision rule `rule-multi-agent-design` fired and the prompt advisor announced
  "human-in-the-loop required — reasons: topology-approval".

Either way the procedure is `patterns/3-Agent-topology-interview.md`, run by the
`llm-coordinator` persona (alias `hermsdorff`) in INTERVIEW mode, in the main
session — never in a subagent, because every step waits for the developer.

## Non-negotiable rules

1. **One step at a time.** Claude asks the step's question, presents the options
   with their trade-offs and one recommendation grounded in the answers so far, and
   **waits** for the developer's answer. It never asks two steps in one message.
2. **Nothing is defaulted or skipped.** An unanswered step blocks the next one. "Use
   your judgement" is answered by restating the recommendation and asking again.
3. **Claude never picks the topology.** Step 1 recommends; the developer chooses.
   The same holds for every later step.
4. **Answers land in the spec as they are given.** After each answer Claude writes
   the step's section into `docs/specs/<date>-<slug>-agent-topology.md` (from
   `templates/agent-topology.md`), so an interrupted session resumes from the file
   with `/engineos:design-agents resume`.
5. **Recommendations cite code.** Where a labv-style reference implementation
   exists, the recommendation points at `file:line` — `references/form.md` carries
   the citations per step.
6. **Two diagrams before approval.** Step 12 renders the flowchart and the sequence
   diagram; the developer reviews both.
7. **The approval line is the exit.** Only after
   `<date> | <developer> | topology-approval | approved | docs/specs/<file>` is
   written under the change record's `## Human decisions` may `langgraph-patterns`
   be loaded and graph code written. Before that line, no `graph/`, `agents/` or
   `tools/` file is created.

## The form — 12 steps

The full script — the question as asked, the options, how the recommendation is
derived, the exact spec section produced, the "do not proceed until" line — is
`references/form.md`. Read it before step 1; it is the enforcement mechanism for
the rules above.

| Step | Decision | What gets written into the spec |
|---|---|---|
| 1 | Topology — a catalog pattern or a named combination | `pattern_ids` front-matter + §1 pattern and why |
| 2 | Agent roster — purpose, model role, what each agent must never see | §2 roster table |
| 3 | Tools — the eight sub-decisions, per tool (the longest step) | §3 tool contract table + context table |
| 4 | Communication protocol — shared state, typed envelopes or A2A; sync/async | §4 protocol section |
| 5 | Context scoping — one typed task packet per agent | §5 one Pydantic model per agent |
| 6 | Memory per agent — none, summary buffer or store; scope; what survives a turn | §6 memory table |
| 7 | Harness — entry point, iteration cap, recursion limit, timeout, retry and cost budgets, evaluator | §7 harness table |
| 8 | Guardrails — tenant scoping, per-agent tool allowlist, sanitization | §8 guardrail list |
| 9 | Failure policy — degrade vs fail per agent; fallback agent | §9 policy table |
| 10 | Observability — run and correlation ids, per-agent traces, tokens per role | §10 observability section |
| 11 | Evals — golden set per tool, per agent, one end-to-end | §11 eval plan |
| 12 | Diagram review — flowchart + sequence diagram, then the approval line | §12 two Mermaid blocks; front-matter `status: approved` |

## Pattern catalog

Offered at step 1 with a recommendation, never applied automatically. One file per
pattern, same skeleton (use when · do not use when · decisions it forces · LangGraph
shape · failure modes · eval strategy · example).

| id | One line | File |
|---|---|---|
| `react-tool-loop` | Single agent, tool loop, evaluator + bounded retry (the demo's shape) | `references/patterns/react-tool-loop.md` |
| `grounded-pipeline` | Normalize → prompt → generate → deterministic ground-check → one corrective regeneration → warnings (labv-assist) | `references/patterns/grounded-pipeline.md` |
| `supervisor-workers` | One router agent dispatches typed task packets to specialists and assembles their output contracts | `references/patterns/supervisor-workers.md` |
| `typed-pipeline` | Fixed stages, Pydantic in/out per stage, testable stage by stage | `references/patterns/typed-pipeline.md` |
| `rule-first-router` | Deterministic classification first, the model only for the residue | `references/patterns/rule-first-router.md` |
| `evaluator-optimizer` | Generator + critic, standard verdict schema, retry guard mirrored in the routing function | `references/patterns/evaluator-optimizer.md` |
| `fanout-aggregate` | Independent sub-tasks via `Send`, a reducer merges or votes; decides what one failed branch does | `references/patterns/fanout-aggregate.md` |
| `plan-execute-replan` | Planner emits a typed step list, executor runs, replanner revises on failure | `references/patterns/plan-execute-replan.md` |
| `user-approval-interrupt` | `interrupt()` + `Command(resume=…)` for actions with external effect — a **product** pattern, the user confirms | `references/patterns/user-approval-interrupt.md` |
| `handoff-swarm` | Agents transfer control through explicit handoff tools, no supervisor; says when it is the wrong choice | `references/patterns/handoff-swarm.md` |

Cross-cutting references, folded into every pattern and into step 3:

| Reference | Covers |
|---|---|
| `references/context-enriched-tools.md` | The three context layers (semantic, curated, machine facts), the registry, the tool-embedded sub-agent, the `_result` / `_handoff_result` envelope, the guards |
| `references/tenant-profiles.md` | Profile resolved from the JWT claim, `${ENV}` placeholders, per-role model defaults with per-tenant overrides, secret-free projection, default + overlay merge rules |

## Where the pieces live

- Template: `templates/agent-topology.md` in the EngineOS root. The form reads it
  from there at run time and writes the filled copy into the **project's**
  `docs/specs/`; nothing is copied on `init`.
- Spec: `docs/specs/<date>-<slug>-agent-topology.md`; the change record's `spec:`
  field points at it.
- Approval: the change record's `## Human decisions`, reason `topology-approval`
  (`registries/policy.json` `hitl.reasons`).

## How it composes

- **`/engineos:route`** resolves the `agent-system` intent and announces the
  `topology-approval` gate; this skill is what satisfies that gate. The router
  never runs the form.
- **`rules/parallelism.md`** — an approved topology is usually the wave plan: each
  agent, its tools and its task packet become one unit with a disjoint file scope
  (`agents/<name>.py`, `tools/<name>.py`, the packet model), the graph wiring is
  the barrier after them. Derive the waves from §2 and §3 of the spec, not from
  scratch.
- **`rules/llm-apps.md`** — the tool, prompt and eval rules apply to every agent in
  the roster; step 3 and step 11 are where they are made concrete.
- **`langgraph-patterns`** — loaded only after the approval line exists, to
  implement the approved shape. A linear pipeline (`grounded-pipeline`,
  `typed-pipeline`) needs no graph: it is a plain `async` use case per
  `python-patterns`.
- **`eval-harness`** — scaffolds the step-11 plan once code exists.

## Pre-flight before reporting the gate passed

- [ ] Every one of the 12 sections in the spec has content the developer gave — no
      `<placeholder>` left, no "TBD".
- [ ] `pattern_ids` in the front-matter match §1.
- [ ] §3 has all eight sub-decisions for every tool in the inventory.
- [ ] §5 has one packet model per agent in §2.
- [ ] Both Mermaid blocks render and the developer said so.
- [ ] The approval line is in the change record with reason `topology-approval`,
      and the spec front-matter says `status: approved`.
- [ ] No file under `graph/`, `agents/` or `tools/` was written during the form.
