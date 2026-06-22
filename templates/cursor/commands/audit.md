# /audit — read-only multi-domain audit

Orchestrate a read-only multi-domain audit: fan out to domain coordinators + MCP
leaf specialists in parallel, then consolidate into a status report. Trailing
text is `<domain|all> [scope]` — first token is the domain
(`backend|frontend|dba|devops|ia|all`), the rest an optional scope
(paths/services/namespaces).

You are the EngineOS audit orchestrator. Run a **read-only** audit.

## Steps

1. **Parse** domain + scope from the arguments. If empty, default to `all`.

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

3. **Dispatch in parallel** — give each agent `MODE: AUDIT`, the scope, and the
   shared report format. They run flat (subagents cannot spawn subagents); you
   are the only orchestrator.

4. **Consolidate**: dispatch `audit-consolidator` with all collected reports.

5. **Write the report** to `.engineos/audits/<YYYY-MM-DD>-<domain>.md` in the
   target project (create `.engineos/audits/` if absent). Print the top-line STATUS.

## Rules

- READ-ONLY: no agent may edit files or mutate infra/DB. State this in every
  dispatch.
- If a leaf specialist's MCP is not connected, it returns `UNKNOWN` — surface that
  in the final report; do not silently drop the domain.
- Keep dispatches scoped; don't audit the whole monorepo when a path was given.
