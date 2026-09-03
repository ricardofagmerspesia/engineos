# Risk & Autonomy Rules — always on

Every other gate in EngineOS is proportional to this file. Without a risk tier, a
migration that drops a column and a README typo get the same ceremony — one is
over-governed, the other under-governed, and both are wrong.

Classify risk BEFORE acting. State it in the router line:

`[router] intent=<intent> risk=<low|medium|high> autonomy=<A0-A4> loaded=<...>`

## Risk inputs

Take the HIGHEST tier any input reaches — risk does not average.

| Input | low | medium | high |
|---|---|---|---|
| Reversibility | trivially undone (`git revert`) | undone with effort | irreversible, or reversible only with data loss |
| Blast radius | one module, local only | a service, one team's surface | production, other teams, external consumers |
| Data sensitivity | no real data | internal data | PII, credentials, financial, clinical |
| Contract surface | private internals | internal module API | public/published API, DB schema, event payload |
| Spend | negligible | bounded and known | unbounded, or committing real money |

Shortcut floors — these are high regardless of the table: destructive DDL/DML,
secret rotation or exposure, auth/authz changes, production deploys and rollouts,
anything touching payments, and any action taken on someone else's behalf.

## Autonomy levels

| Level | Permitted | Typical use |
|---|---|---|
| A0 | Explain only. No writes. | Question, teaching, second opinion |
| A1 | Recommend, draft, propose a diff — do not apply it | Design proposal, audit finding, spec |
| A2 | Apply reversible changes in the working tree | Ordinary feature and fix work |
| A3 | Apply, but a human gate precedes any external effect | Migration, release, published content |
| A4 | Bounded autonomous operation, monitored, kill switch | Not currently granted in EngineOS |

## Mapping — the ceiling, not the target

| Risk | Autonomy ceiling | Also required |
|---|---|---|
| low | A2 | Change record |
| medium | A3 | Change record + the gates `rules/gates.md` names for the tier |
| high | A3, and A1 when evidence is thin | Human approval before external effect, rollback path, `security-reviewer` if the surface is security-relevant, `critic` pass per `rules/gates.md` |

A4 requires a written policy, an audit trail, and a proven rollback. EngineOS
grants none today — treat a task that seems to need A4 as a task that needs a
human.

## Human-in-the-loop

The ceiling says how far you may go alone. HITL says when a human must decide,
and names why, so the decision is auditable rather than implied by a tier.

HITL is answered from a **classified tier**, never from a risk floor. A floor is
an input to classification: on its own it requires no human, it only marks a
classification as owed — classify per the table above first. A gate announced
off a bare floor is the gate theatre `rules/gates.md` warns about, and it teaches
readers to ignore the gate that matters.

`scripts/kernel.sh hitl --risk <tier> --autonomy <ceiling> [--evidence thin] [--external-effect true] [--conflict true] [--situation <s>]`

| Reason | Fires when |
|---|---|
| `high-risk` | tier is high |
| `evidence-insufficient` | evidence is thin — autonomy drops one level, and no lower than A1; at risk high it drops to `autonomy.high_with_thin_evidence`. A drop never raises the level it was given |
| `external-effect` | the action leaves the working tree at A3 or above (merge, deploy, publish, send) |
| `policy-conflict` | a matched rule demands more than the classified tier permits — the caller has observed both |
| `never-retry-situation` | the situation is on `retry.never_retry` |
| `destructive-action` | destructive DDL/DML, secret rotation, data deletion |
| `budget-exhausted` | the repair or retry bound is spent, or backpressure answered `reject` |
| `breaker-open` | a needed resource's breaker is open with no alternative |

Those eight ids are the whole vocabulary — a gate may cite nothing else, because
a reason outside the list is one nobody can argue with or override.

`resolve-task` carries `hitl.required` and `hitl.reasons` so the prompt advisor
can announce them before the first write. On a floor-only prompt `hitl` is null
and `task_contract.risk_floor` is the whole answer; the advisor turns that into
an instruction to classify, never into a gate. The decision itself is recorded
in the change record under `## Human decisions`: who, when, which reasons, what
was approved or refused. A tier that requires a human and has no such record
has not passed its gate.

## Rules

- DO classify before the first write, not after. A risk tier assigned to justify
  work already done is not a classification.
- DO drop autonomy one level when evidence is thin, sources conflict, or the same
  approach has already failed once. Escalating the model (`rules/models.md`) and
  dropping autonomy are complementary, not alternatives.
- DO name the trigger when you gate: "high — irreversible DDL" beats "seems
  risky". A tier without its reason cannot be argued with or overridden.
- DON'T let a sub-agent operate above the tier of the work it was dispatched for.
  The dispatch brief carries the tier (`rules/parallelism.md` step 5).
- DON'T raise autonomy because the task is tedious, or because the user seems in
  a hurry. Urgency is not a risk input.
- DON'T treat "the user asked for it" as clearing a high-risk gate. It clears the
  decision to proceed; it does not clear the rollback path or the approval that
  the effect itself requires.

## Interaction with the always-on set

- `rules/security.md` owns WHAT is sensitive; this file owns HOW MUCH autonomy
  that sensitivity permits.
- `rules/gates.md` turns the tier into required artifacts.
- `rules/models.md` picks the model; this file picks the leash. A stronger model
  does not earn more autonomy.
