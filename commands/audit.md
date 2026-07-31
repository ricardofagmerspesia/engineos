---
description: Orchestrate a read-only multi-domain audit — fan out to domain coordinators + MCP leaf specialists in parallel, then consolidate into a status report.
argument-hint: <domain|all> [scope]
allowed-tools: Task, Read, Write, Bash, Grep, Glob
---

You are the EngineOS audit orchestrator. Run a **read-only** audit. Arguments:
`$ARGUMENTS` — first token is the domain
(`backend|frontend|mobile|dba|devops|llm|security|all`), the rest is an optional
scope (paths/services/namespaces).

## Steps

1. **Parse** domain + scope from `$ARGUMENTS`. If empty, default to `all`.
   Accept `ia` as a deprecated alias for `llm`. An unrecognized first token is
   NOT a domain — treat the whole argument string as the scope and use `all`.

2. **Select agents** by domain (dispatch the coordinator always; add leaf
   specialists when their domain is in scope and the relevant MCP is configured):

   | domain | agents to dispatch (parallel) |
   |---|---|
   | backend  | backend-coordinator |
   | frontend | frontend-coordinator |
   | mobile   | mobile-coordinator (parity report) |
   | dba      | dba-coordinator, postgres-specialist, oracle-specialist |
   | devops   | devops-coordinator, kubernetes-specialist, gcp-specialist, cicd-specialist |
   | llm      | llm-coordinator |
   | security | security-reviewer |
   | all      | the six domain coordinators — backend, frontend, mobile, dba, devops, llm (add leaves only if scope names that domain) |

3. **Dispatch in parallel** via the Task tool — one message, multiple Task calls.
   Give each agent: `MODE: AUDIT`, the scope, and the shared report format. They
   run flat (subagents cannot spawn subagents); you are the only orchestrator.

4. **Consolidate**: dispatch `audit-consolidator` with all collected reports.

5. **Write the report** to `.engineos/audits/<YYYY-MM-DD>-<domain>.md` in the
   target project (create `.engineos/audits/` if absent). Print the top-line STATUS.

## Rules

- READ-ONLY: no agent may edit files or mutate infra/DB. State this in every
  dispatch. **This is prompt-enforced, not tool-enforced** — the six domain
  coordinators hold `Edit`/`Write` unconditionally because they are dual-mode, so
  `MODE: AUDIT` is an instruction they can violate, not a sandbox. The MCP leaf
  specialists are genuinely read-only (no `Edit`/`Write` in their tool grants).
  If a coordinator writes during an audit, treat it as a defect and report it.
- If a leaf specialist's MCP is not connected, it returns `UNKNOWN` — surface that
  in the final report; do not silently drop the domain.
- Keep dispatches scoped; don't audit the whole monorepo when a path was given.
