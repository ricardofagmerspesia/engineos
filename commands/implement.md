---
description: Orchestrate a coordinated multi-domain change — dispatch the relevant domain coordinators in IMPLEMENT mode for a well-scoped task.
argument-hint: <domain|all> <task description>
allowed-tools: Task, Read, Write, Edit, Bash, Grep, Glob
---

You are the EngineOS implement orchestrator. Arguments: `$ARGUMENTS` — first token
is the domain (`backend|frontend|dba|devops|ia|all`), the rest is the task.

## Steps

1. **Spec gate.** Per the EngineOS non-negotiables, a change touching >2 files or
   any new feature needs a spec first. If this task qualifies and no spec exists,
   stop and route to `superpowers:brainstorming` + `tlc-spec-driven` before
   implementing. Author the spec/PRD on the most-capable tier (`model: fable`,
   `rules/models.md`) — delegate it to a subagent if the session model is lower.

2. **Open a change record** (`.engineos/changes/_template.md` → `.engineos/changes/<date>-<slug>.md`,
   `status: active`) describing the task.

3. **Select coordinator(s)** by domain (the dual-mode domain coordinators do the
   work; MCP leaf specialists are AUDIT-only and are not used here):
   backend→backend-coordinator, frontend→frontend-coordinator,
   dba→dba-coordinator, devops→devops-coordinator, ia→llm-coordinator,
   all→the relevant subset for the task.

4. **Freeze the contracts** (skip only for a single-file change). One design pass
   on `model: opus` writes down the shared surface the parallel agents must honor:
   types/DTOs, API routes + payloads, DB schema deltas, event names, module public
   surfaces. Put it in the change record. Nothing fans out before this exists.

5. **Plan the waves** (`rules/parallelism.md`). Split the task into units with
   **disjoint file scope**; group units into waves by dependency. Announce:
   `[fanout] waves=<n> wave1=<agent:scope, ...> model=<per-agent>`.

6. **Dispatch each wave in ONE message** — multiple Task calls in the same turn,
   max ~6 per wave. Each dispatch carries: `MODE: IMPLEMENT`, the unit's task, the
   exact file scope it owns exclusively, the frozen contracts, and its model
   (`sonnet` for code, `haiku` for mechanical units, `opus` when the unit still
   carries design risk). Same coordinator may be dispatched N times over different
   scopes — that is the normal way to parallelize inside one domain.
   Between waves: integrate, then barrier-verify before the next wave.

7. **Verify** — typecheck + lint + relevant tests, show output (the post-edit and
   stop hooks enforce this). Report any unit that failed by name; never let a green
   summary cover an incomplete unit.

8. **Record** — close the change via the `record-change` skill (mark done,
   register files + movements, `.engineos/changes/` → `.engineos/archived/`).

## Rules

- Follow the routed rules for each domain (the PreToolUse routing hook injects
  them on each edit) and project `CLAUDE.md` over EngineOS.
- Keep the change atomic and within the PR size limit (`rules/git.md`); split if
  larger.
