# Scheduler outcome streaming: first ready slice

Status: implemented and final proof passed on 2026-10-14. STREAM-1 started before later specs finished; approved build and focused suites passed (104 tests across both changes).
Scope revision: progressive-execution-v1.
Risk: medium. Autonomy: A2. Branch/current PR: unknown; preserve current context and dirty edits.

## Outcome

The user requests incremental outcomes and implementation beginning as soon as its first task spec is ready. This independently deliverable slice adds opt-in NDJSON output to existing scheduler commands. It can begin while the later incremental graph-admission/sealing spec is authored, once this slice's actual scope/design/preview admission is satisfied. It does not require a complete later task graph or change runtime dispatch approval.

## Frozen first-slice contract

Exclusive production scope: `src/scheduler/cli.ts` and new `src/scheduler/output.ts`. Existing `scheduler plan` and `scheduler step` calls retain their current JSON result, errors, exit codes and actions. An optional standalone `--stream` flag selects NDJSON. Support its position among existing argument pairs; reject duplicate/missing/unknown options without changing normal command behavior.

For a successful operation, emit one newline-terminated compact record per scheduler event, in existing event order, then one final snapshot record:

```json
{"type":"event","event":{"version":1,"runId":"example","sequence":0,"timestampMs":0,"kind":"run-started"}}
{"type":"snapshot","state":{},"actions":[],"enforcement":"conventional"}
```

The snapshot example abbreviates actual valid state; production emits the complete accepted state and actions. Event payloads retain the current `WorkflowEvent` schema and batch-local sequences. Distinct transport `type` tags distinguish events from snapshots; stream consumers extract event payloads and assign persistent global sequences before calling the existing journal API. Stream output is not directly a workflow journal. In stream mode invalid input emits `{"type":"error","error":"<existing message>"}` and the existing nonzero exit code, with no successful event/snapshot records. Without `--stream`, error JSON and exit code remain unchanged.

Emit accepted outcomes through `io.out` as individual lines when the scheduler operation has produced them. This CLI computes one transition per invocation and launches no host workers; streaming is incremental delivery of that invocation's outcomes, not an autonomous long-running agent loop. Do not add callback/lifecycle/persistence machinery to this slice.

## Acceptance and ticket

**STREAM-1:** implement this atomic CLI transport with a small output helper. Preserve old output byte-for-byte when `--stream` is absent; opt-in plan/step output contains ordered event records followed by one snapshot; snapshot fields match the legacy result; errors stay truthful. Read-only integration evidence checks arguments, output branches and unchanged state/gate/launcher calls. No executable checks or test authoring occur during implementation.

Final proof is separate and waits for all implementation deliveries/corrections in the full user scope, closed planning and fresh exact-command consent. Plan coverage for default output compatibility, opt-in plan/step records, snapshot/event distinction, duplicate stream flag and malformed arguments. The supervisor chooses exact existing check commands and test-file ownership at final consent; no tests, build or Git writes are authorized here.

## Later slice boundary

Later independently specified work adds bounded append-only DAG expansion and explicit planning sealing. Keep existing units immutable, reject duplicate IDs/cycles/unknown dependencies, preserve active ownership/handles and revisions, and require refreshed host admission for the expanded fingerprint before new launches. An optional `planningOpen` value defaults false for legacy states; global completion/final proof must wait for sealed planning plus all actual implementation units integrated. Those changes are outside STREAM-1 ownership.

Guidance must hand off each accepted frozen task frontier as it becomes ready, reserving unassigned/later file scopes so drafting and implementation remain disjoint. Task-scoped approval never covers changed shared contracts, hidden blockers or later expanded scope. Final verification remains global after all scope is specified, integrated and explicitly approved for checks.

## Decision and recovery

Choose opt-in CLI transport because current code already exposes accepted event batches through `schedulerEvents`; a separate launcher observer does not help this first CLI slice and increases uncertainty handling. Reject changing default stdout or weakening full-graph approval. Roll back only this task's identified output/parser patch hunks, preserving existing dirty work; no release or Git writes.

## Read-only evidence, 2026-10-14

- `src/scheduler/cli.ts:12` accepts only plan/step; lines 30 and 37 write a single JSON object containing state/actions/events.
- `src/io.ts:24` writes stdout; line 56 serializes legacy JSON.
- `src/scheduler/events.ts:5` returns batch-local event arrays; line 22 already emits accepted useful results.
- `src/scheduler/launcher.ts:22` binds admission to the whole current fingerprint; line 37 awaits host launch and returns its accepted handle.
- `src/workflow/gates.ts:133` fingerprints all graph units; lines 123–129 require exact global integrated completion and final consent.
- `src/journal/workflow.ts:55` strictly parses workflow event keys and line 93 rejects events after terminal completion.
- `skills/engineos-spec/SKILL.md:63` currently waits for the whole approved breakdown; lines 85–92 require complete DAG before handoff.

No executable validation performed.
