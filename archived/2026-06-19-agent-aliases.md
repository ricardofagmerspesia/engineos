---
name: 2026-06-19-agent-aliases
status: done
completed: 2026-06-19
owner: Ricardo Fagmer
---

## What

Gave 7 specialist agents human-name aliases (invocable by either name), appended
to each agent's `description` frontmatter, and documented them in START.md.

borisenko=backend-coordinator, arturo=frontend-coordinator, hinokuma=devops-coordinator,
ronaldo=dba-coordinator, hermsdorff=llm-coordinator, leo=oracle-specialist,
corradin=audit-consolidator.

## Why

Friendlier, memorable handles for the team. Implemented as description aliases (not
renames) so the canonical names and all ~30 references (routing-map, commands,
CLAUDE.md, README, START, specs) stay intact and unbroken.

## Scope

- agents/{backend,frontend,devops,dba}-coordinator.md, llm-coordinator.md,
  oracle-specialist.md, audit-consolidator.md — alias appended to description.
- START.md — alias table in the Agents section.

## Verification

- Each agent: alias present in description; name/tools frontmatter unchanged.
- Gate clean (rc=1); routing 12/12, governance 6/6.
- "oracle-coordinator" in the request resolved to oracle-specialist (the only
  Oracle agent).

## Notes

Aliases live in the description so description-based dispatch matches either name;
no canonical names renamed. See [[2026-06-19-start-guide]].
