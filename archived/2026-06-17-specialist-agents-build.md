---
name: 2026-06-17-specialist-agents-build
status: done
completed: 2026-06-17
owner: Ricardo Fagmer
---

## What

Build the remaining specialist-agents feature on top of the 5 coordinators: the
MCP-bound leaf specialists, the audit consolidator, and the orchestrator commands.

## Why

The coordinators (built during review fixes) cover the domain layer. The spec
(`docs/superpowers/specs/2026-06-17-specialist-agents-design.md`) also calls for
MCP-bound leaves for deep, tool-backed audits and an orchestrator that fans out
and consolidates into a status report (the screenshot pattern).

## Scope

- `agents/{kubernetes,gcp,postgres,oracle,cicd}-specialist.md` — read-only,
  MCP-bound leaf specialists.
- `agents/audit-consolidator.md` — merges specialist reports into the final status
  block; Jira read-only for context.
- `commands/audit.md`, `commands/implement.md` — orchestrator entry points.
- `templates/permissions.template.json` — add specialist MCP server grants.
- Reconcile the spec status; update README + CLAUDE.md.

## Verification

- 13 agents total; new leaf/consolidator frontmatter has name+description+tools
  (server-level MCP grants: mcp__kubernetes/gcp/postgres/oracle/github/mcp-atlassian).
- 2 command files valid (description present).
- All MCP servers referenced exist in `templates/mcp.template.json`.
- All `agent:*` refs in routing-map resolve.
- JSON valid (plugin.json, mcp template, hooks.json); secrets gate clean (rc=1).
- Regression: routing 12/12, governance 6/6.

## Changes registered

1 commit 72979b3, files: agents/{kubernetes,gcp,postgres,oracle,cicd}-specialist.md,
agents/audit-consolidator.md, commands/{audit,implement}.md, mcp.template.json
(jira→mcp-atlassian), README.md, CLAUDE.md, CHANGELOG.md, plugin.json (1.2.0),
specialist-agents spec status. Movement: this record `git mv`'d changes/ → archived/.

## Notes

Runtime MCP reachability (live k8s/gcp/postgres/oracle/github creds) is out of
scope of building the files; flagged as a precondition for real audits.
See [[2026-06-17-specialist-agents-design]].
