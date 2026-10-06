# Model Assignment Rules — always on

Choose capability for the work, then minimize cost without sacrificing correctness.

## Assignment by work type

| Work | Tier | Model today |
|---|---|---|
| Spec, PRD, requirements, problem framing, brainstorming, ADR | **most capable** | `fable` |
| Architecture, design, task decomposition, contract/interface design, fan-out planning | **design** | `opus` |
| Hard debugging, adversarial/security review, cross-cutting refactor design | **design** | `opus` |
| Writing code, tests, migrations, config — against an existing spec/design | **build** | `opus` |
| Standards/spec code review against an existing diff | **build** | `opus` |
| Mechanical: renames, boilerplate, file moves, formatting, simple lookups, summaries | **cheap** | `haiku` |

`critic`/`security-reviewer` remain design tier; ordinary standards/spec diff review
is build tier. Tier is the contract; model names are current bindings. Rebind the
table and `registries/models.json` together when models change; the validator checks
agreement. Test tier assignment never authorizes tests: only approved final work
under `rules/verification.md` uses it.

Build and design are bound to the same model today, but remain separate tiers.
State the intended tier; when build already failed at `opus`, escalating to design
is a no-op: use most capable (`fable`) or reframe.

## How the model gets set

1. Agent frontmatter `model:` supplies the default.
2. Dispatch-time `model` overrides frontmatter, including design/build changes.
3. Main loop retains the session model; delegate work requiring another model.

If spec/PRD authoring needs most capable and the session is below that tier,
dispatch it with `model: fable` rather than writing inline.

## Escalation and downgrade

- Escalate one tier after two same-task failures, ambiguous requirements,
  cross-cutting/security-sensitive work or hard-to-reverse output. Respect shared
  bindings: do not rerun `opus` and label it escalation from build.
- Downgrade only provably identical mechanical work with a fully specified target.
- Never trade correctness for cost; uncertainty favors the stronger tier.
- Announce models in fan-out for auditability.

## Budget and degradation

Check each rung; if ineligible, advance rather than bypassing its guard:

| Rung | Take it when | Do NOT take it when |
|---|---|---|
| 1. Cache | Same input computed; inputs unchanged | Upstream changed or freshness required |
| 2. Reduce context | Drop `rules/context.md` layers 5–6 | Drop layers 1–2 or supporting evidence |
| 3. Smaller model | Mechanical, fully specified target | Stronger-tier gates or medium+ risk (`rules/risk-autonomy.md`) |
| 4. Defer or batch | Needed by no current dependency | Blocks work or hides a failure |
| 5. Deny | Every earlier rung fails | — |

At rung 5 report the limit and ask; never silently swap to a weaker model.
Fan-out cost scales with agents × context: assess before dispatch, split into
more waves rather than degrade all workers. Absolute run/day/project budgets
belong in project `CLAUDE.md`; EngineOS owns the ladder.
