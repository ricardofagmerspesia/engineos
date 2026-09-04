# Extend `exec-journal.sh` with optional span fields instead of adding a second journal

Date: 2026-09-03
Status: accepted

Source: `docs/specs/2026-09-03-engineos-default-methodology-plan.md` Part A1 row 4, Part A2.1, Part A2.3, Part A3 rows "Spans", "Trace id", "Cost field".

This record also carries the two subordinate decisions the plan lists separately in Part A3 (trace-id source and cost-field type). They have no meaning outside the span schema, so they are recorded here rather than as free-standing ADRs.

## Context

Part A1 finding 4 — "No agent observability" — verdict **largely false as stated**:

> `scripts/exec-journal.sh` already defines `run_id, capability_id, agent, model_tier, status, tokens_in, tokens_out, duration_ms`. `scripts/telemetry.sh` already enforces no-prompt-text structurally (`value_pattern`). Missing: `trace_id`/span correlation, `cost`/`cache_hit`/`retry_attempt`, span kinds, and **a writer** (exec-journal is "a schema contract, not a running service"). Also found: `policy.json telemetry.events[].written_by` names 2 hooks but 4 write (`hooks/route-advisor.sh:43`, `hooks/gate-advisor.sh:45` unlisted); C22c checks one direction only.

`scripts/exec-journal.sh:4` states the current posture — "This is a schema contract, not a running service" — and its header (lines 12–21) defines the eight fields above with a validator. What is missing is correlation (which spans belong to one trace, which span is the parent), per-call economics, a kind taxonomy, and any process that actually appends entries. The repo's prior P7 telemetry spec already warned that two overlapping journals drift.

## Options considered

1. **Extend `exec-journal.sh` with optional fields (schema v2, additive); the hooks become the first writer** (chosen).
   - Pros: eight of the needed fields and a validator already exist; one schema, one home directory, one `value_pattern`, one retention policy; the four announce/prompt-advisor/stop-verify hooks already run at exactly the span boundaries (`agent`, `router`, `verification`).
   - Cons: the schema grows from 8 to 20 fields and every existing caller must tolerate optional fields; the free-text `note` field survives into a journal that now carries provider and model names, which is why it is flagged for the Task 10 security review; the hooks acquire a write responsibility they did not have.
2. **New `scripts/spans.sh` with its own JSONL** (rejected).
   - Pros: a clean, purpose-built schema; exec-journal untouched.
   - Cons: Part A3: "exec-journal already has 8 of the fields and a validator; two journals with overlapping fields is the drift the P7 spec warned about."

Subordinate choices, same option shape:

- **Trace id.** Chosen: `trace_id = session_id`, `span_id = tool_use_id`. Rejected: generate UUIDs in hooks — "Hooks receive both ids for free; generated ids cannot be joined to the kernel-decision events keyed by session."
- **Cost field.** Chosen: `cost_micros` integer. Rejected: `cost_usd` float — "JSONL floats round-trip badly through jq; integer micro-units are the standard fix."

## Decision

Option 1. Spans are exec-journal entries with additional optional fields; the hooks write them; trace and span ids are the Claude session id and `tool_use_id`; cost is an integer in micro-USD. The deciding reason is drift avoidance: the repo already owns a validated schema for most of what is needed, and a second journal would have to be kept equal to it by hand.

## Consequences

The implementing task honours the Part A2.3 schema v2 contract verbatim (additive, all optional):

| Field | Type | Constraint |
|---|---|---|
| `trace_id` | string | `value_pattern`; hooks use the Claude session id |
| `span_id` | string | `value_pattern`; hooks use `tool_use_id` |
| `parent_span_id` | string or null | `value_pattern` |
| `span_kind` | enum | `router\|coordinator\|agent\|tool\|model\|verification` |
| `tool` | string or null | `value_pattern` |
| `provider` | string or null | `value_pattern` |
| `model` | string or null | `value_pattern` |
| `cost_micros` | non-negative integer or null | micro-USD; integer so no float drift; null = unknown |
| `retry_attempt` | non-negative integer or null | |
| `cache_hit` | boolean or null | |
| `route` | string or null | intent id, `value_pattern` |
| `risk` | enum or null | `low\|medium\|high` |

`note` keeps its current free-text contract (changing it is a deprecation, out of scope) — flagged for the security review in Task 10.

and the Part A2.1 `telemetry.exec_journal` policy block verbatim:

```json
"telemetry": {
  "exec_journal": {
    "note": "Span-level run accounting (scripts/exec-journal.sh), distinct from the kernel-decision events above. Written by the agent-dispatch/return hooks (span_kind=agent), prompt-advisor (router) and stop-verify (verification); tool and model spans are the headless runner's to write. Same home dir, same value_pattern, same retention.",
    "home": ".git/engineos-telemetry/<session_id>.exec.jsonl",
    "span_kinds": ["router", "coordinator", "agent", "tool", "model", "verification"],
    "written_by": ["hooks/announce-agent-dispatch.sh", "hooks/announce-agent-return.sh", "hooks/prompt-advisor.sh", "hooks/stop-verify.sh"]
  }
}
```

Further obligations:

- Existing v1 entries stay valid: every new field is optional and the validator accepts their absence. Existing callers of `exec-journal.sh` need no change.
- `telemetry.events[].written_by` becomes an **array** on every event, and the validator checks both directions (every listed hook writes; every writing hook is listed) — closing the C22c **directionality** gap, and that gap only.
  **Correction (recorded in place, 2026-09-03):** this obligation originally read "… and the two unlisted writers at `hooks/route-advisor.sh:43` and `hooks/gate-advisor.sh:45`", re-asserting in the ADR's own voice the second half of the Part A1 row 4 blockquote above. That half is false. Neither file exists at HEAD or on `origin/main`: pre-epic commit `aba76e2` ("refactor(hooks): one prompt adapter, installers derive from hooks.json") consolidated the prompt-time writers into `hooks/prompt-advisor.sh` before this epic began, so the baseline row was read from a stale tree and there was never a set of four writers to list. No unlisted writer was found or fixed. The blockquote at the top of Context is left as written — it is a quote of what the review said — and this is the correction to it.
  What shipped is correct: `route`, `decision-rules` and `hitl` each name `["hooks/prompt-advisor.sh"]`, and `verify` names `["hooks/stop-verify.sh"]`. Adding either deleted path to those arrays would fail C22c with `does-not-call-telemetry.sh`.
- Hooks write only the span kinds the block assigns them (`agent`, `router`, `verification`); `tool` and `model` spans are the headless runner's, and the breaker (see `2026-09-03-circuit-breaker-separate-from-retry.md`) reads its failure counts from those.
- The `value_pattern` no-prompt-text invariant applies to every new string field; `provider`, `model`, `tool` and `route` are ids, never free text.
- `cost_micros` is never a float; consumers that want USD divide at display time.
- What becomes harder: the schema is wider and the hooks are now writers with failure modes of their own (a missing `jq`, an unwritable `.git`), which must degrade silently the way the existing telemetry writers do.

Revisit triggers: an OpenTelemetry export requirement (map these fields onto OTel span attributes; do not fork the journal), or span volume from a headless runner that JSONL append cannot sustain (then the home changes, not the schema).
