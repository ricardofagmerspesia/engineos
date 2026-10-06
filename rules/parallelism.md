# Parallel Execution Rules — always on

Every project code, configuration, design or documentation change, including small
edits and follow-ups, routes through one top-level supervisor before dispatch or
writes. Use deterministic kernel routing first; the read-only router planner
handles unresolved residue. Parallel is default; serialization needs a dependency
or ownership reason.

## Decompose-and-distribute — the default

1. Create named tasks before implementation (TaskCreate or the plan).
2. Assign every ready implementation unit to a routed worker: one worker for an
   indivisible edit; concurrent workers for independent units within capacity.
3. Keep one supervisor for contracts, dispatch, integration and final verification,
   with flat workers. Retain risk-required independent/security reviews, without
   routine nested supervisors or repeated reviewer/test chains.

Past **>3 files**, more than one domain, or 3 independent tasks, distribution is
mandatory under `registries/policy.json`; smaller changes still follow this default.
Pure explanations need no implementation units. Clarify vague goals before dispatch;
advance serial dependencies one routed unit at a time. Never manufacture redundant
units or split indivisible work to fill slots.

## Procedure

1. **Route and own.** Resolve role, rules, skills and patterns per unit; assign
   disjoint exclusive paths. One owner handles shared wiring, lockfiles and
   generated outputs. Record branch/current PR (unknown if absent) in the plan,
   every brief and handoff; preserve them until user direction (`rules/git.md`).
2. **Freeze contracts.** ONE design-tier owner (`rules/models.md`) records shared
   types, API/DB schemas, event payloads and public surfaces with authoritative
   paths and revisions before consumer fan-out. Independent preparation may proceed.
3. **Schedule ready units.** Required contracts must be frozen and prerequisites
   `integrated`. Dispatch ready units together, mark `running`; on return update
   the ledger, refill already-ready slots, integrate, then release dependents.
   Unrelated units have no whole-wave barrier.
4. **Fill useful capacity.** Use min(policy cap, available host worker slots),
   reserving the supervisor slot; the policy cap of 6 is an upper bound. Multiple
   independent units may share a domain. Queue overflow work, refill promptly,
   and record limits from dependencies, collisions, admission, resources, budget
   or absence of useful tasks. Never busy-poll or create duplicate work.
5. **Brief workers.** Include MODE, role, exclusive files, contracts/revisions,
   prerequisites, risk/autonomy, model, branch/PR, rules/skills/patterns and return
   envelope. Workers return scope changes/new subtasks for supervisor rerouting.
   Exclude intermediate validation and test work; only an explicitly approved
   final-stage brief includes tests (`rules/verification.md`).
6. **Integrate continuously.** `returned` is not `integrated`: inspect scoped diffs
   and revisions read-only, reconcile shared wiring through its owner, then mark
   integrated. Use focused handoffs at boundaries. Run one final non-test gate
   after integration; tests are a separate final action with current-task approval.

## Task ledger and contract drift

Update this plan/task ledger on dispatch, return, integration and blocking:

| Task id | Exclusive paths | Prerequisite ids | Contract path@revision | Owner | State |
|---|---|---|---|---|---|
| `<id>` | `<files/globs>` | `<ids or none>` | `<contracts or none>` | `<agent>` | `planned` |

Scheduling states (not envelope statuses): `planned` → `ready` → `running` →
`returned` → `integrated`; `blocked` for missing input/prerequisite or contract
drift, `failed` for unsuccessful implementation. Record reasons and apply failure
policy. Resume as `ready` only when step 3 holds again.

Contract changes go to the single owner. Pause affected consumers/descendants,
including running writers; record the delta while unrelated work continues. The
owner publishes the revised frozen contract. Rebrief affected units and reconcile
stale work before integration/resumption. Only that owner updates shared wiring
and generated outputs.

## Hard rules

- Exclusive write scopes; serialize collisions, including artifacts/lockfiles.
- **Subagents cannot spawn subagents.** Only the supervisor fans out, one level deep.
- Every project change is supervisor-routed, including mechanical follow-ups.
- Workers make no git/forge writes or builds/tests during implementation. The
  supervisor handles integration and user-directed git/PR actions under `rules/git.md`;
  parallel tasks retain the same PR by default.
- Fill all useful ready capacity; reserve supervisor capacity and refill on returns.
- Announce before dispatch:
  `[fanout] waves=<n> wave1=<agent:scope, agent:scope> model=<per-agent>`
- Report incomplete units explicitly: envelope `BLOCKED`/`FAILED` cannot disappear
  inside a green summary.

## Backpressure

Before every dispatch ask:

`scripts/kernel.sh admit --inflight <running agents> --queued <units waiting>`

| Answer | Meaning |
|---|---|
| `dispatch` | Capacity remains under the effective cap — go |
| `defer` | Cap reached, queue below `max_queued_units` (12) — wait for a slot |
| `reject` | Cap and `max_queued_units` reached — stop planning, report `BLOCKED`, re-plan with a human |

`reject` is HITL `budget-exhausted`, never a retry. Capacity is min(policy cap,
available host worker slots); bounds live in `registries/policy.json`
`parallelism.backpressure`.

## Failure policy

| Situation | Response |
|---|---|
| Transient timeout/rate limit/tool failure | Retry once, same model |
| Repeated failure or substantive `FAILED` | Escalate one tier per `rules/models.md`, retry once; last retry |
| Failure at escalated tier | Stop; report incomplete unit and attempts |
| `BLOCKED` | Supply missing input or drop unit; never retry blindly |
| `DEGRADED` | Accept with caveat in barrier report; never relabel OK |

Never retry security risk, possible data loss, unclear irreversible-action gates,
or unresolved ambiguity: escalate to the human immediately. Failed units block
only their dependents; continue unrelated ready work with the gap explicit.
**Two attempts per unit, one escalation**, then a human; never sample until success.

## Circuit breaker

Consult before retrying. A resource breaker scopes over `provider`, `mcp`, `tool`
and `agent`; these are supervisor keys declared in `registries/policy.json`
`breaker.scopes`, not kernel-enforced resource identities.

`scripts/kernel.sh breaker --state closed --failures <consecutive failures on this resource>`

| State | Rule |
|---|---|
| `closed` | Calls allowed; `failure_threshold` (3) consecutive failures opens it |
| `open` | Block calls for `cooldown_waves` (1); route around or report `DEGRADED` |
| `half-open` | After cooldown allow `half_open_probes` (1); success closes, failure reopens |

Failure counts come from the exec journal (`rules/observability.md` "Agent traces"):
`span_kind` tool/model, `status: FAILED`, same tool/provider. Respect its status-floor
caveat. A required open resource blocks its unit; no alternative triggers HITL
`breaker-open`.

## Choosing the fan-out mechanism

| Situation | Use |
|---|---|
| Known multi-domain change | `/engineos:implement <domain> <task>` |
| Multi-domain read-only analysis | `/engineos:audit <domain>` |
| Independent same-domain units | N Task calls in one message, same coordinator, disjoint scopes |
| Existing plan, independent tasks | `superpowers:subagent-driven-development` |
| Generic 2+ independent tasks | `superpowers:dispatching-parallel-agents` |
