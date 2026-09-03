---
description: Adopt EngineOS in the current project in one command — scaffold the .engineos/ + docs/ layout (the opt-in signal every hook reads) and drop a deltas-only CLAUDE.md if the project has none. Idempotent; never overwrites user files.
argument-hint: (no arguments — operates on the current git project)
allowed-tools: Bash, Read
---

Adopt EngineOS in the current project. Resolve the EngineOS repo from the
import line in `~/.claude/CLAUDE.md` (the line matching `^@.*CLAUDE.md$`,
directory part), then run:

```bash
"$ENGINEOS_DIR/scripts/init-project.sh" --dir "$(git rev-parse --show-toplevel)"
```

Show its output verbatim. Exit 1 means the machine install is missing — tell
the user to run `install.sh` first. Exit 3 means this IS the EngineOS repo —
nothing to adopt. Do not edit `CLAUDE.md` yourself; the script leaves an
existing one untouched on purpose.
