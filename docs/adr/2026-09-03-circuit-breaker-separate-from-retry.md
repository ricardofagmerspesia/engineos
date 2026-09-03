# Keep the circuit breaker a separate `breaker` block, called before `retry`

Date: 2026-09-03
Status: accepted

Source: `docs/specs/2026-09-03-engineos-default-methodology-plan.md` Part A1 row 2, Part A2.1, Part A2.2, Part A3 row "Breaker vs. retry".

## Context

Part A1 finding 2 — "Circuit breaker absent" — verdict **true**:

> `circuit`, `breaker`, `half-open`, `cooldown` = 0 hits in `registries/`, `scripts/`, `rules/`. `policy.retry` and `policy.repair` are per-unit / per-check retry ladders, not per-resource breakers. Already listed as an unadopted control in `docs/specs/2026-08-02-ai-methodology-integration-analysis.md:331`.

`policy.json:145` `retry` answers "try this unit again?" with an attempt ladder (`max_attempts_per_unit: 2`, `escalations: 1`, `by_situation[]`, `never_retry[]`). `policy.json:177` `repair` is the same discipline for validation checks. Neither has a notion of a *resource* (a provider, an MCP server, a tool, an agent) that keeps failing across many units, nor of a state that persists between calls. A breaker needs both: a failure counter per resource and a cooldown that opens and half-opens.

## Options considered

1. **Separate `breaker` block plus `kernel.sh breaker` subcommand; the orchestrator calls `breaker` before `retry`** (chosen).
   - Pros: different key (resource vs. unit) and different state (counter + cooldown vs. attempt) each get their own home; `retry` stays a stateless lookup; the kernel stays stateless because the orchestrator passes the breaker state in.
   - Cons: a third failure-policy block beside `retry` and `repair`; the orchestrator must make two kernel calls per failure and must itself keep per-resource state in the exec journal. More surface to keep mirrored in prose.
2. **Extend `retry.by_situation` with a `resource-open` situation** (rejected).
   - Pros: one block, one subcommand, one prose section.
   - Cons: Part A3: "Different key (resource vs. unit), different state (counter + cooldown vs. attempt). Merging would make `retry` stateful." A `resource-open` row cannot express thresholds, cooldowns or half-open probing without turning the retry ladder into a state machine.

## Decision

Option 1. The breaker is its own policy block and its own subcommand, and the orchestrator consults it **before** the retry ladder: a unit is not retried against a resource whose breaker is open. What decided it is the key mismatch — retry indexes by unit, the breaker indexes by resource — and the refusal to make `retry` stateful.

## Consequences

The implementing task honours the Part A2.1 contract verbatim:

```json
"breaker": {
  "note": "Per-resource circuit breaker (provider, MCP server, tool, agent) — the counterpart to retry, which is per-unit. retry asks 'try this unit again?'; breaker asks 'why are we still calling this resource?'. Answered by scripts/kernel.sh breaker; the orchestrator keeps the per-resource state and failure count in the exec journal (span_kind=tool|model, status=FAILED) and passes them in. Mirrored in rules/parallelism.md 'Circuit breaker'.",
  "scopes": ["provider", "mcp", "tool", "agent"],
  "failure_threshold": 3,
  "cooldown_waves": 1,
  "half_open_probes": 1,
  "states": ["closed", "open", "half-open"]
},
```

and the Part A2.2 subcommand signatures:

| Subcommand | Input | Output |
|---|---|---|
| `breaker --state closed --failures N` | | `{state, allow: bool, reason}` |
| `breaker --state open --cooldown-elapsed true\|false` | | same |
| `breaker --state half-open --probe-result ok\|failed` | | same |

All malformed input → `{"error": "..."}` on stdout, exit 1 (existing `err` convention).

Further obligations:

- Ordering is part of the contract: the orchestrator calls `breaker` first; only `allow: true` reaches `retry`.
- The kernel holds no breaker state. State and failure count live in the exec journal as `span_kind=tool|model`, `status=FAILED` entries (see `2026-09-03-spans-extend-exec-journal.md`) and are passed in on each call.
- `breaker-open` is both a `hitl` reason and a `hitl` situation (see `2026-09-03-hitl-as-kernel-entity.md`): an open breaker that does not recover after its half-open probe is reported to a human, not retried around.
- `rules/parallelism.md` gains a "Circuit breaker" section mirroring the block, checked as a prose/data pair like C16–C19.
- What becomes harder: three failure-policy blocks must stay conceptually distinct in prose; the `note` fields carry that burden and the validator carries the numeric mirrors.

Revisit triggers: a runtime that supplies provider-level breakers natively (then the kernel block becomes a mirror of the runtime's config), or a need for breaker state the orchestrator cannot carry in the journal (which would force the kernel to become stateful and reopen option 2's core objection from the other side).
