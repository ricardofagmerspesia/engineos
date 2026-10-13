# Stack-first greenfield question + from-scratch feature artifacts — design and frozen contracts

*Status: approved by the developer in chat, 2026-10-06 · Owner: Ricardo Fagmer · Risk: medium (public surface: hooks, router row, non-negotiables, tests policy tightened for one flow) · Autonomy ceiling A2 (working tree only; no push)*

*Authoring note: written by the orchestrator (opus) instead of product-spec on the most-capable tier, at the developer's explicit speed priority. Every decision below was taken by the developer in conversation; this file transcribes them. A fable review is offered at the final gate.*

## 1. Problem

1. **Silent stack choice.** On a repo with no package manifest, nothing asks the developer for a stack. `init` writes a template carrying both a Node and a Python block, `backend-coordinator` "falls back to what the files in scope show" (an empty repo shows nothing), and the LLM/agent path (`llm-coordinator` → `langgraph-patterns`/`python-patterns`, the agent-design form, the topology template) is Python-only. Evidence: `~/vtex` `docs/adr/0001-python-stdlib-cli.md` — Claude chose Python itself, superseded a day later by ADR 0006 and a full TypeScript rewrite.
2. **No artifact floor for from-scratch work.** The new-feature row runs `superpowers:brainstorming` → `superpowers:writing-plans`; nothing guarantees a PRD, an ADR, a spec and a task list exist before code.

## 2. Decisions (developer, 2026-10-06)

| # | Decision |
|---|---|
| D1 | The stack question is asked **at the start of the development session** — the first reply in a stackless repo — not later at a coordinator dispatch. |
| D2 | Enforcement: always-on rule + **advisory hook** (SessionStart primary, UserPromptSubmit fallback). Never blocks a write. |
| D3 | Unsupported stack chosen → Claude states which EngineOS parts will not apply, then proceeds on the generic rules. No TypeScript agent patterns built now. |
| D4 | Rule lives in `rules/base.md` (already always-on) + new non-negotiable **#13**. |
| D5 | Every from-scratch feature carries **PRD + ADR + SPEC + TASKS** before code. |
| D6 | Tooling: **Matt Pocock skills** (`/grill-with-docs`, `/to-spec`, `/to-tickets`) and **`tlc-spec-lean`** (Tech Leads Club, CC-BY-4.0) replace superpowers **in the new-feature flow only**. Other superpowers rows are unchanged. |
| D7 | Artifacts live in EngineOS dirs: ADR → `docs/adr/`, PRD → `docs/prds/`, TASKS → `docs/specs/<feature>/tickets/`. `tlc-spec-lean` is installed **unchanged**, so SPEC lives in `.specs/features/<feature>/` and `docs/specs/<date>-<feature>.md` is a one-page index. |
| D8 | Order: grill-with-docs (ADRs) → to-spec (PRD) → tlc-spec-lean plan → checks (SPEC) → to-tickets (TASKS, each naming the check ids it closes) → build → tlc-spec-lean independent Verifier. |
| D9 | **Tests are ON** for work that runs this flow (the `checks.md` proofs). Everything else stays opt-in (`rules/verification.md`). |
| D10 | Matt's three flow skills (`grill-with-docs`, `to-spec`, `to-tickets`) are `disable-model-invocation: true`, so the flow is a developer-typed command, `/engineos:new-feature`, which reads each stage's `SKILL.md` and follows it in-session with a review gate per stage. |
| D11 | `install.sh` links the pinned Matt + TLC skills (from `.agents/skills/`, per `skills-lock.json`) into `~/.claude/skills` so every project has them; `engineos init` seeds Matt's per-repo config pointed at EngineOS dirs. |

Rejected: a blocking PreToolUse guard (blocks throwaway scripts); rule text only (same failure mode that produced the Python project); a new always-on `rules/stack.md` (5th always-on import for one section); vendoring tlc-spec-lean with repathing (a fork of 5 references + 7 scripts to maintain); Matt's own tracker layout (spec gate would read GitHub issues).

## 3. Frozen contracts

Every agent codes against these verbatim. A contract that looks wrong is reported, never redefined.

### C1 — stack signal (`src/kernel/stack.ts`, new exports)

```ts
export const STACK_MANIFESTS: readonly string[] = [
  'package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json', 'pubspec.yaml', 'mix.exs', 'deno.json',
];
export const STACK_MANIFEST_SUFFIXES: readonly string[] = ['.csproj', '.sln'];
export const STACK_SIGNAL_MAX_DEPTH = 3; // root = depth 0

/** True when `.engineos/config.json` exists at root, or any manifest exists within
 *  STACK_SIGNAL_MAX_DEPTH, skipping dot-directories and SKIPPED_DIRS (same walk rules
 *  as detectPackages). Short-circuits on the first hit. Never throws: an unreadable
 *  directory is treated as empty. */
export function hasStackSignal(root: string, deps?: StackDeps): boolean;
```

### C2 — the note (`src/hooks/stack-question.ts`, new module)

```ts
export const STACK_QUESTION_NOTE =
  '[engineos] no stack declared — this repo has no .engineos/config.json and no package manifest. ' +
  'Before writing any code, your FIRST reply must ask the developer which stack to use for each tier ' +
  'the work touches (backend, frontend, mobile, LLM/agent runtime) — never pick one yourself ' +
  '(rules/base.md "New projects — stack first"). Persist the answer with ' +
  '`engineos init --stack <framework>[@dir],...` and record it as the project\'s first ADR.';

/** Intents whose work depends on a language/framework choice. */
export const STACK_DEPENDENT_INTENTS: readonly string[] = [
  'new-feature', 'backend', 'backend-python', 'frontend', 'mobile', 'llm', 'agent-system',
];
```

### C3 — SessionStart (`src/hooks/ensure-project-layout.ts`)

- After the "engineos repo itself" skip and before the opt-in gate, compute `needsStack = !hasStackSignal(projectDir)`.
- `projectDir` = `repoRoot(cwd)`; when there is no git root, use `env.cwd` **for this check only** (no scaffolding outside a repo) and return `context('SessionStart', STACK_QUESTION_NOTE)` when needed. Never run the check when `env.cwd` is the user's home directory (`os.homedir()`).
- Not opted in + `needsStack` → `context('SessionStart', OPT_IN_HINT + '\n' + STACK_QUESTION_NOTE)`; not opted in + stack present → unchanged (`OPT_IN_HINT`).
- Opted in + `needsStack` → push `STACK_QUESTION_NOTE` into `lines` (the stack line is null in that case anyway).
- `ENGINEOS_SCAFFOLD=0` still returns silent (unchanged).

### C4 — UserPromptSubmit (`src/hooks/prompt-advisor.ts`)

- After `guidanceNotes`, when `task.contract.intents` intersects `STACK_DEPENDENT_INTENTS` and `!hasStackSignal(root)` (root resolved as in C3, home dir excluded), append `STACK_QUESTION_NOTE` to the notes. Bypass still short-circuits first (unchanged).

### C5 — rule text (`rules/base.md`, new section at the end, heading exact)

```markdown
## New projects — stack first
A repo is greenfield when it has no `.engineos/config.json` and no package manifest (the
SessionStart and UserPromptSubmit hooks detect it and say so).
- DO ask the developer for the stack in your first reply in a greenfield repo, before any
  code — one question per tier the work touches: backend, frontend, mobile, LLM/agent
  runtime. Offer the stacks EngineOS supports first (NestJS, FastAPI, React/Next, React
  Native, Python + LangGraph for agent systems), and accept any other answer.
- DON'T choose a stack yourself, and don't infer one from which skills or patterns happen
  to exist — that inference is how a TypeScript team got a Python project.
- DO persist a supported answer with `engineos init --stack <framework>[@dir],...` and record
  the choice as the project's first ADR (`docs/adr/`).
- DO say plainly which EngineOS parts will not apply when the answer is a stack EngineOS has
  no patterns for (e.g. "`langgraph-patterns` and the agent-design form are Python-only; the
  Stop gate has no Go runner"), then proceed on the generic rules.
- A dispatched agent cannot ask: a coordinator whose scope is greenfield returns `BLOCKED`
  with `stack undeclared`, and the orchestrator asks the developer.
```

### C6 — constitution (`CLAUDE.md` and `AGENTS.md`, mirrored byte-identically where they already mirror)

Non-negotiable #1 becomes:
`1. **Spec before code** — any change touching >2 files or any new feature. A from-scratch feature carries four artifacts before code — PRD, ADR, SPEC, TASKS — produced by \`/engineos:new-feature\`.`

New non-negotiable #13 (appended after #12):
`13. **Stack first on a greenfield repo** — ask the developer which stack to use, never pick one — \`rules/base.md\` "New projects — stack first".`

New-feature router row, Load column, replaces the superpowers text:
`` `/engineos:new-feature` — PRD + ADR + SPEC + TASKS before code: Matt Pocock skills `grill-with-docs` (ADRs → `docs/adr/`, glossary `CONTEXT.md`) → `to-spec` (PRD → `docs/prds/`) → skill `tlc-spec-lean` plan, then checks (SPEC → `.specs/features/<feature>/`, indexed from `docs/specs/`) → `to-tickets` (TASKS → `docs/specs/<feature>/tickets/`, each naming the check ids it closes) → build → the `tlc-spec-lean` Verifier; then stack rules below. Applies at non-negotiable #1's threshold — a small single-file tweak skips straight to the stack rules. Once tasks exist, apply `rules/parallelism.md`: independent tasks get dispatched as parallel agents, not done one by one ``

### C7 — registry (`registries/intents.json`, intent `new-feature`)

`skills: ["tlc-spec-lean"]`, `commands: ["new-feature"]`, everything else unchanged except `note`, which must contain the word `EXTERNAL` (C16 exemption) and say: tlc-spec-lean is pinned from tech-leads-club/agent-skills in `skills-lock.json`; Matt's skills are human-invoked and run through the command.

### C8 — tests policy (`rules/verification.md`, "Tests are ON" list, new bullet)

`- The work runs the from-scratch feature flow (\`/engineos:new-feature\`): the proofs in \`.specs/features/<feature>/checks.md\` are its tests — written from the checks, never from the code.`

### C9 — command (`commands/new-feature.md`)

Frontmatter: `description`, `argument-hint: <feature-slug> [resume]`, `allowed-tools: Read, Grep, Glob, Write, Edit, Bash, Skill, Agent`. Runs in-session (each stage waits for the developer). Stages, each ending at a developer review gate:

0. **Stack** — if greenfield (C1), ask per C5 first; persist; ADR.
1. **Preconditions** — `docs/agents/issue-tracker.md` and `docs/agents/domain.md` exist (seeded by init, C10); if not, write them from `templates/agent-skills/`. Open a change record.
2. **ADR** — read and follow `grill-with-docs/SKILL.md` (resolve from `~/.claude/skills/` then `<project>/.claude/skills/`). ADRs → `docs/adr/YYYY-MM-DD-<slug>.md`; glossary → `CONTEXT.md`.
3. **PRD** — follow `to-spec/SKILL.md`; output → `docs/prds/YYYY-MM-DD-<feature>.md`.
4. **SPEC** — load skill `tlc-spec-lean`; plan → `.specs/features/<feature>/plan.md` (stop for review), then checks → `checks.md`; write the index `docs/specs/YYYY-MM-DD-<feature>.md` linking PRD, ADRs, plan, checks, tickets.
5. **TASKS** — follow `to-tickets/SKILL.md`; one file per ticket → `docs/specs/<feature>/tickets/NN-<slug>.md` with `Blocked by:` and `Closes checks:` lines.
6. **Build + verify** — tlc-spec-lean build (tests ON, C8), then its fresh Verifier → `.specs/features/<feature>/verification.md`.
`resume` picks the earliest stage whose artifact is missing.

### C10 — init seeding (`src/init/project.ts`, `templates/`)

- New templates `templates/agent-skills/issue-tracker.md` (local markdown tracker; PRDs from `/to-spec` → `docs/prds/YYYY-MM-DD-<feature>.md`; tickets from `/to-tickets` → `docs/specs/<feature>/tickets/NN-<slug>.md` with `Blocked by:` and `Closes checks:`) and `templates/agent-skills/domain.md` (single-context: root `CONTEXT.md` + `docs/adr/`, ADR filenames `YYYY-MM-DD-<slug>.md`).
- `engineos init` copies both to `docs/agents/` when absent (never overwrites), through the same containment path as the CLAUDE.md seed, and prints one line per file (`docs/agents/<name>: created from templates/agent-skills/<name>`).
- `templates/project-claude.md` and `templates/project-claude-python.md` gain an `## Agent skills` block (Matt's format: Issue tracker / Triage labels / Domain docs, each pointing at `docs/agents/*.md`) and a `## tlc-spec-lean` block (`profile: light`, `budget: 150k`).

### C11 — installer (`install.sh`)

New step `4a2`: for each skill in `skills-lock.json` whose `source` is `mattpocock/skills` or `tech-leads-club/agent-skills`, link `$REPO_DIR/.agents/skills/<name>` → `$CLAUDE_DIR/skills/<name>` with `link_idempotent`; warn-and-skip when the target exists and is not a symlink, or when the source dir is missing. Parse the lock with `node -e` (node ≥ 18 is already required).

Amended at the integration barrier: `install.ps1` carries the same step (junctions), and `scripts/package-release.sh` ships `skills-lock.json` plus the pinned `.agents/skills/<name>` dirs in the default zip, failing when a pinned skill is not vendored.

### C12 — coordinators (step 0 / greenfield)

`backend-coordinator`, `frontend-coordinator`, `mobile-coordinator`, `llm-coordinator` (AUDIT/IMPLEMENT): when `resolve-stack` answers no package **and** there is no `.engineos/config.json`, return `status: BLOCKED` with the first `next_actions` entry `missing: stack undeclared — the orchestrator asks the developer per rules/base.md "New projects — stack first"` (the return envelope has no `missing` key; adding one would be a versioned envelope change). Never pick a stack. `llm-coordinator` INTERVIEW runs in the main session with the developer present, so it asks the stack question before step 1 itself, and returns `BLOCKED` only when dispatched as a subagent. `backend-coordinator` line "No package → … fall back to what the files in scope show" is replaced. `skills/agent-system-design/references/form.md` gains a one-paragraph preamble: the runtime is the developer's answer to the stack question; the catalog and `langgraph-patterns` assume Python and say so when the answer is otherwise.

### C13 — docs

`docs/COMPATIBILITY.md` row (MINOR, additive; **tightened**: tests ON for the from-scratch flow; new advisory notes on SessionStart/UserPromptSubmit; new command; non-negotiable #13); README, `docs/CODEBASE_MAP.md`, `docs/START.md` mention the command and the stack question; ADR `docs/adr/2026-10-06-from-scratch-artifacts-matt-pocock-and-tlc-spec-lean.md` recording D1–D11 with rejected alternatives; `registries/docs-ledger.json` updated if the validator requires it.

## 4. Acceptance criteria

1. A session started in an empty directory (git or not, not `$HOME`) receives `STACK_QUESTION_NOTE` in SessionStart context.
2. A build-intent prompt in a stackless repo receives `STACK_QUESTION_NOTE`; a pure question does not; a repo with any C1 manifest or a config does not.
3. `scripts/kernel.sh resolve-task --prompt "create a new orders feature"` lists `commands=new-feature` and `skills=tlc-spec-lean`, no `superpowers:*`.
4. `scripts/validate-engineos.sh` passes; the full node test suite passes; `dist/engineos.cjs` rebuilt.
5. `install.sh` links the pinned Matt + TLC skills; `engineos init` on an empty dir seeds `docs/agents/issue-tracker.md` and `domain.md`.

## 5. Out of scope

TypeScript agent patterns; swapping other superpowers rows; a blocking guard; Matt's GitHub tracker mode.
