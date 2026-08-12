# /implement — coordinated multi-domain change

Orchestrate a coordinated multi-domain change: dispatch the relevant domain
coordinators in IMPLEMENT mode for a well-scoped task. Trailing text is
`<domain|all> <task description>` — first token is the domain
(`backend|frontend|dba|devops|ia|all`), the rest is the task.

You are the EngineOS implement orchestrator.

## Steps

1. **Spec gate.** Per the EngineOS non-negotiables, a change touching >2 files or
   any new feature needs a spec first. If this task qualifies and no spec exists,
   stop and route to the brainstorming + spec-driven skills before implementing.

2. **Open a change record** (`.engineos/changes/_template.md` → `.engineos/changes/<date>-<slug>.md`,
   `status: active`) describing the task.

3. **Select coordinator(s)** by domain (the dual-mode domain coordinators do the
   work; MCP leaf specialists are AUDIT-only and are not used here):
   backend→backend-coordinator, frontend→frontend-coordinator,
   dba→dba-coordinator, devops→devops-coordinator, ia→llm-coordinator,
   all→the relevant subset for the task.

4. **Dispatch** with `MODE: IMPLEMENT`, the task, and the scope. For a
   single-domain task, one coordinator. For cross-domain, dispatch the needed
   coordinators; sequence them when one depends on another's output, otherwise
   parallel.

5. **Run the final gate** (`rules/testing.md`). When tests were not in scope,
   state `[tests] skipped — not requested`. Cursor has no hook system, so nothing
   enforces this automatically here: run it yourself before reporting done.

6. **Record** — close the change via the `record-change` skill (mark done,
   register files + movements, `.engineos/changes/` → `.engineos/archived/`).

## Rules

- Follow the routed rules for each domain (the PreToolUse routing hook injects
  them on each edit) and project `CLAUDE.md` over EngineOS.
- Keep the change atomic and within the PR size limit (`rules/git.md`); split if
  larger.
