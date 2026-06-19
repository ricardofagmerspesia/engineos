---
name: 2026-06-19-agent-slash-commands
status: done
owner: Ricardo Fagmer
completed: 2026-06-19
---

## What
Added direct slash-command entry points for every EngineOS agent, invocable by
canonical name or alias (e.g. `/engineos:backend-coordinator` or
`/engineos:borisenko`). Generated 26 command files (13 agents x name+alias) under
`commands/agents/` and a `scripts/gen-agent-commands.sh` generator that derives
them from the `name:` and `Alias:` fields of each `agents/*.md`.

## Why
Users could only reach agents through the orchestrator commands (`/engineos:audit`,
`/engineos:implement`). This lets a user call a single agent directly by its name
or its alias, no orchestrator needed.

## Scope
- `scripts/gen-agent-commands.sh` (new generator, idempotent wipe-and-rebuild)
- `commands/agents/*.md` (26 generated files)
- `README.md` (table row documenting the new per-agent commands)

## Verification
Ran the generator twice: produced 26 files both times with no stale leftovers
(clean `rm -rf` of the output dir each run). Spot-checked `borisenko.md` /
`backend-coordinator.md` content. No typecheck/lint applies (markdown + bash);
`bash` parsed and executed the script successfully on both runs.

## Changes registered
```
M  README.md
A  commands/agents/{ameer,arturo,audit-consolidator,backend-coordinator,borisenko,
   cicd-specialist,corradin,dba-coordinator,devops-coordinator,frontend-coordinator,
   gcp-specialist,gustavo,hermsdorff,hinokuma,kovac,kubernetes-specialist,leo-ely,
   leo,llm-coordinator,nakamura,oracle-specialist,pereira,postgres-specialist,
   ronaldo,security-reviewer,test-writer}.md
A  scripts/gen-agent-commands.sh
28 files changed, 398 insertions(+)
```

## Notes
Command files namespaced under `commands/agents/` so the generator's `rm -rf` of
its output dir can never clobber `commands/audit.md` / `commands/implement.md`.
Subdir is organizational only; invocation token stays `/<name>`. Re-run the
generator whenever agents are added, renamed, or re-aliased. See
[[auto-record-and-commit]] — this record + commit done automatically per standing
preference.
