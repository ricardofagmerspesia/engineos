# Parallel fan-out doctrine + model tiers — design

## Problem

EngineOS had no rule that says **when** work should be split across several agents.
The agent fleet existed (coordinators, leaf specialists, orchestrator commands) but
the default behavior on a big task was still one agent grinding through files
sequentially. `/engineos:implement` mentioned parallelism in one clause
("otherwise parallel") with no procedure: no contract freeze, no scope ownership,
no wave planning — so fan-out was unreliable and, when it did happen, agents could
collide on the same files or invent conflicting interfaces.

Model selection had the same gap: non-negotiable #6 said "route trivial work to
cheaper models" and nothing more. Nothing stated that spec/PRD authoring deserves
the most capable model, that design deserves a reasoning tier, or that code
generation is a build-tier job. No agent declared a model at all.

## Decision

Two new always-on rule files, one new hook, model tiers on every agent.

**`rules/parallelism.md`** — fan-out doctrine:
- Trigger: >3 files, >1 domain, ≥3 unblocked tasks, or any sweep.
- Procedure: decompose into **disjoint file scopes** → **freeze shared contracts
  first** (one design-tier agent writes types/API/DB/event/module surfaces) →
  group into waves → **dispatch a whole wave in ONE message** → barrier-verify
  between waves.
- Hard rules: never two writers on one file, flat agent graph (subagents can't
  spawn subagents), ~6 agents per wave, worktree isolation for concurrent builds,
  `[fanout] waves=...` announcement, honest partial-failure reporting.
- A mechanism table maps situation → `/engineos:implement`, `/engineos:audit`,
  raw N-Task dispatch, or the superpowers parallel skills.

**`rules/models.md`** — tiers, not names:
| Work | Tier | Model today |
|---|---|---|
| Spec, PRD, requirements, framing | most capable | `fable` |
| Architecture, design, ADR, decomposition, hard debug, security review | design | `opus` |
| Code, tests, migrations, config | build | `sonnet` |
| Renames, boilerplate, moves, summaries | cheap | `haiku` |

The tier is the contract; the model name is today's binding, rebound when a
stronger model ships. Precedence: dispatch-time `model` > agent frontmatter >
session model. Escalation triggers (two failures, ambiguity, cross-cutting,
security, irreversible) and the "never trade correctness for cost" floor are
stated explicitly.

**`hooks/task-scale-advisor.sh`** (UserPromptSubmit, non-blocking) — mirrors the
rules deterministically, the same way `route-before-change.sh` mirrors the
stack/domain router rows. Fires on ACTION+SCALE keyword co-occurrence (fan-out
reminder), on spec/PRD wording (most-capable tier), and on design wording (design
tier). Silent on small edits and questions.

**Agent frontmatter** — all 18 agents now declare `model:`. `opus` for
architecture-analyst, audit-consolidator, security-reviewer; `sonnet` for the six
coordinators, the five MCP leaf specialists, test-writer, qa-tester, and the two
store builders. No agent carries `fable` because no agent authors specs — spec
authoring happens in the main loop or via an explicit dispatch-time override.

**Coordinator "Parallel discipline" section** — the six dual-mode coordinators get
sibling-awareness rules: stay in your file scope (report `### Out of scope`
instead of reaching), honor frozen contracts verbatim, don't spawn subagents,
don't run repo-wide formatters/codemods/git writes that collide with siblings.

**`/engineos:implement`** — rewritten from a 6-step to an 8-step flow: spec gate
(fable) → change record → coordinator selection → **contract freeze (opus)** →
**wave plan + announcement** → **one-message wave dispatch with per-unit scope and
model** → verify → record.

## Scope

- New: `rules/parallelism.md`, `rules/models.md`, `hooks/task-scale-advisor.sh`,
  `hooks/test-task-scale.sh`.
- Changed: `CLAUDE.md` (two always-on `@rules` includes, new big-task router row,
  parallelism clause on the new-feature row, non-negotiables #6 rewritten + #7
  added), `hooks/hooks.json` (UserPromptSubmit registration), `commands/implement.md`,
  all 18 `agents/*.md` (model frontmatter), six coordinators (parallel discipline),
  `README.md` (rule + hook rows).
- Not changed: `hooks/routing-map.sh` — parallelism/model choice are prompt-driven
  intents, not file-pattern domains; editing a `.ts` file says nothing about
  whether the work should fan out.

## Alternatives considered

- **Blocking hook that refuses single-agent work on big tasks** — rejected: every
  other EngineOS routing hook is non-blocking guidance, and a false positive would
  stall trivial work. Advisory context + always-on rules match the house style.
- **A new `/engineos:fanout` command** — rejected: `/engineos:implement` already
  owns coordinated multi-domain change; a second entry point would split the spec
  gate and change-record flow across two commands.
- **`model: fable` in agent frontmatter for a spec-writer agent** — deferred: no
  spec-authoring agent exists yet, and frontmatter support for the tier's current
  binding is unverified. The rule covers it via dispatch-time override instead.
- **Per-agent concurrency limits in the hook** — rejected: the orchestrator sees
  the task shape, the hook only sees the prompt text.
