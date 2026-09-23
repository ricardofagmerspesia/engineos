# EngineOS 2.0 fast core — design

Date: 2026-09-22
Status: approved by the owner in chat on 2026-09-22
Risk: high — this intentionally changes published rule, adapter, runtime-entry,
agent-dispatch and task-contract behavior. The work is reversible in git, but
existing consumers require a migration path. Autonomy ceiling A3; no package,
release, merge or consumer migration occurs without the release gate and recorded
human approval.

## Problem

EngineOS resolves policy quickly, but the autonomous delivery loop pays more for
context, process startup and orchestration than it needs to:

| Problem | Current evidence |
|---|---|
| Codex context is eager | `AGENTS.md` plus eleven imports is 60,515 bytes / 9,393 words; Claude's benchmarked always-on corpus is 28,019 bytes |
| Narrow work delegates | `rules/subagents.md` requires a dispatch for one routed unit and `rules/parallelism.md` distributes every substantive task beyond a single small edit |
| Capacity is advisory | `admit` and `waves` calculate answers, but no runtime component owns a queue or launches agents |
| Hook startup is broad | every hook starts Node through the 394 KB bundle whose entry point imports all command families |
| Hook discovery repeats | edit and agent hook pairs repeat Git, bypass, project-rule and change-record discovery |
| Routing work duplicates | `/engineos:route` resolves once, then its router agent resolves again; `/engineos:audit all` dispatches seven design-tier agents before scope discovery |
| Model tiers collapse | build and design both bind to `opus`; routine implementation gets no latency/cost distinction and build-to-design escalation is a no-op |
| Benchmarks miss the lifecycle | current budgets omit cache misses, edit pairs, agent pairs, queue delay, model time, integration and verification |

The goal is not to make policy weaker. The goal is to spend strong-model,
multi-agent and gate latency only where the risk and work shape justify it.

## Goals

1. Make one compact task contract the control-plane interface for every adapter.
2. Execute low-risk narrow work directly while preserving mandatory delegation
   for security-sensitive, high-risk, multi-domain and genuinely parallel work.
3. Make admission, wave, retry and breaker state operational through a scheduler
   whose launch boundary is supplied by the host adapter.
4. Reduce hot-hook startup and repeated repository discovery.
5. Remove deterministic routing work from model calls.
6. Give build and mechanical work distinct, evaluated model bindings.
7. Measure end-to-end autonomous delivery, not only kernel execution.
8. Ship the eight changes as one EngineOS 2.0 program with staged, reviewable
   commits and an explicit migration guide.

## Non-goals

- Running a model-provider daemon or storing provider credentials in EngineOS.
- Circumventing a host's concurrency, approval or sandbox limits.
- Weakening security, high-risk, validation or release gates.
- Replacing the deterministic registry/kernel architecture with an orchestration
  framework.
- Optimizing historical JSONL validation before measurements show it is on the
  critical path.
- Preserving byte compatibility with every 1.x command or answer. EngineOS 2.0
  may remove deprecated surface, but every removal must appear in the migration
  inventory.

## Success criteria

### Context and routing

- Codex always-on EngineOS context is at most 32,000 bytes.
- A substantive prompt produces one task contract; adapters do not reconstruct
  routing, gates or model tiers from prose.
- `/engineos:route` makes no model dispatch when the kernel reports no unresolved
  residue.
- `/engineos:audit` discovers applicable domains before choosing agents; `all`
  remains available only as an explicit exhaustive mode.

### Execution

- `direct` is selected only when all are true: risk is `low`; work is reversible;
  one domain; one independent unit; no security-sensitive surface; at most two
  files; no decision rule or user request requires an agent.
- `delegate` is selected for one specialist-owned unit outside the direct lane.
- `wave` is selected for more than one domain or at least three independent units.
- The scheduler never launches more work than both policy capacity and the host
  adapter capacity allow.
- No second capacity setting is introduced; policy continues to own one wave cap.

### Runtime and measurement

- Cached pre-edit routing has a p50 below 75 ms on the reference development host.
- Prompt advice has a p50 below 80 ms on the same host.
- Bench output includes p50 and p95 for prompt-to-contract, edit pre/post pair,
  agent pre/post pair, queue wait and final-gate orchestration.
- Every measured agent run has a real wall duration. Token and cost fields are
  absent when the host cannot provide them; zero never means "unknown".
- Build-tier rebinding must pass existing deterministic evals and a declared live
  comparison before becoming the default.

## Chosen architecture

### 1. Task contract as the control plane

`resolve-task` remains the deterministic entry point and gains an `execution`
section. The section is registry-derived and contains only decisions the kernel
can make from declared facts:

```ts
type ExecutionMode = 'unresolved' | 'direct' | 'delegate' | 'wave';

interface ExecutionSection {
  mode: ExecutionMode;
  reasons: string[];
  units: ExecutionUnit[];
  policyCapacity: number;
}

interface ExecutionUnit {
  id: string;
  domains: string[];
  files: string[];
  workType: string;
  agent: string | null;
  modelTier: string;
  dependsOn: string[];
}
```

The kernel receives declared execution facts rather than inspecting a working
tree implicitly: classified risk, reversibility, domain count, unit count, file
count, security-sensitive flag, required agents and the user's explicit mode
request. Prompt-time routing may return `unresolved` while those facts are not
known. Before the first write, the adapter scopes the work and resolves the same
contract again with declared execution facts; only that resolved contract may
select `direct`, `delegate` or `wave`. Missing facts never qualify for `direct`,
and no adapter guesses file or unit counts from prompt wording.

Adapters consume this section verbatim. They may lower autonomy or capacity, but
they may not upgrade `delegate`/`wave` to `direct` or raise the policy cap. An
`unresolved` contract permits read-only scoping only; edits and agent launches wait
for a resolved execution mode.

### 2. Risk-proportional fast lane

The direct lane changes the current "dispatch even for one unit" rule. It is a
2.0 semantic break, not wording cleanup. The registry owns the predicate, the
kernel evaluates it, rules explain it, and validators assert the mirror.

Direct execution still requires a compact contract, risk classification, scoped
files and the final validation gate. It removes the subagent brief, wait, return
envelope and integration cycle only. Security review, critic review, user-requested
agents and release approval remain additive requirements and override direct mode.

### 3. Stateful scheduler with host launch boundary

Add `src/scheduler/` as a deterministic state machine. It owns:

- queued, ready, running, completed, failed and blocked unit states;
- dependency release between waves;
- admission from policy capacity plus host-reported capacity;
- retry, escalation and breaker transitions;
- append-only scheduler events and resumable state snapshots.

It does not call model providers. A host adapter implements this boundary:

```ts
interface AgentLauncher {
  capacity(): number;
  launch(unit: ExecutionUnit, brief: CompactBrief): Promise<LaunchHandle>;
  poll(handle: LaunchHandle): Promise<LaunchStatus>;
  interrupt(handle: LaunchHandle): Promise<void>;
}
```

Claude commands, Codex instructions and future native integrations map their own
agent tools onto the boundary. Where a host cannot supply a launcher, EngineOS
returns the next legal actions and labels enforcement `conventional`; it never
claims that a calculated wave was launched.

### 4. Adapter-specific compact context

`AGENTS.md` becomes a generated compact adapter entry point, not a hand-maintained
copy of `CLAUDE.md`. It contains:

- safety invariants that must exist before routing;
- the instruction for obtaining a task contract;
- the enforcement matrix for the current adapter;
- how to consume `execution`, gates and required artifacts;
- a pointer to human documentation, not the full router table.

The complete prose remains in `rules/`, `docs/` and registries. Route-selected
rules are loaded after contract resolution. Generation is deterministic and a
validator checks the 32 KB limit and required invariant set.

### 5. Hot runtime split and session metadata

Build three committed entry points:

```text
dist/engineos-hook.cjs    hook envelope, hot hooks, routing kernel subset
dist/engineos-kernel.cjs  kernel CLI and scheduler decisions
dist/engineos-admin.cjs   validate, gen, evals, bench, report, install helpers
dist/engineos.cjs         compatibility facade and version output
```

Registered hooks call the hook bundle directly. The facade remains for documented
2.0 commands and directs to the appropriate entry point.

SessionStart writes one bounded metadata record under the worktree Git directory:
repository root, absolute Git directory, prefix, routing signature, bypass state,
project instruction path and active-change-record state. Hook envelopes use the
record when its session, cwd and signatures match; Git/filesystem discovery is the
fallback. Writes are atomic and cache failure is a miss, never a blocked edit.

### 6. Deterministic route and audit fast paths

`/engineos:route` calls `resolve-task` once. If `execution.units`, risk and gates
are complete and no ambiguity/residue remains, it renders the plan directly. The
router agent receives the existing answer only when judgment remains and is
forbidden from resolving the same facts again.

`/engineos:audit` performs a cheap repository/domain inventory first. Default
audits dispatch only matching coordinators and reachable leaves. An explicit
`--exhaustive` flag preserves the old all-domain behavior and remains subject to
scheduler admission.

### 7. Distinct model tiers

The tier vocabulary remains `cheap`, `build`, `design`, `most-capable`, but the
2.0 model registry allows adapter-specific bindings. Work type selects a tier;
the adapter resolves that tier to an available model.

- `cheap`: localization, inventory, formatting, mechanical summaries.
- `build`: specified implementation and ordinary code review.
- `design`: architecture, hard debugging, security and adversarial review.
- `most-capable`: product/spec ambiguity and final escalation.

No concrete model is promoted to build by prose alone. A candidate must meet the
quality floor on deterministic evals, live cases and task-review findings while
improving median latency or cost by the threshold recorded in the model registry.

### 8. Lifecycle performance and honest telemetry

Extend the benchmark to emit human output plus a JSON artifact. Scenarios cover:

- prompt to task contract, cold and warm;
- pre/post edit pair, route cache miss and hit;
- agent dispatch/return pair with telemetry enabled;
- scheduler admission, queue wait and dependency release;
- final-gate orchestration without and with opted-in tests;
- always-on context bytes per adapter.

Scheduler and hook spans use monotonic wall time. Token, cache and cost fields use
three states: real value, absent/unknown, or zero as a real value. Reports never
coerce unknown to zero. The primary effectiveness metrics are time to first useful
edit and end-to-end task completion p50/p95; kernel timings remain diagnostic.

## Data flow

```text
request
  -> adapter gathers declared facts
  -> kernel resolve-task
  -> compact task contract + execution mode
  -> direct executor OR scheduler
  -> host launcher reports capacity/status
  -> scheduler advances units and records events
  -> one final validation gate
  -> change record consumes contract + evidence
  -> release gate for external effect
```

The task contract is canonical. Plans, handoffs and change records reference or
project it; they do not copy the full state. Handoffs are required only when an
owner/session changes, a wave is blocked, or unresolved risk crosses a boundary.

## Error handling and safety

- Missing or malformed execution facts fail closed out of the direct lane.
- A host capacity below policy capacity wins; zero capacity blocks launches.
- Scheduler state uses atomic writes and event replay. A corrupt snapshot is
  rebuilt from valid events or reported `BLOCKED`; it is never silently reset.
- A launcher failure is classified before retry. Security, data-loss and unclear
  irreversible situations stop immediately under the existing HITL vocabulary.
- Hook cache/session-metadata failures fall back to discovery and never suppress
  required guidance.
- Telemetry failure never blocks work, but a benchmark or release claiming
  performance without the required observations fails its evidence gate.

## Compatibility and migration

This is a deliberate 2.0 break. The implementation must inventory every public
surface in `docs/COMPATIBILITY.md` and classify it as retained, replaced or
removed. Required migration artifacts:

1. `docs/migrations/1.x-to-2.0.md` with command, registry, rule and adapter mappings.
2. Release notes naming removed surfaces and replacements.
3. Installer detection for a 1.x layout with an actionable refusal or migration
   path; no silent mixed-version installation.
4. A compatibility facade for retained command names during the 2.0 line where it
   does not preserve the bottleneck being removed.
5. Consumer examples for Claude and Codex task-contract loading.

The release is one coordinated 2.0 outcome but not one oversized PR. It ships as
stacked PRs that each respect the repository's 400-line review limit, are
independently reviewable and keep their branch buildable.

## Verification strategy

Tests are in scope for implementation because this is a named 2.0 release gate and
changes public routing, scheduling and hook contracts.

- Unit tests: direct-lane predicate, scheduler transitions, capacity minimum,
  retry/breaker behavior, session metadata invalidation and telemetry unknowns.
- Contract tests: task-contract execution section and adapter consumption.
- Integration tests: fake host launcher over direct, delegate and multi-wave tasks.
- Compatibility tests: retained facade commands and explicit failures for removed
  1.x surface.
- Performance tests: p50/p95 scenarios with published reference-host metadata.
- Evals: deterministic routing/model suite plus bounded live comparison for the
  new build binding.
- Final gate: build, lint, typecheck, requested tests, deterministic evals,
  validator, packaged-artifact validation and startup smoke checks.
- High-risk gate: independent critic and security review before release approval.

## Delivery waves

1. **Measurement contract:** lifecycle benchmark schema, baselines and telemetry
   unknown semantics. No behavior change.
2. **Control contract:** execution facts/section, direct-lane policy and validators.
3. **Scheduler:** state machine, fake launcher and adapter action protocol.
4. **Context and routing:** generated compact Codex entry point, route fast path and
   scoped audit inventory.
5. **Runtime:** split bundles and shared session metadata.
6. **Models:** adapter bindings and evaluation-gated build-tier selection.
7. **Migration and integration:** remove approved 1.x surface, migration guide,
   release notes, full gates and packaged artifact.

Within each wave, work is split by disjoint files. Shared registry and validator
surfaces have one owner. A failed unit blocks its wave barrier.

## Alternatives rejected

### Optimize the existing prose-first flow in place

Rejected because it leaves Codex with large eager context, capacity as ceremony and
deterministic routing duplicated across model prompts. It lowers migration risk but
cannot achieve the end-to-end goal.

### Persistent orchestration daemon

Rejected for the initial 2.0 release. It could remove more startup latency, but adds
process lifecycle, authentication, recovery, port/socket and cross-platform work
before split-bundle measurements justify it. The scheduler and launcher boundary
leave this open later without requiring it now.

### Raise the wave cap

Rejected as an optimization. A configured cap cannot exceed host capacity, and the
current runtime has no dispatch caller. EngineOS retains one policy capacity and
uses the minimum of that value and host capacity.

## Human decisions

| Date | Decision | Outcome |
|---|---|---|
| 2026-09-22 | Implement all eight audited improvements as one coordinated program | approved |
| 2026-09-22 | Compatibility target | breaking EngineOS 2.0 |
| 2026-09-22 | Architecture | fast core with task contract, risk fast lane, scheduler and host launcher boundary |

## Open implementation facts, not design choices

- The exact build-tier model binding is selected by the evaluation wave.
- Reference-host performance numbers are recorded by Wave 1; the relative and
  absolute targets above remain the acceptance thresholds.
- Each adapter's native launcher capability is documented honestly during Wave 3;
  a missing native API produces next-action guidance, not fabricated enforcement.
