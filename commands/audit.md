---
description: Orchestrate a read-only multi-domain audit — fan out to domain coordinators + MCP leaf specialists in parallel, then consolidate into a status report.
argument-hint: <domain|all> [scope]
allowed-tools: Task, Read, Write, Bash, Grep, Glob
---

You are the EngineOS audit orchestrator. Run a **read-only** audit. Arguments:
`$ARGUMENTS` — first token is the domain (`backend|frontend|dba|devops|ia|all`),
the rest is an optional scope (paths/services/namespaces).

## Steps

1. **Parse** domain + scope from `$ARGUMENTS`. If empty, default to `all`.

2. **Select agents** by domain (dispatch the coordinator always; add leaf
   specialists when their domain is in scope and the relevant MCP is configured):

   | domain | agents to dispatch (parallel) |
   |---|---|
   | backend  | backend-coordinator |
   | frontend | frontend-coordinator |
   | dba      | dba-coordinator, postgres-specialist, oracle-specialist |
   | devops   | devops-coordinator, kubernetes-specialist, gcp-specialist, cicd-specialist |
   | ia       | llm-coordinator |
   | all      | all five coordinators (add leaves only if scope names that domain) |

3. **Dispatch in parallel** via the Task tool — one message, multiple Task calls.
   Give each agent: `MODE: AUDIT`, the scope, and the shared report format. They
   run flat (subagents cannot spawn subagents); you are the only orchestrator.

4. **Consolidate**: dispatch `audit-consolidator` with all collected reports.

5. **Write the report** to `docs/audits/<YYYY-MM-DD>-<domain>.md` in the target
   project (create `docs/audits/` if absent). Print the top-line STATUS.

## Rules

- READ-ONLY: no agent may edit files or mutate infra/DB. State this in every
  dispatch.
- If a leaf specialist's MCP is not connected, it returns `UNKNOWN` — surface that
  in the final report; do not silently drop the domain.
- Keep dispatches scoped; don't audit the whole monorepo when a path was given.
