# Ask for the stack first on a greenfield repo, and build every from-scratch feature through Matt Pocock's skills and `tlc-spec-lean`

Date: 2026-10-06
Status: accepted

Source: `docs/specs/2026-10-06-stack-first-and-feature-artifacts-design.md` §2 (decisions D1–D11, rejected alternatives) and §3 (frozen contracts C1–C13). Approved by the developer in chat on 2026-10-06; the approval is recorded under `## Human decisions` in `.engineos/changes/2026-10-06-stack-first-and-feature-artifacts.md`.

## Context

Two gaps, one session apart.

**Silent stack choice.** On a repo with no package manifest nothing asked the developer for a stack. `engineos init` wrote a template carrying both a Node and a Python block, `backend-coordinator` fell back to "what the files in scope show" (an empty repo shows nothing), and the LLM/agent path — `llm-coordinator`, `langgraph-patterns`, `python-patterns`, the agent-design form, the topology template — is Python-only. The evidence is `~/vtex` `docs/adr/0001-python-stdlib-cli.md`: Claude chose Python itself, and the choice was superseded a day later by that project's ADR 0006 and a full TypeScript rewrite. The inference ran from which skills happened to exist to which language to write.

**No artifact floor for from-scratch work.** The new-feature router row ran `superpowers:brainstorming` then `superpowers:writing-plans`. Nothing guaranteed that a PRD, an ADR, a spec and a task list existed before code.

## Options considered

### Part A — the stack question

1. **Always-on rule section in `rules/base.md` plus an advisory hook note at SessionStart, with UserPromptSubmit as the fallback; a new non-negotiable #13** (chosen — D1, D2, D4).
   - Pros: the question lands in the first reply of the session, before any code; the hooks detect greenfield deterministically (`hasStackSignal`, C1) instead of leaving the model to notice; `rules/base.md` is already always-on, so no import is added; advisory never blocks a throwaway script.
   - Cons: advisory, so a model can still ignore the note; detection is a manifest walk bounded at depth 3, so a repo whose only manifest sits deeper reads as greenfield.
2. **Ask later, at coordinator dispatch** (rejected — D1). By the time a coordinator is dispatched the orchestrator may already have written code, and a dispatched agent cannot ask the developer anything. Coordinators keep a narrower role: on a greenfield scope they return `BLOCKED` with `stack undeclared` (C12) so the orchestrator asks.
3. **A blocking `PreToolUse` guard** (rejected). It would block throwaway scripts and spikes in an empty directory, the case the bypass exists for, and make a write in any stackless directory a hard stop.
4. **Rule text only, no hook** (rejected). Prose alone is the failure mode that produced the Python project: the rules existed and nothing pointed the model at them at the right moment.
5. **A new always-on `rules/stack.md`** (rejected). A fifth always-on import for one section; `rules/base.md` already loads every turn.

### Part B — the from-scratch artifact floor

1. **PRD + ADR + SPEC + TASKS before code, produced by Matt Pocock's `grill-with-docs`, `to-spec`, `to-tickets` and Tech Leads Club's `tlc-spec-lean`, run by a developer-typed command `/engineos:new-feature`, writing into EngineOS directories; `tlc-spec-lean` installed unchanged** (chosen — D5–D8, D10, D11).
   - Pros: each of the four artifacts has a named producer and a named home; the stages are ordered so the ADRs and the PRD exist before the plan, and every ticket names the check ids it closes; `tlc-spec-lean` ships its own independent Verifier; installing it unchanged means no fork to maintain.
   - Cons: two SPEC homes — the substance lives in `.specs/features/<feature>/`, and `docs/specs/<date>-<feature>.md` is only a one-page index; the flow depends on externally pinned skills reaching `~/.claude/skills`.
2. **Keep `superpowers:brainstorming` → `superpowers:writing-plans`** (the status quo, rejected). It guarantees none of the four artifacts.
3. **Vendor `tlc-spec-lean` and repath it into `docs/specs/`** (rejected). A fork of five references and seven scripts to keep in step with upstream, for the sake of one directory name.
4. **Matt's own tracker layout (GitHub issues)** (rejected). The spec gate would then have to read GitHub issues; local files under `docs/specs/<feature>/tickets/` stay inside the repo the gate already reads.

## Decision

Part A, option 1; Part B, option 1. The decisions as the developer took them:

| # | Decision |
|---|---|
| D1 | The stack question is asked at the start of the development session — the first reply in a stackless repo — not later at a coordinator dispatch. |
| D2 | Enforcement is an always-on rule plus an advisory hook: SessionStart primary, UserPromptSubmit fallback. It never blocks a write. |
| D3 | When the developer chooses a stack EngineOS has no patterns for, Claude states which EngineOS parts will not apply, then proceeds on the generic rules. No TypeScript agent patterns are built now. |
| D4 | The rule lives in `rules/base.md` (already always-on), section "New projects — stack first", plus non-negotiable #13. |
| D5 | Every from-scratch feature carries PRD + ADR + SPEC + TASKS before code. |
| D6 | Matt Pocock's skills (`/grill-with-docs`, `/to-spec`, `/to-tickets`) and `tlc-spec-lean` (Tech Leads Club, CC-BY-4.0) replace superpowers in the new-feature flow only. Every other superpowers row is unchanged. |
| D7 | ADR → `docs/adr/`, PRD → `docs/prds/`, TASKS → `docs/specs/<feature>/tickets/`. `tlc-spec-lean` is installed unchanged, so SPEC lives in `.specs/features/<feature>/` and `docs/specs/<date>-<feature>.md` is a one-page index. |
| D8 | Order: `grill-with-docs` (ADRs) → `to-spec` (PRD) → `tlc-spec-lean` plan → checks (SPEC) → `to-tickets` (TASKS, each naming the check ids it closes) → build → the `tlc-spec-lean` independent Verifier. |
| D9 | Tests are ON for work that runs this flow: the proofs in `.specs/features/<feature>/checks.md` are its tests. Everything else stays opt-in under `rules/verification.md`. |
| D10 | Matt's skills carry `disable-model-invocation: true`, so the model cannot invoke them; the flow is a developer-typed command, `/engineos:new-feature`, that reads each stage's `SKILL.md` and follows it in-session with a review gate per stage. |
| D11 | `install.sh` links the pinned Matt and TLC skills (from `.agents/skills/`, per `skills-lock.json`) into `~/.claude/skills` so every project has them; `engineos init` seeds Matt's per-repo config (`docs/agents/issue-tracker.md`, `docs/agents/domain.md`) pointed at EngineOS directories. |

How the pieces fit (contracts C1–C12 in the spec):

- **Greenfield** means: no `.engineos/config.json` at the root and no package manifest within depth 3 of it, dot-directories and the walk's skipped directories excluded (`hasStackSignal` in `src/kernel/stack.ts`; the manifest list is `STACK_MANIFESTS` plus the `.csproj`/`.sln` suffixes).
- **SessionStart** (`ensure-project-layout`) adds the note `STACK_QUESTION_NOTE` to its context when the project is greenfield, opted in or not. Outside a git repo the check runs against the session's cwd only, without scaffolding; it never runs when the cwd is the user's home directory. `ENGINEOS_SCAFFOLD=0` keeps the hook silent, as before.
- **UserPromptSubmit** (`prompt-advisor`) appends the same note when the prompt matches a stack-dependent intent (`new-feature`, `backend`, `backend-python`, `frontend`, `mobile`, `llm`, `agent-system`) in a greenfield repo. A pure question does not get it. Bypass still short-circuits first.
- **Coordinators** (`backend-coordinator`, `frontend-coordinator`, `mobile-coordinator`, `llm-coordinator`) return `BLOCKED` with `stack undeclared` on a greenfield scope instead of picking a stack.
- **`/engineos:new-feature <feature-slug> [resume]`** runs the stages Stack (only when greenfield) → Preconditions → ADR → PRD → SPEC → TASKS → Build + verify, each ending at a developer review gate; `resume` restarts at the earliest stage whose artifact is missing.

## Consequences

- **Tests policy is tightened for one flow.** `rules/verification.md` gains a "Tests are ON" bullet: work that runs `/engineos:new-feature` writes the proofs in `.specs/features/<feature>/checks.md` as its tests, from the checks and never from the code. A team used to "no tests unless asked" gets tests on every from-scratch feature that goes through the command. Work outside the command is unchanged.
- **The flow is a command, not a router-triggered skill chain.** Because Matt's skills are human-invoked (`disable-model-invocation: true`), the router row can name `/engineos:new-feature` but cannot make the model run the stages on its own; the developer types the command. The `new-feature` intent in `registries/intents.json` lists `skills: ["tlc-spec-lean"]` and `commands: ["new-feature"]`, and no `superpowers:*` skill.
- **Stage 6 does not fan out by default.** Inside `/engineos:new-feature` stage 6 (Build + verify), `tlc-spec-lean`'s `## Handoff` arithmetic picks the build mechanism — one builder, or sequential batches that advance only on green — and takes precedence over `rules/parallelism.md`'s parallel fan-out default for that stage only. Builders are still dispatched as the routed coordinators. The Verifier is a fresh general-purpose agent on the `opus` tier dispatched by the orchestrator; no dedicated verifier agent type exists yet (follow-up).
- **The router row names Matt's skills without a leading slash.** Validator C36 resolves every backticked `/name` in a `CLAUDE.md`/`AGENTS.md` table row to `commands/<name>.md`, and Matt's skills are not EngineOS commands, so the row writes `grill-with-docs`, `to-spec`, `to-tickets`. The developer still types them as `/grill-with-docs` etc. when running a stage by hand.
- **SPEC has two homes.** `tlc-spec-lean` is unchanged, so the plan, checks and verification report live in `.specs/features/<feature>/`; `docs/specs/<date>-<feature>.md` only indexes the PRD, ADRs, plan, checks and tickets. A reader who looks only in `docs/specs/` sees the index, not the spec.
- **The stack question is advisory.** Nothing blocks a write in a greenfield repo. The hooks put the note in context; the rule and non-negotiable #13 tell the model to ask; coordinators refuse to guess. A model that ignores all three can still pick a stack.
- **Unsupported stacks get the generic rules only.** `langgraph-patterns`, the agent-design form and the topology template still assume Python; the Stop gate still has runners for Node and Python only. The rule obliges Claude to say so when the developer's answer is another stack, and `skills/agent-system-design/references/form.md` gains a preamble stating the same.
- **New installed surface.** `install.sh` step `4a2` links every `skills-lock.json` entry whose `source` is `mattpocock/skills` or `tech-leads-club/agent-skills` from `.agents/skills/<name>` into `~/.claude/skills/<name>`, warning and skipping when the target exists and is not a symlink or the source is missing. `install.ps1` carries the same step with junctions. The default release zip (`scripts/package-release.sh`) now ships `skills-lock.json` and the `.agents/skills/<name>` directories of those two sources, an exception to `2026-09-07-release-from-commit-with-allowlist.md` ("adapter mirrors stay out by default"): without them step `4a2` links nothing on a zip install. Packaging fails when a pinned skill is not vendored at the commit, so a lock entry and its files land together. EngineOS now redistributes those third-party skills; their licences must permit it (`tlc-spec-lean` is CC-BY-4.0, attribution kept in its `SKILL.md`).
- **New seeded files.** `engineos init` copies `templates/agent-skills/issue-tracker.md` and `templates/agent-skills/domain.md` to `docs/agents/` when absent, never overwriting; both project `CLAUDE.md` templates gain `## Agent skills` and `## tlc-spec-lean` blocks.
- Compatibility: MINOR, additive except the tightened tests bullet (`docs/COMPATIBILITY.md`, Unreleased).

Revisit triggers:
- A greenfield session where the note was in context and the model still chose a stack — then the advisory hook is not enough and a blocking guard, rejected here for throwaway scripts, comes back with an explicit exemption for them.
- A team adopting EngineOS with a TypeScript agent runtime — then TypeScript agent patterns (out of scope here, D3) get built rather than declared missing.
- `tlc-spec-lean` upstream changes its directory layout or license — then the "install unchanged" decision (D7) is re-examined against vendoring.
- The developer wants tickets in a hosted tracker — then Matt's GitHub tracker mode, rejected here, is weighed against the spec gate having to read it.
