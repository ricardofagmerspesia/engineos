# Make human-in-the-loop a kernel entity with a closed reason list

Date: 2026-09-03
Status: accepted

Source: `docs/specs/2026-09-03-engineos-default-methodology-plan.md` Part A1 row 3, Part A2.1, Part A2.2, Part A3 row "HITL shape".

## Context

Part A1 finding 3 — "HITL not a first-class entity" — verdict **partially true**:

> `HITL` = 0 hits. Semantics exist deterministically: `policy.autonomy` A3 "a human gate precedes any external effect", `gates.by_risk.high.release = required-plus-human-approval`. Missing: a kernel answer, a reason taxonomy, a record home.

The semantics are already policy (`policy.json:47` `autonomy`, `rules/risk-autonomy.md`, `rules/gates.md`), but they are scattered: a gate that stops for a human today cites prose, the prompt-advisor hook cannot ask the kernel "is a human required here, and why?", telemetry cannot emit the answer, and there is no agreed place where the human's decision gets written down. The review's central complaint is observability; a human gate that leaves no queryable trace is invisible to it.

## Options considered

1. **`hitl` block with a closed reason list; `kernel.sh hitl` subcommand; result folded into `resolve-task`** (chosen).
   - Pros: the prompt-advisor hook gets a deterministic answer from `resolve-task`; the reason vocabulary is data, so it can be validated, emitted as a telemetry event, and mirrored in prose by a checked pair; the record home makes every human decision auditable.
   - Cons: a closed list is public surface — adding a reason is a registry change under `docs/COMPATIBILITY.md`, not a sentence in a rule; the prose in `rules/risk-autonomy.md` and `rules/gates.md` still has to exist as the human mirror, so there are two places to keep aligned (by validator, not by memory).
2. **Prose-only taxonomy in `rules/risk-autonomy.md`** (rejected).
   - Pros: no new registry surface, no compatibility window, one file.
   - Cons: Part A3: "Prose cannot be queried by the prompt-advisor hook or emitted as telemetry; the review's whole point is observability." It would document the gate without making it observable.

## Decision

Option 1. HITL becomes something the kernel can answer about: a `hitl` policy block whose `reasons` are the only vocabulary a gate may cite, a `hitl` subcommand, and a `hitl: {required, reasons}` field in `resolve-task` computed from `risk_floor`. The deciding reason is that the finding is about observability, and only data — not prose — can be queried by hooks and emitted as telemetry.

## Consequences

The implementing task honours the Part A2.1 contract verbatim:

```json
"hitl": {
  "note": "Human-in-the-loop as an entity the kernel can answer about. Reasons are the only vocabulary a gate may cite; the record home is where the decision is written so it is auditable. Answered by scripts/kernel.sh hitl and folded into resolve-task. Mirrored in rules/risk-autonomy.md 'Human-in-the-loop' and rules/gates.md release checklist.",
  "reasons": [
    "high-risk",
    "evidence-insufficient",
    "external-effect",
    "policy-conflict",
    "never-retry-situation",
    "destructive-action",
    "budget-exhausted",
    "breaker-open"
  ],
  "situations": ["destructive", "budget-exhausted", "reject", "breaker-open"],
  "record_home": ".engineos/changes/<record>.md#human-decisions"
},
```

and the new `telemetry.events[]` entry (with `written_by` becoming an array across all events, closing the C22c one-directional gap):

```json
{
  "id": "hitl",
  "written_by": ["hooks/prompt-advisor.sh"],
  "keys": ["required", "reasons"],
  "sample": {"required": true, "reasons": ["high-risk", "external-effect"]}
}
```

and the Part A2.2 subcommand signatures:

| Subcommand | Input | Output |
|---|---|---|
| `hitl --risk T --autonomy A0..A4 [--evidence thin\|adequate] [--external-effect true\|false] [--conflict true\|false] [--situation S]` | S ∈ `retry.never_retry` ∪ `hitl.situations` | `{required: bool, reasons: [...], autonomy_after: A0..A4, record_home}` |
| `resolve-task` (existing) | unchanged | gains `hitl: {required, reasons}` computed from `risk_floor` |

All malformed input → `{"error": "..."}` on stdout, exit 1 (existing `err` convention).

Further obligations:

- Every `reasons[]` value the kernel emits is a member of `hitl.reasons`; a gate that needs a reason outside the list changes the registry (with a compatibility window), never free text.
- `--situation` accepts exactly `retry.never_retry` ∪ `hitl.situations`; every `retry.never_retry` value maps to the `never-retry-situation` reason.
- The human's decision is written at `record_home` — a `## Human decisions` section (anchor `#human-decisions`) of the change record — so the audit trail lives with the change, not in chat.
- `rules/risk-autonomy.md` gains a "Human-in-the-loop" section and `rules/gates.md`'s release checklist cites the reason vocabulary; both are checked prose/data mirrors.
- `hooks/prompt-advisor.sh` emits the `hitl` telemetry event with `required` and `reasons` only — ids and outcomes, never prompt text (`value_pattern` invariant).
- What becomes harder: extending the vocabulary is deliberate and slow. That is the point of a closed list.

Revisit triggers: a gate that recurs with no fitting reason three times (retro signal), or a project that needs a record home other than the change record (for example an external tracker), which would make `record_home` per-project configuration rather than a policy constant.
