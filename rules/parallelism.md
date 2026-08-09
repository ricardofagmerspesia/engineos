# Parallel Execution Rules — always on

Every substantive task starts as a task list and gets distributed. Parallel is
the default; sequential is a choice you justify, not a habit. One agent grinding
through a list alone is a defect when the list could have been split.

## Decompose-and-distribute — the default

For ANY substantive task (anything that creates or modifies code, config, or
docs beyond a single small edit):

1. **Create the task list first** — break the request into named tasks (TaskCreate
   or the plan's task list) before writing any code.
2. **Distribute among agents always** — every task that doesn't depend on another
   in-flight task goes to a sub-agent. Two independent tasks = two agents in one
   message, not one agent doing both.
3. The orchestrator's job is contracts, dispatch, integration, and the final
   verification gate — not doing the tasks inline.

Do NOT fan out only when: pure question/explanation, a single-line mechanical
edit, the goal is still vague (brainstorm first), or every step genuinely feeds
the next one (inherently serial chain — say so explicitly).

## Procedure

1. **Decompose** into units with **disjoint file scope**. A unit = a set of files
   one agent owns exclusively for the duration.
2. **Freeze the contracts first.** Shared types, API schemas, DB schema, event
   payloads, and public module surfaces are designed by ONE agent (design model,
   see `rules/models.md`) and written down BEFORE any fan-out. Parallel agents
   consume contracts; they never negotiate them mid-flight.
3. **Group into waves** by dependency. Inside a wave: parallel. Between waves: a
   barrier — integrate before the next wave starts.
4. **Dispatch a whole wave in ONE message** — multiple Task/Agent calls in the same
   assistant turn. Sequential dispatch of independent agents is a defect.
5. **Brief each agent** with: MODE (AUDIT|IMPLEMENT), exact file scope it owns,
   the frozen contracts, the model per `rules/models.md`, its rules to follow,
   whether tests are IN SCOPE for its task (per `rules/testing.md` "Tests are
   opt-in"), and the output format expected back. IMPLEMENT agents write tests
   only when the brief says tests are in scope; either way, NONE of them run the
   test suite themselves — execution belongs to the final gate
   (`rules/testing.md` "Verification timing").
6. **Integrate** at each barrier: wire the pieces, resolve contract drift, keep
   moving. **Verify once at the FINAL barrier**: lint + typecheck, plus tests
   only when tests were in scope for the task, output shown
   (`superpowers:verification-before-completion`). Intermediate barriers do
   not run the suite — mid-task verification stalls the pipeline
   (`rules/testing.md` "Verification timing").

## Hard rules

- **No two agents write the same file.** Disjoint scopes, or serialize them.
- **Subagents cannot spawn subagents.** Only the top-level orchestrator fans out;
  the agent graph is flat, one level deep.
- **Cap concurrency at ~6 agents per wave.** More than that → split into waves.
- **Use git worktree isolation** when parallel agents run builds/tests in the same
  repo and would collide on build artifacts or lockfiles.
- **Announce the plan in one line** before dispatching:
  `[fanout] waves=<n> wave1=<agent:scope, agent:scope> model=<per-agent>`
- **Report partial failure honestly.** If one agent fails, say which unit is
  incomplete — never let a green summary hide a dead branch.

## Choosing the fan-out mechanism

| Situation | Use |
|---|---|
| Multi-domain change with known scope | `/engineos:implement <domain> <task>` |
| Multi-domain read-only analysis | `/engineos:audit <domain>` |
| N independent units in one domain | Task tool, N calls in one message, same coordinator agent, different scopes |
| Plan already written, tasks independent | `superpowers:subagent-driven-development` |
| Generic 2+ independent tasks | `superpowers:dispatching-parallel-agents` |
