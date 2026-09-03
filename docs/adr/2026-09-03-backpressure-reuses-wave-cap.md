# Put backpressure under `parallelism.backpressure`, reusing `wave_concurrency_cap`

Date: 2026-09-03
Status: accepted

Source: `docs/specs/2026-09-03-engineos-default-methodology-plan.md` Part A1 row 1, Part A2.1, Part A3 row "Where backpressure lives".

## Context

Part A1 finding 1 — "Backpressure absent as first-class policy" — verdict **partially true**:

> `registries/policy.json:133` `wave_concurrency_cap: 6` is the only control; `max_inflight`, `max_queue`, `overload` = 0 hits repo-wide. A static cap exists; admission control, a queue bound and an overload action do not.

The orchestrator's dispatch loop therefore has a ceiling but no admission decision: nothing says what happens when a wave is full and more units are ready, and nothing bounds how many units may wait. Whatever block carries that policy needs a capacity number, and the repo already has one at `policy.json:133`, guarded by validator check C16 (`scripts/validate-engineos.sh`, "C16: decision-kernel registries").

## Options considered

1. **`parallelism.backpressure` sub-block that reuses `wave_concurrency_cap`** (chosen) — the new block carries only what is new (queue bound, overload action, action vocabulary); capacity is read from the sibling key.
   - Pros: one copy of the capacity number; C16 already guards it; `rules/parallelism.md` already documents the cap, so the prose mirror is an extension, not a second table.
   - Cons: the block is not self-contained — a reader of `backpressure` must look one level up for capacity, and `kernel.sh admit` must read two keys instead of one.
2. **New top-level `backpressure` block with its own `max_inflight`** (rejected) — a self-describing block with its own capacity.
   - Pros: self-contained; reads like the textbook admission-control config.
   - Cons: two copies of the same number drift. Part A3: "Two copies of the same number drift; C16 already guards the cap."

## Decision

Option 1. Backpressure lives at `parallelism.backpressure`; its capacity **is** `wave_concurrency_cap`, never a second copy. The reasons that decided it: a duplicated capacity would need its own validator check to stay equal to the cap, and the cap's existing C16 guard makes the sub-block the cheaper, drift-free shape.

## Consequences

`parallelism.backpressure` carries no `max_inflight`; capacity is `wave_concurrency_cap`. `validate-engineos.sh` C24a fails if a `max_inflight*` key appears.

The implementing task honours the Part A2.1 contract verbatim:

```json
"parallelism": {
  "backpressure": {
    "note": "Admission control for the orchestrator's dispatch loop. Capacity is wave_concurrency_cap above (never a second copy). Answered by scripts/kernel.sh admit; mirrored in rules/parallelism.md 'Backpressure'. defer = hold the unit for the next wave; reject = stop planning, report BLOCKED, re-plan with a human (a hitl reason).",
    "max_queued_units": 12,
    "overload_action": "defer",
    "actions": ["dispatch", "defer", "reject"]
  }
},
```

and the Part A2.2 subcommand signature:

| Subcommand | Input | Output |
|---|---|---|
| `admit --inflight N --queued M` | non-negative integers, both required | `{action: dispatch\|defer\|reject, capacity: int, reason: string}` |

All malformed input → `{"error": "..."}` on stdout, exit 1 (existing `err` convention).

Further obligations:

- `capacity` in the `admit` output is read from `parallelism.wave_concurrency_cap`; the kernel never hard-codes it.
- `rules/parallelism.md` gains a "Backpressure" section that mirrors the block; the implementing task adds a validator check for the prose/data pair (C24 in the plan), in the style of the existing C16–C19 pairs.
- `reject` is a human-in-the-loop trigger: it appears in `hitl.situations` (see `2026-09-03-hitl-as-kernel-entity.md`) and the orchestrator reports `BLOCKED` rather than re-planning alone.
- What becomes harder: any future change to the cap changes admission capacity at the same time. That is the intended coupling.

Revisit triggers: a runtime that needs an in-flight limit distinct from wave concurrency (for example a headless runner dispatching several waves concurrently), or evidence from exec-journal telemetry that the queue bound and the cap need to scale independently. Either would reopen the "second number" question with data instead of preference.
