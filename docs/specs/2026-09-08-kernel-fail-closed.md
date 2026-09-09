# Kernel fail-closed loaders and referential integrity (audit U7)

**Date:** 2026-09-08
**Status:** approved (owner picked U7 after U9/U10; audit `.engineos/audits/2026-09-08-all.md` lines 37-41, critic report items 2-7)
**Risk:** medium — kernel behaviour changes: two registry loaders start refusing malformed input
(exit 1 with `{"error": ...}` where they answered defaults before), `skill-state` starts withholding a
skill whose frontmatter it cannot read, and the parity suite can be made to fail instead of skip.
Blast radius is every consumer project that routes against a malformed `routing.json` or
`intents.json` — which is the audience the change exists for. Reversible by `git revert` plus
`npm run build`.
**Autonomy:** A2. Design gate: this spec (approach, rejected alternative below). ADR waived: no
architectural choice — the change restores the strict-loader contract `src/registry/strict.ts`
already documents for every sibling loader.
**Dependency:** lands after PR #85 (`feat/prose-truth-checks`) merges. Both rebuild
`dist/engineos.cjs` and both touch `validate.e2e.test.ts` and the COMPATIBILITY Unreleased section;
the work branch is cut from `feat/prose-truth-checks` and re-cut off `main` at PR time.

## Problem

1. `loadRouting` (`src/registry/routing.ts:24-48`) and `loadIntents` (`src/registry/intents.ts:56`)
   coerce instead of asserting. `registries/routing.json = {}` makes `route-path` on an auth guard
   answer `{"domain": null, "excluded": false}` exit 0 — security routing disappears silently.
   `loadPolicy`, `loadModels`, `loadDecisionRules`, `loadCapabilities` throw `KernelError`.
2. `registries/agents.json` `capability_ids` are never joined to `capabilities.json`; a dangling id
   passes `validate` clean, against `rules/observability.md` ("always an id from
   capabilities.json"). `capabilities` and `agents` are `unknown` in `src/kernel/context.ts:31-32`.
3. C14 pins one decision rule's `source` (`rule-verification`); a `source` naming a file that does
   not exist passes.
4. Bash parity (`src/kernel/parity.test.ts`) skips every arm when the machine's bash cannot parse
   the pinned kernel (macOS bash 3.2). The skip is silent, so parity evidence exists only on
   `ubuntu-latest` and nobody would notice CI losing it too.
5. `skill-state` reads a 64 KiB head (`src/kernel/skill-state.ts:60`, `readHead`); a frontmatter
   block whose closing fence lies past the head is read as "unclosed, key absent" — enabled — with no
   diagnostic. Console reads the whole file, so the two disagree on such a file.
6. Nothing pinned the registered check count until #85 (`findings.test.ts`, `validate.e2e.test.ts`
   pin 68 ids). The result count is still unpinned: a family that stops emitting a result keeps CI
   green.

## Decision

Two disjoint units, one wave. Strict loaders reuse `strictReader` (one refusal shape for every
registry). The referential joins become new C14 results (no new check id: they are registry
coherence, C14's family, and a new id would collide with #85's `ids.ts` edits for no gain).
`skill-state` fails closed and says why through the existing `skills_suppressed` reason field,
which was declared "a closed vocabulary of one today; it exists so a second cause can be named
later". Parity gets an opt-in env var that turns skip into failure; CI sets it.

Rejected: making `loadAgents` strict too. It is lenient on purpose and documents why (a throw in a
hook body costs the dispatch banner). Its leniency is not the audit's finding; the missing join is.

Rejected: raising `HEAD_BYTES`. Any bound has a far side; the defect is failing open there.

## Frozen contracts

### Unit A — loaders, referential integrity, count pin (`devops-coordinator`, opus, tests IN scope)

Scope: `src/registry/routing.ts`, `src/registry/routing.test.ts`, `src/registry/intents.ts`,
`src/registry/intents.test.ts`, `src/kernel/context.ts`, `src/checks/registries-coherence.ts`,
`src/checks/registries-coherence.test.ts` (or whichever test file covers C14 — find it),
`src/validate/validate.e2e.test.ts`, `src/checks/index.test.ts`, `docs/COMPATIBILITY.md`
(Unreleased rows only).

- `loadRouting`: `const reader = strictReader('routing.json')`. Document must be a record;
  `.version` `requireString`; `.precedence` `requireStrings` and non-empty; `.excluded` `requireRecord`
  with `.paths`/`.basenames`/`.self_dirs` `optionalStrings`; `.domains` `requireRows` and non-empty;
  per row `.id` `requireString` (non-empty), `.match` `requireRecord` with `.paths`/`.basenames`
  `optionalStrings`, `.rules`/`.skills` `optionalStrings`, `.agent`/`.hint`/`.sample_path`
  `optionalString`. Empty `precedence` or `domains` → `reader.malformed('.domains must not be empty')`
  (same for precedence). `RoutingRegistry` gains `version: string`. Nothing else in the shape changes.
- `loadIntents`: `strictReader('intents.json')`. `.version` `requireString`; `.intents` `requireRows`
  non-empty; per row `.id`, `.title` `requireString` (id non-empty); `.signals` `requireStrings` and
  non-empty (an intent with no signal can never match — that is a registry defect, not a row);
  `.rules`, `.skills`, `.agents`, `.commands`, `.mcp`, `.suppressed_by` `optionalStrings`;
  `.model_tier`, `.domain`, `.note` `optionalString`; `.risk_floor`: absent/null → null, a string that
  `isRiskTier` accepts → tier, anything else → `malformed('.intents[i].risk_floor must be low, medium or high')`;
  `.suppressible`, `.requires_dispatch_plan`: absent → false, boolean → value, anything else →
  malformed. `IntentsRegistry` gains `version: string`. The shipped registry loads unchanged: verify
  by running `node --test build/kernel/parity.test.js` is NOT yours (Unit B owns that file) — instead
  run `bash scripts/kernel.sh route-path src/auth/jwt.guard.ts` and `route-intent "add a NestJS
  controller"` before and after and diff the JSON (must be byte-identical).
- Tests (extend the two `*.test.ts`): staged copy of `registries/` in a temp root (see
  `src/registry/models.test.ts` for the mkdtemp pattern) with `routing.json = {}` → `KernelError`
  whose message names `registries/routing.json`; `domains: []` → KernelError; a row without `id` →
  KernelError naming `.domains[0].id`; same three shapes for intents plus `risk_floor: "urgent"` →
  KernelError; the shipped registries still load and carry `version`.
- `src/kernel/context.ts`: `RegistryFiles.capabilities: CapabilitiesRegistry` via `loadCapabilities`,
  `RegistryFiles.agents: Agent[]` via `loadAgents` (import both; drop the `loadRegistry` import if
  it becomes unused). Fix the comment that says two registries have no typed loader. Check
  `src/checks/mirrors.ts` (it maps `RegistryFiles` keys to files) still compiles.
- C14, two new results appended in `checkC14`-family order (read the file to see where the
  agents/capabilities registries are read raw; keep reading raw, as the header comment explains):
  - `result('C14', 'agent capability_ids resolve to capabilities.json', ...)`, finding
    `dangling-capability-id`, subject `<agent name>:<id>`; agents.json rows without `capability_ids`
    are fine (absent = none).
  - `result('C14', 'capability agents exist in agents.json', ...)`, finding `unknown-capability-agent`,
    subject `<capability id>:<agent>`.
  - Extend the existing source check into a sweep: for every rule's `source` string, every token
    matching `/\b(?:rules|docs|commands|skills|agents|templates|registries|patterns)\/[A-Za-z0-9._\/-]+|\b(?:CLAUDE|AGENTS|README)\.md\b/g`
    must exist under the root (a `.md`-less `skills/<x>` token resolves to `skills/<x>/SKILL.md`);
    finding `source-file-missing`, subject `<rule id>:<token>`. Prose sources with no path token
    ("adapted from the analyzed corpus") produce no finding. The existing `rule-verification` pin
    stays as it is.
  - Declare the three new codes in the family's code list; tests for each on a checkout copy (plant
    a dangling id, an unknown agent, a rule `source: "rules/no-such.md"`), plus the real tree clean.
- Count pin: `src/validate/validate.e2e.test.ts` — the real-tree run asserts the exact
  `passed <N>, failed 0` where N is the result count after your two C14 results (expect 112; compute,
  do not guess) with a comment saying the number is the point. `src/checks/index.test.ts`: assert
  `CHECKS.length === CHECK_IDS.length`.
- `docs/COMPATIBILITY.md` Unreleased, two rows after the C36/C37 rows: (1) `routing.json` and
  `intents.json` loaders fail closed — a malformed or empty registry now exits 1 with `{"error":
  "registries/<file>: <path> must ..."}` instead of answering defaults (kind `changed`, behavioural);
  (2) C14 gains three results: `capability_ids` resolve, capability agents exist, decision-rule
  `source` paths exist (kind `added`).
- Scoped verification: `npm run typecheck`; `npx tsc -p tsconfig.json && node --test
  build/registry/routing.test.js build/registry/intents.test.js build/checks/registries-coherence.test.js
  build/checks/index.test.js`; `node dist/engineos.cjs validate` is NOT meaningful for you (dist is
  rebuilt by the orchestrator) — run `node build/validate/cli.js` if that entry exists (read
  `package.json`/`scripts/build.mjs` for the built entry), else skip and say so. No `npm run build`,
  no git writes.

### Unit B — skill-state fail closed, parity opt-in (`devops-coordinator`, opus, tests IN scope)

Scope: `src/kernel/skill-state.ts`, `src/kernel/skill-state.test.ts`, `src/kernel/parity.test.ts`,
`.github/workflows/ci.yml` (verify job env only), `src/kernel/route.ts` and `src/kernel/resolve.ts`
ONLY if a type change forces a one-line edit there (report it).

- `readHead` returns `{ text: string; truncated: boolean } | null` where `truncated` is
  `read === HEAD_BYTES` and the file's size (`fstatSync(fd).size`) exceeds `HEAD_BYTES`.
- `enabledInFrontmatter(text)` keeps its signature and behaviour for a complete text. Add
  `frontmatterReading(text, truncated): 'enabled' | 'disabled' | 'unreadable'`: `unreadable` when
  `truncated` is true, the file opens with a fence, and no closing fence occurs in `text` before an
  `enabled:` line decided the answer. (A truncated file whose first block closed inside the head is
  read normally; a truncated file with no opening fence is enabled — the frontmatter is what is
  unreadable, not the file.)
- `SkillState` carries the third state. Contract on the public answers:
  - `isSkillEnabled` answers `false` for `unreadable` (fail closed).
  - `SuppressedSkill.reason` becomes `'disabled' | 'unreadable'`; `suppressedSkills` reports the right
    one.
  - `skillStateSection`: `skills[].enabled` is `false` for an unreadable skill; the `disabled` list
    includes it (so every consumer that only knows `disabled` still fails closed); an additional
    `unreadable: string[]` key is present ONLY when non-empty (sparse — the parity fixture never
    produces one, and the section must stay byte-identical to the bash answer otherwise).
  - `skillLookupSection`: `enabled: false`; add `unreadable: true` only when it is.
  - Every diagnostic is in the JSON answer, never on stderr (kernel answers are stdout JSON).
- Tests: a 70 KiB SKILL.md whose frontmatter opens on line 1 and closes after the head, `enabled:
  false` past the head → `unreadable`, `isSkillEnabled` false, `skills_suppressed` reason
  `unreadable`, section carries `unreadable: ['x']`; same size with the block closed inside the head →
  read normally; a 70 KiB file with no fence → enabled and no `unreadable` key; existing tests stay.
- Parity: in `runArm` and the resolve test, when `process.env.ENGINEOS_REQUIRE_PARITY === '1'`,
  `MISSING_TOOL !== null` or `PINNED_PARSE_ERROR !== null` → `assert.fail(<the same message>)`
  instead of `t.skip`. `armIsPorted` skips are by name and stay skips. One helper
  `skipOrFail(t, reason)` rather than four edits. Comment says why: parity evidence must be
  impossible to lose silently where it is claimed (CI).
- `.github/workflows/ci.yml` verify job: add `env: ENGINEOS_REQUIRE_PARITY: "1"` at the job level
  (read the job first; the `package` and `console` jobs are untouched). Ubuntu's bash parses the
  fixture, so the suite runs; if it does not, the job goes red, which is the point.
- Scoped verification: `npm run typecheck`; `npx tsc -p tsconfig.json && node --test
  build/kernel/skill-state.test.js build/kernel/parity.test.js` (parity skips locally on macOS —
  paste the skip line; then `ENGINEOS_REQUIRE_PARITY=1 node --test build/kernel/parity.test.js` must
  FAIL locally with the parse-error message — paste it, that is the evidence the switch works).
  No `npm run build`, no git writes.

## Out of scope

`loadAgents` leniency (documented decision); console's SKILL.md parser (reads whole files; a
COMPATIBILITY note at the barrier records that the kernel now withholds what the console shows as
enabled only for a frontmatter block longer than 64 KiB); U8 CI hygiene; TS 7.

## Verification

Orchestrator at the barrier: `npm run build`, `npm run typecheck`, `node dist/engineos.cjs validate`
(exact count matches the e2e pin), `npm test`, `bash scripts/kernel.sh route-path` / `route-intent` /
`skill-state` byte-identical to before on the shipped tree. COMPATIBILITY rows for Unit B
(`unreadable` reason, `ENGINEOS_REQUIRE_PARITY`) written by the orchestrator. Then re-cut off `main`
after #85 merges, rebuild dist there, PR.
