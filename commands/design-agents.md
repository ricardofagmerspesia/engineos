---
description: Interactive agent-topology design — llm-coordinator (hermsdorff) in INTERVIEW mode walks the agent-system-design form one step at a time, writes the topology spec with two Mermaid diagrams, and records the developer's approval before any agent/workflow code (uses patterns/3-Agent-topology-interview.md).
argument-hint: [resume]
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

Run the `llm-coordinator` persona (alias `hermsdorff`) in **INTERVIEW mode in this
session** — do NOT dispatch a subagent, because every one of the twelve steps waits
for the developer's answer.

Developer = session operator; user = product user. All design approvals are the
developer's. Product confirmations use user-approval-interrupt, a separate pattern.

Steps:
1. Resolve the EngineOS install root — `${CLAUDE_PLUGIN_ROOT}` in plugin mode, the
   engineos repo otherwise (this command runs with the target project as cwd).
   From it read `agents/llm-coordinator.md` (the INTERVIEW section),
   `patterns/3-Agent-topology-interview.md`, and load the `agent-system-design`
   skill (Skill tool), which reads `skills/agent-system-design/references/form.md`
   and points at `templates/agent-topology.md`. Adopt that persona and procedure.
2. Use the selected Node.js/TypeScript, NestJS and Mastra stack. Ask only
   unresolved project details; do not ask the developer to select the framework
   again. A single chatbot/agent loads `mastra-patterns` directly and does not
   enter this multi-agent topology interview.
3. Confirm a change record is open in `.engineos/changes/`; if none is, open one
   from `_template.md` first (domain `llm`) — the approval line needs a home.
4. If `$ARGUMENTS` is `resume`: find the newest `docs/specs/*-agent-topology.md`
   with `status: draft`, summarize the filled sections back to the developer, and
   re-enter the form at the first section still holding a `<placeholder>`.
   Otherwise: ask the developer for the system's name and slug, create
   `docs/specs/<date>-<slug>-agent-topology.md` in the **target project** from the
   template, set the change record's `spec:` field to it, and start at step 1.
5. Walk the form: ask one step, wait, record the answer into its spec section,
   check the step's "do not proceed until" line, ask the next. Recommendations
   cite `file:line` in the reference repos where `form.md` names one. Never pick
   for the developer; never default or skip a step; write no code.
6. At step 12 render the flowchart and the sequence diagram from the spec and ask
   for approval. On "approved": write
   `<date> | <developer> | topology-approval | approved | docs/specs/<file>` under
   the change record's `## Human decisions`, set the spec front-matter to
   `status: approved` with `approved_by` and `approved_on`, and stop.
7. End with one line: the spec path, the pattern ids, and the next step —
   `mastra-patterns` for Mastra agents/typed workflow steps in NestJS providers and
   the wave plan derived from §2 and §3 per `rules/parallelism.md`.

No agent, workflow or tool implementation file is written by this command;
multi-agent implementation waits until the approval line exists.
`mastra-patterns` may be read for planning before approval. Never write
secrets into the spec — reference env var names.
