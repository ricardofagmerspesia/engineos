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

Past **>3 files**, more than one domain, or 3 independent tasks, distribution is
not a judgment call any more — it is the only correct shape. Those are the signals
`registries/policy.json` carries; below them the default above still holds.

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
   the frozen contracts, the model per `rules/models.md`, the risk tier and
   autonomy ceiling per `rules/risk-autonomy.md`, its rules to follow, whether
   tests are IN SCOPE for its task (per `rules/verification.md` "Tests are
   opt-in"), and the return envelope expected back (`## Return format` in every
   agent file). IMPLEMENT agents write tests only when the brief says tests are in
   scope; either way, NONE of them run the test suite themselves — execution
   belongs to the final gate (`rules/verification.md`). Context discipline for the
   brief: `rules/context.md`.
6. **Integrate** at each barrier: wire the pieces, resolve contract drift, keep
   moving. **Run the final gate at the LAST barrier only** (`rules/verification.md`).
   Intermediate barriers integrate; they do not verify — mid-task verification
   stalls the pipeline. Write a handoff at every barrier using
   `templates/handoff.md` — the next wave's agents cannot read this conversation,
   and "continue where wave 1 left off" is not a brief.

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
  incomplete — never let a green summary hide a dead branch. The `status` field of
  the return envelope is the mechanism: `BLOCKED` and `FAILED` are real answers.

## Backpressure

The wave cap says how many agents may run. Backpressure says what happens when
work arrives faster than the cap drains it. Before every dispatch the
orchestrator asks the kernel:

`scripts/kernel.sh admit --inflight <running agents> --queued <units waiting>`

| Answer | Meaning |
|---|---|
| `dispatch` | capacity remains under the wave cap — go |
| `defer` | cap reached, queue below `max_queued_units` (12) — hold the unit for the next wave |
| `reject` | cap reached and queue full — stop planning, report `BLOCKED`, re-plan with a human |

`reject` is a HITL reason (`budget-exhausted`), not a retry. Capacity is the
same number as the wave cap above; the queue bound lives in
`registries/policy.json` `parallelism.backpressure`.

## Failure policy

An agent that fails is a normal event with a defined response, not an improvisation.

| Situation | Response |
|---|---|
| Transient failure (timeout, rate limit, flaky tool) | Retry once, same model |
| Failed again, or returned `FAILED` with a substantive reason | Escalate one tier per `rules/models.md` and retry once. That is the last retry |
| Failed at the escalated tier | Stop. Report the unit incomplete with what was tried |
| Returned `BLOCKED` | Do not retry — the input is missing. Supply it or drop the unit |
| Returned `DEGRADED` | Accept, but carry the caveat into the barrier report. Do not silently upgrade it to OK |

**Never retry these — escalate to the human immediately, on the first occurrence:**
security risk, possible data loss, an irreversible action whose gate is unclear,
or ambiguity the agent could not resolve. Retrying an agent that is uncertain
produces a more confident wrong answer, not a right one.

**A failed unit blocks its wave's barrier.** Do not start the next wave around a
hole. Either fix the unit, or re-plan the remaining waves with the hole explicit.

**Bound the loop.** Two attempts per unit, one escalation, then a human. An agent
retried until it succeeds has not succeeded — it has been sampled until it looked
right.

## Circuit breaker

The failure policy above is per unit. The breaker is per resource, and the
resource kinds it scopes over are `provider`, `mcp` (an MCP server), `tool` and
`agent` (an agent type). It answers a different question: not "retry?" but "why
are we still calling this?". Consult it BEFORE `retry`.

Those scope ids are the orchestrator's own vocabulary for keying a breaker's
state — the kernel never reads them, so nothing enforces them beyond this
section and `registries/policy.json` `breaker.scopes`.

`scripts/kernel.sh breaker --state closed --failures <consecutive failures on this resource>`

| State | Rule |
|---|---|
| `closed` | calls allowed; `failure_threshold` (3) consecutive failures opens it |
| `open` | calls blocked for `cooldown_waves` (1); route around or report `DEGRADED` |
| `half-open` | after cooldown, `half_open_probes` (1) call is allowed; success closes, failure reopens |

The consecutive-failure count comes from the exec journal
(`rules/observability.md` "Agent traces"): `span_kind` `tool` or `model`,
`status: FAILED`, same `tool`/`provider`. An open breaker on a resource a unit
needs makes that unit `BLOCKED`, which is a HITL reason (`breaker-open`) when
no alternative resource exists.

## Choosing the fan-out mechanism

| Situation | Use |
|---|---|
| Multi-domain change with known scope | `/engineos:implement <domain> <task>` |
| Multi-domain read-only analysis | `/engineos:audit <domain>` |
| N independent units in one domain | Task tool, N calls in one message, same coordinator agent, different scopes |
| Plan already written, tasks independent | `superpowers:subagent-driven-development` |
| Generic 2+ independent tasks | `superpowers:dispatching-parallel-agents` |
