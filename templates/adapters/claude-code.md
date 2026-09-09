# Adapter — Claude Code

The reference implementation. Everything else degrades from this.

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
| Stop | `stop-verify.sh` | Blocks on failing lint/typecheck/tests |
| Stop | `record-verify.sh` | Blocks on an unrecorded change |

All of it needs node >= 18. Under an older node the four routing/record hooks
exit 0 silently and the rest print a `[engineos] <hook> skipped` message —
`CLAUDE.md` names which.

## What degrades to convention

The per-edit lint/typecheck: `post-edit-check.sh` is built but registered by
nothing, so scoped verification happens at the Stop gate instead of after each
edit. Everything else in the table above is enforced — this is the tool the
enforcement was written for.

## Bootstrap

1. `install.sh`
2. Confirm `node --version` is 18 or newer.
3. `scripts/validate-engineos.sh` — expect all checks green.
4. Add the CI workflow from `templates/github/`.
