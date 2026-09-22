# EngineOS 2.0 Fast Core — Wave 2: the control contract

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deterministic task contract answer HOW work executes. `resolve-task` gains an `execution` section that answers `unresolved | direct | delegate | wave` from declared scope facts against a registry-owned predicate, the two rules that currently mandate a dispatch for every routed unit state the direct lane instead, and a validator asserts the registry and the prose still say the same thing.

**Architecture:** One new kernel module (`src/kernel/execution.ts`) evaluating a predicate that lives entirely in `registries/policy.json` `.execution`, read through the existing fail-closed typed loader. The module is wired into `resolve` the same sparse way every other section is — the key is present exactly when its facts were declared — and exposed as one new kernel subcommand. The prose in `rules/parallelism.md` and `rules/subagents.md` becomes the human mirror of that registry block, and a new check family (`src/checks/execution-lane.ts`) fails CI when the two drift.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), esbuild to the committed `dist/engineos.cjs`, JSON registries, Node built-in test runner (`node --test`), node >= 18.

**Spec:** [docs/specs/2026-09-22-engineos-2-fast-core-design.md](../../specs/2026-09-22-engineos-2-fast-core-design.md) — sections "1. Task contract as the control plane" and "2. Risk-proportional fast lane".

**Program plan:** [2026-09-22-engineos-2-fast-core-00-program.md](./2026-09-22-engineos-2-fast-core-00-program.md) — frozen interfaces F1, F2 and F7 are consumed verbatim here.

---

## Global Constraints

The program plan's `## Global Constraints` section applies in full and is not restated. The six a Wave 2 implementer trips on:

- **`exactOptionalPropertyTypes: true`.** `ExecutionFacts.requestedMode?: ExecutionMode` cannot be assigned `undefined`. Build the object without the key and add it conditionally — `if (row['requestedMode'] !== undefined) facts.requestedMode = ...` — never `{ requestedMode: maybe }`.
- **`noUncheckedIndexedAccess: true`.** Every index read is `T | undefined`. `EXECUTION_MODES[0]`, `values[i]` and `row['key']` all need narrowing before use.
- **No `any`, no `as` to silence an error.** Unknown JSON is `unknown`, narrowed by `isRecord` / `typeof` / a type guard. The fact parser in `src/kernel/cli.ts` is the pattern to copy, key by key.
- **One `import` statement per module**, explicit return types on every exported function, `Number.parseInt` never the global.
- **KernelError refusal style.** An impossible or contradictory fact combination throws `KernelError` with a sentence naming the facts — never a fabricated default. `src/kernel/resolve.ts` lines 100-120 are the house voice.
- **`dist/engineos.cjs` is committed.** Any task that changes `src/` rebuilds it; Task 8 owns the single rebuild for this wave, and no earlier task commits a stale-or-rebuilt bundle.

Two more that bite specifically here:

- **`src/checks/prose-truth.ts` C37 asserts the check count.** Registering a check id changes the registered count, so `CLAUDE.md`, `AGENTS.md`, `README.md` and `docs/CODEBASE_MAP.md` must be edited in the SAME commit. Today's count is 68.
- **The rule-closure rule.** `scripts/validate-engineos.sh` fails when a rule file cross-references a `rules/<name>.md` that a router row loading the first does not also load. Do NOT add a new `rules/*.md` reference to `rules/parallelism.md` or `rules/subagents.md`. Cite `registries/policy.json` and `engineos kernel execution` instead; the references already present (`models.md`, `parallelism.md`, `risk-autonomy.md`, `verification.md` from parallelism; `models.md`, `parallelism.md`, `verification.md` from subagents) stay as they are.

---

## File Structure

| File | Create / Modify | Single responsibility |
|---|---|---|
| `registries/policy.json` | Modify (insert after `.parallelism`, which ends at line 151, before `"retry"` at line 152) | Owns the execution-lane predicate as data: the mode vocabulary, the `direct_lane` bounds and the `wave_lane` thresholds. |
| `src/registry/policy.ts` | Modify (interfaces after `ParallelismPolicy` ~line 108; loader body after the `parallelism` block ~line 262) | Fail-closed typed load of `.execution`. Refuses a malformed block instead of defaulting one. |
| `src/registry/policy-execution.test.ts` | Create | Proves the shipped `.execution` block loads with the values the kernel reads, and that each missing field is a named refusal. |
| `src/kernel/execution.ts` | Create | F1's `ExecutionMode` / `ExecutionFacts` / `ExecutionUnit` / `ExecutionSection` and F2's resolution order. The only place a lane is decided. |
| `src/kernel/execution.test.ts` | Create | The resolution order, the reason vocabulary, the refusals, and fail-closed behaviour against a mutated policy. |
| `src/kernel/resolve.ts` | Modify (`DeclaredFacts` ~line 53, `Answer` ~line 71, body after the `waves` block ~line 165) | Carries `execution` as one more sparse section: present iff its facts were declared. |
| `src/kernel/resolve.test.ts` | Modify (append) | The sparse-key claim for `execution`: absent facts answer no key. |
| `src/kernel/cli.ts` | Modify (`SUBCOMMANDS` ~line 43, `parseFacts` switch ~line 330, helpers below it) | Parses execution facts out of JSON and registers the `execution` subcommand (F7). |
| `src/kernel/cli.test.ts` | Modify (append) | The subcommand's answer, its empty-object `unresolved` form, and its refusals. |
| `rules/parallelism.md` | Modify (new `## Execution lanes` section before line 7; `## Decompose-and-distribute` heading and bullet 2 at lines 7-22) | Human mirror of `.execution`: the mode table and the lane bounds. |
| `rules/subagents.md` | Modify (lines 6-20) | The 2.0 semantic break: dispatch is proportional to the lane, not mandatory for every routed unit. |
| `src/checks/execution-lane.ts` | Create | Check family: C38 (the block is well formed), C38b (the kernel answers the lane the block declares), C38c (the prose mirrors the block). |
| `src/checks/execution-lane.test.ts` | Create | Unit coverage for the three checks against the shipped tree and against planted drift. |
| `src/checks/ids.ts` | Modify (append to `CHECK_IDS`) | Declares `C38`, `C38b`, `C38c`. |
| `src/checks/index.ts` | Modify (import + `CHECKS` array) | Registers the family. |
| `src/checks/mirrors.ts` | Modify (append rows before the closing `] satisfies`) | The registry-to-document rows C38c runs. |
| `src/checks/mirrors.test.ts` | Modify (`PORTED` list) | Asserts C38c has at least one row. |
| `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/CODEBASE_MAP.md` | Modify (check-count literals) | Keep C37's claim true. |
| `docs/COMPATIBILITY.md` | Modify (`## Unreleased` table) | Inventories the added subcommand, the added registry block and the removed 1.x dispatch mandate. |
| `dist/engineos.cjs` | Modify (rebuilt) | The committed runtime artifact every hook and installer executes. |

---

### Task 1: The `.execution` registry block and its typed loader

**Files:**
- Modify `registries/policy.json` — insert a `"execution"` key between `.parallelism` (ends line 151) and `"retry"` (line 152).
- Modify `src/registry/policy.ts` — add `DirectLanePolicy`, `WaveLanePolicy`, `ExecutionPolicy` after `ParallelismPolicy` (~line 108); add `execution` to `PolicyRegistry` (~line 118); add the reader in `loadPolicy` (~line 262).
- Create `src/registry/policy-execution.test.ts`.

**Interfaces:**
- Consumes: `strictReader('policy.json')` -> `{ malformed, requireRecord, requireString, requireNumber, requireBoolean, requireStrings }`; `isRiskTier(value: unknown): value is RiskTier` from `./intents`.
- Produces:
  ```ts
  export interface DirectLanePolicy {
    max_risk: RiskTier;
    requires_reversible: boolean;
    max_domains: number;
    max_units: number;
    max_files: number;
    forbid_security_sensitive: boolean;
    forbid_required_agents: boolean;
  }
  export interface WaveLanePolicy { min_units: number; min_domains: number }
  export interface ExecutionPolicy { modes: string[]; direct_lane: DirectLanePolicy; wave_lane: WaveLanePolicy }
  // PolicyRegistry gains: execution: ExecutionPolicy;
  ```

- [ ] **Step 1: Write the failing loader test.** Create `src/registry/policy-execution.test.ts`:
  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { KernelError, isRecord } from '../lib/json';
  import { loadPolicy } from './policy';
  import { resolveRoot } from './paths';
  import { relocatedRoot, tempRoot } from '../testing/harness';

  const root = resolveRoot({}, __dirname);

  test('the shipped execution block carries the whole direct-lane predicate', () => {
    const execution = loadPolicy(root).execution;
    assert.deepEqual(execution.modes, ['unresolved', 'direct', 'delegate', 'wave']);
    assert.deepEqual(execution.direct_lane, {
      max_risk: 'low',
      requires_reversible: true,
      max_domains: 1,
      max_units: 1,
      max_files: 2,
      forbid_security_sensitive: true,
      forbid_required_agents: true,
    });
    assert.deepEqual(execution.wave_lane, { min_units: 3, min_domains: 2 });
  });

  test('a max_risk outside the tier vocabulary is refused, and the error names the field', (t) => {
    const mutated = relocatedRoot(tempRoot(t), {
      mutate: (policy) => {
        directLane(policy)['max_risk'] = 'catastrophic';
      },
    });
    assert.throws(
      () => loadPolicy(mutated),
      kernelError('registries/policy.json: .execution.direct_lane.max_risk must be low|medium|high'),
    );
  });

  test('a direct lane with no max_files is refused instead of defaulting a bound', (t) => {
    const mutated = relocatedRoot(tempRoot(t), {
      mutate: (policy) => {
        delete directLane(policy)['max_files'];
      },
    });
    assert.throws(
      () => loadPolicy(mutated),
      kernelError('registries/policy.json: .execution.direct_lane.max_files must be a number'),
    );
  });

  test('a policy with no execution block is refused', (t) => {
    const mutated = relocatedRoot(tempRoot(t), {
      mutate: (policy) => {
        delete policy['execution'];
      },
    });
    assert.throws(
      () => loadPolicy(mutated),
      kernelError('registries/policy.json: .execution must be an object'),
    );
  });

  function directLane(policy: Record<string, unknown>): Record<string, unknown> {
    const execution = policy['execution'];
    if (!isRecord(execution)) throw new Error('fixture execution is not an object');
    const lane = execution['direct_lane'];
    if (!isRecord(lane)) throw new Error('fixture direct_lane is not an object');
    return lane;
  }

  function kernelError(message: string): (error: unknown) => boolean {
    return (error: unknown): boolean => {
      if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
      assert.equal(error.message, message);
      return true;
    };
  }
  ```

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test registry/policy-execution.test.js`
  Expected failure: tsc reports `src/registry/policy-execution.test.ts(13,46): error TS2339: Property 'execution' does not exist on type 'PolicyRegistry'.` — nothing compiles, so no test runs.

- [ ] **Step 3: Add the registry block.** In `registries/policy.json`, insert between the closing brace of `"parallelism"` (line 151) and `"retry"` (line 152):
  ```json
  "execution": {
    "note": "Risk-proportional execution lane. Answered by the kernel execution section (engineos kernel execution --facts, and resolve --facts {\"execution\": ...}); mirrored in rules/parallelism.md 'Execution lanes' and rules/subagents.md 'Dispatch is proportional'. direct removes the subagent brief/wait/return/integration cycle only — never a gate: risk classification, the scoped file list, the final validation gate, security review, the critic pass and release approval all still apply and each overrides the lane. An adapter may lower the lane or the capacity; it may never raise delegate/wave to direct. scripts/validate-engineos.sh C38 checks the block, C38b the kernel's answer and C38c the prose.",
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
  },
  ```

- [ ] **Step 4: Add the types to the loader.** In `src/registry/policy.ts`, change the intents import to carry the guard, and add the three interfaces after `ParallelismPolicy`:
  ```ts
  // replaces `import type { RiskTier } from './intents';` — one import per module
  import { isRiskTier, type RiskTier } from './intents';
  ```
  ```ts
  export interface DirectLanePolicy {
    max_risk: RiskTier;
    requires_reversible: boolean;
    max_domains: number;
    max_units: number;
    max_files: number;
    forbid_security_sensitive: boolean;
    forbid_required_agents: boolean;
  }

  export interface WaveLanePolicy {
    min_units: number;
    min_domains: number;
  }

  // The direct-lane predicate as DATA. The kernel evaluates it and never spells a
  // bound of its own, so re-parameterising the lane is a registry edit plus its
  // prose mirror — not a code change.
  export interface ExecutionPolicy {
    modes: string[];
    direct_lane: DirectLanePolicy;
    wave_lane: WaveLanePolicy;
  }
  ```
  Add `execution: ExecutionPolicy;` to `PolicyRegistry`, after `parallelism`.

- [ ] **Step 5: Add the reader.** In `src/registry/policy.ts`, extend the destructure to take `malformed`:
  ```ts
  const { malformed, requireRecord, requireString, requireNumber, requireBoolean, requireStrings, requireRows } =
    strictReader('policy.json');
  ```
  Add the three records beside the other `requireRecord` calls at the top of `loadPolicy`:
  ```ts
  const execution = requireRecord(p['execution'], '.execution');
  const directLane = requireRecord(execution['direct_lane'], '.execution.direct_lane');
  const waveLane = requireRecord(execution['wave_lane'], '.execution.wave_lane');
  ```
  Add the block to the returned object, after `parallelism`:
  ```ts
  execution: {
    modes: requireStrings(execution['modes'], '.execution.modes'),
    direct_lane: {
      max_risk: requireTier(directLane['max_risk'], '.execution.direct_lane.max_risk'),
      requires_reversible: requireBoolean(
        directLane['requires_reversible'],
        '.execution.direct_lane.requires_reversible',
      ),
      max_domains: requireNumber(directLane['max_domains'], '.execution.direct_lane.max_domains'),
      max_units: requireNumber(directLane['max_units'], '.execution.direct_lane.max_units'),
      max_files: requireNumber(directLane['max_files'], '.execution.direct_lane.max_files'),
      forbid_security_sensitive: requireBoolean(
        directLane['forbid_security_sensitive'],
        '.execution.direct_lane.forbid_security_sensitive',
      ),
      forbid_required_agents: requireBoolean(
        directLane['forbid_required_agents'],
        '.execution.direct_lane.forbid_required_agents',
      ),
    },
    wave_lane: {
      min_units: requireNumber(waveLane['min_units'], '.execution.wave_lane.min_units'),
      min_domains: requireNumber(waveLane['min_domains'], '.execution.wave_lane.min_domains'),
    },
  },
  ```
  And add the tier narrowing beside `requireStringMap` at the bottom of the file:
  ```ts
  // A ceiling on the direct lane that is not a tier would compare as a plain
  // string against a classified risk, and every tier would look "at or below" it.
  function requireTier(value: unknown, path: string): RiskTier {
    const tier = requireString(value, path);
    if (!isRiskTier(tier)) malformed(`${path} must be low|medium|high`);
    return tier;
  }
  ```

- [ ] **Step 6: Run it and see it pass.** `npx tsc -p tsconfig.json && cd build && node --test registry/policy-execution.test.js`
  Expected: `# pass 4  # fail 0`.

- [ ] **Step 7: Commit.**
  ```bash
  git add registries/policy.json src/registry/policy.ts src/registry/policy-execution.test.ts
  git commit -m "feat(registry): add the execution-lane predicate to policy.json

The direct/delegate/wave lane is registry-owned data read through the
fail-closed typed loader, so the kernel evaluates a predicate it never
spells. A malformed block is a named refusal, not a defaulted bound.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 2: `src/kernel/execution.ts` — F1's section and F2's resolution order

**Files:**
- Create `src/kernel/execution.ts`.
- Create `src/kernel/execution.test.ts`.

**Interfaces:**
- Consumes: `ExecutionPolicy` (Task 1); `Registries` and `RiskTier` from `./context`; `KernelError` from `../lib/json`.
- Produces (F1 verbatim, plus three additions the frozen list does not forbid and Tasks 4 and 6 consume):
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

  export const EXECUTION_MODES: readonly ExecutionMode[];
  export function executionSection(facts: ExecutionFacts, regs: Registries): ExecutionSection;
  export function unresolvedExecution(regs: Registries): ExecutionSection;
  export function isExecutionMode(value: unknown): value is ExecutionMode;
  ```

- [ ] **Step 1: Write the failing test for the direct lane and the unresolved answer.** Create `src/kernel/execution.test.ts`:
  ```ts
  import { test, type TestContext } from 'node:test';
  import assert from 'node:assert/strict';
  import { KernelError, isRecord } from '../lib/json';
  import { resolveRoot } from '../registry/paths';
  import { relocatedRoot, tempRoot } from '../testing/harness';
  import { lazyRegistries, type Registries } from './context';
  import { executionSection, unresolvedExecution, isExecutionMode, EXECUTION_MODES, type ExecutionFacts } from './execution';

  const regs = lazyRegistries(resolveRoot({}, __dirname));
  const LANE = regs.policy.execution.direct_lane;
  const WAVE = regs.policy.execution.wave_lane;
  const CAP = regs.policy.parallelism.wave_concurrency_cap;

  // Every fixture is derived from the registry the section itself reads: a
  // literal fileCount of 2 is "inside the lane" for exactly one value of
  // max_files, and re-parameterising the lane must move the fixture rather than
  // turn a correct kernel red.
  const inTheLane: ExecutionFacts = {
    riskTier: LANE.max_risk,
    reversible: true,
    domainCount: LANE.max_domains,
    unitCount: LANE.max_units,
    fileCount: LANE.max_files,
    securitySensitive: false,
    requiredAgents: [],
  };

  test('facts inside every direct-lane bound answer direct, with no reasons', () => {
    const section = executionSection(inTheLane, regs);
    assert.deepEqual(Object.keys(section), ['mode', 'reasons', 'units', 'policyCapacity']);
    assert.equal(section.mode, 'direct');
    assert.deepEqual(section.reasons, []);
    assert.equal(section.policyCapacity, CAP);
  });

  // The kernel is handed counts, never a unit list, so it publishes none. The
  // same discipline as policyCapacity: never publish what you cannot observe.
  test('the section publishes no units, because no fact declares one', () => {
    assert.deepEqual(executionSection(inTheLane, regs).units, []);
  });

  test('undeclared facts answer unresolved, which is a lane and not an error', () => {
    const section = unresolvedExecution(regs);
    assert.equal(section.mode, 'unresolved');
    assert.deepEqual(section.reasons, ['facts-undeclared']);
    assert.deepEqual(section.units, []);
    assert.equal(section.policyCapacity, CAP);
  });

  test('the mode vocabulary is the registry vocabulary, in registry order', () => {
    assert.deepEqual([...EXECUTION_MODES], regs.policy.execution.modes);
    assert.equal(isExecutionMode('direct'), true);
    assert.equal(isExecutionMode('parallel'), false);
    assert.equal(isExecutionMode(3), false);
  });
  ```

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test kernel/execution.test.js`
  Expected failure: `src/kernel/execution.test.ts(8,124): error TS2307: Cannot find module './execution' or its corresponding type declarations.`

- [ ] **Step 3: Write the module.** Create `src/kernel/execution.ts`:
  ```ts
  import { KernelError } from '../lib/json';
  import type { ExecutionPolicy } from '../registry/policy';
  import type { Registries, RiskTier } from './context';

  // The execution lane: HOW a scoped unit of work runs, answered before WHO runs
  // it. The predicate is registries/policy.json .execution and nothing here
  // spells a bound of its own; this module only applies it, the way scale.ts
  // applies the prompt signals. rules/parallelism.md "Execution lanes" and
  // rules/subagents.md "Dispatch is proportional" are the prose mirror, and
  // validate C38* holds the three together.
  export type ExecutionMode = 'unresolved' | 'direct' | 'delegate' | 'wave';

  // Registry order, which is the order .execution.modes declares and C38 asserts.
  export const EXECUTION_MODES: readonly ExecutionMode[] = ['unresolved', 'direct', 'delegate', 'wave'];

  // Declared SCOPE facts, never inspected from the working tree: a kernel that
  // guessed a file count from prompt wording would qualify work for the direct
  // lane on the strength of how the request was phrased.
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

  // The closed reason vocabulary, in the order a section emits it. Stable slugs,
  // never prose: an adapter switches on these, and a reworded sentence would be
  // a silent behaviour change.
  const FACTS_UNDECLARED = 'facts-undeclared';
  const MODE_REQUESTED = 'mode-requested';

  // low < medium < high. A tier compared as a plain string would order 'high'
  // before 'low' and admit every tier into a lane capped at low.
  const TIER_RANK: Record<RiskTier, number> = { low: 0, medium: 1, high: 2 };

  export function isExecutionMode(value: unknown): value is ExecutionMode {
    return typeof value === 'string' && (EXECUTION_MODES as readonly string[]).includes(value);
  }

  // The answer for a caller that has not scoped the work yet. It is a lane, not a
  // failure: prompt-time routing legitimately knows no counts, and the adapter
  // may scope read-only until it does.
  export function unresolvedExecution(regs: Registries): ExecutionSection {
    return { mode: 'unresolved', reasons: [FACTS_UNDECLARED], units: [], policyCapacity: policyCapacity(regs) };
  }

  export function executionSection(facts: ExecutionFacts, regs: Registries): ExecutionSection {
    requireCount(facts.domainCount, 'domainCount');
    requireCount(facts.unitCount, 'unitCount');
    requireCount(facts.fileCount, 'fileCount');
    const execution = regs.policy.execution;
    const capacity = policyCapacity(regs);

    // Step 2 of the resolution order, and the only early return: a requested
    // delegate or wave is honoured as asked. A requested `direct` is advisory —
    // it falls through to the bounds below, because an adapter may lower a lane
    // and never raise one.
    const requested = facts.requestedMode;
    if (requested === 'unresolved') {
      throw new KernelError(
        'a requested execution mode of unresolved is not a request — a caller that cannot scope the work declares no execution facts at all',
      );
    }
    if (requested === 'delegate' || requested === 'wave') {
      return { mode: requested, reasons: [MODE_REQUESTED], units: [], policyCapacity: capacity };
    }

    const reasons = disqualifiers(facts, execution);
    if (reasons.length === 0) return { mode: 'direct', reasons, units: [], policyCapacity: capacity };
    return { mode: laneBeyondDirect(facts, execution), reasons, units: [], policyCapacity: capacity };
  }

  // ------------------------------------------------------------------ internals

  // Every reason the work is not `direct`, emitted in the vocabulary's own order
  // so the list is deterministic for a given fact set. An empty list IS the
  // direct lane — steps 3 and 4 of the resolution order collapse into one pass,
  // because "at least delegate" and "a bound was missed" are the same answer to
  // the only question step 4 asks.
  function disqualifiers(facts: ExecutionFacts, execution: ExecutionPolicy): string[] {
    const lane = execution.direct_lane;
    const reasons: string[] = [];
    if (TIER_RANK[facts.riskTier] > TIER_RANK[lane.max_risk]) reasons.push('risk-not-low');
    if (lane.requires_reversible && !facts.reversible) reasons.push('irreversible');
    if (facts.domainCount > lane.max_domains) reasons.push('multi-domain');
    if (facts.unitCount > lane.max_units) reasons.push('unit-count-exceeded');
    if (facts.fileCount > lane.max_files) reasons.push('file-count-exceeded');
    if (lane.forbid_security_sensitive && facts.securitySensitive) reasons.push('security-sensitive');
    if (lane.forbid_required_agents && facts.requiredAgents.length > 0) reasons.push('agent-required');
    return reasons;
  }

  // Step 5 then step 6. Security-sensitive work is "at least delegate", which is
  // why this is asked after the disqualifiers rather than instead of them: a
  // security-sensitive task of four units is still a wave.
  function laneBeyondDirect(facts: ExecutionFacts, execution: ExecutionPolicy): ExecutionMode {
    const wave = execution.wave_lane;
    if (facts.unitCount >= wave.min_units || facts.domainCount >= wave.min_domains) return 'wave';
    return 'delegate';
  }

  // Policy capacity, never a host capacity: the kernel cannot observe how many
  // agents a host will actually run, and publishing a number it cannot enforce
  // is the fabricated-enforcement claim the design exists to remove.
  function policyCapacity(regs: Registries): number {
    const cap = regs.policy.parallelism.wave_concurrency_cap;
    if (!Number.isInteger(cap) || cap < 1) {
      throw new KernelError(
        `policy.json .parallelism.wave_concurrency_cap must be a positive integer, not ${String(cap)}`,
      );
    }
    return cap;
  }

  // A negative or fractional count makes every bound comparison answer for a
  // scope that cannot exist, so it is refused before any policy is read.
  function requireCount(value: number, fact: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new KernelError(`execution requires a whole non-negative ${fact}`);
    }
  }
  ```

- [ ] **Step 4: Run it and see it pass.** `npx tsc -p tsconfig.json && cd build && node --test kernel/execution.test.js`
  Expected: `# pass 4  # fail 0`.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/kernel/execution.ts src/kernel/execution.test.ts
  git commit -m "feat(kernel): answer the execution lane from declared scope facts

The section applies registries/policy.json .execution and spells no bound
of its own. It publishes policy capacity and no units, because neither a
host capacity nor a unit list is a fact the kernel was given.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 3: The rest of F2's resolution order, under test

**Files:**
- Modify `src/kernel/execution.test.ts` (append after the existing tests).

**Interfaces:**
- Consumes: `executionSection`, `ExecutionFacts` (Task 2); `relocatedRoot` / `tempRoot` from `../testing/harness`; `lazyRegistries` from `./context`.
- Produces: no new surface. This task is coverage for the branches Task 2's four tests do not reach.

- [ ] **Step 1: Write the failing tests for steps 2, 3, 5 and 6 and the refusals.** Append to `src/kernel/execution.test.ts`:
  ```ts
  // --- the resolution order, step by step -------------------------------------

  test('a requested delegate or wave is honoured, and is the only reason given', () => {
    for (const requested of ['delegate', 'wave'] as const) {
      const section = executionSection({ ...inTheLane, requestedMode: requested }, regs);
      assert.equal(section.mode, requested);
      assert.deepEqual(section.reasons, [MODE_REQUESTED_SLUG]);
    }
  });

  // Advisory, per F2: a request cannot buy a lane the bounds refuse.
  test('a requested direct inside the bounds is direct; outside them it is not', () => {
    assert.equal(executionSection({ ...inTheLane, requestedMode: 'direct' }, regs).mode, 'direct');
    const section = executionSection(
      { ...inTheLane, requestedMode: 'direct', fileCount: LANE.max_files + 1 },
      regs,
    );
    assert.equal(section.mode, 'delegate');
    assert.deepEqual(section.reasons, ['file-count-exceeded']);
  });

  test('a requested unresolved is refused rather than answered', () => {
    assert.throws(
      () => executionSection({ ...inTheLane, requestedMode: 'unresolved' }, regs),
      kernelError(
        'a requested execution mode of unresolved is not a request — a caller that cannot scope the work declares no execution facts at all',
      ),
    );
  });

  test('security-sensitive work is at least delegate, whatever the bounds say', () => {
    const section = executionSection({ ...inTheLane, securitySensitive: true }, regs);
    assert.equal(section.mode, 'delegate');
    assert.deepEqual(section.reasons, ['security-sensitive']);
  });

  test('a required agent is at least delegate', () => {
    const section = executionSection({ ...inTheLane, requiredAgents: ['security-reviewer'] }, regs);
    assert.equal(section.mode, 'delegate');
    assert.deepEqual(section.reasons, ['agent-required']);
  });

  // "At least delegate" is not "exactly delegate": a gated task that is also
  // wave-shaped is a wave.
  test('security-sensitive work past the wave threshold is a wave, not a delegate', () => {
    const section = executionSection(
      { ...inTheLane, securitySensitive: true, unitCount: WAVE.min_units },
      regs,
    );
    assert.equal(section.mode, 'wave');
    assert.deepEqual(section.reasons, ['unit-count-exceeded', 'security-sensitive']);
  });

  test('the wave thresholds are reached by units or by domains, independently', () => {
    assert.equal(executionSection({ ...inTheLane, unitCount: WAVE.min_units }, regs).mode, 'wave');
    assert.equal(executionSection({ ...inTheLane, domainCount: WAVE.min_domains }, regs).mode, 'wave');
  });

  test('one bound missed short of the wave thresholds is a delegate', () => {
    const section = executionSection({ ...inTheLane, riskTier: 'medium', reversible: false }, regs);
    assert.equal(section.mode, 'delegate');
    assert.deepEqual(section.reasons, ['risk-not-low', 'irreversible']);
  });

  // The reasons are a closed vocabulary emitted in one fixed order, because an
  // adapter switches on them.
  test('every disqualifier is reported, in the vocabulary order', () => {
    const section = executionSection(
      {
        riskTier: 'high',
        reversible: false,
        domainCount: WAVE.min_domains,
        unitCount: WAVE.min_units,
        fileCount: LANE.max_files + 1,
        securitySensitive: true,
        requiredAgents: ['critic'],
      },
      regs,
    );
    assert.equal(section.mode, 'wave');
    assert.deepEqual(section.reasons, [
      'risk-not-low',
      'irreversible',
      'multi-domain',
      'unit-count-exceeded',
      'file-count-exceeded',
      'security-sensitive',
      'agent-required',
    ]);
  });

  // --- refusals ----------------------------------------------------------------

  test('a count that is not a whole non-negative number is refused, naming the fact', () => {
    assert.throws(
      () => executionSection({ ...inTheLane, unitCount: -1 }, regs),
      kernelError('execution requires a whole non-negative unitCount'),
    );
    assert.throws(
      () => executionSection({ ...inTheLane, fileCount: 1.5 }, regs),
      kernelError('execution requires a whole non-negative fileCount'),
    );
    assert.throws(
      () => executionSection({ ...inTheLane, domainCount: Number.NaN }, regs),
      kernelError('execution requires a whole non-negative domainCount'),
    );
  });

  // --- fail-closed against a mutated policy ------------------------------------

  // The control first: without it a refusal below could be satisfied by a
  // relocated tree failing for some reason other than the planted one.
  test('a relocated copy with an unmutated policy still answers direct', (t) => {
    assert.equal(executionSection(inTheLane, relocated(t)).mode, 'direct');
  });

  test('a lane that forbids nothing admits security-sensitive work — the registry owns the predicate', (t) => {
    const mutated = relocated(t, (policy) => {
      directLane(policy)['forbid_security_sensitive'] = false;
    });
    assert.equal(executionSection({ ...inTheLane, securitySensitive: true }, mutated).mode, 'direct');
  });

  test('a wave cap below 1 is refused instead of publishing a capacity nothing can use', (t) => {
    const mutated = relocated(t, (policy) => {
      const parallelism = policy['parallelism'];
      if (!isRecord(parallelism)) throw new Error('fixture parallelism is not an object');
      parallelism['wave_concurrency_cap'] = 0;
    });
    assert.throws(
      () => executionSection(inTheLane, mutated),
      kernelError('policy.json .parallelism.wave_concurrency_cap must be a positive integer, not 0'),
    );
  });

  const MODE_REQUESTED_SLUG = 'mode-requested';

  function relocated(t: TestContext, mutate?: (policy: Record<string, unknown>) => void): Registries {
    const root = mutate === undefined ? relocatedRoot(tempRoot(t)) : relocatedRoot(tempRoot(t), { mutate });
    return lazyRegistries(root);
  }

  function directLane(policy: Record<string, unknown>): Record<string, unknown> {
    const execution = policy['execution'];
    if (!isRecord(execution)) throw new Error('fixture execution is not an object');
    const lane = execution['direct_lane'];
    if (!isRecord(lane)) throw new Error('fixture direct_lane is not an object');
    return lane;
  }

  function kernelError(message: string): (error: unknown) => boolean {
    return (error: unknown): boolean => {
      if (!(error instanceof KernelError)) throw new Error(`expected a KernelError, got ${String(error)}`);
      assert.equal(error.message, message);
      return true;
    };
  }
  ```

- [ ] **Step 2: Run it and see the one real failure.** `npx tsc -p tsconfig.json && cd build && node --test kernel/execution.test.js`
  Expected: every test above passes except `a requested unresolved is refused rather than answered` if Task 2's guard was omitted, and `a lane that forbids nothing admits security-sensitive work` if `disqualifiers` ignored the `forbid_*` flags. Both are already implemented in Task 2, so the expected result here is `# pass 15  # fail 0`. If anything is red, the defect is in Task 2's module, not in these tests — fix `src/kernel/execution.ts`.

- [ ] **Step 3: Commit.**
  ```bash
  git add src/kernel/execution.test.ts
  git commit -m "test(kernel): cover the whole execution resolution order

Every step of the frozen order, the closed reason vocabulary in its
emitted order, the count refusals, and fail-closed behaviour when the
registry predicate itself is mutated.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 4: Wire `execution` into `resolve`

**Files:**
- Modify `src/kernel/resolve.ts` — import (top), `DeclaredFacts` (~line 53, after `waves`), `Answer` (~line 71, after `waves` and before `task_contract`), body (~line 165, after the `facts.waves` block and before the `facts.taskContract` block).
- Modify `src/kernel/resolve.test.ts` — append.

**Interfaces:**
- Consumes: `executionSection`, `type ExecutionFacts`, `type ExecutionSection` from `./execution`.
- Produces:
  ```ts
  // DeclaredFacts gains: execution?: ExecutionFacts;
  // Answer gains:        execution?: ExecutionSection;
  ```

- [ ] **Step 1: Write the failing test.** Append to `src/kernel/resolve.test.ts`:
  ```ts
  // --- the execution section ---------------------------------------------------

  test('an execution fact answers an execution section and nothing else', () => {
    const answer = resolve(
      {
        execution: {
          riskTier: 'low',
          reversible: true,
          domainCount: 1,
          unitCount: 1,
          fileCount: 1,
          securitySensitive: false,
          requiredAgents: [],
        },
      },
      ctx,
    );
    assert.deepEqual(Object.keys(answer), ['execution']);
    assert.equal(answer.execution?.mode, 'direct');
  });

  // The sparse-facts claim, for the one section added by 2.0: a caller that
  // cannot scope the work yet gets no execution key at all, which the adapter
  // reads as `unresolved`. An absent key is never a defaulted lane.
  test('no execution fact answers no execution key', () => {
    assert.equal('execution' in resolve({ prompt: 'add a login endpoint' }, ctx), false);
  });

  test('the execution key sits between waves and task_contract', () => {
    const answer = resolve(
      {
        waves: { units: [{ id: 'a' }] },
        execution: {
          riskTier: 'high',
          reversible: false,
          domainCount: 2,
          unitCount: 4,
          fileCount: 9,
          securitySensitive: false,
          requiredAgents: [],
        },
      },
      ctx,
    );
    assert.deepEqual(Object.keys(answer), ['waves', 'execution']);
    assert.equal(answer.execution?.mode, 'wave');
  });
  ```
  (`ctx` and `resolve` are already imported at the top of that file; do not re-import them.)

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test kernel/resolve.test.js`
  Expected failure: `src/kernel/resolve.test.ts: error TS2353: Object literal may only specify known properties, and 'execution' does not exist in type 'DeclaredFacts'.`

- [ ] **Step 3: Wire it.** In `src/kernel/resolve.ts` add the import beside the others (alphabetical, after `./decisions`):
  ```ts
  import { executionSection, type ExecutionFacts, type ExecutionSection } from './execution';
  ```
  Add to `DeclaredFacts`, after `waves?: WavesFacts;`:
  ```ts
    // The 2.0 control-plane fact: declared SCOPE, not an inspected working tree.
    // Absent means the caller has not scoped the work yet, which answers no key —
    // an adapter reads that absence as `unresolved` and may scope read-only.
    execution?: ExecutionFacts;
  ```
  Add to `Answer`, after `waves?: WavesSection;` and before `task_contract?: TaskContractSection;`:
  ```ts
    execution?: ExecutionSection;
  ```
  Add to the body, after the `facts.waves` block and before the `// Composed last` comment:
  ```ts
  if (facts.execution !== undefined) {
    answer.execution = executionSection(facts.execution, ctx.registries);
  }
  ```

- [ ] **Step 4: Run it and see it pass.** `npx tsc -p tsconfig.json && cd build && node --test kernel/resolve.test.js`
  Expected: the three new tests pass and the file's existing tests stay green — `# fail 0`.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/kernel/resolve.ts src/kernel/resolve.test.ts
  git commit -m "feat(kernel): carry execution as a sparse section of the answer

Present exactly when execution facts were declared, in the positional
style every other section follows. An absent key is the unresolved lane,
never a defaulted one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 5: The fact parser and the `engineos kernel execution` subcommand (F7)

**Files:**
- Modify `src/kernel/cli.ts` — import (top), `SUBCOMMANDS` (~line 43, after `waves`), a new projection beside `wavesProjection` (~line 205), the `parseFacts` switch (~line 336, after the `waves` case), and three helpers beside `admitFacts` / `factString`.
- Modify `src/kernel/cli.test.ts` — append.

**Interfaces:**
- Consumes: `executionSection`'s facts type and `unresolvedExecution` / `isExecutionMode` (Task 2); `resolve` (Task 4); `parseFlags`, `isRecord`, `KernelError` (already imported in `cli.ts`).
- Produces: CLI surface `engineos kernel execution --facts '<json>'`, answering an `ExecutionSection` on stdout, exit 0; `{"error": "<sentence>"}` and exit 1 on refusal.

- [ ] **Step 1: Write the failing CLI test.** Append to `src/kernel/cli.test.ts`:
  ```ts
  // --- execution ---------------------------------------------------------------

  const DIRECT_FACTS = JSON.stringify({
    riskTier: 'low',
    reversible: true,
    domainCount: 1,
    unitCount: 1,
    fileCount: 2,
    securitySensitive: false,
    requiredAgents: [],
  });

  test('execution answers the section for declared facts', () => {
    const answer = run(['execution', '--facts', DIRECT_FACTS]);
    assert.equal(answer.status, 0);
    assert.deepEqual(Object.keys(answer.json), ['mode', 'reasons', 'units', 'policyCapacity']);
    assert.equal(answer.json['mode'], 'direct');
  });

  // The prompt-time call: the adapter knows no counts yet and says so, instead
  // of the kernel guessing them from the wording of a request.
  test('execution with an empty fact object answers the unresolved lane', () => {
    const answer = run(['execution', '--facts', '{}']);
    assert.equal(answer.status, 0);
    assert.equal(answer.json['mode'], 'unresolved');
    assert.deepEqual(answer.json['reasons'], ['facts-undeclared']);
  });

  test('execution refuses a partial fact object rather than defaulting a count', () => {
    const answer = run(['execution', '--facts', JSON.stringify({ riskTier: 'low' })]);
    assert.equal(answer.status, 1);
    assert.equal(answer.json['error'], 'resolve --facts: execution.reversible must be a boolean');
  });

  test('execution refuses a requestedMode outside the vocabulary', () => {
    const facts = JSON.stringify({ ...JSON.parse(DIRECT_FACTS) as object, requestedMode: 'parallel' });
    const answer = run(['execution', '--facts', facts]);
    assert.equal(answer.status, 1);
    assert.equal(
      answer.json['error'],
      'resolve --facts: execution.requestedMode must be unresolved|direct|delegate|wave',
    );
  });

  test('execution refuses a payload that is not a JSON object', () => {
    assert.equal(run(['execution', '--facts', '[]']).json['error'], 'execution --facts must be a JSON object');
    assert.equal(run(['execution', '--facts', 'nope']).json['error'], 'execution --facts must be a JSON object');
  });

  test('execution requires its flag', () => {
    assert.equal(run(['execution']).json['error'], 'execution requires --facts <json>');
  });

  // resolve is the general form of the same fact, and both must answer the same
  // section — otherwise the arm is a second predicate wearing the same name.
  test('resolve --facts answers the same section through the execution key', () => {
    const answer = run(['resolve', '--facts', JSON.stringify({ execution: JSON.parse(DIRECT_FACTS) as object })]);
    assert.equal(answer.status, 0);
    assert.deepEqual(answer.json['execution'], run(['execution', '--facts', DIRECT_FACTS]).json);
  });
  ```
  Use the file's existing `run(...)` helper and its `{ status, json }` shape; if its accessor is named differently in `cli.test.ts`, keep that name rather than introducing a second one.

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test kernel/cli.test.js`
  Expected failure: `execution answers the section for declared facts` fails with the answer `{"error":"unknown subcommand: execution"}` and `status` 1 rather than 0.

- [ ] **Step 3: Add the parser and the arm.** In `src/kernel/cli.ts` add the import beside the other kernel imports:
  ```ts
  import { isExecutionMode, unresolvedExecution, type ExecutionFacts, type ExecutionMode } from './execution';
  ```
  Register the arm in `SUBCOMMANDS`, after `waves`:
  ```ts
    execution: executionProjection,
  ```
  Add the projection after `wavesProjection`:
  ```ts
  // F7's arm. It is a projection of `resolve` like every other, with one extra
  // branch: an EMPTY fact object is the prompt-time call, and it answers the
  // unresolved lane rather than refusing. Refusing there would push the adapter
  // into inventing counts to get an answer, which is the exact failure the
  // declared-facts design removes.
  function executionProjection(ctx: KernelContext, args: string[]): unknown {
    const flags = parseFlags('execution', args, ['--facts']);
    const raw = flags.get('--facts');
    if (raw === undefined || raw === '') throw new KernelError('execution requires --facts <json>');
    const row = parseExecutionJson(raw);
    if (Object.keys(row).length === 0) return unresolvedExecution(ctx.registries);
    const section = resolve({ execution: executionFacts(row) }, ctx).execution;
    if (section === undefined) throw new KernelError('execution: the kernel answered no execution section');
    return section;
  }

  function parseExecutionJson(raw: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new KernelError('execution --facts must be a JSON object');
    }
    if (!isRecord(parsed)) throw new KernelError('execution --facts must be a JSON object');
    return parsed;
  }
  ```
  Add the case to the `parseFacts` switch, after the `waves` case:
  ```ts
        case 'execution': facts.execution = executionFacts(factRecord(key, value)); break;
  ```
  Add the three helpers beside `admitFacts`:
  ```ts
  // Read key by key like every other multi-field fact: an absent count is a
  // refusal here, not a zero, because a zero would qualify work for the direct
  // lane on facts nobody declared.
  function executionFacts(row: Record<string, unknown>): ExecutionFacts {
    const facts: ExecutionFacts = {
      riskTier: factTier('execution.riskTier', row['riskTier']),
      reversible: factBoolean('execution.reversible', row['reversible']),
      domainCount: factNumber('execution.domainCount', row['domainCount']),
      unitCount: factNumber('execution.unitCount', row['unitCount']),
      fileCount: factNumber('execution.fileCount', row['fileCount']),
      securitySensitive: factBoolean('execution.securitySensitive', row['securitySensitive']),
      requiredAgents: factStrings('execution.requiredAgents', row['requiredAgents']),
    };
    // Assigned conditionally rather than from a maybe-undefined expression:
    // exactOptionalPropertyTypes rejects writing undefined into an optional key.
    if (row['requestedMode'] !== undefined) {
      facts.requestedMode = factMode('execution.requestedMode', row['requestedMode']);
    }
    return facts;
  }

  function factStrings(at: string, value: unknown): string[] {
    if (!Array.isArray(value)) throw new KernelError(`resolve --facts: ${at} must be an array of strings`);
    const items: unknown[] = value;
    return items.map((item, i) => factString(`${at}[${i}]`, item));
  }

  function factMode(at: string, value: unknown): ExecutionMode {
    if (!isExecutionMode(value)) {
      throw new KernelError(`resolve --facts: ${at} must be unresolved|direct|delegate|wave`);
    }
    return value;
  }
  ```

- [ ] **Step 4: Run it and see it pass.** `npx tsc -p tsconfig.json && cd build && node --test kernel/cli.test.js`
  Expected: the seven new tests pass and the file's existing arms stay green — `# fail 0`.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/kernel/cli.ts src/kernel/cli.test.ts
  git commit -m "feat(kernel): add the execution subcommand and its fact parser

engineos kernel execution --facts answers the lane alone; an empty fact
object is the prompt-time call and answers unresolved rather than
refusing. A partial object is a refusal, never a defaulted count.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 6: The 2.0 semantic break in prose

**Files:**
- Modify `rules/parallelism.md` — insert `## Execution lanes` before line 7; rewrite the heading and bullet 2 of `## Decompose-and-distribute` (lines 7-22).
- Modify `rules/subagents.md` — rewrite lines 6-20.

**Interfaces:**
- Consumes: the values in `registries/policy.json` `.execution` (Task 1). Every number and every mode name below is quoted from it; Task 8's C38c asserts the quotes.
- Produces: the two anchored sections C38c's mirror rows address — `rules/parallelism.md` `## Execution lanes` and `rules/subagents.md` `## Dispatch is proportional`.

Three things must survive this edit, because existing mirror rows read them:
`**>3 files**` (C16 `fanout-threshold-drift`), `Cap concurrency at ~6` (C16 `wave-cap-drift`), and the `## Backpressure` / `## Circuit breaker` sections untouched (C24c, C25c).

- [ ] **Step 1: Add the `## Execution lanes` section.** In `rules/parallelism.md`, insert between line 5 (`through a list alone is a defect when the list could have been split.`) and line 7 (`## Decompose-and-distribute — the default`):
  ```markdown

  ## Execution lanes

  EngineOS 2.0 answers HOW a scoped unit runs before it answers who runs it. The
  predicate is data — `registries/policy.json` `.execution` — the kernel
  evaluates it, and this section is the human mirror. The call is
  `engineos kernel execution --facts '<json>'`; `resolve-task` carries the same
  answer as its `execution` section.

  | Mode | Meaning |
  |---|---|
  | `unresolved` | the work is not scoped yet. Read-only scoping is permitted; no edit, no launch |
  | `direct` | the orchestrator does the unit itself — no brief, no wait, no return envelope, no integration cycle |
  | `delegate` | one specialist agent owns the unit |
  | `wave` | several units run in parallel under the procedure below |

  `direct` is answered only when every bound holds: risk is `low`, the work is
  reversible, exactly 1 domain, exactly 1 independent unit, at most 2 files, no
  security-sensitive surface, and no decision rule or user request naming an
  agent. A bound missed is at least `delegate`. Work reaching at least 3
  independent units or at least 2 domains is `wave`.

  `direct` removes the dispatch cycle and nothing else. Risk classification, the
  scoped file list and the final validation gate are unchanged, and a security
  review, a `critic` pass, a user-named agent or release approval each override
  the lane. An adapter may lower the lane or the capacity it was handed; it may
  never raise `delegate` or `wave` to `direct`, and never raise the published
  `policyCapacity`.
  ```

- [ ] **Step 2: Retire the "distribute always" claim.** In `rules/parallelism.md`, change the heading on what is now the following section from `## Decompose-and-distribute — the default` to `## Decompose-and-distribute — past the direct lane`, change its opening line from `For ANY substantive task (anything that creates or modifies code, config, or` to `For any substantive task the lane did not answer `direct` (anything that creates or modifies code, config, or`, and replace numbered item 2 with:
  ```markdown
  2. **Distribute past the direct lane** — once the lane is `delegate` or `wave`,
     every task that doesn't depend on another in-flight task goes to a sub-agent.
     Two independent tasks = two agents in one message, not one agent doing both.
     A `direct` unit is done inline by the orchestrator, under the same gates.
  ```
  Leave items 1 and 3, the `**>3 files**` paragraph and the `Do NOT fan out only when:` paragraph exactly as they are.

- [ ] **Step 3: Rewrite the subagents mandate.** In `rules/subagents.md`, replace lines 6-20 (the whole `## Dispatch is mandatory` section, from its heading through the last `DON'T dispatch an agent whose file scope overlaps` bullet) with:
  ```markdown
  ## Dispatch is proportional

  The lane comes first. `registries/policy.json` `.execution` owns the predicate,
  `engineos kernel execution --facts '<json>'` answers it, and
  `rules/parallelism.md` "Execution lanes" is the table. This file says what
  follows from the answer. An `unresolved` lane permits read-only scoping only —
  no edit and no launch until the facts are declared and the lane is answered.

  - DO dispatch the agent the router row names, via the Agent/Task tool, whenever
    that row matches and the lane is `delegate` or `wave`.
    `agent:backend-coordinator` in a row is an instruction, not a footnote.
  - DO treat this file as the user's standing request to use sub-agents — a harness
    that only spawns agents "when the user asks" has been asked, here, once and for all.
  - DO execute a `direct` unit inline, with no brief, no wait, no return envelope
    and no integration cycle. `direct` is answered only when risk is `low`, the
    work is reversible, and the unit is one domain, one unit and at most two files
    with no security-sensitive surface. Every other shape is at least `delegate`.
  - DON'T read `direct` as permission to skip anything else. The risk
    classification, the scoped file list and the final validation gate are
    unchanged, and a security review, a `critic` pass or a user-named agent
    overrides the lane.
  - DO pass every agent its MODE (AUDIT|IMPLEMENT), exact file scope, frozen
    contracts, model per `rules/models.md`, and the output format expected back.
  - DON'T dispatch for pure questions, explanations, or a single-line mechanical
    edit the router didn't route. Those are answered directly.
  - DON'T dispatch an agent whose file scope overlaps another in-flight agent —
    disjoint scopes or serialize (`rules/parallelism.md`).
  ```
  The opening sentence of the file (lines 3-4, "The router names agents. Naming an agent and then doing the work inline is a defect...") stays: it is still true for a `delegate` or `wave` lane.

- [ ] **Step 4: Prove the anchors and the quoted values are there.** Run:
  ```bash
  grep -c '^## Execution lanes$' rules/parallelism.md
  grep -c '^## Dispatch is proportional$' rules/subagents.md
  grep -c 'at most 2 files' rules/parallelism.md rules/subagents.md
  grep -c 'at least 3 independent units' rules/parallelism.md
  grep -c 'at least 2 domains' rules/parallelism.md
  grep -c 'exactly 1 independent unit' rules/parallelism.md
  grep -c 'exactly 1 domain' rules/parallelism.md
  grep -c 'risk is `low`' rules/subagents.md
  grep -c '\*\*>3 files\*\*' rules/parallelism.md
  grep -c 'Cap concurrency at ~6' rules/parallelism.md
  ```
  Expected: every count is at least 1. A zero means the wording drifted from the values Task 8's mirror rows quote — fix the prose, not the row.

- [ ] **Step 5: Commit.**
  ```bash
  git add rules/parallelism.md rules/subagents.md
  git commit -m "feat(rules)!: state the direct lane instead of a blanket dispatch

BREAKING CHANGE: rules/subagents.md no longer requires a dispatch for
every routed unit. Low-risk, reversible, one-domain, one-unit, at most
two-file work with no security-sensitive surface runs direct. The bounds
are registries/policy.json .execution; this prose is its mirror.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 7: C38 and C38b — the block is well formed and the kernel answers it

**Files:**
- Create `src/checks/execution-lane.ts`.
- Create `src/checks/execution-lane.test.ts`.
- Modify `src/checks/ids.ts` — append `'C38'`, `'C38b'` to `CHECK_IDS`.
- Modify `src/checks/index.ts` — import and spread `EXECUTION_LANE_CHECKS`.
- Modify `CLAUDE.md` (line 173), `AGENTS.md` (line 175), `README.md` (line 183), `docs/CODEBASE_MAP.md` (lines 16, 50, 205, 320) — every `68`-check literal becomes `70`.

**Interfaces:**
- Consumes: `finding`, `result`, `CheckResult`, `Finding` from `./findings`; `CheckContext` from `./lib`; `child`, `stringsOf`, `wholeNumber`, `jqText`, `policyDocument`, `requirePolicy`, `kernelAnswer`, `answerText`, `answerStrings` from `./runtime-governance-shared`; `EXECUTION_MODES` from `../kernel/execution`; `Check` from `./index`.
- Produces:
  ```ts
  export const C38_FINDINGS: readonly string[];
  export const C38B_FINDINGS: readonly string[];
  export const C38_TITLE: string;
  export const C38B_TITLE: string;
  export function checkC38(ctx: CheckContext): CheckResult[];
  export function checkC38b(ctx: CheckContext): CheckResult[];
  export const EXECUTION_LANE_CHECKS: readonly Check[];
  ```

- [ ] **Step 1: Write the failing check test.** Create `src/checks/execution-lane.test.ts`:
  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { existsSync, readFileSync, readdirSync } from 'node:fs';
  import { join } from 'node:path';
  import { memoryIo } from '../io';
  import { lazyRegistries } from '../kernel/context';
  import { resolveRoot } from '../registry/paths';
  import type { CheckContext } from './lib';
  import { checkC38, checkC38b } from './execution-lane';

  const root = resolveRoot(process.env, __dirname);

  function contextOver(overlay: Record<string, string> = {}): CheckContext {
    return {
      root,
      io: memoryIo(),
      registries: lazyRegistries(root),
      skipped: new Set<string>(),
      readText(relativePath: string): string | undefined {
        const planted = overlay[relativePath];
        if (planted !== undefined) return planted;
        try {
          return readFileSync(join(root, relativePath), 'utf8');
        } catch {
          return undefined;
        }
      },
      exists: (relativePath: string): boolean => existsSync(join(root, relativePath)),
      list: (relativeDir: string): string[] => readdirSync(join(root, relativeDir)),
    };
  }

  test('the shipped execution block passes C38', () => {
    const [outcome] = checkC38(contextOver());
    assert.equal(outcome?.status, 'ok');
    assert.deepEqual(outcome?.findings, []);
  });

  test('the shipped kernel passes the C38b lane canary', () => {
    const [outcome] = checkC38b(contextOver());
    assert.equal(outcome?.status, 'ok');
  });

  // A check that cannot fail reports nothing, so each negative is planted.
  test('a mode the kernel does not answer is reported', () => {
    const policy = JSON.parse(readFileSync(join(root, 'registries/policy.json'), 'utf8')) as Record<string, unknown>;
    const execution = policy['execution'] as Record<string, unknown>;
    execution['modes'] = ['unresolved', 'direct', 'delegate', 'wave', 'telepathy'];
    const [outcome] = checkC38(contextOver({ 'registries/policy.json': JSON.stringify(policy) }));
    assert.equal(outcome?.status, 'fail');
    assert.deepEqual(outcome?.findings, [{ code: 'mode-not-in-kernel', subject: 'telepathy' }]);
  });

  test('a direct-lane bound that is not a whole number is reported by name', () => {
    const policy = JSON.parse(readFileSync(join(root, 'registries/policy.json'), 'utf8')) as Record<string, unknown>;
    const execution = policy['execution'] as Record<string, unknown>;
    const lane = execution['direct_lane'] as Record<string, unknown>;
    lane['max_files'] = 'two';
    const [outcome] = checkC38(contextOver({ 'registries/policy.json': JSON.stringify(policy) }));
    assert.equal(outcome?.status, 'fail');
    assert.deepEqual(outcome?.findings, [{ code: 'bound-not-a-whole-number', subject: 'direct_lane.max_files' }]);
  });

  test('a max_risk outside the tier vocabulary is reported', () => {
    const policy = JSON.parse(readFileSync(join(root, 'registries/policy.json'), 'utf8')) as Record<string, unknown>;
    const execution = policy['execution'] as Record<string, unknown>;
    const lane = execution['direct_lane'] as Record<string, unknown>;
    lane['max_risk'] = 'catastrophic';
    const [outcome] = checkC38(contextOver({ 'registries/policy.json': JSON.stringify(policy) }));
    assert.equal(outcome?.status, 'fail');
    assert.deepEqual(outcome?.findings, [{ code: 'max-risk-not-a-tier', subject: 'catastrophic' }]);
  });
  ```
  The `JSON.parse(...) as Record<string, unknown>` casts are confined to this test file's fixture construction; the checks themselves narrow with `isRecord` through the shared helpers.

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test checks/execution-lane.test.js`
  Expected failure: `src/checks/execution-lane.test.ts(12,44): error TS2307: Cannot find module './execution-lane' or its corresponding type declarations.`

- [ ] **Step 3: Write the checks.** Create `src/checks/execution-lane.ts`:
  ```ts
  // C38*: the execution lane — the policy block (C38), the kernel's answer
  // (C38b) and the prose mirror (C38c, Task 8). The lane is the 2.0 control
  // plane: registries/policy.json .execution is the predicate, the kernel's
  // execution arm evaluates it, and rules/parallelism.md "Execution lanes" plus
  // rules/subagents.md "Dispatch is proportional" are the human mirror.
  //
  // Why the block is read RAW rather than through ctx.registries.policy: the
  // typed loader is fail-closed and throws on exactly the malformations C38
  // exists to name, so reading through it would turn every named finding into an
  // unhandled throw. The canary in C38b goes through the typed path, which is
  // the same split the rest of the runtime-governance family keeps.
  // Spec: docs/specs/2026-09-22-engineos-2-fast-core-design.md section 2
  import { EXECUTION_MODES } from '../kernel/execution';
  import { finding, result, type CheckResult, type Finding } from './findings';
  import type { Check } from './index';
  import type { CheckContext } from './lib';
  import {
    answerStrings,
    answerText,
    child,
    kernelAnswer,
    policyDocument,
    requirePolicy,
    stringsOf,
    wholeNumber,
  } from './runtime-governance-shared';

  export const C38_FINDINGS = [
    'mode-not-declared',
    'mode-not-in-kernel',
    'bound-not-a-whole-number',
    'bound-below-1',
    'max-risk-not-a-tier',
    'forbid-flag-not-a-boolean',
  ] as const;

  export const C38B_FINDINGS = [
    'expected-direct-inside-the-lane',
    'expected-wave-past-the-thresholds',
    'expected-delegate-for-security-sensitive-work',
    'expected-unresolved-without-facts',
    'reason-not-in-the-vocabulary',
  ] as const;

  declare module './codes' {
    interface CheckCodes {
      C38: (typeof C38_FINDINGS)[number];
      C38b: (typeof C38B_FINDINGS)[number];
    }
  }

  export const C38_TITLE = 'policy.json.execution declares a well-formed lane predicate';

  export const C38B_TITLE = 'kernel execution answers direct inside the lane, wave past the thresholds';

  export const EXECUTION_LANE_CHECKS: readonly Check[] = [
    { id: 'C38', codes: C38_FINDINGS, run: checkC38 },
    { id: 'C38b', codes: C38B_FINDINGS, run: checkC38b },
  ];

  const TOKEN = 'execution-lane';

  const TIERS: readonly string[] = ['low', 'medium', 'high'];

  // The closed reason vocabulary of src/kernel/execution.ts, pinned here so a
  // reason invented in the kernel fails a check rather than reaching an adapter
  // that switches on the list.
  const REASONS: readonly string[] = [
    'risk-not-low',
    'irreversible',
    'multi-domain',
    'unit-count-exceeded',
    'file-count-exceeded',
    'security-sensitive',
    'agent-required',
    'mode-requested',
    'facts-undeclared',
  ];

  const DIRECT_BOUNDS: readonly string[] = ['max_domains', 'max_units', 'max_files'];

  const WAVE_BOUNDS: readonly string[] = ['min_units', 'min_domains'];

  const FORBID_FLAGS: readonly string[] = ['requires_reversible', 'forbid_security_sensitive', 'forbid_required_agents'];

  export function checkC38(ctx: CheckContext): CheckResult[] {
    const skipped = requirePolicy(ctx, 'C38', C38_TITLE, TOKEN);
    if (skipped !== undefined) return skipped;
    const execution = child(policyDocument(ctx), 'execution');
    const directLane = child(execution, 'direct_lane');
    const waveLane = child(execution, 'wave_lane');
    const findings: Finding[] = [];

    // Both directions: a mode the kernel cannot answer is dead data, and a mode
    // the kernel answers that the registry does not declare is a vocabulary that
    // grew without its mirror.
    const declared = stringsOf(execution, 'modes');
    const known: readonly string[] = EXECUTION_MODES;
    for (const mode of known) {
      if (!declared.includes(mode)) findings.push(finding('C38', 'mode-not-declared', mode));
    }
    for (const mode of declared) {
      if (!known.includes(mode)) findings.push(finding('C38', 'mode-not-in-kernel', mode));
    }

    // A bound of 0 makes the lane unreachable and the block dead weight, so it is
    // as much a defect as a missing one.
    for (const key of DIRECT_BOUNDS) {
      const value = wholeNumber(directLane?.[key]);
      if (value === undefined) findings.push(finding('C38', 'bound-not-a-whole-number', `direct_lane.${key}`));
      else if (value < 1) findings.push(finding('C38', 'bound-below-1', `direct_lane.${key}`));
    }
    for (const key of WAVE_BOUNDS) {
      const value = wholeNumber(waveLane?.[key]);
      if (value === undefined) findings.push(finding('C38', 'bound-not-a-whole-number', `wave_lane.${key}`));
      else if (value < 1) findings.push(finding('C38', 'bound-below-1', `wave_lane.${key}`));
    }

    const maxRisk = directLane?.['max_risk'];
    if (typeof maxRisk !== 'string' || !TIERS.includes(maxRisk)) {
      findings.push(finding('C38', 'max-risk-not-a-tier', typeof maxRisk === 'string' ? maxRisk : 'none'));
    }
    for (const key of FORBID_FLAGS) {
      if (typeof directLane?.[key] !== 'boolean') findings.push(finding('C38', 'forbid-flag-not-a-boolean', key));
    }
    return [result('C38', C38_TITLE, findings)];
  }

  export function checkC38b(ctx: CheckContext): CheckResult[] {
    const skipped = requirePolicy(ctx, 'C38b', C38B_TITLE, TOKEN);
    if (skipped !== undefined) return skipped;
    const execution = child(policyDocument(ctx), 'execution');
    const lane = child(execution, 'direct_lane');
    const wave = child(execution, 'wave_lane');
    const findings: Finding[] = [];

    // Every fixture is BUILT from the block, never from a literal: a canary
    // asserting "2 files is direct" would go red the day the bound moves, while
    // the kernel was still correct.
    const inside = {
      riskTier: typeof lane?.['max_risk'] === 'string' ? lane['max_risk'] : 'low',
      reversible: true,
      domainCount: wholeNumber(lane?.['max_domains']) ?? 1,
      unitCount: wholeNumber(lane?.['max_units']) ?? 1,
      fileCount: wholeNumber(lane?.['max_files']) ?? 1,
      securitySensitive: false,
      requiredAgents: [],
    };
    const direct = answer(ctx, inside);
    if (answerText(direct, 'mode') !== 'direct') {
      findings.push(finding('C38b', 'expected-direct-inside-the-lane', named(answerText(direct, 'mode'))));
    }

    const waveAnswer = answer(ctx, { ...inside, unitCount: wholeNumber(wave?.['min_units']) ?? 3 });
    if (answerText(waveAnswer, 'mode') !== 'wave') {
      findings.push(finding('C38b', 'expected-wave-past-the-thresholds', named(answerText(waveAnswer, 'mode'))));
    }

    const gated = answer(ctx, { ...inside, securitySensitive: true });
    if (answerText(gated, 'mode') !== 'delegate') {
      findings.push(finding('C38b', 'expected-delegate-for-security-sensitive-work', named(answerText(gated, 'mode'))));
    }

    const unresolved = kernelAnswer(ctx, ['execution', '--facts', '{}']);
    if (answerText(unresolved, 'mode') !== 'unresolved') {
      findings.push(finding('C38b', 'expected-unresolved-without-facts', named(answerText(unresolved, 'mode'))));
    }

    for (const emitted of [direct, waveAnswer, gated, unresolved]) {
      for (const reason of answerStrings(emitted, 'reasons')) {
        if (!REASONS.includes(reason)) findings.push(finding('C38b', 'reason-not-in-the-vocabulary', reason));
      }
    }
    return [result('C38b', C38B_TITLE, findings)];
  }

  // ------------------------------------------------------------------ internals

  function answer(ctx: CheckContext, facts: Record<string, unknown>): Record<string, unknown> {
    return kernelAnswer(ctx, ['execution', '--facts', JSON.stringify(facts)]);
  }

  function named(mode: string): string {
    return mode === '' ? 'none' : mode;
  }
  ```

- [ ] **Step 4: Register the ids and the family.** In `src/checks/ids.ts`, append `'C38',` and `'C38b',` after `'C37',` inside `CHECK_IDS`. In `src/checks/index.ts`, add the import beside the others:
  ```ts
  import { EXECUTION_LANE_CHECKS } from './execution-lane';
  ```
  and add `...EXECUTION_LANE_CHECKS,` as the last entry of the `CHECKS` array.

- [ ] **Step 5: Keep C37's claim true.** Registering two ids takes the count from 68 to 70. Edit every literal:
  ```bash
  sed -i '' 's/68-check validator/70-check validator/' CLAUDE.md AGENTS.md
  sed -i '' 's/# 68 self-integrity Checks/# 70 self-integrity Checks/' README.md
  sed -i '' 's/68 checks/70 checks/g; s/68 validator checks/70 validator checks/g; s/68-check integrity harness/70-check integrity harness/g' docs/CODEBASE_MAP.md
  grep -rn '68' CLAUDE.md AGENTS.md README.md docs/CODEBASE_MAP.md | grep -i check
  ```
  The final `grep` must print nothing.

- [ ] **Step 6: Run the check tests and the harness registration test.** `npx tsc -p tsconfig.json && cd build && node --test checks/execution-lane.test.js checks/index.test.js`
  Expected: `# fail 0` — six new check tests, and `every declared check id is registered exactly once` still green at 70.

- [ ] **Step 7: Run the checks against the real tree.** `npm run build && node dist/engineos.cjs validate --only C37,C38,C38b`
  Expected: three `ok` lines, including `ok   check-count claims equal the registered count`. (`npm run build` here is a throwaway rebuild to run the validator; the bundle is committed once, in Task 9.)

- [ ] **Step 8: Commit.**
  ```bash
  git add src/checks/execution-lane.ts src/checks/execution-lane.test.ts src/checks/ids.ts src/checks/index.ts CLAUDE.md AGENTS.md README.md docs/CODEBASE_MAP.md
  git commit -m "feat(checks): add C38 and C38b for the execution lane

C38 holds the policy block to a well-formed predicate in both
directions; C38b runs the kernel against fixtures built from that block,
so re-parameterising the lane moves the fixture instead of turning a
correct kernel red. Check-count claims follow to 70.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 8: C38c — the prose mirrors the registry

**Files:**
- Modify `src/checks/mirrors.ts` — append rows before the closing `] satisfies readonly MirrorPair[];`.
- Modify `src/checks/execution-lane.ts` — add `C38C_FINDINGS`, `C38C_TITLE`, `checkC38c`, and the registry entry.
- Modify `src/checks/execution-lane.test.ts` — append.
- Modify `src/checks/ids.ts` — append `'C38c'`.
- Modify `src/checks/mirrors.test.ts` — add `'C38c'` to `PORTED`.
- Modify `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/CODEBASE_MAP.md` — 70 becomes 71.

**Interfaces:**
- Consumes: `runMirrors` from `./mirror`; `rowsOf` from `./mirrors`; `fileHas` from `./runtime-governance-shared`.
- Produces:
  ```ts
  export const C38C_FINDINGS: readonly string[];
  export const C38C_TITLE: string;
  export function checkC38c(ctx: CheckContext): CheckResult[];
  ```

- [ ] **Step 1: Write the failing mirror test.** Append to `src/checks/execution-lane.test.ts`:
  ```ts
  test('the shipped prose passes C38c', () => {
    const [outcome] = checkC38c(contextOver());
    assert.equal(outcome?.status, 'ok');
    assert.deepEqual(outcome?.findings, []);
  });

  // The vacuity guard: a mirror whose document lost the section must fail, not
  // pass by having nothing left to assert against.
  test('prose that drops the lane section is reported, not passed', () => {
    const gutted = '# Parallel Execution Rules — always on\n\n## Procedure\n\nnothing here\n';
    const [outcome] = checkC38c(contextOver({ 'rules/parallelism.md': gutted }));
    assert.equal(outcome?.status, 'fail');
    assert.ok(outcome !== undefined && outcome.findings.length > 0);
  });

  test('a file bound reworded away from the registry value is reported', () => {
    const text = readFileSync(join(root, 'rules/parallelism.md'), 'utf8').replace('at most 2 files', 'a handful of files');
    const [outcome] = checkC38c(contextOver({ 'rules/parallelism.md': text }));
    assert.equal(outcome?.status, 'fail');
    assert.deepEqual(
      outcome?.findings.map((entry) => entry.code),
      ['direct-file-bound-drift'],
    );
  });
  ```
  Add `checkC38c` to the existing `import { checkC38, checkC38b } from './execution-lane';` line — one import statement per module.

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test checks/execution-lane.test.js`
  Expected failure: `src/checks/execution-lane.test.ts: error TS2305: Module './execution-lane' has no exported member 'checkC38c'.`

- [ ] **Step 3: Add the mirror rows.** In `src/checks/mirrors.ts`, append before the closing `] satisfies readonly MirrorPair[];`:
  ```ts
    // --------------------------------------------------------------- C38c
    // Stays code in src/checks/execution-lane.ts: the two `engineos kernel
    // execution` call literals, which have no registry side to mirror.
    {
      id: 'mode-row-missing', check: 'C38c',
      registry: 'policy.execution.modes', doc: 'rules/parallelism.md', anchor: '## Execution lanes',
      // both: .execution.modes is a CLOSED vocabulary, so a lane the prose
      // invents is exactly the drift this row exists to catch. The section
      // carries one table and no other backticked first cell, which is what
      // keeps the reverse direction meaningful.
      direction: 'both',
      kind: 'names', element: '^\\| `{x}`',
    },
    {
      id: 'direct-domain-bound-drift', check: 'C38c',
      registry: 'policy.execution.direct_lane.max_domains', doc: 'rules/parallelism.md', anchor: '## Execution lanes',
      direction: 'doc-names-registry',
      kind: 'quotes', pattern: 'exactly {n} domain',
    },
    {
      id: 'direct-unit-bound-drift', check: 'C38c',
      registry: 'policy.execution.direct_lane.max_units', doc: 'rules/parallelism.md', anchor: '## Execution lanes',
      direction: 'doc-names-registry',
      kind: 'quotes', pattern: 'exactly {n} independent unit',
    },
    {
      id: 'direct-file-bound-drift', check: 'C38c',
      registry: 'policy.execution.direct_lane.max_files', doc: 'rules/parallelism.md', anchor: '## Execution lanes',
      direction: 'doc-names-registry',
      kind: 'quotes', pattern: 'at most {n} files',
    },
    {
      id: 'wave-unit-threshold-drift', check: 'C38c',
      registry: 'policy.execution.wave_lane.min_units', doc: 'rules/parallelism.md', anchor: '## Execution lanes',
      direction: 'doc-names-registry',
      kind: 'quotes', pattern: 'at least {n} independent units',
    },
    {
      id: 'wave-domain-threshold-drift', check: 'C38c',
      registry: 'policy.execution.wave_lane.min_domains', doc: 'rules/parallelism.md', anchor: '## Execution lanes',
      direction: 'doc-names-registry',
      kind: 'quotes', pattern: 'at least {n} domains',
    },
    {
      id: 'subagents-mode-missing', check: 'C38c',
      registry: 'policy.execution.modes', doc: 'rules/subagents.md', anchor: '## Dispatch is proportional',
      // One direction only: this section is prose about the lanes, not a table,
      // so a reverse capture would collect every backticked word in it.
      direction: 'doc-names-registry',
      kind: 'names', element: '`{x}`',
    },
    {
      id: 'subagents-max-risk-drift', check: 'C38c',
      registry: 'policy.execution.direct_lane.max_risk', doc: 'rules/subagents.md', anchor: '## Dispatch is proportional',
      direction: 'doc-names-registry',
      kind: 'names', element: 'risk is `{x}`',
    },
  ```

- [ ] **Step 4: Add the check.** In `src/checks/execution-lane.ts`, add `runMirrors` and `rowsOf` and `fileHas` to the existing import statements (one statement per module — extend `./runtime-governance-shared`'s list with `fileHas`, and add two new statements for `./mirror` and `./mirrors`), then add:
  ```ts
  export const C38C_FINDINGS = [
    'does-not-name-kernel-execution',
    'mode-row-missing',
    'direct-domain-bound-drift',
    'direct-unit-bound-drift',
    'direct-file-bound-drift',
    'wave-unit-threshold-drift',
    'wave-domain-threshold-drift',
    'subagents-mode-missing',
    'subagents-max-risk-drift',
  ] as const;
  ```
  Extend the module augmentation with `C38c: (typeof C38C_FINDINGS)[number];`, add the title and the check:
  ```ts
  export const C38C_TITLE =
    'rules/parallelism.md and rules/subagents.md mirror the execution lane: the call, the modes and every bound';

  const PARALLELISM_MD = 'rules/parallelism.md';
  const SUBAGENTS_MD = 'rules/subagents.md';

  // The call an adapter is supposed to make. A literal with no registry side, so
  // it stays code while the eight value mirrors are rows.
  const EXECUTION_CALL = 'engineos kernel execution';

  export function checkC38c(ctx: CheckContext): CheckResult[] {
    const skipped = requirePolicy(ctx, 'C38c', C38C_TITLE, TOKEN);
    if (skipped !== undefined) return skipped;
    const findings: Finding[] = [];
    for (const doc of [PARALLELISM_MD, SUBAGENTS_MD]) {
      if (!fileHas(ctx, doc, EXECUTION_CALL)) findings.push(finding('C38c', 'does-not-name-kernel-execution', doc));
    }
    findings.push(...runMirrors(rowsOf('C38c'), ctx));
    return [result('C38c', C38C_TITLE, findings)];
  }
  ```
  Add `{ id: 'C38c', codes: C38C_FINDINGS, run: checkC38c },` to `EXECUTION_LANE_CHECKS`.

- [ ] **Step 5: Register the id and the ported list.** Append `'C38c',` to `CHECK_IDS` in `src/checks/ids.ts`, after `'C38b',`. In `src/checks/mirrors.test.ts`, add `'C38c'` to the end of the `PORTED` array.

- [ ] **Step 6: Keep C37's claim true.** 70 becomes 71:
  ```bash
  sed -i '' 's/70-check validator/71-check validator/' CLAUDE.md AGENTS.md
  sed -i '' 's/# 70 self-integrity Checks/# 71 self-integrity Checks/' README.md
  sed -i '' 's/70 checks/71 checks/g; s/70 validator checks/71 validator checks/g; s/70-check integrity harness/71-check integrity harness/g' docs/CODEBASE_MAP.md
  grep -rn '70' CLAUDE.md AGENTS.md README.md docs/CODEBASE_MAP.md | grep -i check
  ```
  The final `grep` must print nothing.

- [ ] **Step 7: Run it and see it pass.** `npx tsc -p tsconfig.json && cd build && node --test checks/execution-lane.test.js checks/mirrors.test.js checks/index.test.js`
  Expected: `# fail 0`. `the whole table holds against the shipped documents and registries` in `mirrors.test.js` is the one that proves the eight new rows hold against the prose Task 6 wrote; if it reports a row id, fix the prose wording, not the row.

- [ ] **Step 8: Commit.**
  ```bash
  git add src/checks/execution-lane.ts src/checks/execution-lane.test.ts src/checks/mirrors.ts src/checks/mirrors.test.ts src/checks/ids.ts CLAUDE.md AGENTS.md README.md docs/CODEBASE_MAP.md
  git commit -m "feat(checks): add C38c for the execution-lane prose mirror

Eight registry-to-document rows over rules/parallelism.md 'Execution
lanes' and rules/subagents.md 'Dispatch is proportional', plus the call
literal both files must name. A bound changed on one side alone now
fails CI. Check-count claims follow to 71.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 9: Compatibility inventory and the rebuilt runtime

**Files:**
- Modify `docs/COMPATIBILITY.md` — the kernel-subcommand sentence (~line 26) and the `## Unreleased` table (~line 560).
- Modify `dist/engineos.cjs` — rebuilt.

**Interfaces:**
- Consumes: everything Tasks 1-8 added. No new code.
- Produces: the public-surface record non-negotiable #11 requires, and the committed bundle every hook and installer executes.

- [ ] **Step 1: Add the subcommand to the covered list.** In `docs/COMPATIBILITY.md`, change the sentence beginning `The kernel subcommands covered by that row are` so the list reads `... `route-escalate`, `resolve-task`, `execution` and `skill-state`.` and add a paragraph after the `resolve` paragraph that ends `(\`path\`, \`prompt\`, \`escalate\`, \`taskContract\`, \`workType\`, \`signals\`,`:
  ```markdown
  `execution` is the 2.0 arm, and adding it is MINOR: `engineos kernel execution
  --facts '<json>'` takes the declared scope facts (`riskTier`, `reversible`,
  `domainCount`, `unitCount`, `fileCount`, `securitySensitive`, `requiredAgents`,
  and the optional `requestedMode`) and answers `{ mode, reasons, units,
  policyCapacity }`. It is a projection of `resolve --facts '{"execution": ...}'`
  and answers byte-identically to it, with one addition the general form does not
  have: an EMPTY fact object answers the `unresolved` lane instead of refusing,
  because a caller that cannot yet scope the work must be able to say so. `mode`
  and every member of `reasons` are closed vocabularies; adding a member is MINOR,
  removing or renaming one is MAJOR.
  ```

- [ ] **Step 2: Inventory the three surfaces in `## Unreleased`.** Append three rows to that table:
  ```markdown
  | `engineos kernel execution --facts '<json>'` | new: answers the execution lane (`unresolved` / `direct` / `delegate` / `wave`) from declared scope facts. `resolve --facts` gains the matching `execution` fact key and `resolve-task`-shaped answers gain an `execution` section, present exactly when those facts were declared — every existing answer is byte-identical when they are not | added |
  | `registries/policy.json` `.execution` | new block: `modes`, `direct_lane` (`max_risk`, `requires_reversible`, `max_domains`, `max_units`, `max_files`, `forbid_security_sensitive`, `forbid_required_agents`) and `wave_lane` (`min_units`, `min_domains`). The typed loader is fail-closed, so a consumer's hand-edited `policy.json` without the block now exits 1 with `registries/policy.json: .execution must be an object` where it previously loaded (MAJOR for a consumer carrying its own policy.json; the shipped one is complete) | added |
  | `rules/subagents.md` "Dispatch is mandatory" -> "Dispatch is proportional" | the 2.0 semantic break: a dispatch is no longer required for every routed unit. Work that is low-risk, reversible, one domain, one unit and at most two files with no security-sensitive surface and no named agent runs `direct` — inline, with no brief, wait, return envelope or integration cycle. Every gate is unchanged, and a security review, a `critic` pass, a user-named agent or release approval still overrides the lane. `rules/parallelism.md` gains "Execution lanes" and its "Decompose-and-distribute" section is scoped to lanes past `direct` | removed |
  | `scripts/validate-engineos.sh` / `validate --list` | C38 (the `.execution` block is well formed in both directions), C38b (the kernel answers the lane the block declares) and C38c (the two rule files mirror it) added as `src/checks/execution-lane.ts`. A tree whose `.execution` block and prose disagree now fails `validate` (MINOR: new failing check). The registered check count goes from 68 to 71 | added |
  ```

- [ ] **Step 3: Rebuild the bundle.** `npm run build`
  Expected: the build script writes `dist/engineos.cjs` and prints its size. `git status --short dist/` must show `M dist/engineos.cjs`.

- [ ] **Step 4: Run the wave's whole gate, output shown.**
  ```bash
  npm run build && npm run typecheck && npm test && node dist/engineos.cjs validate
  ```
  Expected: `npm test` reports `# fail 0`, and `validate` reports `passed 71, failed 0`. This is the Wave 2 barrier's Validation gate; it runs once, here, and nowhere earlier.

- [ ] **Step 5: Commit.**
  ```bash
  git add docs/COMPATIBILITY.md dist/engineos.cjs
  git commit -m "docs(compat): inventory the execution lane and rebuild the bundle

Records the added kernel subcommand, the added policy block and the
removed 1.x dispatch mandate as the 2.0 break they are, and ships the
runtime artifact the hooks and installers execute.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

## Wave 2 barrier

All six of the program plan's barrier exit criteria, plus what this wave hands Wave 3:

- [ ] Every task above checked off, each with its own commit.
- [ ] `npm run build && npm run typecheck && npm test` green, output shown (Task 9 Step 4).
- [ ] `node dist/engineos.cjs validate` green at 71 checks.
- [ ] `dist/engineos.cjs` rebuilt and committed (Task 9).
- [ ] `docs/COMPATIBILITY.md` updated for the added subcommand, the added registry block and the removed dispatch mandate (Task 9).
- [ ] A handoff written per `templates/handoff.md`.

Entry facts the handoff must carry for Wave 3:

- `ExecutionUnit` is exported from `src/kernel/execution.ts` and is the type `initialState(units: ExecutionUnit[], capacity: number)` consumes.
- `ExecutionSection.units` is always `[]` in Wave 2, because `ExecutionFacts` declares counts and not units. Wave 3's scheduler is handed units by its own `--units` payload, exactly as `waves` already is; it must not read them off the execution section.
- `ExecutionSection.policyCapacity` is `registries/policy.json` `.parallelism.wave_concurrency_cap` and nothing else. F3's `Math.min(policyCapacity, hostCapacity)` is Wave 3's arithmetic, not the kernel's.
- The reason vocabulary is closed and pinned in two places: `src/kernel/execution.ts` and `REASONS` in `src/checks/execution-lane.ts`. Adding a reason means editing both, plus `docs/COMPATIBILITY.md`.
