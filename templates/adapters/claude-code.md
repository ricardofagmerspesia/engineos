# Adapter — Claude Code

Reference hook implementation.

## How rules load

`install.sh` links this repo into `~/.claude/`. The user's `~/.claude/CLAUDE.md`
imports the project constitution, which `@`-imports the always-on set:

```markdown
@/path/to/engineos/CLAUDE.md
```

Route-loaded rules are read on demand by the model via the router table, and
mirrored deterministically for file edits by `hooks/route-before-change.sh`,
which resolves `registries/routing.json` through `scripts/kernel.sh route-path`.

## What is enforced

| Event | Hook | Effect |
|---|---|---|
| SessionStart | `ensure-project-layout.sh` | Scaffolds `.engineos/` + `docs/` (opt-in) |
| UserPromptSubmit | `prompt-advisor.sh` | One kernel call: task contract, fan-out and model-tier reminders, matching decision rules, route escalation |
| PreToolUse (edit) | `route-before-change.sh` | Injects the domain route for the file |
| PreToolUse (`Agent`/`Task`) | `announce-agent-dispatch.sh` | Re-injects the dispatch banner |
| PostToolUse (edit) | `mark-unrecorded.sh` | Sets the change-record flag |
| PostToolUse (`Agent`/`Task`) | `announce-agent-return.sh` | Re-injects the return banner |
| Stop | `stop-verify.sh` | Blocks on failing lint/typecheck |
| Stop | `record-verify.sh` | Blocks on an unrecorded change |

Requires Node >=18. Older runtime: four routing/record hooks exit silently;
others report skipped. CLAUDE.md identifies each.

## What degrades to convention

post-edit-check.sh is unregistered; scoped checks run at final Stop, not every
edit. Hooks enforce the table when runtime requirements hold. Tests/evals are
separate final actions requiring current-task human approval.

## Bootstrap

1. `install.sh`
2. Confirm `node --version` is 18 or newer.
3. Final approved validation per rules/verification.md; behavioral validator needs test approval.
4. Add the CI workflow from `templates/github/`.
