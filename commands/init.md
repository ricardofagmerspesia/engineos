---
description: Adopt EngineOS in the current project in one command — scaffold the .engineos/ + docs/ layout (the opt-in signal every hook reads) and drop a deltas-only CLAUDE.md if the project has none. Idempotent; never overwrites user files.
argument-hint: (no arguments — operates on the current git project)
allowed-tools: Bash, Read
---

Adopt EngineOS in the current project.

Application backends must use NestJS, including API services, workers and LLM
service hosts. Node.js remains the runtime for tooling, scripts and libraries;
standalone Express or plain Node.js application servers are unsupported.
For an explicit stack declaration, use `--stack nestjs[@dir]` for a backend and
`next`, `react` or `react-native` for UI packages. `--stack node` and
`--stack express` return guidance rather than declaring a generic backend.
The default `--stack auto` keeps detection truthful for existing packages;
existing config files remain untouched. If an existing application backend is
not NestJS, identify the mismatch and scope its migration before extending it.

## Steps

1. Resolve the EngineOS install root — `${CLAUDE_PLUGIN_ROOT}` in plugin mode,
   the engineos repo otherwise, since this command runs with the target project
   as cwd and a bare relative `scripts/…` path there exits 127:

   ```bash
   ENGINEOS_ROOT=""
   for cand in "${CLAUDE_PLUGIN_ROOT:-}" $(readlink "$HOME"/.claude/commands/*.md 2>/dev/null); do
     d=$(cd "$(dirname "$cand")" 2>/dev/null && pwd) || continue
     while [ "$d" != "/" ]; do
       [ -x "$d/scripts/kernel.sh" ] && { ENGINEOS_ROOT="$d"; break 2; }
       d=$(dirname "$d")
     done
   done
   echo "$ENGINEOS_ROOT"
   ```

   Follow installed command symlinks upward to scripts/kernel.sh, skipping
   foreign commands. Read no personal config. If the loop prints nothing, report that EngineOS is unreachable
   from this project and stop — do NOT fall back to a bare or relative path.

2. Run the bootstrap, substituting the printed root (shell state does not survive
   between Bash calls):

   ```bash
   "$ENGINEOS_ROOT/scripts/init-project.sh" --dir "$(git rev-parse --show-toplevel)"
   ```

3. Show its output verbatim, then translate the exit code:
   - `1` — the machine install is missing (or `$HOME`/the checkout is broken; the
     message says which). Tell the user to run `install.sh` once first.
   - `2` — not a git work tree. Nothing to adopt.
   - `3` — this IS the EngineOS repo. Nothing to adopt.
   - `64` — bad usage; the invocation above is the supported one.

Do not edit `CLAUDE.md` yourself; the script leaves an existing one untouched on
purpose. `--dry-run` is available if the user wants to see the plan first.
