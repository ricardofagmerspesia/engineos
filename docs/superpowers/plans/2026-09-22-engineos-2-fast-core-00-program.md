# EngineOS 2.0 Fast Core — Program Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the per-wave plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship EngineOS 2.0 as a faster autonomous execution core — risk-proportional execution, a real scheduler, compact per-adapter context, split hot runtime and honest lifecycle measurement — without weakening any policy the 1.x line enforces.

**Architecture:** The deterministic task contract becomes the control plane: `resolve-task` gains an `execution` section that answers `unresolved | direct | delegate | wave` from declared scope facts. A stateful scheduler owns unit state, admission, retry and breaker decisions, while a host launcher boundary performs the actual agent launches. Adapters receive compact generated context instead of a shared eager corpus. Hooks run from a small bundle over shared session metadata.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), esbuild to committed CJS bundles, JSON registries, bash hook shims, Node built-in test runner (`node --test`), node >= 18.

**Spec:** [docs/specs/2026-09-22-engineos-2-fast-core-design.md](../../specs/2026-09-22-engineos-2-fast-core-design.md)

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the repository and the spec.

- Node floor: `>=18` (`package.json` engines). Syntax lowered to `node16` in the bundle so the version guard in `src/cli.ts` can run on an old node.
- TypeScript is `strict` with `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`. `rootDir: src`, `outDir: build`.
- No `any`. Unknown input is `unknown`, narrowed immediately. No type assertions (`as`) to silence an error.
- One `import` statement per module — never split symbols from the same source across lines.
- `Number.parseInt` / `Number.parseFloat`, never the globals.
- Explicit return types on every exported function.
- Tests are colocated: `src/<area>/<name>.test.ts` beside `src/<area>/<name>.ts`. E2E tests are `*.e2e.test.ts`.
- Commands: build `npm run build`; typecheck `npm run typecheck`; lint `npm run lint` (same tsc invocation); full suite `npm test` (`tsc -p tsconfig.json && cd build && node --test`).
- Single test file: `npx tsc -p tsconfig.json && cd build && node --test <area>/<name>.test.js` — note the compiled path drops the `src/` prefix because `rootDir` is `src`.
- Validator: `node dist/engineos.cjs validate` must pass. It enforces prose/registry mirrors; a registry change without its prose mirror (and vice versa) fails CI.
- `dist/engineos.cjs` is a committed build artifact. Rebuild and commit it in any task that changes `src/`.
- All identifiers, comments and messages in English. No emojis anywhere. Comments say WHY, never WHAT.
- No placeholders, stubs or fake data on any reachable path.
- Conventional Commits. PRs at most 400 lines changed; stack them rather than growing one.
- Public surface changes follow `docs/COMPATIBILITY.md`. A rename is a deprecation with a window, never a silent `git mv` — except where this program explicitly removes 1.x surface under the approved 2.0 break, which must still be inventoried.
- Tests ARE in scope for every wave of this program: it is a named 2.0 release gate changing public routing, scheduling and hook contracts.
- Kernel refusal style: an impossible or contradictory fact combination throws `KernelError` with a sentence naming both facts. Never fabricate a default for a missing fact.

---

## Wave map and dependencies

| Wave | Plan | Depends on | Delivers |
|---|---|---|---|
| 1 | `...-w1-measurement.md` | — | Lifecycle benchmark schema, reference-host baselines, telemetry unknown semantics. No behavior change. |
| 2 | `...-w2-control-contract.md` | 1 (schema only) | `ExecutionFacts` / `ExecutionSection`, direct-lane policy, rule mirrors, validators. |
| 3 | `...-w3-scheduler.md` | 2 | `src/scheduler/` state machine, fake launcher, adapter action protocol. |
| 4 | `...-w4-context-routing.md` | 2 | Generated compact Codex entry point, `/route` fast path, scoped audit inventory. |
| 5 | `...-w5-runtime.md` | — (integrates with 4) | Split bundles, shared session metadata. |
| 6 | `...-w6-models.md` | 1, 2 | Adapter model bindings, eval-gated build-tier selection. |
| 7 | `...-w7-migration.md` | 2, 3, 4, 5, 6 | 1.x surface removal, migration guide, release notes, full gates, packaged artifact. |

Waves 4 and 5 may run concurrently with 3 and 6 once 2 lands. Wave 7 runs last, alone.

**Barrier rule.** A failed unit blocks its wave's barrier. Do not start a dependent wave around a hole — fix the unit or re-plan the remaining waves with the hole explicit.

---

## Frozen interfaces

These are designed once, here, and consumed verbatim by every wave plan. A wave that believes one of them is wrong reports it; it does not redefine it.

### F1 — Execution facts and section (owner: Wave 2)

New module `src/kernel/execution.ts`. Follows the existing sparse-facts pattern of `src/kernel/resolve.ts`: the section is answered iff its facts were declared.

```ts
export type ExecutionMode = 'unresolved' | 'direct' | 'delegate' | 'wave';

export interface ExecutionFacts {
  riskTier: RiskTier;
  reversible: boolean;
  domainCount: number;
  unitCount: number;
  fileCount: number;
  securitySensitive: boolean;
  requiredAgents: string[];
  requestedMode?: ExecutionMode;
}

export interface ExecutionUnit {
  id: string;
  domains: string[];
  files: string[];
  workType: string;
  agent: string | null;
  modelTier: string;
  dependsOn: string[];
}

export interface ExecutionSection {
  mode: ExecutionMode;
  reasons: string[];
  units: ExecutionUnit[];
  policyCapacity: number;
}

export function executionSection(facts: ExecutionFacts, regs: Registries): ExecutionSection;
```

Wiring into `src/kernel/resolve.ts`: add `execution?: ExecutionFacts` to `DeclaredFacts` and `execution?: ExecutionSection` to `Answer`, filled in the same positional style as the existing sections (after `waves`, before the composed `task_contract` block). Add the `execution` case to the fact parser in `src/kernel/cli.ts` alongside `waves`.

**Unresolved is the default, not an error.** A caller that omits `ExecutionFacts` gets no `execution` key at all. A caller that declares facts with `unitCount < 0`, `fileCount < 0` or `domainCount < 0` is a `KernelError`. A caller that cannot yet count files declares nothing and routes at prompt time; the resulting contract has no `execution` section and the adapter treats it as `unresolved`.

`reasons` are stable slugs, never prose. The closed vocabulary:
`risk-not-low`, `irreversible`, `multi-domain`, `unit-count-exceeded`, `file-count-exceeded`, `security-sensitive`, `agent-required`, `mode-requested`, `facts-undeclared`.

`policyCapacity` is `registries/policy.json .parallelism.wave_concurrency_cap` (6 today). The kernel publishes it; it never publishes a host capacity it cannot observe.

### F2 — Direct-lane predicate (owner: Wave 2)

Registry-owned under a new `registries/policy.json` block `.execution`:

```json
{
  "execution": {
    "note": "Risk-proportional execution lane. Answered by kernel execution section; mirrored in rules/parallelism.md and rules/subagents.md. direct removes the subagent brief/wait/return cycle only — never a gate.",
    "modes": ["unresolved", "direct", "delegate", "wave"],
    "direct_lane": {
      "max_risk": "low",
      "requires_reversible": true,
      "max_domains": 1,
      "max_units": 1,
      "max_files": 2,
      "forbid_security_sensitive": true,
      "forbid_required_agents": true
    },
    "wave_lane": {
      "min_units": 3,
      "min_domains": 2
    }
  }
}
```

Resolution order, evaluated top to bottom, first match wins:
1. facts undeclared -> `unresolved` (`facts-undeclared`)
2. `requestedMode` is `delegate` or `wave` -> that mode (`mode-requested`). A requested `direct` is advisory only and must still satisfy step 4.
3. `securitySensitive` or `requiredAgents.length > 0` -> at least `delegate` (`security-sensitive` / `agent-required`)
4. every `direct_lane` bound satisfied -> `direct`
5. `unitCount >= min_units` or `domainCount >= min_domains` -> `wave`
6. otherwise -> `delegate`

An adapter may lower autonomy or capacity. It may never upgrade `delegate`/`wave` to `direct`, and never raise `policyCapacity`.

### F3 — Scheduler API (owner: Wave 3)

New directory `src/scheduler/`. Pure state machine — it performs no process launches.

```ts
export type UnitState = 'queued' | 'ready' | 'running' | 'completed' | 'failed' | 'blocked';

export interface SchedulerUnit {
  id: string;
  dependsOn: string[];
  state: UnitState;
  attempts: number;
  agent: string | null;
  modelTier: string;
}

export interface SchedulerState {
  units: SchedulerUnit[];
  capacity: number;
  waveIndex: number;
}

export type SchedulerEvent =
  | { kind: 'unit-started'; id: string }
  | { kind: 'unit-completed'; id: string }
  | { kind: 'unit-failed'; id: string; reason: string }
  | { kind: 'unit-blocked'; id: string; reason: string };

export type SchedulerAction =
  | { kind: 'launch'; id: string; agent: string; modelTier: string }
  | { kind: 'retry'; id: string; modelTier: string }
  | { kind: 'defer'; id: string }
  | { kind: 'halt'; reason: string };

export function initialState(units: ExecutionUnit[], capacity: number): SchedulerState;
export function apply(state: SchedulerState, event: SchedulerEvent): SchedulerState;
export function nextActions(state: SchedulerState): SchedulerAction[];
```

`apply` returns a new state and never mutates its argument. `nextActions` is pure and idempotent for a given state.

Capacity is `Math.min(policyCapacity, hostCapacity)`. When the host reports no capacity, the scheduler uses `policyCapacity` and records `host-capacity-unknown` — it never claims enforcement it does not have.

Retry and breaker behavior reuse the existing kernel answers (`src/kernel/repair.ts`, `src/kernel/breaker.ts`, `src/kernel/admit.ts`); the scheduler calls them, it does not restate their policy.

### F4 — Host launcher boundary (owner: Wave 3)

```ts
export interface LaunchRequest {
  unitId: string;
  agent: string;
  modelTier: string;
  files: string[];
}

export interface LaunchOutcome {
  unitId: string;
  status: 'OK' | 'DEGRADED' | 'BLOCKED' | 'FAILED';
  note: string | null;
}

export interface HostLauncher {
  readonly capacity: number | null;
  launch(request: LaunchRequest): Promise<LaunchOutcome>;
}
```

Wave 3 ships `FakeLauncher` (deterministic, test-only) and documents each real adapter's native launch capability honestly. An adapter with no native launch API produces next-action guidance for the model, never a fabricated enforcement claim.

### F5 — Session metadata (owner: Wave 5, consumed by Wave 4)

One resolved record per session, replacing the repeated git discovery and directory scans in `src/hooks/route-before-change.ts` and the agent dispatch/return hooks.

```ts
export interface SessionMetadata {
  repoRoot: string;
  gitDir: string | null;
  bypassActive: boolean;
  projectInstructions: string[];
  activeChangeRecords: string[];
  resolvedAtMs: number;
}
```

Cached per `session_id` under the existing telemetry directory convention. Invalidated on SessionStart and when the mtime of `.engineos/changes/` or the project instruction files changes. A cache miss recomputes; it never serves a stale answer as fresh.

### F6 — Lifecycle measurement schema (owner: Wave 1, consumed by Waves 6 and 7)

Extends `src/bench/` without breaking the five existing budget names, which are public surface (`docs/COMPATIBILITY.md`, the CI "Runtime performance budgets" step).

```ts
export interface LifecycleSample {
  scenario: string;
  phase: 'routing' | 'execution' | 'integration' | 'verification';
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costMicros: number | null;
  cacheHit: boolean | null;
  retries: number;
}

export interface LifecycleReport {
  host: HostMetadata;
  scenarios: ScenarioResult[];
}

export interface ScenarioResult {
  scenario: string;
  p50Ms: number;
  p95Ms: number;
  dispatches: number;
  contextBytes: number;
  samples: LifecycleSample[];
}

export interface HostMetadata {
  platform: string;
  cpuModel: string;
  cpuCount: number;
  nodeVersion: string;
  engineosVersion: string;
}
```

**Unknown means `null`, never `0`.** The current agent spans record `tokens_in: 0` / `tokens_out: 0` because the hook cannot observe subagent usage, and a consumer reading those zeros as "free" is the exact defect this schema exists to remove. Wave 1 also changes that hook path to emit unknowns as unknown.

Baselines are written to `docs/perf/baselines/<host-id>.json` with the `HostMetadata` above. Relative targets in the spec are asserted against the baseline recorded on the same host, never against a number hardcoded in a test.

### F7 — CLI surface added by this program

| Command | Wave | Purpose |
|---|---|---|
| `engineos kernel execution --facts <json>` | 2 | Answer the execution section alone. |
| `engineos scheduler plan --units <json>` | 3 | Emit the initial state and first actions. |
| `engineos scheduler step --state <json> --event <json>` | 3 | Apply one event, emit next actions. |
| `engineos bench lifecycle` | 1 | Run the lifecycle scenarios, emit `LifecycleReport`. |
| `engineos bench baseline --write` | 1 | Record this host's baseline. |

Each is registered in the existing `CommandTable` in `src/cli.ts` (or the area CLI it belongs to) and added to `docs/COMPATIBILITY.md` in the same task that introduces it.

---

## Barrier exit criteria

Every wave barrier requires all of:

- [ ] Every task in the wave plan checked off, each with its own commit.
- [ ] `npm run build && npm run typecheck && npm test` green, output shown.
- [ ] `node dist/engineos.cjs validate` green — prose and registry mirrors agree.
- [ ] `dist/engineos.cjs` rebuilt and committed if `src/` changed.
- [ ] `docs/COMPATIBILITY.md` updated for any public surface added, changed or removed.
- [ ] A handoff written per `templates/handoff.md` naming what is done, what is not, and the next wave's entry facts.

The **release gate** runs once, at the Wave 7 barrier only, and additionally requires the rollback path, the residual-risk list, an independent `critic` pass and a `security-reviewer` pass (risk is high: this changes auth-adjacent hook contracts and removes public surface).

---

## Self-review against the spec

| Spec section | Wave | Covered by |
|---|---|---|
| 1. Task contract as control plane | 2 | F1, F2 |
| 2. Risk-proportional fast lane | 2 | F2, rule mirrors in `rules/parallelism.md` + `rules/subagents.md` |
| 3. Stateful scheduler with host launch boundary | 3 | F3, F4 |
| 4. Adapter-specific compact context | 4 | Generated Codex entry point |
| 5. Hot runtime split and session metadata | 5 | Split bundles, F5 |
| 6. Deterministic route and audit fast paths | 4 | `/route` short-circuit, audit inventory |
| 7. Distinct model tiers | 6 | `registries/models.json` rebinding, eval gate |
| 8. Lifecycle performance and honest telemetry | 1 | F6 |
| Compatibility and migration | 7 | Inventory, migration guide, installer detection |
| Verification strategy | all | Barrier exit criteria above |

No spec section is unassigned. No wave depends on a fact an earlier wave has not produced.

---

## Barrier reconciliations

Written after all seven wave plans returned. Each item is a contract note a wave
raised, or a measured fact that changes a premise. **These override the frozen
interfaces above where they conflict** — the interfaces are left unedited so the
wave plans that quote them stay readable, and this section is the errata.

### R1 — An absent `execution` key IS the unresolved lane

F1 declares `mode: 'unresolved'` and F2 step 1 answers it from undeclared facts.
Wave 2 found that branch unreachable: `executionSection(facts: ExecutionFacts, …)`
has no absent state, so the function cannot produce `facts-undeclared`.

Resolution, and it is better than the original: `resolve` omits the `execution`
key entirely when `facts.execution === undefined`, which is the sparse-section
convention every other kernel section already follows. An absent key is the
unresolved lane. `executionSection`'s signature is untouched; one export is added,
`unresolvedExecution(regs: Registries): ExecutionSection`, so the CLI arm can
answer `--facts '{}'`.

Adapters read it the same way either way: **no `execution` key means read-only
scoping only.**

### R2 — `ExecutionSection.units` is empty in Wave 2, and Wave 3 does not read it

`ExecutionFacts` carries counts, not unit payloads, so the kernel has no unit to
publish — the same discipline that keeps `policyCapacity` from ever being a host
capacity. `ExecutionUnit` stays exported because F3 consumes the type.

**Wave 3 takes its units from its own `--units` payload**, the way the existing
`waves` arm already does. It must not read them off the section.

### R3 — F7 misstated where the new commands register

F7 says each command is "registered in the existing `CommandTable` in `src/cli.ts`".
Only `scheduler` is. Corrected:

| Command | Registration |
|---|---|
| `engineos kernel execution` | an arm of `runKernel` |
| `engineos bench lifecycle` / `bench baseline` | arms of `runBench` |
| `engineos scheduler plan` / `scheduler step` | a new `CommandTable` key |

Verify each by invocation, not by registration site. Three additions the waves
found that F7 does not list, all of which belong in the Wave 7 inventory:
`scheduler plan --host-capacity <n|unknown>` (default `unknown`); `gen
adapter-context` as a target of the existing `gen` command; a `codex context`
budget row on `bench`; and an `inventory` declared fact on the existing `resolve`
arm.

### R4 — F6 needs a baseline read path, and Wave 1 must add it

F6 gave `bench lifecycle` and `bench baseline --write` and no way to READ a
baseline. Wave 6 worked around it by globbing `docs/perf/baselines/*.json` and
matching `HostMetadata` fields; Wave 5 parses the JSON directly and narrows only
`scenario`/`p50Ms`/`p95Ms`. Two consumers, two schemes, neither sharing the
`hostId()` derivation.

**Wave 1 adds `resolveBaseline(io: BaselineIo, root: string, meta: HostMetadata):
LifecycleReport | null` as the single read path**, exported from
`src/bench/baseline.ts`, and Waves 5 and 6 call it instead of rolling their own.
Wave 1's `readBaseline` already does exactly this; the gap was that it was never
named as the contract. A consumer that cannot import it (a shell step) reads the
path `baselinePath()` returns rather than globbing.

Wave 6's refusal to run `bench baseline --write` after a rebinding stands — that
would measure the new binding against itself.

### R5 — F5 keeps `repoRoot: string`; two facts move to a Wave 5 private type

Wave 5 raised three shape problems. Rulings:

- **`prefix` and the routing signature** are not in F5 although spec section 5
  names them. They ride on a Wave-5-private `SessionRouteKeys { prefix,
  changesDirPresent }`. F5 is unchanged, so Wave 4 codes against it as frozen.
- **`activeChangeRecords: string[]` cannot distinguish an absent
  `.engineos/changes` from a present-but-empty one**, and today's
  `route-before-change` emits its reminder only in the second case. That
  distinction is load-bearing, so `changesDirPresent` joins `SessionRouteKeys`.
- **`repoRoot: string` stays non-nullable.** Outside a repository it falls back to
  the cwd. `string | null` would say that more directly, but Wave 4 is already
  coding against the frozen shape and the fallback is documented here instead.
  Revisit in a later release, not mid-program.

Wave 4 consumes F5 at the protocol boundary only — it never imports or re-declares
`SessionMetadata`, which is what keeps Waves 4 and 5 genuinely concurrent.

### R6 — Wave ordering is stricter than the wave map said

The map said Waves 4 and 5 "may run concurrently with 3 and 6". Corrected:

- **Wave 4 starts only after Wave 2's barrier.** Its Tasks 2 and 7 edit
  `registries/policy.json`, `src/registry/policy.ts`, `src/kernel/resolve.ts` and
  `src/kernel/cli.ts` — the exact files Wave 2 owns.
- **Wave 3 Task 1 starts only after Wave 2 exports `ExecutionUnit`.**
- **Wave 5 remains concurrent with 3 and 4.** It touches `src/entries/`,
  `src/lib/git-discovery.ts`, `src/hooks/session-metadata.ts` and the build script,
  none of which the others own.
- **Wave 6 Task 9 is exclusive over `agents/`.** A build rebinding moves
  `registries/agents.json`, sixteen `agents/*.md` with `tier: build`, and the
  regenerated registry in one commit, because check C31 binds each agent's
  `model:` frontmatter to its tier. No other wave may edit `agents/` while it runs.

### R7 — Check-id collision: C38 is claimed twice

Wave 2 registers C38, C38b and C38c (68 → 71). Wave 4 registers its own C38
(68 → 69). Wave 6 adds a C16 assertion. **Ids are assigned in landing order at the
barrier, not reserved in advance.** Whichever wave lands second renumbers.

Check C37 enforces the count claim in `CLAUDE.md`, `AGENTS.md`, `README.md` and
`docs/CODEBASE_MAP.md` — six occurrences. The last wave to land owns the final
number in all four.

Wave 2 and Wave 6 both touch `src/checks/decision-registries*.ts`. Serialize them;
Wave 6 already kept its assertion out of `src/checks/mirrors.ts`, the most
contended file.

### R8 — The five bench budget names are not yet public surface

F6 asserts they are public surface "per `docs/COMPATIBILITY.md`". Wave 7 checked:
they appear only in 1.7.0 narrative prose, not in that file's public-surface table.
Wave 7 Task 2 Step 5 creates the row that makes the claim true. Until it lands, do
not cite F6's assertion as though it already holds.

Wave 4 adds a sixth budget name (`codex context`) and moves both byte budgets to
read `max_bytes` from the registry instead of a `32000` literal. Wave 5 changes a
budget *value* (150 → 75). Wave 7 rules on whether a value change is MINOR.

### R9 — Measured: the `route-before-change` budget is ALREADY red, and 75ms may be unreachable

Measured on this host, on this branch, which contains only documentation:

```
FAIL route-before-change (cache hit): median=280.0ms budget<150.0ms
ok   route-intent: median=155.8ms budget<250.0ms
ok   resolve-task: median=175.3ms budget<500.0ms
ok   prompt-advisor (end to end): median=128.5ms budget<600.0ms
ok   always-on context: 28019 bytes budget<32000 bytes
```

Wave 5's author measured 231.6ms on a different host. Both are far over the 150ms
budget. **This is a pre-existing regression, not something a wave introduced**, and
the 141.3ms figure in the originating audit no longer describes either host.

Three consequences:

1. **Wave 5 is not to be blamed for it.** Its Task 13 fix loop must first establish
   whether the red is host noise or a real regression, and say which.
2. **The 75ms target may be unreachable.** Measured floor on this host: bare
   `node -e 0` is 54.8ms and one `git rev-parse --show-toplevel --absolute-git-dir
   --show-prefix` is 29.7ms, so ~85ms before EngineOS does anything at all. A
   target below the floor is not a target. Wave 5 asserts against the Wave 1
   baseline for the host and reports DEGRADED rather than raising the budget — that
   is the correct behavior, and reporting DEGRADED here is a success, not a failure.
3. **The bundle split is weakly supported as a latency win on this host.**
   `node dist/engineos.cjs --version` measures 52.1ms against bare node's 54.8ms —
   the 384.5KB bundle's parse and evaluation is inside the noise. Wave 5's author
   measured an 11ms gap on their host. Either way the ~195ms between the ~85ms floor
   and the observed 280ms is spent somewhere other than bundle load.

**Wave 5 Task 12 measures before recommending, and that ordering is now
load-bearing rather than cautious.** If the split does not pay for itself, say so
and keep the facade — the spec already rejects a daemon until this measurement
exists, and it would equally reject a split that buys nothing.

### R10 — `/audit` keeps an unconditional security pass

Wave 4's inventory dispatches `security-reviewer` only when the repository carries
files matching `routing.json`'s security globs. It correctly escalated this rather
than deciding it.

**Ruling: security review stays unconditional in `/audit`.** An audit that skips
the security lens because no file *name* matched is how a missed surface stays
missed, and the glob is a routing heuristic, not a statement about where risk
lives. The inventory may scope every other domain.

### R11 — A documented prior decision is being reversed, on purpose

`templates/adapters/codex.md` rejects generating `AGENTS.md`: the substitution
table it would need was judged more machinery than the hand sync. Wave 4 reverses
it, and the distinction holds — generating from `CLAUDE.md` stays rejected;
generating from the *registries* needs no substitution table. Wave 4 Task 4
rewrites that section rather than leaving the file contradicting the build.

This is a reversal of a recorded decision, so it belongs in the migration guide,
not only in the inventory.

### R12 — Two rule headings are renamed, and that is versioned surface

`rules/subagents.md` `## Dispatch is mandatory` → `## Dispatch is proportional`.
`rules/parallelism.md` `## Decompose-and-distribute — the default` →
`## — past the direct lane`.

Non-negotiable #11 makes headings versioned surface. No validator anchors on
either today (Wave 2 checked). **Take the renames** — under the approved 2.0 break,
leaving headings that assert the opposite of what the code does is worse than
renaming them. They go in `docs/migrations/1.x-to-2.0.md`, not only in the
inventory.

### R13 — Known downstream break: hand-written `registries/policy.json`

The `.execution` block is MAJOR for any consumer carrying its own hand-written
`registries/policy.json`. The loader is fail-closed, so such a tree exits 1 with
`registries/policy.json: .execution must be an object` where it previously loaded.
Wave 7 owes these consumers a migration note, not just an inventory row.

### R14 — No real `HostLauncher` ships in this program

Wave 3 ships the boundary, the state machine and a test-only `fakeLauncher` that
stamps every outcome `fake-launcher: no process was started`. Enforcement is
`conventional` for every adapter until a real launcher exists.

**Do not describe the scheduler as enforcing concurrency.** It decides; nothing in
this program launches. Saying otherwise would rebuild the "capacity as ceremony"
defect the originating audit found, one layer up.
