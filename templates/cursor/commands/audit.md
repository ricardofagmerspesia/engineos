# /audit — read-only multi-domain audit

Orchestrate a read-only multi-domain audit: fan out to domain coordinators + MCP
leaf specialists in parallel, then consolidate into a status report. Trailing
text is `<domain|all> [scope]` — first token is the domain
(`backend|frontend|mobile|dba|devops|llm|security|all`), the rest an optional
scope (paths/services/namespaces). `ia` is accepted as a deprecated alias for
`llm`.

You are the EngineOS audit orchestrator. Run a **read-only** audit.

## Steps

1. **Parse** domain + scope from the arguments. If empty, default to `all`.

2. **Select agents** by domain (always dispatch the coordinator and, when its
   domain is in scope, every leaf specialist listed — an unconnected leaf
   self-reports `UNKNOWN` rather than being skipped):

   | domain | agents to dispatch (parallel) |
   |---|---|
   | backend  | backend-coordinator |
   | frontend | frontend-coordinator |
   | mobile   | mobile-coordinator (parity report) |
   | dba      | dba-coordinator, postgres-specialist, oracle-specialist |
   | devops   | devops-coordinator, kubernetes-specialist, gcp-specialist, cicd-specialist |
   | llm      | llm-coordinator |
   | security | security-reviewer |
   | all      | the six domain coordinators — backend, frontend, mobile, dba, devops, llm — plus security-reviewer (add leaves only if scope names that domain) |

3. **Dispatch ready scoped audits** up to useful policy/host capacity (reserve
   supervisor slot); queue excess and refill promptly. Brief MODE: AUDIT, scope,
   routed rules/skills/patterns, model: opus (analysis/design, rules/models.md)
   and shared report format. Flat workers; only supervisor dispatches.

4. **Consolidate**: dispatch `audit-consolidator` with all collected reports.

5. **Write the report** to `.engineos/audits/<YYYY-MM-DD>-<domain>.md` in the
   target project (create `.engineos/audits/` if absent). Print the top-line STATUS.

6. **Offer the output artifact** once the report is delivered: flowchart of the
   findings/remediation plan, a scaffold for the top fix, or none — audit is not
   a frontend/mobile intent, so skip the template/UI-UX options.

## Rules

- READ-ONLY: no agent may edit files or mutate infra/DB. State this in every
  dispatch. This is prompt-enforced, not tool-enforced — the six domain
  coordinators hold `Edit`/`Write` unconditionally, and the MCP leaf specialists
  hold `Bash`; treat any write or mutation during an audit as a defect.
- If a leaf specialist's MCP is not connected, it returns `UNKNOWN` — surface that
  in the final report; do not silently drop the domain.
- Keep dispatches scoped; don't audit the whole monorepo when a path was given.
