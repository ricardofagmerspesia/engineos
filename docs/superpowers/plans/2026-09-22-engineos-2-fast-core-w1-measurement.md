# EngineOS 2.0 — Wave 1: Measurement Contract

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EngineOS able to measure its own task lifecycle honestly — real p50/p95 per phase, per-host baselines, and telemetry that says "unknown" instead of "0" where it cannot observe a value.

**Architecture:** A new `src/bench/lifecycle.ts` defines the sample/report schema and the statistics; `src/bench/host.ts` identifies the host a baseline belongs to; `src/bench/scenarios.ts` drives real hook invocations through the existing spawn seam in `src/bench/measure.ts`. Two new subcommands hang off the existing `engineos bench` entry. Separately, the exec-journal schema flips `tokens_in`/`tokens_out` from `required` to `always`, so a hook that cannot see a subagent's usage writes `null` rather than a zero that reads as "free".

**Tech Stack:** TypeScript (strict), Node built-in test runner, esbuild CJS bundle, `node:os` / `node:crypto` for host identity.

**Spec:** [docs/specs/2026-09-22-engineos-2-fast-core-design.md](../../specs/2026-09-22-engineos-2-fast-core-design.md) — section 8, "Lifecycle performance and honest telemetry".

**Program plan:** [2026-09-22-engineos-2-fast-core-00-program.md](2026-09-22-engineos-2-fast-core-00-program.md). Frozen interface **F6** is owned by this wave and consumed by Waves 5, 6 and 7 — its shape may not change once Task 2 lands.

---

## Global Constraints

The program plan's Global Constraints apply in full. The ones a Wave 1 implementer will trip on:

- `exactOptionalPropertyTypes: true` — an optional property cannot be assigned `undefined` explicitly. Model "absent" with `| null` in these schemas, never with `?` plus `undefined`.
- `noUncheckedIndexedAccess: true` — every array index read is `T | undefined`. The percentile helper must narrow before arithmetic.
- No `any`. No `as` to silence an error.
- One `import` statement per module.
- Explicit return types on every exported function.
- `Number.parseInt` / `Number.parseFloat`, never the globals.
- Every I/O goes through an injected dependency, matching the existing `BenchDeps` seam in `src/bench/measure.ts`. A test must drive the whole ladder without spawning a hook or waiting on a real clock.
- The five existing budget names, their order, the `ok/FAIL` line format and `ENGINEOS_PERF_MULTIPLIER` are public surface (`docs/COMPATIBILITY.md`, the CI "Runtime performance budgets" step). This wave ADDS subcommands; it does not change the bare `engineos bench` output.
- `dist/engineos.cjs` is a committed artifact — rebuild and commit it in any task that changes `src/`.
- Single test file: `npx tsc -p tsconfig.json && cd build && node --test bench/lifecycle.test.js` (the compiled path drops `src/` because `rootDir` is `src`).
- Tests ARE in scope for this wave.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/bench/host.ts` (create) | `HostMetadata`, its collection from `node:os`, and the stable `hostId` that names a baseline file. Nothing else. |
| `src/bench/host.test.ts` (create) | Host identity is stable for equal inputs and differs for different CPUs. |
| `src/bench/lifecycle.ts` (create) | The F6 schema types and the pure statistics over them (`percentile`, `summarize`). No I/O. |
| `src/bench/lifecycle.test.ts` (create) | Percentile edges, unknown propagation, summary shape. |
| `src/bench/scenarios.ts` (create) | The named lifecycle scenarios and how each is driven through `BenchDeps.spawn`. Owns the scenario list, not the statistics. |
| `src/bench/scenarios.test.ts` (create) | Each scenario spawns what it claims to, with a fake spawn. |
| `src/bench/baseline.ts` (create) | Read and write `docs/perf/baselines/<host-id>.json`; compare a report against a baseline. |
| `src/bench/baseline.test.ts` (create) | Round-trip, missing-baseline refusal, regression detection. |
| `src/bench/run.ts` (modify) | Add subcommand dispatch for `lifecycle` and `baseline`. The bare invocation keeps its current behavior byte-for-byte. |
| `src/bench/run.test.ts` (modify) | Subcommand routing, and a regression test that the bare invocation is unchanged. |
| `src/journal/schema.ts` (modify, lines 88-89) | Flip `tokens_in` / `tokens_out` from `presence: 'required'` to `presence: 'always'`. |
| `src/journal/schema.test.ts` (modify) | Unset tokens emit JSON `null`, not `0`. |
| `src/hooks/announce-agent-return.ts` (modify, ~line 50) | Stop writing zero tokens; leave them unset so the schema emits `null`. |
| `src/hooks/telemetry.ts` (modify) | Remove the zero defaults for `tokens_in` / `tokens_out`. |
| `rules/observability.md` (modify) | Replace the "tokens_* are 0 there" prose with the unknown semantics. |
| `docs/COMPATIBILITY.md` (modify) | Record the two new subcommands and the journal presence change. |
| `docs/perf/baselines/.gitkeep` (create) | The baseline directory exists in a fresh clone. |

---

## Task 1: Host identity

**Files:**
- Create: `src/bench/host.ts`
- Test: `src/bench/host.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `interface HostMetadata`, `interface HostDeps`, `function collectHost(deps: HostDeps, engineosVersion: string): HostMetadata`, `function hostId(meta: HostMetadata): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { deepStrictEqual, notStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { collectHost, hostId, type HostDeps } from './host';

const deps: HostDeps = {
  platform: () => 'darwin',
  cpus: () => [{ model: 'Apple M2 Pro' }, { model: 'Apple M2 Pro' }],
  nodeVersion: () => 'v22.11.0',
};

test('collectHost reports the host a baseline belongs to', () => {
  deepStrictEqual(collectHost(deps, '2.0.0'), {
    platform: 'darwin',
    cpuModel: 'Apple M2 Pro',
    cpuCount: 2,
    nodeVersion: 'v22.11.0',
    engineosVersion: '2.0.0',
  });
});

test('collectHost reports an unknown cpu rather than crashing on an empty list', () => {
  const empty: HostDeps = { ...deps, cpus: () => [] };
  strictEqual(collectHost(empty, '2.0.0').cpuModel, 'unknown');
  strictEqual(collectHost(empty, '2.0.0').cpuCount, 0);
});

test('hostId is stable for the same hardware and ignores the engineos version', () => {
  const a = collectHost(deps, '2.0.0');
  const b = collectHost(deps, '2.1.0');
  strictEqual(hostId(a), hostId(b));
  strictEqual(/^[a-z0-9-]+$/.test(hostId(a)), true);
});

test('hostId separates different hardware', () => {
  const other = collectHost({ ...deps, cpus: () => [{ model: 'Intel i7' }] }, '2.0.0');
  notStrictEqual(hostId(collectHost(deps, '2.0.0')), hostId(other));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc -p tsconfig.json && cd build && node --test bench/host.test.js`
Expected: compilation fails with `Cannot find module './host'` — the module does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
import { createHash } from 'node:crypto';

// Which machine a recorded baseline describes. A baseline compared across
// different hardware is not a regression signal, so the id below names the
// hardware and deliberately excludes the EngineOS version: upgrading EngineOS
// must compare against the same host's previous numbers, not start a new file.
export interface HostMetadata {
  platform: string;
  cpuModel: string;
  cpuCount: number;
  nodeVersion: string;
  engineosVersion: string;
}

export interface HostDeps {
  platform: () => string;
  cpus: () => readonly { model: string }[];
  nodeVersion: () => string;
}

export function collectHost(deps: HostDeps, engineosVersion: string): HostMetadata {
  const cpus = deps.cpus();
  const first = cpus[0];
  return {
    platform: deps.platform(),
    // A container with no readable cpu list reports `unknown` rather than
    // crashing a measurement run that is otherwise valid.
    cpuModel: first === undefined ? 'unknown' : first.model,
    cpuCount: cpus.length,
    nodeVersion: deps.nodeVersion(),
    engineosVersion,
  };
}

export function hostId(meta: HostMetadata): string {
  const material = `${meta.platform}|${meta.cpuModel}|${String(meta.cpuCount)}`;
  const digest = createHash('sha256').update(material).digest('hex').slice(0, 12);
  return `${slug(meta.platform)}-${String(meta.cpuCount)}x-${digest}`;
}

// A file-name component, so the class is narrower than the journal's slug:
// no dots and no slashes can reach a path built from this value.
function slug(value: string): string {
  const lowered = value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return lowered.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc -p tsconfig.json && cd build && node --test bench/host.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/bench/host.ts src/bench/host.test.ts
git commit -m "feat(bench): identify the host a performance baseline belongs to"
```

---

## Task 2: Lifecycle schema and statistics

This task freezes **F6**. Waves 5, 6 and 7 code against these names.

**Files:**
- Create: `src/bench/lifecycle.ts`
- Test: `src/bench/lifecycle.test.ts`

**Interfaces:**
- Consumes: `HostMetadata` from Task 1.
- Produces: `type LifecyclePhase`, `interface LifecycleSample`, `interface ScenarioResult`, `interface LifecycleReport`, `function percentile(values: readonly number[], rank: number): number`, `function summarize(scenario: string, samples: readonly LifecycleSample[], contextBytes: number, dispatches: number): ScenarioResult`.

- [ ] **Step 1: Write the failing test**

```ts
import { strictEqual, throws } from 'node:assert/strict';
import { test } from 'node:test';
import { percentile, summarize, type LifecycleSample } from './lifecycle';

function sample(durationMs: number): LifecycleSample {
  return {
    scenario: 's',
    phase: 'routing',
    durationMs,
    tokensIn: null,
    tokensOut: null,
    costMicros: null,
    cacheHit: null,
    retries: 0,
  };
}

test('percentile uses nearest-rank on the sorted values', () => {
  const values = [10, 20, 30, 40];
  strictEqual(percentile(values, 50), 20);
  strictEqual(percentile(values, 95), 40);
  strictEqual(percentile(values, 100), 40);
});

test('percentile of a single value is that value', () => {
  strictEqual(percentile([7], 50), 7);
  strictEqual(percentile([7], 95), 7);
});

test('percentile refuses an empty series rather than inventing a zero', () => {
  throws(() => percentile([], 50), /no samples/);
});

test('summarize reports both percentiles and carries the inputs it was given', () => {
  const result = summarize('direct-edit-warm', [sample(10), sample(20), sample(30)], 28019, 0);
  strictEqual(result.scenario, 'direct-edit-warm');
  strictEqual(result.p50Ms, 20);
  strictEqual(result.p95Ms, 30);
  strictEqual(result.contextBytes, 28019);
  strictEqual(result.dispatches, 0);
  strictEqual(result.samples.length, 3);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc -p tsconfig.json && cd build && node --test bench/lifecycle.test.js`
Expected: compilation fails with `Cannot find module './lifecycle'`.

- [ ] **Step 3: Write the implementation**

```ts
import { KernelError } from '../lib/json';
import type { HostMetadata } from './host';

// The four phases a task's wall-clock divides into. Reporting one total hides
// which half is slow, which is the failure the existing five-budget bench has:
// it measures kernel internals and says nothing about a completed task.
export type LifecyclePhase = 'routing' | 'execution' | 'integration' | 'verification';

// `null` means NOT OBSERVED, and is the only honest value where the measuring
// process cannot see the number. A zero here would read as "free", which is the
// exact defect this schema exists to remove from the agent spans.
export interface LifecycleSample {
  scenario: string;
  phase: LifecyclePhase;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costMicros: number | null;
  cacheHit: boolean | null;
  retries: number;
}

export interface ScenarioResult {
  scenario: string;
  p50Ms: number;
  p95Ms: number;
  dispatches: number;
  contextBytes: number;
  samples: LifecycleSample[];
}

export interface LifecycleReport {
  host: HostMetadata;
  scenarios: ScenarioResult[];
}

// Nearest-rank, which needs no interpolation and therefore always returns a
// value that was actually measured. With few samples an interpolated p95 is a
// number no run produced, and a budget asserted against it is asserted against
// a fiction.
export function percentile(values: readonly number[], rank: number): number {
  if (values.length === 0) throw new KernelError('a percentile has no samples to rank');
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((rank / 100) * sorted.length) - 1;
  const clamped = Math.min(Math.max(index, 0), sorted.length - 1);
  const value = sorted[clamped];
  // noUncheckedIndexedAccess: the clamp guarantees the index is in range, but
  // the type does not, and an assertion here would be the `as` the rules forbid.
  if (value === undefined) throw new KernelError('a percentile index fell outside its own series');
  return value;
}

export function summarize(
  scenario: string,
  samples: readonly LifecycleSample[],
  contextBytes: number,
  dispatches: number,
): ScenarioResult {
  const durations = samples.map((entry) => entry.durationMs);
  return {
    scenario,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    dispatches,
    contextBytes,
    samples: samples.map((entry) => ({ ...entry })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc -p tsconfig.json && cd build && node --test bench/lifecycle.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/bench/lifecycle.ts src/bench/lifecycle.test.ts
git commit -m "feat(bench): add the lifecycle sample schema and its statistics"
```

---

## Task 3: Lifecycle scenarios

Six scenarios, each a real hook invocation driven through the existing `BenchDeps.spawn` seam. These are the paths measurable TODAY. Execution, integration and model phases record `null` tokens and cost until Wave 3's scheduler and a model-owning runner can supply them — an unknown recorded as unknown, not a zero.

**Files:**
- Create: `src/bench/scenarios.ts`
- Test: `src/bench/scenarios.test.ts`

**Interfaces:**
- Consumes: `LifecycleSample`, `LifecyclePhase` from Task 2; `BenchDeps`, `TimedCommand`, `medianMs`, `runOnce` from `src/bench/measure.ts`.
- Produces: `interface Scenario`, `const SCENARIOS: readonly Scenario[]`, `function runScenario(scenario: Scenario, root: string, env: NodeJS.ProcessEnv, deps: BenchDeps): LifecycleSample[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import type { BenchDeps } from './measure';
import { runScenario, SCENARIOS } from './scenarios';

function fakeDeps(spawned: string[][]): BenchDeps {
  let clock = 0;
  return {
    spawn: (command, args) => {
      spawned.push([command, ...args]);
      return { status: 0, signal: null };
    },
    now: () => (clock += 5),
    mkdtemp: () => '/tmp/engineos-bench-fake',
  };
}

test('every scenario declares a phase and a stable name', () => {
  const names = SCENARIOS.map((entry) => entry.name);
  strictEqual(new Set(names).size, names.length);
  strictEqual(SCENARIOS.every((entry) => entry.samples > 0), true);
});

test('the warm edit scenario spawns the route hook and records a routing sample', () => {
  const spawned: string[][] = [];
  const scenario = SCENARIOS.find((entry) => entry.name === 'direct-edit-warm');
  if (scenario === undefined) throw new Error('direct-edit-warm is missing');
  const samples = runScenario(scenario, '/repo', {}, fakeDeps(spawned));
  strictEqual(samples.length, scenario.samples);
  strictEqual(samples.every((entry) => entry.phase === 'routing'), true);
  strictEqual(spawned.length > 0, true);
  strictEqual(spawned.every((argv) => argv[0]?.includes('route-before-change') === true), true);
});

test('scenarios record unobserved usage as null, never as zero', () => {
  const scenario = SCENARIOS[0];
  if (scenario === undefined) throw new Error('no scenarios');
  const samples = runScenario(scenario, '/repo', {}, fakeDeps([]));
  deepStrictEqual(
    samples.map((entry) => [entry.tokensIn, entry.tokensOut, entry.costMicros]),
    samples.map(() => [null, null, null]),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc -p tsconfig.json && cd build && node --test bench/scenarios.test.js`
Expected: compilation fails with `Cannot find module './scenarios'`.

- [ ] **Step 3: Write the implementation**

```ts
import { join } from 'node:path';
import type { LifecyclePhase, LifecycleSample } from './lifecycle';
import { medianMs, runOnce, type BenchDeps, type TimedCommand } from './measure';

const PROMPT = 'add a paginated orders endpoint and mirror the screen to mobile';
const SESSION_ID = 'lifecycle-benchmark';

// A scenario is one observable segment of a real task's lifecycle. `warm`
// declares whether a discarded run precedes the samples: a cache-hit path that
// measured its own cold first call would report the miss as the hit.
export interface Scenario {
  name: string;
  phase: LifecyclePhase;
  samples: number;
  warm: boolean;
  hook: string;
  payload: (target: string) => string;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'prompt-routing',
    phase: 'routing',
    samples: 5,
    warm: false,
    hook: 'hooks/prompt-advisor.sh',
    payload: () => JSON.stringify({ prompt: PROMPT, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'direct-edit-cold',
    phase: 'routing',
    samples: 5,
    warm: false,
    hook: 'hooks/route-before-change.sh',
    payload: (target) => JSON.stringify({ tool_input: { file_path: target }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'direct-edit-warm',
    phase: 'routing',
    samples: 7,
    warm: true,
    hook: 'hooks/route-before-change.sh',
    payload: (target) => JSON.stringify({ tool_input: { file_path: target }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'agent-dispatch',
    phase: 'execution',
    samples: 5,
    warm: false,
    hook: 'hooks/announce-agent-dispatch.sh',
    payload: () => JSON.stringify({ tool_input: { subagent_type: 'backend-coordinator' }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'agent-return',
    phase: 'integration',
    samples: 5,
    warm: false,
    hook: 'hooks/announce-agent-return.sh',
    payload: () => JSON.stringify({ tool_input: { subagent_type: 'backend-coordinator' }, cwd: '/tmp', session_id: SESSION_ID }),
  },
  {
    name: 'final-gate',
    phase: 'verification',
    samples: 3,
    warm: false,
    hook: 'hooks/stop-verify.sh',
    payload: () => JSON.stringify({ cwd: '/tmp', session_id: SESSION_ID }),
  },
];

export function runScenario(
  scenario: Scenario,
  root: string,
  env: NodeJS.ProcessEnv,
  deps: BenchDeps,
): LifecycleSample[] {
  const target = join(root, 'src', 'Button.tsx');
  const command: TimedCommand = {
    command: [join(root, scenario.hook)],
    stdin: scenario.payload(target),
    env: hookEnv(env),
    samples: 1,
  };
  if (scenario.warm) runOnce(command, deps);
  const samples: LifecycleSample[] = [];
  for (let i = 0; i < scenario.samples; i += 1) {
    samples.push({
      scenario: scenario.name,
      phase: scenario.phase,
      durationMs: medianMs(command, deps),
      // Not observed by a hook-spawning benchmark. Wave 3's scheduler and a
      // model-owning runner supply these; until then the honest value is null.
      tokensIn: null,
      tokensOut: null,
      costMicros: null,
      cacheHit: scenario.warm ? true : null,
      retries: 0,
    });
  }
  return samples;
}

// The same pinning the five-budget bench uses: an operator's real bypass flag
// would measure a no-op, and telemetry would measure a disk write nobody
// budgeted for.
function hookEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass', ENGINEOS_TELEMETRY: '0' };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc -p tsconfig.json && cd build && node --test bench/scenarios.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/bench/scenarios.ts src/bench/scenarios.test.ts
git commit -m "feat(bench): drive the six measurable lifecycle scenarios"
```

---

## Task 4: Baseline read, write and comparison

**Files:**
- Create: `src/bench/baseline.ts`, `docs/perf/baselines/.gitkeep`
- Test: `src/bench/baseline.test.ts`

**Interfaces:**
- Consumes: `HostMetadata`, `hostId` from Task 1; `LifecycleReport`, `ScenarioResult` from Task 2.
- Produces: `interface BaselineIo`, `interface Regression`, `function baselinePath(root: string, meta: HostMetadata): string`, `function writeBaseline(io: BaselineIo, root: string, report: LifecycleReport): string`, `function readBaseline(io: BaselineIo, root: string, meta: HostMetadata): LifecycleReport | null`, `function compare(current: LifecycleReport, baseline: LifecycleReport, tolerance: number): Regression[]`.

**`readBaseline` is the single baseline read path for the whole program** (program plan, reconciliation R4). Waves 5 and 6 both need to read this host's baseline; without a named contract one globbed `docs/perf/baselines/*.json` and the other parsed the JSON directly, neither sharing the `hostId()` derivation. They call `readBaseline` instead. A consumer that cannot import it — a shell step — resolves the path with `baselinePath()` rather than globbing. Do not let this export drift.

- [ ] **Step 1: Write the failing test**

```ts
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { baselinePath, compare, readBaseline, writeBaseline, type BaselineIo } from './baseline';
import type { HostMetadata } from './host';
import type { LifecycleReport } from './lifecycle';

const host: HostMetadata = {
  platform: 'darwin',
  cpuModel: 'Apple M2 Pro',
  cpuCount: 2,
  nodeVersion: 'v22.11.0',
  engineosVersion: '2.0.0',
};

function report(p50: number): LifecycleReport {
  return { host, scenarios: [{ scenario: 'direct-edit-warm', p50Ms: p50, p95Ms: p50 + 10, dispatches: 0, contextBytes: 100, samples: [] }] };
}

function memoryIo(): BaselineIo & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    read: (path) => files.get(path) ?? null,
    write: (path, text) => { files.set(path, text); },
  };
}

test('a baseline round-trips through the host-named file', () => {
  const io = memoryIo();
  const path = writeBaseline(io, '/repo', report(50));
  strictEqual(path, baselinePath('/repo', host));
  deepStrictEqual(readBaseline(io, '/repo', host), report(50));
});

test('a missing baseline reads as null rather than an invented zero', () => {
  strictEqual(readBaseline(memoryIo(), '/repo', host), null);
});

test('compare reports a scenario that regressed past the tolerance', () => {
  const found = compare(report(120), report(100), 0.1);
  strictEqual(found.length, 1);
  strictEqual(found[0]?.scenario, 'direct-edit-warm');
});

test('compare accepts a scenario inside the tolerance', () => {
  deepStrictEqual(compare(report(105), report(100), 0.1), []);
});

test('compare reports a scenario the baseline does not contain as unmeasured', () => {
  const current: LifecycleReport = { host, scenarios: [{ scenario: 'new-path', p50Ms: 1, p95Ms: 1, dispatches: 0, contextBytes: 0, samples: [] }] };
  strictEqual(compare(current, report(100), 0.1)[0]?.reason, 'no-baseline');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc -p tsconfig.json && cd build && node --test bench/baseline.test.js`
Expected: compilation fails with `Cannot find module './baseline'`.

- [ ] **Step 3: Write the implementation**

```ts
import { join } from 'node:path';
import { KernelError } from '../lib/json';
import { hostId, type HostMetadata } from './host';
import type { LifecycleReport } from './lifecycle';

// Injected so a test drives the whole ladder without touching a disk, matching
// the seam BenchDeps already establishes for spawning.
export interface BaselineIo {
  read: (path: string) => string | null;
  write: (path: string, text: string) => void;
}

export interface Regression {
  scenario: string;
  reason: 'slower' | 'no-baseline';
  currentP50Ms: number;
  baselineP50Ms: number | null;
}

export function baselinePath(root: string, meta: HostMetadata): string {
  return join(root, 'docs', 'perf', 'baselines', `${hostId(meta)}.json`);
}

export function writeBaseline(io: BaselineIo, root: string, report: LifecycleReport): string {
  const path = baselinePath(root, report.host);
  io.write(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

export function readBaseline(io: BaselineIo, root: string, meta: HostMetadata): LifecycleReport | null {
  const text = io.read(baselinePath(root, meta));
  if (text === null) return null;
  try {
    // The file is written by this module, so a parse failure means it was
    // hand-edited or truncated. Refusing beats silently measuring against a
    // half-read baseline and reporting green.
    return JSON.parse(text) as LifecycleReport;
  } catch {
    throw new KernelError(`${baselinePath(root, meta)} is not valid JSON — re-record it with 'engineos bench baseline --write'`);
  }
}

// Relative, never absolute: the spec's targets are ratios against the baseline
// recorded on the same host, so a slower CI box does not fail a change that
// made nothing slower.
export function compare(current: LifecycleReport, baseline: LifecycleReport, tolerance: number): Regression[] {
  const previous = new Map(baseline.scenarios.map((entry) => [entry.scenario, entry.p50Ms]));
  const found: Regression[] = [];
  for (const scenario of current.scenarios) {
    const before = previous.get(scenario.scenario);
    if (before === undefined) {
      found.push({ scenario: scenario.scenario, reason: 'no-baseline', currentP50Ms: scenario.p50Ms, baselineP50Ms: null });
      continue;
    }
    if (scenario.p50Ms > before * (1 + tolerance)) {
      found.push({ scenario: scenario.scenario, reason: 'slower', currentP50Ms: scenario.p50Ms, baselineP50Ms: before });
    }
  }
  return found;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc -p tsconfig.json && cd build && node --test bench/baseline.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Create the baseline directory so a fresh clone has it**

```bash
mkdir -p docs/perf/baselines && touch docs/perf/baselines/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
git add src/bench/baseline.ts src/bench/baseline.test.ts docs/perf/baselines/.gitkeep
git commit -m "feat(bench): record and compare per-host lifecycle baselines"
```

---

## Task 5: The `bench lifecycle` and `bench baseline` subcommands

**Files:**
- Modify: `src/bench/run.ts` (the `runBench` entry, currently ignoring its `_argv`)
- Modify: `src/bench/run.test.ts`
- Modify: `docs/COMPATIBILITY.md`

**Interfaces:**
- Consumes: `SCENARIOS`, `runScenario` (Task 3); `summarize`, `LifecycleReport` (Task 2); `collectHost` (Task 1); `writeBaseline`, `readBaseline`, `compare` (Task 4).
- Produces: `engineos bench lifecycle` and `engineos bench baseline --write`, both routed from the existing `runBench(argv, io, deps)` signature. The bare `engineos bench` behavior is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/bench/run.test.ts`. That file already provides `fixtureRoot(t)`, `harness(root, values, failing?)` returning `{ deps }`, `durations()`, and `run(root, deps, env)` which calls `runBench([], io, deps)` with a hardcoded empty argv. Add an argv-aware sibling beside `run` rather than changing it, because the existing tests assert on the bare invocation:

```ts
function runArgv(root: string, argv: string[], deps: BenchDeps, env: NodeJS.ProcessEnv = {}): { status: number; stdout: string; stderr: string } {
  const io = memoryIo({ env: { ...env, ENGINEOS_ROOT: root }, cwd: root });
  const status = runBench(argv, io, deps);
  return { status, stdout: io.stdout(), stderr: io.stderr() };
}

test('a bare bench invocation still prints the five budget lines', (t) => {
  const { root } = fixtureRoot(t);
  const { deps } = harness(root, durations());
  assert.equal(run(root, deps).stdout.includes('== EngineOS runtime budgets =='), true);
});

test('bench lifecycle prints a scenario line per measured scenario', (t) => {
  const { root } = fixtureRoot(t);
  const { deps } = harness(root, durations());
  const result = runArgv(root, ['lifecycle'], deps);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes('== EngineOS task lifecycle =='), true);
  assert.equal(result.stdout.includes('direct-edit-warm'), true);
});

test('bench baseline refuses to compare when no baseline exists for this host', (t) => {
  const { root } = fixtureRoot(t);
  const { deps } = harness(root, durations());
  const result = runArgv(root, ['baseline'], deps);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes('no baseline'), true);
});

test('an unknown bench subcommand is refused rather than silently running the budgets', (t) => {
  const { root } = fixtureRoot(t);
  const { deps } = harness(root, durations());
  const result = runArgv(root, ['nonsense'], deps);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes('nonsense'), true);
  assert.equal(result.stdout.includes('== EngineOS runtime budgets =='), false);
});
```

`harness` feeds a fixed clock through `durations()`; the lifecycle scenarios consume more samples than the five budgets do, so extend the values `durations()` returns (or pass a longer array through `harness`) until the fake clock has one reading per timed run. The compiler will not catch a short array — a scenario that runs out of clock readings fails at assertion time with a `NaN` duration, so check the first run's output before moving on.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc -p tsconfig.json && cd build && node --test bench/run.test.js`
Expected: FAIL — `runBench(['lifecycle'], ...)` currently ignores `_argv` and prints the five budget lines, so the lifecycle and refusal assertions fail.

- [ ] **Step 3: Write the implementation**

In `src/bench/run.ts`, rename the ignored parameter and add subcommand dispatch at the top of `runBench`, before the existing body runs:

```ts
export function runBench(argv: string[], io: Io, deps: BenchDeps = DEFAULT_DEPS): number {
  const sub = argv[0];
  // An unknown subcommand is refused rather than falling through to the five
  // budgets: silently measuring something the caller did not ask for is how a
  // typo becomes a green CI step that proves nothing.
  if (sub !== undefined) {
    if (sub === 'lifecycle') return runLifecycle(io, deps);
    if (sub === 'baseline') return runBaseline(argv.slice(1), io, deps);
    io.err(`unknown bench subcommand: ${sub}\n`);
    return 1;
  }
  // ... existing five-budget body, unchanged ...
}
```

Then add the two handlers in the same file:

```ts
function lifecycleReport(root: string, env: NodeJS.ProcessEnv, deps: BenchDeps): LifecycleReport {
  const host = collectHost(DEFAULT_HOST_DEPS, ENGINEOS_VERSION);
  const contextBytes = alwaysOnBytes(root);
  const scenarios = SCENARIOS.map((scenario) =>
    summarize(scenario.name, runScenario(scenario, root, env, deps), contextBytes, 0),
  );
  return { host, scenarios };
}

function runLifecycle(io: Io, deps: BenchDeps): number {
  try {
    const root = resolveRoot(io.env);
    const report = lifecycleReport(root, io.env, deps);
    const lines = ['== EngineOS task lifecycle =='];
    for (const scenario of report.scenarios) {
      lines.push(`${scenario.scenario} p50=${scenario.p50Ms.toFixed(1)}ms p95=${scenario.p95Ms.toFixed(1)}ms`);
    }
    io.out(`${lines.join('\n')}\n`);
    return 0;
  } catch (e) {
    if (e instanceof KernelError) {
      io.err(`${e.message}\n`);
      return 1;
    }
    throw e;
  }
}

function runBaseline(argv: string[], io: Io, deps: BenchDeps): number {
  try {
    const root = resolveRoot(io.env);
    const report = lifecycleReport(root, io.env, deps);
    if (argv.includes('--write')) {
      io.out(`${writeBaseline(fileBaselineIo(), root, report)}\n`);
      return 0;
    }
    const baseline = readBaseline(fileBaselineIo(), root, report.host);
    if (baseline === null) {
      io.err(`no baseline for this host — record one with 'engineos bench baseline --write'\n`);
      return 1;
    }
    const found = compare(report, baseline, BASELINE_TOLERANCE);
    for (const regression of found) {
      io.err(`${regression.scenario}: ${regression.reason} (${regression.currentP50Ms.toFixed(1)}ms vs ${regression.baselineP50Ms === null ? 'none' : `${regression.baselineP50Ms.toFixed(1)}ms`})\n`);
    }
    return found.length === 0 ? 0 : 1;
  } catch (e) {
    if (e instanceof KernelError) {
      io.err(`${e.message}\n`);
      return 1;
    }
    throw e;
  }
}
```

Add the supporting constants and the file-backed `BaselineIo` in the same file:

```ts
// 10% over the recorded p50 before a scenario counts as regressed. Tighter than
// this and ordinary host noise fails CI; looser and a real regression lands.
const BASELINE_TOLERANCE = 0.1;

const DEFAULT_HOST_DEPS: HostDeps = {
  platform: () => platform(),
  cpus: () => cpus().map((cpu) => ({ model: cpu.model })),
  nodeVersion: () => process.version,
};

function fileBaselineIo(): BaselineIo {
  return {
    read: (path) => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
    write: (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
  };
}
```

Extend the existing imports in `src/bench/run.ts` — one statement per module, so fold the new `node:fs` names into the existing `node:fs` import rather than adding a second one, and add single statements for `node:os`, `node:path`'s `dirname`, and the four new local modules. `ENGINEOS_VERSION` is the esbuild define already used by the bundle.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc -p tsconfig.json && cd build && node --test bench/run.test.js`
Expected: PASS, including the pre-existing tests for the bare invocation.

- [ ] **Step 5: Record the new public surface**

Add to `docs/COMPATIBILITY.md`, in the section where the existing `engineos bench` entry lives, following that entry's format exactly:

- `engineos bench lifecycle` — added in 2.0. Prints one `p50`/`p95` line per lifecycle scenario. Scenario names are public surface.
- `engineos bench baseline [--write]` — added in 2.0. Without `--write`, compares this host's current run to `docs/perf/baselines/<host-id>.json` and exits 1 on a regression past 10%. With `--write`, records the baseline.
- `engineos bench <unknown>` — now exits 1. Before 2.0 any argument was ignored and the five budgets ran.

- [ ] **Step 6: Rebuild and commit**

```bash
npm run build
git add src/bench/run.ts src/bench/run.test.ts docs/COMPATIBILITY.md dist/engineos.cjs
git commit -m "feat(bench): add the lifecycle and baseline subcommands"
```

---

## Task 6: Telemetry stops reporting unknown token counts as zero

This is the honesty half of Wave 1. `src/hooks/announce-agent-return.ts` currently writes `tokens_in: 0` / `tokens_out: 0` because the hook cannot observe a subagent's usage, and `rules/observability.md` warns readers in prose not to read those zeros as free. Prose is the wrong place for that guarantee: the schema already supports `presence: 'always'`, which emits JSON `null` for an unset field.

**Files:**
- Modify: `src/journal/schema.ts` (the `tokens_in` and `tokens_out` rows of `EXEC_JOURNAL_FIELDS`)
- Modify: `src/journal/schema.test.ts`
- Modify: `src/hooks/telemetry.ts` (the zero defaults)
- Modify: `src/hooks/announce-agent-return.ts` (the comment at ~line 50 that documents the zeros)
- Modify: `rules/observability.md` ("Agent traces", the "Who writes what" bullet)
- Modify: `docs/COMPATIBILITY.md`

**Interfaces:**
- Consumes: the existing `FieldSpec` / `Presence` types in `src/journal/schema.ts`.
- Produces: no new exported symbol. The change is the emitted JSON: an unset `tokens_in` / `tokens_out` is `null`, not `0`.

- [ ] **Step 1: Write the failing test**

Append to `src/journal/schema.test.ts`:

```ts
test('tokens are always-present so an unobserved count emits null, not zero', () => {
  const tokensIn = EXEC_JOURNAL_FIELDS.find((spec) => spec.name === 'tokens_in');
  const tokensOut = EXEC_JOURNAL_FIELDS.find((spec) => spec.name === 'tokens_out');
  assert.equal(tokensIn?.presence, 'always');
  assert.equal(tokensOut?.presence, 'always');
});
```

That file imports `assert from 'node:assert/strict'` and already imports `EXEC_JOURNAL_FIELDS`, so no import change is needed.

The second failing test already exists. `src/hooks/announce-agent-return.test.ts`, in the test named `a dispatch/return pair writes exactly one valid agent span`, asserts the whole recorded row with `assert.deepEqual`, including:

```ts
    tokens_in: 0,
    tokens_out: 0,
```

Change those two lines in that assertion to the honest values, which makes it the failing test for this task:

```ts
    tokens_in: null,
    tokens_out: null,
```

Do not add a parallel test with a different fixture — that file drives a real dispatch/return pair to a real journal file through `project(t)` and `validateFile`, and a second harness asserting the same behavior would drift from it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsc -p tsconfig.json && cd build && node --test journal/schema.test.js hooks/announce-agent-return.test.js`
Expected: FAIL — `presence` is `'required'`, and the span carries `tokens_in: 0`.

- [ ] **Step 3: Write the implementation**

In `src/journal/schema.ts`, change the two rows:

```ts
  { name: 'tokens_in', flag: '--tokens-in', guard: 'int', json: 'number', presence: 'always' },
  { name: 'tokens_out', flag: '--tokens-out', guard: 'int', json: 'number', presence: 'always' },
```

`presence: 'always'` is already handled: `src/journal/exec-journal.ts:197` emits `null` for an unset always-field, and its guard at line 246 lets a non-required field be absent or null. No change is needed in that file.

Then remove the zero defaults in `src/hooks/telemetry.ts` so an unset count stays unset, and replace the comment block in `src/hooks/announce-agent-return.ts` (~line 50):

```ts
      // tokens_in/tokens_out are UNSET, and the schema emits them as null:
      // this hook never sees the subagent's usage. A zero here would read as
      // "free" to every consumer, which is the reading rules/observability.md
      // used to have to warn about in prose.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsc -p tsconfig.json && cd build && node --test journal/schema.test.js hooks/announce-agent-return.test.js`
Expected: PASS.

- [ ] **Step 5: Update the prose that promised the old behavior**

In `rules/observability.md`, "Agent traces", the "Who writes what" bullet currently reads that the hooks write agent spans with "`tokens_*` are 0 there because the hook cannot see the subagent's usage; do not read 0 as free". Replace it with:

> Who writes what: the dispatch/return hooks write `agent` spans (duration and
> status only — `tokens_in` and `tokens_out` are emitted as `null`, because the
> hook cannot observe the subagent's usage; a null is an unknown, never a zero).
> The prompt advisor writes `router`; the Stop gate writes `verification`. `tool`
> and `model` spans, and real token and cost figures, come from a headless runner
> that owns the model call.

- [ ] **Step 6: Record the surface change**

Add to `docs/COMPATIBILITY.md`, beside the existing exec-journal schema entry:

- Exec-journal `tokens_in` / `tokens_out` — changed in 2.0 from `required` to `always`. An unset count now emits JSON `null` instead of `0`. Consumers that summed these fields were summing fabricated zeros; they must now treat `null` as unknown.

- [ ] **Step 7: Run the full validator and commit**

```bash
npm run build && node dist/engineos.cjs validate
git add src/journal/schema.ts src/journal/schema.test.ts src/hooks/telemetry.ts src/hooks/announce-agent-return.ts src/hooks/announce-agent-return.test.ts rules/observability.md docs/COMPATIBILITY.md dist/engineos.cjs
git commit -m "fix(telemetry): emit unobserved token counts as null instead of zero"
```

---

## Task 7: Record this host's baseline and close the wave

**Files:**
- Create: `docs/perf/baselines/<host-id>.json` (generated — the exact name comes from the command)
- Create: `.engineos/changes/<date>-engineos-2-w1-measurement.md` handoff section per `templates/handoff.md`

**Interfaces:**
- Consumes: everything Tasks 1-6 produced.
- Produces: the baseline file Waves 5 and 6 read. Their acceptance tasks name this path; do not hardcode any number from it anywhere else.

- [ ] **Step 1: Run the whole gate**

```bash
npm run build && npm run typecheck && npm test && node dist/engineos.cjs validate
```
Expected: all green, output shown. A red result is a fix loop, not a note.

- [ ] **Step 2: Record the baseline**

```bash
node dist/engineos.cjs bench baseline --write
```
Expected: one line, the path of the file just written under `docs/perf/baselines/`.

- [ ] **Step 3: Verify the comparison path is green against the file just written**

```bash
node dist/engineos.cjs bench baseline
```
Expected: exit 0, no output. A regression line here immediately after a write means the measurement is not reproducible on this host — investigate before committing, do not raise the tolerance.

- [ ] **Step 4: Commit the baseline**

```bash
git add docs/perf/baselines
git commit -m "chore(bench): record the reference-host lifecycle baseline"
```

- [ ] **Step 5: Write the wave handoff**

Write the handoff per `templates/handoff.md` into the wave's change record. It must name: the baseline file path and the host it describes; the scenario names, which are now public surface; the fact that `tokensIn`/`tokensOut`/`costMicros` are `null` in every scenario until Wave 3 and a model-owning runner supply them; and the F6 type names Waves 5, 6 and 7 code against. It must also name `readBaseline` and `baselinePath` as the only sanctioned ways to reach a baseline, per R4.

- [ ] **Step 6: Commit the handoff**

```bash
git add .engineos/changes
git commit -m "docs(changes): hand off wave 1 measurement contract"
```

---

## KPI coverage, and what this wave cannot measure yet

The spec names nine KPIs. This wave delivers the schema for all of them and the measurement for those observable without a scheduler or a model-owning runner. The rest are recorded as `null` — unknown, never zero — and filled by a later wave.

| KPI | Wave 1 status | Filled by |
|---|---|---|
| End-to-end p50/p95 per scenario | measured | — |
| Time in routing / execution / integration / verification | measured, per `LifecyclePhase` | — |
| Context bytes per adapter | measured via `alwaysOnBytes` | Wave 4 adds the Codex corpus to it |
| Agent dispatches per completed task | schema field `dispatches`, recorded as 0 by hook-only scenarios | Wave 3 |
| Model tokens in / out | `null` | a model-owning runner |
| Cost | `null` | a model-owning runner |
| Cache hits | measured for the warm scenario, `null` elsewhere | Wave 5 |
| Retries | schema field `retries`, 0 in hook-only scenarios | Wave 3 |
| Queue / admission delay | **not in F6** | Wave 3 |

**Queue delay is a sanctioned additive extension.** `LifecycleSample` has no queue field because nothing in the runtime owns a queue until Wave 3 builds the scheduler. Wave 3 may add `queueDelayMs: number | null` to `LifecycleSample` as an optional additive field; that is not a break of F6, and it needs no orchestrator round-trip. Wave 3 may not change or remove any field F6 already declares.

**Time to first useful edit** is the one KPI no scenario here approximates honestly. `prompt-routing` plus `direct-edit-cold` measure the routing share of it; the rest is model time this process cannot see. Do not report their sum as time-to-first-edit.

---

## Barrier exit criteria

Wave 1 is complete when all of these hold:

- [ ] Tasks 1-7 checked off, each with its own commit.
- [ ] `npm run build && npm run typecheck && npm test` green, output shown.
- [ ] `node dist/engineos.cjs validate` green.
- [ ] `dist/engineos.cjs` rebuilt and committed.
- [ ] `docs/COMPATIBILITY.md` carries the two new subcommands, the unknown-subcommand refusal, and the exec-journal presence change.
- [ ] A baseline file exists for the reference host.
- [ ] The handoff is written.

**No behavior change beyond telemetry honesty.** If any task in this wave changed routing, execution or verification behavior, that is scope creep — revert it and report it to the orchestrator.
