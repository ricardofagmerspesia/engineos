---
last_mapped: 2026-09-08T20:15:49Z
total_files: 862
total_tokens: 1536759
---

# Codebase Map

> Cartographer baseline: 2026-09-08T12:29:03Z. Condensed navigation updated
> 2026-10-06; historical counts/frontmatter are baseline evidence, not new measurements.
> Load the relevant module/flow section; search dated plans only when needed.

EngineOS is an "engineering constitution" for Claude Code (and, degraded, for
Codex / Cursor / Copilot): a prose layer of rules, agents and skills; a
machine-readable projection of that prose in `registries/*.json`; a
deterministic TypeScript kernel that turns a prompt or a file path into a
task contract; and a set of Claude Code hooks that inject that contract into
the session and gate the Stop event. A validator (68 checks) keeps prose and
registries from drifting.

Two release lines matter for reading the code: 1.6.0 added the runtime
governance blocks (admit / breaker / hitl / repair); 1.7.0 replaced the bash +
jq runtime with one committed Node bundle, `dist/engineos.cjs`. Every
`hooks/*.sh` and `scripts/*.sh` left in the tree is a compatibility shim that
`exec`s that bundle.

## System Overview

Prose → registries → deterministic kernel → adapter hooks/workers → evidence.
Generated registries, agent commands and committed bundle mirror their sources.

## Directory Structure

```
engineos/
  CLAUDE.md              Claude Code constitution + router table (hub of the prose layer)
  AGENTS.md              Same constitution for Codex; front-loads 11 always-on rules (no hooks there)
  CONTEXT.md             Vocabulary glossary for EngineOS itself (Task, Route, Gate, Span ...)
  README.md              Install (script vs plugin), what's inside, change lifecycle
  install.sh / install.ps1   Machine install: symlinks into ~/.claude, settings-merge, secrets gate
  package.json / tsconfig.json / scripts/build.mjs   esbuild -> dist/engineos.cjs (committed)
  dist/engineos.cjs      The runtime. Never edit; CI fails on drift from src/
  rules/                 20 policy files; 11 always-on, 8 routed per intent, 1 deprecated (production-backend-standards)
  agents/                22 agent definitions (frontmatter: name, tools, model, tier)
  skills/                Canonical activity procedures; NestJS, React, Mastra, spec/record/review skills; legacy Python/LangGraph paths deprecated
  commands/              9 orchestrator commands (incl. new-feature) + commands/agents/ (41 generated aliases)
  templates/             handoff, JS project CLAUDE.md, API contract, agent topology, permissions/MCP JSON, adapters, CI workflows; Python template retained deprecated
  patterns/              architecture-analyst prompts (ANALYZE / INTERVIEW) + 3-Agent-topology-interview.md (llm-coordinator INTERVIEW)
  registries/            9 JSON registries (intents, routing, policy, decision-rules, agents, ...)
  hooks/                 hooks.json (plugin wiring) + 11 .sh shims + 2 sourced bash libs
  scripts/               .sh shims over dist/engineos.cjs; build.mjs
  src/                   TypeScript runtime (see Module Guide)
  test/fixtures/         Pinned legacy bash CLIs + registries for byte-parity tests; py-fastapi/ (pyproject + app + tests) for the Python Stop-gate e2e
  evals/                 Golden set (33 intent cases, 16 agent cases) + RUBRIC.md
  docs/                  BIG-PICTURE, METHODOLOGY, COMPATIBILITY, ADOPTION, START, adr/, specs/, release-notes/
  console/               Standalone Next.js 15 admin console (skills vertical only; CI job `console`)
  .engineos/             This repo's own governance store (21 active, 90 archived change records)
  .claude-plugin/        plugin.json + marketplace.json (plugin-mode install)
  .agents/ .trae/ .windsurf/   Byte-identical vendored copies of external skills (caveman, Matt Pocock, ...), pinned in skills-lock.json; install.sh links the mattpocock/skills and tech-leads-club/agent-skills entries from .agents/skills/ into ~/.claude/skills
  .cursor/rules/         2 hand-written Cursor mirrors (subagents, testing-opt-in)
  .superpowers/          Untracked plugin scratch (git info/exclude)
```

## Module Guide

### Prose layer: `CLAUDE.md`, `rules/`, `agents/`, `skills/`, `commands/`, `templates/`

**Purpose**: state policy in prose an LLM follows. Every enforcement claim points at a registry or hook rather than claiming self-enforcement.
**Entry point**: `CLAUDE.md` (router table: intent -> rules/skills -> agent; 13 non-negotiables; output-artifact protocol).

| File / dir | Purpose | Tokens |
|---|---|---|
| `CLAUDE.md` | Router + constitution; imports only base, security, git, context directly | 4.2k |
| `AGENTS.md` | Codex port; 11 always-on rules to compensate for no hooks | 4.3k |
| `rules/*.md` | 20 rules. Always-on: base, security, git, context, memory, parallelism, models, subagents, verification, risk-autonomy, gates. Routed: architecture, backend, backend-python, frontend, data, llm-apps, observability, testing. Deprecated 2026-09-28, loaded by no row: production-backend-standards | ~19k |
| `agents/*.md` | 22 agents; 21 opus, 1 fable (`product-spec`). Shared `## Return format` envelope with status OK/DEGRADED/CRITICAL/BLOCKED/FAILED | baseline ~35k |
| `skills/*/SKILL.md` | 13 skills; each declares which rule it must not restate. `agent-system-design` carries `references/form.md` (the 12-step form) and `references/patterns/` (ten topology patterns) | baseline ~30k |
| `commands/*.md` | audit, implement, route, bypass, init, design-agents, new-feature (the from-scratch flow: `grill-with-docs` → `to-spec` → `tlc-spec-lean` → `to-tickets` → build → Verifier, external skills read in-session), analyze-architecture, talk-about-the-system | ~6k |
| `commands/agents/*.md` | 41 generated aliases; 6 hand-customized (marker removed) | 6.7k |
| `templates/` | handoff.md (headings pinned by intents.json), JS project-claude.md, deprecated project-claude-python.md (not active init), API contract, agent-topology.md, agent-skills/ (issue tracker/domain seed), permissions/MCP JSON, adapters and CI workflows | baseline ~9k |

**Agent taxonomy**: 6 dual-mode coordinators (backend, frontend, mobile, dba, devops, llm) hold Edit/Write; 5 read-only MCP leaves (kubernetes, gcp, postgres, oracle, cicd) hold exactly one MCP server; 2 store builders (ios, android) with no alias; 4 reviewers (critic, security-reviewer, router, audit-consolidator); 5 standalone leaves (architecture-analyst, docs-writer, product-spec, test-writer, qa-tester).

**Exports**: the router table, the rule set, agent contracts.
**Dependencies**: none at runtime; consumed by the model.
**Dependents**: `src/gen` (agents.json + command aliases from agent frontmatter), `src/checks` (mirror rows assert prose names registry values), `src/docs/prose-layer.e2e.test.ts`.

### `registries/*.json`

**Purpose**: machine-readable projection of the prose. The kernel reads only these.

| Registry | Shape | Consumers |
|---|---|---|
| `intents.json` | intents[] with signals, rules, skills, agents, risk_floor, model_tier, suppressible/suppressed_by, required_sections (handoff, record-change archive contract) | kernel route-escalate, resolve-task; C16, C18d, C19, C21 |
| `routing.json` | domains[] with match/excluded globs, sample_path, agent, rules, skills; precedence chain (security, test, backend, dba, backend-python, ios-release, android-release, devops, mobile, frontend, llm — `dba` before `backend-python` so `*/alembic/versions/*` and `*.sql` stay DBA); excluded.self_dirs | kernel route-path; route-before-change hook; mark-unrecorded; C6-C8, C14, C17 |
| `policy.json` | parallelism (wave cap, backpressure, prompt_signals), retry, repair, breaker, hitl, autonomy, risk, telemetry, exec_journal, router.escalate_when + fixtures | kernel admit/breaker/hitl/repair/risk; journal; hooks; C16, C20-C27 |
| `policy.json` `router_decision` | modes, restrictiveness order, `default` + `default_written_by` (`jev` today, provenance = a developer decision or a golden-set run; the keyword answer is always logged beside the decision), min_confidence, tie_margin, jev endpoint/model/budget_ms/key_env, state_fields | read by its own strict loader `src/registry/policy-router-decision.ts`, never by the kernel's `loadPolicy`, so risk/gate/escalation answers never depend on it; consumed by `src/kernel/decision-layer.ts` and `init --router` |
| `decision-rules.json` | rules[] with regex signals, require/prefer artifacts, gate, risk, priority | kernel decisions; prompt-advisor notes; C14 |
| `models.json` | tier -> model binding (fable / opus / haiku) | gen agent-registry, journal enums, C15, C31 |
| `agents.json` | GENERATED from agents/*.md frontmatter | announce-agent-return (model tier), C15, C18 |
| `capabilities.json` | capability id -> agent -> model_tier | telemetry span typing, C15, C18 |
| `layout-manifest.json` | dirs/seeds for `.engineos/` + `docs/` scaffold | scaffold.ts, hooks/layout-manifest.sh (literal copy) |
| `docs-ledger.json` | closure_exceptions, marker_budgets, external_skills, alias_exempt | prose-layer e2e test |

Not a registry but read the same strict way: the project's `.engineos/config.json` (`src/registry/project-config.ts`, written by `engineos init --stack`) — `{ version: 1, stack: { packages: [{ dir, language, framework, compose_service, python_env? }] }, router?: { mode: "keyword" | "llm" | "jev" | "auto" } }` (`router.mode` is the repo's cap on the decision layer, written by `init --router`, absent = no cap); an absent file is `null` (detect), a malformed one is an error naming the JSON path. Consumed by `src/kernel/stack.ts`, the Stop gate, the SessionStart stack line and, for `router.mode`, the prompt-advisor's decision layer.

### `src/kernel/` + `src/registry/` + `src/lib/`

**Purpose**: the deterministic decision kernel. No model calls. Byte-parity with the retired `scripts/kernel.sh`, pinned by `test/fixtures/legacy-kernel/`.
**Entry point**: `src/kernel/cli.ts` (`engineos kernel <command>`), `resolve()` in `src/kernel/resolve.ts`.

| Command | Inputs | Reads | Output |
|---|---|---|---|
| `resolve` / `resolve-task` | `--prompt`, `--path`, `--facts`, `--task-contract` | intents, routing, policy, decision-rules | Answer envelope: route, decision_rules, hitl, task_contract |
| `route-path` | file path | routing.json (first match in precedence) | domain, agent, rules, skills + skills_suppressed, hook_guidance |
| `resolve-stack` | `[dir]` (optional; defaults to the repo root of cwd) | `.engineos/config.json` first, else `pyproject.toml`/`requirements.txt`/`package.json` per package dir (`src/kernel/stack.ts`); registries play no part | packages[] (dir, language, framework, compose_service, python_env), source `config` \| `detected` |
| `decide` (no CLI verb; `src/kernel/decision-layer.ts`) | `DecisionInput` from `buildDecisionInput(task, stack, prompt, regs)`; the setting from `effectiveSetting(ENGINEOS_ROUTER, repo router.mode, policy default, restrictiveness)`, with `auto` resolved beforehand by `resolveAuto` (key present → `jev`, else `llm`; never keyword); injected `fetch`/`env`/`now`/`schedule` | policy.router_decision | **async** `Promise<Decision>`: mode that ran, requested setting, intents chosen among `offered`, confidence, escalate, fallback_reason, shadow, latency_ms, cost_micros. Called by the prompt-advisor after `resolve`, never by `resolve` itself, which stays synchronous and emits no `router` section |
| `skill-state` | `[--id <skill>]` | `skills/*/SKILL.md` frontmatter (`enabled:`, first block only) | skills[] + disabled[], or id/exists/enabled for one id; absence of the key means enabled |
| `route-escalate` | prompt | intents signals + suppression, policy.router | escalate, reasons, intents, agents, model_tier, risk_floor, scale |
| `risk` | five inputs | policy.risk | tier (max, never average) |
| `hitl` | `--risk --autonomy [--evidence thin] [--external-effect] [--situation]` | policy.hitl, policy.autonomy | required, reasons (closed 9-id vocabulary; `topology-approval` is folded from `rule-multi-agent-design`, not from a tier), autonomy_after, record_home |
| `admit` | `--inflight --queued` | policy.parallelism (wave cap reused as capacity) | dispatch / defer / reject |
| `breaker` | `--state --failures` | policy.breaker | closed / open / half-open + allow |
| `repair` | attempt, situation | policy.repair | continue / escalate / stop |

`src/registry/*` are typed, normalizing loaders (fail-closed on malformed JSON, coerce out-of-vocabulary fields to safe defaults). `src/lib/` holds `json.ts` (`isRecord`, `KernelError`), `deferrals.ts` (rule cross-reference closure), `git.ts`, `glob.ts`, `slug.ts` (`hookSlug` sanitizes, `hookPathSlug` also drops `.` and `/` so a slug is safe as a path component), `time.ts`.

**Gotcha**: `src/checks` deliberately reads several registries raw instead of through these loaders because the loaders coerce exactly the malformations the checks must report.

### `src/hooks/` + `hooks/`

**Purpose**: Claude Code integration. `hooks/hooks.json` calls `node dist/engineos.cjs hook <name>` directly; the `.sh` shims are for external callers only.
**Entry point**: `src/hooks/cli.ts` (`HOOKS` map of 10 handlers), `src/hooks/envelope.ts` (decode stdin), `src/hooks/output.ts` (the only module that writes stdout / picks exit code).

| Event | Matcher | Handler | Emits |
|---|---|---|---|
| SessionStart | `""` | `ensure-project-layout.ts` | expire repo bypass marker, reap stale flags/cache/telemetry, scaffold `.engineos/` (opt-in), context hint; `STACK_QUESTION_NOTE` (`stack-question.ts`) when `hasStackSignal` (`src/kernel/stack.ts`) is false — opted in or not, outside a git repo against cwd without scaffolding, never in `$HOME` |
| UserPromptSubmit | `""` | `prompt-advisor.ts` | one in-process `resolve({taskContract:true})`, then `await decide(...)` (decision layer); additionalContext with scale / decision-rule / route / HITL / classify notes, plus `router=<mode>[/<confidence>]` on the contract line and the keyword-fallback line when one happened; plus `STACK_QUESTION_NOTE` when a `STACK_DEPENDENT_INTENTS` intent matches in a stackless repo; the only hook that speaks while bypassed |
| PreToolUse | `Edit\|Write\|NotebookEdit` | `route-before-change.ts` | `[router] ...` context from route-path; per-session file cache under `<gitdir>/engineos-route-cache`; never blocks |
| PreToolUse | `Agent\|Task` | `announce-agent-dispatch.ts` | green banner instruction; opens a span |
| PreToolUse | `Bash` | `git-write-guard.ts` | `ask` permission decision (`[engineos] git write: <subcommand>`) when any segment of the command is a git/forge write and `ENGINEOS_GIT_WRITES` is not `auto`; silent otherwise; never denies; ignores bypass |
| PostToolUse | `Edit\|Write\|NotebookEdit` | `mark-unrecorded.ts` | silent; writes `<gitdir>/ENGINEOS_UNRECORDED.<session>` for code extensions |
| PostToolUse | `Agent\|Task` | `announce-agent-return.ts` | return banner; closes span, status from structural fields only |
| Stop (1) | `""` | `stop-verify.ts` | adopted project: scoped JS/TS lint + typecheck; bounded `ENGINEOS_VERIFY_BUDGET_S`; Python skipped visibly; tests never automatic; block genuine red, message infra/skip |
| Stop (2) | `""` | `record-verify.ts` | `block` while the unrecorded marker exists and no `.deferred` sibling |
| unwired | | `post-edit-check.ts` | registered in `HOOKS`, deliberately absent from hooks.json since 2026-08-08 |

Wire formats (`output.ts`): `context` -> `{"hookSpecificOutput":{"hookEventName","additionalContext"}}`; `ask` -> `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason"}}` (git-write-guard only); `block` -> `{"decision":"block","reason"}` with exit 0; `message` -> `{"systemMessage"}`; `fail` -> stderr + exit 2. A hook body that throws is caught and rendered silent.

**Bypass** (`src/hooks/bypass.ts`, `src/bypass/cli.ts`): any of `ENGINEOS_BYPASS=1`, `~/.claude/engineos.bypass`, `<gitdir>/ENGINEOS_BYPASS`. Only the repo marker auto-expires (next SessionStart).

**Node guard** (`src/node-guard.ts`, `src/cli.ts`): floor 18; re-execs a newer nvm/homebrew node when found; silent hooks (`route-before-change`, `mark-unrecorded`, `record-verify`, `prompt-advisor`) exit 0 with no output on old node, others print `[engineos] <hook> skipped`.

### `src/journal/` + telemetry

**Purpose**: two deliberately separate append-only JSONL logs.
- Exec journal (`exec-journal.ts`, `schema.ts`): 22-field span rows in `.git/engineos-telemetry/<session>.exec.jsonl`; `span_kind` router|coordinator|agent|tool|model|verification; slug guard `^[A-Za-z0-9@_./:-]+$` on every field but `note`; max value length 256 (reject, not truncate); errors as plain stderr text.
- Telemetry (`telemetry.ts`): kernel-decision events (route, decision-rules, hitl, verify) in `<session>.jsonl`, schema from `policy.json.telemetry`; errors as `{"error"}` on stdout; `jqCompact` reproduces `jq -c` byte for byte.

`src/hooks/telemetry.ts` + `span-writer.ts` are the hook-side sink (gate order: `ENGINEOS_TELEMETRY=0`, bypass, then project has `.engineos/`). Consumers today: `src/report/usage.ts` only.

### `src/checks/` + `src/validate/`

**Purpose**: the 68-check integrity harness behind `engineos validate` (`scripts/validate-engineos.sh`). Asserts the prose, registries, hooks and kernel agree.
**Entry point**: `src/validate/cli.ts::runValidate` -> `src/checks/index.ts::CHECKS`.

| Family | Checks | Asserts |
|---|---|---|
| rules | C1-C5b | node floor, always-on imports resolve, every `rules/X.md` reference resolves, load-list closure |
| registries | C6-C8, C14, C15, C15b | routing targets exist, registry coherence, capability/agent/tier joins |
| agents/skills | C9-C13, C31 | frontmatter, return format, alias commands, SKILL.md shape, tier vs models.json |
| decision registries | C16 | intents/policy/models well-formed, intent count equals CLAUDE.md table rows, metasyntax ban on signals |
| kernel | C17*, C18* | routing sample paths self-route (live kernel), router agent binding, suppression graph, prompt_signals compile |
| contracts | C19*, C21* | handoff template and archive contract triangles; walks every archived change record |
| runtime governance | C20-C26 | repair / telemetry / constitution / backpressure / breaker / hitl blocks, each with live in-process kernel canaries |
| runtime surface | C27-C30 | exec-journal round trips, span-writer wiring, adoption entrypoint, hook file modes |
| portability | C32-C33 | adapter-mirror parity, LF policy |
| skill enablement | C34-C35 | skills/skills_suppressed pair on every kernel answer, no routing domain emptied by disablement |
| prose truth | C36-C37 | router-table /command and patterns/ references resolve; check-count claims equal CHECK_IDS.length |

Pattern: checks never shell out. They call `runKernel`, `runTelemetry`, `runJournal` in-process against a `memoryIo` rooted at the checkout under test. Findings are typed codes (declaration-merged `CheckCodes`), graded ok / fail / skip. `mirrors.ts` is a declarative table of ~30 "registry value must appear under doc anchor" rows; empty anchor body or empty registry list is a failure, never a vacuous pass.

### `src/gen/`, `src/install/`, `src/init/`, `src/evals/`, `src/bench/`, `src/report/`, `src/testing/`

| Module | Command | What it does |
|---|---|---|
| `gen/` | `engineos gen agent-registry \| agent-commands` | agents/*.md frontmatter -> `registries/agents.json`; one alias command per agent name/alias with a `@generated` marker (marker removed = hand-customized, preserved) |
| `install/` | `engineos settings-merge` | merges hooks.json + permissions template into `~/.claude/settings.json`; scrubs both old `.sh` and new node hook forms; atomic write, write-once `.engineos.bak` |
| `init/` | `engineos init [--stack auto\|<framework>[@dir],...]` (`scripts/init-project.sh`, `/engineos:init`) | scaffold `.engineos/{changes,archived,memory}` + `docs/{specs,prds,rules}`; write `.engineos/config.json` once from `--stack` or detection; seed `CLAUDE.md` from `templates/project-claude.md`; Python template/config retained deprecated; refuses inside the EngineOS checkout (exit 3) |
| `evals/` | `engineos evals` | deterministic tier (always; 7 assertions over `evals/*.jsonl`, coverage floor 25) + live tier (`ENGINEOS_EVAL_LIVE=1`, grades `[router]` announcement) |
| `evals/router-golden*` | `engineos router-golden collect \| run` (`scripts/router-golden.sh`) | `collect`: shadow `router` spans from each repo's `.git/engineos-telemetry`, joined by `trace_id` to the user turn in `~/.claude/projects/*/<session>.jsonl`, appended as candidates to `evals/router-golden/candidates.local.jsonl` (gitignored); `run`: grades every mode on the curated `cases.jsonl` through resolve-task + the advisor's `routeDecision` in throwaway stack projects, writes `RESULTS.md`, and with `--write-default` is the only writer of `policy.json` `router_decision.default` |
| `bench/` | `engineos bench` | five budgets: route-intent 250ms, resolve-task 500ms, prompt-advisor 600ms, route-before-change cache hit 150ms, always-on context 32000 bytes |
| `report/` | `engineos usage-report [days]` | mines `~/.claude/projects` transcripts + telemetry for skill/agent/intent hit rates (input to `retro`) |
| `testing/harness.ts` | test only | `tempRoot`, `fixtureRepo`, `relocatedRoot`, `runCli`, `runInProcess`; refuses paths inside the checkout; never bundled |

### `console/`

Standalone Next.js 15 + React 19 + Drizzle/better-sqlite3 admin console for editing this repo's own `skills/`, `agents/`, `rules/` through draft -> validate -> diff -> publish -> rollback. Only the Skills vertical is wired; refuses to publish on main. Not referenced by root `package.json`; CI runs typecheck, lint and build in the `console` job; tests require approved final dispatch. Does not read `.engineos/` or telemetry.

### `.engineos/` and `docs/`

- `.engineos/changes/` (active) -> `.engineos/archived/<YYYY>/<MM>/<domain>/` (done) -> `.engineos/memory/` (distilled facts; currently empty).
- `docs/BIG-PICTURE.md` and `docs/METHODOLOGY.md` are the living companion docs; `docs/COMPATIBILITY.md` is the public-surface contract every "do not change this string" comment cites; `docs/adr/` holds 13 ADRs, from the 2026-09-03/04 governance epic through `2026-10-06-from-scratch-artifacts-matt-pocock-and-tlc-spec-lean.md` (stack question + `/engineos:new-feature`); `docs/specs/` holds 39 design/plan/handoff docs, most without a status field.

## Data Flow

### Prompt to task contract (UserPromptSubmit)

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant H as hook prompt-advisor
    participant K as kernel resolve
    participant R as registries
    participant T as telemetry sink

    CC->>H: stdin {prompt, session_id, cwd}
    H->>H: bypassActive? -> BYPASS notice
    H->>K: resolve({prompt, taskContract:true})
    K->>R: intents.json signals + suppression
    K->>R: policy.parallelism.prompt_signals (scale)
    K->>R: decision-rules.json (any_high, require/prefer)
    K->>R: policy.autonomy ceiling, policy.hitl
    K-->>H: {route, decision_rules, hitl, task_contract}
    H->>H: await decide() over the stack-allowed intents (keyword, llm or jev, a jev failure falls back to llm)
    H->>T: events route / decision-rules / hitl
    H-->>CC: additionalContext: scale notes, decision notes, [router] or dispatch-router instruction, HITL, classify note
```

### File edit to routing guidance (PreToolUse)

Bypass exits silently; otherwise resolve/cache highest-precedence path route,
return guidance and project-override/record reminders. Cache key includes session
and routing signature; writes are atomic.

### Stop gate

Parse touched packages within the adopted project root; run scoped JS/TS lint +
typecheck with bounded budget. Genuine red blocks; infrastructure/skips emit
messages. Python compatibility packages skip visibly. Tests/evals require a
separate explicit approved final command; `ENGINEOS_VERIFY_TESTS` is deprecated.
Then record-verify checks the unrecorded marker (unless deferred).

The verification gate is a no-op in projects without `.engineos/` — the same opt-in signal telemetry and the scaffolder read.

### Build, generate, validate

Final `npm run build` emits `dist/engineos.cjs`; `engineos gen` projects agent
frontmatter to registry/commands. CI checks generated drift and source/console
validation. Behavioral validator, evals, benchmarks and smoke checks run only as
separate approved final actions, not intermediate implementation checks.

## Conventions

- Prose is the source of truth for policy; registries are its projection; the validator keeps them equal. Edit prose and registry in the same PR; behavioral integrity checks require approved final validation.
- Generated surfaces: `dist/engineos.cjs`, `registries/agents.json`, `commands/agents/*.md` (marker-gated). CI fails on drift. Never hand-edit.
- Byte parity with the retired bash runtime is pinned by `test/fixtures/legacy-*` and the `*parity.test.ts` suites. Many "odd" behaviors (jq number formatting, code-point sort, `false` treated as absent) are deliberate reproductions.
- Tests: `npm test` = `tsc` into `build/` then `node --test`. No framework. `*.test.ts` in-process via `memoryIo`; `*.e2e.test.ts` spawn `dist/engineos.cjs` with an env allowlist.
- Every agent reply starts with the YAML return envelope; status vocabulary OK / DEGRADED / CRITICAL / BLOCKED / FAILED.
- Risk tiers low / medium / high; autonomy A0-A4 (A4 never granted); model tiers most-capable=fable, design=opus, build=opus, cheap=haiku.
- English only, no emojis, Conventional Commits, same branch/PR until user-directed change, ≤400-line reviewability target, spec before code above 2 files or any new feature, every change gets a change record.
- Public surface (rule paths, agent names, aliases, commands, hook contracts, envelope) is versioned per `docs/COMPATIBILITY.md`.

## Gotchas

- `stop-verify` runs lint/typecheck only in projects that carry `.engineos/`; elsewhere the verification gate is a no-op, the same opt-in as telemetry and the scaffolder.
- `hooks/hooks.json` never calls the `hooks/*.sh` shims; it runs `node dist/engineos.cjs hook <name>` directly. Reading a shim tells you nothing about behavior.
- `block` is a JSON decision with exit 0, not exit 2. Only `fail` (unwired `post-edit-check`) uses exit 2. A throwing hook renders silent.
- `SubagentStart`/`SubagentStop` exist in the type but are never used; agent lifecycle is simulated via `PreToolUse`/`PostToolUse` on `Agent|Task`.
- Bypass has three switches; only the repo marker expires. Under bypass every hook goes silent except prompt-advisor, which announces `BYPASS ACTIVE`.
- esbuild target is node16 so the version guard can run on old node and re-exec; the real floor is 18 (20.10 for import attributes).
- `src/checks` reads registries raw on purpose; the typed loaders would hide the malformations under test.
- `rules/production-backend-standards.md` is a client-specific NestJS/TypeORM overlay (`@coresoft-sas/*`), deprecated 2026-09-28 and loaded by no router row; it stays on disk with a deprecation header until the next MAJOR (`docs/COMPATIBILITY.md`).
- `docs/release-notes/` has both `1.6.0.md` and `release-notes-1.6.0.md` with different content. `docs/PRD.md` is a stale June draft.
- `.engineos/memory/` is empty despite 90 archived records; the distillation step has never run here.
- `.agents/`, `.trae/`, `.windsurf/` are byte-identical vendored copies of external skills pinned in `skills-lock.json` (caveman, Matt Pocock, ...), with no generator in this repo. Installer prefers canonical `skills/` sources when available; locked upstream copies remain fallback compatibility, never edited in place.
- `console/` is not part of the root build; only its Skills vertical exists.
- No `haiku`-tier agent file exists; cheap-tier work happens only via dispatch-time model override.
- No uninstall script. `settings.json.engineos.bak` is write-once.
- `install.ps1` is not exercised by CI.
- Route cache invalidates on `routing.json` mtime+size, not content hash.
- C36 resolves every backticked `/name` in a `CLAUDE.md`/`AGENTS.md` table row to `commands/<name>.md`, so external skills in a router row are written without the slash (`grill-with-docs`, not `/grill-with-docs`). An external skill named as "skill `<name>`" in the prose corpus must also be listed in `registries/docs-ledger.json` `external_skills`.
- The stack question is advisory only: the hooks put `STACK_QUESTION_NOTE` in context and nothing blocks a write in a stackless repo.

## Navigation Guide

Use only the relevant recipe. Regression criteria are prepared during design;
test/eval/behavioral-validator execution waits for explicit approved final
validation. Project writes remain supervised on the active branch/PR; protected
`AGENTS.md` and locked mirrors are not edited independently.

**To add or change a routing intent**: edit the CLAUDE.md router table row and `AGENTS.md` mirror, add/adjust the intent in `registries/intents.json` (signals, rules, skills, agents, risk_floor), and if path-driven also `registries/routing.json` and its `sample_path`. Run `scripts/validate-engineos.sh` (C14, C16, C17*). Add an eval case in `evals/intent-routing-cases.jsonl`.

**To add a rule**: create `rules/<name>.md`; add it to every router row that should load it and to every row that loads a rule deferring to it (closure, C5); update `registries/intents.json` rules arrays; mention it in `docs/COMPATIBILITY.md` if always-on.

**To add an agent**: create `agents/<name>.md` with frontmatter `name, description, tools, model, tier` and the standard `## Return format`; run `engineos gen agent-registry` and `engineos gen agent-commands`; bind it in `registries/capabilities.json` and the router table.

**To add a hook**: implement `run(env, ctx): HookDecision` in `src/hooks/<name>.ts`, register in `src/hooks/cli.ts::HOOKS`, wire in `hooks/hooks.json`, add to `SILENT_HOOKS` in `src/node-guard.ts` if it must stay quiet on old node, add a shim `hooks/<name>.sh`, rebuild `dist/`, cover with `src/hooks/<name>.test.ts` and an e2e test.

**To add a kernel command**: add the arm in `src/kernel/cli.ts`, the section builder in `src/kernel/<area>.ts`, the policy block in `registries/policy.json`, a check family in `src/checks/runtime-governance-<area>.ts` with a live canary, and an ADR in `docs/adr/`.

**To change a policy number** (wave cap, retry bound, retention days): edit `registries/policy.json` and the prose mirror in `rules/*.md`; C16 / C20-C27 mirror rows will fail until both agree.

**To add a validator check**: pick the next id in `src/checks/ids.ts`, augment `CheckCodes` in the family file, implement `run(ctx)`, add to that family's `*_CHECKS` array, add `*.test.ts` using `checkoutCopy` + `editFile`.

**To release**: bump `package.json`, `npm run build` (dist drift guard), write `docs/release-notes/<version>.md` via the `release-notes` skill, update `docs/COMPATIBILITY.md`, record the change in `.engineos/changes/`, archive it.

**To debug "hooks are not firing"**: check which `node` the hook PATH resolves to (floor 18), check the three bypass switches, check `hooks/hooks.json` is what `~/.claude/settings.json` carries (`engineos settings-merge`), run `node dist/engineos.cjs hook prompt-advisor` with a hand-built stdin envelope.

**To understand what the kernel decided**: `.git/engineos-telemetry/<session>.jsonl` (events) and `<session>.exec.jsonl` (spans); `engineos usage-report`.
