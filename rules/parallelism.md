# Parallel Execution Rules — always on

Big work fans out. Parallel is the default for independent work; sequential is a
choice you justify, not a habit.

## Fan-out trigger

Fan out when **any** of these holds:

- The task touches **>3 files** or **more than one domain** (backend/frontend/mobile/dba/devops/llm).
- The spec/plan has **≥3 tasks with no dependency between them**.
- The work is a **sweep**: rename/migrate/refactor across many call sites, audit across modules, test backfill across files.
- The work is **read-heavy exploration** of several independent areas.

Do NOT fan out when: single file, fewer than 3 units of work, the goal is still
vague (brainstorm first), or every step feeds the next one.

## Procedure

1. **Decompose** into units with **disjoint file scope**. A unit = a set of files
   one agent owns exclusively for the duration.
2. **Freeze the contracts first.** Shared types, API schemas, DB schema, event
   payloads, and public module surfaces are designed by ONE agent (design model,
   see `rules/models.md`) and written down BEFORE any fan-out. Parallel agents
   consume contracts; they never negotiate them mid-flight.
3. **Group into waves** by dependency. Inside a wave: parallel. Between waves: a
   barrier — integrate and verify before the next wave starts.
4. **Dispatch a whole wave in ONE message** — multiple Task/Agent calls in the same
   assistant turn. Sequential dispatch of independent agents is a defect.
5. **Brief each agent** with: MODE (AUDIT|IMPLEMENT), exact file scope it owns,
   the frozen contracts, the model per `rules/models.md`, its rules to follow, and
   the output format expected back.
6. **Integrate + verify** at each barrier: typecheck + lint + tests, output shown
   (`superpowers:verification-before-completion`).

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
