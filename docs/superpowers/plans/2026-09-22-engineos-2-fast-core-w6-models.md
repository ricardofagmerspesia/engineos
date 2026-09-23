# EngineOS 2.0 Fast Core — Wave 6: distinct model tiers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1-7 and 9-10 are ordinary code/registry work. **Task 8 runs an evaluation and records its result; its outcome is not knowable before it runs, and Task 9 is conditional on it.** Do not pre-fill Task 8's answer.

**Goal:** Give `build` and `cheap` work distinct, evidence-selected model bindings so routine implementation stops paying design-tier latency and the `build -> design` escalation stops being a no-op — without lowering the bar on architecture, security or adversarial review, which stay on the design tier whatever the evaluation says.

**Architecture:** `registries/models.json` gains three things: a `build_selection` gate (quality floors, improvement thresholds, sample minimums, lifecycle-regression ceiling), an `adapters` block so one tier can resolve to different concrete models per host adapter, and two cheap-tier work types for inventory and localization. A new `engineos evals models` arm grades recorded per-candidate transcripts against the repository's own routing set (`evals/intent-routing-cases.jsonl`) and a new implementation set (`evals/build-tier-cases.jsonl`), and a pure decision function applies the registry gate to those reports. The rebinding itself is one commit that moves the registry, the `rules/models.md` table, every build-tier agent's frontmatter and the generated agent registry together, because the validator, `C16` and `C31` each fail when any one of them moves alone.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), esbuild to committed CJS, JSON registries, Node built-in test runner (`node --test`), node >= 18.

**Spec:** [docs/specs/2026-09-22-engineos-2-fast-core-design.md](../../specs/2026-09-22-engineos-2-fast-core-design.md) — section "7. Distinct model tiers" and "Open implementation facts, not design choices".

**Program plan:** [2026-09-22-engineos-2-fast-core-00-program.md](./2026-09-22-engineos-2-fast-core-00-program.md) — F1, F6 and F7 are frozen contracts consumed here, not redefined.

**Depends on:** Wave 1 (F6 lifecycle baselines under `docs/perf/baselines/`, `engineos bench lifecycle`, `engineos bench baseline --write`) and Wave 2 (execution facts, for nothing this wave writes — Wave 2 is a barrier ordering only).

---

## Global Constraints

Every task's requirements implicitly include this section. A Wave 6 implementer trips on these specifically.

- **Registry and prose move together or the validator fails.** `node dist/engineos.cjs validate` runs `C16`, which asserts (a) every `registries/models.json` `tiers[].model` appears somewhere in `rules/models.md` as a backticked literal, (b) the `rules/models.md` table row whose text contains "adr" names the most-capable model, (c) the row whose text contains "code review" names the **build** model, and (d) when two tiers share a model binding, `rules/models.md` contains the literal phrase `bound to the same model`. A rebinding that changes the registry without the prose, or the prose without the registry, fails CI in the same commit it lands.
- **`C31` binds agent frontmatter to the registry.** Every `agents/*.md` that declares both `tier:` and `model:` must declare the model its tier binds. Sixteen agents declare `tier: build` today. A build rebinding that does not move all sixteen fails `C31` with `tier-model-mismatch`.
- **`registries/agents.json` is generated.** After touching `agents/*.md` frontmatter, run `node dist/engineos.cjs gen agent-registry` and commit the result; CI has a drift guard.
- **The `model` kernel arm is pinned by a bash-parity suite.** `src/kernel/parity.test.ts` replays `model --work adr`, `--work build`, `--work nonsense` and the empty case against recorded bash answers. The answer's key set and order must stay byte-identical when no new fact is declared. New behavior is added sparsely: a key appears only when the fact that produces it was declared.
- **The `engineos evals` default output is public surface.** `docs/COMPATIBILITY.md` names the `ok` / `FAIL` / `SKIP` lines and the `passed X, failed Y, skipped Z` summary; `src/evals/run.test.ts` pins the counts. Do not add graded lines to `runDeterministicTier`. The comparison suite is a new argv arm, `engineos evals models`, and bare `engineos evals` stays byte-identical.
- No `any`. Unknown input is `unknown`, narrowed immediately. No `as` to silence an error.
- One `import` statement per module — never split symbols from the same source across lines.
- Explicit return types on every exported function.
- `Number.parseInt` / `Number.parseFloat`, never the globals.
- Tests are colocated: `src/<area>/<name>.test.ts`. Tests ARE in scope for this wave.
- `dist/engineos.cjs` is a committed build artifact. Any task that changes `src/` runs `npm run build` and commits the bundle.
- **The tier is the contract; the model name is only today's binding.** Nothing outside `registries/models.json` and the `rules/models.md` table may hardcode a concrete model id as a fact. Tests that assert on a model read it from the registry.
- **Unknown is `null`, never `0`** (F6). A recorded run with no cost figure carries `costMicros: null`, and a sum containing a null is null. A gate never reads an unknown as a zero and calls it an improvement.
- **No concrete model is promoted by prose.** The plan states thresholds and a procedure; the implementer runs the evaluation and records the winner. A step that writes a model id as "the winner" before Task 8 has run is a defect.
- English only, no emojis. Comments say WHY.
- Conventional Commits. Each task is one commit, well under 400 changed lines.

---

## File Structure

| File | Created / Modified | Single responsibility |
|---|---|---|
| `registries/models.json` | Modified (T1, T6, T7, T9) | Machine-readable tier/work-type/adapter bindings and the build-selection gate |
| `rules/models.md` | Modified (T1, T6, T7, T9) | The human mirror of the above; `C16` compares them |
| `src/registry/models.ts` | Modified (T1, T7, T9) | Loader for `models.json`; refuses a malformed row rather than defaulting it |
| `src/registry/models.test.ts` | Modified (T1, T7, T9) | Pins the loaded shape against the shipped registry |
| `src/kernel/model.ts` | Modified (T9) | Answers the `model` section for a work type, optionally through an adapter |
| `src/kernel/model.test.ts` | Modified (T7, T9) | Pins the `model` section behavior |
| `src/kernel/resolve.ts` | Modified (T9) | Carries the optional `adapter` fact into `modelSection` |
| `src/kernel/cli.ts` | Modified (T9) | Parses `--adapter` on the `model` arm |
| `src/kernel/cli.test.ts` | Modified (T7, T9) | Pins the `model` arm's rendered answer |
| `evals/build-tier-cases.jsonl` | **Created (T2)** | Implementation cases: what a build-tier model must produce on this repository's own conventions |
| `evals/RUBRIC.md` | Modified (T2, T5) | Grading contract for every eval suite, including the new one |
| `src/evals/live.ts` | Modified (T3) | Exports `routerLine` so the comparison suite grades routing the same way the live tier does |
| `src/evals/candidates.ts` | **Created (T3)** | Loads recorded per-candidate transcripts and grades them into a `CandidateReport` |
| `src/evals/candidates.test.ts` | **Created (T3)** | Pins transcript loading, grading and the unknown-cost rule |
| `src/evals/selection.ts` | **Created (T4)** | Pure decision rule: reports plus the registry gate to a verdict with reason slugs |
| `src/evals/selection.test.ts` | **Created (T4)** | Pins every branch of the decision rule |
| `src/evals/run.ts` | Modified (T5) | Dispatches bare `evals` (unchanged) and the new `evals models` arm |
| `src/evals/run.test.ts` | Modified (T5) | Pins that the default output is unchanged and the new arm is wired |
| `src/checks/decision-registries.ts` | Modified (T9) | Adds the `C16` assertion that every adapter id is named in `rules/models.md` |
| `src/checks/decision-registries.test.ts` | Modified (T9) | Pins that assertion |
| `evals/results/build-tier-2026-09-22.json` | **Created (T8)** | The recorded evaluation output — the artifact the decision is made from |
| `agents/*.md` (the 16 with `tier: build`) | Modified (T7, conditional) | Frontmatter model follows the tier binding |
| `registries/agents.json` | Regenerated (T7, conditional) | Generated from agent frontmatter |
| `commands/implement.md` | Modified (T7, conditional) | Prose naming the build-tier model for code units |
| `docs/COMPATIBILITY.md` | Modified (T5, T9) | Records the added CLI arm and the added kernel flag |
| `docs/adr/2026-09-22-build-tier-binding.md` | **Created (T10)** | The recorded decision and its rejected alternative |
| `dist/engineos.cjs` | Rebuilt (T1, T3, T4, T5, T6, T7, T9) | Committed build artifact |

---

### Task 1: The build-selection gate in the registry and its loader

The gate is a design choice and belongs in the registry before any candidate is measured, so the thresholds cannot be chosen after seeing the numbers.

**Files:**
- `registries/models.json` (modified)
- `rules/models.md` (modified)
- `src/registry/models.ts` (modified)
- `src/registry/models.test.ts` (modified)
- `dist/engineos.cjs` (rebuilt)

**Interfaces:**

Consumes: `loadRegistry(root, 'models.json')` from `src/registry/load.ts`; `isRecord`, `KernelError` from `src/lib/json.ts`.

Produces:

```ts
export interface QualityFloor {
  min_routing_pass_rate: number;
  min_build_pass_rate: number;
  max_regressions_vs_incumbent: number;
}

export interface ImprovementThreshold {
  min_p50_latency_reduction_pct: number;
  min_cost_reduction_pct: number;
  require: 'either' | 'both';
}

export interface SampleFloor {
  min_routing_cases: number;
  min_build_cases: number;
  repeats_per_case: number;
}

export interface BuildSelection {
  incumbent_tier: string;
  quality_floor: QualityFloor;
  improvement: ImprovementThreshold;
  sample: SampleFloor;
  protected_tiers: string[];
  max_lifecycle_regression_pct: number;
}

// Added to ModelsRegistry:
//   build_selection: BuildSelection;
export function loadModels(root: string): ModelsRegistry;
```

- [ ] **Step 1: Add the failing loader test.** Append to `src/registry/models.test.ts`:

```ts
test('loads the build-selection gate', () => {
  const gate = loadModels(root).build_selection;
  assert.equal(gate.incumbent_tier, 'build');
  assert.equal(gate.quality_floor.min_routing_pass_rate, 1);
  assert.equal(gate.quality_floor.max_regressions_vs_incumbent, 0);
  assert.equal(gate.improvement.require, 'either');
  assert.ok(gate.improvement.min_p50_latency_reduction_pct > 0);
  assert.ok(gate.sample.repeats_per_case >= 3);
  assert.deepEqual(gate.protected_tiers, ['design', 'most-capable']);
  assert.ok(gate.max_lifecycle_regression_pct > 0);
});

test('a build_selection with a non-numeric threshold is refused, not defaulted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'models-gate-'));
  mkdirSync(join(dir, 'registries'), { recursive: true });
  const shipped = loadModels(root);
  writeFileSync(
    join(dir, 'registries', 'models.json'),
    JSON.stringify({
      version: shipped.version,
      tiers: shipped.tiers,
      escalation_order: shipped.escalation_order,
      work_types: shipped.work_types,
      build_selection: {
        incumbent_tier: 'build',
        quality_floor: { min_routing_pass_rate: 'all', min_build_pass_rate: 0.9, max_regressions_vs_incumbent: 0 },
        improvement: { min_p50_latency_reduction_pct: 25, min_cost_reduction_pct: 25, require: 'either' },
        sample: { min_routing_cases: 25, min_build_cases: 12, repeats_per_case: 3 },
        protected_tiers: ['design', 'most-capable'],
        max_lifecycle_regression_pct: 10,
      },
    }),
  );
  assert.throws(
    () => loadModels(dir),
    (error: unknown) =>
      error instanceof KernelError &&
      error.message ===
        'registries/models.json: build_selection.quality_floor.min_routing_pass_rate must be a number',
  );
});
```

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test registry/models.test.js`. Expected failure: TypeScript refuses first — `Property 'build_selection' does not exist on type 'ModelsRegistry'` in `src/registry/models.test.ts`.

- [ ] **Step 3: Add the registry block.** Insert into `registries/models.json`, after `work_types` and before `degradation_ladder`:

```json
  "build_selection": {
    "note": "The gate a candidate build-tier model must pass before it becomes the default binding. rules/models.md mirrors it under 'Build-tier selection gate'. Thresholds are fixed before any candidate is measured so they cannot be chosen to fit a result. Applied by src/evals/selection.ts; graded inputs come from engineos evals models.",
    "incumbent_tier": "build",
    "quality_floor": {
      "min_routing_pass_rate": 1,
      "min_build_pass_rate": 0.9,
      "max_regressions_vs_incumbent": 0
    },
    "improvement": {
      "min_p50_latency_reduction_pct": 25,
      "min_cost_reduction_pct": 25,
      "require": "either"
    },
    "sample": {
      "min_routing_cases": 25,
      "min_build_cases": 12,
      "repeats_per_case": 3
    },
    "protected_tiers": ["design", "most-capable"],
    "max_lifecycle_regression_pct": 10
  },
```

- [ ] **Step 4: Add the loader.** In `src/registry/models.ts`, add the interfaces from **Interfaces** above, add `build_selection: BuildSelection;` to `ModelsRegistry`, add `build_selection: requireBuildSelection(r['build_selection'])` to the object `loadModels` returns, and add these helpers beside the existing `requireString` family:

```ts
function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(field, 'a number');
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) fail(field, 'an object');
  return value;
}

// `require` is a closed two-value vocabulary rather than a free string: a typo
// would otherwise read as "neither axis satisfies the gate" and silently keep
// the incumbent for a reason nobody stated.
function requireRequirement(value: unknown, field: string): 'either' | 'both' {
  if (value !== 'either' && value !== 'both') fail(field, "'either' or 'both'");
  return value;
}

function requireBuildSelection(value: unknown): BuildSelection {
  const r = requireRecord(value, 'build_selection');
  const floor = requireRecord(r['quality_floor'], 'build_selection.quality_floor');
  const improvement = requireRecord(r['improvement'], 'build_selection.improvement');
  const sample = requireRecord(r['sample'], 'build_selection.sample');
  return {
    incumbent_tier: requireString(r['incumbent_tier'], 'build_selection.incumbent_tier'),
    quality_floor: {
      min_routing_pass_rate: requireNumber(floor['min_routing_pass_rate'], 'build_selection.quality_floor.min_routing_pass_rate'),
      min_build_pass_rate: requireNumber(floor['min_build_pass_rate'], 'build_selection.quality_floor.min_build_pass_rate'),
      max_regressions_vs_incumbent: requireNumber(floor['max_regressions_vs_incumbent'], 'build_selection.quality_floor.max_regressions_vs_incumbent'),
    },
    improvement: {
      min_p50_latency_reduction_pct: requireNumber(improvement['min_p50_latency_reduction_pct'], 'build_selection.improvement.min_p50_latency_reduction_pct'),
      min_cost_reduction_pct: requireNumber(improvement['min_cost_reduction_pct'], 'build_selection.improvement.min_cost_reduction_pct'),
      require: requireRequirement(improvement['require'], 'build_selection.improvement.require'),
    },
    sample: {
      min_routing_cases: requireNumber(sample['min_routing_cases'], 'build_selection.sample.min_routing_cases'),
      min_build_cases: requireNumber(sample['min_build_cases'], 'build_selection.sample.min_build_cases'),
      repeats_per_case: requireNumber(sample['repeats_per_case'], 'build_selection.sample.repeats_per_case'),
    },
    protected_tiers: requireStringArray(r['protected_tiers'], 'build_selection.protected_tiers'),
    max_lifecycle_regression_pct: requireNumber(r['max_lifecycle_regression_pct'], 'build_selection.max_lifecycle_regression_pct'),
  };
}
```

Add `mkdirSync`, `mkdtempSync`, `writeFileSync`, `tmpdir` and `join` to the test file's imports if they are not already there (`src/registry/models.test.ts` imports them today).

- [ ] **Step 5: Run it and see it pass.** `npx tsc -p tsconfig.json && cd build && node --test registry/models.test.js`. Expected: PASS, including both new tests.

- [ ] **Step 6: Mirror the gate into `rules/models.md`.** Append a section after "## Budget and degradation":

```markdown
## Build-tier selection gate

The build tier's model binding is selected by evidence, not by prose. A candidate
becomes the default binding only when it clears every floor below against the
incumbent, measured on this repository's own routing and implementation cases.
The thresholds live in `registries/models.json` `build_selection` and are fixed
before any candidate is measured, so they cannot be chosen to fit a result.

| Floor | Value | Why |
|---|---|---|
| Routing pass rate | 100% | The router announcement is the contract every other gate reads; a candidate that mis-routes cannot be trusted with anything downstream |
| Build pass rate | 90% | The implementation set encodes this repository's own conventions, and a tenth of them are judgment calls |
| Regressions vs incumbent | 0 | A case the incumbent passes and the candidate fails is a regression whatever the aggregate says |
| Sample | 25 routing cases, 12 build cases, 3 repeats each | Below this the comparison describes the sample, not the models |
| Improvement | p50 latency OR total cost at least 25% better | A binding that is merely equal buys nothing and costs a migration |
| Lifecycle regression | at most 10% on any scenario in the Wave 1 baseline | Measured against `docs/perf/baselines/<host-id>.json` on the same host |

`design` and `most-capable` are protected tiers: architecture, hard debugging,
security review and adversarial review stay on the design binding whatever the
evaluation says about build work. Run the gate with
`engineos evals models --transcripts <dir>`; the decision is recorded in an ADR
under `docs/adr/`.
```

- [ ] **Step 7: Validate.** `npm run build && node dist/engineos.cjs validate`. Expected: validator green — no `C16` finding, because the new block adds no tier and no model name.

- [ ] **Step 8: Commit.**

```bash
git add registries/models.json rules/models.md src/registry/models.ts src/registry/models.test.ts dist/engineos.cjs
git commit -m "feat(models): add the build-tier selection gate to the registry

The thresholds are fixed before any candidate is measured so they cannot be
chosen to fit a result. rules/models.md mirrors the block; C16 compares them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The build-tier implementation case set

The routing set already exists. What does not exist is a set of cases that says what a build-tier model must produce when it writes code in this repository.

**Files:**
- `evals/build-tier-cases.jsonl` (created)
- `evals/RUBRIC.md` (modified)

**Interfaces:**

Consumes: nothing — this is data.

Produces: JSONL, one case per line, the same `must` / `must_not` shape `evals/agent-cases.jsonl` uses so one grader serves both:

```ts
interface BuildCase {
  id: string;        // build-NNN
  input: string;     // the prompt sent to the candidate
  must: string[];    // case-insensitive substrings that must appear in the output
  must_not: string[];// case-insensitive substrings that must not appear
  notes: string;     // which rule or convention this case pins
}
```

- [ ] **Step 1: Write the case file.** Create `evals/build-tier-cases.jsonl` with at least 12 cases (the registry's `sample.min_build_cases`). Each case pins one rule this repository already enforces in prose, so a failure names a real convention rather than a taste. Write these twelve verbatim, one per line:

```jsonl
{"id":"build-001","input":"Write a TypeScript function that reads a JSON config file and returns its 'port' field. Follow strict TypeScript: no any, explicit return types.","must":["): number","unknown"],"must_not":[": any","as any"],"notes":"rules/base.md: no any, explicit return types on exported functions"}
{"id":"build-002","input":"Import readFileSync and writeFileSync from node:fs in a TypeScript module.","must":["import { readFileSync, writeFileSync } from 'node:fs'"],"must_not":["import { writeFileSync } from 'node:fs';\nimport { readFileSync }"],"notes":"rules/base.md: one import statement per module"}
{"id":"build-003","input":"Parse the string '42' into an integer in TypeScript.","must":["Number.parseInt"],"must_not":["parseInt(","parseFloat("],"notes":"rules/base.md: Number.parseInt, never the global"}
{"id":"build-004","input":"Model an order that is pending, active or failed in TypeScript.","must":["'pending'","'active'","'failed'"],"must_not":["isActive","isFailed"],"notes":"rules/base.md: discriminated unions, not boolean flags"}
{"id":"build-005","input":"Write a NestJS controller endpoint that lists a client's accounts with pagination.","must":["@Query()","Dto"],"must_not":["ParseIntPipe","DefaultValuePipe","@ApiQuery"],"notes":"production-backend-standards: typed DTOs, no inline pipes or ApiQuery"}
{"id":"build-006","input":"Write a NestJS controller method that returns a client's total balance across accounts.","must":["Service"],"must_not":["reduce(","repository."],"notes":"production-backend-standards: no aggregation and no repository access in controllers"}
{"id":"build-007","input":"Log that an order was created, in a NestJS service.","must":["logger"],"must_not":["console.log"],"notes":"production-backend-standards: structured logger, never console.log"}
{"id":"build-008","input":"Read the DATABASE_URL environment variable inside a NestJS service.","must":["EnvService"],"must_not":["process.env"],"notes":"production-backend-standards: EnvService, never process.env outside the config layer"}
{"id":"build-009","input":"Write a SQL query in TypeScript that finds users by a name supplied by the caller.","must":[":name","$1"],"must_not":["+ name","${name}"],"notes":"rules/security.md: parameterized queries, never string concatenation"}
{"id":"build-010","input":"Write a Postgres migration that adds a non-null 'status' column to a large orders table already in production.","must":["nullable","backfill"],"must_not":["NOT NULL DEFAULT"],"notes":"rules/data.md: expand-contract, no locking DDL on a large table"}
{"id":"build-011","input":"Handle a failure when an external payment API call times out, in a TypeScript service.","must":["Error"],"must_not":["catch {}","catch (e) {}"],"notes":"rules/base.md: never swallow errors"}
{"id":"build-012","input":"Write a React component that fetches and lists a user's orders.","must":["loading","error","empty"],"must_not":["useEffect(() => { fetch"],"notes":"rules/frontend.md: four states, no fetching in useEffect"}
```

- [ ] **Step 2: Check the file parses as JSONL.** Run:

```bash
node -e 'const fs=require("node:fs");let n=0;for(const l of fs.readFileSync("evals/build-tier-cases.jsonl","utf8").split("\n")){if(l==="")continue;n++;const c=JSON.parse(l);if(!c.id||!c.input||!Array.isArray(c.must)||!Array.isArray(c.must_not)||!c.notes)throw new Error("bad case "+c.id)}console.log("ok "+n+" cases")'
```

Expected: `ok 12 cases`. A parse error or a missing field names the line to fix.

- [ ] **Step 3: Document the suite in the rubric.** In `evals/RUBRIC.md`, add a row to the "What is graded" table:

```markdown
| Build tier comparison | `build-tier-cases.jsonl` | Graded only by `engineos evals models` against recorded per-candidate transcripts |
```

and add a section after "## Live tier (opt-in)":

```markdown
## Build-tier comparison tier (opt-in, not part of `engineos evals`)

`engineos evals models --transcripts <dir>` grades recorded transcripts, one
subdirectory per candidate model, against two suites: `intent-routing-cases.jsonl`
using the live tier's router-line contract, and `build-tier-cases.jsonl` using
case-insensitive `must` / `must_not` substring presence over the transcript's
output. Grading is deterministic: the same transcripts always produce the same
verdict, so a selection can be re-derived from the recorded artifact without
spending money again.

Each case must be recorded at least `build_selection.sample.repeats_per_case`
times per candidate; a case passes for that candidate only when every repeat
passes. The gate itself is `registries/models.json` `build_selection` — this
directory only produces the evidence.
```

- [ ] **Step 4: Confirm nothing else changed.** `npm test` is not needed here — no `src/` file moved. Run `node dist/engineos.cjs evals` and confirm the summary line is byte-identical to before this task (the new file is not read by the deterministic tier).

- [ ] **Step 5: Commit.**

```bash
git add evals/build-tier-cases.jsonl evals/RUBRIC.md
git commit -m "test(evals): add the build-tier implementation case set

Twelve cases, each pinning one convention this repository already enforces in
prose, so a candidate's failure names a rule rather than a taste.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Grade recorded candidate transcripts into a report

**Files:**
- `src/evals/candidates.ts` (created)
- `src/evals/candidates.test.ts` (created)
- `src/evals/live.ts` (modified — export `routerLine`)
- `dist/engineos.cjs` (rebuilt)

**Interfaces:**

Consumes: `INTENTS`, `nonEmptyLines`, `parseCase`, `jqString`, `jqWords`, `jqLength` from `./deterministic`; `routerLine` from `./live`.

Produces:

```ts
export const BUILD_CASES = 'evals/build-tier-cases.jsonl';

export interface RecordedRun {
  caseId: string;
  output: string;
  durationMs: number;
  costMicros: number | null;
}

export interface CaseVerdict {
  caseId: string;
  suite: 'routing' | 'build';
  passed: boolean;
  repeats: number;
  problems: string[];
}

export interface SuiteScore {
  cases: number;
  passed: number;
  minRepeats: number;
}

export interface CandidateReport {
  model: string;
  routing: SuiteScore;
  build: SuiteScore;
  p50Ms: number | null;
  p95Ms: number | null;
  costMicrosTotal: number | null;
  verdicts: CaseVerdict[];
}

export function loadRuns(transcriptDir: string, model: string): RecordedRun[];
export function gradeCandidate(root: string, model: string, runs: readonly RecordedRun[]): CandidateReport;
```

- [ ] **Step 1: Write the failing test.** Create `src/evals/candidates.test.ts`:

```ts
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempRoot } from '../testing/harness';
import { gradeCandidate, loadRuns, type RecordedRun } from './candidates';

const ROUTING_CASE = JSON.stringify({
  id: 'intent-001',
  input: 'add a POST /orders endpoint',
  expect_intents: ['backend'],
  must_load: ['backend'],
  must_not_load: ['frontend'],
  notes: 'pins the backend row',
});

const BUILD_CASE = JSON.stringify({
  id: 'build-003',
  input: "Parse the string '42' into an integer in TypeScript.",
  must: ['Number.parseInt'],
  must_not: ['parseInt('],
  notes: 'rules/base.md',
});

function evalRoot(t: TestContext): string {
  const root = tempRoot(t);
  mkdirSync(join(root, 'evals'), { recursive: true });
  writeFileSync(join(root, 'evals', 'intent-routing-cases.jsonl'), `${ROUTING_CASE}\n`);
  writeFileSync(join(root, 'evals', 'build-tier-cases.jsonl'), `${BUILD_CASE}\n`);
  return root;
}

function run(caseId: string, output: string, durationMs: number, costMicros: number | null): RecordedRun {
  return { caseId, output, durationMs, costMicros };
}

test('a candidate passing both suites reports full scores and a cost total', (t) => {
  const report = gradeCandidate(evalRoot(t), 'candidate-a', [
    run('intent-001', '[router] intent=backend loaded=backend', 900, 100),
    run('intent-001', '`[router] intent=backend loaded=backend`', 1100, 100),
    run('build-003', 'Number.parseInt(value, 10)', 700, 50),
  ]);
  assert.equal(report.model, 'candidate-a');
  assert.deepEqual(report.routing, { cases: 1, passed: 1, minRepeats: 2 });
  assert.deepEqual(report.build, { cases: 1, passed: 1, minRepeats: 1 });
  assert.equal(report.p50Ms, 900);
  assert.equal(report.costMicrosTotal, 250);
});

test('a case passes only when every recorded repeat passes', (t) => {
  const report = gradeCandidate(evalRoot(t), 'candidate-b', [
    run('intent-001', '[router] intent=backend loaded=backend', 900, 10),
    run('intent-001', '[router] intent=frontend loaded=frontend', 900, 10),
  ]);
  assert.equal(report.routing.passed, 0);
  const verdict = report.verdicts.find((v) => v.caseId === 'intent-001');
  assert.equal(verdict?.repeats, 2);
  assert.deepEqual(verdict?.problems, ['missing:backend', 'forbidden:frontend']);
});

test('a must_not hit fails a build case', (t) => {
  const report = gradeCandidate(evalRoot(t), 'candidate-c', [run('build-003', 'parseInt(value, 10)', 700, 5)]);
  assert.equal(report.build.passed, 0);
  assert.deepEqual(report.verdicts.find((v) => v.caseId === 'build-003')?.problems, [
    'missing:Number.parseInt',
    'forbidden:parseInt(',
  ]);
});

test('one unknown cost makes the total unknown, never a smaller number', (t) => {
  const report = gradeCandidate(evalRoot(t), 'candidate-d', [
    run('intent-001', '[router] intent=backend loaded=backend', 900, 100),
    run('build-003', 'Number.parseInt(v, 10)', 700, null),
  ]);
  assert.equal(report.costMicrosTotal, null);
  assert.equal(report.p95Ms, 900);
});

test('loadRuns reads one JSON file per recorded run and refuses a missing duration', (t) => {
  const root = tempRoot(t);
  const dir = join(root, 'transcripts', 'candidate-a');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'intent-001-1.json'), JSON.stringify({ caseId: 'intent-001', output: 'x', durationMs: 5, costMicros: null }));
  assert.deepEqual(loadRuns(join(root, 'transcripts'), 'candidate-a'), [
    { caseId: 'intent-001', output: 'x', durationMs: 5, costMicros: null },
  ]);
  writeFileSync(join(dir, 'intent-001-2.json'), JSON.stringify({ caseId: 'intent-001', output: 'x' }));
  assert.throws(
    () => loadRuns(join(root, 'transcripts'), 'candidate-a'),
    /intent-001-2\.json: durationMs must be a number/,
  );
});
```

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test evals/candidates.test.js`. Expected failure: `error TS2307: Cannot find module './candidates'`.

- [ ] **Step 3: Export `routerLine` from the live tier.** In `src/evals/live.ts`, change `function routerLine(` to `export function routerLine(` and extend its comment with one sentence: `Exported because ./candidates grades a recorded transcript against the same contract; two readers of one announcement must not drift.`

- [ ] **Step 4: Write the implementation.** Create `src/evals/candidates.ts`:

```ts
// Grades recorded candidate transcripts for the build-tier selection gate
// (rules/models.md "Build-tier selection gate"). Grading is separated from
// running on purpose: the model calls are expensive and non-deterministic, the
// verdict must be re-derivable from the recorded artifact, and a suite that
// re-ran the models every time nobody could audit would be a vibes check with a
// JSON wrapper.
//
// The routing contract is the live tier's, read through the same routerLine, so
// the comparison cannot drift from the suite it is comparing against.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord, KernelError } from '../lib/json';
import { INTENTS, jqLength, jqString, jqWords, nonEmptyLines, parseCase } from './deterministic';
import { routerLine } from './live';

export const BUILD_CASES = 'evals/build-tier-cases.jsonl';

export interface RecordedRun {
  caseId: string;
  output: string;
  durationMs: number;
  costMicros: number | null;
}

export interface CaseVerdict {
  caseId: string;
  suite: 'routing' | 'build';
  passed: boolean;
  repeats: number;
  problems: string[];
}

export interface SuiteScore {
  cases: number;
  passed: number;
  minRepeats: number;
}

export interface CandidateReport {
  model: string;
  routing: SuiteScore;
  build: SuiteScore;
  p50Ms: number | null;
  p95Ms: number | null;
  costMicrosTotal: number | null;
  verdicts: CaseVerdict[];
}

export function loadRuns(transcriptDir: string, model: string): RecordedRun[] {
  const dir = join(transcriptDir, model);
  const names = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  return names.map((name) => parseRun(join(dir, name), name));
}

export function gradeCandidate(root: string, model: string, runs: readonly RecordedRun[]): CandidateReport {
  const byCase = new Map<string, RecordedRun[]>();
  for (const run of runs) {
    const bucket = byCase.get(run.caseId) ?? [];
    bucket.push(run);
    byCase.set(run.caseId, bucket);
  }
  const verdicts: CaseVerdict[] = [
    ...gradeSuite(root, INTENTS, 'routing', byCase, routingProblems),
    ...gradeSuite(root, BUILD_CASES, 'build', byCase, buildProblems),
  ];
  return {
    model,
    routing: score(verdicts, 'routing'),
    build: score(verdicts, 'build'),
    p50Ms: percentile(runs.map((run) => run.durationMs), 50),
    p95Ms: percentile(runs.map((run) => run.durationMs), 95),
    costMicrosTotal: totalCost(runs),
    verdicts,
  };
}

// ------------------------------------------------------------------- grading

type Problems = (parsed: unknown, output: string) => string[];

function gradeSuite(
  root: string,
  file: string,
  suite: 'routing' | 'build',
  byCase: ReadonlyMap<string, RecordedRun[]>,
  problemsOf: Problems,
): CaseVerdict[] {
  return nonEmptyLines(root, file).map((line) => {
    const parsed = parseCase(line);
    const caseId = jqString(parsed, 'id');
    const recorded = byCase.get(caseId) ?? [];
    // No recording is not a pass. A candidate with nothing recorded for a case
    // has not answered it, and the sample floor in the gate is what turns that
    // into a refusal rather than a silent zero.
    const problems = recorded.length === 0
      ? ['not-recorded']
      : unique(recorded.flatMap((run) => problemsOf(parsed, run.output)));
    return { caseId, suite, passed: problems.length === 0, repeats: recorded.length, problems };
  });
}

// The live tier's contract, verbatim: a case with no expected intents is a pure
// question and passes only when NO router line was emitted.
function routingProblems(parsed: unknown, output: string): string[] {
  const router = routerLine(output);
  if (jqLength(parsed, 'expect_intents') === 0) return router === '' ? [] : [`over-routed:${router}`];
  if (router === '') return ['no-router-line'];
  const problems: string[] = [];
  for (const rule of jqWords(parsed, 'must_load')) if (!router.includes(rule)) problems.push(`missing:${rule}`);
  for (const rule of jqWords(parsed, 'must_not_load')) if (router.includes(rule)) problems.push(`forbidden:${rule}`);
  return problems;
}

// Case-insensitive, matching how evals/RUBRIC.md states the build suite: the
// cases pin identifiers and call shapes, and a capitalization difference in
// surrounding prose is not the defect the case is about.
function buildProblems(parsed: unknown, output: string): string[] {
  const haystack = output.toLowerCase();
  const problems: string[] = [];
  for (const needle of stringsOf(parsed, 'must')) {
    if (!haystack.includes(needle.toLowerCase())) problems.push(`missing:${needle}`);
  }
  for (const needle of stringsOf(parsed, 'must_not')) {
    if (haystack.includes(needle.toLowerCase())) problems.push(`forbidden:${needle}`);
  }
  return problems;
}

// jqWords splits on whitespace, which would shred a must string like
// "): number". The build suite's entries are whole substrings, so they are read
// as whole elements.
function stringsOf(value: unknown, key: string): string[] {
  const field = isRecord(value) ? value[key] : undefined;
  if (!Array.isArray(field)) return [];
  const items: unknown[] = field;
  return items.filter((item): item is string => typeof item === 'string');
}

function score(verdicts: readonly CaseVerdict[], suite: 'routing' | 'build'): SuiteScore {
  const rows = verdicts.filter((verdict) => verdict.suite === suite);
  return {
    cases: rows.length,
    passed: rows.filter((verdict) => verdict.passed).length,
    minRepeats: rows.length === 0 ? 0 : Math.min(...rows.map((verdict) => verdict.repeats)),
  };
}

// ---------------------------------------------------------------- aggregation

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? null;
}

// F6: unknown is null, never zero. One unrecorded cost makes the total unknown,
// because a sum that skipped it would understate the candidate's real cost and
// the gate would read that understatement as an improvement.
function totalCost(runs: readonly RecordedRun[]): number | null {
  let total = 0;
  for (const run of runs) {
    if (run.costMicros === null) return null;
    total += run.costMicros;
  }
  return runs.length === 0 ? null : total;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function parseRun(path: string, name: string): RecordedRun {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const record = isRecord(raw) ? raw : {};
  const caseId = record['caseId'];
  const output = record['output'];
  const durationMs = record['durationMs'];
  const costMicros = record['costMicros'];
  if (typeof caseId !== 'string' || caseId === '') throw new KernelError(`${name}: caseId must be a non-empty string`);
  if (typeof output !== 'string') throw new KernelError(`${name}: output must be a string`);
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
    throw new KernelError(`${name}: durationMs must be a number`);
  }
  if (costMicros !== null && (typeof costMicros !== 'number' || !Number.isFinite(costMicros))) {
    throw new KernelError(`${name}: costMicros must be a number or null`);
  }
  return { caseId, output, durationMs, costMicros };
}
```

- [ ] **Step 5: Run it and see it pass.** `npx tsc -p tsconfig.json && cd build && node --test evals/candidates.test.js`. Expected: PASS, 5 tests.

- [ ] **Step 6: Confirm the live tier still passes.** `cd build && node --test evals/live.test.js evals/run.test.js`. Expected: PASS — the only change to `live.ts` is an `export` keyword.

- [ ] **Step 7: Build and commit.**

```bash
npm run build
git add src/evals/candidates.ts src/evals/candidates.test.ts src/evals/live.ts dist/engineos.cjs
git commit -m "feat(evals): grade recorded candidate transcripts into a report

Grading is split from running so a selection can be re-derived from the recorded
artifact. Routing reuses the live tier's routerLine; one unknown cost makes the
total unknown rather than a smaller number.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The selection decision rule

**Files:**
- `src/evals/selection.ts` (created)
- `src/evals/selection.test.ts` (created)
- `dist/engineos.cjs` (rebuilt)

**Interfaces:**

Consumes: `CandidateReport` from `./candidates`; `BuildSelection` from `../registry/models`.

Produces:

```ts
export type SelectionVerdict = 'select' | 'keep' | 'insufficient-evidence';

export interface RejectedCandidate {
  model: string;
  reasons: string[];
}

export interface SelectionOutcome {
  verdict: SelectionVerdict;
  winner: string | null;
  reasons: string[];
  rejected: RejectedCandidate[];
}

export function selectBuildModel(
  incumbent: CandidateReport,
  candidates: readonly CandidateReport[],
  gate: BuildSelection,
): SelectionOutcome;
```

Reason slugs are a closed vocabulary — `sample-too-small`, `routing-floor`, `build-floor`, `regression`, `latency-unknown`, `cost-unknown`, `no-improvement`, `improvement-latency`, `improvement-cost`, `tie-keeps-incumbent`, `no-candidates`. A reason outside this list is one nobody can argue with.

- [ ] **Step 1: Write the failing test.** Create `src/evals/selection.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CandidateReport, CaseVerdict } from './candidates';
import { selectBuildModel } from './selection';
import type { BuildSelection } from '../registry/models';

const GATE: BuildSelection = {
  incumbent_tier: 'build',
  quality_floor: { min_routing_pass_rate: 1, min_build_pass_rate: 0.9, max_regressions_vs_incumbent: 0 },
  improvement: { min_p50_latency_reduction_pct: 25, min_cost_reduction_pct: 25, require: 'either' },
  sample: { min_routing_cases: 2, min_build_cases: 2, repeats_per_case: 2 },
  protected_tiers: ['design', 'most-capable'],
  max_lifecycle_regression_pct: 10,
};

function verdicts(passing: readonly string[], failing: readonly string[]): CaseVerdict[] {
  return [
    ...passing.map((caseId): CaseVerdict => ({ caseId, suite: 'build', passed: true, repeats: 2, problems: [] })),
    ...failing.map((caseId): CaseVerdict => ({ caseId, suite: 'build', passed: false, repeats: 2, problems: ['missing:x'] })),
  ];
}

function report(model: string, over: Partial<CandidateReport> = {}): CandidateReport {
  return {
    model,
    routing: { cases: 2, passed: 2, minRepeats: 2 },
    build: { cases: 2, passed: 2, minRepeats: 2 },
    p50Ms: 1000,
    p95Ms: 2000,
    costMicrosTotal: 1000,
    verdicts: verdicts(['b1', 'b2'], []),
    ...over,
  };
}

test('a faster candidate that clears every floor is selected', () => {
  const outcome = selectBuildModel(report('incumbent'), [report('fast', { p50Ms: 500 })], GATE);
  assert.equal(outcome.verdict, 'select');
  assert.equal(outcome.winner, 'fast');
  assert.deepEqual(outcome.reasons, ['improvement-latency']);
});

test('a cheaper candidate at equal latency is selected on the cost axis', () => {
  const outcome = selectBuildModel(report('incumbent'), [report('cheap', { costMicrosTotal: 400 })], GATE);
  assert.equal(outcome.verdict, 'select');
  assert.deepEqual(outcome.reasons, ['improvement-cost']);
});

test('an equally fast and equally priced candidate keeps the incumbent', () => {
  const outcome = selectBuildModel(report('incumbent'), [report('same')], GATE);
  assert.equal(outcome.verdict, 'keep');
  assert.equal(outcome.winner, null);
  assert.deepEqual(outcome.rejected, [{ model: 'same', reasons: ['no-improvement'] }]);
});

test('a routing miss rejects a candidate however fast it is', () => {
  const outcome = selectBuildModel(
    report('incumbent'),
    [report('sloppy', { p50Ms: 100, routing: { cases: 2, passed: 1, minRepeats: 2 } })],
    GATE,
  );
  assert.equal(outcome.verdict, 'keep');
  assert.deepEqual(outcome.rejected, [{ model: 'sloppy', reasons: ['routing-floor'] }]);
});

test('a case the incumbent passes and the candidate fails is a regression', () => {
  const outcome = selectBuildModel(
    report('incumbent'),
    [report('regressor', { p50Ms: 100, build: { cases: 2, passed: 1, minRepeats: 2 }, verdicts: verdicts(['b1'], ['b2']) })],
    GATE,
  );
  assert.equal(outcome.verdict, 'keep');
  assert.deepEqual(outcome.rejected, [{ model: 'regressor', reasons: ['build-floor', 'regression'] }]);
});

test('unknown cost is never read as an improvement', () => {
  const outcome = selectBuildModel(report('incumbent'), [report('opaque', { costMicrosTotal: null })], GATE);
  assert.equal(outcome.verdict, 'keep');
  assert.deepEqual(outcome.rejected, [{ model: 'opaque', reasons: ['cost-unknown', 'no-improvement'] }]);
});

test('too few repeats is insufficient evidence, not a pass and not a rejection', () => {
  const outcome = selectBuildModel(
    report('incumbent'),
    [report('thin', { p50Ms: 100, build: { cases: 2, passed: 2, minRepeats: 1 } })],
    GATE,
  );
  assert.equal(outcome.verdict, 'insufficient-evidence');
  assert.deepEqual(outcome.rejected, [{ model: 'thin', reasons: ['sample-too-small'] }]);
});

test('a thin incumbent sample makes the whole comparison insufficient', () => {
  const outcome = selectBuildModel(report('incumbent', { routing: { cases: 1, passed: 1, minRepeats: 2 } }), [report('fast', { p50Ms: 100 })], GATE);
  assert.equal(outcome.verdict, 'insufficient-evidence');
  assert.deepEqual(outcome.reasons, ['sample-too-small']);
});

test('no candidates is insufficient evidence', () => {
  const outcome = selectBuildModel(report('incumbent'), [], GATE);
  assert.equal(outcome.verdict, 'insufficient-evidence');
  assert.deepEqual(outcome.reasons, ['no-candidates']);
});

test('the largest satisfied margin wins and an exact tie keeps the incumbent', () => {
  const tie = selectBuildModel(report('incumbent'), [report('a', { p50Ms: 500 }), report('b', { p50Ms: 500 })], GATE);
  assert.equal(tie.verdict, 'keep');
  assert.deepEqual(tie.reasons, ['tie-keeps-incumbent']);
  const clear = selectBuildModel(report('incumbent'), [report('a', { p50Ms: 500 }), report('b', { p50Ms: 400 })], GATE);
  assert.equal(clear.winner, 'b');
});
```

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test evals/selection.test.js`. Expected failure: `error TS2307: Cannot find module './selection'`.

- [ ] **Step 3: Write the implementation.** Create `src/evals/selection.ts`:

```ts
// The build-tier selection gate as a pure function. registries/models.json owns
// the thresholds; this file owns only the order the checks are applied in and
// the vocabulary the answer is stated in.
//
// Three verdicts, not two. "keep" means the gate ran and the incumbent won;
// "insufficient-evidence" means the gate could not run, which is the
// evidence-insufficient HITL reason of rules/risk-autonomy.md and must never be
// rendered as a pass.
import type { BuildSelection } from '../registry/models';
import type { CandidateReport } from './candidates';

export type SelectionVerdict = 'select' | 'keep' | 'insufficient-evidence';

export interface RejectedCandidate {
  model: string;
  reasons: string[];
}

export interface SelectionOutcome {
  verdict: SelectionVerdict;
  winner: string | null;
  reasons: string[];
  rejected: RejectedCandidate[];
}

interface Survivor {
  model: string;
  margin: number;
  reason: 'improvement-latency' | 'improvement-cost';
}

export function selectBuildModel(
  incumbent: CandidateReport,
  candidates: readonly CandidateReport[],
  gate: BuildSelection,
): SelectionOutcome {
  if (candidates.length === 0) return { verdict: 'insufficient-evidence', winner: null, reasons: ['no-candidates'], rejected: [] };
  if (!sampleSufficient(incumbent, gate)) {
    return { verdict: 'insufficient-evidence', winner: null, reasons: ['sample-too-small'], rejected: [] };
  }

  const rejected: RejectedCandidate[] = [];
  const survivors: Survivor[] = [];
  let thinSample = false;

  for (const candidate of candidates) {
    if (!sampleSufficient(candidate, gate)) {
      thinSample = true;
      rejected.push({ model: candidate.model, reasons: ['sample-too-small'] });
      continue;
    }
    const reasons = qualityFailures(incumbent, candidate, gate);
    const improvement = reasons.length === 0 ? improvementOf(incumbent, candidate, gate) : null;
    if (improvement === null) {
      rejected.push({ model: candidate.model, reasons: [...reasons, ...unknownAxes(incumbent, candidate), 'no-improvement'].filter(unique) });
      continue;
    }
    survivors.push(improvement);
  }

  // A thin sample anywhere means the comparison has not been made, so it cannot
  // answer "keep" either: keeping on partial evidence is a decision dressed as
  // an absence of one.
  if (thinSample) return { verdict: 'insufficient-evidence', winner: null, reasons: ['sample-too-small'], rejected };
  if (survivors.length === 0) return { verdict: 'keep', winner: null, reasons: [], rejected };

  const best = survivors.reduce((a, b) => (b.margin > a.margin ? b : a));
  if (survivors.filter((survivor) => survivor.margin === best.margin).length > 1) {
    return { verdict: 'keep', winner: null, reasons: ['tie-keeps-incumbent'], rejected };
  }
  return { verdict: 'select', winner: best.model, reasons: [best.reason], rejected };
}

// ------------------------------------------------------------------ predicates

function sampleSufficient(report: CandidateReport, gate: BuildSelection): boolean {
  return (
    report.routing.cases >= gate.sample.min_routing_cases &&
    report.build.cases >= gate.sample.min_build_cases &&
    report.routing.minRepeats >= gate.sample.repeats_per_case &&
    report.build.minRepeats >= gate.sample.repeats_per_case
  );
}

function qualityFailures(incumbent: CandidateReport, candidate: CandidateReport, gate: BuildSelection): string[] {
  const reasons: string[] = [];
  if (rate(candidate.routing.passed, candidate.routing.cases) < gate.quality_floor.min_routing_pass_rate) {
    reasons.push('routing-floor');
  }
  if (rate(candidate.build.passed, candidate.build.cases) < gate.quality_floor.min_build_pass_rate) {
    reasons.push('build-floor');
  }
  if (regressions(incumbent, candidate) > gate.quality_floor.max_regressions_vs_incumbent) reasons.push('regression');
  return reasons;
}

// A case the incumbent passes and the candidate fails, whatever the aggregate
// rates say. An average that improves while a specific case breaks is still a
// break, and the case ids are what makes the finding arguable.
function regressions(incumbent: CandidateReport, candidate: CandidateReport): number {
  const passed = new Set(incumbent.verdicts.filter((verdict) => verdict.passed).map((verdict) => verdict.caseId));
  return candidate.verdicts.filter((verdict) => !verdict.passed && passed.has(verdict.caseId)).length;
}

function improvementOf(incumbent: CandidateReport, candidate: CandidateReport, gate: BuildSelection): Survivor | null {
  const latency = reductionPct(incumbent.p50Ms, candidate.p50Ms);
  const cost = reductionPct(incumbent.costMicrosTotal, candidate.costMicrosTotal);
  const latencyMet = latency !== null && latency >= gate.improvement.min_p50_latency_reduction_pct;
  const costMet = cost !== null && cost >= gate.improvement.min_cost_reduction_pct;
  if (gate.improvement.require === 'both' && !(latencyMet && costMet)) return null;
  if (gate.improvement.require === 'either' && !(latencyMet || costMet)) return null;
  if (latencyMet && (!costMet || (latency ?? 0) >= (cost ?? 0))) {
    return { model: candidate.model, margin: latency ?? 0, reason: 'improvement-latency' };
  }
  return { model: candidate.model, margin: cost ?? 0, reason: 'improvement-cost' };
}

// F6 again: an unknown is not zero and not an improvement. The axis is reported
// as unknown so the rejection says WHICH measurement is missing.
function unknownAxes(incumbent: CandidateReport, candidate: CandidateReport): string[] {
  const reasons: string[] = [];
  if (incumbent.p50Ms === null || candidate.p50Ms === null) reasons.push('latency-unknown');
  if (incumbent.costMicrosTotal === null || candidate.costMicrosTotal === null) reasons.push('cost-unknown');
  return reasons;
}

function reductionPct(before: number | null, after: number | null): number | null {
  if (before === null || after === null || before <= 0) return null;
  return ((before - after) / before) * 100;
}

function rate(passed: number, cases: number): number {
  return cases === 0 ? 0 : passed / cases;
}

function unique(value: string, index: number, all: string[]): boolean {
  return all.indexOf(value) === index;
}
```

- [ ] **Step 4: Run it and see it pass.** `npx tsc -p tsconfig.json && cd build && node --test evals/selection.test.js`. Expected: PASS, 10 tests.

- [ ] **Step 5: Build and commit.**

```bash
npm run build
git add src/evals/selection.ts src/evals/selection.test.ts dist/engineos.cjs
git commit -m "feat(evals): add the build-tier selection decision rule

Three verdicts: select, keep, and insufficient-evidence. Keeping on a thin
sample would be a decision dressed as the absence of one, so it is refused.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire `engineos evals models`

**Files:**
- `src/evals/run.ts` (modified)
- `src/evals/run.test.ts` (modified)
- `evals/RUBRIC.md` (modified)
- `docs/COMPATIBILITY.md` (modified)
- `dist/engineos.cjs` (rebuilt)

**Interfaces:**

Consumes: `loadModels` from `../registry/models`; `loadRuns`, `gradeCandidate` from `./candidates`; `selectBuildModel` from `./selection`; `grader` from `./deterministic`; `resolveRoot` from `../registry/paths`.

Produces: `engineos evals models --transcripts <dir> [--out <path>]`. Exit 0 on `select` or `keep`; exit 1 on `insufficient-evidence` or a usage error. The incumbent's transcripts live in the subdirectory named by the current `tiers[build].model`; every other subdirectory is a candidate. Bare `engineos evals` is unchanged.

- [ ] **Step 1: Write the failing test.** Append to `src/evals/run.test.ts`:

```ts
import { mkdirSync as mkdir, writeFileSync as write } from 'node:fs';
import { loadModels } from '../registry/models';
import { resolveRoot } from '../registry/paths';

// The incumbent is read from the registry, never spelled here: a rebinding must
// not require editing this test, and a test that hardcoded a model id would
// assert today's binding as if it were a fact.
const INCUMBENT = loadModels(resolveRoot(process.env)).tiers.find((tier) => tier.id === 'build')?.model ?? '';

function transcripts(t: TestContext, root: string, model: string, outputs: Record<string, string>): void {
  const dir = join(root, 'transcripts', model);
  mkdir(dir, { recursive: true });
  let n = 0;
  for (const [caseId, output] of Object.entries(outputs)) {
    for (const repeat of [1, 2, 3]) {
      n += 1;
      write(join(dir, `run-${String(n)}.json`), JSON.stringify({ caseId, output, durationMs: 1000, costMicros: 10 }));
    }
  }
}

test('evals models refuses a missing --transcripts with a usage message', (t) => {
  const io = memoryIo({ env: { ENGINEOS_ROOT: evalTree(t, intents(25)) } });
  assert.equal(runEvals(['models'], io), 1);
  assert.match(io.stderr.join(''), /usage: engineos evals models --transcripts <dir>/);
});

test('evals models reports insufficient evidence when only the incumbent was recorded', (t) => {
  const root = evalTree(t, intents(25));
  transcripts(t, root, INCUMBENT, { 'intent-001': '[router] loaded=backend' });
  const io = memoryIo({ env: { ENGINEOS_ROOT: root } });
  assert.equal(runEvals(['models', '--transcripts', join(root, 'transcripts')], io), 1);
  assert.match(io.stdout.join(''), /verdict insufficient-evidence \(no-candidates\)/);
});
```

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test evals/run.test.js`. Expected failure: the first new test fails with `AssertionError: 1 !== 0` — `runEvals` ignores `argv` today and runs the default suite, exiting 0 with no usage message.

- [ ] **Step 3: Implement the arm.** In `src/evals/run.ts`, rename the existing body to `runDefault` and add the dispatcher plus the new arm:

```ts
const USAGE = 'usage: engineos evals models --transcripts <dir> [--out <path>]';

export const runEvals: Command = (argv: string[], io: Io): number =>
  argv[0] === 'models' ? runModelComparison(argv.slice(1), io) : runDefault(io);

function runDefault(io: Io): number {
  const root = resolveRoot(io.env);
  const deterministic = runDeterministicTier(root, io);
  const live = runLiveTier(root, io, deterministic.intentCount, liveDeps(io.env));
  const pass = deterministic.pass + live.pass;
  const fail = deterministic.fail + live.fail;
  io.out(`\npassed ${pass}, failed ${fail}, skipped ${live.skipped}\n`);
  return fail > 0 ? EXIT_FAILURE : EXIT_OK;
}

// One subdirectory per model under --transcripts. The incumbent's directory is
// named by the current build binding, read from the registry: hardcoding it here
// would make the comparison assert today's binding as a fact.
function runModelComparison(argv: string[], io: Io): number {
  const dir = flagValue(argv, '--transcripts');
  if (dir === null) {
    io.err(`${USAGE}\n`);
    return EXIT_FAILURE;
  }
  const root = resolveRoot(io.env);
  const models = loadModels(root);
  const incumbentModel = models.tiers.find((tier) => tier.id === models.build_selection.incumbent_tier)?.model ?? '';
  if (incumbentModel === '') {
    io.err(`evals models: ${models.build_selection.incumbent_tier} names no tier in registries/models.json\n`);
    return EXIT_FAILURE;
  }
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!names.includes(incumbentModel)) {
    io.err(`evals models: no transcripts recorded for the incumbent '${incumbentModel}' under ${dir}\n`);
    return EXIT_FAILURE;
  }
  const reports = names.map((name) => gradeCandidate(root, name, loadRuns(dir, name)));
  const incumbent = reports.find((report) => report.model === incumbentModel);
  if (incumbent === undefined) return EXIT_FAILURE;
  const outcome = selectBuildModel(incumbent, reports.filter((report) => report !== incumbent), models.build_selection);

  const g = grader(io);
  io.out('== build tier comparison ==\n');
  for (const report of reports) {
    const line = `${report.model}: routing ${report.routing.passed}/${report.routing.cases}, build ${report.build.passed}/${report.build.cases}, p50 ${render(report.p50Ms)}ms, cost ${render(report.costMicrosTotal)}micros`;
    if (report.routing.passed === report.routing.cases && report.build.passed === report.build.cases) g.ok(line);
    else g.bad(line);
  }
  for (const rejection of outcome.rejected) io.out(`rejected ${rejection.model}: ${rejection.reasons.join(' ')}\n`);
  io.out(`verdict ${outcome.verdict}${outcome.reasons.length === 0 ? '' : ` (${outcome.reasons.join(' ')})`}\n`);
  if (outcome.winner !== null) io.out(`winner ${outcome.winner}\n`);

  const out = flagValue(argv, '--out');
  if (out !== null) {
    writeFileSync(out, `${JSON.stringify({ incumbent: incumbentModel, gate: models.build_selection, reports, outcome }, null, 2)}\n`);
    io.out(`wrote ${out}\n`);
  }
  // Insufficient evidence is not a pass. A green exit on a comparison that could
  // not be made is how a rebinding gets justified by a run that proved nothing.
  return outcome.verdict === 'insufficient-evidence' ? EXIT_FAILURE : EXIT_OK;
}

function flagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  return value === undefined || value === '' ? null : value;
}

// F6: unknown renders as "unknown", never as 0.
function render(value: number | null): string {
  return value === null ? 'unknown' : String(value);
}
```

Add the imports in single statements: `import { readdirSync, writeFileSync, accessSync, constants } from 'node:fs';` (merge with the existing `node:fs` import), `import { gradeCandidate, loadRuns } from './candidates';`, `import { selectBuildModel } from './selection';`, `import { loadModels } from '../registry/models';`, and add `grader` to the existing `./deterministic` import.

- [ ] **Step 4: Run it and see it pass.** `npx tsc -p tsconfig.json && cd build && node --test evals/run.test.js`. Expected: PASS — including the two pre-existing tests, whose pinned summary lines (`passed 11, failed 0, skipped 25` and `passed 10, failed 1, skipped 1`) must be untouched.

- [ ] **Step 5: Confirm the shipped default output is byte-identical.** Run `node dist/engineos.cjs evals > /tmp/after.txt` after `npm run build`, and compare with the same command on the previous commit (`git stash && npm run build && node dist/engineos.cjs evals > /tmp/before.txt && git stash pop && npm run build`). Expected: `diff /tmp/before.txt /tmp/after.txt` reports no differences.

- [ ] **Step 6: Record the surface.** In `docs/COMPATIBILITY.md`, under the 2.0 additions table that already carries `engineos evals` and `engineos bench`, add:

```markdown
| `engineos evals models --transcripts <dir> [--out <path>]` | new argv arm of `engineos evals`; bare `engineos evals` output is unchanged. Exits 1 on `insufficient-evidence` | added |
```

and in `evals/RUBRIC.md`, add the exit-code sentence to the section added in Task 2: `The arm exits 0 on a select or a keep and 1 on insufficient evidence, because a comparison that could not be made must not read as green.`

- [ ] **Step 7: Full gate and commit.**

```bash
npm run build && npm run typecheck && npm test && node dist/engineos.cjs validate
git add src/evals/run.ts src/evals/run.test.ts evals/RUBRIC.md docs/COMPATIBILITY.md dist/engineos.cjs
git commit -m "feat(evals): add the engineos evals models comparison arm

A new argv arm rather than a new tier: the bare engineos evals output is public
surface and stays byte-identical. Insufficient evidence exits 1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Cheap-tier work types for inventory and localization

Spec section 7 assigns localization, inventory, formatting and mechanical summaries to `cheap`. `mechanical` already covers formatting and summaries; inventory and localization have no work type at all today, so a caller asking the kernel which model an audit inventory runs on gets `unknown work type`.

**Files:**
- `registries/models.json` (modified)
- `rules/models.md` (modified)
- `src/registry/models.test.ts` (modified)
- `dist/engineos.cjs` (rebuilt)

**Interfaces:**

Consumes: the existing `work_types` array shape — `{ id, title, tier }`.

Produces: two work types resolvable through the unchanged `modelSection({ workType }, regs)` signature. `engineos kernel model --work inventory` answers the cheap tier.

- [ ] **Step 1: Write the failing test.** Append to `src/registry/models.test.ts`:

```ts
test('inventory and localization resolve to the cheap tier', () => {
  const r = loadModels(root);
  for (const id of ['inventory', 'localization', 'mechanical']) {
    const work = r.work_types.find((w) => w.id === id);
    if (work === undefined) throw new Error(`work type ${id} is missing from the registry`);
    assert.equal(work.tier, 'cheap', id);
  }
});
```

- [ ] **Step 2: Run it and see it fail.** `npx tsc -p tsconfig.json && cd build && node --test registry/models.test.js`. Expected failure: `Error: work type inventory is missing from the registry`.

- [ ] **Step 3: Add the work types.** In `registries/models.json`, insert before the `mechanical` row:

```json
      { "id": "inventory",    "title": "Repository and domain inventory for scoped audits and routing fast paths", "tier": "cheap" },
      { "id": "localization", "title": "Localization and translation key sync across locale files",                "tier": "cheap" },
```

- [ ] **Step 4: Mirror it in the prose table.** In `rules/models.md`, insert a row immediately above the existing `Mechanical:` row:

```markdown
| Inventory and localization: repository/domain inventory for a scoped audit, translation key sync | **cheap** | `haiku` |
```

- [ ] **Step 5: Run it and see it pass.** `npx tsc -p tsconfig.json && cd build && node --test registry/models.test.js`. Expected: PASS.

- [ ] **Step 6: Confirm the kernel arm answers.** `npm run build && node dist/engineos.cjs kernel model --work inventory`. Expected: a JSON object with `"tier": "cheap"` and `"escalates_to": {"tier": "build", ...}`, with the model read from the registry — do not compare it against a model id written into this plan.

- [ ] **Step 7: Validate and commit.**

```bash
node dist/engineos.cjs validate
git add registries/models.json rules/models.md src/registry/models.test.ts dist/engineos.cjs
git commit -m "feat(models): assign inventory and localization to the cheap tier

Spec section 7 puts both on cheap; neither had a work type, so a caller asking
the kernel which model an audit inventory runs on got 'unknown work type'.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Adapter-specific tier bindings

Spec section 7: "the 2.0 model registry allows adapter-specific bindings. Work type selects a tier; the adapter resolves that tier to an available model."

**Files:**
- `registries/models.json` (modified)
- `rules/models.md` (modified)
- `src/registry/models.ts` (modified)
- `src/registry/models.test.ts` (modified)
- `src/kernel/model.ts` (modified)
- `src/kernel/model.test.ts` (modified)
- `src/kernel/resolve.ts` (modified)
- `src/kernel/cli.ts` (modified)
- `src/kernel/cli.test.ts` (modified)
- `src/checks/decision-registries.ts` (modified)
- `src/checks/decision-registries.test.ts` (modified)
- `docs/COMPATIBILITY.md` (modified)
- `dist/engineos.cjs` (rebuilt)

**Interfaces:**

Consumes: `ModelsRegistry`, `Registries`, `DeclaredFacts`.

Produces:

```ts
export interface ModelAdapter {
  id: string;
  bindings: Record<string, string>; // tier id -> model; an absent tier uses the tier's own model
}
// Added to ModelsRegistry: adapters: ModelAdapter[];

export interface ModelFacts {
  workType: string;
  adapter?: string;   // NEW - when absent the answer is byte-identical to today's
}
// ModelSection gains `adapter?: string`, present only when the fact was declared.
```

CLI: `engineos kernel model --work <type> [--adapter <id>]`. `DeclaredFacts` gains `adapter?: string`.

- [ ] **Step 1: Write the failing tests.** Append to `src/kernel/model.test.ts`:

```ts
test('no adapter fact answers exactly the keys the bash kernel answered', () => {
  assert.deepEqual(Object.keys(modelSection({ workType: 'build' }, regs)), ['work', 'tier', 'model', 'escalates_to']);
});

test('a declared adapter is echoed and resolves the tier through its bindings', () => {
  const section = modelSection({ workType: 'build', adapter: 'claude-code' }, regs);
  assert.equal(section.adapter, 'claude-code');
  // The reference adapter binds nothing, so every tier falls through to its own
  // model. Read from the registry: a literal here would pin today's binding.
  const bound = loadModels(root).tiers.find((tier) => tier.id === 'build')?.model;
  assert.equal(section.model, bound);
});

test('an unknown adapter is refused rather than silently defaulted', () => {
  assert.equal(
    refusal(() => modelSection({ workType: 'build', adapter: 'nonsense' }, regs)),
    'unknown adapter: nonsense (see registries/models.json adapters)',
  );
});
```

And append to `src/kernel/cli.test.ts`:

```ts
test('model --adapter echoes the adapter and keeps the legacy keys in front', () => {
  const io = memoryIo();
  assert.equal(runKernel(['model', '--work', 'build', '--adapter', 'claude-code'], io), 0);
  const answer: unknown = JSON.parse(io.stdout.join(''));
  assert.deepEqual(Object.keys(answer as Record<string, unknown>), ['work', 'tier', 'model', 'escalates_to', 'adapter']);
});

test('model refuses an unknown adapter', () => {
  assert.deepEqual(answerOf(['model', '--work', 'build', '--adapter', 'nope'], 1), {
    error: 'unknown adapter: nope (see registries/models.json adapters)',
  });
});
```

- [ ] **Step 2: Run them and see them fail.** `npx tsc -p tsconfig.json && cd build && node --test kernel/model.test.js kernel/cli.test.js`. Expected failure: TypeScript refuses first — `Object literal may only specify known properties, and 'adapter' does not exist in type 'ModelFacts'`.

- [ ] **Step 3: Add the registry block.** In `registries/models.json`, insert after `tiers`:

```json
  "adapters": [
    {
      "id": "claude-code",
      "note": "The reference adapter. An empty binding map means every tier resolves to its own model; a binding is added only when that adapter has a different model available for that tier, never to record an aspiration.",
      "bindings": {}
    }
  ],
```

- [ ] **Step 4: Load it.** In `src/registry/models.ts`, add the `ModelAdapter` interface, add `adapters: ModelAdapter[];` to `ModelsRegistry`, and add to the returned object:

```ts
    adapters: requireRows(r['adapters'], 'adapters').map((adapter, index) => ({
      id: requireString(adapter['id'], `adapters[${index}].id`),
      bindings: requireBindings(adapter['bindings'], `adapters[${index}].bindings`),
    })),
```

with:

```ts
// A binding map, not a list of pairs: the key is a tier id and the value is that
// adapter's model for it. An absent tier is not an error — it means the adapter
// has nothing better than the tier's own model, which is the common case.
function requireBindings(value: unknown, field: string): Record<string, string> {
  const record = requireRecord(value, field);
  const out: Record<string, string> = {};
  for (const [tier, model] of Object.entries(record)) out[tier] = requireString(model, `${field}.${tier}`);
  return out;
}
```

Append to `src/registry/models.test.ts`:

```ts
test('the shipped adapters load with their binding maps', () => {
  const adapters = loadModels(root).adapters;
  assert.ok(adapters.length >= 1);
  const reference = adapters.find((adapter) => adapter.id === 'claude-code');
  if (reference === undefined) throw new Error('the claude-code adapter is missing from the registry');
  const tierIds = new Set(loadModels(root).tiers.map((tier) => tier.id));
  for (const adapter of adapters) {
    for (const tier of Object.keys(adapter.bindings)) assert.ok(tierIds.has(tier), `${adapter.id} binds unknown tier ${tier}`);
  }
});
```

- [ ] **Step 5: Resolve through the adapter.** In `src/kernel/model.ts`:

```ts
export interface ModelFacts {
  workType: string;
  adapter?: string;
}

export interface ModelSection {
  work: string;
  tier: string;
  model: string;
  escalates_to: ModelEscalation | null;
  // Present only when an adapter fact was declared. The bash kernel's four keys
  // stay in front and unchanged, which is what parity.test.ts replays.
  adapter?: string;
}

export function modelSection(facts: ModelFacts, regs: Registries): ModelSection {
  const models = regs.models;
  const work = models.work_types.find((w) => w.id === facts.workType);
  if (work === undefined) {
    throw new KernelError(`unknown work type: ${facts.workType} (see registries/models.json work_types)`);
  }
  const bindings = bindingsFor(models, facts.adapter);
  const tier = tierById(models.tiers, work.tier, `work type ${work.id}`);
  const next =
    tier.escalates_to === null ? null : tierById(models.tiers, tier.escalates_to, `tier ${tier.id}`);
  const section: ModelSection = {
    work: work.id,
    tier: tier.id,
    model: bindings[tier.id] ?? tier.model,
    escalates_to: next === null ? null : { tier: next.id, model: bindings[next.id] ?? next.model },
  };
  if (facts.adapter !== undefined) section.adapter = facts.adapter;
  return section;
}

// An unknown adapter is a refusal, not a fallback: an adapter id the caller made
// up would otherwise silently answer the default binding, and the caller would
// read that as "this adapter runs build work on that model".
function bindingsFor(models: ModelsRegistry, adapter: string | undefined): Record<string, string> {
  if (adapter === undefined) return {};
  const row = models.adapters.find((candidate) => candidate.id === adapter);
  if (row === undefined) throw new KernelError(`unknown adapter: ${adapter} (see registries/models.json adapters)`);
  return row.bindings;
}
```

Import `ModelsRegistry` by adding it to the existing `import type { ModelTier } from '../registry/models';` line, making it `import type { ModelsRegistry, ModelTier } from '../registry/models';`.

- [ ] **Step 6: Carry the fact.** In `src/kernel/resolve.ts`, add `adapter?: string;` to `DeclaredFacts` directly below `workType`, and change the `workType` branch to:

```ts
  if (facts.workType !== undefined) {
    answer.model = modelSection(
      facts.adapter === undefined ? { workType: facts.workType } : { workType: facts.workType, adapter: facts.adapter },
      ctx.registries,
    );
  }
```

The conditional is required by `exactOptionalPropertyTypes`: passing `adapter: undefined` is not the same type as omitting the key.

In `src/kernel/cli.ts`, change `modelProjection`:

```ts
function modelProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('model', args, ['--work', '--adapter']);
  const work = flags.get('--work');
  if (work === undefined || work === '') throw new KernelError('model requires --work <type>');
  const adapter = flags.get('--adapter');
  if (adapter === '') throw new KernelError('model requires --adapter <id> to name an adapter');
  const section = resolve(adapter === undefined ? { workType: work } : { workType: work, adapter }, ctx).model;
  if (section === undefined) throw new KernelError('model: the kernel answered no model section');
  return section;
}
```

- [ ] **Step 7: Add the prose mirror and its check.** In `rules/models.md`, add after the "How the model gets set" section:

```markdown
## Adapter bindings

A tier is a contract; which concrete model satisfies it can differ per host
adapter. `registries/models.json` `adapters` lists each adapter and the tiers it
binds differently; a tier the adapter does not list resolves to the tier's own
model. Ask for the adapter's answer with
`engineos kernel model --work <type> --adapter <id>`. An adapter id the registry
does not carry is refused, never defaulted — a made-up id answering the default
binding would read as a statement about that adapter.

| Adapter | Tiers it rebinds |
|---|---|
| `claude-code` | none — every tier resolves to its own model |
```

In `src/checks/decision-registries.ts`, add to the array `modelsResults` returns:

```ts
    result('C16', 'every models.json adapter id appears in rules/models.md', adapterIds(models, prose)),
```

and the helper beside `sharedBinding`:

```ts
// An adapter that exists only in the registry cannot be asked for by a reader
// who never learns it is there, and one that exists only in the prose refuses at
// the kernel. Both directions of that drift are the same finding.
function adapterIds(models: RawModels, prose: string): Finding[] {
  return models.adapters
    .filter((adapter) => !prose.includes(`\`${adapter.id}\``))
    .map((adapter) => finding('C16', 'adapter-missing-from-prose', adapter.id));
}
```

Add `adapters` to `RawModels` in `src/checks/decision-registries-data.ts` and to `readModels`:

```ts
    adapters: rows(raw['adapters']).map((adapter) => ({ id: text(adapter['id']) })),
```

with `readonly adapters: readonly { readonly id: string }[];` on the interface. Add `'adapter-missing-from-prose'` to the `C16_FINDINGS` list in the same family, and append to `src/checks/decision-registries.test.ts`:

```ts
test('an adapter id absent from rules/models.md is caught', (t) => {
  const findings = findingsAfter(t, (root) => {
    editJson(root, 'registries/models.json', (doc) => {
      const record = doc as { adapters: { id: string; bindings: Record<string, string> }[] };
      record.adapters.push({ id: 'undocumented-adapter', bindings: {} });
      return doc;
    });
  });
  assert.ok(hasFinding(findings, 'adapter-missing-from-prose', 'undocumented-adapter'));
});
```

Match the surrounding tests' helper names in that file when wiring `findingsAfter` / `editJson` / `hasFinding`.

- [ ] **Step 8: Run them and see them pass.** `npx tsc -p tsconfig.json && cd build && node --test kernel/model.test.js kernel/cli.test.js kernel/parity.test.js registry/models.test.js checks/decision-registries.test.js`. Expected: PASS, with `parity.test.js` green — `model --work build` still answers four keys in the recorded order.

- [ ] **Step 9: Record the surface, validate and commit.** In `docs/COMPATIBILITY.md`, in the paragraph listing the kernel fact vocabulary, add `adapter` to the fact key list, and add a sentence: `The model arm's --adapter flag and the answer's adapter key are both MINOR additions: the answer is byte-identical when the flag is absent.`

```bash
npm run build && npm run typecheck && npm test && node dist/engineos.cjs validate
git add registries/models.json rules/models.md src/registry/models.ts src/registry/models.test.ts src/kernel/model.ts src/kernel/model.test.ts src/kernel/resolve.ts src/kernel/cli.ts src/kernel/cli.test.ts src/checks/decision-registries.ts src/checks/decision-registries-data.ts src/checks/decision-registries.test.ts docs/COMPATIBILITY.md dist/engineos.cjs
git commit -m "feat(models): allow adapter-specific tier bindings

A tier is the contract; which model satisfies it can differ per adapter. The
answer is byte-identical when no adapter is declared, so the bash-parity suite
stays green. An unknown adapter is refused, never defaulted.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Run the evaluation and record the result

**This task produces the fact the next task depends on. Its outcome is not knowable in advance and this plan does not state one.** No source file changes here.

**Files:**
- `evals/results/build-tier-2026-09-22.json` (created — the recorded artifact)

**Interfaces:**

Consumes: `engineos evals models --transcripts <dir> --out <path>` from Task 5; `registries/models.json` `build_selection` from Task 1; `evals/intent-routing-cases.jsonl` and `evals/build-tier-cases.jsonl`.

Produces: the JSON artifact `{ incumbent, gate, reports, outcome }` and a verdict of `select`, `keep` or `insufficient-evidence`.

- [ ] **Step 1: Name the candidates.** List the models actually available to this host adapter as build-tier candidates. Record the list in the scratchpad file `/tmp/candidates.txt`, one model id per line, and add the current incumbent as the first line:

```bash
node dist/engineos.cjs kernel model --work build | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).model))' > /tmp/candidates.txt
# Append each candidate id available on this host, one per line, then:
cat /tmp/candidates.txt
```

A candidate that the host cannot actually run is not a candidate; do not list one. If the list has exactly one line, stop and report `BLOCKED` — there is nothing to compare, and Task 9 does not run.

- [ ] **Step 2: Record the transcripts.** For every model in `/tmp/candidates.txt`, for every case in both suites, record `build_selection.sample.repeats_per_case` runs. Read the repeat count from the registry rather than typing it:

```bash
REPEATS=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("registries/models.json","utf8")).build_selection.sample.repeats_per_case)')
mkdir -p /tmp/transcripts
while read -r MODEL; do
  mkdir -p "/tmp/transcripts/$MODEL"
  n=0
  for FILE in evals/intent-routing-cases.jsonl evals/build-tier-cases.jsonl; do
    while read -r LINE; do
      [ -z "$LINE" ] && continue
      ID=$(printf '%s' "$LINE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')
      INPUT=$(printf '%s' "$LINE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).input))')
      for _ in $(seq 1 "$REPEATS"); do
        n=$((n+1))
        START=$(node -e 'console.log(Date.now())')
        OUT=$(claude -p --model "$MODEL" "$INPUT" 2>/dev/null)
        END=$(node -e 'console.log(Date.now())')
        ID="$ID" OUT="$OUT" START="$START" END="$END" node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({caseId: process.env.ID, output: process.env.OUT, durationMs: Number(process.env.END) - Number(process.env.START), costMicros: null}))' "/tmp/transcripts/$MODEL/run-$n.json"
      done
    done < "$FILE"
  done
done < /tmp/candidates.txt
```

`costMicros` is recorded as `null` unless this host reports a real per-call cost. **Do not substitute a computed estimate or a zero.** F6: unknown is `null`, and the decision rule already refuses to read an unknown as an improvement — it will fall back to the latency axis, which is measured honestly here.

- [ ] **Step 3: Run the gate.**

```bash
mkdir -p evals/results
node dist/engineos.cjs evals models --transcripts /tmp/transcripts --out evals/results/build-tier-2026-09-22.json
echo "exit=$?"
```

- [ ] **Step 4: Apply the decision rule to the output, in writing.** The rule is already implemented; this step is where the implementer states which branch fired, quoting the real output. Read the last lines of the command's stdout and classify:

  - stdout ends `verdict select` and `winner <model>`, exit 0 -> **the gate selected a new build binding.** Task 9 runs the rebinding with that model id.
  - stdout ends `verdict keep`, exit 0 -> **the incumbent won.** Task 9 runs its "keep" branch: no rebinding, and the ADR records why each candidate was rejected, quoting the `rejected <model>: <reasons>` lines.
  - stdout ends `verdict insufficient-evidence`, exit 1 -> **the gate could not be answered.** Do not rebind. Report this wave's status as `BLOCKED` on the reason slug printed in parentheses (`no-candidates` -> no candidate was available; `sample-too-small` -> go back to Step 2 and record the missing repeats). `insufficient-evidence` is the `evidence-insufficient` HITL reason of `rules/risk-autonomy.md`: it escalates to a human, it does not get retried until it looks green.

- [ ] **Step 5: Verify the artifact is re-derivable.** Re-run Step 3 against the same transcript directory and confirm the verdict line is identical. Grading is deterministic by construction; a differing verdict means a transcript file changed between runs and the artifact is not trustworthy.

- [ ] **Step 6: Commit the artifact.**

```bash
git add evals/results/build-tier-2026-09-22.json
git commit -m "test(evals): record the build-tier comparison run

The artifact the selection is derived from. Grading is deterministic, so the
verdict can be re-derived from these transcripts without spending again.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Apply the gate's answer

**Conditional on Task 8.** Run the **rebind** branch only when Task 8 printed `verdict select`. Run the **keep** branch when it printed `verdict keep`. Run neither when it printed `verdict insufficient-evidence`.

**Files (rebind branch):**
- `registries/models.json` (modified)
- `rules/models.md` (modified)
- `agents/*.md` — the sixteen files carrying `tier: build` (modified)
- `registries/agents.json` (regenerated)
- `commands/implement.md` (modified)
- `src/kernel/model.test.ts`, `src/kernel/cli.test.ts` (modified — de-hardcode)
- `dist/engineos.cjs` (rebuilt)

**Files (keep branch):** none — Task 10's ADR carries the outcome.

**Interfaces:** no signature changes. The registry value `tiers[id=build].model` changes and every consumer follows it.

- [ ] **Step 1 (keep branch only): stop here and record.** Write nothing. Go to Task 10 and write the ADR with `Status: accepted` and the decision "keep the current build binding", quoting the `rejected` lines from Task 8's artifact. The wave's deliverable is the gate plus the evidence, and a gate that declines to change something is a working gate.

- [ ] **Step 2 (rebind branch): de-hardcode the model assertions first, and watch them fail.** In `src/kernel/model.test.ts`, replace the two literal assertions in the `build` test:

```ts
test('build answers the build tier and escalates to design', () => {
  const registry = loadModels(root);
  const buildModel = registry.tiers.find((tier) => tier.id === 'build')?.model;
  const designModel = registry.tiers.find((tier) => tier.id === 'design')?.model;
  const section = modelSection({ workType: 'build' }, regs);
  assert.equal(section.tier, 'build');
  // Read from the registry: the tier is the contract and the model name is only
  // today's binding, so a test that spelled it would assert a binding as a fact.
  assert.equal(section.model, buildModel);
  assert.equal(section.escalates_to?.tier, 'design');
  assert.equal(section.escalates_to?.model, designModel);
});

test('build and design no longer share a binding, so the escalation is real', () => {
  const registry = loadModels(root);
  const build = registry.tiers.find((tier) => tier.id === 'build')?.model;
  const design = registry.tiers.find((tier) => tier.id === 'design')?.model;
  assert.notEqual(build, design);
});
```

and in `src/kernel/cli.test.ts`, replace the literal `model: 'opus'` object in the "model answers the section in the legacy key order" test with one built from `loadModels(resolveRoot(process.env))`:

```ts
test('model answers the section in the legacy key order', () => {
  const registry = loadModels(resolveRoot(process.env));
  const build = registry.tiers.find((tier) => tier.id === 'build')?.model ?? '';
  const design = registry.tiers.find((tier) => tier.id === 'design')?.model ?? '';
  const io = memoryIo();
  assert.equal(runKernel(['model', '--work', 'build'], io), 0);
  assert.equal(
    io.stdout.join(''),
    JSON.stringify({ work: 'build', tier: 'build', model: build, escalates_to: { tier: 'design', model: design } }, null, 2),
  );
});
```

Run `npx tsc -p tsconfig.json && cd build && node --test kernel/model.test.js kernel/cli.test.js`. Expected failure: the new "no longer share a binding" test fails with `AssertionError: Expected "actual" to be strictly unequal to: '<the current shared model>'`. That is the red this task exists to turn green.

- [ ] **Step 3: Move the registry and every prose mirror in one edit.** Using the winner id printed by Task 8 — call it `$WINNER` and read it from the artifact rather than retyping it:

```bash
WINNER=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("evals/results/build-tier-2026-09-22.json","utf8")).outcome.winner)')
test -n "$WINNER" && test "$WINNER" != "null" || { echo "no winner recorded — this branch does not apply"; exit 1; }
echo "$WINNER"
```

Then edit, in one commit:

1. `registries/models.json`: `{ "id": "build", "model": "<WINNER>", "escalates_to": "design" }`.
2. `rules/models.md`, the two `**build**` table rows: replace the model cell with `` `<WINNER>` ``.
3. `rules/models.md` line 30 (`they're built on the same \`opus\` tier as the rest of the code`): rewrite to name the build tier rather than a model — `they're built on the same **build** tier as the rest of the code`.
4. `rules/models.md` line 33-39, the shared-binding paragraph: **delete it** and replace with:

```markdown
The **build** and **design** tiers now bind to different models, selected by the
gate below. Escalating build -> design is a real escalation again: it moves the
work to a stronger model, not to the same one under another name. State the tier
you meant; the escalation ladder does the rest.
```

Removing the literal `bound to the same model` is required in the same edit: `C16`'s `shared-binding` assertion only demands that phrase while two tiers share a model, and leaving a false statement in the prose is its own defect.

5. `commands/implement.md` line 45 (`\`opus\` for code and for units that still carry design risk`): rewrite as `` the **build** tier for code, the **design** tier for units that still carry design risk, `haiku` for mechanical units ``. Naming tiers instead of models is what stops the next rebinding from having to find this line.

- [ ] **Step 4: Move every build-tier agent with it.** `C31` compares each agent's `model:` against its `tier:`'s registry binding:

```bash
WINNER=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("registries/models.json","utf8")).tiers.find(t=>t.id==="build").model)')
for f in agents/*.md; do
  grep -q '^tier: build$' "$f" || continue
  node -e 'const fs=require("node:fs");const [p,m]=process.argv.slice(1);const t=fs.readFileSync(p,"utf8");fs.writeFileSync(p,t.replace(/^model: .*$/m,"model: "+m))' "$f" "$WINNER"
done
git diff --stat -- agents/
node dist/engineos.cjs gen agent-registry
```

Expected: sixteen agent files changed (one line each), plus `registries/agents.json` regenerated. `agents/router.md`, `agents/critic.md`, `agents/security-reviewer.md`, `agents/architecture-analyst.md` and `agents/audit-consolidator.md` are `tier: design` and must be untouched — architecture, adversarial and security review stay on the design tier whatever the gate said. Confirm with `git diff --name-only -- agents/ | wc -l` reporting 16.

- [ ] **Step 5: Run the full suite and the validator.**

```bash
npm run build && npm run typecheck && npm test && node dist/engineos.cjs validate
```

Expected: PASS everywhere, including the new "no longer share a binding" test, `C16` (`model-missing-from-prose` now finds the winner's backticked literal in `rules/models.md`; the `code-review` row names the new build model), `C31` (no `tier-model-mismatch`), and the agent-registry drift guard. A `shared-binding-undocumented` finding here means two tiers still share a model and step 3's paragraph edit was premature — restore the phrase or fix the registry.

- [ ] **Step 6: Commit.**

```bash
git add registries/models.json rules/models.md agents registries/agents.json commands/implement.md src/kernel/model.test.ts src/kernel/cli.test.ts dist/engineos.cjs
git commit -m "feat(models): rebind the build tier to the evaluated winner

Selected by the gate in registries/models.json build_selection against the
recorded run in evals/results/. Design, adversarial and security review stay on
the design tier. Registry, prose, the sixteen build-tier agents and the generated
agent registry move together because C16 and C31 fail on any one of them alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Lifecycle acceptance against the Wave 1 baseline, and the ADR

**Files:**
- `docs/adr/2026-09-22-build-tier-binding.md` (created)

**Interfaces:**

Consumes: `docs/perf/baselines/<host-id>.json` — the `LifecycleReport` Wave 1 records (F6: `host: HostMetadata`, `scenarios: ScenarioResult[]` with `p50Ms`, `p95Ms`); `engineos bench lifecycle` (F7); `registries/models.json` `build_selection.max_lifecycle_regression_pct`; `evals/results/build-tier-2026-09-22.json`.

Produces: an accepted ADR recording the decision, the evidence, the rejected alternative and the residual risk.

- [ ] **Step 1: Find this host's baseline. Do not invent one.**

```bash
ls docs/perf/baselines/
node -e '
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const dir="docs/perf/baselines";
if(!fs.existsSync(dir)){console.log("BLOCKED: Wave 1 has not recorded any baseline");process.exit(1)}
const here={platform:os.platform(),cpuModel:os.cpus()[0].model,cpuCount:os.cpus().length,nodeVersion:process.version};
const hit=fs.readdirSync(dir).filter(f=>f.endsWith(".json")).map(f=>[f,JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"))])
  .find(([,r])=>r.host&&r.host.platform===here.platform&&r.host.cpuModel===here.cpuModel&&r.host.cpuCount===here.cpuCount);
console.log(hit?"baseline: "+path.join(dir,hit[0]):"BLOCKED: no baseline recorded on this host ("+JSON.stringify(here)+")");
'
```

If this prints `BLOCKED`, stop and report the wave as `BLOCKED` on Wave 1. **Do not run `bench baseline --write` here** — a baseline recorded after the rebinding measures the new binding against itself and answers nothing.

- [ ] **Step 2: Measure after the change.**

```bash
node dist/engineos.cjs bench lifecycle > /tmp/lifecycle-after.json
head -40 /tmp/lifecycle-after.json
```

- [ ] **Step 3: Compare every scenario the baseline carries.** Iterate whatever scenarios the baseline file actually contains — the scenario names belong to Wave 1, not to this plan:

```bash
BASELINE=<the path printed in Step 1> node -e '
const fs=require("node:fs");
const before=JSON.parse(fs.readFileSync(process.env.BASELINE,"utf8"));
const after=JSON.parse(fs.readFileSync("/tmp/lifecycle-after.json","utf8"));
const cap=JSON.parse(fs.readFileSync("registries/models.json","utf8")).build_selection.max_lifecycle_regression_pct;
let failed=false;
for(const b of before.scenarios){
  const a=after.scenarios.find(s=>s.scenario===b.scenario);
  if(!a){console.log("MISSING "+b.scenario+" in the new report");failed=true;continue}
  for(const key of ["p50Ms","p95Ms"]){
    const pct=((a[key]-b[key])/b[key])*100;
    const verdict=pct>cap?"FAIL":"ok";
    if(pct>cap)failed=true;
    console.log(verdict+"   "+b.scenario+"."+key+": "+b[key]+" -> "+a[key]+" ("+pct.toFixed(1)+"%, cap "+cap+"%)");
  }
}
process.exit(failed?1:0);
'
echo "exit=$?"
```

Expected: every line `ok`, exit 0. A `FAIL` line means the rebinding regressed a lifecycle scenario past the registry ceiling — revert Task 9's commit and report the wave `FAILED` with that line quoted. Do not raise `max_lifecycle_regression_pct` to make it pass; that is the gate-by-lowering-the-bar `rules/gates.md` forbids.

- [ ] **Step 4: Write the ADR.** Create `docs/adr/2026-09-22-build-tier-binding.md`. Fill every bracketed slot from the artifacts just read — the numbers come from `evals/results/build-tier-2026-09-22.json` and from Step 3's output, never from this plan:

```markdown
# Bind the build tier by evaluation, not by prose

Date: 2026-09-22
Status: accepted

## Context

`registries/models.json` bound `build` and `design` to the same model. Two
consequences followed. Routine implementation — writing code against an existing
spec — paid design-tier latency and cost for reasoning it did not use. And the
escalation `rules/models.md` prescribes when a build-tier task fails twice
resolved to the same model, so "escalate one tier" moved nothing; the rule file
had to document its own no-op in a paragraph.

`registries/agents.json` and sixteen `agents/*.md` files bind their frontmatter
model to their tier, and `C31` fails when the two disagree, so the binding is not
a single value — it is a value plus its sixteen mirrors plus two prose tables.

## Options considered

1. **Select a distinct build binding through a measured gate** — chosen.
   - The gate lives in `registries/models.json` `build_selection`: routing pass
     rate 100%, build pass rate 90%, zero regressions against the incumbent,
     minimum sample, and at least a 25% improvement on p50 latency or total cost.
   - Thresholds were fixed before any candidate was measured (commit of Task 1
     precedes the evaluation of Task 8), so they could not be chosen to fit a
     result.
   - Cost: a new eval suite, a transcript-recording step, and a rebinding that
     touches twenty-one files at once.
2. **Pick a faster model for build by reputation** — rejected. `rules/llm-apps.md`
   forbids shipping a model or prompt change because one manual test looked good,
   and the spec states plainly that no concrete model is promoted to build by
   prose alone.
3. **Leave build and design sharing one binding** — rejected as the status quo the
   audit named: it makes one rung of the escalation ladder decorative and charges
   design-tier latency for every ordinary implementation unit.
4. **Move adversarial, security and architecture review to the cheaper binding
   too** — rejected outright. Those are the tasks where a weaker model's confident
   wrong answer is most expensive, and the gate's `protected_tiers` encodes the
   refusal so a future run cannot quietly include them.

## Decision

[State the verdict Task 8 printed: either "The build tier rebinds to <model>" or
"The build tier keeps its current binding". Quote the `verdict` line from
`evals/results/build-tier-2026-09-22.json`.]

Evidence, from `evals/results/build-tier-2026-09-22.json`:

| Model | Routing | Build | p50 ms | Cost (micros) | Outcome |
|---|---|---|---|---|---|
| [incumbent id] | [passed/cases] | [passed/cases] | [p50Ms] | [costMicrosTotal or "unknown"] | incumbent |
| [each candidate id] | [passed/cases] | [passed/cases] | [p50Ms] | [costMicrosTotal or "unknown"] | [selected / rejected: reasons] |

Lifecycle acceptance against `[the baseline path from Step 1]`, per scenario:

| Scenario | Baseline p50 / p95 | After p50 / p95 | Change | Cap |
|---|---|---|---|---|
| [one row per scenario in the baseline, from Step 3's output] | | | | 10% |

`design` and `most-capable` are unchanged. Architecture, hard debugging,
adversarial review and security review keep the design binding.

## Consequences

- The `build -> design` escalation is a real escalation again [or: remains a
  no-op, and `rules/models.md` continues to say so — state which].
- The binding is now falsifiable: re-running `engineos evals models` against new
  transcripts re-derives the verdict, and a future candidate is argued with
  numbers against the same gate.
- Residual risk: the build case set is twelve cases over this repository's own
  conventions. It does not cover every stack the rules describe, so a candidate
  could pass it and still be weaker on work the set does not sample. Widening the
  set is the first response to a build-quality complaint after this lands.
- Residual risk: cost was recorded as [real / unknown]. [When unknown: the cost
  axis of the gate could not be evaluated and the decision rests on latency
  alone; a host that reports real per-call cost should re-run the gate.]

## Revisit when

- A new model becomes available on the build or design tier.
- The build case set grows past twenty cases (the sample the current verdict rests on changes).
- A lifecycle scenario regresses past `build_selection.max_lifecycle_regression_pct` in a later Wave 1 baseline run.
```

- [ ] **Step 5: Commit.**

```bash
git add docs/adr/2026-09-22-build-tier-binding.md
git commit -m "docs(adr): record the build-tier binding decision

Numbers from evals/results/build-tier-2026-09-22.json and the Wave 1 lifecycle
baseline on this host. Rejected alternatives included, per rules/gates.md.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Write the wave barrier handoff.** Using `templates/handoff.md`, record: the gate's verdict and where the artifact lives; whether the rebinding was applied; the lifecycle comparison table; that `adapters` ships with one entry and no rebindings, so a second adapter's bindings are Wave 7's or a later change's work; and that `engineos kernel model --work inventory` now answers, but the `/engineos:audit` call site that should ask for it belongs to Wave 4.

---

## Barrier exit criteria (Wave 6)

- [ ] Every task above checked off, each with its own commit.
- [ ] `npm run build && npm run typecheck && npm test` green, output shown.
- [ ] `node dist/engineos.cjs validate` green — `C16` and `C31` agree with the registry.
- [ ] `node dist/engineos.cjs evals` output byte-identical to before this wave.
- [ ] `dist/engineos.cjs` rebuilt and committed.
- [ ] `docs/COMPATIBILITY.md` carries the `evals models` arm and the `model --adapter` flag.
- [ ] `evals/results/build-tier-2026-09-22.json` committed, and the ADR's numbers match it.
- [ ] A handoff written per `templates/handoff.md`.

## Self-review against the wave scope

| Wave 6 deliverable | Task |
|---|---|
| Deterministic eval extension comparing candidate build-tier models on this repo's routing and implementation cases | 2, 3 |
| Bounded live comparison, reusing `src/evals/` machinery | 3 (grading reuses `routerLine` and the `deterministic.ts` JSONL helpers), 5 (arm), 8 (the bounded run: `repeats_per_case` from the registry) |
| Explicit selection procedure with a pass/fail gate, no pre-chosen model | 1 (thresholds), 4 (rule), 8 (procedure and decision), 10 (recorded artifact) |
| Architecture, security and adversarial review stay on design | 1 (`protected_tiers`), 9 Step 4 (the five design-tier agents are untouched) |
| Rebinding `registries/models.json` and `rules/models.md` together | 9 Step 3 |
| Loader and kernel changes the rebinding needs | 1 (loader), 7 (adapter resolution), 9 Step 2 (de-hardcoded tests) |
| Cheap-tier assignment for inventory, localization, summaries, mechanical | 6 |
| Acceptance measured against the Wave 1 baseline, read not invented | 10 Steps 1-3 |
| ADR with the rejected alternative | 10 Step 4 |
