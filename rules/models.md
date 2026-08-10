# Model Assignment Rules — always on

Match the model to the kind of thinking the work needs. Capability first, cost
second — but never pay for capability the task doesn't use.

## Assignment by work type

| Work | Tier | Model today |
|---|---|---|
| Spec, PRD, requirements, problem framing, brainstorming, ADR | **most capable** | `fable` |
| Architecture, design, task decomposition, contract/interface design, fan-out planning | **design** | `opus` |
| Hard debugging, adversarial/security review, cross-cutting refactor design | **design** | `opus` |
| Writing code, tests, migrations, config — against an existing spec/design | **build** | `sonnet` |
| Standards/spec code review against an existing diff | **build** | `sonnet` |
| Mechanical: renames, boilerplate, file moves, formatting, simple lookups, summaries | **cheap** | `haiku` |

Adversarial correctness review (`critic`) and security review (`security-reviewer`)
stay design tier — the new code-review row above is the ordinary two-axis
(standards + spec) review against an existing diff, not the adversarial pass.

The tier is the contract; the model name is just today's binding. **"Most capable"
is a role, not a name** — when a newer or stronger model ships, rebind the tier to
it and update this table. Same when a model is retired.

The machine-readable form of this table is `registries/models.json`;
`scripts/validate-engineos.sh` fails when they disagree.

## How the model gets set

1. **Agent frontmatter** `model:` — the agent's default tier.
2. **Dispatch-time override** — pass `model` on the Task/Agent call; this wins over
   frontmatter. Use it when the same agent does design work in one wave and build
   work in the next.
3. **Main loop** keeps the session model. To run work on a different model, delegate
   it to a subagent with an explicit `model`.

When spec/PRD authoring is requested and the session model is below the most-capable
tier, dispatch the authoring to a subagent with `model: fable` rather than writing
it inline.

## Escalation and downgrade

- **Escalate one tier** when: an agent failed the same task twice, requirements are
  ambiguous, the change is cross-cutting or security-sensitive, or the output will
  be hard to reverse.
- **Downgrade** only when the result is provably identical — mechanical work with
  a fully specified target.
- **Never trade correctness for cost.** When in doubt, go up a tier.
- State the model in the fan-out announcement so the choice is auditable.

## Budget and degradation

"Never trade correctness for cost" says what not to do; it does not say what to do
when a budget actually binds. Improvising at that moment is how the trade happens
by accident.

**Degrade in this order.** Each rung is a gate, not an automatic step — check it
before taking it, and if the check fails, move to the next rung rather than
proceeding anyway:

| Rung | Take it when | Do NOT take it when |
|---|---|---|
| 1. Cache | The same input was already computed and inputs are unchanged | The upstream changed, or freshness is part of the requirement |
| 2. Reduce context | The dropped layers are `rules/context.md` layers 5–6 | It would drop layer 1–2, or the evidence the answer rests on |
| 3. Smaller model | Work is mechanical with a fully specified target | Gates assume the stronger tier, or risk is medium+ per `rules/risk-autonomy.md` |
| 4. Defer or batch | The result is not needed to unblock anything now | Something is blocked on it, or deferral hides a failure |
| 5. Deny | Every rung above failed its check | — |

When rung 5 is reached, say so and ask. A silent swap to a cheaper model on work
whose gates assumed the stronger one is exactly the correctness-for-cost trade the
rule above forbids — the trade is no better for being quiet.

**Fan-out budgets.** A wave costs roughly (agents × context per agent). Before
dispatching, sanity-check the wave against what the task is worth; if it does not
fit, split into more waves rather than degrading every agent in one.

Absolute limits (per-run, per-day, per-project) are project-specific and belong in
the project's own `CLAUDE.md`, not here — EngineOS sets the ladder, the project
sets the numbers.
