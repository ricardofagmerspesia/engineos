# EngineOS Specialist Agents — Design

Date: 2026-06-17
Status: Implemented. 5 domain coordinators, 5 MCP leaf specialists
(kubernetes/gcp/postgres/oracle/cicd), audit-consolidator, and the
`/engineos:audit` + `/engineos:implement` orchestrator commands are built.
Precondition for real audits: the leaf MCPs (k8s/gcp/postgres/oracle/github)
must be connected with read-only creds on the machine running the audit.
Note: `permissions.template.json` intentionally does NOT auto-allowlist these
MCP servers — several expose write tools, so prompts stay on (least privilege);
scope safety via read-only MCP connections instead.

## Goal

Add a domain-specialist agent system to the EngineOS plugin that mirrors the
orchestrator → specialist → consolidated-report pattern shown in the reference
screenshot, across five domains: **backend, frontend, devops, dba, ia**.

Two operating modes:
- **audit** — read-only inspection of code + infra + data, returns a consolidated
  status report (CRITICAL / WARN / OK + root cause + remediation plan).
- **implement** — coordinated multi-domain change.

## Constraint that shapes the architecture

Claude Code subagents **cannot spawn other subagents** (the Agent/Task tool is not
available inside a subagent). True runtime nesting (a specialist spawning a
sub-specialist) is therefore not possible. The reference screenshot is in fact a
**flat dispatch**: the command (main agent) dispatches leaf specialists in
parallel, then dispatches a consolidation agent. This design follows that model —
nesting is organizational (encoded in the orchestrator's routing map), execution
is flat.

## Components

### Commands (`commands/`)

Two entry points; both embed the orchestrator logic (classify scope → select
agents → dispatch in parallel → dispatch consolidator → write report).

- `commands/audit.md` → `/engineos:audit <domain|all> [scope]`
  Read-only. Dispatch prompt to every agent includes an explicit
  `MODE: AUDIT — read-only, do not modify any file` constraint.
- `commands/implement.md` → `/engineos:implement <domain|all> <task>`
  Dispatch prompt includes `MODE: IMPLEMENT` and the concrete task.

Domain token maps to a set of agents (the routing map):

| `<domain>` | Agents dispatched |
|---|---|
| `backend`  | backend-coordinator (+ leaf cicd-specialist if CI in scope) |
| `frontend` | frontend-coordinator |
| `devops`   | devops-coordinator, kubernetes-specialist, gcp-specialist, cicd-specialist |
| `dba`      | dba-coordinator, postgres-specialist, oracle-specialist |
| `ia`       | ia-coordinator |
| `all`      | all 5 coordinators in parallel |

`scope` (optional) narrows to specific paths/services and, when present, lets the
orchestrator dispatch a specific leaf instead of the whole coordinator.

### Agents (`agents/`) — 11 files

**5 domain coordinators** (standalone generalists, carry the domain's combined
knowledge; usable directly or via a command):
- `backend-coordinator` — NestJS/API/data/queues. Tools: Read, Grep, Glob, Bash, Edit, Write, nestjs MCP.
- `frontend-coordinator` — React/Next/styling/perf/a11y. Tools: Read, Grep, Glob, Bash, Edit, Write.
- `devops-coordinator` — CI/CD, containers, clusters, cloud, observability. Tools: Read, Grep, Glob, Bash, Edit, Write.
- `dba-coordinator` — schema, migrations, query performance, data access. Tools: Read, Grep, Glob, Bash, Edit, Write.
- `ia-coordinator` — prompts, RAG, agent tooling, evals. Tools: Read, Grep, Glob, Bash, Edit, Write.

**5 MCP-bound leaf specialists** (deep, narrow, each gets only its MCP):
- `kubernetes-specialist` — kubernetes MCP (read-only cluster context).
- `gcp-specialist` — gcp MCP.
- `cicd-specialist` — github MCP (workflows, PRs, CI status).
- `postgres-specialist` — postgres MCP (read-only role).
- `oracle-specialist` — oracle MCP.

**1 consolidator**:
- `audit-consolidator` — merges leaf/coordinator reports into the final status
  block. Read-only. May pull related Jira issues for context (jira MCP,
  **read-only — never writes**). Tools: Read, jira MCP.

Each agent file = frontmatter (`name`, `description`, `tools`) + a tight prompt
covering: scope, method, output format. Output format is shared across agents so
the consolidator can merge deterministically (see below).

### Shared specialist report format

Every specialist returns:

```
## <agent>: <target>
### Findings
[CRITICAL|WARN|OK] <title>
- Where: <file:line | resource | table>
- Evidence: <what was observed>
- Fix: <one-line remediation direction>
### Checked and clear
- <area> — <why it's fine>
### Status: CRITICAL | DEGRADED | OK
```

Consolidator output (final block, matches screenshot):

```
# <domain|all> Analysis — STATUS: <CRITICAL|DEGRADED|OK>
## Summary
## Root cause
## Remediation plan (ordered)
## Per-specialist detail
```

## Mode / safety trade-off

Coordinators carry Edit/Write so they can serve `implement`. In `audit` mode the
command's dispatch prompt forbids edits (instruction-level, not tool-level). Leaf
specialists and the consolidator are read-only at the tool level. This avoids
doubling the agent count (separate audit/implement files) at the cost of relying
on the prompt constraint for coordinator read-only behavior in audit mode.

## MCPs

No new MCP definitions needed — all six (github, postgres, oracle, kubernetes,
gcp, jira) already exist in `templates/mcp.template.json`. Work required:
- Add per-agent `tools` allowlists referencing the specific MCP server.
- Extend `templates/permissions.template.json` with the specialist MCP
  permissions so the shared allowlist covers them.

## Memory / persistence

- **Audit reports** → `docs/audits/<YYYY-MM-DD>-<domain>.md` in the **target**
  project (team-shared artifact, per `rules/memory.md` — not personal memory).
  The orchestrator writes this after consolidation.
- **Personal memory** (`~/.claude/.../memory/`) — only user prefs (e.g. default
  domain), never team findings.

## Router integration

Add a row to the EngineOS router table in `CLAUDE.md`:

| Intent | Load |
|---|---|
| Multi-domain audit / health check ("audit", "analyze the system", "what's broken across X") | `/engineos:audit` orchestrator |

## Packaging

Lives inside the engineos plugin. `commands/` is a new directory; `agents/`
already exists. Verify plugin auto-discovery of both dirs; update
`.claude-plugin/plugin.json` only if explicit command/agent paths are required.

## Out of scope (YAGNI)

- Non-MCP leaf specialists (depth folded into coordinators).
- Jira ticket creation (read-only only).
- Separate audit/implement agent files.
- mysql / aws / azure / slack / discord specialists (MCPs exist; add on demand).

## Verification

- Each agent file: valid frontmatter, `tools` allowlist correct, prompt has the
  shared output format.
- `/engineos:audit all` dispatches 5 coordinators and produces a consolidated
  report with a top-line STATUS.
- Audit run writes `docs/audits/<date>-all.md`.
- Lint/format hooks pass on changed files.
