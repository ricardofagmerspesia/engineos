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
   implementing.

2. **Open a change record** (`changes/_template.md` → `changes/<date>-<slug>.md`,
   `status: active`) describing the task.

3. **Select coordinator(s)** by domain (the dual-mode domain coordinators do the
   work; MCP leaf specialists are AUDIT-only and are not used here):
   backend→backend-coordinator, frontend→frontend-coordinator,
   dba→dba-coordinator, devops→devops-coordinator, ia→llm-coordinator,
   all→the relevant subset for the task.

4. **Dispatch** via the Task tool with `MODE: IMPLEMENT`, the task, and the scope.
   For a single-domain task, one coordinator. For cross-domain, dispatch the
   needed coordinators; sequence them when one depends on another's output,
   otherwise parallel.

5. **Verify** — typecheck + lint + relevant tests, show output (the post-edit and
   stop hooks enforce this).

6. **Record** — close the change via the `record-change` skill (mark done,
   register files + movements, `changes/` → `archived/`).

## Rules

- Follow the routed rules for each domain (the PreToolUse routing hook injects
  them on each edit) and project `CLAUDE.md` over EngineOS.
- Keep the change atomic and within the PR size limit (`rules/git.md`); split if
  larger.
