---
description: From-scratch feature flow — PRD + ADR + SPEC + TASKS before any code. Walks Matt Pocock's /grill-with-docs, /to-spec and /to-tickets and the tlc-spec-lean plan, checks, build and independent Verifier in this session, one developer review gate per stage.
argument-hint: <feature-slug> [resume]
allowed-tools: Read, Grep, Glob, Write, Edit, Bash, Skill, Agent
---

Run stages in-session: each ends at developer review. Read and execute
grill-with-docs/to-spec/to-tickets SKILL.md (disable-model-invocation:true; this
command is human invocation). Load model-invocable tlc-spec-lean with Skill.

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
   `$ENGINEOS_ROOT/skills/<name>/` (canonical EngineOS adaptation) →
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

Show paths and ≤5-line summary; ask approve/revise/stop. Explicit approval
ticks `- [x] <N> <stage> — <paths>` in the change record. Revise → edit/re-present;
stop → keep active for resume. Proceed only after approval.

Keep stages 2–5 in one context window; compact only at a gate near ~150k tokens.

## Stages

### 0. Stack
Use greenfield detection in `src/kernel/stack.ts`: the root .engineos/config.json
is absent AND no recognized manifest exists within depth 3, excluding
dot-directories/SKIPPED_DIRS.
Existing stack → stage 1; inspect the detector for the full manifest list.
Greenfield → follow `rules/base.md` "New projects — stack first": NestJS is
already selected when the feature includes an application backend. Ask only
about unresolved frontend/mobile choices, Mastra provider/model/storage needs and deployment
constraints; never offer plain Node.js or standalone Express as backend choices.
Persist NestJS and supported answers with
`"$ENGINEOS_ROOT/scripts/init-project.sh" --dir "$(git rev-parse --show-toplevel)" --stack <framework>[@dir],...`
and write the choices as the project's first ADR, `docs/adr/<date>-stack.md`. For
an unsupported answer, explain the JavaScript ecosystem and mandatory NestJS
backend policy and ask only for the unresolved supported choice.
When NestJS is the only touched tier and deployment constraints are known,
record the stack and ADR and continue without a separate backend-choice gate.
Otherwise review the unresolved decisions under the stage gate. Artifact:
`.engineos/config.json` or a manifest, plus the stack ADR.

### 1. Preconditions and change record
- `docs/agents/issue-tracker.md` and `docs/agents/domain.md` must exist (seeded by
  `engineos init`). Missing → copy from `$ENGINEOS_ROOT/templates/agent-skills/`,
  never overwriting an existing file.
- Open `.engineos/changes/<date>-<feature>.md` from `_template.md` (`domain:` = the
  tier the feature mostly touches; `spec:` filled at stage 4). Checklist lines, one
  per stage: `0 stack`, `1 preconditions`, `2 ADR`, `3 PRD`, `4a plan`, `4b checks`,
  `5 tasks`, `6 build + verify`.
- State `[tests] pending — final-stage user approval required`.
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
  Review the plan structure by reading: problem, surfaces, EARS criteria,
  one-way doors and no unresolved assumptions. Gate — no check exists before the plan is approved.
- **4b checks** → `.specs/features/<feature>/checks.md` derived from the approved
  plan as acceptance claims and proposed evidence, without executable tests.
  Write the index `docs/specs/<date>-<feature>.md`: one page linking the PRD, the
  ADRs, `plan.md`, `checks.md` and `docs/specs/<feature>/tickets/`. Set the change
  record `spec:` to the index. Gate.
Use the artifact templates for manual structure review; legacy Python validators
are retained for compatibility and are not part of active workflows.

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

### 6. Build, integrate, final validation
- Record the feature base with a read-only git command.
- Decompose tickets into exclusive files and frozen contracts. Use the dependency-ready
  scheduler in rules/parallelism.md: refill host-bounded slots as each dependency lands.
- Dispatch router coordinators in IMPLEMENT mode with tests OUT OF SCOPE, ticket,
  acceptance claims, frozen contracts and dependency state. Builders implement,
  review their diff, report evidence and stop; they run no intermediate gates.
- Integrate every unit, then run one final lint/typecheck/build stage with output.
- Dispatch the independent Verifier for read-only review of all acceptance criteria
  and source evidence. It may not run or author tests without final-stage approval.
  Write verification.md with passed non-test evidence and explicit pending test claims.
- Present the concrete test scope after integration. Reuse direct explicit
  current-task approval if already given; otherwise request it. Only then author the tests from acceptance criteria
  and run the bounded covering suite. No workflow, agent or env flag grants consent.
- If approval is absent, report implementation delivered and tests pending. Never
  claim executable proofs passed. Preserve existing tests.
- Commits follow rules/git.md; never push or deploy from this command.
Close the change record honestly with non-test evidence and the test decision.

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
