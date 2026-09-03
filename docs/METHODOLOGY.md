# EngineOS Methodology

**Status:** canonical operating model  
**Scope:** AI-assisted engineering tasks governed by EngineOS

EngineOS exists to improve engineering outcomes without applying the same
ceremony to every change. It resolves policy before action, limits autonomy by
risk, requires evidence before completion, and feeds recurring failures back
into the method.

This document owns the lifecycle and `CONTEXT.md` owns the vocabulary.
`registries/` owns machine-resolvable policy values, `rules/` owns behavioral
constraints, and `templates/adapters/` states what each tool can actually
enforce.

## The interface: one task contract

Callers should not need to understand every rule, hook, skill, or agent. Every
substantive task exposes the same small contract:

| Field | Required content |
|---|---|
| Objective | The observable outcome, not the requested activity |
| Scope | Owned files or systems, exclusions, and frozen contracts |
| Risk | `low`, `medium`, or `high`, plus the fact that set the tier |
| Autonomy | The allowed ceiling (`A0`–`A3`; EngineOS does not grant `A4`) |
| Gates | Required exits and artifacts derived from risk and decision rules |
| Verification | Checks in scope, including an explicit tests-on/off decision |
| Evidence | Source-attributed outputs, findings, and approvals |
| State | Current gate, known failures, and one concrete next action |

The contract can live in the plan, change record, or handoff; do not duplicate
it merely to satisfy a template. A low-risk one-line edit may express it in one
line. A high-risk release needs the full contract.

## The control loop

```mermaid
flowchart LR
    A["Frame objective and acceptance"] --> B["Resolve route, risk, autonomy, gates, HITL"]
    B --> C{"Design required?"}
    C -- "yes" --> D["Design and freeze contracts"]
    C -- "no" --> E0
    D --> E0["Admit: capacity? (backpressure)"]
    E0 -- "dispatch" --> E["Execute in bounded scope"]
    E0 -- "defer" --> E0
    E0 -- "reject" --> H
    E -- "resource failing" --> BR{"Breaker open?"}
    BR -- "yes" --> H
    BR -- "no" --> E
    E --> F["Verify with declared checks"]
    F -- "red, repair budget remains" --> E
    F -- "scope or risk changed" --> B
    F -- "blocked or budget exhausted" --> H["Human decision (hitl reasons recorded)"]
    F -- "green" --> G{"External effect?"}
    G -- "yes" --> I["Release gate and approval"]
    G -- "no" --> J["Record evidence, spans and close"]
    I --> J
    J --> K["Retro: learn from repeated evidence"]
    K -- "approved policy delta" --> B
```

The gates form a ladder, but execution is a feedback loop. A changed scope goes
back through policy resolution. A failed check returns to bounded repair. A
blocked or exhausted task stops for a human; it does not sample until green.

Three of the boxes above are kernel answers rather than judgement.
`kernel.sh admit` answers admission — `dispatch`, `defer` or `reject` against
the wave cap and the queue bound. `kernel.sh breaker` answers whether a failing
resource is still worth calling, per resource and separately from the per-unit
`retry` and the per-check `repair`. `kernel.sh hitl` answers whether a human must
decide and names why, from a closed reason vocabulary
(`registries/policy.json` `hitl.reasons`) — so every human stop carries a reason
id and a record home rather than an inference from the tier, and a gate citing
anything outside that list is not citing policy. The kernel resolves these; it
does not enforce them, and nothing in the repo calls `admit` before a dispatch
today. Only `high-risk` has an automatic producer (`resolve-task`, via
`decision_rules.any_high`); the other reasons arrive from a caller that
observed the situation. `kernel.sh` is the resolver for all three and
`registries/policy.json` owns the values.

## Policy ownership

One meaning has one owner. Other artifacts point to it or mechanically check a
mirror; they do not restate it.

| Meaning | Owner |
|---|---|
| Machine-resolvable risk, gates, retry, and parallelism values | `registries/policy.json` |
| Intent and file routing | `registries/intents.json`, `registries/routing.json` |
| Conditional artifact requirements | `registries/decision-rules.json` |
| Behavioral constraints and rationale | the relevant `rules/*.md` file |
| Procedure | the relevant `skills/*/SKILL.md` file |
| Executor capability and return contract | `registries/capabilities.json` + `agents/*.md` |
| Tool mapping and enforcement gaps | `templates/adapters/` |
| Task evidence | change record or handoff |

If a registry and its prose mirror disagree, the methodology is inconsistent.
Do not invent precedence between them: stop, resolve the owner, and add an
integrity check that makes the disagreement recur as a red build.

## Enforcement strength

Every mechanism must use one honest label:

- **Blocking** — prevents the transition or external effect.
- **Checked** — fails an integrity check or CI after the fact.
- **Advisory** — emits guidance but cannot prevent non-compliance.
- **Conventional** — depends on an agent or human following the documented rule.

Strength is adapter-specific. Under Claude Code, Stop hooks can block completion.
On tools without Stop hooks, the same requirement is checked in CI or remains a
convention. Portability of the method does not imply portability of enforcement.

## Risk proportionality

- Every substantive task gets a task contract; ceremony scales with risk.
- Risk is the maximum of the declared inputs, never an average.
- Reclassify when scope, destination, data, contract surface, reversibility, or
  spend changes. The initial tier is not permanent.
- Thin or conflicting evidence lowers autonomy even when the nominal risk tier
  stays the same.
- Any external effect uses the release gate. High-risk effects require a human
  approval recorded with the evidence.

`rules/risk-autonomy.md` owns the detailed mapping and `rules/gates.md` owns the
exit criteria.

## Evidence contract

Evidence must name its source and date or execution time. A completion claim
includes:

1. the checks declared in the task contract and their actual output;
2. the files or systems changed;
3. unresolved failures and residual risks;
4. approvals required by the autonomy ceiling; and
5. the next operational action when the change ships.

Tests are part of the contract when requested, required by the project, assigned
to a test agent, or included in a named release/merge gate. Otherwise the record
says `[tests] skipped — not requested`; it never implies that tests passed.

## Learning and effectiveness

EngineOS measures two different things and must not confuse them:

| Layer | Examples | What it proves |
|---|---|---|
| Internal conformance | integrity checks, routing evals, gate events, bounded retries | The method behaved as specified |
| Engineering effectiveness | escaped defects, convention-review comments, lead time, rollback rate, false gate blocks, bypass rate | The method improved delivery |

Internal conformance is necessary but does not prove better engineering. Before
claiming effectiveness, compare a dated baseline with a pilot window of similar
work. Keep prompt text, secrets, and PII out of telemetry; join task-level process
data to PR or incident outcomes outside the prompt log.

The retro loop promotes a change only from repeated evidence (normally three
independent occurrences), adds detection before prose, and keeps human approval
between a proposal and a policy change.

## Method changes

A methodology change is complete only when all applicable parts move together:

1. the owning registry or rule changes;
2. its human or machine mirror is updated without duplicating ownership;
3. a check or eval detects regression;
4. compatibility impact is recorded; and
5. the change record carries the evidence.

That is the deletion test for governance: if removing a mechanism would not
change a decision, prevent a violation, or produce useful evidence, simplify or
remove it.
