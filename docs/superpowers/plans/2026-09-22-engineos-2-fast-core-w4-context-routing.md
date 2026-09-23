# EngineOS 2.0 Fast Core — Wave 4: context and routing fast paths

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the Codex always-on corpus from a measured **60,515 bytes** to a generated compact entry point under the same **32,000-byte** budget `engineos bench` already asserts for Claude, and remove the two deterministic-work-done-twice paths in `/engineos:route` and `/engineos:audit` — the router agent re-resolving a kernel answer the command already holds, and seven design-tier agents launched against a wave cap of six regardless of what the repository contains.

**Architecture:** `AGENTS.md` stops being a hand-synced copy of `CLAUDE.md` and becomes a build artifact of `engineos gen adapter-context`, generated from `registries/policy.json` `.context` and `.execution` (Wave 2's F2 block), `.gates`, and the `commands/` directory. Three safety-invariant rules stay eagerly imported; every other rule arrives through the deterministic task contract, which Codex obtains with one `resolve` call. `/engineos:route` renders the kernel answer directly when nothing is escalated and passes that answer into the router agent when something is. `/engineos:audit` asks the kernel which domains the repository actually carries — a new `inventory` fact on the existing `resolve` arm, resolved through `routeByPath` — and dispatches only those, capped at `parallelism.wave_concurrency_cap`.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), esbuild to a committed CJS bundle, JSON registries, bash hook shims, Node built-in test runner (`node --test`), node >= 18.

**Spec:** [docs/specs/2026-09-22-engineos-2-fast-core-design.md](../../specs/2026-09-22-engineos-2-fast-core-design.md) — sections "4. Adapter-specific compact context" and "6. Deterministic route and audit fast paths".

**Program plan:** [2026-09-22-engineos-2-fast-core-00-program.md](./2026-09-22-engineos-2-fast-core-00-program.md). F1, F2, F5 and F7 are frozen contracts consumed verbatim here.

**Depends on:** Wave 2 (`registries/policy.json` `.execution`, `src/kernel/execution.ts`, the `execution` fact on `resolve`). Wave 4 reads that block; it never redefines it.

---

## Global Constraints

Every task's requirements implicitly include this section. A Wave 4 implementer trips on all of these.

- **No `any`.** Unknown input is `unknown`, narrowed immediately. No `as` to silence an error. `tsconfig.json` is `strict` with `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`.
- **One `import` statement per module.** Never split symbols from the same source across two lines.
- **Explicit return types on every exported function.** `Number.parseInt` / `Number.parseFloat`, never the globals.
- **`rootDir: src`, `outDir: build`.** The compiled test path drops the `src/` prefix: `src/gen/adapter-context.test.ts` runs as `build/gen/adapter-context.test.js`.
- **Every generated file gets a mirror check.** `AGENTS.md` becomes generated in Task 4; Task 5 lands its drift guard in CI and in the validator. A generated artifact with no drift guard is the defect this rule exists to prevent — it is why `registries/agents.json` and `commands/agents/` each carry one.
- **Rebuild `dist/engineos.cjs`.** It is a committed build artifact and CI's first step diffs it. Any task that changes `src/` ends with `npm run build` and commits `dist/engineos.cjs` in the same commit.
- **Registry and prose move together.** `node dist/engineos.cjs validate` fails a registry change without its prose mirror and vice versa. Every task that touches `registries/policy.json` also touches the prose that mirrors it, in the same commit.
- **English only. No emojis** anywhere — code, comments, commit messages, generated output. Comments say WHY, never WHAT.
- **No placeholders, stubs or fake data** on any reachable path.
- **Conventional Commits.** PRs at most 400 lines changed. Task 4 replaces the whole of `AGENTS.md`; that file is codegen from Task 4 onward and is called out in the PR description and excluded from the count under the `rules/git.md` hard-cases carve-out. Every other task's hand-written diff stays well under 400 lines.
- **Kernel refusal style.** An impossible or contradictory fact combination throws `KernelError` with a sentence naming both facts. Never fabricate a default for a missing fact.
- **Tests ARE in scope for this wave** (program plan, Global Constraints).
- **Wave 5 owns `SessionMetadata` (F5).** Task 9 consumes it at the protocol boundary — as facts a command supplies — and never imports or re-declares the interface.
- **Public surface.** Any command, kernel fact, answer key or budget name added here lands in `docs/COMPATIBILITY.md` in the same task that introduces it.

---

## File Structure

| File | Created / Modified | Single responsibility |
|---|---|---|
| `src/bench/measure.ts` | Modified (T1, T5) | `contextEntryBytes(root, entry)` — the always-on byte sum for any adapter entry point; `alwaysOnBytes` becomes its `CLAUDE.md` binding |
| `src/bench/measure.test.ts` | Modified (T1) | Unit coverage for `contextEntryBytes` over a temp tree and the real checkout |
| `src/bench/run.ts` | Modified (T5) | Adds the sixth budget row, `codex context`, against `policy.context.max_bytes` |
| `src/bench/run.test.ts` | Modified (T5) | Asserts the six budget lines and their order |
| `registries/policy.json` | Modified (T2, T7) | `.context` (adapter entry points, always-on sets, enforcement matrix, invariant headings, byte ceiling) and `.audit` (inventory caps, auditable domain set) |
| `src/registry/policy.ts` | Modified (T2, T7) | Strict loader for `.context` and `.audit`; a malformed block is a `KernelError`, never a default |
| `src/registry/policy.test.ts` | Modified (T2, T7) | Loader coverage for both new blocks |
| `rules/context.md` | Modified (T2) | `## Adapter context budgets` — the prose home the byte ceiling mirrors into |
| `src/checks/adapter-context.ts` | Created (T2, T5) | Check C38: the generated Codex entry point is in sync, carries every required invariant, and fits the budget |
| `src/checks/adapter-context.test.ts` | Created (T2, T5) | C38 coverage — one negative case per finding code |
| `src/checks/ids.ts` | Modified (T2) | Registers `C38` |
| `src/checks/index.ts` | Modified (T2) | Registers `ADAPTER_CONTEXT_CHECKS` |
| `src/checks/mirrors.ts` | Modified (T2) | Two C38 mirror rows: the byte ceiling and the Codex enforcement vocabulary |
| `src/gen/adapter-context.ts` | Created (T3) | Builds the compact adapter entry point text from the registries; writes it |
| `src/gen/adapter-context.test.ts` | Created (T3) | Generator coverage — determinism, invariant headings, registry-derived tables |
| `src/gen/cli.ts` | Modified (T3) | Registers the `adapter-context` gen target |
| `AGENTS.md` | Modified (T4) | Generated compact Codex entry point — no longer hand-maintained |
| `templates/adapters/codex.md` | Modified (T4) | Documents that the entry point is generated; retires the "rejected: generate it by script" paragraph |
| `.github/workflows/ci.yml` | Modified (T5) | Adapter-context drift guard |
| `CLAUDE.md`, `README.md`, `docs/CODEBASE_MAP.md` | Modified (T2) | Check-count claims 68 -> 69 (C37 enforces them) |
| `commands/route.md` | Modified (T6, T9) | Fast path: render the kernel answer directly; dispatch only the residue, carrying the answer |
| `agents/router.md` | Modified (T6) | Accepts a pre-resolved kernel answer and is forbidden from resolving it again |
| `src/kernel/inventory.ts` | Created (T7) | `inventorySection` — which routing domains a path list actually carries, capped at the wave cap |
| `src/kernel/inventory.test.ts` | Created (T7) | Inventory coverage — counts, ordering, cap, truncation, refusals |
| `src/kernel/resolve.ts` | Modified (T7) | Wires the `inventory` fact to the `inventory` answer key |
| `src/kernel/cli.ts` | Modified (T7) | Parses the `inventory` fact |
| `src/kernel/resolve.test.ts` | Modified (T7) | Sparse-facts coverage for the new key |
| `commands/audit.md` | Modified (T8, T9) | Inventory pass, scoped dispatch, `--exhaustive` opt-in |
| `docs/COMPATIBILITY.md` | Modified (T3, T5, T7, T9) | Every added command, fact, answer key and budget name |

---

## Measured starting point

Measured on this checkout with the same algorithm `src/bench/measure.ts` `alwaysOnBytes` uses (entry file size plus the size of every `@rules/...` import it names):

```
CLAUDE.md TOTAL 28019      (budget 32000 — ok)
AGENTS.md TOTAL 60515      (no budget today — 1.89x the Claude budget)
```

`AGENTS.md` is 17,778 bytes of prose plus **eleven** eager rule imports totalling 42,737 bytes: `base` 2556, `security` 3008, `git` 1541, `parallelism` 7829, `models` 5205, `memory` 2443, `subagents` 3836, `verification` 2710, `risk-autonomy` 5842, `context` 2859, `gates` 4908.

After this wave the Codex entry point keeps three eager imports — `base` 2556, `security` 3008, `git` 1541, totalling 7105 bytes — plus a generated body the plan targets at 6,000 bytes or less. Task 5 records the measured post-generation number in the commit message; the budget assertion, not the estimate, is what CI holds.

---

### Task 1: Generalize the always-on byte measurement to any adapter entry point

`alwaysOnBytes` hardcodes `CLAUDE.md`. The Codex budget needs the same arithmetic over `AGENTS.md`. Nothing else changes: `engineos bench` keeps its five budget names and their order until Task 5.

**Files:**
- `src/bench/measure.ts` (modified)
- `src/bench/measure.test.ts` (modified)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export function contextEntryBytes(root: string, entry: string): number` — `entry` is a repo-relative path such as `'CLAUDE.md'` or `'AGENTS.md'`. `export function alwaysOnBytes(root: string): number` keeps its signature and becomes `contextEntryBytes(root, 'CLAUDE.md')`.

- [ ] **Step 1: Write the failing test for `contextEntryBytes` over a temp tree.**

  Append to `src/bench/measure.test.ts`:

  ```ts
  test('contextEntryBytes sums the entry file and every @rules import it names', (t: TestContext) => {
    const root = tempRoot(t);
    mkdirSync(join(root, 'rules'), { recursive: true });
    writeFileSync(join(root, 'rules', 'one.md'), 'a'.repeat(10));
    writeFileSync(join(root, 'rules', 'two.md'), 'b'.repeat(20));
    // A non-import line and an import of a file that is not under rules/ are both
    // ignored, which is what makes the sum an ALWAYS-ON total rather than a
    // count of every path the document mentions.
    const entry = '@rules/one.md\nprose\n@rules/two.md\n@docs/three.md\n';
    writeFileSync(join(root, 'AGENTS.md'), entry);
    assert.equal(contextEntryBytes(root, 'AGENTS.md'), entry.length + 10 + 20);
  });

  test('alwaysOnBytes is contextEntryBytes bound to CLAUDE.md', () => {
    assert.equal(alwaysOnBytes(checkout), contextEntryBytes(checkout, 'CLAUDE.md'));
  });
  ```

  The file already imports `test`, `assert` and `join`; add `type TestContext` to the existing `node:test` import, `mkdirSync, writeFileSync` to the existing `node:fs` import, `tempRoot` from `'../testing/harness'`, `resolveRoot` from `'../registry/paths'`, and `contextEntryBytes` to the existing `'./measure'` import. Declare the checkout once near the top of the file:

  ```ts
  const checkout = resolveRoot(process.env, __dirname);
  ```

- [ ] **Step 2: Run it and see it fail.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test bench/measure.test.js
  ```

  Expected failure: `tsc` exits non-zero with `error TS2305: Module '"./measure"' has no exported member 'contextEntryBytes'.` The suite does not run.

- [ ] **Step 3: Implement `contextEntryBytes`.**

  In `src/bench/measure.ts`, replace the whole `alwaysOnBytes` function with:

  ```ts
  // Generalized over the entry point because 2.0 has two of them: CLAUDE.md and
  // the generated AGENTS.md. The '@' is the import marker, the rest is a path
  // relative to the root — a line naming anything but rules/ is prose, not an
  // eager load, and must not enter an always-on total.
  export function contextEntryBytes(root: string, entry: string): number {
    const file = join(root, entry);
    let total = statSync(file).size;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.startsWith('@rules/')) continue;
      total += statSync(join(root, line.slice(1))).size;
    }
    return total;
  }

  export function alwaysOnBytes(root: string): number {
    return contextEntryBytes(root, 'CLAUDE.md');
  }
  ```

- [ ] **Step 4: Run the test and see it pass.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test bench/measure.test.js
  ```

  Expected: PASS — every existing `measure.test.ts` test plus the two new ones, `fail 0`.

- [ ] **Step 5: Rebuild the bundle and commit.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && npm run build
  git add src/bench/measure.ts src/bench/measure.test.ts dist/engineos.cjs
  git commit -m "refactor(bench): measure always-on bytes for any adapter entry point

Codex needs the same arithmetic over AGENTS.md that alwaysOnBytes applies to
CLAUDE.md. No budget name, order or value changes here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 2: Registry block, prose home, and check C38

The generator needs a source of truth. `registries/policy.json` gains `.context`: which adapters have an entry point, what each one loads eagerly, the enforcement matrix for the adapter, the invariant headings the generated document must carry, and the byte ceiling. Registering `C38` moves the validator from 68 checks to 69, which C37 enforces against four documents.

**Files:**
- `registries/policy.json` (modified)
- `src/registry/policy.ts` (modified)
- `src/registry/policy.test.ts` (modified)
- `rules/context.md` (modified)
- `src/checks/adapter-context.ts` (created)
- `src/checks/adapter-context.test.ts` (created)
- `src/checks/ids.ts` (modified)
- `src/checks/index.ts` (modified)
- `src/checks/mirrors.ts` (modified)
- `CLAUDE.md`, `README.md`, `docs/CODEBASE_MAP.md` (modified)

**Interfaces:**
- Consumes: `strictReader` from `src/registry/strict.ts`; `runMirrors` / `rowsOf` from `src/checks/mirror.ts` / `src/checks/mirrors.ts`; `finding` / `result` / `skipOnce` from the check harness.
- Produces:
  ```ts
  export interface ContextInvariant { id: string; heading: string }
  export interface ContextEnforcement { capability: string; state: string }
  export interface ContextAdapter {
    id: string;
    entry: string;
    generated: boolean;
    always_on: string[];
    invariants: ContextInvariant[];
    enforcement: ContextEnforcement[];
  }
  export interface ContextPolicy { max_bytes: number; adapters: ContextAdapter[] }
  ```
  added to `PolicyRegistry` as `context: ContextPolicy`. Plus check id `'C38'` and `export const ADAPTER_CONTEXT_CHECKS: readonly Check[]`.

- [ ] **Step 1: Write the failing loader test.**

  Append to `src/registry/policy.test.ts`:

  ```ts
  test('the context block loads every adapter with its always-on set and invariants', () => {
    const policy = loadPolicy(checkout);
    assert.equal(policy.context.max_bytes, 32000);
    const codex = policy.context.adapters.find((row) => row.id === 'codex');
    assert.ok(codex !== undefined, 'the codex adapter must be declared');
    assert.equal(codex.entry, 'AGENTS.md');
    assert.equal(codex.generated, true);
    assert.deepEqual(codex.always_on, ['rules/base.md', 'rules/security.md', 'rules/git.md']);
    assert.deepEqual(codex.invariants.map((row) => row.id), [
      'safety-invariants',
      'task-contract',
      'enforcement',
      'execution-lane',
      'gates',
      'commands',
      'human-docs',
    ]);
  });

  test('a context adapter missing always_on is a KernelError, never an empty default', (t: TestContext) => {
    const root = relocatedRoot(tempRoot(t), {
      mutate: (policy) => {
        const context = policy['context'];
        if (!isRecord(context)) throw new Error('fixture: .context must be an object');
        const adapters = context['adapters'];
        if (!Array.isArray(adapters)) throw new Error('fixture: .context.adapters must be an array');
        const first = adapters[0];
        if (!isRecord(first)) throw new Error('fixture: .context.adapters[0] must be an object');
        delete first['always_on'];
      },
    });
    assert.throws(() => loadPolicy(root), /policy\.json \.context\.adapters\[0\]\.always_on/);
  });
  ```

  The file already has a `checkout` constant and imports `loadPolicy`; add `type TestContext` to the `node:test` import, `isRecord` from `'../lib/json'`, and `relocatedRoot, tempRoot` from `'../testing/harness'` if they are not already imported.

- [ ] **Step 2: Run it and see it fail.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test registry/policy.test.js
  ```

  Expected failure: `tsc` exits non-zero with `error TS2339: Property 'context' does not exist on type 'PolicyRegistry'.`

- [ ] **Step 3: Add the `.context` block to `registries/policy.json`.**

  Insert after Wave 2's `"execution"` block, which itself lands after `"parallelism"`.
  Placing `.context` before `.execution` produces a conflict hunk against Wave 2 for
  no gain; the key order in this registry is not part of any answer.


  ```json
  "context": {
    "note": "Adapter context budgets and the compact generated entry points. max_bytes is a hard ceiling on the always-on corpus of ONE adapter: the entry file plus every rule it imports eagerly. Measured by `engineos bench`, generated by `engineos gen adapter-context`, checked by validator C38, mirrored in rules/context.md 'Adapter context budgets' and templates/adapters/codex.md. A generated entry point is a build artifact: hand-edit it and CI's drift guard reverts the edit.",
    "max_bytes": 32000,
    "adapters": [
      {
        "id": "claude",
        "entry": "CLAUDE.md",
        "generated": false,
        "always_on": ["rules/base.md", "rules/security.md", "rules/git.md", "rules/context.md"],
        "invariants": [],
        "enforcement": [
          { "capability": "always-on-rules", "state": "enforced" },
          { "capability": "prompt-advisor", "state": "enforced" },
          { "capability": "edit-time-routing", "state": "enforced" },
          { "capability": "stop-gates", "state": "enforced" }
        ]
      },
      {
        "id": "codex",
        "entry": "AGENTS.md",
        "generated": true,
        "always_on": ["rules/base.md", "rules/security.md", "rules/git.md"],
        "invariants": [
          { "id": "safety-invariants", "heading": "Safety invariants" },
          { "id": "task-contract", "heading": "Task contract" },
          { "id": "enforcement", "heading": "Enforcement under Codex" },
          { "id": "execution-lane", "heading": "Execution lane" },
          { "id": "gates", "heading": "Gates by risk" },
          { "id": "commands", "heading": "Commands" },
          { "id": "human-docs", "heading": "Where the full prose lives" }
        ],
        "enforcement": [
          { "capability": "always-on-rules", "state": "enforced" },
          { "capability": "directory-scoped-rules", "state": "enforced" },
          { "capability": "prompt-advisor", "state": "absent" },
          { "capability": "edit-time-routing", "state": "convention" },
          { "capability": "stop-gates", "state": "convention" },
          { "capability": "return-envelope", "state": "convention" }
        ]
      }
    ]
  },
  ```

- [ ] **Step 4: Add the strict loader.**

  In `src/registry/policy.ts`, add the interfaces above `PolicyRegistry`, add `context: ContextPolicy;` to `PolicyRegistry`, and inside `loadPolicy` add before the `return`:

  ```ts
  const context = requireRecord(p['context'], '.context');
  ```

  and inside the returned object, after `parallelism`:

  ```ts
  context: {
    max_bytes: requireNumber(context['max_bytes'], '.context.max_bytes'),
    adapters: requireRows(context['adapters'], '.context.adapters').map((row, i) => ({
      id: requireString(row['id'], `.context.adapters[${i}].id`),
      entry: requireString(row['entry'], `.context.adapters[${i}].entry`),
      generated: requireBoolean(row['generated'], `.context.adapters[${i}].generated`),
      always_on: requireStrings(row['always_on'], `.context.adapters[${i}].always_on`),
      invariants: requireRows(row['invariants'], `.context.adapters[${i}].invariants`).map((inv, j) => ({
        id: requireString(inv['id'], `.context.adapters[${i}].invariants[${j}].id`),
        heading: requireString(inv['heading'], `.context.adapters[${i}].invariants[${j}].heading`),
      })),
      enforcement: requireRows(row['enforcement'], `.context.adapters[${i}].enforcement`).map((e, j) => ({
        capability: requireString(e['capability'], `.context.adapters[${i}].enforcement[${j}].capability`),
        state: requireString(e['state'], `.context.adapters[${i}].enforcement[${j}].state`),
      })),
    })),
  },
  ```

- [ ] **Step 5: Run the loader test and see it pass.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test registry/policy.test.js
  ```

  Expected: PASS, `fail 0`.

- [ ] **Step 6: Write the failing C38 mirror test.**

  Create `src/checks/adapter-context.test.ts` with its final contents:

  ```ts
  import { test, type TestContext } from 'node:test';
  import assert from 'node:assert/strict';
  import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { memoryIo } from '../io';
  import type { Finding } from './findings';
  import { resolveRoot } from '../registry/paths';
  import { tempRoot } from '../testing/harness';
  import { makeContext } from './lib';
  import { checkC38 } from './adapter-context';

  const checkout = resolveRoot(process.env, __dirname);

  // A copy of the shipped tree, so a negative case perturbs exactly one input and
  // every other one stays the real file. The checks read text only, so copying
  // four directories is cheap.
  function fixture(t: TestContext, mutate: (root: string) => void): string {
    const root = join(tempRoot(t), 'tree');
    mkdirSync(root, { recursive: true });
    for (const dir of ['registries', 'rules', 'templates', 'commands']) {
      cpSync(join(checkout, dir), join(root, dir), { recursive: true });
    }
    cpSync(join(checkout, 'AGENTS.md'), join(root, 'AGENTS.md'));
    mutate(root);
    return root;
  }

  function run(root: string): Finding[] {
    return checkC38(makeContext(root, memoryIo())).flatMap((r) => [...r.findings]);
  }

  function edit(root: string, rel: string, change: (text: string) => string): void {
    const path = join(root, rel);
    writeFileSync(path, change(readFileSync(path, 'utf8')));
  }

  test('the shipped tree passes C38', () => {
    assert.deepEqual(run(checkout), []);
  });

  test('a byte ceiling rules/context.md no longer quotes is reported', (t: TestContext) => {
    const root = fixture(t, (tree) => {
      edit(tree, 'rules/context.md', (text) => text.replace('hard ceiling of 32000 bytes', 'hard ceiling of 64000 bytes'));
    });
    assert.deepEqual(run(root), [{ code: 'context-budget-drift', subject: '32000' }]);
  });

  test('a Codex enforcement capability the adapter template drops is reported', (t: TestContext) => {
    const root = fixture(t, (tree) => {
      edit(tree, 'templates/adapters/codex.md', (text) => text.replace('`return-envelope`', 'the return envelope'));
    });
    assert.deepEqual(run(root), [{ code: 'codex-enforcement-missing', subject: 'return-envelope' }]);
  });
  ```

- [ ] **Step 7: Run it and see it fail.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test checks/adapter-context.test.js
  ```

  Expected failure: `tsc` exits non-zero with `error TS2307: Cannot find module './adapter-context'`. The suite does not run.

- [ ] **Step 8: Implement C38 with its two mirror rows.**

  Create `src/checks/adapter-context.ts`:

  ```ts
  // Family `adapter-context`: the generated compact adapter entry point and the
  // registry block that produces it.
  //
  // Task 5 adds this check's three code-owned findings (generated-drift,
  // invariant-missing, budget-exceeded). Task 2 lands the two mirror rows, which
  // is what makes registries/policy.json .context unable to move without its
  // prose moving with it.
  import { result, type CheckResult } from './findings';
  import type { Check } from './index';
  import type { CheckContext } from './lib';
  import { runMirrors } from './mirror';
  import { rowsOf } from './mirrors';

  export const C38_FINDINGS = ['context-budget-drift', 'codex-enforcement-missing'] as const;

  declare module './codes' {
    interface CheckCodes {
      C38: (typeof C38_FINDINGS)[number];
    }
  }

  export const C38_TITLE = 'generated adapter context is in sync, complete and within budget';

  export const ADAPTER_CONTEXT_CHECKS: readonly Check[] = [
    { id: 'C38', codes: C38_FINDINGS, run: checkC38 },
  ];

  export function checkC38(ctx: CheckContext): CheckResult[] {
    return [result('C38', C38_TITLE, runMirrors(rowsOf('C38'), ctx))];
  }
  ```

  Add `'C38',` at the end of `CHECK_IDS` in `src/checks/ids.ts`. In `src/checks/index.ts`, add `import { ADAPTER_CONTEXT_CHECKS } from './adapter-context';` beside the other family imports and `...ADAPTER_CONTEXT_CHECKS,` at the end of the `CHECKS` array.

  In `src/checks/mirrors.ts`, add at the end of `ROWS`, before the closing bracket:

  ```ts
  // --------------------------------------------------------------- C38
  // The ceiling and the enforcement vocabulary are the two parts of .context a
  // reader meets in prose. The generated entry point itself is asserted in code
  // (Task 5): a drift guard diffs bytes, which no grep row can express.
  {
    id: 'context-budget-drift', check: 'C38',
    registry: 'policy.context.max_bytes', doc: 'rules/context.md',
    anchor: '## Adapter context budgets', direction: 'doc-names-registry',
    kind: 'quotes', pattern: 'hard ceiling of {n} bytes',
  },
  {
    id: 'codex-enforcement-missing', check: 'C38',
    registry: 'policy.context.adapters[id=codex].enforcement[].capability',
    doc: 'templates/adapters/codex.md',
    // scope: file — the adapter template splits the vocabulary across its
    // "What is enforced" and "What degrades to convention" sections on purpose.
    scope: 'file', direction: 'doc-names-registry',
    kind: 'names', element: '`{x}`',
  },
  ```

- [ ] **Step 9: Add the prose the mirror rows require.**

  Append to `rules/context.md`, after the `## Rules` section and before `## For dispatched sub-agents`:

  ```markdown
  ## Adapter context budgets

  Each adapter has ONE entry point and a corpus it loads before reading anything
  else: the entry file plus every rule it imports eagerly. That corpus has a
  hard ceiling of 32000 bytes, declared in `registries/policy.json` `.context`
  and measured by `engineos bench`. It is a ceiling, not a target — the budget
  says what may never be exceeded, not what should be filled.

  `CLAUDE.md` is hand-written and eagerly loads four rules; the prompt advisor
  supplies the rest per intent. `AGENTS.md` is GENERATED by
  `engineos gen adapter-context` and eagerly loads three — the safety invariants
  that must hold before any routing decision. Every other rule reaches Codex
  through the task contract it resolves per request. Hand-editing a generated
  entry point does not survive CI's drift guard.
  ```

  In `templates/adapters/codex.md`'s "What is enforced" / "What degrades to convention" sections, spell each capability id in backticks so the mirror resolves: `` `always-on-rules` ``, `` `directory-scoped-rules` ``, `` `prompt-advisor` ``, `` `edit-time-routing` ``, `` `stop-gates` ``, `` `return-envelope` ``.

- [ ] **Step 10: Run the C38 test and see it pass.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test checks/adapter-context.test.js
  ```

  Expected: PASS — three tests, `fail 0`.

- [ ] **Step 11: Bump the check-count claims.**

  Registering C38 makes `CHECK_IDS.length` 69. C37 (`count-drift`) reads four documents. Change, in each:

  - `CLAUDE.md` line 173: `coherent by a 68-check validator.` -> `coherent by a 69-check validator.`
  - `AGENTS.md` line 175: same substitution. (Task 4 regenerates this file without a count claim; the edit keeps CI green in between.)
  - `README.md`: `68 self-integrity Checks` -> `69 self-integrity Checks`
  - `docs/CODEBASE_MAP.md` line 16: `A validator (68 checks)` -> `A validator (69 checks)`
  - `docs/CODEBASE_MAP.md` line 320: `V[68 checks over prose + registries + kernel]` -> `V[69 checks over prose + registries + kernel]`
  - `docs/CODEBASE_MAP.md`: the remaining `68-check` occurrence -> `69-check`

  Verify none are left:

  ```bash
  cd /Users/ricardofagmer/projects/engineos && grep -rn "68[- ]\(self-integrity \)\?[Cc]heck" CLAUDE.md AGENTS.md README.md docs/CODEBASE_MAP.md; echo "exit=$?"
  ```

  Expected: no output, `exit=1` (grep found nothing).

- [ ] **Step 12: Run the validator and the full suite.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && npm run build && node dist/engineos.cjs validate && npm test
  ```

  Expected: the validator prints `ok C38 generated adapter context is in sync, complete and within budget`, `failed 0`; `npm test` is green.

- [ ] **Step 13: Commit.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos
  git add registries/policy.json src/registry/policy.ts src/registry/policy.test.ts rules/context.md templates/adapters/codex.md src/checks/adapter-context.ts src/checks/adapter-context.test.ts src/checks/ids.ts src/checks/index.ts src/checks/mirrors.ts CLAUDE.md AGENTS.md README.md docs/CODEBASE_MAP.md dist/engineos.cjs
  git commit -m "feat(policy): declare adapter context budgets and register check C38

.context carries each adapter's entry point, eager rule set, enforcement matrix
and required invariant headings, plus the 32000-byte ceiling engineos bench
already asserts for CLAUDE.md. C38 mirrors the ceiling into rules/context.md and
the Codex enforcement vocabulary into templates/adapters/codex.md.

Check-count claims move 68 -> 69 in the four documents C37 reads.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 3: The `adapter-context` generator

A deterministic generator that builds the compact Codex entry point from `registries/policy.json` and the `commands/` directory. It writes nothing into the repo yet — Task 4 runs it.

**Files:**
- `src/gen/adapter-context.ts` (created)
- `src/gen/adapter-context.test.ts` (created)
- `src/gen/cli.ts` (modified)
- `docs/COMPATIBILITY.md` (modified)

**Interfaces:**
- Consumes: `ContextAdapter`, `ContextPolicy`, `PolicyRegistry` from `src/registry/policy.ts` (Task 2); `ExecutionPolicy` from the same module (Wave 2's F2 `.execution` block); `Io` from `src/io.ts`; `resolveRoot` from `src/registry/paths.ts`; `KernelError` from `src/lib/json.ts`.
- Produces:
  ```ts
  export interface AdapterContextInputs {
    adapter: ContextAdapter;
    policy: PolicyRegistry;
    commands: string[];
  }
  export function buildAdapterContext(inputs: AdapterContextInputs): string;
  export function generateAdapterContext(root: string, io: Io): number;
  ```
  and a new gen target: `engineos gen adapter-context`.

- [ ] **Step 1: Write the failing generator test.**

  Create `src/gen/adapter-context.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { KernelError } from '../lib/json';
  import { loadPolicy, type ContextAdapter, type PolicyRegistry } from '../registry/policy';
  import { resolveRoot } from '../registry/paths';
  import { buildAdapterContext } from './adapter-context';

  const checkout = resolveRoot(process.env, __dirname);
  const policy: PolicyRegistry = loadPolicy(checkout);

  function codex(): ContextAdapter {
    const row = policy.context.adapters.find((a) => a.id === 'codex');
    if (row === undefined) throw new Error('fixture: the codex adapter must be declared');
    return row;
  }

  const COMMANDS = ['engineos:audit', 'engineos:route'];

  test('every declared invariant becomes a level-two heading', () => {
    const text = buildAdapterContext({ adapter: codex(), policy, commands: COMMANDS });
    for (const invariant of codex().invariants) {
      assert.ok(text.includes(`\n## ${invariant.heading}\n`), `missing heading for ${invariant.id}`);
    }
  });

  test('the eager imports are exactly the adapter always_on set, in registry order', () => {
    const text = buildAdapterContext({ adapter: codex(), policy, commands: COMMANDS });
    const imports = text.split('\n').filter((line) => line.startsWith('@rules/'));
    assert.deepEqual(imports, codex().always_on.map((rule) => `@${rule}`));
  });

  test('the direct-lane bounds are copied from the execution registry, not restated', () => {
    const text = buildAdapterContext({ adapter: codex(), policy, commands: COMMANDS });
    assert.ok(text.includes(`| max_files | ${String(policy.execution.direct_lane.max_files)} |`));
    assert.ok(text.includes(`| max_domains | ${String(policy.execution.direct_lane.max_domains)} |`));
  });

  test('every command is rendered as a resolvable slash-command reference', () => {
    const text = buildAdapterContext({ adapter: codex(), policy, commands: COMMANDS });
    assert.ok(text.includes('`/engineos:route`'));
    assert.ok(text.includes('`/engineos:audit`'));
  });

  test('generation is deterministic — the same inputs produce byte-identical output', () => {
    const inputs = { adapter: codex(), policy, commands: COMMANDS };
    assert.equal(buildAdapterContext(inputs), buildAdapterContext(inputs));
  });

  test('an adapter declaring no invariants is refused rather than generated empty', () => {
    const adapter: ContextAdapter = { ...codex(), invariants: [] };
    assert.throws(
      () => buildAdapterContext({ adapter, policy, commands: COMMANDS }),
      (error: unknown) => error instanceof KernelError && /declares no invariants/.test(error.message),
    );
  });
  ```

- [ ] **Step 2: Run it and see it fail.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test gen/adapter-context.test.js
  ```

  Expected failure: `tsc` exits non-zero with `error TS2307: Cannot find module './adapter-context'`.

- [ ] **Step 3: Implement `buildAdapterContext`.**

  Create `src/gen/adapter-context.ts`:

  ```ts
  // EngineOS — generate a compact adapter entry point from registries/policy.json.
  //
  // The eager corpus is the thing being minimized, so the document holds only what
  // must be true BEFORE a contract can be resolved: the safety invariants, the one
  // call that resolves the contract, what the adapter does and does not enforce,
  // how to read the execution lane, the gate ladder, the commands, and where the
  // full prose lives. Everything else arrives per request through the contract.
  //
  // Registry-derived, never restated: every table below is a projection of
  // registries/policy.json. A number typed here instead of read would be a second
  // copy of a policy value, which is the drift this generator exists to remove.
  import { readdirSync, writeFileSync } from 'node:fs';
  import { join } from 'node:path';
  import type { Io } from '../io';
  import { KernelError } from '../lib/json';
  import { loadPolicy, type ContextAdapter, type PolicyRegistry } from '../registry/policy';

  const EXIT_OK = 0;
  const EXIT_FAILURE = 1;

  const HEADER = '<!-- Generated by `engineos gen adapter-context` from registries/policy.json. Do not hand-edit: run the generator and commit the result. -->';

  export interface AdapterContextInputs {
    adapter: ContextAdapter;
    policy: PolicyRegistry;
    commands: string[];
  }

  export function buildAdapterContext(inputs: AdapterContextInputs): string {
    const { adapter, policy, commands } = inputs;
    if (adapter.invariants.length === 0) {
      throw new KernelError(`adapter '${adapter.id}' declares no invariants — a generated entry point with no required section asserts nothing`);
    }
    if (adapter.always_on.length === 0) {
      throw new KernelError(`adapter '${adapter.id}' declares no always_on rules — an entry point with no safety invariant is not one`);
    }
    const body = new Map<string, string>([
      ['safety-invariants', safetyInvariants(adapter)],
      ['task-contract', taskContract()],
      ['enforcement', enforcement(adapter)],
      ['execution-lane', executionLane(policy)],
      ['gates', gates(policy)],
      ['commands', commandList(commands)],
      ['human-docs', humanDocs()],
    ]);
    const sections = adapter.invariants.map((invariant) => {
      const text = body.get(invariant.id);
      if (text === undefined) {
        throw new KernelError(`adapter '${adapter.id}' declares invariant '${invariant.id}', which this generator cannot render`);
      }
      return `## ${invariant.heading}\n\n${text}`;
    });
    return `${HEADER}\n# EngineOS — ${adapter.id} entry point\n\n${sections.join('\n\n')}\n`;
  }

  // Reads <root>/registries/policy.json plus <root>/commands, writes every adapter
  // whose `generated` flag is true, and reports through io. Returns the exit code.
  export function generateAdapterContext(root: string, io: Io): number {
    let written = 0;
    try {
      const policy = loadPolicy(root);
      const commands = commandNames(root);
      for (const adapter of policy.context.adapters) {
        if (!adapter.generated) continue;
        const text = buildAdapterContext({ adapter, policy, commands });
        const out = join(root, adapter.entry);
        writeFileSync(out, text);
        io.out(`Wrote ${String(Buffer.byteLength(text, 'utf8'))} bytes to ${out}\n`);
        written += 1;
      }
    } catch (error) {
      if (error instanceof KernelError) {
        io.err(`${error.message}\n`);
        return EXIT_FAILURE;
      }
      throw error;
    }
    if (written === 0) {
      io.err('No adapter in registries/policy.json .context declares generated: true\n');
      return EXIT_FAILURE;
    }
    return EXIT_OK;
  }

  // -------------------------------------------------------------------- sections

  function safetyInvariants(adapter: ContextAdapter): string {
    const imports = adapter.always_on.map((rule) => `@${rule}`).join('\n');
    return [
      'These load eagerly, before any routing decision, because a decision made',
      'without them is already wrong:',
      '',
      imports,
      '',
      'Nothing else loads eagerly. Every other rule arrives through the task',
      'contract below, named by the request that needs it.',
    ].join('\n');
  }

  function taskContract(): string {
    return [
      'Before any substantive request — anything that creates or modifies code,',
      'config or docs — resolve the contract once and load exactly what it names:',
      '',
      '```bash',
      'scripts/kernel.sh resolve --facts "$(node -e \'process.stdout.write(JSON.stringify({ prompt: process.argv[1], taskContract: true }))\' -- "<the request, verbatim>")"',
      '```',
      '',
      'The answer carries `task_contract.rules`, `.policy_rules`, `.skills`,',
      '`.agents`, `.commands`, `.model_tier`, `.risk_floor`, `.gates` and',
      '`.required`. Read the files it names and no others. A rule the contract did',
      'not name is context you are spending without being asked to.',
      '',
      'Then announce, in one line:',
      '',
      '`[router] intent=<ids> risk=<low|medium|high> autonomy=<A0-A4> loaded=<rules/skills> agent=<agents dispatched|none>`',
      '',
      'On a non-zero exit, proceed with the safety invariants alone and say so.',
      'Never block on routing, and never reconstruct a contract from memory.',
    ].join('\n');
  }

  function enforcement(adapter: ContextAdapter): string {
    const rows = adapter.enforcement.map((row) => `| \`${row.capability}\` | ${row.state} |`).join('\n');
    return [
      'What this adapter actually enforces, and what is model discipline only.',
      'Reading `convention` as `enforced` is how an unenforced gate gets reported',
      'as a passed one.',
      '',
      '| Capability | State |',
      '|---|---|',
      rows,
    ].join('\n');
  }

  function executionLane(policy: PolicyRegistry): string {
    const lane = policy.execution.direct_lane;
    const bounds: [string, string][] = [
      ['max_risk', lane.max_risk],
      ['requires_reversible', String(lane.requires_reversible)],
      ['max_domains', String(lane.max_domains)],
      ['max_units', String(lane.max_units)],
      ['max_files', String(lane.max_files)],
      ['forbid_security_sensitive', String(lane.forbid_security_sensitive)],
      ['forbid_required_agents', String(lane.forbid_required_agents)],
    ];
    return [
      `The contract answers \`execution.mode\`, one of ${policy.execution.modes.map((m) => `\`${m}\``).join(', ')}.`,
      '',
      '- `direct` — do the work yourself. No subagent brief, wait or return cycle.',
      '- `delegate` — dispatch one agent with a file scope and the contract.',
      '- `wave` — group units into waves and dispatch a whole wave per turn.',
      '- `unresolved` — the facts were not declared. Treat it as `delegate`.',
      '',
      '`direct` requires every bound below. You may lower the lane; you may never',
      'raise `delegate` or `wave` to `direct`, and you may never raise the capacity.',
      '',
      '| Bound | Value |',
      '|---|---|',
      bounds.map(([name, value]) => `| ${name} | ${value} |`).join('\n'),
    ].join('\n');
  }

  function gates(policy: PolicyRegistry): string {
    const tiers = Object.entries(policy.gates.by_risk).map(([tier, statuses]) => {
      const cells = Object.entries(statuses).map(([gate, status]) => `${gate}: ${status}`).join('; ');
      return `| ${tier} | ${cells} |`;
    });
    return [
      'Classify risk BEFORE the first write. The tier the contract floors and you',
      'classify selects the gates:',
      '',
      '| Risk | Gates |',
      '|---|---|',
      tiers.join('\n'),
      '',
      `A change touching more than ${String(policy.gates.spec_threshold.files_greater_than)} files, or any new feature, gets a spec first.`,
    ].join('\n');
  }

  function commandList(commands: string[]): string {
    const rendered = commands.map((name) => `\`/${name}\``).join(', ');
    return [
      'Available commands, each a file under `commands/`:',
      '',
      rendered,
      '',
      'Two of them are the fast paths this adapter relies on: `/engineos:route`',
      'turns a request into a dispatch plan, and `/engineos:audit` runs a scoped',
      'read-only multi-domain audit.',
    ].join('\n');
  }

  function humanDocs(): string {
    return [
      'This file is generated and deliberately short. The full prose lives where a',
      'human reads it, and where the task contract points:',
      '',
      '- `rules/` — the rule corpus, loaded per contract.',
      '- `CLAUDE.md` — the human-readable router table and non-negotiables.',
      '- `templates/adapters/codex.md` — what this adapter enforces and why.',
      '- `docs/CODEBASE_MAP.md` — the architecture.',
      '- `docs/COMPATIBILITY.md` — what is public surface.',
      '',
      'Project conventions outrank these rules wherever the two conflict.',
    ].join('\n');
  }

  // -------------------------------------------------------------------- helpers

  // Sorted so the generated document does not move when a filesystem hands back a
  // different readdir order. Nested directories (commands/agents/) are the
  // per-agent commands and are not entry points a reader types by name.
  function commandNames(root: string): string[] {
    return readdirSync(join(root, 'commands'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => `engineos:${entry.name.slice(0, -'.md'.length)}`)
      .sort();
  }
  ```

- [ ] **Step 4: Register the gen target.**

  In `src/gen/cli.ts`, add the import beside the others (one statement per module):

  ```ts
  import { generateAdapterContext } from './adapter-context';
  ```

  change the usage string:

  ```ts
  const USAGE = 'usage: engineos gen agent-commands|agent-registry|adapter-context';
  ```

  and add the case:

  ```ts
      case 'adapter-context':
        return generateAdapterContext(resolveRoot(io.env), io);
  ```

- [ ] **Step 5: Run the generator test and see it pass.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test gen/adapter-context.test.js
  ```

  Expected: PASS — six tests, `fail 0`.

- [ ] **Step 6: Record the new surface in `docs/COMPATIBILITY.md`.**

  In the 2.0 change table, add:

  ```markdown
  | `engineos gen adapter-context` | new gen target: writes every `registries/policy.json` `.context` adapter whose `generated` flag is true | added |
  ```

  And in the paragraph that lists the gen targets, extend `agent-commands` / `agent-registry` with `adapter-context`. No `scripts/gen-adapter-context.sh` shim is created: the two existing gen shims are already deprecated for removal in 2.0, and a new one would be born deprecated. CI calls `node dist/engineos.cjs gen adapter-context` directly.

- [ ] **Step 7: Build and commit.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && npm run build
  git add src/gen/adapter-context.ts src/gen/adapter-context.test.ts src/gen/cli.ts docs/COMPATIBILITY.md dist/engineos.cjs
  git commit -m "feat(gen): add the adapter-context generator

Builds a compact adapter entry point from registries/policy.json .context,
.execution and .gates plus the commands/ directory. Every table is a projection
of a registry; nothing is restated. The generator is registered but not yet run
over the tree - Task 4 does that.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 4: Generate `AGENTS.md` and retire the hand-sync

The one commit that replaces the file. The generated document is codegen from here on; `rules/git.md`'s hard-cases carve-out covers it, and the PR description calls it out.

**Files:**
- `AGENTS.md` (regenerated)
- `templates/adapters/codex.md` (modified)
- `docs/COMPATIBILITY.md` (modified)

**Interfaces:**
- Consumes: `engineos gen adapter-context` from Task 3.
- Produces: `AGENTS.md` as a build artifact.

- [ ] **Step 1: Record the before number.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && node dist/engineos.cjs bench 2>&1 | grep "always-on context"
  node -e 'const {contextEntryBytes}=require("./build/bench/measure.js"); console.log("AGENTS.md", contextEntryBytes(process.cwd(), "AGENTS.md"));'
  ```

  Expected: `ok   always-on context: 28019 bytes budget<32000 bytes` and `AGENTS.md 60515`. Write both into the commit message in Step 6.

- [ ] **Step 2: Generate the file.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && node dist/engineos.cjs gen adapter-context
  ```

  Expected: one line, `Wrote <N> bytes to /Users/ricardofagmer/projects/engineos/AGENTS.md`.

- [ ] **Step 3: Measure the after number and check it against the budget.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && node -e 'const {contextEntryBytes}=require("./build/bench/measure.js"); const n=contextEntryBytes(process.cwd(), "AGENTS.md"); console.log("AGENTS.md", n, n < 32000 ? "under budget" : "OVER BUDGET");'
  ```

  Expected: a number well under 32000 (the three eager rules are 7105 bytes; the generated body targets 6000 or less). If it prints `OVER BUDGET`, shorten the generator's prose in `src/gen/adapter-context.ts` and regenerate — do not raise `max_bytes`.

- [ ] **Step 4: Confirm C36 still has references to resolve.**

  C36 (`src/checks/prose-truth.ts`) reads `AGENTS.md` for backticked `/command` and `patterns/` tokens and reports `no-references` when a router file yields none. The generated `## Commands` section renders every `commands/*.md` file as `` `/engineos:<name>` ``, so the check has real references and resolves them against `commands/`.

  ```bash
  cd /Users/ricardofagmer/projects/engineos && node dist/engineos.cjs validate --only C36,C37
  ```

  Expected: `ok C36 router-table command and pattern references resolve` and `ok C37 check-count claims equal the registered count`, `failed 0`. The regenerated file carries no check-count claim, so C37 has nothing to compare there.

- [ ] **Step 5: Rewrite the adapter template's sync section.**

  In `templates/adapters/codex.md`, replace the whole `## The AGENTS.md copy` section — from the heading through the paragraph ending `...more machinery than the hand sync it would replace.` — with:

  ```markdown
  ## The generated AGENTS.md

  `AGENTS.md` at the repo root is GENERATED by `engineos gen adapter-context`
  from `registries/policy.json` `.context`, `.execution` and `.gates` plus the
  `commands/` directory. Hand-editing it does not survive CI's drift guard.

  It is not a copy of `CLAUDE.md` and no longer tries to be. `CLAUDE.md` carries
  the human-readable router table; `AGENTS.md` carries what must be true before a
  routing decision exists — the safety invariants, the one call that resolves the
  task contract, this adapter's enforcement matrix, the execution lane, the gate
  ladder, the command list and a pointer to the prose. Everything else reaches
  Codex per request, through the contract.

  The hand sync is why this was worth generating. The copy carried a
  "Coordinated multi-domain change" row and a `hooks/routing-map.sh` mention for
  a release after both were gone, because C16 counts `CLAUDE.md`'s rows against
  `registries/intents.json` and never opened the copy. Generating from
  `CLAUDE.md` was rejected once and stays rejected — the substitution table that
  needed was more machinery than the sync it replaced. Generating from the
  REGISTRIES is a different proposition: there is no substitution table, because
  there is no second prose document to transform.

  Also changed from `CLAUDE.md`: the install path is `~/.Codex/AGENTS.md`, and
  the hooks do not run here at all rather than having a node floor.
  ```

  Keep the `## What is enforced` and `## What degrades to convention` sections and their backticked capability ids from Task 2 Step 9 — C38's second mirror row reads them.

- [ ] **Step 6: Record the surface change and commit.**

  In `docs/COMPATIBILITY.md`'s 2.0 change table, add:

  ```markdown
  | `AGENTS.md` | hand-maintained copy of `CLAUDE.md` -> generated by `engineos gen adapter-context`; the always-on import list drops from eleven rules to three, and the router table moves out to the task contract | changed |
  ```

  ```bash
  cd /Users/ricardofagmer/projects/engineos && npm test && node dist/engineos.cjs validate
  git add AGENTS.md templates/adapters/codex.md docs/COMPATIBILITY.md
  git commit -m "feat(context)!: generate the compact Codex entry point

AGENTS.md was 60515 always-on bytes - 17778 of prose plus eleven eager rule
imports totalling 42737 - against the 32000-byte budget engineos bench asserts
for CLAUDE.md (28019). It is now generated from the registries and eagerly loads
three safety-invariant rules; everything else arrives through the task contract.

AGENTS.md is codegen from this commit: excluded from the PR line count under the
rules/git.md hard-cases carve-out. Task 5 lands its drift guard and budget
assertion.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 5: Drift guard, invariant assertion, and the measured budget

The generated file now needs the three guards a build artifact owes: it matches a fresh run, it carries every required invariant, and it fits the budget. Measured, never asserted by hand.

**Files:**
- `src/checks/adapter-context.ts` (modified)
- `src/checks/adapter-context.test.ts` (modified)
- `src/bench/run.ts` (modified)
- `src/bench/run.test.ts` (modified)
- `.github/workflows/ci.yml` (modified)
- `docs/COMPATIBILITY.md` (modified)

**Interfaces:**
- Consumes: `buildAdapterContext` from `src/gen/adapter-context.ts`; `contextEntryBytes` from `src/bench/measure.ts`; `loadPolicy` from `src/registry/policy.ts`.
- Produces: C38 finding codes `generated-drift`, `invariant-missing`, `budget-exceeded`; a sixth `engineos bench` budget row named `codex context`.

- [ ] **Step 1: Write the failing tests for the three new codes.**

  Append to `src/checks/adapter-context.test.ts`:

  ```ts
  test('a hand-edited generated entry point is reported as drift', (t: TestContext) => {
    const root = fixture(t, (tree) => {
      edit(tree, 'AGENTS.md', (text) => `${text}\nHand-added line.\n`);
    });
    assert.deepEqual(run(root), [{ code: 'generated-drift', subject: 'AGENTS.md' }]);
  });

  test('a required invariant heading removed from the entry point is reported', (t: TestContext) => {
    const root = fixture(t, (tree) => {
      edit(tree, 'AGENTS.md', (text) => text.replace('\n## Gates by risk\n', '\n## Gate ladder\n'));
    });
    // Drift comes with it: the file no longer matches a fresh run either. Both
    // are true and both are reported, because a reader who fixes only the
    // heading has not fixed the artifact.
    assert.deepEqual(run(root), [
      { code: 'generated-drift', subject: 'AGENTS.md' },
      { code: 'invariant-missing', subject: 'AGENTS.md:gates' },
    ]);
  });

  test('an entry point over the byte ceiling is reported with its measured size', (t: TestContext) => {
    const root = fixture(t, (tree) => {
      edit(tree, 'registries/policy.json', (text) => text.replace('"max_bytes": 32000', '"max_bytes": 100'));
    });
    const findings = run(root);
    const budget = findings.find((f) => f.code === 'budget-exceeded');
    assert.ok(budget !== undefined, 'expected a budget-exceeded finding');
    assert.match(budget.subject ?? '', /^AGENTS\.md:\d+$/);
  });
  ```

- [ ] **Step 2: Run them and see them fail.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test checks/adapter-context.test.js
  ```

  Expected failure: `tsc` exits non-zero with `error TS2345: Argument of type '"generated-drift"' is not assignable to parameter of type ...` — the code is not in `C38_FINDINGS`.

- [ ] **Step 3: Extend C38.**

  In `src/checks/adapter-context.ts`, widen the codes and the body:

  ```ts
  export const C38_FINDINGS = [
    'context-budget-drift',
    'codex-enforcement-missing',
    'generated-drift',
    'invariant-missing',
    'budget-exceeded',
  ] as const;
  ```

  and replace `checkC38`:

  ```ts
  export function checkC38(ctx: CheckContext): CheckResult[] {
    const findings: Finding[] = [...runMirrors(rowsOf('C38'), ctx)];
    const policy = ctx.registries.policy;
    const commands = ctx
      .list('commands')
      .filter((name) => name.endsWith('.md'))
      .map((name) => `engineos:${name.slice(0, -'.md'.length)}`);
    for (const adapter of policy.context.adapters) {
      if (!adapter.generated) continue;
      const actual = ctx.readText(adapter.entry);
      if (actual === undefined) return skipOnce(ctx, 'C38', C38_TITLE, adapter.entry);
      // Regenerated in memory and compared, which is the same guarantee CI's
      // drift guard gives with `git diff`, available to a developer who has not
      // pushed yet.
      if (actual !== buildAdapterContext({ adapter, policy, commands })) {
        findings.push(finding('C38', 'generated-drift', adapter.entry));
      }
      for (const invariant of adapter.invariants) {
        if (!actual.includes(`\n## ${invariant.heading}\n`)) {
          findings.push(finding('C38', 'invariant-missing', `${adapter.entry}:${invariant.id}`));
        }
      }
      const bytes = contextEntryBytes(ctx.root, adapter.entry);
      if (bytes >= policy.context.max_bytes) {
        findings.push(finding('C38', 'budget-exceeded', `${adapter.entry}:${String(bytes)}`));
      }
    }
    return [result('C38', C38_TITLE, findings)];
  }
  ```

  Add the imports, one statement per module:

  ```ts
  import { contextEntryBytes } from '../bench/measure';
  import { buildAdapterContext } from '../gen/adapter-context';
  import { finding, result, type CheckResult, type Finding } from './findings';
  import { skipOnce, type CheckContext } from './lib';
  ```

- [ ] **Step 4: Run the C38 tests and see them pass.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test checks/adapter-context.test.js
  ```

  Expected: PASS — six tests, `fail 0`.

- [ ] **Step 5: Write the failing bench test for the sixth budget.**

  In `src/bench/run.test.ts`, extend the expected-lines assertion (the block currently asserting five lines including `` `ok   always-on context: ${bytes} bytes budget<32000 bytes` ``) with a sixth line immediately after it:

  ```ts
      `ok   codex context: ${codexBytes} bytes budget<32000 bytes`,
  ```

  and compute `codexBytes` beside the existing `bytes` binding with `contextEntryBytes(root, 'AGENTS.md')`.

- [ ] **Step 6: Run it and see it fail.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test bench/run.test.js
  ```

  Expected failure: an assertion diff showing the actual output has five lines where six were expected — the `codex context` line is absent.

- [ ] **Step 7: Add the sixth measurement.**

  In `src/bench/run.ts`, add `loadPolicy` and `contextEntryBytes` to the existing imports (`contextEntryBytes` joins the `'./measure'` statement; `loadPolicy` is a new `import { loadPolicy } from '../registry/policy';`), and extend the returned array in `measureAll`:

  ```ts
    // Sixth, after the Claude corpus: both adapters answer to the SAME registry
    // ceiling, so a budget raised for one cannot quietly excuse the other.
    const ceiling = loadPolicy(root).context.max_bytes;
    return [
      { name: 'route-intent', actual: routeIntent, budget: 250, unit: 'ms' },
      { name: 'resolve-task', actual: resolveTask, budget: 500, unit: 'ms' },
      { name: 'prompt-advisor (end to end)', actual: promptAdvisor, budget: 600, unit: 'ms' },
      { name: 'route-before-change (cache hit)', actual: routeBeforeChange, budget: 150, unit: 'ms' },
      { name: 'always-on context', actual: alwaysOnBytes(root), budget: ceiling, unit: 'bytes' },
      { name: 'codex context', actual: contextEntryBytes(root, 'AGENTS.md'), budget: ceiling, unit: 'bytes' },
    ];
  ```

  Update the file's header comment: `The five names` becomes `The six names`.

- [ ] **Step 8: Run the bench test and the bench itself.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test bench/run.test.js
  cd /Users/ricardofagmer/projects/engineos && npm run build && node dist/engineos.cjs bench
  ```

  Expected: the unit test passes, and `engineos bench` prints six `ok` lines — `always-on context: 28019 bytes budget<32000 bytes` and `codex context: <measured> bytes budget<32000 bytes`, both under budget, exit 0.

- [ ] **Step 9: Add the CI drift guard.**

  In `.github/workflows/ci.yml`, after the `Agent-registry drift guard` step and before `EngineOS integrity check`:

  ```yaml
      # Not on a .sh shim: the two gen shims above are deprecated for removal in
      # 2.0, so a third one would be born deprecated. This calls the runtime.
      - name: Adapter-context drift guard
        run: |
          node dist/engineos.cjs gen adapter-context
          if ! git diff --quiet -- AGENTS.md; then
            echo "FAIL: AGENTS.md is out of sync with registries/ — run 'node dist/engineos.cjs gen adapter-context' and commit the result."
            git diff -- AGENTS.md
            exit 1
          fi
          echo "ok: AGENTS.md matches engineos gen adapter-context output"
  ```

- [ ] **Step 10: Record the surface change.**

  In `docs/COMPATIBILITY.md`, change the sentence about the bench keeping "the five budget names" to name six, and add to the 2.0 change table:

  ```markdown
  | `engineos bench` | sixth budget row `codex context`, measuring `AGENTS.md`'s always-on corpus against `registries/policy.json` `.context.max_bytes`; the two byte budgets read the ceiling from the registry instead of a literal | added |
  ```

- [ ] **Step 11: Full gates and commit.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && npm run build && npm test && node dist/engineos.cjs validate && node dist/engineos.cjs bench
  git add src/checks/adapter-context.ts src/checks/adapter-context.test.ts src/bench/run.ts src/bench/run.test.ts .github/workflows/ci.yml docs/COMPATIBILITY.md dist/engineos.cjs
  git commit -m "feat(bench): assert the Codex context budget and guard the generated entry point

C38 now regenerates AGENTS.md in memory and reports drift, a missing required
invariant heading, and a corpus at or over the registry ceiling. engineos bench
grows a sixth row, codex context, and both byte budgets read max_bytes from
registries/policy.json instead of a literal. CI diffs a fresh generator run.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 6: `/engineos:route` fast path

Today the command resolves the kernel, then always dispatches the router agent, which resolves the same facts a second time. Both halves change: the command returns the deterministic answer when nothing escalated, and carries the answer into the dispatch when something did.

**Files:**
- `commands/route.md` (modified)
- `agents/router.md` (modified)

**Interfaces:**
- Consumes: the `resolve` answer's `.route` (`escalate`, `reasons`, `intents`, `suppressed`, `agents`, `model_tier`, `risk_floor`, `scale`, `ambiguous`), `.risk` (including `.risk.gates`), and — when Wave 2's facts are declared — `.execution` (F1: `mode`, `reasons`, `units`, `policyCapacity`).
- Produces: no code surface. The router agent gains one input contract: an optional pre-resolved kernel answer in its brief.

- [ ] **Step 1: Replace `commands/route.md` step 1's kernel call with the task-contract form.**

  Before (lines 35-41):

  ```markdown
     Then ask the kernel for the route in one `resolve` call, substituting the
     printed root (shell state does not survive between Bash calls), and print
     its `.route` answer as one line:

     ```bash
     "$ENGINEOS_ROOT"/scripts/kernel.sh resolve --facts "$(node -e 'process.stdout.write(JSON.stringify({ prompt: process.argv[1], escalate: true }))' -- "$ARGUMENTS")"
     ```
  ```

  After:

  ```markdown
     Then ask the kernel for the whole deterministic answer in ONE `resolve`
     call, substituting the printed root (shell state does not survive between
     Bash calls). Keep the raw JSON — every later step copies from it, and
     nothing below re-resolves it:

     ```bash
     "$ENGINEOS_ROOT"/scripts/kernel.sh resolve --facts "$(node -e 'process.stdout.write(JSON.stringify({ prompt: process.argv[1], taskContract: true }))' -- "$ARGUMENTS")"
     ```
  ```

  In the paragraph that follows, replace `` `"escalate": true` selects the route-escalation form `` with:

  ```markdown
  `"taskContract": true` implies `escalate` and selects the composite form: the
  answer carries `.route` (`escalate`, `reasons`, `intents`, `suppressed`,
  `agents`, `risk_floor`, `scale`, `ambiguous`), `.risk` with its nested
  `.risk.gates`, `.decision_rules` and `.task_contract`. One call, not three.
  ```

- [ ] **Step 2: Replace step 2 with the fast path.**

  Before (lines 50-55):

  ```markdown
  2. Dispatch the `router` agent via the Task tool with `model: opus`, passing
     `$ARGUMENTS` as the request. **Explicit invocation always dispatches**, even
     when `escalate` is `false` — the user asked for a plan, and the fast path in
     `hooks/prompt-advisor.sh` is an automation default, not a refusal. When
     `escalate` is `false`, say so in one line first, so the user can see the
     dispatch was optional.
  ```

  After:

  ```markdown
  2. **Decide whether there is any residue to dispatch.** Read three fields of
     the answer from step 1:

     | `.route.escalate` | `.route.ambiguous` | Do |
     |---|---|---|
     | `false` | `false` | **Render the plan from the kernel answer and stop.** No dispatch. |
     | either is `true` | — | Dispatch the `router` agent for the residue. |

     When nothing escalated and nothing is ambiguous, the kernel has already
     answered every field the plan carries: the intents, the rules, the agents,
     the model tier, the risk tier, the gates. Dispatching a design-tier agent to
     restate an answer already in hand buys no judgment and costs a full agent
     turn. Say so in one line — `[route] deterministic — no residue, no agent
     dispatched` — then go to step 3.

     When there IS residue, dispatch `router` via the Task tool with
     `model: opus`, and **pass the step 1 answer with it**:

     ```
     REQUEST: <$ARGUMENTS verbatim>

     KERNEL ANSWER (already resolved — copy it, do not resolve it again):
     ```json
     <the raw JSON printed by step 1, verbatim>
     ```

     Reason only about the residue: intent tiebreaks, scope decomposition
     against the real repo, wave grouping.
     ```

     Announce the dispatch on its own line, per `rules/subagents.md`:

     ```diff
     + [agent] router | model: opus | mode: AUDIT | scope: plan only, no writes
     ```
  ```

- [ ] **Step 3: Make step 3 read from whichever source produced the plan.**

  Before (line 56): `3. Print, in this order:`

  After:

  ```markdown
  3. Print, in this order — from the router's `dispatch_plan` when one was
     dispatched, and from the step 1 kernel answer directly when it was not:
  ```

  And append one bullet to that list, after the `dispatch_plan` bullet:

  ```markdown
     - the `execution` section when the answer carries one (`mode`, `reasons`,
       `units`, `policyCapacity`) — and, when it does not, one line saying the
       execution facts were not declared, so the lane is `unresolved`.
  ```

- [ ] **Step 4: Add the no-double-resolve rule.**

  Append to `commands/route.md`'s `## Rules` section:

  ```markdown
  - **Never resolve the same facts twice.** Step 1 is the only `resolve` call
    this command makes for the route, and the router agent is forbidden from
    repeating it (`agents/router.md`, "Resolving the kernel"). A second call on
    the same prompt is a defect even when it returns the same answer: it doubles
    the latency of the one path a user waits on synchronously.
  ```

- [ ] **Step 5: Teach the router agent to accept a pre-resolved answer.**

  In `agents/router.md`, replace the heading and first paragraph of `## Resolving the kernel — do this before step 1` (lines 16-22, from the heading through `...for every kernel call below:`) with:

  ```markdown
  ## Resolving the kernel — do this before step 1

  **If your brief carries a `KERNEL ANSWER` block, that IS step 2's answer.**
  Copy it verbatim into `kernel.resolve` and do not run the `resolve` call
  yourself. `/engineos:route` already paid for it; resolving the same prompt a
  second time returns the same JSON and costs another round trip. You still run
  the per-work-type `resolve` calls in steps 4b and 5 — those declare facts the
  command did not have, because the units did not exist yet.

  Only when the brief carries no such block do you resolve it yourself. You run
  with the **target project as cwd**, not the EngineOS checkout, so a bare
  relative `scripts/…` path does not exist there and exits 127. Resolve the
  EngineOS install root once (`${CLAUDE_PLUGIN_ROOT}` in plugin mode, the
  engineos repo otherwise) and use the resolved absolute path for every kernel
  call below:
  ```

- [ ] **Step 6: Make step 2 of the procedure conditional.**

  In `agents/router.md`, replace the first sentence of step 2 (line 60):

  Before:

  ```markdown
  2. **Resolve the deterministic answer — one call.** First derive the
     `policy.json` risk inputs you can evidence from the request and the repo;
  ```

  After:

  ```markdown
  2. **Take the deterministic answer.** When the brief carried a `KERNEL ANSWER`
     block, copy it into `kernel.resolve` and go to step 3 — it already carries
     `.route`, `.risk` (gates nested) and, when the facts were declared,
     `.execution`. Re-running the call is forbidden.

     Only when the brief carried none: resolve it in **one call**. First derive
     the `policy.json` risk inputs you can evidence from the request and the repo;
  ```

- [ ] **Step 7: Add the prohibition to the override-authority section.**

  In `agents/router.md`'s `## Override authority`, extend the `What you MUST NOT do:` list with:

  ```markdown
  re-run the `resolve` call for a prompt whose answer your brief already carries
  ```

- [ ] **Step 8: Prove the mirrors still hold.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && node dist/engineos.cjs validate
  ```

  Expected: `failed 0`. C36 resolves `/engineos:route` and every other command reference in the two router files; the agent-registry drift guard is untouched because `agents/router.md`'s frontmatter did not change.

- [ ] **Step 9: Commit.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos
  git add commands/route.md agents/router.md
  git commit -m "perf(route): return the kernel answer directly, dispatch only the residue

/engineos:route resolved the kernel and then always dispatched the router, which
resolved the same facts again. It now renders the deterministic plan itself when
escalate and ambiguous are both false, and carries the existing answer into the
dispatch when they are not. The router agent is forbidden from re-resolving a
prompt its brief already answers.

The call also moves to the taskContract form, so one resolve answers route, risk,
gates and decision rules together.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 7: The audit inventory — a deterministic answer for which domains a repository carries

`/engineos:audit all` launches seven design-tier agents whatever the repository contains, against a wave cap of six. The kernel can answer which domains actually have files, from `registries/routing.json`, using the same `routeByPath` the edit-time hook uses.

**Files:**
- `src/kernel/inventory.ts` (created)
- `src/kernel/inventory.test.ts` (created)
- `src/kernel/resolve.ts` (modified)
- `src/kernel/cli.ts` (modified)
- `src/kernel/resolve.test.ts` (modified)
- `registries/policy.json` (modified)
- `src/registry/policy.ts` (modified)
- `src/registry/policy.test.ts` (modified)
- `docs/COMPATIBILITY.md` (modified)

**Interfaces:**
- Consumes: `routeByPath` from `src/kernel/route.ts`; `Registries` from `src/kernel/context.ts`; `KernelError` from `src/lib/json.ts`; `policy.parallelism.wave_concurrency_cap` — the same number F1's `policyCapacity` publishes, never a second copy.
- Produces:
  ```ts
  export interface InventoryFacts {
    // The parsed `paths` payload and the repository root they are relative to.
    // Parsing the flag's string is the CLI's job; validating the shape is this
    // module's.
    paths: unknown;
    repoRoot: string;
  }
  export interface InventoryDomain {
    domain: string;
    files: number;
    agent: string | null;
    auditable: boolean;
  }
  export interface InventorySection {
    domains: InventoryDomain[];
    dispatch: string[];
    deferred: string[];
    capacity: number;
    scanned: number;
    truncated: boolean;
  }
  export function inventorySection(facts: InventoryFacts, regs: Registries): InventorySection;
  ```
  wired as `inventory?: InventoryFacts` on `DeclaredFacts` and `inventory?: InventorySection` on `Answer`, filled after `waves` and before the composed `task_contract` block — the same positional style F1 specifies for `execution`.

- [ ] **Step 1: Write the failing inventory test.**

  Create `src/kernel/inventory.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { KernelError } from '../lib/json';
  import { lazyRegistries, type Registries } from './context';
  import { resolveRoot } from '../registry/paths';
  import { inventorySection } from './inventory';

  const checkout = resolveRoot(process.env, __dirname);
  const regs: Registries = lazyRegistries(checkout);
  const REPO = '/tmp/some-project';

  test('a path list answers the domains it actually carries, with file counts', () => {
    const section = inventorySection(
      {
        repoRoot: REPO,
        paths: [
          'src/orders/orders.controller.ts',
          'src/orders/orders.service.ts',
          'web/components/Button.tsx',
          'db/migrations/0001_init.sql',
          'README.md',
        ],
      },
      regs,
    );
    assert.deepEqual(
      section.domains.map((row) => [row.domain, row.files]),
      [['backend', 2], ['dba', 1], ['frontend', 1]],
    );
    assert.equal(section.scanned, 5);
    assert.equal(section.truncated, false);
  });

  test('domains are ordered by file count descending, then by id in byte order', () => {
    const section = inventorySection(
      {
        repoRoot: REPO,
        paths: ['a/x.tsx', 'b/y.tsx', 'c/z.controller.ts'],
      },
      regs,
    );
    assert.deepEqual(section.domains.map((row) => row.domain), ['frontend', 'backend']);
  });

  test('dispatch is capped at the wave concurrency cap and the rest are deferred, never dropped', () => {
    const cap = regs.policy.parallelism.wave_concurrency_cap;
    const section = inventorySection(
      {
        repoRoot: REPO,
        paths: [
          'a/x.controller.ts', 'a/x.controller2.ts', 'a/x.controller3.ts',
          'b/y.tsx', 'b/y2.tsx',
          'c/z.sql',
          'd/Dockerfile',
          'e/mobile/app.native.ts',
          'f/prompts/system.md',
          'g/auth/guard.ts',
        ],
      },
      regs,
    );
    assert.equal(section.capacity, cap);
    assert.equal(section.dispatch.length, cap);
    assert.deepEqual(
      [...section.dispatch, ...section.deferred].sort(),
      section.domains.filter((row) => row.auditable).map((row) => row.domain).sort(),
    );
  });

  test('a domain with no audit coordinator is counted but never dispatched', () => {
    const section = inventorySection({ repoRoot: REPO, paths: ['src/orders/orders.spec.ts'] }, regs);
    const row = section.domains.find((d) => d.domain === 'test');
    assert.ok(row !== undefined, 'the test domain must be counted');
    assert.equal(row.auditable, false);
    assert.deepEqual(section.dispatch, []);
  });

  test('a path list over the registry cap is refused rather than silently truncated', () => {
    const max = regs.policy.audit.inventory.max_paths;
    const paths = Array.from({ length: max + 1 }, (_, i) => `src/f${String(i)}.controller.ts`);
    assert.throws(
      () => inventorySection({ repoRoot: REPO, paths }, regs),
      (error: unknown) =>
        error instanceof KernelError &&
        error.message === `inventory --paths carries ${String(max + 1)} paths, over the ${String(max)} declared in policy.json .audit.inventory.max_paths — narrow the audit with a scope`,
    );
  });

  test('a paths fact that is not an array is a KernelError, not an empty inventory', () => {
    assert.throws(
      () => inventorySection({ repoRoot: REPO, paths: 'src/a.ts' }, regs),
      (error: unknown) => error instanceof KernelError && /must be a JSON array/.test(error.message),
    );
  });

  test('an empty repoRoot is refused — every path would route from the filesystem root', () => {
    assert.throws(
      () => inventorySection({ repoRoot: '', paths: [] }, regs),
      (error: unknown) => error instanceof KernelError && /repoRoot must not be empty/.test(error.message),
    );
  });
  ```

- [ ] **Step 2: Run it and see it fail.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test kernel/inventory.test.js
  ```

  Expected failure: `tsc` exits non-zero with `error TS2307: Cannot find module './inventory'` and `error TS2339: Property 'audit' does not exist on type 'PolicyRegistry'`.

- [ ] **Step 3: Add the `.audit` block to `registries/policy.json`.**

  Insert after the `"context"` block:

  ```json
  "audit": {
    "note": "Scoped audit inventory. `engineos kernel resolve --facts '{\"inventory\": {...}}'` answers which routing domains a repository actually carries; commands/audit.md dispatches only those, capped at parallelism.wave_concurrency_cap (never a second copy of that number). --exhaustive restores the all-domain behavior. Mirrored in commands/audit.md.",
    "domains": ["backend", "frontend", "mobile", "dba", "devops", "llm", "security"],
    "inventory": {
      "max_paths": 5000
    }
  },
  ```

  In `src/registry/policy.ts`, add:

  ```ts
  export interface InventoryLimits { max_paths: number }
  export interface AuditPolicy { domains: string[]; inventory: InventoryLimits }
  ```

  add `audit: AuditPolicy;` to `PolicyRegistry`, and inside `loadPolicy`:

  ```ts
  const audit = requireRecord(p['audit'], '.audit');
  const auditInventory = requireRecord(audit['inventory'], '.audit.inventory');
  ```

  with the returned field after `context`:

  ```ts
  audit: {
    domains: requireStrings(audit['domains'], '.audit.domains'),
    inventory: { max_paths: requireNumber(auditInventory['max_paths'], '.audit.inventory.max_paths') },
  },
  ```

  Append a loader test to `src/registry/policy.test.ts`:

  ```ts
  test('the audit block declares the auditable domain set and the inventory cap', () => {
    const policy = loadPolicy(checkout);
    assert.equal(policy.audit.inventory.max_paths, 5000);
    assert.deepEqual(policy.audit.domains, ['backend', 'frontend', 'mobile', 'dba', 'devops', 'llm', 'security']);
  });
  ```

- [ ] **Step 4: Implement `inventorySection`.**

  Create `src/kernel/inventory.ts`:

  ```ts
  import { KernelError } from '../lib/json';
  import type { Registries } from './context';
  import { routeByPath } from './route';

  // Which routing domains a repository actually carries, so an audit dispatches
  // agents for the domains that exist instead of the domains that could exist.
  //
  // Each path contributes its ONE highest-precedence domain — the same answer
  // hooks/route-before-change.sh gets for that file — and the union over the
  // paths is the repository's domain set. Not every routed domain has an audit
  // coordinator (`test` routes to test-writer, the two release domains to the
  // store builders), so `auditable` marks the ones policy.audit.domains claims
  // and the others are counted but never dispatched.
  //
  // The cap is parallelism.wave_concurrency_cap, read here rather than copied:
  // a dispatch set wider than one wave is a plan the orchestrator cannot run.
  export interface InventoryFacts {
    // The parsed `paths` payload. Parsing the flag's string is the CLI's job;
    // validating the shape is this module's, because a list the kernel cannot
    // read is an inventory answered on input it did not understand.
    paths: unknown;
    repoRoot: string;
  }

  export interface InventoryDomain {
    domain: string;
    files: number;
    agent: string | null;
    auditable: boolean;
  }

  export interface InventorySection {
    domains: InventoryDomain[];
    dispatch: string[];
    deferred: string[];
    capacity: number;
    scanned: number;
    truncated: boolean;
  }

  export function inventorySection(facts: InventoryFacts, regs: Registries): InventorySection {
    if (facts.repoRoot === '') {
      throw new KernelError('inventory repoRoot must not be empty — every path would route from the filesystem root');
    }
    const max = regs.policy.audit.inventory.max_paths;
    const paths = parsePaths(facts.paths);
    if (paths.length > max) {
      throw new KernelError(
        `inventory --paths carries ${String(paths.length)} paths, over the ${String(max)} declared in policy.json .audit.inventory.max_paths — narrow the audit with a scope`,
      );
    }
    const counts = new Map<string, number>();
    for (const path of paths) {
      // Absolute, because routeByPath's self-dir exclusions compare against the
      // checkout root and its globs are anchored with a leading slash.
      const answer = routeByPath(`${facts.repoRoot}/${path}`, regs, facts.repoRoot);
      if (answer.domain === null) continue;
      counts.set(answer.domain, (counts.get(answer.domain) ?? 0) + 1);
    }
    const auditable = new Set(regs.policy.audit.domains);
    const domains: InventoryDomain[] = [...counts.entries()]
      .map(([domain, files]) => ({
        domain,
        files,
        agent: regs.routing.domains.find((d) => d.id === domain)?.agent ?? null,
        auditable: auditable.has(domain),
      }))
      .sort(byFilesThenId);
    const capacity = regs.policy.parallelism.wave_concurrency_cap;
    const candidates = domains.filter((row) => row.auditable).map((row) => row.domain);
    return {
      domains,
      dispatch: candidates.slice(0, capacity),
      // Deferred, never dropped: a domain the repository carries and this wave
      // cannot hold is a fact the audit report must state.
      deferred: candidates.slice(capacity),
      capacity,
      scanned: paths.length,
      truncated: paths.length === max,
    };
  }

  // -------------------------------------------------------------------- internals

  function parsePaths(value: unknown): string[] {
    if (!Array.isArray(value)) throw new KernelError('inventory --paths must be a JSON array');
    const rows: unknown[] = value;
    return rows.map((raw, i) => {
      if (typeof raw !== 'string') throw new KernelError(`inventory --paths[${String(i)}] must be a string`);
      if (raw === '') throw new KernelError(`inventory --paths[${String(i)}] must not be empty`);
      return raw;
    });
  }

  function byFilesThenId(a: InventoryDomain, b: InventoryDomain): number {
    if (a.files !== b.files) return b.files - a.files;
    if (a.domain < b.domain) return -1;
    if (a.domain > b.domain) return 1;
    return 0;
  }
  ```

- [ ] **Step 5: Wire the fact into `resolve` and the CLI.**

  In `src/kernel/resolve.ts`, add the import beside the others:

  ```ts
  import { inventorySection, type InventoryFacts, type InventorySection } from './inventory';
  ```

  add `inventory?: InventoryFacts;` to `DeclaredFacts` after `waves`, add `inventory?: InventorySection;` to `Answer` after `waves`, and add the fill after the `waves` block:

  ```ts
  if (facts.inventory !== undefined) {
    answer.inventory = inventorySection(facts.inventory, ctx.registries);
  }
  ```

  In `src/kernel/cli.ts`'s `parseFacts`, add the case after `waves`:

  ```ts
      // `paths` travels unread for the same reason `waves.units` does; the
      // inventory section owns what a well-formed list is. `repoRoot` is read
      // here because a missing one is a malformed fact, not a bad path list.
      case 'inventory': facts.inventory = inventoryFacts(factRecord(key, value)); break;
  ```

  and the helper beside `admitFacts`:

  ```ts
  function inventoryFacts(row: Record<string, unknown>): InventoryFacts {
    return { paths: row['paths'], repoRoot: factString('inventory.repoRoot', row['repoRoot']) };
  }
  ```

  with `import type { InventoryFacts } from './inventory';` added to the imports.

- [ ] **Step 6: Add the sparse-facts test.**

  Append to `src/kernel/resolve.test.ts`:

  ```ts
  test('an inventory fact answers the inventory key and nothing else', () => {
    const answer = resolve({ inventory: { repoRoot: '/tmp/p', paths: ['a/x.controller.ts'] } }, ctx);
    assert.deepEqual(Object.keys(answer), ['inventory']);
    assert.deepEqual(answer.inventory?.dispatch, ['backend']);
  });

  test('no inventory fact answers no inventory key', () => {
    const answer = resolve({ workType: 'implementation' }, ctx);
    assert.equal('inventory' in answer, false);
  });
  ```

- [ ] **Step 7: Run both suites and see them pass.**

  ```bash
  npx tsc -p tsconfig.json && cd build && node --test kernel/inventory.test.js kernel/resolve.test.js registry/policy.test.js
  ```

  Expected: PASS — the seven inventory tests, the two new resolve tests and the new loader test all green, `fail 0`.

- [ ] **Step 8: Verify the end-to-end call.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && npm run build
  ./scripts/kernel.sh resolve --facts '{"inventory": {"repoRoot": "/tmp/p", "paths": ["src/a.controller.ts", "web/b.tsx", "db/migrations/c.sql"]}}'
  ```

  Expected: JSON with one `inventory` key whose `domains` is `backend`, `dba`, `frontend` (one file each, byte order after the count tie), `dispatch` names those three, `deferred` is empty, `capacity` is 6, `scanned` is 3, `truncated` is false.

- [ ] **Step 9: Record the surface and commit.**

  In `docs/COMPATIBILITY.md`, add `inventory` to the sentence listing the facts `engineos kernel resolve --facts` accepts, and add to the 2.0 change table:

  ```markdown
  | `engineos kernel resolve --facts '{"inventory": {"repoRoot": "...", "paths": [...]}}'` | new declared fact answering a new `inventory` key: which routing domains a path list carries, which of them `/engineos:audit` dispatches, and which are deferred past the wave cap | added |
  ```

  ```bash
  cd /Users/ricardofagmer/projects/engineos && npm test && node dist/engineos.cjs validate
  git add src/kernel/inventory.ts src/kernel/inventory.test.ts src/kernel/resolve.ts src/kernel/resolve.test.ts src/kernel/cli.ts registries/policy.json src/registry/policy.ts src/registry/policy.test.ts docs/COMPATIBILITY.md dist/engineos.cjs
  git commit -m "feat(kernel): answer which domains a repository actually carries

A new inventory fact on the resolve arm routes a path list through routeByPath
and returns the domain set with file counts, the dispatch set capped at
parallelism.wave_concurrency_cap, and the deferred remainder. Domains with no
audit coordinator are counted and marked unauditable rather than dropped.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 8: `/engineos:audit` scoped dispatch

The command's `all` row launches seven agents against a cap of six, whatever the repository holds. It becomes: inventory first, dispatch what exists, `--exhaustive` for the old behavior.

**Files:**
- `commands/audit.md` (modified)

**Interfaces:**
- Consumes: the `inventory` answer from Task 7 (`domains`, `dispatch`, `deferred`, `capacity`, `scanned`, `truncated`); `registries/policy.json` `.audit.domains`.
- Produces: no code surface.

- [ ] **Step 1: Add the `--exhaustive` flag to the argument contract.**

  Before (lines 3 and 7-10):

  ```markdown
  argument-hint: <domain|all> [scope]
  ```
  ```markdown
  You are the EngineOS audit orchestrator. Run a **read-only** audit. Arguments:
  `$ARGUMENTS` — first token is the domain
  (`backend|frontend|mobile|dba|devops|llm|security|all`), the rest is an optional
  scope (paths/services/namespaces).
  ```

  After:

  ```markdown
  argument-hint: <domain|all> [scope] [--exhaustive]
  ```
  ```markdown
  You are the EngineOS audit orchestrator. Run a **read-only** audit. Arguments:
  `$ARGUMENTS` — first token is the domain
  (`backend|frontend|mobile|dba|devops|llm|security|all`), the rest is an optional
  scope (paths/services/namespaces), plus an optional `--exhaustive` flag.

  `all` means **every domain the repository actually carries**, discovered by a
  cheap inventory pass. `all --exhaustive` means every domain in the table
  regardless, which is the 1.x behavior and is now an explicit choice: it
  launches seven design-tier agents against a wave concurrency cap of six, so it
  always costs at least two waves.
  ```

- [ ] **Step 2: Insert the inventory step.**

  Between step 1 (`**Parse** domain + scope`) and step 2 (`**Select agents** by domain`), insert:

  ```markdown
  2. **Inventory the repository — one kernel call.** Skip this step when the
     first token named a single domain, or when `--exhaustive` was passed.

     Resolve the EngineOS install root the same way `commands/route.md` step 1
     does, then ask the kernel which domains the repository carries. `git
     ls-files` is the path source because it is already the repository's own
     index — no directory walk, no `.gitignore` reimplementation:

     ```bash
     "$ENGINEOS_ROOT"/scripts/kernel.sh resolve --facts "$(git -C "$REPO_ROOT" ls-files | node -e '
       const paths = require("node:fs").readFileSync(0, "utf8").split("\n").filter((line) => line !== "").slice(0, 5000);
       process.stdout.write(JSON.stringify({ inventory: { repoRoot: process.argv[1], paths } }));
     ' -- "$REPO_ROOT")"
     ```

     `5000` is `registries/policy.json` `.audit.inventory.max_paths`; the kernel
     refuses a longer list rather than truncating one silently, so the `slice`
     and the registry cap are the same number on purpose.

     The answer's `.inventory` carries:

     | Field | Use |
     |---|---|
     | `domains` | every routed domain with its file count, `agent` and `auditable` flag |
     | `dispatch` | the domains to audit, already capped at `capacity` |
     | `deferred` | auditable domains the cap pushed out — name them in the report |
     | `capacity` | the wave concurrency cap (6) |
     | `scanned` / `truncated` | how many paths were considered, and whether the cap was hit |

     Print one line before dispatching:

     `[audit] inventory — scanned <scanned> paths, domains=<dispatch joined> deferred=<deferred joined or none>`

     If `truncated` is `true`, say so and recommend a scope: the domain set was
     derived from the first 5000 tracked paths, not from all of them.

     On a non-zero exit, fall back to `--exhaustive` behavior and say that the
     inventory was unavailable. An audit that silently narrows itself because a
     command failed is worse than one that costs an extra wave.
  ```

  Renumber the subsequent steps 2-6 to 3-7.

- [ ] **Step 3: Rewrite the agent-selection table's `all` row.**

  Before (line 32):

  ```markdown
  | all      | the six domain coordinators — backend, frontend, mobile, dba, devops, llm — plus security-reviewer (add leaves only if scope names that domain) |
  ```

  After:

  ```markdown
  | all      | the agents of the domains `.inventory.dispatch` names, in that order (add leaves only if scope names that domain). With `--exhaustive`: all seven — the six domain coordinators backend, frontend, mobile, dba, devops, llm, plus security-reviewer — which exceeds the cap of 6 and therefore runs in two waves |
  ```

- [ ] **Step 4: Make the dispatch step honor the cap.**

  In the renumbered step 4 (`**Dispatch in parallel** via the Task tool`), append:

  ```markdown
     **Never exceed `.inventory.capacity` agents in one message.** The inventory
     already capped `dispatch`; `--exhaustive` does not, so split its seven into
     two waves and integrate at the barrier. A wave wider than the cap is not
     faster — it is the same work with the backpressure answer ignored
     (`rules/parallelism.md`).
  ```

- [ ] **Step 5: Carry the deferred domains into the report.**

  In the renumbered step 6 (`**Write the report**`), append:

  ```markdown
     The report opens with what was and was not audited: the domains dispatched,
     the domains `deferred` past the cap, and — when the inventory ran — the
     domains the repository does not carry at all. A report that does not say
     what it skipped reads as full coverage.
  ```

- [ ] **Step 6: Add the rule.**

  Append to `commands/audit.md`'s `## Rules`:

  ```markdown
  - **Default to what exists, not to everything.** A coordinator dispatched at
    design tier against a domain with no files burns a full agent turn to report
    that there is nothing to report. `--exhaustive` remains available and is
    never chosen on the orchestrator's own initiative.
  ```

- [ ] **Step 7: Prove the mirrors hold and commit.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && node dist/engineos.cjs validate
  ```

  Expected: `failed 0` — C36 resolves every `/command` token in the file, and `.audit.domains` matches the domain vocabulary the table names.

  ```bash
  cd /Users/ricardofagmer/projects/engineos
  git add commands/audit.md
  git commit -m "perf(audit): inventory the repository before dispatching

/engineos:audit all launched seven design-tier agents against a wave cap of six
whatever the repository contained. It now resolves the inventory fact once and
dispatches only the domains that have files, within the cap, naming what it
deferred. --exhaustive restores the old behavior as an explicit choice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 9: Consume Wave 5's `SessionMetadata` on the route path

F5 is Wave 5's to implement. Wave 4 consumes it at the protocol boundary — the two commands take `repoRoot` and `bypassActive` from the session record when it exists — and never imports or restates the interface.

**Files:**
- `commands/route.md` (modified)
- `commands/audit.md` (modified)
- `docs/COMPATIBILITY.md` (modified)

**Interfaces:**
- Consumes: `SessionMetadata` (F5, owner Wave 5) — the fields `repoRoot: string` and `bypassActive: boolean` only. Wave 4 declares no copy of the interface and adds no TypeScript import against it; the record reaches these commands as a file Wave 5 writes.
- Produces: no code surface.

- [ ] **Step 1: Make `/route`'s root resolution prefer the session record.**

  In `commands/route.md` step 1, immediately before the `ENGINEOS_ROOT=""` fence, insert:

  ```markdown
     The session metadata record (Wave 5, program plan F5) already answers
     `repoRoot` and `bypassActive` for this session, written once at SessionStart
     under the worktree Git directory. Read it first and use the symlink walk
     below only when it is absent or its session does not match — a cache miss
     recomputes, it never serves a stale answer as fresh:

     ```bash
     SESSION_META="$(git rev-parse --git-dir 2>/dev/null)/engineos-telemetry/${CLAUDE_SESSION_ID:-unknown}.session.json"
     [ -f "$SESSION_META" ] && node -e '
       const m = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
       process.stdout.write(`${m.repoRoot}\t${String(m.bypassActive)}\n`);
     ' -- "$SESSION_META"
     ```

     When it prints `true` for `bypassActive`, EngineOS is off for this session:
     say `[engineos] bypassed`, do not route, and stop. When the file is absent,
     continue below and check the bypass flag the way `hooks/prompt-advisor.sh`
     does.
  ```

- [ ] **Step 2: Make `/audit`'s inventory read `repoRoot` from the same record.**

  In `commands/audit.md`'s inventory step, immediately before the `scripts/kernel.sh resolve` fence, insert:

  ```markdown
     `$REPO_ROOT` is `repoRoot` from the session metadata record (program plan
     F5), which SessionStart resolved once. Fall back to
     `git rev-parse --show-toplevel` when the record is absent. Do not run the
     discovery when the record answers it — repeating a resolved fact per command
     is exactly the repeated Git discovery F5 exists to remove.
  ```

- [ ] **Step 3: Record the dependency.**

  In `docs/COMPATIBILITY.md`'s 2.0 change table, add:

  ```markdown
  | `commands/route.md`, `commands/audit.md` | read `repoRoot` and `bypassActive` from the SessionStart metadata record when it exists, falling back to Git discovery when it does not | changed |
  ```

- [ ] **Step 4: Prove nothing broke and commit.**

  ```bash
  cd /Users/ricardofagmer/projects/engineos && node dist/engineos.cjs validate && npm test
  ```

  Expected: `failed 0` from the validator and a green suite. No `src/` file changed in this task, so `dist/engineos.cjs` does not move.

  ```bash
  cd /Users/ricardofagmer/projects/engineos
  git add commands/route.md commands/audit.md docs/COMPATIBILITY.md
  git commit -m "perf(route): read repoRoot and bypass from the session metadata record

Both commands rediscovered the repository root and the bypass state per
invocation. They now take them from the SessionStart record (program plan F5,
owned by Wave 5) and fall back to Git discovery only when it is absent. Wave 4
consumes the interface; it declares no copy of it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

## Wave 4 barrier exit criteria

From the program plan's "Barrier exit criteria", plus this wave's own measurable claim:

- [ ] All nine tasks checked off, each with its own commit.
- [ ] `npm run build && npm run typecheck && npm test` green, output shown.
- [ ] `node dist/engineos.cjs validate` green — 69 checks, `failed 0`, C38 among them.
- [ ] `node dist/engineos.cjs bench` green with six budget rows, both byte rows under 32000. Record the measured `codex context` value in the handoff.
- [ ] `dist/engineos.cjs` rebuilt and committed.
- [ ] `docs/COMPATIBILITY.md` carries the gen target, the bench row, the `inventory` fact, the `AGENTS.md` generation change and the session-record reads.
- [ ] CI's adapter-context drift guard passes on a clean tree.
- [ ] A handoff written per `templates/handoff.md` naming: the measured before (60,515) and after byte totals; that Wave 5 owns `SessionMetadata` and Tasks 1 and 9 consume it at the protocol boundary only; and that `commands/route.md` step 3's `execution` rendering is dark until Wave 2's facts are declared by a caller.
