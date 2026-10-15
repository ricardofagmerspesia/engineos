# Parallel Execution Rules — always on

Every project code, configuration, design or documentation change, including small
edits and follow-ups, routes through one top-level supervisor before dispatch or
writes. Use deterministic kernel routing first; the read-only router planner
handles unresolved residue. Eligible direct execution below needs no worker dispatch.
Otherwise parallel is default; serialization needs a dependency
or ownership reason.

## Decompose-and-distribute — the default

1. Create named tasks before implementation (TaskCreate or the plan).
2. Assign every ready implementation unit to a routed worker, except eligible
   direct execution: one worker for an
   indivisible edit; concurrent workers for independent units within capacity.
3. Keep one supervisor for contracts, dispatch, integration and final verification,
   with flat workers. Retain risk-required independent/security reviews, without
   routine nested supervisors or repeated reviewer/test chains.

Past **>3 files**, more than one domain, or 3 independent tasks, distribution is
mandatory under `registries/policy.json`; smaller changes still follow this default.
Pure explanations need no implementation units. Clarify vague goals before dispatch;
advance serial dependencies one routed unit at a time. Never manufacture redundant
units or split indivisible work to fill slots.

## Task budget and direct execution

Classify complexity independently of risk. Reference budgets in
`registries/policy.json` `workflow.task_budgets` are small: 1–3 tasks, medium:
3–6, large: 5–10. These are guidance, not quotas or minimum task counts. A task
represents an independent deliverable, review boundary or dependency; never create
one per file, endpoint, test or minor edit. Consolidate atomic work and justify
exceeding the reference maximum with real independent deliverables/dependencies.
Before plan acceptance ask: "Can we deliver the same result with fewer tasks?"

Direct execution is permitted only with complete, explicit execution facts:
small complexity, classified low risk, reversible work with no required design
gate, at most 2 changed files
(`workflow.direct_max_files`), one domain and one indivisible implementation unit,
no security-sensitive scope and no required independent reviewer. A routed domain
agent identifies guidance/ownership; its ordinary presence alone does not require
delegation in this mode. The main executor routes, implements, integrates and
performs targeted validation under `rules/verification.md`, preserving the change
record, consent and Git policy. Missing/unresolved facts retain delegated defaults.
Escalate before expanding scope if any eligibility condition ceases to hold;
never bypass spec, security or high-risk gates because a change is small.

## Simple-task planning choice

Resolve complete execution facts before creating a spec. Eligible means small,
low risk, reversible, at most 2 files, one domain and one indivisible unit, with
no security-sensitive scope, independent reviewer or independent design gate.
Small new behavior alone does not disqualify the lane. Unknown facts never qualify.
Ask one permitted clickable question: **Implement directly** / **Create a lightweight
spec**. Record `scopeRevision`, `specChoice` and `specChoiceScopeRevision` from the
actual reply; stale or missing choice remains unresolved.

**Direct:** main executor uses only relevant stack guidance beyond security/Git
safeguards. No mandatory prototype, PRD, ADR, scaffolding or tickets. An explicitly
requested preview remains available. **Spec:** prepare the selected lightweight
spec, or the full design artifacts when independent obligations require them.
Every accepted spec uses Matt Pocock's dependency-aware tracer-bullet tickets through
native engineos-spec; preserve approved granularity. Launch all genuinely independent
ready tickets within host capacity, with one supervisor and flat workers.

Keep final executable-check obligations outside implementation-integration evidence:
`requiredChecks` is read-only scoped diff/contract evidence. The final-proof ticket
waits for ALL implementation tickets and fresh final consent; it is not itself an
implementation-completion prerequisite. Scope growth reopens eligibility and choice.

## Procedure

For selected-spec production and resumes, complete **Prototype preview choice**
below before writes or worker dispatch. Eligible scope-bound simple direct work
uses its planning choice instead; no mandatory prototype prompt applies. Read-only
scoping and design may proceed meanwhile.

1. **Route and own.** Resolve role, rules, skills and patterns per unit; assign
   disjoint exclusive paths. One owner handles shared wiring, lockfiles and
   generated outputs. Record branch/current PR (unknown if absent) in the plan,
   every brief and handoff; preserve them until user direction (`rules/git.md`).
2. **Freeze contracts.** ONE design-tier owner (`rules/models.md`) records shared
   types, API/DB schemas, event payloads and public surfaces with authoritative
   paths and revisions before consumer fan-out. Independent preparation may proceed.
3. **Schedule ready units.** Required contracts must be frozen and prerequisites
   `integrated`. Start the first accepted bounded task as soon as its scope-bound
   design/planning/preview admission holds; later ticket prose may be drafted in
   reserved disjoint paths while implementation runs. Before first launch record
   shared contracts, known dependencies and exclusive reservations for later work.
   Unknown dependencies or unresolved contracts block affected tasks until resolved.
   Dispatch ready units together, mark `running`; on return update
   the ledger, refill already-ready slots, integrate, then release dependents.
   Unrelated units have no whole-wave barrier.
4. **Fill useful capacity.** Use min(policy cap, available host worker slots),
   reserving the supervisor slot; the policy cap of 3 is an upper bound. Multiple
   independent units may share a domain. Queue overflow work, refill promptly,
   and record limits from dependencies, collisions, admission, resources, budget
   or absence of useful tasks. Never busy-poll or create duplicate work.
5. **Brief workers.** Include MODE, role, exclusive files, contracts/revisions,
   prerequisites, risk/autonomy, model, branch/PR, rules/skills/patterns and return
   envelope. Workers return scope changes/new subtasks for supervisor rerouting.
   Validation/test work needs its own scoped brief under `rules/verification.md`;
   implementation briefs do not implicitly authorize intermediate checks.
6. **Integrate continuously.** `returned` is not `integrated`: inspect scoped diffs
   and revisions read-only, reconcile shared wiring through its owner, then mark
   integrated. Use focused handoffs at boundaries. Stable component revisions may
   enter ordinary read-only integration inspection while unrelated work continues.
   Queue security-reviewer and security scans for final integrated consent under
   rules/verification.md. Executable checks wait
   for final integration and explicit current-task approval under rules/verification.md.
   If the host cannot launch workers, scheduling answers are advisory readiness,
   not claims that agents or checks ran.

## Incremental planning

Publish each accepted frozen ticket frontier immediately; a complete later ticket
list is not a launch prerequisite. Preserve granularity review and user decisions
for each available frontier, reusing unchanged scope-bound answers. Reserve later
write scopes before concurrent drafting/implementation; one supervisor owns the
graph, state and journal. Draft tickets stay outside the runtime graph.

Initialize an incremental run with `scheduler plan --planning-open`; append accepted
units through `scheduler append` with the current revision and timestamp. Existing
admitted units retain their contracts and ownership; new dependencies reference
existing or same-batch units. Expansion changes the graph fingerprint: refresh
kernel resolution and exact-scope workflow admission before further launches.
Applicable decisions reopen when scope changes; appending never grants consent.
Required shared-contract changes follow **Task ledger and contract drift** below.

Seal planning through `scheduler seal` only when all approved delivery specs are
admitted and no further planning remains. Temporary exhaustion of ready work or an
all-integrated open frontier leaves whole-run completion pending. Final checks and
security review/scan consent wait for sealed planning, every actual approved
delivery integrated and all corrections resolved under `rules/verification.md`.
Closed-plan callers retain the existing whole-graph path.

## Prototype preview choice

The host records actual user decisions. `engineos kernel workflow-gate --facts`
evaluates scoped facts; `launchReady` requires matching preview admission before
launcher calls. Direct executors must apply the same evaluator. CLI facts are
conventional attestations, not human authentication or universal tool interception.
For selected-spec implementation, ask once per scope: "Would you like a throwaway prototype to
preview how this will work or look before implementation?" Record the question,
scope and answer in the change record's `## Human decisions`.

- **No:** record `preview-declined` for that scope and proceed through existing
  gates. A missing answer pauses production writes and implementation dispatch;
  silence, timeouts, general implementation permission and worker returns are
  not a preview decision.
- **Yes:** resolve `engineos kernel skill-reference --id upstream-prototype`, then read
  and invoke its available actual path `.agents/skills/prototype/SKILL.md`.
  Choose its LOGIC branch for behavior/state questions or UI branch for appearance.
  Clarify an ambiguous preview question before building. Produce its runnable,
  clearly marked throwaway artifact, show its exact path and revision, and ask
  for explicit approval of that preview and implementation scope. Record
  `preview-approved` with scope, artifact path, revision and the approval.
  Permission to create the preview does not authorize production implementation.
- **Unavailable:** if the chosen prototype skill is missing, report preview
  BLOCKED and request its location. Preserve production-write blocking; install
  nothing and never fabricate a preview or silently substitute another skill.

Only throwaway prototype creation is excepted from the production-write pause.
Keep it free of production persistence and preserve test/Git consent: the skill's
capture-to-branch step still needs `rules/git.md` authorization. Record a local
artifact pointer when Git capture is not authorized. Promote only the approved
decision into production, never the throwaway implementation wholesale.
On unchanged-scope resume reuse a recorded decline or revision-bound approval.
Material scope/behavior changes reopen the choice and invalidate affected preview
approval; a changed preview revision needs fresh approval before production work.

## Completion follow-up

After delivering the task and applicable validation evidence, separately from
the existing output-artifact offer, ask once per original task whether the
developer wants Matt Pocock's `/retro` for this completed session. A retro performed from this offer
does not trigger another retro offer. First resolve
`engineos kernel skill-reference --id upstream-session-retro`; its actual path is
`.agents/skills/retro/SKILL.md`. The native recurring-evidence alternative is
`engineos kernel skill-reference --id engineos-recurring-retro`, actual path
`skills/retro/SKILL.md`, command `/engineos:retro`. State origin, purpose and
availability before invocation; bare `/retro` discovery must not choose silently. If available, invoke that exact skill only after
an explicit yes; its human-invoked status is satisfied by that answer. Present
its evidence-backed recommendations without automatic implementation, commits
or promotion. No, silence or a missing response leaves delivery complete.
Record the offer and any explicit answer with the original task scope; preserve
that same-task state on resume instead of offering again.
If unavailable, report the missing prerequisite and offer native EngineOS `retro`
only as an explicit alternative; never substitute it silently. This optional
follow-up is independent of prototype approval and grants no test/Git consent.

## Flowcharts and diagrams — Archify first

For requested flows, flowcharts and architecture, workflow, sequence, data-flow
or state diagrams, use the `archify` skill when available. This includes diagrams
selected through the Output artifact offer. Locate it in the host's available
skill catalog, read its actual `SKILL.md` and follow its authoring and delivery
requirements, subject to existing approval and verification rules.

When Archify is absent or unavailable, state that limitation and use a traditional
Mermaid diagram (`flowchart`, `sequenceDiagram` or `stateDiagram-v2`, as appropriate).
Install nothing automatically. If an available Archify invocation fails, report
the failure honestly; it is not evidence that the skill is absent or that a
diagram passed validation. Keep numeric charts and dashboards with their existing
tools rather than routing them to Archify.

## Separate user decisions

Ask one question per decision, in sequential calls: preview choice, approval of
the actual selected preview, final security-review/scan consent, unrelated
final-validation approval, session-retro opt-in and
artifact selection. Wait for each required answer; do not combine offers or infer
approval from an ambiguous “yes”. Preserve scoped answers on resume. Optional
retro/artifact offers do not authorize implementation, checks or Git writes.

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
- Workers make no git/forge writes; builds/tests require a separate approved
  final validation brief with explicit current-task consent against fully integrated input (`rules/verification.md`). The
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
