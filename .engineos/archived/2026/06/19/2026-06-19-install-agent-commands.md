---
name: 2026-06-19-install-agent-commands
status: done
owner: Ricardo Fagmer
completed: 2026-06-19
---

## What
Made `install.sh` link the generated per-agent slash commands. Section 4c now
globs `commands/agents/*.md` in addition to top-level `commands/*.md` and links
them FLAT into `~/.claude/commands/`, so they invoke as bare `/<name>` (e.g.
`/borisenko`) rather than a namespaced `/agents:<name>`.

## Why
The per-agent commands added in [[agent-slash-commands]] lived under
`commands/agents/` but the installer only linked top-level `commands/*.md`, so
`/borisenko` and friends never appeared in the live session.

## Scope
- `install.sh` (section 4c command-symlink loop)

## Verification
Ran `./install.sh`: all 26 agent commands reported "command linked" and resolve
as symlinks back to `commands/agents/*.md` (verified `borisenko.md`,
`backend-coordinator.md`). Session command registry now lists all 26.

## Changes registered
```
M  install.sh
1 file changed, 5 insertions(+), 1 deletion(-)
```

## Notes
Subdir would namespace commands in symlink mode, so the link is intentionally
flat. New commands require a session reload to appear in the picker.
