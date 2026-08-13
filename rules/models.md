# Model Assignment Rules — always on

Match the model to the kind of thinking the work needs. Capability first, cost
second — but never pay for capability the task doesn't use.

## Assignment by work type

| Work | Tier | Model today |
|---|---|---|
| Spec, PRD, requirements, problem framing, brainstorming | **most capable** | `fable` |
| Architecture, design, ADR, task decomposition, contract/interface design, fan-out planning | **design** | `opus` |
| Hard debugging, adversarial/security review, cross-cutting refactor design | **design** | `opus` |
| Writing code, tests, migrations, config — against an existing spec/design | **build** | `sonnet` |
| Mechanical: renames, boilerplate, file moves, formatting, simple lookups, summaries | **cheap** | `haiku` |

The tier is the contract; the model name is just today's binding. **"Most capable"
is a role, not a name** — when a newer or stronger model ships, rebind the tier to
it and update this table. Same when a model is retired.

The "tests" in the build-tier row is a tier assignment, not a mandate: tests get
written only when they're in scope for the task per `rules/verification.md` ("Tests
are opt-in"). When they are in scope, they're built on the same `sonnet` tier as
the rest of the code.

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
