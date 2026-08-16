---
name: 2026-08-15-install-sh-windows-hook-wrap
status: in-progress
owner: Ricardo Fagmer
spec: none — single-file fix mirroring the pattern install.ps1 already carries
domain: general
---

## What
Made `install.sh` step 5 (hook merge into `~/.claude/settings.json`) Windows-safe,
mirroring `install.ps1`:

- On MSYS/MinGW/Cygwin, hook commands are registered as
  `"<git>/bin/bash.exe" "<hook>.sh"` with `cygpath -m` Windows paths — never as a
  bare `.sh` path. A bare `.sh` resolves through the Windows file association,
  which Git for Windows points at `git-bash.exe`, a terminal launcher that pops a
  visible `/usr/bin/bash --login -i` console window on EVERY hook fire (every
  prompt, edit, and stop) and stalls the tool that triggered the hook.
- The jq merge now scrubs every previously installed EngineOS hook entry (any
  command referencing the hooks dir, slash-normalized so `C:\...` and `C:/...`
  forms both match) before re-adding, instead of insert-if-absent keyed on the
  exact command string. A stale form from an earlier install — notably the
  bare-`.sh` spawner — is replaced, never left firing alongside the new one.
  This also retires `post-edit-check.sh` wiring generically, replacing the
  previous special-case `drop`.
- macOS/Linux behavior unchanged: bare script paths remain correct there and are
  still what gets registered (`BASH_EXE` stays empty outside Windows).

Alongside the repo fix, the live `~/.claude/settings.json` on this machine gets
the same cleanup applied directly (six bare-`.sh` duplicates removed, the
`bash.exe`-wrapped entries kept).

## Why
The user's desktop was flooded with Git Bash terminal windows
(`/usr/bin/bash --login -i C:\projects\engineer-spec-ia-pattern\hooks\...`) and
tools were blocking on them. Root cause: `install.ps1` had installed the correct
wrapped hooks, then a later run of the POSIX `install.sh` from Git Bash re-added
the same six hooks as bare `.sh` paths — its insert-if-absent check compares
exact command strings, so the wrapped entries did not stop the bare ones from
being added. Every hook fired twice: once silently, once as a popup window.
`install.sh` is the shared-team path (`git pull && ./install.sh` per README), so
without this fix any Windows machine regresses on the next re-install.

## Scope
- `install.sh` — step 5 rewritten: platform detection, `bash.exe` resolution
  (never bare `bash`, which can resolve to WSL), `hook_cmd` wrapper, scrub+add
  jq merge
- `~/.claude/settings.json` (this machine, not tracked) — six bare-`.sh` hook
  entries removed

## Not in scope
- `hooks/hooks.json` (plugin-mode wiring) carries the same latent bare-`.sh`
  pattern; spun off as its own task (running in a separate session) because how
  Claude Code executes plugin hooks on Windows must be verified first.
- `install.ps1` — already correct; untouched.

## Checklist
- [ ] `install.sh` passes `bash -n` (blocked: Bash tool gated by classifier
      outage at the time of writing — verify before archive)
- [ ] scrub+add jq program verified against a fixture containing bare +
      wrapped + backslash-form + unrelated third-party entries (fixture staged
      in session scratchpad; run blocked by the same outage)
- [ ] `~/.claude/settings.json` cleaned (write blocked by classifier outage;
      re-running `install.ps1` or the patched `install.sh` achieves the same)
- [ ] popups confirmed gone in a fresh session

## What was made
(fill on completion)
