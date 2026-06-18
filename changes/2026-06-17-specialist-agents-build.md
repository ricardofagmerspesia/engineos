---
name: 2026-06-17-specialist-agents-build
status: active
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

(to be filled — frontmatter/tools lint, command file validity, agent refs resolve,
hooks test suites still green.)

## Notes

Runtime MCP reachability (live k8s/gcp/postgres/oracle/github creds) is out of
scope of building the files; flagged as a precondition for real audits.
See [[2026-06-17-specialist-agents-design]].
