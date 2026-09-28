# Add `topology-approval` to the closed human-in-the-loop reason list

Date: 2026-09-28
Status: accepted

Source: `docs/specs/2026-09-28-python-stack-and-agent-design-design.md` §4 (Part B, B1 and B5); contracts `docs/specs/2026-09-28-python-stack-and-agent-design-contracts.md` §4.

## Context

Seven of the developer's eight Python repos are LLM products and the recurring failure is a multi-agent graph written before anyone drew it: the supervisor, the handoffs and the shared state get decided in code and reviewed after the fact. Part B of the design puts a gate in front of that — the `agent-system-design` form, run by `llm-coordinator` in INTERVIEW mode, ends with the developer approving the topology before any graph code exists.

An approval is a human decision, and `docs/adr/2026-09-03-hitl-as-kernel-entity.md` decided that every human decision a gate demands is cited by a reason from the CLOSED list in `registries/policy.json` `hitl.reasons`, answered by the kernel and recorded under `## Human decisions` in the change record. The eight reasons that list carried were all implications of a risk tier (`high-risk`), of the evidence (`evidence-insufficient`), of the action's reach (`external-effect`, `destructive-action`) or of a runtime situation (`never-retry-situation`, `budget-exhausted`, `breaker-open`, `policy-conflict`). None of them says "the developer has not yet approved this design". Reusing one would be the free-text gate the closed list exists to prevent: a record citing `high-risk` for a medium-risk design interview is a record nobody can argue with.

## Options considered

1. **A ninth reason, `topology-approval`, folded into `resolve-task` from the matched decision rule `rule-multi-agent-design`** (chosen).
   - Pros: the prompt advisor announces the gate deterministically on the first prompt that names a multi-agent system, before any write; the reason is data, so telemetry emits it and the C26 mirror pair holds it against `rules/risk-autonomy.md`; the record home is the one every other human decision already uses.
   - Cons: it is the first reason folded from a decision rule's `when` condition rather than from a tier or a situation, so `resolve-task` gains a second fold path beside `decisions.any_high`; the closed list grows, which is a compatibility event.
2. **Raise `rule-multi-agent-design` to `risk: high` and let `high-risk` carry it** (rejected).
   - Pros: no new reason, no kernel change.
   - Cons: designing a topology is not high-risk work — it is a medium-floor design interview — and a tier assigned to trigger a gate is the gate theatre `rules/gates.md` warns about. It would also drag in the critic pass and the release-gate obligations of a real high tier for every agent-design conversation.
3. **A `require: developer-approval` entry with no hitl reason** (rejected).
   - Pros: already expressible in `decision-rules.json` `then.require`.
   - Cons: `required[]` is a list of artifacts owed, not a human gate; the prompt advisor would not announce a human-in-the-loop line, telemetry would not record it, and the change record would carry no `## Human decisions` entry — the approval would be invisible to exactly the observability the 2026-09-03 ADR was written for. The requirement is kept as well; it names the artifact, the reason names the decision.

## Decision

Option 1. `hitl.reasons` gains `topology-approval`, appended LAST so the kernel's emission order — which IS the list order — is unchanged for every existing reason. `hitlSection` gains a `topology` fact; when true it emits `topology-approval` and `required` is true, at any tier and any autonomy level. `resolve-task` sets the fact when a matched decision rule declares `when.multi_agent_system: true` — the fold reads the rule's declared condition, not its id — and folds hitl in at the floor the contract already carries. A floor alone still triggers nothing: below high, the tier contributes no reason, so the only reason a multi-agent prompt announces is the approval it owes.

## Consequences

- `registries/policy.json` `hitl.reasons` is nine ids; `rules/risk-autonomy.md` "Human-in-the-loop" carries the ninth row; C26c holds the pair in both directions.
- `registries/decision-rules.json` `rule-multi-agent-design` (priority 85, gate design, requires `agent-topology-spec`, `mermaid-workflow`, `developer-approval`) is the trigger; its signals are a subset of the `agent-system` and `llm` intent signals so a matched rule always arrives with a floor and a ceiling to ask about (`src/kernel/resolve.test.ts` holds this).
- The prompt advisor announces `human-in-the-loop required — reasons: topology-approval` on the first prompt; the developer's approval is recorded under `## Human decisions` before any graph code. A hook that blocks `Write` under `graph/` until that line exists is a follow-up (design §8), not part of this change.
- `scripts/kernel.sh hitl` (the legacy flag arm) does not yet expose `--topology`; `resolve --facts '{"hitl": {..., "topology": true}}'` and `resolve-task` are the two ways to reach the fact. Adding the flag is MINOR surface for a follow-up.
- Compatibility: additive (`docs/COMPATIBILITY.md` Unreleased). A consumer that enumerated the eight reasons by hand sees a ninth.

Revisit triggers: a second decision rule that owes a human decision of its own (the fold would then read a declared `hitl_reason` on the rule rather than a named `when` key), or a retro showing the approval line is recorded but never consulted.
