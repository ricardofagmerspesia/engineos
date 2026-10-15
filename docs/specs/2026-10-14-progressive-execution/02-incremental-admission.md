# Incremental scheduler admission: second ready slice

Status: ADMIT-1 and ADMIT-2 implemented; final approved build and focused suites passed on 2026-10-14 (104 tests across both changes). Risk: medium. Autonomy: A2. Current work context and earlier dirty changes preserved.

## Outcome and scope

Begin implementation from the first approved, frozen task spec while later task specs are still being prepared. Admit each later approved delivery into the same run without rebuilding state or waiting for every spec. Emit accepted results immediately; whole-run completion and final checks wait for planning to seal and every implementation delivery to integrate.

This is ordinary development scheduling, not a new application-agent topology. The first streaming slice (`01-stream-outcomes.md`) can execute while this spec is prepared. Reading this spec or publishing a graph supplies no human approval. The submitted user choice was **Skip prototype; implement ready task specs**; the supervisor records its exact task scope and uses the actual current admission facts before dispatch.

## Frozen interfaces

1. Add optional `planningOpen?: boolean` to `SchedulerState` and the initial-state options. Absent means false; legacy states and closed-plan CLI results retain their existing shape. A new open plan requires at least one valid unit and sets true explicitly. False is sealed; this slice provides no reopen operation.
2. Export `appendUnits(state, {units, revision, timestampMs}, regs): SchedulerState` and `sealPlanning(state, {revision, timestampMs}, regs): SchedulerState` from new `src/scheduler/incremental.ts`. Reuse the scheduler's shared initialization/readiness logic through narrowly exported helpers rather than copying transition behavior. Metadata is bounded safe-integer input; revision must equal the current state revision, timestamp cannot move backwards. Each successful mutation increments revision once and uses the supplied timestamp. A stale request fails without changing input state.
3. Append is permitted only when `planningOpen === true`. Validate the entire combined graph atomically using existing unit limits (1–1000 total), metadata/path rules, unique IDs and DAG rules. New dependencies must reference existing or same-batch admitted units; future unknown IDs are invalid. Existing unit contracts, ordering, states, attempts, handles, reasons, evidence, run ID and capacity remain unchanged except readiness/dependency-derived blocking recomputation under existing rules. New units receive the normal initial fields and readiness. No replacement, removal, dependency edit or empty append.
4. Seal is permitted only for an open state. Set false and preserve all unit contracts/attempt state, including running and returned ownership. Seal is a planning boundary, not integration or validation. Reject repeat seal rather than incrementing a revision for a no-op. Failed/blocked/cancelled units remain unfinished.
5. `schedulerEvents(before, after, null)` emits `unit-planned` for newly appended IDs, then existing readiness transitions; do not repeat `run-started` or earlier planned events. No new workflow-event kinds are required. Define implementation completion as sealed planning AND every actual unit integrated. Emit `run-completed` only on the transition from incomplete to complete, including sealing an already integrated open frontier. An open frontier becoming fully integrated emits useful results, never terminal completion. The journal host still holds terminal completion until final obligations are recorded.
6. Preserve `schedulerScopeRevision`'s existing graph fingerprint algorithm. Append changes the graph and therefore invalidates old host production admission before any further launches. `launchReady` continues requiring exact current task and graph fingerprint plus existing design/preview decisions; it never derives consent from append, streaming, an agent outcome or the planning flag. Existing launched handles continue and integrate normally. The host obtains/records refreshed decisions when scope actually expands; the scheduler cannot fabricate them. Seal does not change graph scope and never grants check approval.
7. Add optional `completion.planningOpen?: boolean` to workflow-gate facts, with strict boolean parsing and absent=false compatibility. Validation admission requires this not true, in addition to every existing exact-ticket-set, source/scope, correction and final-consent condition. For incremental runs the authoritative host must supply the actual state flag and complete admitted implementation ID set. These facts remain conventional attestations, not authentication of human consent. Do not infer sealed state from a temporary all-integrated frontier.

## CLI integration after STREAM-1

Keep existing `plan`/`step` JSON and errors compatible and retain opt-in `--stream` transport from STREAM-1. Extend plan with standalone `--planning-open`; omission retains closed legacy behavior. Add:

```text
engineos scheduler append --state <json> --units <json> --revision <number> --time-ms <number> [--stream]
engineos scheduler seal --state <json> --revision <number> --time-ms <number> [--stream]
```

Require explicit revision/time for append and seal; reject duplicate/unknown flags and malformed JSON using existing bounds. Successful commands return the common state/actions/events/enforcement envelope or its STREAM-1 records. The CLI computes and streams accepted transitions; it does not launch host agents, run a background watcher or read/write state files. One supervisor remains the serialized state/journal owner.

## Ready tickets and implementation ownership

**ADMIT-1 — Incremental domain state and completion.** No dependency on STREAM-1 production code. Exclusive files: `src/workflow/contracts.ts`, `src/workflow/gates.ts`, `src/scheduler/state.ts`, `src/scheduler/validation.ts`, `src/scheduler/events.ts`, new `src/scheduler/incremental.ts`. Authoritative contract: this file, revision `incremental-admission-v1`. Deliver interfaces 1–7. Ordinary read-only integration evidence: `incremental-contract-inspected`, `incremental-scoped-diff-inspected`. Ready for the supervisor to dispatch as soon as this contract and scope admission are accepted, while streaming work continues.

**ADMIT-2 — Incremental CLI operations.** Blocked by integrated STREAM-1 and ADMIT-1 because CLI ownership and interfaces must be settled first. Exclusive file: `src/scheduler/cli.ts`; reuse `src/scheduler/output.ts` without changing its frozen transport interface. Contract revision `incremental-cli-v1`. Deliver the CLI section. Evidence: `incremental-cli-contract-inspected`, `incremental-cli-scoped-diff-inspected`. Do not take CLI ownership while STREAM-1 is running or returned but unintegrated.

The supervisor owns policy/skill/documentation alignment and change records outside these exclusive scopes. Test-writing and executable validation are a separate final-proof obligation outside the implementation graph, blocked by all implementation deliveries and corrections. Never use a test result as intermediate integration permission.

## Acceptance and final evidence plan

- ADMIT-01: An open plan with one accepted independent unit offers its launch immediately under existing capacity/ownership/admission rules; no later-spec count or whole-graph-ready barrier exists.
- ADMIT-02: Append a later independent unit while the first is running; preserve its handle/attempt and allow concurrent launch with refreshed exact-scope approval. Append a dependent unit and release it immediately when its predecessor integrates. Overlapping ownership continues to block launch.
- ADMIT-03: Duplicate IDs, unknown/future dependencies, same-batch cycles, invalid scopes/metadata, total count overflow, empty append, stale revisions, backward timestamps and append-after-seal all fail atomically. Inputs remain unchanged.
- ADMIT-04: Completing every currently admitted unit while planning is open emits useful results and leaves completion pending. Append after that temporary frontier completes remains possible. Seal that integrated frontier emits terminal completion once; seal with unfinished work waits for its last integration.
- ADMIT-05: Absent/false planningOpen preserves legacy state, readiness, JSON envelopes, fingerprint and terminal behavior. Malformed planning flags fail at boundaries; no new journal kinds or schema-version changes are introduced.
- ADMIT-06: A pre-append production approval fails for the expanded fingerprint; missing/stale preview/design facts still deny dispatch. Final validation with planningOpen=true fails even if the supplied current ticket list is integrated. Sealed completion still requires all actual admitted IDs, no corrections and fresh final scoped check consent.
- ADMIT-07: CLI append/seal expose ordered planned/readiness/completion outcomes through the already accepted NDJSON contract; default JSON remains compatible. A streamed useful result never claims final validation or release clearance.

Plan these regression cases now; author/run meaningful tests only at the final approved stage in existing scheduler/workflow suites. The supervisor inventories exact package scripts, deduplicates commands and requests fresh final approval after sealed planning and all implementation/correction integration. Required final security review/scan consent remains separate. No checks were executed to produce this spec.

## Decision and rollback

Chosen: additive open planning with immutable admitted contracts and explicit seal. Rejected: waiting for the complete graph, because it delays the first delivery; rebuilding an initial state on every spec, because it loses active handles/evidence; silently modifying accepted units, because it breaks exact-contract admission and evidence.

Rollback: revert these additive changes together and resume only legacy closed graphs. Preserve open-run snapshots/evidence for explicit host reconciliation before using an older reader, which rejects the new field rather than silently losing live ownership. No production deploy, Git write, database operation, dependency installation or autonomous human approval is included.

## Source evidence

Read on 2026-10-14: `src/scheduler/state.ts` (pure readiness/ownership transitions), `validation.ts` (strict state keys, graph validation and counts), `events.ts` (current last-integration completion), `launcher.ts` (whole-current-graph preview admission), `src/workflow/contracts.ts`, `src/workflow/gates.ts` (exact completion and graph fingerprint), `src/scheduler/cli.ts`, native `engineos-spec`/`engineos-implement-spec` skills and routed rules. Existing contracts are preserved unless explicitly extended above.
