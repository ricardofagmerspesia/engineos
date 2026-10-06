---
description: Interactive agent-topology design — llm-coordinator (hermsdorff) in INTERVIEW mode walks the agent-system-design form one step at a time, writes the topology spec with two Mermaid diagrams, and records the developer's approval before any graph code (uses patterns/3-Agent-topology-interview.md).
argument-hint: [resume]
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

Run the `llm-coordinator` persona (alias `hermsdorff`) in **INTERVIEW mode in this
session** — do NOT dispatch a subagent, because every one of the twelve steps waits
for the developer's answer.

Vocabulary: the **developer** is the person driving this session; the **user** is
the person who will use the product being designed. Every approval here is the
developer's. A product that must ask its user to confirm an action picks the
`user-approval-interrupt` catalog pattern inside the form — that is not this gate.

Steps:
1. Resolve the EngineOS install root — `${CLAUDE_PLUGIN_ROOT}` in plugin mode, the
   engineos repo otherwise (this command runs with the target project as cwd).
   From it read `agents/llm-coordinator.md` (the INTERVIEW section),
   `patterns/3-Agent-topology-interview.md`, and load the `agent-system-design`
   skill (Skill tool), which reads `skills/agent-system-design/references/form.md`
   and points at `templates/agent-topology.md`. Adopt that persona and procedure.
2. Settle the runtime first: in a greenfield repo ask the stack question
   (`rules/base.md` "New projects — stack first") before the form; a non-Python
   answer is accepted, with a note that the catalog and `langgraph-patterns` assume Python.
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
   `langgraph-patterns` for a tool loop (or `python-patterns` for a pipeline) and
   the wave plan derived from §2 and §3 per `rules/parallelism.md`.

No file under `graph/`, `agents/` or `tools/` is written by this command, and
`langgraph-patterns` is not loaded, until the approval line exists. Never write
secrets into the spec — reference env var names.
