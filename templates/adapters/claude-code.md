# Adapter — Claude Code

The reference implementation. Everything else degrades from this.

## How rules load

`install.sh` links this repo into `~/.claude/`. The user's `~/.claude/CLAUDE.md`
imports the project constitution, which `@`-imports the always-on set:

```markdown
@/path/to/engineos/CLAUDE.md
```

Route-loaded rules are read on demand by the model via the router table, and
mirrored deterministically for file edits by `hooks/routing-map.sh`.

## What is enforced

| Event | Hook | Effect |
|---|---|---|
| SessionStart | `ensure-project-layout.sh` | Scaffolds `.engineos/` + `docs/` (opt-in) |
| UserPromptSubmit | `task-scale-advisor.sh` | Fan-out and model-tier reminders |
| UserPromptSubmit | `gate-advisor.sh` | Decision rules that match the prompt |
| PreToolUse (edit) | `route-before-change.sh` | Injects the domain route for the file |
| PostToolUse (edit) | `mark-unrecorded.sh` | Sets the change-record flag |
| PostToolUse (edit) | `post-edit-check.sh` | Scoped lint/typecheck |
| Stop | `stop-verify.sh` | Blocks on failing lint/typecheck/tests |
| Stop | `record-verify.sh` | Blocks on an unrecorded change |

All of it needs `jq`. Without it, four of these exit 0 silently —
`scripts/validate-engineos.sh` checks for it.

## What degrades to convention

Nothing. This is the tool the enforcement was written for.

## Bootstrap

1. `install.sh`
2. Confirm `jq` is present.
3. `scripts/validate-engineos.sh` — expect all checks green.
4. Add the CI workflow from `templates/github/`.
