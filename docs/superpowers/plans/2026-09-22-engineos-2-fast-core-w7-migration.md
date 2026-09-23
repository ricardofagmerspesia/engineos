# EngineOS 2.0 Fast Core — Wave 7: migration and integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the EngineOS 2.0 program. Inventory every 1.x public surface as retained, replaced or removed; publish the migration guide, the release notes and the consumer examples; make the installer refuse a mixed-version layout out loud; remove the approved 1.x surface with a test per removal proving the old path now fails loudly; and pass the release gate with its high-risk additions.

**Architecture:** Wave 7 owns no new runtime behavior. It owns three things the other six waves cannot own: the *account* of what changed (`docs/COMPATIBILITY.md`, `docs/migrations/1.x-to-2.0.md`, `docs/release-notes/2.0.0.md`), the *enforcement* that the account stays true (a new validator check, installer refusal, removal tests), and the *gate* that ships it (build, lint, typecheck, tests, evals, validator, packaged artifact, startup smoke, `critic`, `security-reviewer`, recorded human approval). Every fact this wave writes down is derived from an artifact an earlier wave produced — never invented here.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), esbuild to committed CJS bundles, JSON registries, Node built-in test runner (`node --test`), node >= 18.

**Spec:** [docs/specs/2026-09-22-engineos-2-fast-core-design.md](../../specs/2026-09-22-engineos-2-fast-core-design.md) — sections "Compatibility and migration", "Verification strategy", "Delivery waves".

**Program plan:** [2026-09-22-engineos-2-fast-core-00-program.md](2026-09-22-engineos-2-fast-core-00-program.md) — its "Global Constraints", "Wave map", "Frozen interfaces" F1-F7 and "Barrier exit criteria" are frozen contracts. This wave integrates all of them.

---

## Global Constraints

Every task's requirements implicitly include this section. It restates the program's constraints plus the four a Wave 7 implementer trips on specifically.

### Program constraints (verbatim from the program plan)

- Node floor `>=18`. TypeScript `strict` with `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`. `rootDir: src`, `outDir: build`.
- No `any`. Unknown input is `unknown`, narrowed immediately. No type assertions (`as`) to silence an error.
- One `import` statement per module — never split symbols from the same source across lines.
- `Number.parseInt` / `Number.parseFloat`, never the globals.
- Explicit return types on every exported function.
- Tests colocated: `src/<area>/<name>.test.ts` beside `src/<area>/<name>.ts`. E2E tests are `*.e2e.test.ts`.
- Commands: build `npm run build`; typecheck `npm run typecheck`; lint `npm run lint`; full suite `npm test`.
- Single test file: `npx tsc -p tsconfig.json && cd build && node --test <area>/<name>.test.js` — the compiled path drops `src/` because `rootDir` is `src`.
- `dist/*.cjs` are committed build artifacts. Rebuild and commit them in any task that changes `src/`.
- All identifiers, comments and messages in English. No emojis anywhere. Comments say WHY, never WHAT.
- No placeholders, stubs or fake data on any reachable path.
- Conventional Commits. PRs at most 400 lines changed; stack them rather than growing one.
- Tests ARE in scope for this wave.

### The four a Wave 7 implementer trips on

1. **A rename is still a deprecation with a window — unless this program explicitly approved the break.** The approved 2.0 breaks are exactly: (a) the bash entry points `docs/COMPATIBILITY.md` `## 1.7.0 additions` marks `removed in 2.0`, and (b) whatever an earlier wave recorded in its own `docs/COMPATIBILITY.md` entry as removed or replaced. Anything else found during this wave that looks removable is **out of scope** — report it, do not remove it.
2. **Every removal still gets inventoried.** The spec's non-goal is explicit: "EngineOS 2.0 may remove deprecated surface, but every removal must appear in the migration inventory." A removal with no `docs/COMPATIBILITY.md` row is a defect even when the removal itself was approved. Task 3 turns that from a convention into a failing check.
3. **You are reading artifacts, not remembering them.** Waves 1-6 produce the handoffs and `docs/COMPATIBILITY.md` entries this wave classifies. Every step below that depends on an earlier wave's outcome names the file it reads. If that file is absent, the barrier is not reached — stop and report `BLOCKED`, do not guess the content.
4. **The release ships as stacked PRs.** Each task below is one commit and the PR boundaries are marked. No task's diff approaches 400 lines; when one would, it is already split.

---

## File Structure

| File | Created or modified | Single responsibility |
|---|---|---|
| `docs/COMPATIBILITY.md` | modified (Tasks 1, 2, 8, 9, 11) | The versioned public-surface contract. Gains `## 2.0 surface inventory` classifying every 1.x surface as retained, replaced or removed. |
| `docs/migrations/1.x-to-2.0.md` | created (Task 4) | The upgrade instructions: command, registry, rule and adapter mappings, one table per family, each row saying what a consumer edits. |
| `src/checks/compatibility.ts` | created (Task 3) | Check C38 — the 2.0 inventory is complete and does not contradict the tree. |
| `src/checks/compatibility.test.ts` | created (Task 3) | Planted-breakage cases for C38, asserting on finding codes. |
| `src/checks/ids.ts` | modified (Task 3) | Registers the id `C38`. |
| `src/checks/index.ts` | modified (Task 3) | Registers `COMPATIBILITY_CHECKS` in the family list. |
| `src/install/legacy-layout.ts` | created (Task 5) | Pure detection of a 1.x install layout from settings + a filesystem predicate. No I/O of its own. |
| `src/install/legacy-layout.test.ts` | created (Task 5) | Unit cases for each legacy kind and for the clean-install negative. |
| `src/install/cli.ts` | modified (Task 6) | Refuses a detected 1.x layout with exit 3 and the remedies, unless `--migrate-legacy` is passed. |
| `src/install/install-hooks.e2e.test.ts` | modified (Task 6) | End-to-end proof that a mixed-version install cannot happen silently. |
| `install.sh` | modified (Tasks 6, 9) | Passes the migration flag through; drops `ENGINEOS_HOOK_LIBRARIES` when the frozen bash libraries go. |
| `install.ps1` | modified (Task 6) | The PowerShell mirror of the same refusal. |
| `src/compat/facade.ts` | created (Task 7) | The per-command facade decision table for the 2.0 line, with the reason each name is or is not behaviour-facaded. |
| `src/compat/facade.test.ts` | created (Task 7) | Asserts every documented 2.0 command has a decision and that no name is facaded whose 1.x behaviour is the removed bottleneck. |
| `src/compat/removed.ts` | created (Task 8) | The removed-surface roster the loud-failure tests and C38 both read. |
| `src/compat/removed.e2e.test.ts` | created (Task 8) | One case per removal: invoking the old surface fails loudly rather than silently doing nothing. |
| `src/init/project.ts` | modified (Task 9) | `REQUIRED_SIBLINGS` loses the two frozen bash scaffold files. |
| `src/checks/agents-skills.ts` or the module owning C30 | modified (Task 9) | C30's hook-library arm goes with the libraries it guarded. |
| `docs/examples/task-contract-claude.md` | created (Task 10) | A runnable Claude-adapter example of loading and consuming a task contract. |
| `docs/examples/task-contract-codex.md` | created (Task 10) | The same for the Codex adapter's compact entry point. |
| `docs/release-notes/2.0.0.md` | created (Task 11) | The 2.0 release page: breaking changes first, each with its migration step. |
| `docs/release-notes/README.md` | modified (Task 11) | The index row for 2.0.0. |
| `.claude-plugin/plugin.json` | modified (Task 11) | MAJOR version bump to `2.0.0`. |
| `scripts/package-release.sh` | modified (Task 12) | The path allowlist loses the removed bash entry points and gains the new bundles. |
| `src/release/smoke.ts` | created (Task 12) | Startup smoke check over the packaged artifact: unzip, run each bundle's version arm, assert exit 0. |
| `src/release/smoke.e2e.test.ts` | created (Task 12) | Proves the smoke check fails when a bundle is missing from the package. |
| `.engineos/changes/<id>-engineos-2-0-release.md` | created (Task 14) | The change record, including `## Human decisions` with the recorded approval and reason ids. |
| `docs/specs/2026-09-22-engineos-2-fast-core-barrier7-handoff.md` | created (Task 14) | The final handoff per `templates/handoff.md`. |

---

## PR boundaries

The release ships as seven stacked PRs, each independently reviewable and buildable, none near 400 lines:

| PR | Tasks | Subject |
|---|---|---|
| 1 | 1, 2 | `docs(compat): inventory the 2.0 public surface` |
| 2 | 3 | `feat(validate): C38 asserts the 2.0 inventory is complete` |
| 3 | 4 | `docs(migrations): 1.x to 2.0 upgrade guide` |
| 4 | 5, 6 | `feat(install): refuse a 1.x layout instead of mixing versions` |
| 5 | 7 | `feat(compat): per-command facade decisions for the 2.0 line` |
| 6 | 8, 9 | `feat!: remove the bash entry points deprecated in 1.7.0` |
| 7 | 10, 11, 12 | `docs(release): 2.0.0 notes, consumer examples, packaged-artifact smoke` |

Tasks 13 and 14 are the gate and the record; they add no code and land on the release branch after PR 7 merges.

---

### Task 1: Intake the six wave handoffs and open the 2.0 surface inventory

**Files:**
- `docs/COMPATIBILITY.md` (modified)

**Interfaces:**
- **Consumes:** `docs/specs/2026-09-22-engineos-2-fast-core-barrier1-handoff.md` through `-barrier6-handoff.md` (written per `templates/handoff.md` by Waves 1-6 at their barriers); the `## Unreleased` section of `docs/COMPATIBILITY.md` as each wave left it; `docs/superpowers/plans/2026-09-22-engineos-2-fast-core-00-program.md` sections "Frozen interfaces" F1-F7 and "Barrier exit criteria".
- **Produces:** a new `## 2.0 surface inventory` section in `docs/COMPATIBILITY.md` holding the intake table and the first five surface-family tables (rule paths, agent names and aliases, command names, skill directories, registry keys).

- [ ] **Step 1: Locate all six handoffs and refuse to proceed without them.** Run:
  ```bash
  ls docs/specs | grep engineos-2-fast-core
  ```
  Expect six files matching `*-barrier<N>-handoff.md` for N in 1..6. If a wave wrote its handoff at another path, find it with `grep -rl "engineos-2-fast-core" docs/specs docs/superpowers`. If any barrier's handoff is missing, stop: report `BLOCKED` naming the missing barrier. Do not infer a wave's outcome from its plan — a plan says what was intended, a handoff says what landed.

- [ ] **Step 2: Read each handoff's `## Files` and `## Not done` sections and record the intake.** For each barrier N, read only those two sections plus `## Known failures and open risks`. Append to `docs/COMPATIBILITY.md`, after the existing `## Unreleased` section:
  ```markdown
  ## 2.0 surface inventory

  EngineOS 2.0 is a MAJOR release. Unlike `## 1.6.0 additions` and
  `## 1.7.0 additions`, this section removes and replaces public surface, so the
  **Checklist for a breaking change** above applies to every row marked
  `removed` or `replaced`.

  Every row below is derived from a wave barrier handoff, named in the table
  that follows. A surface nobody's handoff mentions is not silently retained:
  it is listed as `retained` with its handoff column reading `unchanged`, which
  is a claim a reviewer can check.

  ### Derivation

  | Wave | Barrier handoff read | Surfaces it touched |
  |---|---|---|
  | 1 | `docs/specs/2026-09-22-engineos-2-fast-core-barrier1-handoff.md` | <from that file's `## Files`> |
  | 2 | `docs/specs/2026-09-22-engineos-2-fast-core-barrier2-handoff.md` | <from that file's `## Files`> |
  | 3 | `docs/specs/2026-09-22-engineos-2-fast-core-barrier3-handoff.md` | <from that file's `## Files`> |
  | 4 | `docs/specs/2026-09-22-engineos-2-fast-core-barrier4-handoff.md` | <from that file's `## Files`> |
  | 5 | `docs/specs/2026-09-22-engineos-2-fast-core-barrier5-handoff.md` | <from that file's `## Files`> |
  | 6 | `docs/specs/2026-09-22-engineos-2-fast-core-barrier6-handoff.md` | <from that file's `## Files`> |
  ```
  Fill each `Surfaces it touched` cell with the public-surface paths that handoff's `## Files` table actually lists — rule paths, `registries/*.json` keys, `commands/*.md`, `skills/*/`, `hooks/hooks.json`, `dist/*.cjs`, `src/cli.ts`. Ignore `src/**` files that are not one of those: internals are not surface (`## What is public surface`, "Not public surface" paragraph).

- [ ] **Step 3: Write the rule-paths table.** Enumerate the real files, do not recall them:
  ```bash
  ls rules/
  ```
  Nineteen files today. Append:
  ```markdown
  ### Rule paths (`rules/*.md`)

  | Surface | 2.0 status | Replacement or note |
  |---|---|---|
  ```
  One row per file `ls rules/` prints. Status is `retained` unless a barrier handoff's `## Files` names that path as deleted or renamed; then it is `removed` or `replaced` and the note carries the replacement path the handoff gives. Rule *prose* changes are not surface changes (`## What is public surface`), so a rule whose body Wave 2 rewrote to mirror the direct lane is still `retained`.

- [ ] **Step 4: Write the agent names and aliases table.** Enumerate:
  ```bash
  node -e "const a=require('./registries/agents.json');const r=Array.isArray(a)?a:(a.agents||[]);console.log(r.map(x=>x.name+' | '+(x.alias||'-')).join('\n'))"
  ```
  Twenty-two agents today. Append:
  ```markdown
  ### Agent names and aliases

  | Agent `name:` | Alias | 2.0 status | Note |
  |---|---|---|---|
  ```
  One row per agent. Status is `retained` unless a handoff names the agent file as deleted or its `name:`/alias as changed.

- [ ] **Step 5: Write the command-names table.** Enumerate:
  ```bash
  ls commands/ commands/agents/ | head -40
  ```
  Append:
  ```markdown
  ### Slash command names (`commands/`)

  | Command | 2.0 status | What changed |
  |---|---|---|
  | `/engineos:route` | retained, behaviour changed | The name and its arguments are unchanged. It no longer dispatches the router agent when the kernel reports no unresolved residue (spec section 6). See Task 7's facade table for why the 1.x always-dispatch behaviour is not preserved. |
  | `/engineos:audit` | retained, behaviour changed | The name is unchanged. The default is a scoped inventory; the 1.x all-domain fan-out is available as the explicit exhaustive mode. See Task 7. |
  ```
  Continue with one row per remaining file in `commands/` (`analyze-architecture`, `bypass`, `implement`, `init`, `talk-about-the-system`) and one row covering the generated `commands/agents/` set as a family. For each, take the `2.0 status` from the barrier handoff that names that command file; a command no handoff names is `retained` with `What changed` reading `unchanged`.

- [ ] **Step 6: Write the skill-directories and registry-keys tables.** Enumerate:
  ```bash
  ls skills/
  node -e "for (const f of require('node:fs').readdirSync('registries')) console.log(f, Object.keys(require('./registries/'+f)).join(','))"
  ```
  Append:
  ```markdown
  ### Skill directory names (`skills/`)

  | Skill directory | 2.0 status | Note |
  |---|---|---|

  ### Registry top-level keys (`registries/*.json`)

  | Registry | Top-level key | 2.0 status | Note |
  |---|---|---|---|
  ```
  Ten skills today. For registries, one row per top-level key of each file. `registries/policy.json` gains `.execution` from F2 — that row is `added` with the note `F2, Wave 2; see the wave 2 barrier handoff`. Take every other key's status from the handoff that names that registry file; a key no handoff names is `retained`.

- [ ] **Step 7: Verify the section parses and nothing else moved.**
  ```bash
  git diff --stat docs/COMPATIBILITY.md
  ```
  Expect one file changed, additions only, zero deletions. A deletion here means an existing section was disturbed — revert and re-apply as an append.

- [ ] **Step 8: Commit.**
  ```bash
  git add docs/COMPATIBILITY.md
  git commit -m "docs(compat): open the 2.0 surface inventory with rules, agents, commands, skills and registries

Derived from the six wave barrier handoffs, named in the derivation table.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 2: Inventory hooks, the return envelope, the bundles and the bench budgets

**Files:**
- `docs/COMPATIBILITY.md` (modified)

**Interfaces:**
- **Consumes:** `hooks/hooks.json`; the on-disk contents of `hooks/` and `dist/`; the Wave 5 barrier handoff (bundle split, F5); the Wave 1 barrier handoff (F6 lifecycle schema and the five existing budget names); `docs/COMPATIBILITY.md` `## 1.7.0 additions` (the roster of bash entry points marked `removed in 2.0`); the program plan's F7 table.
- **Produces:** four more tables under `## 2.0 surface inventory`: hook contracts and shim targets, the return envelope, `dist/` bundle names, bench budget names and the F7 CLI additions.

- [ ] **Step 1: Write the hook-contract table from the live file.**
  ```bash
  node -e "const h=require('./hooks/hooks.json').hooks;for(const[e,gs]of Object.entries(h))for(const g of gs)for(const k of g.hooks)console.log(e,'|',g.matcher||'(any)','|',k.command)"
  ```
  Append to `docs/COMPATIBILITY.md` under `## 2.0 surface inventory`:
  ```markdown
  ### Hook event contract and shim targets

  | Event | Matcher | 1.x command | 2.0 command | Status |
  |---|---|---|---|---|
  ```
  One row per registered hook, `1.x command` copied byte-for-byte from the command the script above printed before this wave began. The `2.0 command` cell is taken from the Wave 5 barrier handoff's `## Files` entry for `hooks/hooks.json`: if Wave 5 repointed the hooks at a hook-only bundle, that is the new command and the status is `value change, backward compatible` for a consumer who re-runs the installer. If Wave 5's handoff shows `hooks/hooks.json` unchanged, the 2.0 cell equals the 1.x cell and the status is `retained`. Do not write the split bundle's name from the program plan's F5 sketch — read it out of `ls dist/` and the handoff.

- [ ] **Step 2: Write the shim-target row block.** List the bash entry points 1.7.0 deprecated:
  ```bash
  grep -n "removed in 2.0" docs/COMPATIBILITY.md
  ```
  Append:
  ```markdown
  ### Bash entry points deprecated in 1.7.0

  Every path below opened its deprecation window in 1.7.0 with removal declared
  for 2.0. This release closes that window. The removal itself lands in the
  commit Task 8 describes; this table is the inventory the removal is required
  to have.

  | Path | 1.7.0 status | 2.0 status | Call this instead |
  |---|---|---|---|
  ```
  One row per path the grep above reports, `Call this instead` naming the `engineos <subcommand>` form the 1.7.0 entry already documents for it.

- [ ] **Step 3: Write the return-envelope table.** The envelope's fields are declared by each agent file's `## Return format` section and by `registries/intents.json`. Enumerate the field names actually in use:
  ```bash
  grep -rhoE '^\s*(status|summary|files|evidence|out_of_scope|next_step|blocked_on):' agents/*.md | sort -u
  ```
  Append:
  ```markdown
  ### The `## Return format` envelope

  | Field | 2.0 status | Note |
  |---|---|---|
  ```
  One row per field the grep reports. Then add the `status` vocabulary as its own row: `OK | DEGRADED | BLOCKED | FAILED`, status taken from the Wave 3 barrier handoff — F4's `LaunchOutcome.status` reuses the same four words, so if Wave 3's handoff records no change to the vocabulary, the row is `retained` and says the scheduler consumes the same four values.

- [ ] **Step 4: Write the bundle-names table.**
  ```bash
  ls -la dist/
  ```
  Append:
  ```markdown
  ### Runtime entry points (`dist/*.cjs`)

  | Bundle | 2.0 status | What calls it |
  |---|---|---|
  | `dist/engineos.cjs` | retained | The documented facade. Every 2.0 subcommand name still resolves here (Task 7). |
  ```
  Add one row per additional `.cjs` file `ls dist/` prints, with `What calls it` taken from the Wave 5 barrier handoff's `## Files` table. If `ls dist/` shows only `engineos.cjs`, write exactly that one row and add a sentence saying the split described in the spec's section 5 did not land in this release — that is an honest inventory, and inventing three bundle names that do not exist is not.

- [ ] **Step 5: Write the bench-budget-names table.** The five names are public surface; read them from the source rather than from memory:
  ```bash
  grep -n "name: '" src/bench/run.ts
  ```
  Append:
  ```markdown
  ### Runtime performance budget names

  The five names below are read by the CI step "Runtime performance budgets"
  and by `ENGINEOS_PERF_MULTIPLIER` consumers. Renaming one is MAJOR.

  | Budget name | 2.0 status | Note |
  |---|---|---|
  | `route-intent` | retained | |
  | `resolve-task` | retained | |
  | `prompt-advisor (end to end)` | retained | |
  | `route-before-change (cache hit)` | retained | |
  | `always-on context` | retained | |
  ```
  Then append the rows for whatever `engineos bench lifecycle` and `engineos bench baseline --write` (F7, Wave 1) added, taking their names and their budget names from the Wave 1 barrier handoff and from `grep -n "name: '" src/bench/*.ts` as it stands now. F6 says the five existing names must not break; if the grep shows one of the five gone or renamed, that is a contract violation to report, not to inventory quietly.

- [ ] **Step 6: Write the F7 CLI-additions table.** Read the live command table:
  ```bash
  node -e "console.log(Object.keys(require('./build/cli.js')||{}))" 2>/dev/null || grep -n "^const table" -A 20 src/cli.ts
  ```
  Append:
  ```markdown
  ### Subcommands added by the 2.0 program

  | Command | Wave | Status |
  |---|---|---|
  | `engineos kernel execution --facts <json>` | 2 | added |
  | `engineos scheduler plan --units <json>` | 3 | added |
  | `engineos scheduler step --state <json> --event <json>` | 3 | added |
  | `engineos bench lifecycle` | 1 | added |
  | `engineos bench baseline --write` | 1 | added |
  ```
  For each of the five, confirm the arm actually exists before the row survives:
  ```bash
  node dist/engineos.cjs kernel execution --facts '{}' ; echo "exit=$?"
  node dist/engineos.cjs scheduler plan --units '[]' ; echo "exit=$?"
  node dist/engineos.cjs bench lifecycle --help ; echo "exit=$?"
  ```
  An arm that answers `unknown command` did not land. Change its row to `not shipped` and name the barrier handoff that says so. An inventory that lists a command the binary does not have is worse than no inventory.

- [ ] **Step 7: Commit.**
  ```bash
  git add docs/COMPATIBILITY.md
  git commit -m "docs(compat): inventory hooks, envelope, bundles, budgets and new CLI arms

Every row verified against the live tree; arms that did not ship are marked so.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 3: Check C38 — the 2.0 inventory is complete and does not contradict the tree

**Files:**
- `src/checks/compatibility.ts` (created)
- `src/checks/compatibility.test.ts` (created)
- `src/checks/ids.ts` (modified)
- `src/checks/index.ts` (modified)
- `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/CODEBASE_MAP.md` (modified — check-count literals, enforced by C37)

**Interfaces:**
- **Consumes:** `docs/COMPATIBILITY.md` `## 1.7.0 additions` (rows containing `removed in 2.0`) and `## 2.0 surface inventory`; the filesystem, through `CheckContext.exists`.
- **Produces:** check `C38` with findings `inventory-missing`, `removal-uninventoried`, `removal-contradicted`.

- [ ] **Step 1: Write the failing test.** Create `src/checks/compatibility.test.ts`:
  ```ts
  // C38: the 2.0 inventory has a row for every surface 1.7.0 declared "removed in
  // 2.0", and each row's claim agrees with what is on disk. The check exists
  // because the spec's non-goal permits removals only when they appear in the
  // migration inventory, and a convention nobody runs is not a permission
  // condition.
  import assert from 'node:assert/strict';
  import { test } from 'node:test';
  import type { Finding } from './findings';
  import { COMPATIBILITY_CHECKS } from './compatibility';
  import { checkoutCopy, contextFor, editFile, findingsOf } from './testing';

  const COMPAT = 'docs/COMPATIBILITY.md';

  function run(root: string): Finding[] {
    return findingsOf(COMPATIBILITY_CHECKS, 'C38', contextFor(root));
  }

  test('the checkout passes C38', () => {
    assert.deepEqual(run(checkoutCopy()), []);
  });

  test('a missing 2.0 inventory section is one finding, not one per surface', () => {
    const root = checkoutCopy();
    editFile(root, COMPAT, (text) => text.split('## 2.0 surface inventory')[0] ?? text);
    assert.deepEqual(run(root).map((f) => f.code), ['inventory-missing']);
  });

  test('a surface 1.7.0 marked removed in 2.0 with no inventory row fails', () => {
    const root = checkoutCopy();
    editFile(root, COMPAT, (text) =>
      text.replace(/^\| `scripts\/kernel\.sh` \| removed \|.*$/m, '| `scripts/kernel.sh` | pending | |'),
    );
    const found = run(root);
    assert.deepEqual(found.map((f) => f.code), ['removal-uninventoried']);
    assert.equal(found[0]?.subject, 'scripts/kernel.sh');
  });

  test('a row claiming removed while the file is still on disk fails', () => {
    const root = checkoutCopy();
    editFile(root, COMPAT, (text) =>
      text.replace(/^\| `hooks\/scaffold-layout\.sh` \| retained \|/m, '| `hooks/scaffold-layout.sh` | removed |'),
    );
    const found = run(root);
    assert.deepEqual(found.map((f) => f.code), ['removal-contradicted']);
    assert.equal(found[0]?.subject, 'hooks/scaffold-layout.sh');
  });
  ```

- [ ] **Step 2: Run it and state the expected failure.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test checks/compatibility.test.js
  ```
  Expected: tsc fails before any test runs, with `Cannot find module './compatibility'` — the module does not exist yet. That is the red.

- [ ] **Step 3: Write the minimal implementation.** Create `src/checks/compatibility.ts`:
  ```ts
  // Family `compatibility`: C38, the check that makes the spec's removal
  // permission enforceable. EngineOS 2.0 may remove deprecated surface only when
  // the removal appears in the migration inventory, and until this check existed
  // that condition was a sentence in a design document — true of a diff only if
  // a reviewer happened to look.
  //
  // The check derives both sides from files the tree already holds: the roster
  // of surfaces 1.7.0 declared "removed in 2.0", and the 2.0 inventory's own
  // rows. It never carries its own list of paths, because a second list is a
  // second thing to drift.
  import { finding, result, type CheckResult, type Finding } from './findings';
  import type { Check } from './index';
  import { skipOnce, type CheckContext } from './lib';

  export const C38_FINDINGS = ['inventory-missing', 'removal-uninventoried', 'removal-contradicted'] as const;

  declare module './codes' {
    interface CheckCodes {
      C38: (typeof C38_FINDINGS)[number];
    }
  }

  export const COMPATIBILITY_CHECKS: readonly Check[] = [{ id: 'C38', codes: C38_FINDINGS, run: checkC38 }];

  export const C38_TITLE = '2.0 inventory covers every declared removal';

  const COMPAT = 'docs/COMPATIBILITY.md';
  const INVENTORY_HEADING = '## 2.0 surface inventory';
  const DEPRECATION_HEADING = '## 1.7.0 additions';
  const REMOVAL_CLAIM = 'removed in 2.0';

  // A row is `| `token` | ... |`; the first backticked cell is the surface and
  // the first cell after it that is one of the three words is the status.
  const ROW = /^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/;
  const STATUS = /\b(retained|replaced|removed)\b/;

  export interface InventoryRow {
    readonly surface: string;
    readonly status: 'retained' | 'replaced' | 'removed';
  }

  export function inventoryRows(text: string, heading: string): InventoryRow[] {
    const start = text.indexOf(heading);
    if (start === -1) return [];
    const body = text.slice(start + heading.length);
    const end = body.search(/^## /m);
    const section = end === -1 ? body : body.slice(0, end);
    const rows: InventoryRow[] = [];
    for (const line of section.split('\n')) {
      const matched = ROW.exec(line);
      if (matched === null) continue;
      const surface = matched[1];
      const rest = matched[2];
      if (surface === undefined || rest === undefined) continue;
      const status = STATUS.exec(rest);
      if (status === null) continue;
      const word = status[1];
      if (word !== 'retained' && word !== 'replaced' && word !== 'removed') continue;
      rows.push({ surface, status: word });
    }
    return rows;
  }

  // The surfaces whose deprecation window 1.7.0 opened with removal declared for
  // this release. One row may name several paths in separate backticked runs, so
  // the scan is per token rather than per row.
  export function declaredRemovals(text: string): string[] {
    const start = text.indexOf(DEPRECATION_HEADING);
    if (start === -1) return [];
    const declared = new Set<string>();
    for (const line of text.slice(start).split('\n')) {
      if (!line.includes(REMOVAL_CLAIM)) continue;
      for (const token of line.matchAll(/`([^`]+)`/g)) {
        const path = token[1];
        if (path !== undefined && path.includes('/') && path.endsWith('.sh')) declared.add(path);
      }
    }
    return [...declared];
  }

  function checkC38(ctx: CheckContext): CheckResult[] {
    const text = ctx.readText(COMPAT);
    if (text === undefined) return skipOnce(ctx, 'C38', C38_TITLE, COMPAT);

    const findings: Finding[] = [];
    if (!text.includes(INVENTORY_HEADING)) {
      findings.push(finding('C38', 'inventory-missing', INVENTORY_HEADING));
      return [result('C38', C38_TITLE, findings)];
    }

    const inventory = new Map<string, InventoryRow['status']>();
    for (const row of inventoryRows(text, INVENTORY_HEADING)) inventory.set(row.surface, row.status);

    for (const path of declaredRemovals(text)) {
      const status = inventory.get(path);
      if (status === undefined) {
        findings.push(finding('C38', 'removal-uninventoried', path));
        continue;
      }
      const onDisk = ctx.exists(path);
      if (status === 'removed' && onDisk) findings.push(finding('C38', 'removal-contradicted', path));
      if (status !== 'removed' && !onDisk) findings.push(finding('C38', 'removal-contradicted', path));
    }

    return [result('C38', C38_TITLE, findings)];
  }
  ```

- [ ] **Step 4: Register the id and the family.** In `src/checks/ids.ts`, add `'C38',` after `'C37',` in `CHECK_IDS`. In `src/checks/index.ts`, add `import { COMPATIBILITY_CHECKS } from './compatibility';` to the family imports and `...COMPATIBILITY_CHECKS,` as the last entry of `CHECKS`.

- [ ] **Step 5: Run the test and state PASS.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test checks/compatibility.test.js
  ```
  Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 6: Fix the check-count literals C37 now fails on.** Get the real count:
  ```bash
  npm run build && node dist/engineos.cjs validate --list | wc -l
  ```
  Whatever integer that prints is the number. Update every literal C37 reads:
  ```bash
  grep -rn "[0-9]\+[- ]check" CLAUDE.md AGENTS.md README.md docs/CODEBASE_MAP.md
  ```
  Replace each stale integer with the printed one. Do not assume the previous value was 68 — Waves 2, 4 and 5 may have added checks of their own.

- [ ] **Step 7: Run the validator and the check-family suite.**
  ```bash
  node dist/engineos.cjs validate --only C37,C38
  npx tsc -p tsconfig.json && cd build && node --test checks/
  ```
  Expected: `ok   check-count claims equal the registered count`, `ok   2.0 inventory covers every declared removal`, `passed 2, failed 0`; and the compiled suite green.

- [ ] **Step 8: Commit.**
  ```bash
  git add src/checks/compatibility.ts src/checks/compatibility.test.ts src/checks/ids.ts src/checks/index.ts dist/ CLAUDE.md AGENTS.md README.md docs/CODEBASE_MAP.md
  git commit -m "feat(validate): C38 asserts the 2.0 inventory covers every declared removal

The spec permits removing deprecated surface only when the removal appears in
the migration inventory. C38 makes that a failing check instead of a convention.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 4: The 1.x to 2.0 migration guide

**Files:**
- `docs/migrations/1.x-to-2.0.md` (created)

**Interfaces:**
- **Consumes:** `docs/COMPATIBILITY.md` `## 2.0 surface inventory` (Tasks 1 and 2); the six barrier handoffs; `templates/adapters/README.md` and `templates/adapters/*.md` for the adapter mapping.
- **Produces:** the upgrade document a consuming repository follows, one table per surface family, every row an edit a consumer makes.

- [ ] **Step 1: Create the directory and the header.**
  ```bash
  mkdir -p docs/migrations
  ```
  Write `docs/migrations/1.x-to-2.0.md` starting with:
  ```markdown
  # Migrating from EngineOS 1.x to 2.0

  EngineOS 2.0 is a MAJOR release under `docs/COMPATIBILITY.md`. It removes
  surface whose deprecation window opened in 1.7.0 and changes the default
  behaviour of two slash commands without changing their names.

  **Who must act.** Any repository that (a) copied EngineOS hook entries into its
  own `settings.json`, (b) calls a `scripts/*.sh` or `hooks/*.sh` entry point from
  its own tooling or CI, or (c) depends on `/engineos:audit` fanning out to every
  domain by default. A repository that only references `rules/*.md` paths and
  invokes agents by name has nothing to change.

  **How long this takes.** One pass of the tables below, then one installer run.

  ## Before you start

  ```bash
  git -C <your engineos checkout> pull
  node --version        # must print v18 or newer
  ```

  ## 1. Command mappings
  ```

- [ ] **Step 2: Write the command mapping table.** Copy the rows from `docs/COMPATIBILITY.md` `### Bash entry points deprecated in 1.7.0` and `### Slash command names`, turning each into an edit:
  ```markdown
  | You call today | Call this in 2.0 | Why |
  |---|---|---|
  | `scripts/kernel.sh <arm> ...` | `node dist/engineos.cjs kernel <arm> ...` | The shim is removed; the answers are byte-identical. |
  ```
  One row per path the inventory marks `removed`. Then the two behaviour rows:
  ```markdown
  | `/engineos:route` | `/engineos:route` — unchanged invocation | It no longer dispatches the router agent when the kernel leaves no residue. If your workflow depended on a router agent always running, invoke the `router` agent directly. |
  | `/engineos:audit <domain>` | `/engineos:audit <domain>` — unchanged invocation | The default is scoped to the domains the repository actually contains. For the 1.x all-domain fan-out, pass the exhaustive flag documented in `commands/audit.md`. |
  ```
  Take the exhaustive flag's exact spelling from `commands/audit.md` as Wave 4 left it — read the file, do not copy the spec's prose.

- [ ] **Step 3: Write the registry mapping section.**
  ```markdown
  ## 2. Registry mappings

  | Registry | Key | 1.x | 2.0 | What to change |
  |---|---|---|---|---|
  ```
  One row per registry key the inventory marks `added`, `replaced` or `removed`. For `registries/policy.json` `.execution`, the row's `What to change` reads: `Nothing, unless you read policy.json directly. A consumer that lowers capacity may set .execution.direct_lane bounds tighter; it may never widen them, and it may never upgrade delegate or wave to direct (program plan F2).`

- [ ] **Step 4: Write the rule mapping section.**
  ```markdown
  ## 3. Rule mappings

  Rule *paths* are what your `CLAUDE.md` references, and no rule file was renamed
  or removed in 2.0 unless it appears below. Rule *prose* changed in several
  files; prose is not versioned surface, so a reference that resolved in 1.x
  still resolves.

  | Rule path | 2.0 | What to change |
  |---|---|---|
  ```
  Populate from the inventory's rule table, one row for each rule whose status is not `retained`. If every rule is `retained`, write one line saying so explicitly rather than leaving an empty table: `No rule path changed in 2.0.`

- [ ] **Step 5: Write the adapter mapping section.** Read `templates/adapters/README.md` and each `templates/adapters/*.md` first:
  ```bash
  ls templates/adapters/
  ```
  ```markdown
  ## 4. Adapter mappings

  The per-tool enforcement matrix lives in `templates/adapters/README.md`. What
  changed for each adapter in 2.0:

  | Adapter | Entry point in 1.x | Entry point in 2.0 | What to change |
  |---|---|---|---|
  | Claude Code | `CLAUDE.md` plus the always-on imports | unchanged | Nothing. |
  | Codex | `AGENTS.md` plus its imports | the generated compact entry point | Regenerate it; see `docs/examples/task-contract-codex.md`. |
  | Cursor | `templates/adapters/cursor.md` | | |
  | GitHub Copilot | `templates/adapters/github-copilot.md` | | |
  ```
  Fill the Codex row's 2.0 cell and the two empty rows from the Wave 4 barrier handoff's `## Files` table — it names the generated entry point and any adapter mirror it regenerated. If the handoff shows an adapter untouched, its `What to change` cell reads `Nothing.`

- [ ] **Step 6: Write the installer section and the verification section.**
  ```markdown
  ## 5. Run the installer

  ```bash
  cd <your engineos checkout>
  ./install.sh
  ```

  The installer detects a 1.x layout and refuses rather than mixing versions. If
  it refuses, it prints one line per finding and the flag that migrates them. Run
  it again with that flag once you have read the findings.

  ## 6. Verify the upgrade

  ```bash
  node dist/engineos.cjs validate
  node dist/engineos.cjs kernel resolve-task --prompt 'add a paginated orders endpoint'
  ```

  The first prints `passed N, failed 0`. The second prints a task contract whose
  `execution` section is present when you declared execution facts and absent
  when you did not — absent is `unresolved`, which is the documented default and
  not an error (program plan F1).
  ```

- [ ] **Step 7: Verify every path the guide names exists.**
  ```bash
  grep -oE '`[a-zA-Z0-9_./-]+\.(md|json|sh|cjs|ts)`' docs/migrations/1.x-to-2.0.md | tr -d '`' | sort -u | while read -r p; do [ -e "$p" ] || echo "MISSING: $p"; done
  ```
  Expected output: only the paths the guide deliberately names as removed. Any other `MISSING:` line is a typo — fix it. Removed paths are expected to be missing at the end of Task 8; before then they still exist, so run this again after Task 8 lands.

- [ ] **Step 8: Commit.**
  ```bash
  git add docs/migrations/1.x-to-2.0.md
  git commit -m "docs(migrations): 1.x to 2.0 upgrade guide

Command, registry, rule and adapter mappings, each row an edit a consumer makes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 5: Detect a 1.x install layout

**Files:**
- `src/install/legacy-layout.ts` (created)
- `src/install/legacy-layout.test.ts` (created)

**Interfaces:**
- **Consumes:** the parsed `~/.claude/settings.json` value, the plugin root path, and an injected `exists(relativePath) => boolean` predicate. No filesystem access of its own — the caller owns I/O, this module owns the decision.
- **Produces:** `detectLegacyLayout(input): LegacyFinding[]`, `LegacyFinding`, `LegacyKind`.

- [ ] **Step 1: Write the failing test.** Create `src/install/legacy-layout.test.ts`:
  ```ts
  // A 1.x layout is three observable things, and the installer must not proceed
  // past any of them: hook entries pointing at the removed .sh shims, a plugin
  // root carrying both the 2.0 bundles and the 1.x shims, and a commands symlink
  // whose target the release deleted. Detection is pure so the cases below need
  // no temporary HOME.
  import assert from 'node:assert/strict';
  import { test } from 'node:test';
  import { detectLegacyLayout, type LegacyKind } from './legacy-layout';

  const ROOT = '/plugins/engineos';

  function settingsWith(command: string): unknown {
    return { hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command }] }] } };
  }

  function kinds(found: readonly { kind: LegacyKind }[]): LegacyKind[] {
    return found.map((one) => one.kind);
  }

  test('a clean 2.0 install reports nothing', () => {
    const found = detectLegacyLayout({
      settings: settingsWith(`node "${ROOT}/dist/engineos.cjs" hook stop-verify`),
      pluginRoot: ROOT,
      exists: () => false,
    });
    assert.deepEqual(found, []);
  });

  test('a hook entry pointing at a removed .sh shim is a legacy finding', () => {
    const found = detectLegacyLayout({
      settings: settingsWith(`${ROOT}/hooks/stop-verify.sh`),
      pluginRoot: ROOT,
      exists: () => false,
    });
    assert.deepEqual(kinds(found), ['shim-hook-entry']);
    assert.equal(found[0]?.subject, 'hooks/stop-verify.sh');
    assert.match(found[0]?.remedy ?? '', /re-run the installer/);
  });

  test('a plugin root carrying both the bundle and a removed shim is a mixed install', () => {
    const found = detectLegacyLayout({
      settings: settingsWith(`node "${ROOT}/dist/engineos.cjs" hook stop-verify`),
      pluginRoot: ROOT,
      exists: (rel) => rel === 'scripts/kernel.sh',
    });
    assert.deepEqual(kinds(found), ['mixed-plugin-root']);
    assert.equal(found[0]?.subject, 'scripts/kernel.sh');
  });

  test('settings that are not an object are not a legacy layout', () => {
    assert.deepEqual(detectLegacyLayout({ settings: null, pluginRoot: ROOT, exists: () => false }), []);
    assert.deepEqual(detectLegacyLayout({ settings: 'x', pluginRoot: ROOT, exists: () => false }), []);
  });

  test('every finding carries a remedy a human can act on', () => {
    const found = detectLegacyLayout({
      settings: settingsWith(`${ROOT}/hooks/prompt-advisor.sh`),
      pluginRoot: ROOT,
      exists: (rel) => rel === 'scripts/validate-engineos.sh',
    });
    assert.equal(found.length, 2);
    for (const one of found) assert.notEqual(one.remedy, '');
  });
  ```

- [ ] **Step 2: Run it and state the expected failure.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test install/legacy-layout.test.js
  ```
  Expected: tsc fails with `Cannot find module './legacy-layout'`. That is the red.

- [ ] **Step 3: Write the minimal implementation.** Create `src/install/legacy-layout.ts`:
  ```ts
  // 1.x layout detection for the installer. Pure: the caller reads settings.json
  // and supplies an `exists` predicate, so every case below is a unit test rather
  // than a temporary HOME.
  //
  // Why refuse rather than silently fix: a mixed install is two EngineOS versions
  // answering the same hook event, and the one that wins is whichever the harness
  // reaches first. That is not a degraded install, it is an install whose
  // behaviour nobody can predict from the files on disk.
  import { isRecord } from '../lib/json';

  export type LegacyKind = 'shim-hook-entry' | 'mixed-plugin-root';

  export interface LegacyFinding {
    readonly kind: LegacyKind;
    readonly subject: string;
    readonly remedy: string;
  }

  export interface LegacyLayoutInput {
    readonly settings: unknown;
    readonly pluginRoot: string;
    exists(relativePath: string): boolean;
  }

  // The bash entry points 1.7.0 deprecated and 2.0 removes. Their presence in a
  // plugin root that also ships the bundle means a partial update — a `git pull`
  // that left untracked copies, or two checkouts merged by hand.
  const REMOVED_PATHS: readonly string[] = [
    'hooks/announce-agent-dispatch.sh',
    'hooks/announce-agent-return.sh',
    'hooks/bypass.sh',
    'hooks/ensure-project-layout.sh',
    'hooks/mark-unrecorded.sh',
    'hooks/post-edit-check.sh',
    'hooks/prompt-advisor.sh',
    'hooks/record-verify.sh',
    'hooks/route-before-change.sh',
    'hooks/stop-verify.sh',
    'scripts/bench-runtime.sh',
    'scripts/exec-journal.sh',
    'scripts/gen-agent-commands.sh',
    'scripts/gen-agent-registry.sh',
    'scripts/init-project.sh',
    'scripts/kernel.sh',
    'scripts/run-evals.sh',
    'scripts/telemetry.sh',
    'scripts/usage-report.sh',
    'scripts/validate-engineos.sh',
  ];

  const SHIM_REMEDY = 're-run the installer; it scrubs the old entry and registers the node form';
  const MIXED_REMEDY = 'delete this file from the plugin root, or re-clone the checkout';

  export function detectLegacyLayout(input: LegacyLayoutInput): LegacyFinding[] {
    const findings: LegacyFinding[] = [];
    for (const subject of shimHookEntries(input.settings, input.pluginRoot)) {
      findings.push({ kind: 'shim-hook-entry', subject, remedy: SHIM_REMEDY });
    }
    for (const path of REMOVED_PATHS) {
      if (input.exists(path)) findings.push({ kind: 'mixed-plugin-root', subject: path, remedy: MIXED_REMEDY });
    }
    return findings;
  }

  // Every registered command string, whatever event or matcher group holds it.
  // The shape is walked defensively: settings.json is a user file and a consumer
  // may have written anything into it.
  function shimHookEntries(settings: unknown, pluginRoot: string): string[] {
    if (!isRecord(settings)) return [];
    const hooks = settings['hooks'];
    if (!isRecord(hooks)) return [];
    const found: string[] = [];
    for (const groups of Object.values(hooks)) {
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        if (!isRecord(group)) continue;
        const entries = group['hooks'];
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!isRecord(entry)) continue;
          const command = entry['command'];
          if (typeof command !== 'string') continue;
          const relative = shimPathOf(command, pluginRoot);
          if (relative !== null) found.push(relative);
        }
      }
    }
    return [...new Set(found)];
  }

  // A command is a legacy shim entry when it names one of the removed paths under
  // this plugin root and does NOT go through the bundle. The bundle form carries
  // the hook name as an argument, never as a path, so the two cannot be confused.
  function shimPathOf(command: string, pluginRoot: string): string | null {
    if (command.includes('dist/engineos')) return null;
    for (const path of REMOVED_PATHS) {
      if (command.includes(`${pluginRoot}/${path}`)) return path;
    }
    return null;
  }
  ```

- [ ] **Step 4: Run the test and state PASS.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test install/legacy-layout.test.js
  ```
  Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Confirm `REMOVED_PATHS` matches the inventory, not this plan.** The list above is the roster as `docs/COMPATIBILITY.md` `## 1.7.0 additions` reads it today. Re-derive it and diff:
  ```bash
  node dist/engineos.cjs validate --only C38
  grep -oE '`(hooks|scripts)/[a-z-]+\.sh`' docs/COMPATIBILITY.md | tr -d '`' | sort -u
  ```
  Every path the grep prints under a `removed in 2.0` row must appear in `REMOVED_PATHS`, and nothing else may. Reconcile in favour of the inventory.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/install/legacy-layout.ts src/install/legacy-layout.test.ts
  git commit -m "feat(install): detect a 1.x install layout

Pure detection over settings.json entries and plugin-root contents; the caller
owns the I/O and the refusal.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 6: Refuse the mixed-version install, out loud

**Files:**
- `src/install/cli.ts` (modified)
- `src/install/install-hooks.e2e.test.ts` (modified)
- `install.sh` (modified)
- `install.ps1` (modified)

**Interfaces:**
- **Consumes:** `detectLegacyLayout` from Task 5; the existing `runSettingsMerge` argument parser and exit codes.
- **Produces:** exit code 3 from `engineos settings-merge` on a detected 1.x layout, with one stderr line per finding; `--migrate-legacy` as the acknowledged override; both installers surfacing it.

- [ ] **Step 1: Write the failing e2e test.** Append to `src/install/install-hooks.e2e.test.ts`:
  ```ts
  test('settings-merge refuses a 1.x layout instead of mixing versions', () => {
    const home = temporaryHome();
    const settings = join(home, 'settings.json');
    writeFileSync(
      settings,
      `${JSON.stringify({
        hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: `${PLUGIN_ROOT}/hooks/stop-verify.sh` }] }] },
      })}\n`,
    );

    const refused = runMerge(['--settings', settings, '--plugin-root', PLUGIN_ROOT]);

    assert.equal(refused.status, 3);
    assert.match(refused.stderr, /1\.x install layout detected/);
    assert.match(refused.stderr, /hooks\/stop-verify\.sh/);
    assert.match(refused.stderr, /--migrate-legacy/);
    // The refusal is total: nothing was written, so a second run sees the same tree.
    assert.equal(readFileSync(settings, 'utf8').includes('dist/engineos'), false);
  });

  test('--migrate-legacy acknowledges the findings and completes the merge', () => {
    const home = temporaryHome();
    const settings = join(home, 'settings.json');
    writeFileSync(
      settings,
      `${JSON.stringify({
        hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: `${PLUGIN_ROOT}/hooks/stop-verify.sh` }] }] },
      })}\n`,
    );

    const migrated = runMerge(['--settings', settings, '--plugin-root', PLUGIN_ROOT, '--migrate-legacy']);

    assert.equal(migrated.status, 0);
    const after = readFileSync(settings, 'utf8');
    assert.equal(after.includes('hooks/stop-verify.sh'), false);
    assert.match(after, /dist\/engineos[a-z-]*\.cjs" hook stop-verify/);
  });
  ```
  Use the file's existing `temporaryHome`, `runMerge` and `PLUGIN_ROOT` helpers; if a helper is named differently in the file as Wave 5 left it, use that name rather than adding a second helper.

- [ ] **Step 2: Run it and state the expected failure.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test install/install-hooks.e2e.test.js
  ```
  Expected: the first new case fails with `Expected values to be strictly equal: 0 !== 3` — today's merge accepts the legacy entry and scrubs it silently. That is the red, and it is exactly the silent mixed-version install the spec forbids.

- [ ] **Step 3: Implement the refusal.** In `src/install/cli.ts`:
  - Add `import { detectLegacyLayout } from './legacy-layout';` to the imports.
  - Add the exit code beside the existing two, with its reason as a comment:
    ```ts
    // Distinct from EXIT_FAILURE because the installer prints a different
    // paragraph for it: this is not a broken file, it is a tree the installer
    // refuses to make ambiguous.
    const EXIT_LEGACY_LAYOUT = 3;
    ```
  - Extend `USAGE` to `'usage: engineos settings-merge --settings <path> --plugin-root <path> [--dry-run] [--migrate-legacy]'`, add `migrateLegacy: boolean` to `Options`, and parse `--migrate-legacy` in `parseArgs` the same way `--dry-run` is parsed.
  - After `readSettings` succeeds and before `mergeSettings` is called, insert:
    ```ts
    const legacy = detectLegacyLayout({
      settings: settings.value,
      pluginRoot,
      exists: (relative) => existsSync(pluginFile(pluginRoot, relative)),
    });
    if (legacy.length > 0 && !migrateLegacy) {
      io.err('1.x install layout detected; refusing to mix versions.\n');
      for (const one of legacy) io.err(`  ${one.kind}: ${one.subject} — ${one.remedy}\n`);
      io.err('Read docs/migrations/1.x-to-2.0.md, then re-run with --migrate-legacy.\n');
      return EXIT_LEGACY_LAYOUT;
    }
    ```

- [ ] **Step 4: Run the test and state PASS.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test install/install-hooks.e2e.test.js
  ```
  Expected: `# fail 0`, both new cases passing.

- [ ] **Step 5: Surface it in `install.sh`.** In section 5, replace the `settings-merge` invocation's failure branch so exit 3 gets its own message:
  ```bash
  node "$PLUGIN_ROOT/dist/engineos.cjs" settings-merge \
    --settings "$SETTINGS" --plugin-root "$PLUGIN_ROOT" ${ENGINEOS_MIGRATE_LEGACY:+--migrate-legacy}
  _merge_status=$?
  if [ "$_merge_status" -eq 3 ]; then
    red "ABORT: a 1.x EngineOS layout is present. Nothing was changed."
    warn "Read $REPO_DIR/docs/migrations/1.x-to-2.0.md, then re-run with ENGINEOS_MIGRATE_LEGACY=1"
    exit 3
  elif [ "$_merge_status" -ne 0 ]; then
    red "ABORT: settings merge failed"; exit 1
  fi
  ```

- [ ] **Step 6: Mirror it in `install.ps1`.** Find the PowerShell call to `settings-merge`:
  ```bash
  grep -n "settings-merge" install.ps1
  ```
  Apply the same three-way branch on `$LASTEXITCODE`, reading `$env:ENGINEOS_MIGRATE_LEGACY` for the flag, with the same two messages in English.

- [ ] **Step 7: Verify both installers still pass the validator's installer checks.**
  ```bash
  npm run build && node dist/engineos.cjs validate --only C30
  ```
  Expected: `ok` for C30 (or `skip` on Windows per the execute-bit rule). If C30 fails on `ENGINEOS_HOOK_LIBRARIES`, that is Task 9's change arriving early — revert this task's touch of that line.

- [ ] **Step 8: Commit.**
  ```bash
  git add src/install/cli.ts src/install/install-hooks.e2e.test.ts install.sh install.ps1 dist/
  git commit -m "feat(install): refuse a 1.x layout instead of installing a mixed version

Exit 3 with one line per finding and the acknowledged override; both installers
surface it. A silent mixed-version install is no longer reachable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 7: The per-command facade decision table

**Files:**
- `src/compat/facade.ts` (created)
- `src/compat/facade.test.ts` (created)

**Interfaces:**
- **Consumes:** `docs/COMPATIBILITY.md` `### Slash command names` and `### Subcommands added by the 2.0 program` (Tasks 1 and 2); the live `CommandTable` in `src/cli.ts`; the spec's sections 5 and 6 for which 1.x behaviours are the bottleneck being removed.
- **Produces:** `COMMAND_FACADES`, `facadeFor(name)`, and the `FacadeDecision` vocabulary. This is the answer to "a facade for retained command names, except where a facade would preserve the very bottleneck being removed", stated per command with its reason.

The decisions, and why each one is what it is:

| Command | Decision | Why |
|---|---|---|
| `/engineos:route` | `name-retained-behaviour-changed` | The name is kept. The 1.x behaviour — resolve once, then dispatch the router agent to resolve the same facts again — **is** the bottleneck the spec's section 6 removes. A behaviour facade would reinstate the duplicate model call the release exists to delete. |
| `/engineos:audit` | `name-retained-behaviour-changed` | The name is kept. The 1.x default of dispatching seven design-tier agents before scope discovery is the bottleneck. The old behaviour stays reachable only behind the explicit exhaustive mode, which is an opt-in, not a facade. |
| `/engineos:implement` | `name-retained-behaviour-changed` | The name is kept. Unconditional delegation for one routed unit is the bottleneck the direct lane (F2) removes. Facading it would mean the direct lane never applies to the one command most likely to hit it. |
| `/engineos:init`, `/engineos:bypass`, `/analyze-architecture`, `/talk-about-the-system` | `full` | Names and behaviour both retained. Nothing about them is a removed bottleneck, so the facade is total and free. |
| `engineos kernel|journal|telemetry|init|bypass|gen|evals|bench|usage-report|validate|settings-merge` | `full` | The facade bundle keeps every documented subcommand name resolving. These are called by CI and by consumer tooling, and none of them sits on the hot path the bundle split addresses. |
| `engineos hook <name>` | `name-retained-not-recommended` | The name resolves through the facade so a hand-copied command keeps working. It is not the recommended path: `hooks/hooks.json` points at the hook bundle directly, and routing a hook through the fat facade re-imports every command family, which is exactly the startup cost the split removes. Retaining the name is cheap; recommending it would preserve the bottleneck. |
| The removed bash entry points | `none` | Their deprecation window closed. A facade here would extend a window the 1.7.0 release already declared closed for 2.0, and the release notes already named the replacement. |

- [ ] **Step 1: Write the failing test.** Create `src/compat/facade.test.ts`:
  ```ts
  // The facade table is a decision record with a compiler attached. Two things
  // must stay true: every command name the 2.0 line documents has a decision,
  // and no command whose 1.x behaviour is a removed bottleneck is behaviour-
  // facaded. The second is the one a well-meaning patch breaks.
  import assert from 'node:assert/strict';
  import { test } from 'node:test';
  import { COMMAND_FACADES, facadeFor, type FacadeDecision } from './facade';

  const BOTTLENECKED = ['/engineos:route', '/engineos:audit', '/engineos:implement'];

  test('every entry carries a non-empty reason', () => {
    assert.notEqual(COMMAND_FACADES.length, 0);
    for (const entry of COMMAND_FACADES) assert.notEqual(entry.reason, '');
  });

  test('no command name appears twice', () => {
    const names = COMMAND_FACADES.map((entry) => entry.name);
    assert.equal(new Set(names).size, names.length);
  });

  test('the bottlenecked commands keep their name and lose their 1.x behaviour', () => {
    for (const name of BOTTLENECKED) {
      const entry = facadeFor(name);
      assert.notEqual(entry, null, `${name} has no facade decision`);
      assert.equal(entry?.decision, 'name-retained-behaviour-changed');
    }
  });

  test('the hook arm is retained but not recommended', () => {
    assert.equal(facadeFor('engineos hook')?.decision, 'name-retained-not-recommended');
  });

  test('a full facade forwards to a named target and a none does not', () => {
    for (const entry of COMMAND_FACADES) {
      const needsTarget: FacadeDecision[] = ['full', 'name-retained-not-recommended'];
      if (needsTarget.includes(entry.decision)) assert.notEqual(entry.forwardsTo, null, entry.name);
      if (entry.decision === 'none') assert.equal(entry.forwardsTo, null, entry.name);
    }
  });

  test('an unknown command has no decision rather than a guessed one', () => {
    assert.equal(facadeFor('/engineos:nothing'), null);
  });
  ```

- [ ] **Step 2: Run it and state the expected failure.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test compat/facade.test.js
  ```
  Expected: tsc fails with `Cannot find module './facade'`. That is the red.

- [ ] **Step 3: Write the implementation.** Create `src/compat/facade.ts` with the four-value `FacadeDecision` union (`'full' | 'name-retained-behaviour-changed' | 'name-retained-not-recommended' | 'none'`), the `CommandFacade` interface (`name`, `decision`, `reason`, `forwardsTo: string | null`), a `COMMAND_FACADES` array holding one entry per row of the table above with the `Why` column as the entry's `reason` string, and:
  ```ts
  export function facadeFor(name: string): CommandFacade | null {
    return COMMAND_FACADES.find((entry) => entry.name === name) ?? null;
  }
  ```
  The `forwardsTo` for each `full` slash command is its `commands/<name>.md` path; for each `full` CLI arm it is `dist/engineos.cjs <arm>`; for `engineos hook` it is the hook bundle name read out of `ls dist/`; for every `none` entry it is `null`.

- [ ] **Step 4: Run the test and state PASS.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test compat/facade.test.js
  ```
  Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Verify the table against the live command table and the live commands directory.**
  ```bash
  ls commands/
  grep -n "^const table" -A 20 src/cli.ts
  ```
  Every `commands/<name>.md` and every key of `table` must have an entry in `COMMAND_FACADES`. A name in the source with no entry is a gap; a name in the entries with no source is a stale row. Fix in favour of the source.

- [ ] **Step 6: Mirror the decision table into the inventory.** Append to `docs/COMPATIBILITY.md` under `## 2.0 surface inventory`:
  ```markdown
  ### Compatibility facade for retained command names

  The 2.0 line keeps every documented command name resolving. It does not keep
  every command's 1.x *behaviour*: three commands' old behaviour is the
  bottleneck this release removes, and a behaviour facade would reinstate it.
  The machine-readable table is `src/compat/facade.ts`; the reasons are below.

  | Command | Facade | Why |
  |---|---|---|
  ```
  Copy the seven rows of the table above verbatim.

- [ ] **Step 7: Commit.**
  ```bash
  git add src/compat/facade.ts src/compat/facade.test.ts docs/COMPATIBILITY.md dist/
  git commit -m "feat(compat): per-command facade decisions for the 2.0 line

Names are retained across the board. Behaviour is not facaded for /engineos:route,
/engineos:audit and /engineos:implement, whose 1.x behaviour is the bottleneck
this release removes; the reason is recorded per command.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 8: Remove the bash entry points, with a test per removal

**Files:**
- `src/compat/removed.ts` (created)
- `src/compat/removed.e2e.test.ts` (created)
- `hooks/*.sh` except `layout-manifest.sh` and `scaffold-layout.sh` (deleted)
- `scripts/kernel.sh`, `scripts/exec-journal.sh`, `scripts/telemetry.sh`, `scripts/init-project.sh`, `scripts/gen-agent-commands.sh`, `scripts/gen-agent-registry.sh`, `scripts/run-evals.sh`, `scripts/bench-runtime.sh`, `scripts/usage-report.sh`, `scripts/validate-engineos.sh` (deleted)
- `.github/workflows/ci.yml`, `.github/workflows/live-evals.yml` (modified)
- `docs/COMPATIBILITY.md` (modified)

**Interfaces:**
- **Consumes:** the `removed` rows of `docs/COMPATIBILITY.md` `### Bash entry points deprecated in 1.7.0` (Task 2); `src/install/legacy-layout.ts`'s `REMOVED_PATHS`.
- **Produces:** `REMOVED_SURFACES` — the single roster the removal tests, the installer detection and C38 all read — and one e2e case per entry proving the old path fails loudly.

- [ ] **Step 1: Write the roster module.** Create `src/compat/removed.ts`:
  ```ts
  // The bash entry points EngineOS 2.0 removes. One roster, read by the removal
  // tests and by the installer's legacy detection, because two lists of the same
  // twenty paths is one list that will be wrong.
  //
  // "Loudly" is the contract this file names: a removed path must fail with a
  // non-zero status and a message, never succeed silently and never exit 0 while
  // doing nothing. A shim that quietly no-ops is worse than an absent file — the
  // caller's CI stays green while the guardrail is gone.
  export interface RemovedSurface {
    readonly path: string;
    readonly replacement: string;
  }

  export const REMOVED_SURFACES: readonly RemovedSurface[] = [
    { path: 'scripts/kernel.sh', replacement: 'engineos kernel' },
    { path: 'scripts/exec-journal.sh', replacement: 'engineos journal' },
    { path: 'scripts/telemetry.sh', replacement: 'engineos telemetry' },
    { path: 'scripts/init-project.sh', replacement: 'engineos init' },
    { path: 'scripts/gen-agent-commands.sh', replacement: 'engineos gen agent-commands' },
    { path: 'scripts/gen-agent-registry.sh', replacement: 'engineos gen agent-registry' },
    { path: 'scripts/run-evals.sh', replacement: 'engineos evals' },
    { path: 'scripts/bench-runtime.sh', replacement: 'engineos bench' },
    { path: 'scripts/usage-report.sh', replacement: 'engineos usage-report' },
    { path: 'scripts/validate-engineos.sh', replacement: 'engineos validate' },
    { path: 'hooks/bypass.sh', replacement: 'engineos bypass' },
    { path: 'hooks/announce-agent-dispatch.sh', replacement: 'engineos hook announce-agent-dispatch' },
    { path: 'hooks/announce-agent-return.sh', replacement: 'engineos hook announce-agent-return' },
    { path: 'hooks/ensure-project-layout.sh', replacement: 'engineos hook ensure-project-layout' },
    { path: 'hooks/mark-unrecorded.sh', replacement: 'engineos hook mark-unrecorded' },
    { path: 'hooks/post-edit-check.sh', replacement: 'engineos hook post-edit-check' },
    { path: 'hooks/prompt-advisor.sh', replacement: 'engineos hook prompt-advisor' },
    { path: 'hooks/record-verify.sh', replacement: 'engineos hook record-verify' },
    { path: 'hooks/route-before-change.sh', replacement: 'engineos hook route-before-change' },
    { path: 'hooks/stop-verify.sh', replacement: 'engineos hook stop-verify' },
  ];
  ```
  Then reconcile it against the inventory — the roster is derived, not authored:
  ```bash
  grep -n "removed in 2.0" docs/COMPATIBILITY.md
  ```
  Add or drop entries so the roster equals the set of paths those rows name. If a wave's handoff added a path to that set, it belongs here too.

- [ ] **Step 2: Write the failing removal test.** Create `src/compat/removed.e2e.test.ts`:
  ```ts
  // One case per removed surface. The assertion is deliberately two-sided: the
  // file is gone AND invoking it fails non-zero. A test that only checked
  // absence would pass against a two-line stub that exits 0, which is the exact
  // silent failure this suite exists to forbid.
  import assert from 'node:assert/strict';
  import { spawnSync } from 'node:child_process';
  import { existsSync } from 'node:fs';
  import { join } from 'node:path';
  import { test } from 'node:test';
  import { REMOVED_SURFACES } from './removed';

  const ROOT = join(__dirname, '..', '..');

  for (const surface of REMOVED_SURFACES) {
    test(`${surface.path} is removed and fails loudly`, () => {
      const absolute = join(ROOT, surface.path);
      assert.equal(existsSync(absolute), false, `${surface.path} is still on disk`);

      const invoked = spawnSync('bash', [absolute], { encoding: 'utf8' });
      assert.notEqual(invoked.status, 0, `${surface.path} exited 0 — a removed surface must fail`);
      assert.match(`${invoked.stderr}`, /No such file|cannot open|not found/i);
    });
  }

  test('every removed surface names its replacement', () => {
    for (const surface of REMOVED_SURFACES) {
      assert.match(surface.replacement, /^engineos /, surface.path);
    }
  });
  ```

- [ ] **Step 3: Run it and state the expected failure.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test compat/removed.e2e.test.js
  ```
  Expected: twenty failures of the form `scripts/kernel.sh is still on disk`, one per surface, plus one passing case for the replacement assertion. That is the red, and its shape is the removal checklist.

- [ ] **Step 4: Delete the files.**
  ```bash
  git rm hooks/announce-agent-dispatch.sh hooks/announce-agent-return.sh hooks/bypass.sh \
         hooks/ensure-project-layout.sh hooks/mark-unrecorded.sh hooks/post-edit-check.sh \
         hooks/prompt-advisor.sh hooks/record-verify.sh hooks/route-before-change.sh hooks/stop-verify.sh
  git rm scripts/bench-runtime.sh scripts/exec-journal.sh scripts/gen-agent-commands.sh \
         scripts/gen-agent-registry.sh scripts/init-project.sh scripts/kernel.sh \
         scripts/run-evals.sh scripts/telemetry.sh scripts/usage-report.sh scripts/validate-engineos.sh
  ```
  `hooks/layout-manifest.sh` and `hooks/scaffold-layout.sh` stay — Task 9 removes them with the code that requires them.

- [ ] **Step 5: Repoint every remaining caller.** Find them:
  ```bash
  grep -rn "scripts/.*\.sh\|hooks/.*\.sh" .github/workflows/ package.json README.md CLAUDE.md AGENTS.md docs/ --include='*.yml' --include='*.json' --include='*.md' | grep -v "layout-manifest\|scaffold-layout\|docs/COMPATIBILITY.md\|docs/migrations\|docs/release-notes"
  ```
  For each hit, substitute the `replacement` the roster gives. In `.github/workflows/ci.yml` this is the two gen drift guards (which 1.7.0 deliberately left on the `.sh` paths for one release); in `.github/workflows/live-evals.yml` it is `scripts/run-evals.sh`. Hits inside `docs/COMPATIBILITY.md`, `docs/migrations/` and `docs/release-notes/` are the historical record and stay as they are.

- [ ] **Step 6: Run the removal test and state PASS.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test compat/removed.e2e.test.js
  ```
  Expected: `# pass 21`, `# fail 0`.

- [ ] **Step 7: Run the validator and the full suite.**
  ```bash
  npm run build && node dist/engineos.cjs validate
  npm test
  ```
  Expected: `passed N, failed 0` and a green suite. C30 will fail here if it still asserts modes on deleted files — if it does, that is Task 9's work arriving; note it and proceed to Task 9 rather than weakening C30.

- [ ] **Step 8: Mark the rows removed in the inventory.** In `docs/COMPATIBILITY.md` `### Bash entry points deprecated in 1.7.0`, set every `2.0 status` cell to `removed`. Re-run `node dist/engineos.cjs validate --only C38` — expected `ok`, because the rows and the disk now agree.

- [ ] **Step 9: Commit.**
  ```bash
  git add -A
  git commit -m "feat!: remove the bash entry points deprecated in 1.7.0

BREAKING CHANGE: the twenty hooks/*.sh and scripts/*.sh entry points whose
deprecation window opened in 1.7.0 are removed. Call the engineos subcommand
each row of docs/migrations/1.x-to-2.0.md names instead. One test per removal
asserts the old path fails non-zero rather than silently doing nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 9: Remove the two frozen bash scaffold libraries

**Files:**
- `hooks/layout-manifest.sh`, `hooks/scaffold-layout.sh` (deleted)
- `src/init/project.ts` (modified)
- `src/init/project.test.ts` (modified)
- `install.sh` (modified)
- the check module registering C30 (modified)
- `docs/COMPATIBILITY.md` (modified)

**Interfaces:**
- **Consumes:** `docs/COMPATIBILITY.md` `## 1.7.0 additions`, the row reading `frozen bash until 2.0 ... they go when init stops shelling out, in 2.0`; `src/init/project.ts`'s `REQUIRED_SIBLINGS`; `registries/layout-manifest.json`.
- **Produces:** the two files gone, `REQUIRED_SIBLINGS` reduced to the JSON manifest, `ENGINEOS_HOOK_LIBRARIES` gone from `install.sh`, and C30's hook-library arm retired with the surface it guarded.

- [ ] **Step 1: Confirm nothing still sources them.**
  ```bash
  grep -rn "layout-manifest.sh\|scaffold-layout.sh" --include='*.sh' --include='*.ts' --include='*.json' --include='*.md' . | grep -v node_modules | grep -v docs/COMPATIBILITY.md
  ```
  Expected hits: `src/init/project.ts` `REQUIRED_SIBLINGS`, `install.sh` `ENGINEOS_HOOK_LIBRARIES`, the C30 check module, and `src/init/project.test.ts`. A hit anywhere else is a live consumer — stop and report it as out of scope rather than deleting under it.

- [ ] **Step 2: Write the failing test.** In `src/init/project.test.ts`, change the case that asserts the broken-checkout refusal so it names only the JSON manifest:
  ```ts
  test('a checkout missing the layout manifest is a broken checkout', () => {
    const root = checkoutCopy();
    rmSync(join(root, 'registries/layout-manifest.json'));
    const run = runInit(root, []);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /registries\/layout-manifest\.json/);
  });

  test('init does not require the retired bash scaffold siblings', () => {
    const root = checkoutCopy();
    // Both were removed in 2.0; a checkout without them is a normal checkout.
    assert.equal(existsSync(join(root, 'hooks/scaffold-layout.sh')), false);
    assert.equal(existsSync(join(root, 'hooks/layout-manifest.sh')), false);
    assert.equal(runInit(root, ['--dry-run']).status, 0);
  });
  ```
  Use the file's existing `checkoutCopy` / `runInit` helper names.

- [ ] **Step 3: Run it and state the expected failure.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test init/project.test.js
  ```
  Expected: `init does not require the retired bash scaffold siblings` fails — the files are still present, so the two `existsSync` assertions are false. That is the red.

- [ ] **Step 4: Delete and unwire.**
  ```bash
  git rm hooks/layout-manifest.sh hooks/scaffold-layout.sh
  ```
  In `src/init/project.ts`, reduce the constant and rewrite its comment to say why the bash halves are gone:
  ```ts
  // The bash scaffold halves were removed in 2.0 with the rest of the shims;
  // the JSON manifest is what this port actually reads, and it is the only
  // sibling whose absence still means a broken checkout.
  const REQUIRED_SIBLINGS = ['registries/layout-manifest.json'];
  ```
  In `install.sh`, delete the `ENGINEOS_HOOK_LIBRARIES` assignment and the `for _hook in "$REPO_DIR"/hooks/*.sh` loop below it — with no `hooks/*.sh` left, the loop iterates over nothing and the variable names nothing.

- [ ] **Step 5: Retire C30's hook-library arm.** Find it:
  ```bash
  grep -rn "C30" src/checks/*.ts | head
  ```
  In the module that registers C30, remove the arm that reads `ENGINEOS_HOOK_LIBRARIES` and asserts `hooks/*.sh` modes, and keep any other arm the check carries. Update the check's title if it named the libraries. Delete the planted-breakage cases for that arm in the family's `.test.ts`. If C30 has no arm left, remove the id from `src/checks/ids.ts` and the check from its family list, and re-run Task 3's Step 6 to fix the check-count literals.

- [ ] **Step 6: Run the tests and state PASS.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test init/ checks/
  ```
  Expected: `# fail 0`.

- [ ] **Step 7: Full gate for this task.**
  ```bash
  npm run build && node dist/engineos.cjs validate && npm test
  ```
  Expected: `passed N, failed 0` from the validator and a green suite. Update the row in `docs/COMPATIBILITY.md` `## 1.7.0 additions` for these two files from `frozen` to point at the 2.0 inventory, and add their `removed` rows to `### Bash entry points deprecated in 1.7.0`.

- [ ] **Step 8: Commit.**
  ```bash
  git add -A
  git commit -m "feat!: remove the frozen bash scaffold libraries

BREAKING CHANGE: hooks/layout-manifest.sh and hooks/scaffold-layout.sh are
removed. engineos init reads registries/layout-manifest.json and no longer needs
bash siblings; install.sh drops ENGINEOS_HOOK_LIBRARIES and C30's arm goes with
the surface it guarded.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 10: Consumer examples for Claude and Codex task-contract loading

**Files:**
- `docs/examples/task-contract-claude.md` (created)
- `docs/examples/task-contract-codex.md` (created)

**Interfaces:**
- **Consumes:** the live `engineos kernel resolve-task` and `engineos kernel execution` arms (F1, F7, Wave 2); the generated Codex entry point named in the Wave 4 barrier handoff; `templates/adapters/claude-code.md` and `templates/adapters/codex.md`.
- **Produces:** two runnable examples — the spec's migration artifact 5.

- [ ] **Step 1: Capture a real contract to quote.** Run both arms and keep the output:
  ```bash
  mkdir -p docs/examples
  node dist/engineos.cjs kernel resolve-task --prompt 'add a paginated orders endpoint' > /tmp/contract.json
  node dist/engineos.cjs kernel execution --facts '{"riskTier":"low","reversible":true,"domainCount":1,"unitCount":1,"fileCount":2,"securitySensitive":false,"requiredAgents":[]}'
  ```
  The examples quote what these printed, not a shape retyped from the program plan's F1 block. If the `execution` arm answers `unknown command`, say so in the example and quote the contract without it — an example that shows a command the binary does not have teaches a consumer to file a bug against themselves.

- [ ] **Step 2: Write the Claude example.** Create `docs/examples/task-contract-claude.md`:
  ```markdown
  # Loading a task contract — Claude Code adapter

  Claude Code loads the constitution through `CLAUDE.md` imports and gets its
  routing guidance from the `UserPromptSubmit` hook. This example shows the same
  contract obtained explicitly, which is what a consumer's own tooling does.

  ## Get the contract

  ```bash
  node dist/engineos.cjs kernel resolve-task --prompt 'add a paginated orders endpoint'
  ```

  ## What comes back

  ```json
  <the exact bytes of /tmp/contract.json, pretty-printed>
  ```

  ## Consume it

  | Field | What the adapter does with it |
  |---|---|

  ## The execution section is sparse on purpose

  `execution` is present only when execution facts were declared. A contract with
  no `execution` key is `unresolved` — the documented default, not an error. A
  caller that cannot yet count the files it will touch declares nothing and
  routes at prompt time.

  ```bash
  node dist/engineos.cjs kernel execution --facts '{"riskTier":"low","reversible":true,"domainCount":1,"unitCount":1,"fileCount":2,"securitySensitive":false,"requiredAgents":[]}'
  ```

  ```json
  <the exact bytes that command printed>
  ```

  ## What an adapter may not do

  - It may lower autonomy or capacity. It may never upgrade `delegate` or `wave`
    to `direct`, and never raise `policyCapacity`.
  - It may not reconstruct routing, gates or model tiers from prose. The contract
    is the interface.
  ```
  Fill the `Consume it` table with one row per top-level key the captured contract actually has — read them from `/tmp/contract.json`, do not list keys from the program plan.

- [ ] **Step 3: Write the Codex example.** Create `docs/examples/task-contract-codex.md` with the same five headings, differing in two places: the entry-point section, and the byte budget. Read the Wave 4 barrier handoff's `## Files` table for the generated entry point's path and its generator command, then write:
  ```markdown
  # Loading a task contract — Codex adapter

  ## The compact entry point

  Codex reads a generated entry point, not a hand-maintained copy of `CLAUDE.md`.
  Regenerate it with:

  ```bash
  <the generator command the Wave 4 handoff names>
  ```

  It carries the safety invariants, the instruction for obtaining a task
  contract, the enforcement matrix for this adapter, how to consume `execution`,
  gates and required artifacts, and a pointer to the human documentation. The
  full router table is not in it; route-selected rules load after the contract
  resolves.

  ## The byte budget

  ```bash
  node dist/engineos.cjs bench
  ```

  The `always-on context` budget is the gate: 32000 bytes. Check the current
  value before adding anything to the entry point.
  ```
  Then the same `Get the contract`, `What comes back`, `Consume it` and `What an adapter may not do` sections as the Claude example, with the same captured bytes.

- [ ] **Step 4: Verify both examples run.** Execute every fenced `bash` block in both files and confirm exit 0 and that the printed output matches the quoted JSON:
  ```bash
  node dist/engineos.cjs kernel resolve-task --prompt 'add a paginated orders endpoint' | diff - <(sed -n '/^```json$/,/^```$/p' docs/examples/task-contract-claude.md | sed '1d;$d') && echo "example matches"
  ```
  Expected: `example matches`. A mismatch means the example was edited after capture — recapture rather than hand-editing.

- [ ] **Step 5: Link them from the migration guide.** Append to `docs/migrations/1.x-to-2.0.md` section 4:
  ```markdown
  Worked examples: [`docs/examples/task-contract-claude.md`](../examples/task-contract-claude.md)
  and [`docs/examples/task-contract-codex.md`](../examples/task-contract-codex.md).
  ```

- [ ] **Step 6: Commit.**
  ```bash
  git add docs/examples/ docs/migrations/1.x-to-2.0.md
  git commit -m "docs(examples): task-contract loading for the Claude and Codex adapters

Both examples quote captured output, verified byte-for-byte against a live run.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 11: Release notes and the MAJOR version bump

**Files:**
- `docs/release-notes/2.0.0.md` (created)
- `docs/release-notes/README.md` (modified)
- `.claude-plugin/plugin.json` (modified)
- `docs/COMPATIBILITY.md` (modified)

**Interfaces:**
- **Consumes:** `skills/release-notes/SKILL.md` (procedure and template), `docs/release-notes/README.md` (this directory names files `<version>.md`, not the skill's `release-notes-<version>.md`), `docs/release-notes/1.7.0.md` (house style), the `## 2.0 surface inventory`, and `git log`.
- **Produces:** the 2.0.0 release page, its index row, and the version bump the breaking-change checklist requires.

- [ ] **Step 1: Invoke the skill and collect the change set.**
  ```
  Skill: release-notes
  ```
  Then:
  ```bash
  git log --oneline v1.7.0..HEAD 2>/dev/null || git log --oneline $(git rev-list --max-parents=0 HEAD)..HEAD | head -60
  ```
  Group by Conventional Commit type per the skill's step 2. `feat!:` and `BREAKING CHANGE:` lead.

- [ ] **Step 2: Write the page.** Create `docs/release-notes/2.0.0.md`, matching `1.7.0.md`'s style (title `##`, sections `###`, items `####`, no emojis, no single `#`):
  ```markdown
  ## EngineOS v2.0.0

  _Released <YYYY-MM-DD from the release commit>_

  ### Summary

  <two sentences: the fast core, and the fact that this is the release where the
  1.7.0 deprecation windows close>

  ### Breaking Changes

  #### The bash entry points deprecated in 1.7.0 are removed

  What breaks: <the twenty paths>. Who is affected: anyone calling them from CI or
  their own tooling. Migration: call the `engineos` subcommand each row of
  [`docs/migrations/1.x-to-2.0.md`](../migrations/1.x-to-2.0.md) section 1 names.

  #### The frozen bash scaffold libraries are removed

  What breaks: `hooks/layout-manifest.sh`, `hooks/scaffold-layout.sh`. Who is
  affected: anyone sourcing them. Migration: `engineos init` reads
  `registries/layout-manifest.json`; call `engineos init` instead of sourcing.

  #### `/engineos:route`, `/engineos:audit` and `/engineos:implement` keep their names and change behaviour

  What breaks: <per command, one sentence naming the old behaviour>. Migration:
  <per command — the router agent invoked directly, the exhaustive mode, the
  direct lane's bounds>.

  #### The installer refuses a 1.x layout

  What breaks: an upgrade over a tree carrying 1.x shims or 1.x settings entries
  now exits 3 instead of silently merging. Migration: read the printed findings,
  then re-run with `ENGINEOS_MIGRATE_LEGACY=1`.

  ### What's New

  #### <one `####` per shipped wave feature>

  ### What Was Fixed

  #### <one `####` per fix commit in the range>

  ### Upgrade

  ```bash
  cd <your engineos checkout>
  git pull
  ./install.sh
  ```

  Full mapping: [`docs/migrations/1.x-to-2.0.md`](../migrations/1.x-to-2.0.md).
  Full inventory: [`docs/COMPATIBILITY.md`](../COMPATIBILITY.md) `## 2.0 surface inventory`.
  ```
  Every `What's New` entry traces to a commit in the range — the skill's rule. A wave whose handoff shows a feature not shipped gets no entry.

- [ ] **Step 3: Add the index row.** In `docs/release-notes/README.md`, append to the table:
  ```markdown
  | 2.0.0 | [2.0.0.md](2.0.0.md) — the fast core: task-contract control plane, risk-proportional execution lane, scheduler, split runtime, and the close of every 1.7.0 deprecation window |
  ```

- [ ] **Step 4: Bump the version.** In `.claude-plugin/plugin.json`, change `"version": "1.7.0"` to `"version": "2.0.0"`.

- [ ] **Step 5: Close the breaking-change checklist in the compatibility file.** Append to `docs/COMPATIBILITY.md` under `## 2.0 surface inventory`:
  ```markdown
  ### Breaking-change checklist for 2.0

  - [x] The replacement exists and is documented — `docs/migrations/1.x-to-2.0.md`.
  - [x] The deprecated surface still works, with a warning — satisfied in 1.7.0, the release that opened every window closed here.
  - [x] `docs/release-notes/` names the removal version — `docs/release-notes/2.0.0.md`.
  - [x] `engineos validate` passes — evidence in the release gate, Task 13.
  - [x] MAJOR version bumped in `.claude-plugin/plugin.json` — 1.7.0 to 2.0.0.
  - [x] Consumers who need to act are told what to change — the migration guide's tables are edits, not descriptions.
  ```
  The fourth box's 1.x wording ("passes with both old and new surfaces present") does not apply to the release that closes the windows; state that in a sentence under the list rather than silently reinterpreting the checklist.

- [ ] **Step 6: Verify.**
  ```bash
  node -e "console.log(require('./.claude-plugin/plugin.json').version)"
  node dist/engineos.cjs validate
  ```
  Expected: `2.0.0` and `passed N, failed 0`.

- [ ] **Step 7: Commit.**
  ```bash
  git add docs/release-notes/2.0.0.md docs/release-notes/README.md .claude-plugin/plugin.json docs/COMPATIBILITY.md
  git commit -m "docs(release): EngineOS 2.0.0 release notes and version bump

Breaking changes lead, each with its migration step; the breaking-change
checklist is closed in docs/COMPATIBILITY.md.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 12: Packaged-artifact validation and the startup smoke check

**Files:**
- `src/release/smoke.ts` (created)
- `src/release/smoke.e2e.test.ts` (created)
- `scripts/package-release.sh` (modified)

**Interfaces:**
- **Consumes:** the zip `scripts/package-release.sh` produces, plus its `.sha256` and `.MANIFEST.txt`; the bundle names from `ls dist/`.
- **Produces:** `smokePackage(zipPath, workDir): SmokeResult` — unpack, verify the manifest, run each bundle's cheapest arm, assert exit 0.

- [ ] **Step 1: Write the failing test.** Create `src/release/smoke.e2e.test.ts`:
  ```ts
  // The packaged artifact is what consumers install, and it is the one thing the
  // repository's own test suite never exercises: `npm test` runs against src/,
  // not against a zip built from a commit. A bundle missing from the package
  // fails here and nowhere else.
  import assert from 'node:assert/strict';
  import { cpSync, mkdtempSync, rmSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { test } from 'node:test';
  import { smokePackage } from './smoke';

  function workDir(): string {
    return mkdtempSync(join(tmpdir(), 'engineos-smoke-'));
  }

  test('a complete package passes the smoke check', () => {
    const result = smokePackage(packagedZip(), workDir());
    assert.equal(result.ok, true, result.failures.join('; '));
    assert.notEqual(result.bundles.length, 0);
  });

  test('a package missing a bundle fails loudly and names it', () => {
    const scratch = workDir();
    const stripped = join(scratch, 'stripped.zip');
    cpSync(packagedZip(), stripped);
    removeFromZip(stripped, 'dist/engineos.cjs');

    const result = smokePackage(stripped, workDir());
    assert.equal(result.ok, false);
    assert.match(result.failures.join(' '), /dist\/engineos\.cjs/);
    rmSync(scratch, { recursive: true, force: true });
  });
  ```
  Add the two local helpers `packagedZip()` (runs `scripts/package-release.sh --out <tmp>` once and caches the path) and `removeFromZip(zip, entry)` (`spawnSync('zip', ['-d', zip, entry])`) at the top of the file.

- [ ] **Step 2: Run it and state the expected failure.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test release/smoke.e2e.test.js
  ```
  Expected: tsc fails with `Cannot find module './smoke'`. That is the red.

- [ ] **Step 3: Write the implementation.** Create `src/release/smoke.ts` exporting:
  ```ts
  export interface SmokeResult {
    readonly ok: boolean;
    readonly bundles: readonly string[];
    readonly failures: readonly string[];
  }

  export function smokePackage(zipPath: string, workDir: string): SmokeResult;
  ```
  The body, in order: verify the `.sha256` beside the zip against the zip's own digest; unzip into `workDir`; read `dist/` from the unpacked tree; for each `*.cjs` found, run `node <bundle> validate --list` for the admin bundle and `node <bundle> --version` (or the cheapest arm that bundle answers) for the others, collecting a failure string naming the bundle and the exit code for any non-zero; assert `hooks/hooks.json`, `rules/`, `agents/` and `registries/` are present in the unpacked tree, since the installers read them. A missing digest file is a failure, not a skip — an unverifiable artifact is not a verified one.

- [ ] **Step 4: Run the test and state PASS.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test release/smoke.e2e.test.js
  ```
  Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 5: Update the package allowlist.** In `scripts/package-release.sh`, remove the deleted `hooks/*.sh` and `scripts/*.sh` paths from the explicit allowlist and add any new `dist/*.cjs` bundle `ls dist/` shows. Verify:
  ```bash
  scripts/package-release.sh --out /tmp/engineos-pkg
  unzip -l /tmp/engineos-pkg/engineos-2.0.0-*.zip | grep -E '\.sh$' || echo "no bash entry points in the package"
  ```
  Expected: `no bash entry points in the package`.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/release/smoke.ts src/release/smoke.e2e.test.ts scripts/package-release.sh dist/
  git commit -m "feat(release): packaged-artifact smoke check

Verifies the checksum, unpacks the zip, runs each bundle and asserts the files
the installers read are present. A bundle missing from the package fails here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

### Task 13: Run the release gate

**Files:** none modified. This task produces evidence.

**Interfaces:**
- **Consumes:** every artifact the previous twelve tasks produced.
- **Produces:** the captured output each release-gate checkbox cites.

- [ ] **Step 1: Build.**
  ```bash
  npm run build
  ```
  Expected: exit 0 and the esbuild summary naming each committed bundle. Confirm the tree is clean afterwards — `git status --porcelain dist/` empty means the committed bundles match the source.

- [ ] **Step 2: Lint and typecheck.**
  ```bash
  npm run lint && npm run typecheck
  ```
  Expected: both exit 0 with no output. `tsc --noEmit` printing nothing is the pass.

- [ ] **Step 3: Full test suite.**
  ```bash
  npm test
  ```
  Expected: the `node --test` summary with `# fail 0` and `# cancelled 0`. Capture the `# pass` count verbatim — "tests pass" is not evidence (`rules/gates.md`).

- [ ] **Step 4: Deterministic evals.**
  ```bash
  node dist/engineos.cjs evals
  ```
  Expected: the `ok` / `FAIL` / `SKIP` lines and a summary line with zero `FAIL`. Do not set `ENGINEOS_EVAL_LIVE=1` here — the live tier is the model-comparison gate Wave 6 owns, and its result belongs to the Wave 6 barrier.

- [ ] **Step 5: Validator.**
  ```bash
  node dist/engineos.cjs validate
  ```
  Expected: `== EngineOS integrity ==`, every line `ok`, and `passed N, failed 0` where N equals `node dist/engineos.cjs validate --list | wc -l`.

- [ ] **Step 6: Packaged artifact.**
  ```bash
  scripts/package-release.sh --out /tmp/engineos-release
  ls -la /tmp/engineos-release/
  shasum -a 256 -c /tmp/engineos-release/engineos-2.0.0-*.zip.sha256
  ```
  Expected: the zip, its `.sha256` and its `.MANIFEST.txt`; the checksum line ends `: OK`.

- [ ] **Step 7: Startup smoke checks.**
  ```bash
  npx tsc -p tsconfig.json && cd build && node --test release/smoke.e2e.test.js
  ```
  Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 8: Lifecycle benchmark against the recorded baseline.**
  ```bash
  node dist/engineos.cjs bench
  node dist/engineos.cjs bench lifecycle
  ```
  Expected from the first: the five budget names in order, every line `ok`. Expected from the second: a `LifecycleReport` whose scenarios are compared against `docs/perf/baselines/<host-id>.json` for **this** host. If no baseline exists for this host, record one with `node dist/engineos.cjs bench baseline --write` and say so in the evidence — a comparison against another host's baseline is not evidence, and a hardcoded number is what F6 forbids.

- [ ] **Step 9: Write the evidence block.** Collect the captured stdout of steps 1-8 into the handoff's `## Evidence` fence (Task 14). Every checkbox in `## Release gate checklist` below cites one of these eight outputs by step number.

---

### Task 14: The high-risk gate, the human decision and the barrier handoff

**Files:**
- `.engineos/changes/<id>-engineos-2-0-release.md` (created)
- `docs/specs/2026-09-22-engineos-2-fast-core-barrier7-handoff.md` (created)

**Interfaces:**
- **Consumes:** Task 13's evidence; `rules/gates.md` "Release gate — exit criteria"; `rules/risk-autonomy.md` "Human-in-the-loop"; `.engineos/changes/_template.md`; `templates/handoff.md`.
- **Produces:** the `critic` and `security-reviewer` findings, the recorded human approval, the change record and the final handoff.

- [ ] **Step 1: Ask the kernel which HITL reasons fire.**
  ```bash
  node dist/engineos.cjs kernel hitl --risk high --autonomy A3 --external-effect true
  ```
  Record the exact `reasons` array it answers. Those ids — and only those — go into the change record's `## Human decisions` section. `rules/risk-autonomy.md` names eight and permits no others.

- [ ] **Step 2: Dispatch `critic`, read-only, with the full evidence.** Announce it first:
  ```diff
  + [agent] vera (critic) | model: opus | mode: AUDIT | scope: the 2.0 release claim, read-only
  ```
  The brief: MODE AUDIT; scope is the claim "EngineOS 2.0 is correct and complete"; inputs are Task 13's eight evidence blocks, `docs/COMPATIBILITY.md` `## 2.0 surface inventory`, `docs/migrations/1.x-to-2.0.md` and the six barrier handoffs; the task is to refute that claim, with particular attention to (a) an inventory row that contradicts the tree, (b) a removal with no migration mapping, (c) a facade decision that preserves a bottleneck the release claims to remove; return the standard envelope. Do not proceed past a `FAILED` return.

- [ ] **Step 3: Dispatch `security-reviewer`, read-only, on the hook and installer surface.** Announce it:
  ```diff
  + [agent] leo-ely (security-reviewer) | model: opus | mode: AUDIT | scope: hooks/, install.sh, install.ps1, src/install/**, src/hooks/**
  ```
  The brief: MODE AUDIT; the diff is the whole 2.0 range; the lens is the auth-adjacent hook contract change and the installer's new refusal path — specifically whether the legacy-layout refusal can be bypassed by a crafted `settings.json`, whether `--migrate-legacy` can be reached without a human, and whether any removed shim leaves a path a caller can still reach with different privileges. Return the standard envelope.

- [ ] **Step 4: Fold both returns into the change record.** Create `.engineos/changes/<id>-engineos-2-0-release.md` from `.engineos/changes/_template.md`, keeping all nine required sections (`## What`, `## Why`, `## Scope`, `## Checklist`, `## What was made`, `## Verification`, `## Human decisions`, `## Changes registered`, `## Notes`) — `registries/intents.json` `record-change.required_sections` declares them and C19 fails on a missing one. `## Verification` carries Task 13's evidence. `## Notes` carries both agents' findings, including any the release accepts as residual.

- [ ] **Step 5: Record the human decision.** In `## Human decisions`, write one row per decision, each naming the reason ids step 1 returned:
  ```markdown
  | Date | Who | Reasons | Decision |
  |---|---|---|---|
  | <date> | <the owner, by name> | `high-risk`, `external-effect` | Approved the 2.0 release for publication after reading the critic and security-reviewer returns and the release-gate evidence. |
  ```
  The decision is the owner's, recorded here. It is not made by this plan, by the executing agent, or by a green gate — `rules/risk-autonomy.md` is explicit that a tier requiring a human and carrying no such record has not passed its gate.

- [ ] **Step 6: Write the barrier handoff.** Create `docs/specs/2026-09-22-engineos-2-fast-core-barrier7-handoff.md` from `templates/handoff.md`, keeping every `##` heading and the `Gate:` / `Risk:` lines exactly as the template spells them (C19 asserts the template and the registry agree). `Gate:` reads `release — <criteria met> of 7 per rules/gates.md`; `Risk:` reads `high — removes public surface and changes hook contracts (per rules/risk-autonomy.md)`. `## Known failures and open risks` lists the residual risks the owner accepted; an empty section there is a claim, and this release has residuals.

- [ ] **Step 7: Close the record.**
  ```
  Skill: record-change
  ```
  It moves the record from `.engineos/changes/` to `.engineos/archived/` and clears the Stop gate's unrecorded flag.

- [ ] **Step 8: Commit.**
  ```bash
  git add .engineos/ docs/specs/2026-09-22-engineos-2-fast-core-barrier7-handoff.md
  git commit -m "chore(release): record the 2.0 change, the human decision and the barrier handoff

Critic and security-reviewer returns folded in; HITL reasons taken from
engineos kernel hitl, not asserted.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  ```

---

## Release gate checklist

Reproduced from `rules/gates.md` "Release gate — exit criteria". Each box names the concrete evidence this program attaches to it.

- [ ] **A named owner for operating the change, not just for writing it.**
  Evidence: the `Who` column of `## Human decisions` in `.engineos/archived/<id>-engineos-2-0-release.md` (Task 14, Step 5), naming the person who operates the 2.0 line — the repository owner recorded in `.claude-plugin/plugin.json` `author.name` unless the record names someone else.

- [ ] **A rollback path, stated concretely.**
  Evidence: `## Notes` in the change record, carrying all four rungs. (1) Consumers: `git checkout v1.7.0 && ./install.sh` in the EngineOS checkout restores the 1.x layout, including the twenty bash entry points, because the removal is a commit and not a deletion from history. (2) The installed `~/.claude/settings.json` is restored from `settings.json.engineos.bak`, which `install.sh` writes once and never clobbers. (3) The published artifact: the previous zip and its `.sha256` remain downloadable; `scripts/package-release.sh --commit v1.7.0` rebuilds it byte-identically from the commit. (4) Not reversible by revert: a consumer who already ran `--migrate-legacy` had their legacy hook entries scrubbed — the `.engineos.bak` file is the recovery, and the migration guide says so at the point of the flag.

- [ ] **Validation evidence attached, with output shown.**
  Evidence: the eight captured outputs of Task 13 — `npm run build` (Step 1), `npm run lint && npm run typecheck` (Step 2), `npm test` with its `# pass` / `# fail 0` counts (Step 3), `engineos evals` with zero `FAIL` (Step 4), `engineos validate` with `passed N, failed 0` (Step 5), the packaged artifact plus its `shasum -c ... : OK` line (Step 6), the packaged-artifact smoke run (Step 7), and `engineos bench` plus `engineos bench lifecycle` against this host's baseline (Step 8). All eight are pasted into `## Verification` of the change record and into `## Evidence` of the barrier handoff.

- [ ] **Residual risks written down and accepted by the owner.**
  Evidence: `## Known failures and open risks` in `docs/specs/2026-09-22-engineos-2-fast-core-barrier7-handoff.md`, listing at minimum: every finding the `critic` and `security-reviewer` returns raised that the release accepts rather than fixes (Task 14, Steps 2-3); any row in the 2.0 inventory marked `not shipped` (Task 2, Step 6); and any wave whose barrier handoff carried an open risk forward. The owner's acceptance is the `## Human decisions` row (Task 14, Step 5), which cites this section.

- [ ] **For medium and high risk: what to watch after release, and for how long.**
  Evidence: a `## Watch` block in the change record naming four signals and their window. (1) Installer refusals: `exit 3` reports from consumers, 14 days — a spike means the migration guide's section 5 is unclear. (2) `engineos validate` failures in consumer CI, 14 days — C38 and the C36/C37 prose checks are the two most likely to newly fail. (3) The five runtime budget names in consumers' "Runtime performance budgets" CI step, 30 days — a regression against their own baseline, not against ours. (4) Reports of a removed bash path still being called, 30 days — each one is a caller the Task 8 Step 5 sweep missed.

- [ ] **For high risk: human approval recorded before the external effect.**
  Evidence: the `## Human decisions` row (Task 14, Step 5), dated before the publication commit. The external effects this covers are the MAJOR version bump landing on the default branch, the release tag, and the published zip. The autonomy ceiling is A3 (`rules/risk-autonomy.md`): none of the three happens without that row existing first.

- [ ] **For any `hitl.required`: the human decision is recorded under `## Human decisions` in the change record, with the reason ids.**
  Evidence: the `Reasons` column of that same row, populated from the literal `reasons` array `node dist/engineos.cjs kernel hitl --risk high --autonomy A3 --external-effect true` answered in Task 14, Step 1. The ids are copied from that answer, not chosen — `rules/risk-autonomy.md` closes the vocabulary at eight, and a gate may cite nothing else.

### The two gates this checklist is not

- The Stop hook's green line is the **Validation** gate, not this one. It knows nothing about owners or rollback (`rules/gates.md`).
- The Wave 6 live-eval comparison is the model-binding gate and belongs to the Wave 6 barrier. Task 13, Step 4 deliberately runs the deterministic tier only.
