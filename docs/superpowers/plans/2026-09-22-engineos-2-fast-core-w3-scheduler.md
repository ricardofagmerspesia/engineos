# EngineOS 2.0 Fast Core — Wave 3: Scheduler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make admission, dependency release, retry and breaker state operational through a deterministic scheduler whose launch boundary is supplied by the host adapter — closing the gap `docs/METHODOLOGY.md` admits today ("nothing in the repo calls `admit` before a dispatch"), without inventing an enforcement claim no adapter can honor.

**Architecture:** `src/scheduler/` is four modules with one responsibility each. `state.ts` is a registry-free pure state machine over `UnitState`; it answers launches, defers and halts from state alone. `policy.ts` is the only module that reads registries: it asks the existing kernel sections (`admitSection`, `repairSection`, `breakerSection`) and reshapes the pure actions from their answers, so no threshold is restated. `launcher.ts` is the host boundary — types plus capacity resolution plus a deterministic `FakeLauncher`; nothing in `src/scheduler/` starts a process. `parse.ts` validates the JSON the CLI arms receive, and `cli.ts` registers `scheduler plan` and `scheduler step` in the existing entry-point `CommandTable`.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), esbuild to the committed CJS bundle, JSON registries, Node built-in test runner (`node --test`), node >= 18.

**Spec:** [docs/specs/2026-09-22-engineos-2-fast-core-design.md](../../specs/2026-09-22-engineos-2-fast-core-design.md) section "3. Stateful scheduler with host launch boundary"

**Program plan:** [2026-09-22-engineos-2-fast-core-00-program.md](2026-09-22-engineos-2-fast-core-00-program.md) — frozen interfaces F1, F3, F4, F7 are consumed verbatim here.

**Depends on:** Wave 2. `ExecutionUnit` is F1's type and lives in `src/kernel/execution.ts`; this wave imports it and never redeclares it. Do not start Task 1 until `src/kernel/execution.ts` exports `ExecutionUnit`.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the repository, the program plan and the spec.

- Node floor: `>=18` (`package.json` engines).
- TypeScript is `strict` with `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`. `rootDir: src`, `outDir: build`.
  - `noUncheckedIndexedAccess` means `array[i]` is `T | undefined` and `record[key]` is `V | undefined`. Narrow or default every indexed read; never index and use in one expression.
  - `exactOptionalPropertyTypes` means an optional property may not be assigned `undefined`. Build objects with optional fields the way `src/kernel/cli.ts` does in `breakerProjection`: declare the required fields in the literal, then `if (value !== undefined) facts.field = value;`.
- No `any`. Unknown input is `unknown`, narrowed immediately. **No type assertions (`as`) to silence an error** — when a literal needs to be a union member, annotate a `const` with the union type instead of asserting it.
- One `import` statement per module — never split symbols from the same source across lines.
- `Number.parseInt` / `Number.parseFloat`, never the globals.
- Explicit return types on every exported function.
- **`apply` returns a new state and never mutates its argument** (F3). Every unit object in the returned state is a fresh object; arrays are copied, never spliced. `nextActions` is pure and idempotent for a given state, and sorts copies — never the caller's array.
- Tests are colocated: `src/scheduler/<name>.test.ts` beside `src/scheduler/<name>.ts`. E2E tests are `*.e2e.test.ts`.
- Commands: build `npm run build`; typecheck `npm run typecheck`; lint `npm run lint` (same tsc invocation); full suite `npm test`.
- Single test file: `npx tsc -p tsconfig.json && cd build && node --test scheduler/state.test.js` — the compiled path drops the `src/` prefix because `rootDir` is `src`.
- Validator: `node dist/engineos.cjs validate` must pass.
- `dist/engineos.cjs` is a committed build artifact. Tasks 1-6 add modules that nothing reachable from `src/cli.ts` imports, so the bundle is byte-identical until Task 7 registers the command — **rebuild and commit the bundle in Task 7, and in Task 7 only**. Its diff is generated output and is excluded from the 400-line PR count, per `rules/git.md`'s codegen carve-out; call it out in the PR description.
- All identifiers, comments and messages in English. No emojis anywhere. Comments say WHY, never WHAT.
- No placeholders, stubs or fake data on any reachable path. `FakeLauncher` is test-only and says so in its `note` on every outcome, so a fake launch can never be read as a real one.
- Conventional Commits. PRs at most 400 lines changed excluding generated output.
- Public surface changes follow `docs/COMPATIBILITY.md`, updated in the same task that introduces the surface (F7).
- Kernel refusal style: an impossible or contradictory fact combination throws `KernelError` (from `src/lib/json.ts`) with a sentence naming both facts. Never fabricate a default for a missing fact.
- **The scheduler restates no threshold.** The wave cap, the queue bound, the fix-attempt bound, the escalation count, the breaker threshold and the cooldown are registry data answered by `src/kernel/{admit,repair,breaker}.ts`. `src/scheduler/` calls those sections and reads their answers; a number from `registries/policy.json` appearing as a literal in `src/scheduler/` is a defect.

---

## File Structure

| File | Created or modified | Single responsibility |
|---|---|---|
| `src/scheduler/state.ts` | created (Tasks 1-3) | F3's types plus `initialState`, `apply`, `nextActions`. Registry-free, pure, no I/O. |
| `src/scheduler/state.test.ts` | created (Tasks 1-3) | Table-driven transition and action cases; immutability. |
| `src/scheduler/launcher.ts` | created (Task 4) | F4's boundary types, `resolveCapacity` (`Math.min` plus the honest unknown), `fakeLauncher`. |
| `src/scheduler/launcher.test.ts` | created (Task 4) | Capacity-resolution table; `FakeLauncher` determinism. |
| `src/scheduler/policy.ts` | created (Task 5) | The one registry-reading module: wires `admitSection`, `repairSection`, `breakerSection` onto the pure actions. |
| `src/scheduler/policy.test.ts` | created (Task 5) | Decision cases with every threshold derived from the registry. |
| `src/scheduler/parse.ts` | created (Task 6) | Validates `--units`, `--state`, `--event`, `--breaker` JSON into typed facts. |
| `src/scheduler/parse.test.ts` | created (Task 6) | Accepted shapes and every refusal message. |
| `src/scheduler/cli.ts` | created (Task 7) | `scheduler plan` and `scheduler step` arms; JSON answer shape. |
| `src/scheduler/cli.test.ts` | created (Task 7) | In-process arm cases. |
| `src/scheduler/scheduler.e2e.test.ts` | created (Task 7) | Black-box drive of the built bundle, proving registration. |
| `src/scheduler/index.ts` | created (Task 7) | Barrel: the scheduler's public surface for other areas. |
| `src/cli.ts` | modified (Task 7) | Registers `scheduler: runScheduler` in the existing `CommandTable`. |
| `docs/COMPATIBILITY.md` | modified (Task 7) | Declares the two new commands as versioned surface. |
| `dist/engineos.cjs` | rebuilt (Task 7) | Committed build artifact. |
| `templates/adapters/README.md` | modified (Task 8) | Honest per-adapter launch capability — guidance, never a fabricated enforcement claim. |
| `docs/METHODOLOGY.md` | modified (Task 8) | The "nothing calls `admit` before a dispatch" sentence becomes true again. |

---

### Task 1: Unit state model and initial state

**Files:**
- `src/scheduler/state.ts` (created)
- `src/scheduler/state.test.ts` (created)

**Interfaces:**

Consumes (F1, owned by Wave 2, `src/kernel/execution.ts`):
```ts
export interface ExecutionUnit {
  id: string;
  domains: string[];
  files: string[];
  workType: string;
  agent: string | null;
  modelTier: string;
  dependsOn: string[];
}
```

Produces (F3, verbatim):
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
export function requireAgent(unit: { id: string; agent: string | null }): string;
```

- [ ] **Step 1: Write the failing test for `initialState`**

  Create `src/scheduler/state.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { KernelError } from '../lib/json';
  import type { ExecutionUnit } from '../kernel/execution';
  import { initialState } from './state';

  // One fixture for the whole file: a -> b -> c is a three-layer chain and d is
  // independent, so every case can exercise release, blocking and capacity
  // without building a new graph per test.
  function unit(id: string, opts: { dependsOn?: string[]; agent?: string | null; modelTier?: string } = {}): ExecutionUnit {
    return {
      id,
      domains: ['backend'],
      files: [`src/${id}.ts`],
      workType: 'implementation',
      agent: opts.agent === undefined ? 'backend-coordinator' : opts.agent,
      modelTier: opts.modelTier ?? 'build',
      dependsOn: opts.dependsOn ?? [],
    };
  }

  function chain(): ExecutionUnit[] {
    return [unit('a'), unit('b', { dependsOn: ['a'] }), unit('c', { dependsOn: ['b'] }), unit('d')];
  }

  function kernelError(message: string): (error: unknown) => boolean {
    return (error: unknown): boolean => {
      if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
      assert.equal(error.message, message);
      return true;
    };
  }

  test('a unit with no dependencies starts ready and a dependent one starts queued', () => {
    const state = initialState(chain(), 6);
    assert.deepEqual(
      state.units.map((u) => [u.id, u.state]),
      [['a', 'ready'], ['b', 'queued'], ['c', 'queued'], ['d', 'ready']],
    );
    assert.equal(state.capacity, 6);
    assert.equal(state.waveIndex, 0);
    assert.deepEqual(state.units.map((u) => u.attempts), [0, 0, 0, 0]);
  });

  test('the agent and model tier ride through from the execution unit', () => {
    const state = initialState([unit('a', { agent: 'dba-coordinator', modelTier: 'design' })], 1);
    assert.deepEqual(state.units[0]?.agent, 'dba-coordinator');
    assert.deepEqual(state.units[0]?.modelTier, 'design');
  });

  // A host with no free slot is a legal operational state, not a broken plan:
  // every ready unit is deferred rather than launched. A negative one cannot be.
  test('zero capacity is accepted and a negative capacity is refused', () => {
    assert.equal(initialState(chain(), 0).capacity, 0);
    assert.throws(
      () => initialState(chain(), -1),
      kernelError('scheduler capacity must be a whole non-negative number, not -1'),
    );
    assert.throws(
      () => initialState(chain(), 1.5),
      kernelError('scheduler capacity must be a whole non-negative number, not 1.5'),
    );
  });

  test('duplicate unit ids are refused', () => {
    assert.throws(
      () => initialState([unit('a'), unit('a')], 6),
      kernelError('scheduler: duplicate unit id a'),
    );
  });

  test('a dependency on an unknown unit is refused, and the message names both units', () => {
    assert.throws(
      () => initialState([unit('b', { dependsOn: ['a'] })], 6),
      kernelError('scheduler: unit b depends on unknown unit a'),
    );
  });

  // The direct lane (F2) is the lane with no agent, and it is not scheduled at
  // all. Accepting a null agent here would mean inventing one at launch time.
  test('a unit with no agent is refused rather than scheduled', () => {
    assert.throws(
      () => initialState([unit('a', { agent: null })], 6),
      kernelError(
        'scheduler: unit a has no agent — the scheduler launches through an agent, and a direct-lane unit is not scheduled',
      ),
    );
  });

  test('the units array given to initialState is not retained or mutated', () => {
    const units = chain();
    const snapshot = JSON.stringify(units);
    const state = initialState(units, 6);
    const first = state.units[0];
    assert.ok(first !== undefined);
    first.state = 'running';
    first.dependsOn.push('zz');
    assert.equal(JSON.stringify(units), snapshot);
  });
  ```

- [ ] **Step 2: Run it and see it fail**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/state.test.js
  ```

  Expected failure: `tsc` stops before any test runs with `error TS2307: Cannot find module './state' or its corresponding type declarations.` — `src/scheduler/state.ts` does not exist yet.

- [ ] **Step 3: Write the types and `initialState`**

  Create `src/scheduler/state.ts`:

  ```ts
  import { KernelError } from '../lib/json';
  import type { ExecutionUnit } from '../kernel/execution';

  // The scheduler is the state machine rules/parallelism.md describes and nothing
  // more: it holds no registry, reads no file and starts no process. Every
  // threshold it obeys is answered by src/kernel/{admit,repair,breaker}.ts through
  // src/scheduler/policy.ts, so re-parameterising registries/policy.json moves the
  // answer without touching this file.
  export type UnitState = 'queued' | 'ready' | 'running' | 'completed' | 'failed' | 'blocked';

  export interface SchedulerUnit {
    id: string;
    dependsOn: string[];
    state: UnitState;
    attempts: number;
    agent: string | null;
    modelTier: string;
  }

  // waveIndex counts barriers CROSSED: it advances when a completion releases at
  // least one queued unit, which is the moment rules/parallelism.md calls a wave
  // barrier. It is not the index of the wave a unit belongs to.
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

  export function initialState(units: ExecutionUnit[], capacity: number): SchedulerState {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new KernelError(`scheduler capacity must be a whole non-negative number, not ${String(capacity)}`);
    }
    const seen = new Set<string>();
    for (const unit of units) {
      if (seen.has(unit.id)) throw new KernelError(`scheduler: duplicate unit id ${unit.id}`);
      seen.add(unit.id);
    }
    for (const unit of units) {
      for (const dependency of unit.dependsOn) {
        if (!seen.has(dependency)) {
          throw new KernelError(`scheduler: unit ${unit.id} depends on unknown unit ${dependency}`);
        }
      }
      requireAgent(unit);
    }
    return {
      units: units.map((unit) => ({
        id: unit.id,
        dependsOn: [...unit.dependsOn],
        state: unit.dependsOn.length === 0 ? 'ready' : 'queued',
        attempts: 0,
        agent: unit.agent,
        modelTier: unit.modelTier,
      })),
      capacity,
      waveIndex: 0,
    };
  }

  // Shared by initialState and nextActions so the refusal has one wording. F3
  // types agent as `string | null` because F1's ExecutionUnit does; the null half
  // is the direct lane, which never reaches a scheduler.
  export function requireAgent(unit: { id: string; agent: string | null }): string {
    const agent = unit.agent;
    if (agent === null || agent === '') {
      throw new KernelError(
        `scheduler: unit ${unit.id} has no agent — the scheduler launches through an agent, and a direct-lane unit is not scheduled`,
      );
    }
    return agent;
  }
  ```

- [ ] **Step 4: Run it and see it pass**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/state.test.js
  ```

  Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 5: Commit**

  ```bash
  git add src/scheduler/state.ts src/scheduler/state.test.ts
  git commit -m "feat(scheduler): add unit state model and initial state" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 2: `apply` — event transitions, dependency release, barrier blocking

**Files:**
- `src/scheduler/state.ts` (modified)
- `src/scheduler/state.test.ts` (modified)

**Interfaces:**

Consumes: `SchedulerState`, `SchedulerEvent`, `UnitState`, `SchedulerUnit` (Task 1).

Produces:
```ts
export function apply(state: SchedulerState, event: SchedulerEvent): SchedulerState;
```

Transition table this task implements:

| Event | Required state of the target | Target becomes | Side effect |
|---|---|---|---|
| `unit-started` | `ready` | `running` | `attempts` + 1 |
| `unit-completed` | `running` | `completed` | every `queued` unit whose `dependsOn` are all `completed` becomes `ready`; `waveIndex` + 1 when at least one was released |
| `unit-failed` | `running` | `failed` | every transitive dependent in `queued` or `ready` becomes `blocked` |
| `unit-blocked` | `queued`, `ready` or `running` | `blocked` | same transitive blocking |

- [ ] **Step 1: Write the failing table-driven transition test**

  Append to `src/scheduler/state.test.ts` (and extend the import line to `import { apply, initialState } from './state';`):

  ```ts
  function start(id: string): SchedulerEvent {
    return { kind: 'unit-started', id };
  }
  function done(id: string): SchedulerEvent {
    return { kind: 'unit-completed', id };
  }
  function fail(id: string, reason = 'check red'): SchedulerEvent {
    return { kind: 'unit-failed', id, reason };
  }
  function blocked(id: string, reason = 'contract missing'): SchedulerEvent {
    return { kind: 'unit-blocked', id, reason };
  }

  function drive(events: SchedulerEvent[], capacity = 6): SchedulerState {
    return events.reduce((state, event) => apply(state, event), initialState(chain(), capacity));
  }

  function statesOf(state: SchedulerState): Record<string, UnitState> {
    return Object.fromEntries(state.units.map((u) => [u.id, u.state]));
  }

  interface TransitionCase {
    name: string;
    events: SchedulerEvent[];
    expected: Record<string, UnitState>;
    waveIndex: number;
  }

  const TRANSITIONS: TransitionCase[] = [
    {
      name: 'a started unit runs and nothing else moves',
      events: [start('a')],
      expected: { a: 'running', b: 'queued', c: 'queued', d: 'ready' },
      waveIndex: 0,
    },
    {
      name: 'a completed unit releases only its direct dependent',
      events: [start('a'), done('a')],
      expected: { a: 'completed', b: 'ready', c: 'queued', d: 'ready' },
      waveIndex: 1,
    },
    {
      name: 'the chain releases one layer per barrier',
      events: [start('a'), done('a'), start('b'), done('b')],
      expected: { a: 'completed', b: 'completed', c: 'ready', d: 'ready' },
      waveIndex: 2,
    },
    {
      name: 'a completion that releases nothing does not cross a barrier',
      events: [start('d'), done('d')],
      expected: { a: 'ready', b: 'queued', c: 'queued', d: 'completed' },
      waveIndex: 0,
    },
    {
      name: 'a failed unit blocks its transitive dependents and leaves siblings alone',
      events: [start('a'), fail('a')],
      expected: { a: 'failed', b: 'blocked', c: 'blocked', d: 'ready' },
      waveIndex: 0,
    },
    {
      name: 'an explicitly blocked unit blocks its dependents too',
      events: [start('a'), blocked('a')],
      expected: { a: 'blocked', b: 'blocked', c: 'blocked', d: 'ready' },
      waveIndex: 0,
    },
    {
      name: 'a running sibling of a failed unit keeps running',
      events: [start('a'), start('d'), fail('a')],
      expected: { a: 'failed', b: 'blocked', c: 'blocked', d: 'running' },
      waveIndex: 0,
    },
    {
      name: 'a failure after a release blocks what the release had made ready',
      events: [start('a'), done('a'), start('b'), fail('b')],
      expected: { a: 'completed', b: 'failed', c: 'blocked', d: 'ready' },
      waveIndex: 1,
    },
  ];

  for (const row of TRANSITIONS) {
    test(`apply: ${row.name}`, () => {
      const state = drive(row.events);
      assert.deepEqual(statesOf(state), row.expected);
      assert.equal(state.waveIndex, row.waveIndex);
    });
  }

  test('attempts counts starts, not events', () => {
    const state = drive([start('a'), done('a'), start('b')]);
    assert.equal(state.units.find((u) => u.id === 'a')?.attempts, 1);
    assert.equal(state.units.find((u) => u.id === 'b')?.attempts, 1);
    assert.equal(state.units.find((u) => u.id === 'd')?.attempts, 0);
  });

  interface RefusalCase {
    name: string;
    events: SchedulerEvent[];
    message: string;
  }

  const REFUSALS: RefusalCase[] = [
    {
      name: 'an event for an unknown unit',
      events: [start('zz')],
      message: 'scheduler: unknown unit zz',
    },
    {
      name: 'starting a queued unit',
      events: [start('b')],
      message: 'scheduler: unit-started applies to a unit in ready, and b is queued',
    },
    {
      name: 'starting a running unit twice',
      events: [start('a'), start('a')],
      message: 'scheduler: unit-started applies to a unit in ready, and a is running',
    },
    {
      name: 'completing a unit that never started',
      events: [done('a')],
      message: 'scheduler: unit-completed applies to a unit in running, and a is ready',
    },
    {
      name: 'failing a unit that never started',
      events: [fail('a')],
      message: 'scheduler: unit-failed applies to a unit in running, and a is ready',
    },
    {
      name: 'blocking a completed unit',
      events: [start('a'), done('a'), blocked('a')],
      message: 'scheduler: unit-blocked applies to a unit in queued|ready|running, and a is completed',
    },
  ];

  for (const row of REFUSALS) {
    test(`apply refuses ${row.name}`, () => {
      assert.throws(() => drive(row.events), kernelError(row.message));
    });
  }

  // The reason is the caller's account of the failure. SchedulerState has no
  // field to keep it (F3), so apply validates it and the caller's journal owns
  // it — an empty one is refused rather than silently dropped.
  test('a failure or block with an empty reason is refused', () => {
    assert.throws(
      () => drive([start('a'), { kind: 'unit-failed', id: 'a', reason: '' }]),
      kernelError('scheduler: unit-failed for a requires a reason'),
    );
    assert.throws(
      () => drive([{ kind: 'unit-blocked', id: 'a', reason: '' }]),
      kernelError('scheduler: unit-blocked for a requires a reason'),
    );
  });

  test('apply never mutates the state it was given', () => {
    const before = drive([start('a')]);
    const snapshot = JSON.stringify(before);
    const after = apply(before, done('a'));
    assert.equal(JSON.stringify(before), snapshot);
    assert.notEqual(after.units[0], before.units[0]);
    assert.notEqual(after.units[1], before.units[1]);
    assert.notEqual(after.units[0]?.dependsOn, before.units[0]?.dependsOn);
  });
  ```

  Extend the type import at the top of the file to `import type { ExecutionUnit } from '../kernel/execution';` plus a second line `import type { SchedulerEvent, SchedulerState, UnitState } from './state';` — these are two different modules, so they are two import statements, which the one-import-per-module rule requires.

- [ ] **Step 2: Run it and see it fail**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/state.test.js
  ```

  Expected failure: `tsc` reports `error TS2305: Module './state' has no exported member 'apply'.`

- [ ] **Step 3: Implement `apply` and its helpers**

  Append to `src/scheduler/state.ts`:

  ```ts
  export function apply(state: SchedulerState, event: SchedulerEvent): SchedulerState {
    const target = state.units.find((unit) => unit.id === event.id);
    if (target === undefined) throw new KernelError(`scheduler: unknown unit ${event.id}`);

    switch (event.kind) {
      case 'unit-started': {
        requireState(target, ['ready'], event.kind);
        const started: SchedulerUnit = { ...target, dependsOn: [...target.dependsOn], state: 'running', attempts: target.attempts + 1 };
        return { units: replace(state.units, started), capacity: state.capacity, waveIndex: state.waveIndex };
      }
      case 'unit-completed': {
        requireState(target, ['running'], event.kind);
        const completed: SchedulerUnit = { ...target, dependsOn: [...target.dependsOn], state: 'completed' };
        const units = replace(state.units, completed);
        const released = release(units);
        const crossed = countIn(released, 'queued') < countIn(units, 'queued');
        return { units: released, capacity: state.capacity, waveIndex: state.waveIndex + (crossed ? 1 : 0) };
      }
      case 'unit-failed': {
        requireReason(event.kind, event.id, event.reason);
        requireState(target, ['running'], event.kind);
        const failed: SchedulerUnit = { ...target, dependsOn: [...target.dependsOn], state: 'failed' };
        return { units: blockDependents(replace(state.units, failed), target.id), capacity: state.capacity, waveIndex: state.waveIndex };
      }
      case 'unit-blocked': {
        requireReason(event.kind, event.id, event.reason);
        requireState(target, ['queued', 'ready', 'running'], event.kind);
        const stopped: SchedulerUnit = { ...target, dependsOn: [...target.dependsOn], state: 'blocked' };
        return { units: blockDependents(replace(state.units, stopped), target.id), capacity: state.capacity, waveIndex: state.waveIndex };
      }
    }
  }

  function requireState(unit: SchedulerUnit, allowed: readonly UnitState[], kind: string): void {
    if (!allowed.includes(unit.state)) {
      throw new KernelError(`scheduler: ${kind} applies to a unit in ${allowed.join('|')}, and ${unit.id} is ${unit.state}`);
    }
  }

  function requireReason(kind: string, id: string, reason: string): void {
    if (reason === '') throw new KernelError(`scheduler: ${kind} for ${id} requires a reason`);
  }

  // Every unit comes back as a fresh object, including the ones that did not
  // change: a caller that keeps the old state must not observe an alias.
  function replace(units: readonly SchedulerUnit[], next: SchedulerUnit): SchedulerUnit[] {
    return units.map((unit) => (unit.id === next.id ? next : { ...unit, dependsOn: [...unit.dependsOn] }));
  }

  // The dependency release rule: a unit is ready only when EVERY unit it depends
  // on has completed. A dependency that failed or was blocked never completes,
  // which is what makes a failed unit hold its wave barrier.
  function release(units: readonly SchedulerUnit[]): SchedulerUnit[] {
    const completed = new Set(units.filter((unit) => unit.state === 'completed').map((unit) => unit.id));
    return units.map((unit) => {
      const copy: SchedulerUnit = { ...unit, dependsOn: [...unit.dependsOn] };
      if (unit.state !== 'queued') return copy;
      if (!unit.dependsOn.every((dependency) => completed.has(dependency))) return copy;
      const ready: SchedulerUnit = { ...copy, state: 'ready' };
      return ready;
    });
  }

  // Transitive closure by fixed point: a dependent of a blocked dependent is
  // blocked too, and the graph is small enough that a repeated sweep is cheaper
  // to read than an index. A RUNNING dependent is left alone — it was already
  // launched, the host owns it, and the scheduler does not pretend to stop it.
  function blockDependents(units: readonly SchedulerUnit[], rootId: string): SchedulerUnit[] {
    const doomed = new Set<string>([rootId]);
    for (;;) {
      const before = doomed.size;
      for (const unit of units) {
        if (unit.dependsOn.some((dependency) => doomed.has(dependency))) doomed.add(unit.id);
      }
      if (doomed.size === before) break;
    }
    return units.map((unit) => {
      const copy: SchedulerUnit = { ...unit, dependsOn: [...unit.dependsOn] };
      if (unit.id === rootId || !doomed.has(unit.id)) return copy;
      if (unit.state !== 'queued' && unit.state !== 'ready') return copy;
      const stopped: SchedulerUnit = { ...copy, state: 'blocked' };
      return stopped;
    });
  }

  function countIn(units: readonly SchedulerUnit[], state: UnitState): number {
    return units.filter((unit) => unit.state === state).length;
  }
  ```

- [ ] **Step 4: Run it and see it pass**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/state.test.js
  ```

  Expected: PASS — 24 tests (7 from Task 1, 8 transition rows, 6 refusal rows, 3 standalone), 0 failures.

- [ ] **Step 5: Commit**

  ```bash
  git add src/scheduler/state.ts src/scheduler/state.test.ts
  git commit -m "feat(scheduler): apply events with dependency release and barrier blocking" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 3: `nextActions` — capacity-bounded launches, defers and halts

**Files:**
- `src/scheduler/state.ts` (modified)
- `src/scheduler/state.test.ts` (modified)

**Interfaces:**

Consumes: `SchedulerState`, `SchedulerAction`, `requireAgent` (Tasks 1-2).

Produces:
```ts
export const BARRIER_HALT_PREFIX = 'barrier-blocked: ';
export function nextActions(state: SchedulerState): SchedulerAction[];
```

Answer rules, evaluated in this order:

1. Some unit is `ready` or `running` → emit, in id order, one `launch` per ready unit that fits in `capacity - running`, and one `defer` per ready unit beyond it. No halt is emitted while a wave is still draining.
2. Nothing ready, nothing running, at least one `failed` → one `halt`, reason `barrier-blocked: <failed ids>`.
3. Nothing ready, nothing running, no failure, some unit `queued` or `blocked` → one `halt`, reason `dependency-stall: <ids>`. This is how a dependency cycle surfaces; the scheduler does not re-layer the graph that `src/kernel/waves.ts` already layers.
4. Otherwise (every unit completed) → `[]`.

`nextActions` never emits `retry`: the retry bound is `registries/policy.json` data answered by `src/kernel/repair.ts`, and this module reads no registry. `retry` is produced in Task 5.

- [ ] **Step 1: Write the failing table-driven action test**

  Append to `src/scheduler/state.test.ts` (extend the value import to `import { apply, initialState, nextActions } from './state';` and the type import to include `SchedulerAction`, `SchedulerUnit`):

  ```ts
  interface ActionCase {
    name: string;
    capacity: number;
    events: SchedulerEvent[];
    expected: SchedulerAction[];
  }

  function launch(id: string): SchedulerAction {
    return { kind: 'launch', id, agent: 'backend-coordinator', modelTier: 'build' };
  }
  function defer(id: string): SchedulerAction {
    return { kind: 'defer', id };
  }

  const ACTIONS: ActionCase[] = [
    {
      name: 'an idle plan launches every ready unit in id order',
      capacity: 6,
      events: [],
      expected: [launch('a'), launch('d')],
    },
    {
      name: 'capacity bounds the launches and defers the remainder',
      capacity: 1,
      events: [],
      expected: [launch('a'), defer('d')],
    },
    {
      name: 'a running unit consumes a slot',
      capacity: 1,
      events: [start('a')],
      expected: [defer('d')],
    },
    {
      name: 'zero capacity defers everything rather than launching',
      capacity: 0,
      events: [],
      expected: [defer('a'), defer('d')],
    },
    {
      name: 'a released dependent is launched at the next call',
      capacity: 6,
      events: [start('a'), done('a')],
      expected: [launch('b'), launch('d')],
    },
    {
      name: 'a failure does not halt a wave that is still draining',
      capacity: 6,
      events: [start('a'), fail('a')],
      expected: [launch('d')],
    },
    {
      name: 'a drained wave holding a failure halts and names the failed units',
      capacity: 6,
      events: [start('a'), fail('a'), start('d'), fail('d')],
      expected: [{ kind: 'halt', reason: 'barrier-blocked: a, d' }],
    },
    {
      name: 'a drained wave with no failure and unreachable units reports the stall',
      capacity: 6,
      events: [blocked('a'), start('d'), done('d')],
      expected: [{ kind: 'halt', reason: 'dependency-stall: a, b, c' }],
    },
    {
      name: 'a fully completed plan has nothing left to do',
      capacity: 6,
      events: [start('a'), done('a'), start('b'), done('b'), start('c'), done('c'), start('d'), done('d')],
      expected: [],
    },
  ];

  for (const row of ACTIONS) {
    test(`nextActions: ${row.name}`, () => {
      const state = drive(row.events, row.capacity);
      assert.deepEqual(nextActions(state), row.expected);
    });
  }

  test('nextActions is idempotent and does not touch the state', () => {
    const state = drive([start('a')], 6);
    const snapshot = JSON.stringify(state);
    assert.deepEqual(nextActions(state), nextActions(state));
    assert.equal(JSON.stringify(state), snapshot);
  });

  // The retry ladder is registry data (registries/policy.json .repair), answered
  // by src/kernel/repair.ts. A pure state function that guessed it would be a
  // second copy of the bound.
  test('nextActions emits no retry for a failed unit', () => {
    const state = drive([start('a'), fail('a')], 6);
    assert.deepEqual(nextActions(state).filter((action) => action.kind === 'retry'), []);
  });

  test('a hand-built state whose ready unit has no agent is refused at action time', () => {
    const unitWithoutAgent: SchedulerUnit = {
      id: 'a', dependsOn: [], state: 'ready', attempts: 0, agent: null, modelTier: 'build',
    };
    const state: SchedulerState = { units: [unitWithoutAgent], capacity: 1, waveIndex: 0 };
    assert.throws(
      () => nextActions(state),
      kernelError(
        'scheduler: unit a has no agent — the scheduler launches through an agent, and a direct-lane unit is not scheduled',
      ),
    );
  });
  ```

- [ ] **Step 2: Run it and see it fail**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/state.test.js
  ```

  Expected failure: `tsc` reports `error TS2305: Module './state' has no exported member 'nextActions'.`

- [ ] **Step 3: Implement `nextActions`**

  Append to `src/scheduler/state.ts`:

  ```ts
  // Exported so src/scheduler/policy.ts can recognise the halt it is allowed to
  // withdraw: a barrier is blocked only once the repair ladder has no attempt
  // left, and the ladder is registry data this module does not read.
  export const BARRIER_HALT_PREFIX = 'barrier-blocked: ';

  export function nextActions(state: SchedulerState): SchedulerAction[] {
    const running = inState(state, 'running');
    const ready = inState(state, 'ready');

    if (ready.length === 0 && running.length === 0) {
      const failed = inState(state, 'failed');
      if (failed.length > 0) {
        return [{ kind: 'halt', reason: `${BARRIER_HALT_PREFIX}${idList(failed)}` }];
      }
      // A queued unit with nothing running to release it never becomes ready:
      // either a dependency was blocked, or the graph has a cycle. Both are
      // reported here rather than layered again — src/kernel/waves.ts owns the
      // Kahn layering, and a second copy of it would drift from the first.
      const stalled = [...inState(state, 'queued'), ...inState(state, 'blocked')].sort(byId);
      if (stalled.length > 0) {
        return [{ kind: 'halt', reason: `dependency-stall: ${idList(stalled)}` }];
      }
      return [];
    }

    const slots = Math.max(state.capacity - running.length, 0);
    return ready.map((unit, index) => {
      if (index >= slots) {
        const deferred: SchedulerAction = { kind: 'defer', id: unit.id };
        return deferred;
      }
      const launched: SchedulerAction = {
        kind: 'launch',
        id: unit.id,
        agent: requireAgent(unit),
        modelTier: unit.modelTier,
      };
      return launched;
    });
  }

  // filter copies before sort, so the caller's array order is never rewritten.
  function inState(state: SchedulerState, unitState: UnitState): SchedulerUnit[] {
    return state.units.filter((unit) => unit.state === unitState).sort(byId);
  }

  function byId(left: SchedulerUnit, right: SchedulerUnit): number {
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  }

  function idList(units: readonly SchedulerUnit[]): string {
    return units.map((unit) => unit.id).join(', ');
  }
  ```

- [ ] **Step 4: Run it and see it pass**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/state.test.js
  ```

  Expected: PASS — 37 tests, 0 failures.

- [ ] **Step 5: Commit**

  ```bash
  git add src/scheduler/state.ts src/scheduler/state.test.ts
  git commit -m "feat(scheduler): answer capacity-bounded launches, defers and halts" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 4: Host launcher boundary and capacity resolution

**Files:**
- `src/scheduler/launcher.ts` (created)
- `src/scheduler/launcher.test.ts` (created)

**Interfaces:**

Produces (F4, verbatim, plus the capacity resolution F3 requires):
```ts
export interface LaunchRequest {
  unitId: string;
  agent: string;
  modelTier: string;
  files: string[];
}

export type LaunchStatus = 'OK' | 'DEGRADED' | 'BLOCKED' | 'FAILED';

export interface LaunchOutcome {
  unitId: string;
  status: LaunchStatus;
  note: string | null;
}

export interface HostLauncher {
  readonly capacity: number | null;
  launch(request: LaunchRequest): Promise<LaunchOutcome>;
}

export type CapacityNote = 'host-capacity-unknown' | 'host-capacity-binding' | 'policy-capacity-binding';

export interface CapacityResolution {
  capacity: number;
  source: 'host' | 'policy';
  notes: CapacityNote[];
}

export const FAKE_LAUNCH_NOTE = 'fake-launcher: no process was started';

export function resolveCapacity(policyCapacity: number, host: HostLauncher): CapacityResolution;
export function fakeLauncher(options: { capacity: number | null; outcomes?: Readonly<Record<string, LaunchStatus>> }): FakeLauncher;

export interface FakeLauncher extends HostLauncher {
  readonly launched: LaunchRequest[];
}
```

`LaunchStatus` is a named alias for the inline union F4 spells on `LaunchOutcome.status`; the structural type is identical, and naming it lets `FakeLauncher`'s options reuse it instead of repeating four literals.

- [ ] **Step 1: Write the failing capacity-resolution and launcher test**

  Create `src/scheduler/launcher.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { KernelError } from '../lib/json';
  import { FAKE_LAUNCH_NOTE, fakeLauncher, resolveCapacity, type CapacityResolution, type HostLauncher, type LaunchRequest } from './launcher';

  function kernelError(message: string): (error: unknown) => boolean {
    return (error: unknown): boolean => {
      if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
      assert.equal(error.message, message);
      return true;
    };
  }

  function request(unitId: string): LaunchRequest {
    return { unitId, agent: 'backend-coordinator', modelTier: 'build', files: [`src/${unitId}.ts`] };
  }

  interface CapacityCase {
    name: string;
    policy: number;
    host: number | null;
    expected: CapacityResolution;
  }

  const CAPACITIES: CapacityCase[] = [
    {
      name: 'a host below the policy cap binds, and the lower number wins',
      policy: 6,
      host: 2,
      expected: { capacity: 2, source: 'host', notes: ['host-capacity-binding'] },
    },
    {
      name: 'a host above the policy cap cannot raise it',
      policy: 6,
      host: 99,
      expected: { capacity: 6, source: 'policy', notes: ['policy-capacity-binding'] },
    },
    {
      name: 'equal capacities are attributed to the policy, which is the ceiling',
      policy: 6,
      host: 6,
      expected: { capacity: 6, source: 'policy', notes: ['policy-capacity-binding'] },
    },
    {
      name: 'a host with no free slot resolves to zero rather than to the policy cap',
      policy: 6,
      host: 0,
      expected: { capacity: 0, source: 'host', notes: ['host-capacity-binding'] },
    },
    {
      name: 'an unknown host capacity falls back to the policy cap and says so',
      policy: 6,
      host: null,
      expected: { capacity: 6, source: 'policy', notes: ['host-capacity-unknown'] },
    },
  ];

  for (const row of CAPACITIES) {
    test(`resolveCapacity: ${row.name}`, () => {
      assert.deepEqual(resolveCapacity(row.policy, fakeLauncher({ capacity: row.host })), row.expected);
    });
  }

  test('a policy capacity that is not a positive integer is refused', () => {
    assert.throws(
      () => resolveCapacity(0, fakeLauncher({ capacity: null })),
      kernelError('scheduler: policy capacity must be a positive integer, not 0'),
    );
    assert.throws(
      () => resolveCapacity(2.5, fakeLauncher({ capacity: null })),
      kernelError('scheduler: policy capacity must be a positive integer, not 2.5'),
    );
  });

  test('a host capacity that is neither a whole non-negative number nor null is refused', () => {
    const broken: HostLauncher = { capacity: -1, launch: () => Promise.reject(new Error('never called')) };
    assert.throws(
      () => resolveCapacity(6, broken),
      kernelError('scheduler: host capacity must be a whole non-negative number or null, not -1'),
    );
  });

  test('the fake launcher records every request in order and answers OK by default', async () => {
    const host = fakeLauncher({ capacity: 2 });
    const first = await host.launch(request('a'));
    const second = await host.launch(request('b'));
    assert.deepEqual(first, { unitId: 'a', status: 'OK', note: FAKE_LAUNCH_NOTE });
    assert.deepEqual(second, { unitId: 'b', status: 'OK', note: FAKE_LAUNCH_NOTE });
    assert.deepEqual(host.launched.map((entry) => entry.unitId), ['a', 'b']);
    assert.deepEqual(host.launched[0], request('a'));
  });

  test('the fake launcher answers a declared outcome per unit, deterministically', async () => {
    const host = fakeLauncher({ capacity: 2, outcomes: { b: 'FAILED', c: 'DEGRADED' } });
    assert.equal((await host.launch(request('a'))).status, 'OK');
    assert.equal((await host.launch(request('b'))).status, 'FAILED');
    assert.equal((await host.launch(request('b'))).status, 'FAILED');
    assert.equal((await host.launch(request('c'))).status, 'DEGRADED');
  });

  // The note is not decoration: a fake outcome that reads like a real one is
  // exactly the fabricated enforcement claim this wave refuses to ship.
  test('every fake outcome says no process was started', async () => {
    const host = fakeLauncher({ capacity: null, outcomes: { a: 'OK' } });
    assert.equal((await host.launch(request('a'))).note, FAKE_LAUNCH_NOTE);
  });
  ```

- [ ] **Step 2: Run it and see it fail**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/launcher.test.js
  ```

  Expected failure: `tsc` stops with `error TS2307: Cannot find module './launcher' or its corresponding type declarations.`

- [ ] **Step 3: Implement the boundary**

  Create `src/scheduler/launcher.ts`:

  ```ts
  import { KernelError } from '../lib/json';

  // The launch boundary. Nothing in src/scheduler/ starts a process: a host
  // adapter supplies this interface, and an adapter that has no native launch
  // API supplies none at all — the scheduler then answers next actions and the
  // enforcement stays conventional (templates/adapters/README.md).
  export interface LaunchRequest {
    unitId: string;
    agent: string;
    modelTier: string;
    files: string[];
  }

  // The return-envelope vocabulary (rules/subagents.md), named once so the fake
  // launcher's options can reuse it rather than repeating the four literals.
  export type LaunchStatus = 'OK' | 'DEGRADED' | 'BLOCKED' | 'FAILED';

  export interface LaunchOutcome {
    unitId: string;
    status: LaunchStatus;
    note: string | null;
  }

  // capacity is `number | null`, and null means UNKNOWN rather than zero. A host
  // that cannot observe its own concurrency must not be read as a host with no
  // slots, which is the same unknown-is-not-zero rule F6 applies to token counts.
  export interface HostLauncher {
    readonly capacity: number | null;
    launch(request: LaunchRequest): Promise<LaunchOutcome>;
  }

  export type CapacityNote = 'host-capacity-unknown' | 'host-capacity-binding' | 'policy-capacity-binding';

  export interface CapacityResolution {
    capacity: number;
    source: 'host' | 'policy';
    notes: CapacityNote[];
  }

  export interface FakeLauncher extends HostLauncher {
    readonly launched: LaunchRequest[];
  }

  export const FAKE_LAUNCH_NOTE = 'fake-launcher: no process was started';

  // Capacity is Math.min(policyCapacity, hostCapacity) (F3). When the host reports
  // nothing, the policy cap is used AND host-capacity-unknown is recorded: the
  // scheduler is then advising, not enforcing, and the note is the difference.
  export function resolveCapacity(policyCapacity: number, host: HostLauncher): CapacityResolution {
    if (!Number.isInteger(policyCapacity) || policyCapacity < 1) {
      throw new KernelError(`scheduler: policy capacity must be a positive integer, not ${String(policyCapacity)}`);
    }
    const hostCapacity = host.capacity;
    if (hostCapacity === null) {
      return { capacity: policyCapacity, source: 'policy', notes: ['host-capacity-unknown'] };
    }
    if (!Number.isInteger(hostCapacity) || hostCapacity < 0) {
      throw new KernelError(`scheduler: host capacity must be a whole non-negative number or null, not ${String(hostCapacity)}`);
    }
    if (hostCapacity < policyCapacity) {
      return { capacity: hostCapacity, source: 'host', notes: ['host-capacity-binding'] };
    }
    return { capacity: policyCapacity, source: 'policy', notes: ['policy-capacity-binding'] };
  }

  // Test-only, and unmistakable: it performs no I/O, and every outcome carries
  // FAKE_LAUNCH_NOTE so a fake launch can never be read as a real one in a log.
  export function fakeLauncher(options: { capacity: number | null; outcomes?: Readonly<Record<string, LaunchStatus>> }): FakeLauncher {
    const launched: LaunchRequest[] = [];
    const outcomes = options.outcomes ?? {};
    return {
      capacity: options.capacity,
      launched,
      launch(request: LaunchRequest): Promise<LaunchOutcome> {
        launched.push(request);
        const status = outcomes[request.unitId] ?? 'OK';
        return Promise.resolve({ unitId: request.unitId, status, note: FAKE_LAUNCH_NOTE });
      },
    };
  }
  ```

- [ ] **Step 4: Run it and see it pass**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/launcher.test.js
  ```

  Expected: PASS — 10 tests, 0 failures.

- [ ] **Step 5: Commit**

  ```bash
  git add src/scheduler/launcher.ts src/scheduler/launcher.test.ts
  git commit -m "feat(scheduler): add host launch boundary and capacity resolution" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 5: Decision layer — admission, retry ladder and breaker from the kernel

**Files:**
- `src/scheduler/policy.ts` (created)
- `src/scheduler/policy.test.ts` (created)

**Interfaces:**

Consumes (existing kernel modules, unchanged):
```ts
export function admitSection(facts: AdmitFacts, regs: Registries): AdmitSection;   // src/kernel/admit.ts
export function repairSection(facts: RepairFacts, regs: Registries): RepairSection; // src/kernel/repair.ts
export function breakerSection(facts: BreakerFacts, regs: Registries): BreakerSection; // src/kernel/breaker.ts
export interface AdmitFacts { inflight: number; queued: number }
export interface AdmitSection { action: string; capacity: number; reason: string }
export interface RepairFacts { check: string; attempt?: number; situation?: string }
export interface RepairSection { check: string; action: string; reason: string }
export interface BreakerFacts { state: string; failures?: number; cooldownElapsed?: boolean; probeResult?: string }
export interface BreakerSection { state: string; allow: boolean; reason: string }
```

Consumes from Task 3: `nextActions(state: SchedulerState): SchedulerAction[]`.

Produces:
```ts
export type DecisionNote =
  | 'admission-rejected'
  | 'admission-deferred'
  | 'breaker-blocked'
  | 'retry-check-undeclared'
  | 'top-of-model-ladder';

export interface RetryDecision {
  unitId: string;
  action: string;
  modelTier: string;
  reason: string;
}

export interface DecisionFacts {
  state: SchedulerState;
  retryCheck?: string;
  breaker?: BreakerFacts;
}

export interface SchedulerDecision {
  admit: AdmitSection;
  breaker: BreakerSection | null;
  actions: SchedulerAction[];
  retries: RetryDecision[];
  notes: DecisionNote[];
}

export function decide(facts: DecisionFacts, regs: Registries): SchedulerDecision;
```

Mapping this task fixes, so no threshold is duplicated:

| Scheduler fact | Kernel fact | Why |
|---|---|---|
| units in `running` | `AdmitFacts.inflight` | running units are the in-flight agents |
| units in `queued` plus `ready` | `AdmitFacts.queued` | everything waiting for a slot |
| a failed unit's `attempts` | `RepairFacts.attempt` | `attempts` counts starts, which is exactly the ladder's attempt count |
| caller-declared resource health | `BreakerFacts` | the breaker is per RESOURCE and the orchestrator owns its state (`rules/parallelism.md`) |

One reshaping rule beyond the table: when the repair ladder still has an attempt
left for a failed unit, the `barrier-blocked` halt `nextActions` produced is
**withdrawn** and replaced by the `retry`. The barrier is blocked when the ladder
is exhausted, not when a unit first goes red — and `nextActions`, which reads no
registry, cannot know the difference. Answering both a halt and a retry would hand
a caller two contradictory instructions.

- [ ] **Step 1: Write the failing decision test**

  Create `src/scheduler/policy.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { lazyRegistries } from '../kernel/context';
  import { resolveRoot } from '../registry/paths';
  import type { ExecutionUnit } from '../kernel/execution';
  import { apply, initialState, type SchedulerState, type SchedulerUnit } from './state';
  import { decide } from './policy';

  // Every bound below is read from the registry the section itself reads, as in
  // src/kernel/admit.test.ts: re-parameterising policy.json must move a fixture,
  // never turn one red.
  const regs = lazyRegistries(resolveRoot({}, __dirname));
  const CAP = regs.policy.parallelism.wave_concurrency_cap;
  const MAX_QUEUED = regs.policy.parallelism.backpressure.max_queued_units;
  const FIX_ATTEMPTS = regs.policy.repair.max_fix_attempts_per_check;
  const CHECK = regs.policy.repair.checks[0] ?? 'lint';
  const BUILD_TIER = regs.models.tiers.find((tier) => tier.escalates_to !== null);
  const TOP_TIER = regs.models.tiers.find((tier) => tier.escalates_to === null);

  function unit(id: string): ExecutionUnit {
    return { id, domains: ['backend'], files: [`src/${id}.ts`], workType: 'implementation', agent: 'backend-coordinator', modelTier: 'build', dependsOn: [] };
  }

  function independent(count: number): ExecutionUnit[] {
    // Ids are zero-padded so the id order nextActions sorts by is the natural one.
    return Array.from({ length: count }, (_, index) => unit(`u${String(index).padStart(2, '0')}`));
  }

  function failedUnit(opts: { attempts: number; modelTier: string }): SchedulerState {
    const failed: SchedulerUnit = { id: 'a', dependsOn: [], state: 'failed', attempts: opts.attempts, agent: 'backend-coordinator', modelTier: opts.modelTier };
    return { units: [failed], capacity: CAP, waveIndex: 0 };
  }

  test('an idle plan under the cap dispatches, and the admit answer rides along', () => {
    const decision = decide({ state: initialState(independent(2), CAP) }, regs);
    assert.equal(decision.admit.action, 'dispatch');
    assert.deepEqual(decision.actions.map((action) => action.kind), ['launch', 'launch']);
    assert.deepEqual(decision.notes, []);
    assert.equal(decision.breaker, null);
    assert.deepEqual(decision.retries, []);
  });

  test('ready units beyond the resolved capacity are deferred, not launched', () => {
    const decision = decide({ state: initialState(independent(CAP + 2), CAP) }, regs);
    assert.equal(decision.actions.filter((action) => action.kind === 'launch').length, CAP);
    assert.equal(decision.actions.filter((action) => action.kind === 'defer').length, 2);
  });

  // admit is asked before every dispatch; its capacity is cap - inflight, so a
  // state whose slots were computed against a stale capacity is tightened here.
  test('a state claiming more capacity than admit allows is truncated to the admit answer', () => {
    const inflated: SchedulerState = { ...initialState(independent(CAP + 1), CAP + 1) };
    const decision = decide({ state: inflated }, regs);
    assert.equal(decision.admit.capacity, CAP);
    assert.equal(decision.actions.filter((action) => action.kind === 'launch').length, CAP);
    assert.equal(decision.actions.filter((action) => action.kind === 'defer').length, 1);
  });

  // reject needs BOTH halves of admit's answer: the cap reached AND the queue
  // full. A long queue with idle slots is still a dispatch.
  test('a full queue rejects, halting with the admit reason and its HITL trigger', () => {
    const units = independent(CAP + MAX_QUEUED);
    const running = units.slice(0, CAP).reduce<SchedulerState>(
      (state, unit) => apply(state, { kind: 'unit-started', id: unit.id }),
      initialState(units, CAP),
    );
    const decision = decide({ state: running }, regs);
    assert.equal(decision.admit.action, 'reject');
    assert.deepEqual(decision.actions, [{ kind: 'halt', reason: decision.admit.reason }]);
    // The HITL trigger rides in admit's own reason; the scheduler repeats it
    // rather than composing a second wording for the same stop.
    assert.ok(decision.admit.reason.includes('hitl: budget-exhausted'));
    assert.deepEqual(decision.notes, ['admission-rejected']);
  });

  test('an open breaker defers every launch instead of calling the resource again', () => {
    const decision = decide(
      { state: initialState(independent(2), CAP), breaker: { state: 'open', cooldownElapsed: false } },
      regs,
    );
    assert.equal(decision.breaker?.allow, false);
    assert.deepEqual(decision.actions, [{ kind: 'defer', id: 'u00' }, { kind: 'defer', id: 'u01' }]);
    assert.deepEqual(decision.notes, ['breaker-blocked']);
  });

  test('a closed breaker below the threshold launches as usual', () => {
    const decision = decide(
      { state: initialState(independent(1), CAP), breaker: { state: 'closed', failures: 0 } },
      regs,
    );
    assert.equal(decision.breaker?.allow, true);
    assert.deepEqual(decision.actions.map((action) => action.kind), ['launch']);
    assert.deepEqual(decision.notes, []);
  });

  // The barrier halt nextActions produced is withdrawn while an attempt remains:
  // a caller must not be told to halt and to retry in one answer.
  test('a first failure is answered by the repair ladder as a same-tier retry', () => {
    const decision = decide({ state: failedUnit({ attempts: 1, modelTier: 'build' }), retryCheck: CHECK }, regs);
    assert.equal(decision.retries.length, 1);
    assert.equal(decision.retries[0]?.unitId, 'a');
    assert.equal(decision.retries[0]?.action, 'fix-same-tier');
    assert.equal(decision.retries[0]?.modelTier, 'build');
    assert.ok((decision.retries[0]?.reason ?? '').length > 0);
    assert.deepEqual(decision.actions, [{ kind: 'retry', id: 'a', modelTier: 'build' }]);
  });

  test('a repeated failure escalates to the tier registries/models.json names', () => {
    const tier = BUILD_TIER;
    assert.ok(tier !== undefined, 'models.json must declare a tier that escalates');
    const decision = decide({ state: failedUnit({ attempts: FIX_ATTEMPTS, modelTier: tier.id }), retryCheck: CHECK }, regs);
    assert.equal(decision.retries[0]?.action, 'escalate-one-tier');
    assert.equal(decision.retries[0]?.modelTier, tier.escalates_to);
    assert.deepEqual(decision.actions, [{ kind: 'retry', id: 'a', modelTier: tier.escalates_to }]);
  });

  test('a unit already at the top of the ladder retries there and says so', () => {
    const tier = TOP_TIER;
    assert.ok(tier !== undefined, 'models.json must declare a top tier');
    const decision = decide({ state: failedUnit({ attempts: FIX_ATTEMPTS, modelTier: tier.id }), retryCheck: CHECK }, regs);
    assert.equal(decision.retries[0]?.modelTier, tier.id);
    assert.ok(decision.notes.includes('top-of-model-ladder'));
  });

  test('an exhausted bound produces no retry action, and the barrier halt stands', () => {
    const decision = decide({ state: failedUnit({ attempts: FIX_ATTEMPTS + 1, modelTier: 'build' }), retryCheck: CHECK }, regs);
    assert.equal(decision.retries[0]?.action, 'stop-report-red');
    assert.deepEqual(decision.actions, [{ kind: 'halt', reason: 'barrier-blocked: a' }]);
  });

  // No fabricated default: the repair ladder needs a declared check, and the
  // absence of one is reported rather than guessed at.
  test('a failure with no declared retry check reports the gap instead of inventing one', () => {
    const decision = decide({ state: failedUnit({ attempts: 1, modelTier: 'build' }) }, regs);
    assert.deepEqual(decision.retries, []);
    assert.ok(decision.notes.includes('retry-check-undeclared'));
  });

  test('a unit naming a tier registries/models.json does not declare is refused', () => {
    assert.throws(
      () => decide({ state: failedUnit({ attempts: FIX_ATTEMPTS, modelTier: 'turbo' }), retryCheck: CHECK }, regs),
      /unit a names model tier turbo, which registries\/models\.json does not declare/,
    );
  });
  ```

- [ ] **Step 2: Run it and see it fail**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/policy.test.js
  ```

  Expected failure: `tsc` stops with `error TS2307: Cannot find module './policy' or its corresponding type declarations.`

- [ ] **Step 3: Implement `decide`**

  Create `src/scheduler/policy.ts`:

  ```ts
  import { admitSection, type AdmitSection } from '../kernel/admit';
  import { breakerSection, type BreakerFacts, type BreakerSection } from '../kernel/breaker';
  import type { Registries } from '../kernel/context';
  import { repairSection } from '../kernel/repair';
  import { KernelError } from '../lib/json';
  import { BARRIER_HALT_PREFIX, nextActions, type SchedulerAction, type SchedulerState, type SchedulerUnit } from './state';

  // The only module in src/scheduler/ that reads a registry, and it reads none
  // directly: it asks the kernel sections that already own admission, the repair
  // ladder and the breaker, then reshapes the pure actions from their answers. A
  // number from registries/policy.json appearing here would be a second copy of a
  // threshold, which is the defect rules/parallelism.md's three blocks exist to
  // avoid.
  export type DecisionNote =
    | 'admission-rejected'
    | 'admission-deferred'
    | 'breaker-blocked'
    | 'retry-check-undeclared'
    | 'top-of-model-ladder';

  export interface RetryDecision {
    unitId: string;
    action: string;
    modelTier: string;
    reason: string;
  }

  export interface DecisionFacts {
    state: SchedulerState;
    retryCheck?: string;
    breaker?: BreakerFacts;
  }

  export interface SchedulerDecision {
    admit: AdmitSection;
    breaker: BreakerSection | null;
    actions: SchedulerAction[];
    retries: RetryDecision[];
    notes: DecisionNote[];
  }

  export function decide(facts: DecisionFacts, regs: Registries): SchedulerDecision {
    const state = facts.state;
    const notes: DecisionNote[] = [];
    const admit = admitSection(
      { inflight: countIn(state, 'running'), queued: countIn(state, 'queued') + countIn(state, 'ready') },
      regs,
    );
    const breaker = facts.breaker === undefined ? null : breakerSection(facts.breaker, regs);
    const retries = retryDecisions(facts, regs, notes);

    if (admit.action === 'reject') {
      notes.push('admission-rejected');
      return answer(admit, breaker, [{ kind: 'halt', reason: admit.reason }], retries, notes);
    }

    const base = nextActions(state);
    if (breaker !== null && !breaker.allow) {
      notes.push('breaker-blocked');
      return answer(admit, breaker, base.map(toDefer), retries, notes);
    }
    if (admit.action !== 'dispatch') {
      notes.push('admission-deferred');
      return answer(admit, breaker, base.map(toDefer), retries, notes);
    }
    const retryable = retryActions(retries);
    const shaped = capLaunches(base, admit.capacity);
    if (retryable.length === 0) return answer(admit, breaker, shaped, retries, notes);
    return answer(admit, breaker, [...withoutBarrierHalt(shaped), ...retryable], retries, notes);
  }

  // A barrier is blocked when the repair ladder is exhausted, not when a unit
  // first goes red. nextActions reads no registry, so it cannot tell those apart
  // and always produces the halt; here, where the ladder's answer is known, the
  // halt is withdrawn rather than emitted beside a contradicting retry.
  function withoutBarrierHalt(actions: readonly SchedulerAction[]): SchedulerAction[] {
    return actions.filter((action) => !(action.kind === 'halt' && action.reason.startsWith(BARRIER_HALT_PREFIX)));
  }

  function answer(
    admit: AdmitSection,
    breaker: BreakerSection | null,
    actions: SchedulerAction[],
    retries: RetryDecision[],
    notes: DecisionNote[],
  ): SchedulerDecision {
    return { admit, breaker, actions, retries, notes: [...new Set(notes)] };
  }

  function toDefer(action: SchedulerAction): SchedulerAction {
    if (action.kind !== 'launch') return action;
    const deferred: SchedulerAction = { kind: 'defer', id: action.id };
    return deferred;
  }

  // admit.capacity is cap - inflight. nextActions has already bounded the
  // launches by the state's own capacity, so this can only tighten the answer —
  // which is the point: an adapter may lower capacity and never raise it (F2).
  function capLaunches(actions: readonly SchedulerAction[], capacity: number): SchedulerAction[] {
    let launched = 0;
    return actions.map((action) => {
      if (action.kind !== 'launch') return action;
      launched += 1;
      if (launched <= capacity) return action;
      const deferred: SchedulerAction = { kind: 'defer', id: action.id };
      return deferred;
    });
  }

  function retryActions(retries: readonly RetryDecision[]): SchedulerAction[] {
    return retries
      .filter((retry) => retry.action === 'fix-same-tier' || retry.action === 'escalate-one-tier')
      .map((retry) => {
        const action: SchedulerAction = { kind: 'retry', id: retry.unitId, modelTier: retry.modelTier };
        return action;
      });
  }

  // attempts counts starts (src/scheduler/state.ts), which is exactly the repair
  // ladder's attempt count, so the two need no translation table.
  function retryDecisions(facts: DecisionFacts, regs: Registries, notes: DecisionNote[]): RetryDecision[] {
    const failed = facts.state.units.filter((unit) => unit.state === 'failed');
    if (failed.length === 0) return [];
    const check = facts.retryCheck;
    if (check === undefined || check === '') {
      notes.push('retry-check-undeclared');
      return [];
    }
    return failed.map((unit) => {
      const repair = repairSection({ check, attempt: unit.attempts }, regs);
      const modelTier = repair.action === 'escalate-one-tier' ? escalatedTier(unit, regs, notes) : unit.modelTier;
      return { unitId: unit.id, action: repair.action, modelTier, reason: repair.reason };
    });
  }

  // The ladder is registry data: the target comes from the tier's own row, never
  // from an order restated here (src/kernel/model.ts applies the same rule).
  function escalatedTier(unit: SchedulerUnit, regs: Registries, notes: DecisionNote[]): string {
    const tier = regs.models.tiers.find((row) => row.id === unit.modelTier);
    if (tier === undefined) {
      throw new KernelError(
        `scheduler: unit ${unit.id} names model tier ${unit.modelTier}, which registries/models.json does not declare`,
      );
    }
    if (tier.escalates_to === null) {
      notes.push('top-of-model-ladder');
      return tier.id;
    }
    return tier.escalates_to;
  }

  function countIn(state: SchedulerState, unitState: SchedulerUnit['state']): number {
    return state.units.filter((unit) => unit.state === unitState).length;
  }
  ```

- [ ] **Step 4: Run it and see it pass**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/policy.test.js
  ```

  Expected: PASS — 12 tests, 0 failures.

- [ ] **Step 5: Commit**

  ```bash
  git add src/scheduler/policy.ts src/scheduler/policy.test.ts
  git commit -m "feat(scheduler): decide actions from admit, repair and breaker answers" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 6: JSON fact parsers for the CLI arms

**Files:**
- `src/scheduler/parse.ts` (created)
- `src/scheduler/parse.test.ts` (created)

**Interfaces:**

Consumes: `ExecutionUnit` (F1), `BreakerFacts` (`src/kernel/breaker.ts`), `SchedulerEvent`, `SchedulerState`, `SchedulerUnit`, `UnitState` (Task 1), `isRecord` and `KernelError` (`src/lib/json.ts`).

Produces:
```ts
export function parseUnits(flag: string, raw: string): ExecutionUnit[];
export function parseState(flag: string, raw: string): SchedulerState;
export function parseEvent(flag: string, raw: string): SchedulerEvent;
export function parseBreaker(flag: string, raw: string): BreakerFacts;
```

The `--units` spelling is camelCase because it consumes `engineos kernel execution`'s `units` array verbatim (F1's `ExecutionUnit` serialized), so the two commands pipe into each other without a rename. Absent arrays read as empty, exactly as `src/kernel/waves.ts` reads an absent `files`; absent scalars are refused, because the kernel never fabricates a default for a missing fact.

**`parseState` is load-bearing, not plumbing.** F3 has no event returning a `failed` unit to `ready`, so a retry is re-entered by the caller handing `scheduler step` a state whose unit is `ready` with `attempts` preserved. This parser is what makes that state trustworthy.

- [ ] **Step 1: Write the failing parser test**

  Create `src/scheduler/parse.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { KernelError } from '../lib/json';
  import { parseBreaker, parseEvent, parseState, parseUnits } from './parse';

  function kernelError(message: string): (error: unknown) => boolean {
    return (error: unknown): boolean => {
      if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
      assert.equal(error.message, message);
      return true;
    };
  }

  test('a unit array from kernel execution parses field for field', () => {
    const raw = JSON.stringify([
      { id: 'a', domains: ['backend'], files: ['src/a.ts'], workType: 'implementation', agent: 'backend-coordinator', modelTier: 'build', dependsOn: [] },
      { id: 'b', domains: [], files: [], workType: 'implementation', agent: 'dba-coordinator', modelTier: 'design', dependsOn: ['a'] },
    ]);
    assert.deepEqual(parseUnits('--units', raw), [
      { id: 'a', domains: ['backend'], files: ['src/a.ts'], workType: 'implementation', agent: 'backend-coordinator', modelTier: 'build', dependsOn: [] },
      { id: 'b', domains: [], files: [], workType: 'implementation', agent: 'dba-coordinator', modelTier: 'design', dependsOn: ['a'] },
    ]);
  });

  test('absent arrays read as empty and a null agent survives parsing', () => {
    const raw = JSON.stringify([{ id: 'a', workType: 'implementation', agent: null, modelTier: 'build' }]);
    assert.deepEqual(parseUnits('--units', raw), [
      { id: 'a', domains: [], files: [], workType: 'implementation', agent: null, modelTier: 'build', dependsOn: [] },
    ]);
  });

  test('malformed unit input is refused with the flag and the index named', () => {
    assert.throws(() => parseUnits('--units', '{'), kernelError('--units is not valid JSON'));
    assert.throws(() => parseUnits('--units', '{}'), kernelError('--units must be a JSON array'));
    assert.throws(
      () => parseUnits('--units', '[{"workType":"implementation","agent":"a","modelTier":"build"}]'),
      kernelError('--units[0].id must be a non-empty string'),
    );
    assert.throws(
      () => parseUnits('--units', '[{"id":"a","agent":"x","modelTier":"build"}]'),
      kernelError('--units[0].workType must be a string'),
    );
    assert.throws(
      () => parseUnits('--units', '[{"id":"a","workType":"w","modelTier":"build"}]'),
      kernelError('--units[0].agent must be a string or null'),
    );
    assert.throws(
      () => parseUnits('--units', '[{"id":"a","workType":"w","agent":"x"}]'),
      kernelError('--units[0].modelTier must be a non-empty string'),
    );
    assert.throws(
      () => parseUnits('--units', '[{"id":"a","workType":"w","agent":"x","modelTier":"build","dependsOn":"a"}]'),
      kernelError('--units[0].dependsOn must be an array of unit ids'),
    );
  });

  test('a scheduler state round-trips through the parser', () => {
    const state = {
      units: [{ id: 'a', dependsOn: [], state: 'ready', attempts: 2, agent: 'backend-coordinator', modelTier: 'build' }],
      capacity: 3,
      waveIndex: 1,
    };
    assert.deepEqual(parseState('--state', JSON.stringify(state)), state);
  });

  test('a state with an undeclared unit state or a broken count is refused', () => {
    const unit = { id: 'a', dependsOn: [], state: 'ready', attempts: 0, agent: 'x', modelTier: 'build' };
    assert.throws(
      () => parseState('--state', JSON.stringify({ units: [{ ...unit, state: 'paused' }], capacity: 1, waveIndex: 0 })),
      kernelError('--state.units[0].state must be one of queued|ready|running|completed|failed|blocked'),
    );
    assert.throws(
      () => parseState('--state', JSON.stringify({ units: [{ ...unit, attempts: -1 }], capacity: 1, waveIndex: 0 })),
      kernelError('--state.units[0].attempts must be a whole non-negative number'),
    );
    assert.throws(
      () => parseState('--state', JSON.stringify({ units: [unit], capacity: -1, waveIndex: 0 })),
      kernelError('--state.capacity must be a whole non-negative number'),
    );
    assert.throws(
      () => parseState('--state', JSON.stringify({ units: [unit], capacity: 1, waveIndex: 1.5 })),
      kernelError('--state.waveIndex must be a whole non-negative number'),
    );
    assert.throws(
      () => parseState('--state', JSON.stringify({ capacity: 1, waveIndex: 0 })),
      kernelError('--state.units must be a JSON array'),
    );
  });

  test('every event kind parses, and a reason is required where the kind carries one', () => {
    assert.deepEqual(parseEvent('--event', '{"kind":"unit-started","id":"a"}'), { kind: 'unit-started', id: 'a' });
    assert.deepEqual(parseEvent('--event', '{"kind":"unit-completed","id":"a"}'), { kind: 'unit-completed', id: 'a' });
    assert.deepEqual(parseEvent('--event', '{"kind":"unit-failed","id":"a","reason":"typecheck red"}'), {
      kind: 'unit-failed', id: 'a', reason: 'typecheck red',
    });
    assert.deepEqual(parseEvent('--event', '{"kind":"unit-blocked","id":"a","reason":"contract missing"}'), {
      kind: 'unit-blocked', id: 'a', reason: 'contract missing',
    });
    assert.throws(
      () => parseEvent('--event', '{"kind":"unit-paused","id":"a"}'),
      kernelError('--event.kind must be one of unit-started|unit-completed|unit-failed|unit-blocked'),
    );
    assert.throws(
      () => parseEvent('--event', '{"kind":"unit-failed","id":"a"}'),
      kernelError('--event.reason must be a non-empty string for unit-failed'),
    );
    assert.throws(
      () => parseEvent('--event', '{"kind":"unit-started"}'),
      kernelError('--event.id must be a non-empty string'),
    );
  });

  test('breaker facts parse only the fields the state reads, leaving the rest undeclared', () => {
    assert.deepEqual(parseBreaker('--breaker', '{"state":"closed","failures":2}'), { state: 'closed', failures: 2 });
    assert.deepEqual(parseBreaker('--breaker', '{"state":"open","cooldownElapsed":true}'), { state: 'open', cooldownElapsed: true });
    assert.deepEqual(parseBreaker('--breaker', '{"state":"half-open","probeResult":"ok"}'), { state: 'half-open', probeResult: 'ok' });
    assert.throws(
      () => parseBreaker('--breaker', '{"failures":1}'),
      kernelError('--breaker.state must be a non-empty string'),
    );
    assert.throws(
      () => parseBreaker('--breaker', '{"state":"closed","failures":"two"}'),
      kernelError('--breaker.failures must be a whole non-negative number'),
    );
  });
  ```

- [ ] **Step 2: Run it and see it fail**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/parse.test.js
  ```

  Expected failure: `tsc` stops with `error TS2307: Cannot find module './parse' or its corresponding type declarations.`

- [ ] **Step 3: Implement the parsers**

  Create `src/scheduler/parse.ts`:

  ```ts
  import type { BreakerFacts } from '../kernel/breaker';
  import type { ExecutionUnit } from '../kernel/execution';
  import { isRecord, KernelError } from '../lib/json';
  import type { SchedulerEvent, SchedulerState, SchedulerUnit, UnitState } from './state';

  // The CLI's boundary. A flag the scheduler cannot read is refused here, naming
  // the flag and the path inside it, so no answer is ever computed from input the
  // parser did not understand (src/kernel/waves.ts takes the same position).
  const UNIT_STATES: readonly UnitState[] = ['queued', 'ready', 'running', 'completed', 'failed', 'blocked'];
  const EVENT_KINDS: readonly string[] = ['unit-started', 'unit-completed', 'unit-failed', 'unit-blocked'];

  export function parseUnits(flag: string, raw: string): ExecutionUnit[] {
    const value = parseJson(flag, raw);
    if (!Array.isArray(value)) throw new KernelError(`${flag} must be a JSON array`);
    const rows: unknown[] = value;
    return rows.map((row, index) => {
      const at = `${flag}[${index}]`;
      const record = requireRecord(row, at);
      return {
        id: requireText(record['id'], `${at}.id`),
        domains: optionalStrings(record['domains'], `${at}.domains must be an array of domain ids`),
        files: optionalStrings(record['files'], `${at}.files must be an array of file paths`),
        workType: requireString(record['workType'], `${at}.workType`),
        agent: requireAgentField(record['agent'], `${at}.agent`),
        modelTier: requireText(record['modelTier'], `${at}.modelTier`),
        dependsOn: optionalStrings(record['dependsOn'], `${at}.dependsOn must be an array of unit ids`),
      };
    });
  }

  export function parseState(flag: string, raw: string): SchedulerState {
    const record = requireRecord(parseJson(flag, raw), flag);
    const units = record['units'];
    if (!Array.isArray(units)) throw new KernelError(`${flag}.units must be a JSON array`);
    const rows: unknown[] = units;
    return {
      units: rows.map((row, index) => parseUnit(row, `${flag}.units[${index}]`)),
      capacity: requireCount(record['capacity'], `${flag}.capacity`),
      waveIndex: requireCount(record['waveIndex'], `${flag}.waveIndex`),
    };
  }

  export function parseEvent(flag: string, raw: string): SchedulerEvent {
    const record = requireRecord(parseJson(flag, raw), flag);
    const kind = record['kind'];
    if (typeof kind !== 'string' || !EVENT_KINDS.includes(kind)) {
      throw new KernelError(`${flag}.kind must be one of ${EVENT_KINDS.join('|')}`);
    }
    const id = requireText(record['id'], `${flag}.id`);
    if (kind === 'unit-started') return { kind, id };
    if (kind === 'unit-completed') return { kind, id };
    const reason = record['reason'];
    if (typeof reason !== 'string' || reason === '') {
      throw new KernelError(`${flag}.reason must be a non-empty string for ${kind}`);
    }
    return kind === 'unit-failed' ? { kind: 'unit-failed', id, reason } : { kind: 'unit-blocked', id, reason };
  }

  // Which fact a breaker state needs is the state's own business
  // (src/kernel/breaker.ts), so an absent optional field stays UNDECLARED here
  // rather than being defaulted into a fact the state would then read.
  export function parseBreaker(flag: string, raw: string): BreakerFacts {
    const record = requireRecord(parseJson(flag, raw), flag);
    const facts: BreakerFacts = { state: requireText(record['state'], `${flag}.state`) };
    const failures = record['failures'];
    if (failures !== undefined) facts.failures = requireCount(failures, `${flag}.failures`);
    const cooldown = record['cooldownElapsed'];
    if (cooldown !== undefined) {
      if (typeof cooldown !== 'boolean') throw new KernelError(`${flag}.cooldownElapsed must be a boolean`);
      facts.cooldownElapsed = cooldown;
    }
    const probe = record['probeResult'];
    if (probe !== undefined) facts.probeResult = requireText(probe, `${flag}.probeResult`);
    return facts;
  }

  function parseUnit(row: unknown, at: string): SchedulerUnit {
    const record = requireRecord(row, at);
    const state = record['state'];
    if (typeof state !== 'string' || !isUnitState(state)) {
      throw new KernelError(`${at}.state must be one of ${UNIT_STATES.join('|')}`);
    }
    return {
      id: requireText(record['id'], `${at}.id`),
      dependsOn: optionalStrings(record['dependsOn'], `${at}.dependsOn must be an array of unit ids`),
      state,
      attempts: requireCount(record['attempts'], `${at}.attempts`),
      agent: requireAgentField(record['agent'], `${at}.agent`),
      modelTier: requireText(record['modelTier'], `${at}.modelTier`),
    };
  }

  function isUnitState(value: string): value is UnitState {
    return UNIT_STATES.some((state) => state === value);
  }

  function parseJson(flag: string, raw: string): unknown {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new KernelError(`${flag} is not valid JSON`);
    }
  }

  function requireRecord(value: unknown, at: string): Record<string, unknown> {
    if (!isRecord(value)) throw new KernelError(`${at} must be a JSON object`);
    return value;
  }

  function requireText(value: unknown, at: string): string {
    if (typeof value !== 'string' || value === '') throw new KernelError(`${at} must be a non-empty string`);
    return value;
  }

  function requireString(value: unknown, at: string): string {
    if (typeof value !== 'string') throw new KernelError(`${at} must be a string`);
    return value;
  }

  // null is a declared fact here, not a missing one: it is F1's direct-lane unit,
  // which src/scheduler/state.ts refuses by name rather than by type.
  function requireAgentField(value: unknown, at: string): string | null {
    if (value === null) return null;
    if (typeof value !== 'string' || value === '') throw new KernelError(`${at} must be a string or null`);
    return value;
  }

  function requireCount(value: unknown, at: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new KernelError(`${at} must be a whole non-negative number`);
    }
    return value;
  }

  function optionalStrings(value: unknown, message: string): string[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new KernelError(message);
    const items: unknown[] = value;
    return items.map((item) => {
      if (typeof item !== 'string') throw new KernelError(message);
      return item;
    });
  }
  ```

- [ ] **Step 4: Run it and see it pass**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/parse.test.js
  ```

  Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 5: Commit**

  ```bash
  git add src/scheduler/parse.ts src/scheduler/parse.test.ts
  git commit -m "feat(scheduler): validate the CLI's unit, state, event and breaker JSON" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 7: `scheduler plan` and `scheduler step` commands

**Files:**
- `src/scheduler/cli.ts` (created)
- `src/scheduler/index.ts` (created)
- `src/scheduler/cli.test.ts` (created)
- `src/scheduler/scheduler.e2e.test.ts` (created)
- `src/cli.ts` (modified)
- `docs/COMPATIBILITY.md` (modified)
- `dist/engineos.cjs` (rebuilt)

**Interfaces:**

Consumes: `parseFlags` (`src/kernel/cli.ts`), `lazyRegistries` / `Registries` (`src/kernel/context.ts`), `resolveRoot` (`src/registry/paths.ts`), `writeJson` / `Io` (`src/io.ts`), and Tasks 1-6.

Produces (F7):
```ts
export function runScheduler(argv: string[], io: Io): number;
```

| Command | Flags | Answer keys, in order |
|---|---|---|
| `engineos scheduler plan` | `--units <json>` (required), `--host-capacity <n\|unknown>` (optional, default `unknown`) | `capacity`, `state`, `admit`, `breaker`, `actions`, `retries`, `notes` |
| `engineos scheduler step` | `--state <json>` (required), `--event <json>` (required), `--retry-check <name>` (optional), `--breaker <json>` (optional) | `state`, `admit`, `breaker`, `actions`, `retries`, `notes` |

An absent `--host-capacity` means the host capacity is unknown, which is the honest default for a CLI with no process to launch into: the policy cap is used and `host-capacity-unknown` appears in `capacity.notes`.

- [ ] **Step 1: Write the failing in-process arm test**

  Create `src/scheduler/cli.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { lazyRegistries } from '../kernel/context';
  import { isRecord } from '../lib/json';
  import { resolveRoot } from '../registry/paths';
  import { runInProcess, type RunResult } from '../testing/harness';
  import { runScheduler } from './cli';

  // The arms answer from the registry this env names, exactly as
  // src/kernel/cli.test.ts pins it: a case must never resolve a different root
  // from the one its expectations were read out of.
  const env = { ENGINEOS_ROOT: resolveRoot(process.env, __dirname) };
  const regs = lazyRegistries(env.ENGINEOS_ROOT);
  const CAP = regs.policy.parallelism.wave_concurrency_cap;
  const CHECK = regs.policy.repair.checks[0] ?? 'lint';

  const UNITS = JSON.stringify([
    { id: 'a', domains: ['backend'], files: ['src/a.ts'], workType: 'implementation', agent: 'backend-coordinator', modelTier: 'build', dependsOn: [] },
    { id: 'b', domains: ['backend'], files: ['src/b.ts'], workType: 'implementation', agent: 'backend-coordinator', modelTier: 'build', dependsOn: ['a'] },
  ]);

  function scheduler(args: string[]): RunResult {
    return runInProcess(runScheduler, args, { env });
  }

  function body(result: RunResult): Record<string, unknown> {
    const parsed: unknown = JSON.parse(result.stdout);
    if (!isRecord(parsed)) throw new Error(`the scheduler answered non-object JSON: ${result.stdout}`);
    return parsed;
  }

  function record(value: unknown, at: string): Record<string, unknown> {
    if (!isRecord(value)) throw new Error(`${at} is not a JSON object`);
    return value;
  }

  test('plan answers the resolved capacity, the initial state and the first actions', () => {
    const result = scheduler(['plan', '--units', UNITS]);
    assert.equal(result.status, 0, result.stdout);
    const answer = body(result);
    assert.deepEqual(Object.keys(answer), ['capacity', 'state', 'admit', 'breaker', 'actions', 'retries', 'notes']);
    const capacity = record(answer['capacity'], 'capacity');
    assert.equal(capacity['capacity'], CAP);
    assert.deepEqual(capacity['notes'], ['host-capacity-unknown']);
    const state = record(answer['state'], 'state');
    assert.equal(state['capacity'], CAP);
    assert.deepEqual(answer['actions'], [{ kind: 'launch', id: 'a', agent: 'backend-coordinator', modelTier: 'build' }]);
  });

  test('a host capacity below the policy cap binds the plan', () => {
    const answer = body(scheduler(['plan', '--units', UNITS, '--host-capacity', '1']));
    assert.equal(record(answer['capacity'], 'capacity')['capacity'], 1);
    assert.deepEqual(record(answer['capacity'], 'capacity')['notes'], ['host-capacity-binding']);
  });

  test('an explicit unknown host capacity is the same answer as an absent flag', () => {
    const explicit = body(scheduler(['plan', '--units', UNITS, '--host-capacity', 'unknown']));
    const absent = body(scheduler(['plan', '--units', UNITS]));
    assert.deepEqual(explicit, absent);
  });

  test('step applies the event and answers the next actions', () => {
    const planned = body(scheduler(['plan', '--units', UNITS]));
    const started = body(scheduler(['step', '--state', JSON.stringify(planned['state']), '--event', '{"kind":"unit-started","id":"a"}']));
    assert.deepEqual(Object.keys(started), ['state', 'admit', 'breaker', 'actions', 'retries', 'notes']);
    const completed = body(scheduler(['step', '--state', JSON.stringify(started['state']), '--event', '{"kind":"unit-completed","id":"a"}']));
    assert.deepEqual(completed['actions'], [{ kind: 'launch', id: 'b', agent: 'backend-coordinator', modelTier: 'build' }]);
    assert.equal(record(completed['state'], 'state')['waveIndex'], 1);
  });

  test('a failure with a declared check answers a retry in place of the barrier halt', () => {
    const planned = body(scheduler(['plan', '--units', UNITS]));
    const started = body(scheduler(['step', '--state', JSON.stringify(planned['state']), '--event', '{"kind":"unit-started","id":"a"}']));
    const failed = body(scheduler([
      'step', '--state', JSON.stringify(started['state']),
      '--event', '{"kind":"unit-failed","id":"a","reason":"typecheck red"}',
      '--retry-check', CHECK,
    ]));
    assert.deepEqual(failed['actions'], [{ kind: 'retry', id: 'a', modelTier: 'build' }]);
    const retries = failed['retries'];
    assert.ok(Array.isArray(retries) && retries.length === 1);
    assert.equal(record(retries[0], 'retries[0]')['action'], 'fix-same-tier');
  });

  test('the same failure with no declared check halts at the barrier and says why', () => {
    const planned = body(scheduler(['plan', '--units', UNITS]));
    const started = body(scheduler(['step', '--state', JSON.stringify(planned['state']), '--event', '{"kind":"unit-started","id":"a"}']));
    const failed = body(scheduler([
      'step', '--state', JSON.stringify(started['state']),
      '--event', '{"kind":"unit-failed","id":"a","reason":"typecheck red"}',
    ]));
    assert.deepEqual(failed['actions'], [{ kind: 'halt', reason: 'barrier-blocked: a' }]);
    assert.deepEqual(failed['retries'], []);
    assert.deepEqual(failed['notes'], ['retry-check-undeclared']);
  });

  test('a declared open breaker defers instead of launching', () => {
    const planned = body(scheduler(['plan', '--units', UNITS]));
    const answer = body(scheduler([
      'step', '--state', JSON.stringify(planned['state']),
      '--event', '{"kind":"unit-started","id":"a"}',
      '--breaker', '{"state":"open","cooldownElapsed":false}',
    ]));
    assert.deepEqual(answer['notes'], ['breaker-blocked']);
    assert.equal(record(answer['breaker'], 'breaker')['allow'], false);
  });

  test('a missing or unknown flag is refused with a JSON error and exit 1', () => {
    const missing = scheduler(['plan']);
    assert.equal(missing.status, 1);
    assert.equal(body(missing)['error'], 'scheduler plan requires --units <json array>');

    const unknownFlag = scheduler(['plan', '--units', UNITS, '--speed', 'fast']);
    assert.equal(unknownFlag.status, 1);
    assert.equal(body(unknownFlag)['error'], 'scheduler plan: unknown flag --speed');

    const unknownSub = scheduler(['sprint']);
    assert.equal(unknownSub.status, 1);
    assert.equal(body(unknownSub)['error'], 'unknown subcommand: sprint');

    const badCapacity = scheduler(['plan', '--units', UNITS, '--host-capacity', 'lots']);
    assert.equal(badCapacity.status, 1);
    assert.equal(body(badCapacity)['error'], 'scheduler plan: --host-capacity must be a whole non-negative number or the word unknown');
  });
  ```

- [ ] **Step 2: Run it and see it fail**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/cli.test.js
  ```

  Expected failure: `tsc` stops with `error TS2307: Cannot find module './cli' or its corresponding type declarations.`

- [ ] **Step 3: Implement the two arms**

  Create `src/scheduler/cli.ts`:

  ```ts
  import { writeJson, type Io } from '../io';
  import { parseFlags } from '../kernel/cli';
  import { lazyRegistries, type Registries } from '../kernel/context';
  import { KernelError } from '../lib/json';
  import { resolveRoot } from '../registry/paths';
  import { resolveCapacity, type HostLauncher } from './launcher';
  import { parseBreaker, parseEvent, parseState, parseUnits } from './parse';
  import { decide, type DecisionFacts } from './policy';
  import { apply, initialState } from './state';

  type Sub = (regs: Registries, args: string[]) => unknown;

  const SUBCOMMANDS: Record<string, Sub> = {
    plan: planCommand,
    step: stepCommand,
  };

  export function runScheduler(argv: string[], io: Io): number {
    const [name, ...args] = argv;
    try {
      const sub = name === undefined ? undefined : SUBCOMMANDS[name];
      if (sub === undefined) throw new KernelError(`unknown subcommand: ${name ?? ''}`);
      const root = resolveRoot(io.env);
      writeJson(io, sub(lazyRegistries(root), args));
      return 0;
    } catch (e) {
      if (e instanceof KernelError) {
        writeJson(io, { error: e.message });
        return 1;
      }
      throw e;
    }
  }

  function planCommand(regs: Registries, args: string[]): unknown {
    const flags = parseFlags('scheduler plan', args, ['--units', '--host-capacity']);
    const raw = flags.get('--units');
    if (raw === undefined || raw === '') throw new KernelError('scheduler plan requires --units <json array>');
    const capacity = resolveCapacity(regs.policy.parallelism.wave_concurrency_cap, reportingHost(flags.get('--host-capacity')));
    const state = initialState(parseUnits('--units', raw), capacity.capacity);
    const decision = decide({ state }, regs);
    return {
      capacity,
      state,
      admit: decision.admit,
      breaker: decision.breaker,
      actions: decision.actions,
      retries: decision.retries,
      notes: decision.notes,
    };
  }

  function stepCommand(regs: Registries, args: string[]): unknown {
    const flags = parseFlags('scheduler step', args, ['--state', '--event', '--retry-check', '--breaker']);
    const rawState = flags.get('--state');
    if (rawState === undefined || rawState === '') throw new KernelError('scheduler step requires --state <json>');
    const rawEvent = flags.get('--event');
    if (rawEvent === undefined || rawEvent === '') throw new KernelError('scheduler step requires --event <json>');

    const state = apply(parseState('--state', rawState), parseEvent('--event', rawEvent));
    const facts: DecisionFacts = { state };
    const check = flags.get('--retry-check');
    if (check !== undefined) facts.retryCheck = check;
    const breaker = flags.get('--breaker');
    if (breaker !== undefined) facts.breaker = parseBreaker('--breaker', breaker);

    const decision = decide(facts, regs);
    return {
      state,
      admit: decision.admit,
      breaker: decision.breaker,
      actions: decision.actions,
      retries: decision.retries,
      notes: decision.notes,
    };
  }

  // This arm has no process to launch into: it reports the host's capacity and
  // answers next actions. Calling launch() through it is a caller error, not a
  // silent no-op that would let a "launched" line be written for a wave nobody
  // ran (templates/adapters/README.md states the same thing per adapter).
  function reportingHost(raw: string | undefined): HostLauncher {
    return {
      capacity: parseHostCapacity(raw),
      launch: (): Promise<never> =>
        Promise.reject(new KernelError('scheduler: the CLI answers actions and holds no launcher — a host adapter performs the launch')),
    };
  }

  function parseHostCapacity(raw: string | undefined): number | null {
    if (raw === undefined || raw === 'unknown') return null;
    if (!/^[0-9]+$/.test(raw)) {
      throw new KernelError('scheduler plan: --host-capacity must be a whole non-negative number or the word unknown');
    }
    return Number.parseInt(raw, 10);
  }
  ```

- [ ] **Step 4: Run the arm test and see it pass**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/cli.test.js
  ```

  Expected: PASS — 8 tests, 0 failures.

- [ ] **Step 5: Register the command in the entry point and add the barrel**

  Create `src/scheduler/index.ts`:

  ```ts
  export { runScheduler } from './cli';
  export { apply, initialState, nextActions } from './state';
  export type { SchedulerAction, SchedulerEvent, SchedulerState, SchedulerUnit, UnitState } from './state';
  export { fakeLauncher, resolveCapacity, FAKE_LAUNCH_NOTE } from './launcher';
  export type { CapacityNote, CapacityResolution, FakeLauncher, HostLauncher, LaunchOutcome, LaunchRequest, LaunchStatus } from './launcher';
  export { decide } from './policy';
  export type { DecisionFacts, DecisionNote, RetryDecision, SchedulerDecision } from './policy';
  ```

  In `src/cli.ts`, add the import beside the other area imports (keep the existing alphabetical-by-area grouping the file already uses; place it after `import { runKernel } from './kernel/cli';`):

  ```ts
  import { runScheduler } from './scheduler/cli';
  ```

  and add the row to the existing `CommandTable`:

  ```ts
  const table: CommandTable = {
    kernel: runKernel,
    scheduler: runScheduler,
    journal: runJournal,
    telemetry: runTelemetry,
    hook: runHook,
    init: runInit,
    'settings-merge': runSettingsMerge,
    bypass: runBypass,
    gen: runGen,
    evals: runEvals,
    bench: runBench,
    'usage-report': runUsageReport,
    validate: runValidate,
  };
  ```

- [ ] **Step 6: Write the failing e2e test and rebuild the bundle**

  Create `src/scheduler/scheduler.e2e.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { isRecord } from '../lib/json';
  import { runCli, type RunResult } from '../testing/harness';

  // Black-box: proves the command is registered in the built bundle, which the
  // in-process arm test cannot see.
  const UNITS = JSON.stringify([
    { id: 'a', domains: ['backend'], files: ['src/a.ts'], workType: 'implementation', agent: 'backend-coordinator', modelTier: 'build', dependsOn: [] },
  ]);

  function body(result: RunResult): Record<string, unknown> {
    const parsed: unknown = JSON.parse(result.stdout);
    if (!isRecord(parsed)) throw new Error(`the scheduler answered non-object JSON: ${result.stdout}`);
    return parsed;
  }

  test('engineos scheduler plan answers through the built bundle', () => {
    const result = runCli(['scheduler', 'plan', '--units', UNITS]);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.deepEqual(body(result)['actions'], [
      { kind: 'launch', id: 'a', agent: 'backend-coordinator', modelTier: 'build' },
    ]);
  });

  test('engineos scheduler step applies an event through the built bundle', () => {
    const planned = body(runCli(['scheduler', 'plan', '--units', UNITS]));
    const result = runCli(['scheduler', 'step', '--state', JSON.stringify(planned['state']), '--event', '{"kind":"unit-started","id":"a"}']);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.deepEqual(body(result)['actions'], []);
  });

  test('an unknown scheduler subcommand exits 1 with a JSON error', () => {
    const result = runCli(['scheduler', 'sprint']);
    assert.equal(result.status, 1);
    assert.equal(body(result)['error'], 'unknown subcommand: sprint');
  });
  ```

  Run it against the current (unrebuilt) bundle first:

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test scheduler/scheduler.e2e.test.js
  ```

  Expected failure: all three cases fail with `{"error": "unknown command: scheduler"}` and exit 1 — the committed bundle predates the registration.

  Then rebuild and re-run:

  ```bash
  npm run build && npx tsc -p tsconfig.json && cd build && node --test scheduler/scheduler.e2e.test.js
  ```

  Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 7: Declare the new surface in `docs/COMPATIBILITY.md`**

  In the "What is public surface" table, add `scheduler` to the runtime entry point row's list of subcommand names, so it reads:

  ```
  | Runtime entry point `dist/engineos.cjs` subcommand names (`kernel`, `scheduler`, `journal`, `telemetry`, `hook`, `init`, `bypass`, `gen`, `evals`, `bench`, `usage-report`, `validate`, `settings-merge`) and their stdout/exit contracts | Registered in `hooks/hooks.json`, called by the installers, CI and every `.sh` shim; the shims' deprecation window assumes these names hold |
  ```

  Then, directly after the paragraph listing the kernel subcommands, add:

  ```markdown
  `scheduler` is the one entry-point command EngineOS 2.0 adds, and adding it is
  MINOR: `engineos scheduler plan --units '<json>'` takes the `units` array that
  `engineos kernel execution` answers and emits the initial state with its first
  actions, and `engineos scheduler step --state '<json>' --event '<json>'` applies
  one event and emits the next ones. Both are versioned surface from the day they
  land: the two subcommand names, their flags (`--units`, `--host-capacity`,
  `--state`, `--event`, `--retry-check`, `--breaker`) and their answer keys
  (`capacity`, `state`, `admit`, `breaker`, `actions`, `retries`, `notes`) are
  renamed only through the deprecation window below. Neither command launches
  anything: the launch boundary is the host adapter's, and
  [`templates/adapters/README.md`](../templates/adapters/README.md) states per
  adapter what it can actually enforce.
  ```

- [ ] **Step 8: Run the full suite and the validator**

  ```bash
  npm run build && npm run typecheck && npm test && node dist/engineos.cjs validate
  ```

  Expected: PASS — the whole suite green, and `validate` reporting no failing check. If `validate` flags the COMPATIBILITY edit, the mirror it names is the fix; do not weaken the check.

- [ ] **Step 9: Commit**

  ```bash
  git add src/scheduler/cli.ts src/scheduler/index.ts src/scheduler/cli.test.ts src/scheduler/scheduler.e2e.test.ts src/cli.ts docs/COMPATIBILITY.md dist/engineos.cjs
  git commit -m "feat(scheduler): register scheduler plan and step commands" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

  The `dist/engineos.cjs` hunk is generated output; exclude it from the PR line count and say so in the PR description (`rules/git.md`).

---

### Task 8: Honest per-adapter launch capability

**Files:**
- `templates/adapters/README.md` (modified)
- `docs/METHODOLOGY.md` (modified)

**Interfaces:** none — this task writes the capability claim that Task 4's boundary and Task 7's commands are allowed to make, and retires the sentence they made false.

The claim to write, and its limit: EngineOS ships **no** host launcher in Wave 3. `FakeLauncher` is test-only. Every adapter therefore gets next-action guidance from `scheduler step`, and none gets enforcement. Writing anything stronger would be the fabricated enforcement claim the spec forbids ("it never claims that a calculated wave was launched").

- [ ] **Step 1: Add the launch row to the enforcement matrix**

  In `templates/adapters/README.md`, add one row to the `## Enforcement matrix` table, after the `Post-edit lint/typecheck` row:

  ```markdown
  | Launch a scheduled unit | guidance (`scheduler step`) | guidance | guidance | guidance |
  ```

- [ ] **Step 2: Add the section that says what "guidance" means**

  Append to `templates/adapters/README.md`, after the enforcement matrix:

  ```markdown
  ## Scheduler launch capability

  `engineos scheduler plan` and `engineos scheduler step` answer which units may be
  launched, which must be deferred and when a barrier halts. They launch nothing.
  The launch boundary is `HostLauncher` (`src/scheduler/launcher.ts`), and **EngineOS
  ships no implementation of it**: the only one in the repository is the test-only
  `fakeLauncher`, whose every outcome is stamped `fake-launcher: no process was
  started` so it can never be mistaken for a real launch.

  | Adapter | Native launch API | What the scheduler gives it today |
  |---|---|---|
  | Claude Code | the Task tool, driven by the model in its own turn | next actions the model reads and dispatches itself; nothing in EngineOS starts an agent |
  | Cursor | none exposed to an external process | next actions as guidance |
  | Codex | none exposed to an external process | next actions as guidance |
  | Copilot | none exposed to an external process | next actions as guidance |

  So the enforcement for this row is **conventional** in every adapter, including
  Claude Code. A wave the scheduler calculated and an orchestrator did not dispatch
  did not run, and the scheduler has no way to know the difference — which is why
  `capacity.notes` carries `host-capacity-unknown` whenever no host reported a
  number. An adapter that later supplies a real `HostLauncher` replaces the word
  guidance in its row with what it actually enforces, and not before.
  ```

- [ ] **Step 3: Retire the stale sentence in `docs/METHODOLOGY.md`**

  In `docs/METHODOLOGY.md`, the paragraph under the lifecycle diagram currently reads:

  > The kernel resolves these; it does not enforce them, and nothing in the repo calls `admit` before a dispatch today.

  Replace that clause so the sentence becomes:

  ```markdown
  id and a record home rather than an inference from the tier, and a gate citing
  anything outside that list is not citing policy. The kernel resolves these; it
  does not enforce them. `src/scheduler/policy.ts` asks `admit` before every
  dispatch decision and `breaker` whenever the caller declares a resource's health,
  so the answers now reach a dispatch loop — but the scheduler launches nothing
  itself, so what it produces is the next legal action, not an enforced one
  (`templates/adapters/README.md`). Only `high-risk` has an automatic producer
  (`resolve-task`, via `decision_rules.any_high`); the other reasons arrive from a
  caller that observed the situation. `kernel.sh` is the resolver for all three and
  `registries/policy.json` owns the values.
  ```

- [ ] **Step 4: Run the validator and the suite**

  ```bash
  node dist/engineos.cjs validate && npm test
  ```

  Expected: PASS — `validate` reports no failing check (no check greps either file today, so this confirms the edits introduced no mirror drift), and the suite stays green.

- [ ] **Step 5: Commit**

  ```bash
  git add templates/adapters/README.md docs/METHODOLOGY.md
  git commit -m "docs(scheduler): state each adapter's real launch capability" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

## Wave 3 barrier exit criteria

From the program plan, plus what this wave owes Wave 7:

- [ ] All eight tasks checked off, each with its own commit.
- [ ] `npm run build && npm run typecheck && npm test` green, output shown.
- [ ] `node dist/engineos.cjs validate` green.
- [ ] `dist/engineos.cjs` rebuilt and committed (Task 7).
- [ ] `docs/COMPATIBILITY.md` carries both new commands, their flags and their answer keys.
- [ ] `templates/adapters/README.md` claims guidance, not enforcement, for every adapter — and no document anywhere claims EngineOS launched a wave.
- [ ] A handoff written per `templates/handoff.md`, naming for Wave 7: the two new commands, the `scheduler` entry-point name, and the two contract notes below.

## Contract notes for the orchestrator

Both survived contact with the code as written, and neither required redefining a frozen interface. They are reported because Wave 7's migration guide has to describe them.

1. **F3 has no event that returns a `failed` unit to `ready`.** `SchedulerEvent` is closed at four kinds, and `attempts` only increments on `unit-started`, which requires `ready`. So `attempts` cannot exceed 1 through `apply` alone, and a retry is re-entered by the caller handing `scheduler step` a state whose unit is back in `ready` with `attempts` preserved. Task 6's `parseState` is what makes that state trustworthy. No event was invented.
2. **`SchedulerEvent` carries a `reason`; `SchedulerState` has nowhere to keep it.** `apply` validates it as non-empty and does not retain it — the caller's exec journal owns the account of a failure (`rules/observability.md`). `nextActions`'s halt reasons are therefore derived from state (`barrier-blocked: <ids>`, `dependency-stall: <ids>`), never from the event that caused the failure.
