Interview the developer to design the topology of a system with more than one
agent before any graph code exists. Walk the twelve-step form one decision at a
time, write each answer into the topology spec as it is given, draw the result
twice, and stop only when the developer's approval is recorded in the change record.

Note: this file is the interview **procedure** — the sibling of
`patterns/2-Interview-brainstorm.md` for agent systems. The questions themselves,
the options, the recommendation rules and the spec sections live in
`skills/agent-system-design/references/form.md`; the spec shape lives in
`templates/agent-topology.md`. The persona is `llm-coordinator` (alias
`hermsdorff`) in INTERVIEW mode (`agents/llm-coordinator.md`), invoked by
`/engineos:design-agents`. All three are resolved from the EngineOS install root
(`${CLAUDE_PLUGIN_ROOT}` in plugin mode, the engineos repo otherwise), not from
the target project.

## Preconditions

- The `agent-system` intent matched, or decision rule `rule-multi-agent-design`
  fired and the prompt advisor announced the `topology-approval` gate.
- A change record is open in `.engineos/changes/`; its `spec:` field will point
  at the topology spec once the file exists.
- The session is the developer's main session. INTERVIEW is interactive: it does
  not run in a subagent, because a subagent cannot wait for the developer.
- `skills/agent-system-design/SKILL.md` has been loaded (Skill tool) and
  `references/form.md` read.
- The runtime is settled: it is the developer's answer to the stack question
  (`rules/base.md` "New projects — stack first"). If the repo is greenfield, ask it
  before step 1; if the answer is not Python, say that `langgraph-patterns`,
  `python-patterns` and the template's `.py` paths assume Python, then proceed.

## The loop

For each step 1 → 12, in order, never two in one message:

1. **Ask.** State the step's question as `form.md` phrases it, the options with
   their trade-offs, and one recommendation grounded in the answers already in
   the spec — with `file:line` into the reference repos where one exists. End
   the message with the question.
2. **Wait.** Do nothing until the developer answers. "Whatever you think" is
   restated as a proposal and asked again; a partial answer gets the missing
   half asked back.
3. **Record.** Write the answer into its section of
   `docs/specs/<date>-<slug>-agent-topology.md` (created from
   `templates/agent-topology.md` at step 1, in the target project's `docs/specs/`).
   Shape a free-text answer into the section's table and show the shaped version
   for confirmation in the same turn. The `<placeholder>` for that section is gone
   after this; nothing else in the file changes.
4. **Next.** Check the step's "do not proceed until" line in `form.md`. If it
   holds, ask the next step. If not, ask for what is missing.

A step the developer revisits is rewritten in place, and every later step that
depended on it is re-asked from the loop, not patched.

## Resume

`/engineos:design-agents resume` opens the newest `docs/specs/*-agent-topology.md`
whose front-matter says `status: draft` (or the one named as the argument), reads
it, announces which sections are filled and which is the first one still holding a
`<placeholder>`, and re-enters the loop at that step. Filled sections are
summarized back to the developer in one message before the first question, so a
resumed session is checked, not trusted. Nothing is re-asked unless the developer
asks for it.

## What the persona may and may not do

May:

- Read the target repo — its `docs/`, existing `graph/`, `agents/`, `tools/`,
  settings, tests — to ground a recommendation in what is already there.
- Read the reference implementations named in `form.md`
  (`labv-opensearch-agent-demo/backend`, `labv-assist/app`) and the pattern files
  under `skills/agent-system-design/references/` to cite them.
- Write and rewrite the topology spec, and — at step 12 only — the approval line
  in the change record and the spec front-matter.
- Render the two Mermaid diagrams and ask for a review.

May not:

- Write code: no file under `graph/`, `agents/`, `tools/`, no test, no prompt
  module. The spec is the only artifact until the approval line exists.
- Dispatch builders or any other agent. The form is a conversation with the
  developer; there is no one else to hand work to yet.
- Pick for the developer: no topology, agent, tool decision, bound or policy is
  filled in by default or by inference. A recommendation is offered; the
  developer's word is what gets recorded.
- Skip or merge steps, or ask several steps in one message to "save time".
- Load `langgraph-patterns` before the approval line is recorded.

## Exit condition

The developer said "approved" at step 12, and the change record carries, under
`## Human decisions`:

```
<date> | <developer> | topology-approval | approved | docs/specs/<date>-<slug>-agent-topology.md
```

The spec front-matter reads `status: approved`, `approved_by`, `approved_on`, and
`pattern_ids` matches §1. The pre-flight list in
`skills/agent-system-design/SKILL.md` is checked and every box is true. Only
then does the interview end; a session that stops earlier leaves the spec in
`status: draft` for `resume`.

## Hand-off to implementation

- Load `langgraph-patterns` for a tool-loop topology; for a pipeline topology
  (`grounded-pipeline`, `typed-pipeline`) no graph is written — `python-patterns`
  gives the plain `async` use case.
- Derive the wave plan per `rules/parallelism.md` from the approved spec: one
  unit per agent (its node, its packet model, its evals) and one per tool (its
  schema, its sub-agent, its golden pairs), with disjoint file scopes; the graph
  wiring, the harness and the end-to-end eval are the barrier after them.
- Each unit's prompt carries the spec path and the sections it implements; the
  builders read the spec, not this conversation.
- `eval-harness` scaffolds §11 once the first code exists.
