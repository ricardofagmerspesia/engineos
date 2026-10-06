---
description: From-scratch feature flow — PRD + ADR + SPEC + TASKS before any code. Walks Matt Pocock's /grill-with-docs, /to-spec and /to-tickets and the tlc-spec-lean plan, checks, build and independent Verifier in this session, one developer review gate per stage.
argument-hint: <feature-slug> [resume]
allowed-tools: Read, Grep, Glob, Write, Edit, Bash, Skill, Agent
---

Run the from-scratch feature flow **in this session** — do NOT hand the whole flow to a
subagent, because every stage ends at a developer review gate.

Matt Pocock's `grill-with-docs`, `to-spec` and `to-tickets` are
`disable-model-invocation: true`: they cannot be loaded with the Skill tool. They are
followed by **reading their `SKILL.md` and executing it in-session**. The developer
typing this command is the human invocation those skills require. `tlc-spec-lean` is
model-invocable and is loaded with the Skill tool.

## Arguments

`$ARGUMENTS` = `<feature-slug> [resume]`. The slug must match `^[a-z0-9][a-z0-9-]*$`;
if it is missing or invalid, ask for it and stop. Below, `<feature>` is the slug and
`<date>` is today as `YYYY-MM-DD` (on `resume`, reuse the date already in each
artifact's filename).

## Setup

1. Resolve the EngineOS install root — `${CLAUDE_PLUGIN_ROOT}` in plugin mode, the
   engineos repo otherwise (this command runs with the target project as cwd). Use
   the loop from `commands/init.md` step 1; if it prints nothing, report EngineOS
   unreachable and stop. Never fall back to a relative path.
2. Resolve each skill directory, first hit wins:
   `~/.claude/skills/<name>/` → `<project>/.claude/skills/<name>/` →
   `$ENGINEOS_ROOT/.agents/skills/<name>/`. Names: `grill-with-docs`, `to-spec`,
   `to-tickets`, `tlc-spec-lean`. A missing one → tell the developer to re-run
   `install.sh` (it links the pinned skills from `skills-lock.json`) and stop.
   `<tlc-dir>` below is the resolved `tlc-spec-lean` directory.
3. Tracker override for every Matt skill. Where a skill says "publish to the issue
   tracker", "apply the triage label" or "run `/setup-matt-pocock-skills`", follow
   `docs/agents/issue-tracker.md` instead: PRDs go to `docs/prds/`, tickets to
   `docs/specs/<feature>/tickets/`, labels are the `**Status:**` line. Never run
   `/setup-matt-pocock-skills` — it rewrites that config to a layout EngineOS does
   not read. Domain docs follow `docs/agents/domain.md`.

## Review gate (ends every stage)

Show the artifact paths and a summary of at most five lines, then ask: approve,
revise, or stop. Proceed only on an explicit approval. On approval, tick that
stage's line in the change record checklist with its artifact paths
(`- [x] <N> <stage> — <paths>`). Revise → edit and re-present. Stop → leave the
change record `active`; `resume` picks it up.

Keep stages 2–5 in one unbroken context window (grilling, PRD, plan, checks and
tickets build on the same thinking). Compact only at a gate, and only when the
window nears ~150k tokens.

## Stages

### 0. Stack
Greenfield = no `.engineos/config.json` and no package manifest within depth 3
(`package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`,
`pom.xml`, `build.gradle`, `build.gradle.kts`, `Gemfile`, `composer.json`,
`pubspec.yaml`, `mix.exs`, `deno.json`, `*.csproj`, `*.sln`; dot-directories and the
`SKIPPED_DIRS` of `src/kernel/stack.ts` skipped). Not greenfield → skip to stage 1.
Greenfield → follow `rules/base.md` "New projects — stack first": one question per
tier the feature touches (backend, frontend, mobile, LLM/agent runtime), supported
stacks offered first, never chosen for the developer. Persist a supported answer with
`"$ENGINEOS_ROOT/scripts/init-project.sh" --dir "$(git rev-parse --show-toplevel)" --stack <framework>[@dir],...`
and write the choice as the project's first ADR, `docs/adr/<date>-stack.md`. For an
unsupported answer, state which EngineOS parts will not apply, then proceed.
Gate. Artifact: `.engineos/config.json` or a manifest, plus the stack ADR.

### 1. Preconditions and change record
- `docs/agents/issue-tracker.md` and `docs/agents/domain.md` must exist (seeded by
  `engineos init`). Missing → copy from `$ENGINEOS_ROOT/templates/agent-skills/`,
  never overwriting an existing file.
- Open `.engineos/changes/<date>-<feature>.md` from `_template.md` (`domain:` = the
  tier the feature mostly touches; `spec:` filled at stage 4). Checklist lines, one
  per stage: `0 stack`, `1 preconditions`, `2 ADR`, `3 PRD`, `4a plan`, `4b checks`,
  `5 tasks`, `6 build + verify`.
- State `[tests] on — from-scratch feature flow (rules/verification.md)`.
Gate. Artifact: both `docs/agents/` files and the change record.

### 2. ADR — `/grill-with-docs`
Read `<grill-with-docs>/SKILL.md` and follow it (it loads `grilling` and
`domain-modeling` with the Skill tool). Interview the developer about the feature
until every hard-to-reverse decision is settled. ADRs →
`docs/adr/<date>-<slug>.md` (filename per `docs/agents/domain.md`); glossary →
`CONTEXT.md` at the project root. At least one ADR for the feature.
Gate. Artifact: the ADR paths recorded on the checklist line.

### 3. PRD — `/to-spec`
Read `<to-spec>/SKILL.md` and follow it: synthesis from stage 2, no new interview
beyond its seam check. Output → `docs/prds/<date>-<feature>.md`, with the status line
`issue-tracker.md` specifies.
Gate. Artifact: the PRD.

### 4. SPEC — `tlc-spec-lean`
Load skill `tlc-spec-lean`. Profile and budget come from the project `CLAUDE.md`
`## tlc-spec-lean` block (default `profile: light`, `budget: 150k`).
- **4a plan** → `.specs/features/<feature>/plan.md`, inputs the PRD and ADRs.
  Run `python3 <tlc-dir>/scripts/validate_plan.py <feature>`; non-zero → fix and
  re-run. Gate — no check exists before the plan is approved.
- **4b checks** → `.specs/features/<feature>/checks.md` derived from the approved
  plan. Run `python3 <tlc-dir>/scripts/validate_checks.py <feature>` until it exits 0.
  Write the index `docs/specs/<date>-<feature>.md`: one page linking the PRD, the
  ADRs, `plan.md`, `checks.md` and `docs/specs/<feature>/tickets/`. Set the change
  record `spec:` to the index. Gate.
No `python3` → perform the validator checks by reading the artifact and say once that
this is the degraded path.

### 5. TASKS — `/to-tickets`
Read `<to-tickets>/SKILL.md` and follow it, working from the PRD, `plan.md` and
`checks.md`. Its quiz step is part of this gate. One file per ticket →
`docs/specs/<feature>/tickets/NN-<slug>.md`, numbered from `01` blockers-first, using
its local ticket template plus one line:
```
**Blocked by:** <NN, NN> | None (can start immediately)
**Closes checks:** <C1, C4> | none — prefactor
```
Every check id in `checks.md` is closed by at least one ticket; a check no ticket
closes is a gap — add a ticket or send the check back through stage 4 (a check is
never edited after approval). Update the index to list the tickets.
Gate. Artifact: the ticket files.

### 6. Build and verify
- Record the feature base (`git rev-parse HEAD`) in the change record `## Notes`.
- Write `## Handoff` in `checks.md` with the tlc-spec-lean arithmetic. Under budget →
  one builder. Over budget → stop and ask: handoff (sequential batches, only on green)
  or one builder. Record the answer on the `## Handoff` line before any code.
- Builders are the coordinators the router names for each ticket's files, dispatched
  per `rules/subagents.md`: `MODE: IMPLEMENT`, tests IN SCOPE, the ticket, `checks.md`
  and the diff landed so far. Tests are written from the checks, never from the code;
  the builder runs the proofs for the checks its tickets close, sets the ticket
  `**Status:**` to `done`, reports, and stops. Work the frontier: a ticket whose
  blockers are all `done`.
- Commits follow `rules/git.md` (`ENGINEOS_GIT_WRITES`; each commit is asked for under
  `ask`). Never push or deploy from this command.
- When the last ticket is `done`, in the same turn, **this session** dispatches the
  Verifier — never a builder, never a child of one: a fresh `general-purpose` agent,
  `model: opus`, with no inherited conversation. Brief: `<tlc-dir>/references/verify.md`,
  `plan.md`, `checks.md`, every source the plan marks binding, the range
  `<feature base>..HEAD` (plus `git diff <base>` when work is uncommitted), **every**
  check, the profile. It writes only `.specs/features/<feature>/verification.md` and
  fixes nothing.
- Run `python3 <tlc-dir>/scripts/validate_verification.py <feature>` until it exits 0.
  A FAIL goes to the developer, not to a builder; fixes follow the bounded repair loop
  (`registries/policy.json` `repair`), then a scoped re-verification per `verify.md`.
- Run the final gate (`rules/verification.md`) with tests, output shown.
Gate. Artifact: `verification.md` passing its validator, every ticket `done`. Then
close the change record with skill `record-change`.

## Resume

With `resume`, check the artifacts in stage order and enter the earliest stage whose
artifact is missing or whose validator fails: stack signal → `docs/agents/` files and
the change record → ADRs on the stage-2 checklist line → `docs/prds/*-<feature>.md` →
`plan.md` → `checks.md` and `docs/specs/*-<feature>.md` → `docs/specs/<feature>/tickets/`
with every check closed → `verification.md`. Inside stage 6, resume at the frontier
tickets not yet `done`. Summarize what exists in one line per stage before
re-entering. An artifact that exists but whose gate was never approved (no `[x]` line)
is re-presented at its gate, not regenerated.

No code is written before stage 6, and no stage starts before the previous gate is
approved. Never write secrets into any artifact — reference env var names.
