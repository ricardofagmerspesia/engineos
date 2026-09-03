---
name: 2026-09-03-init-project-adoption
status: active
owner: devops-coordinator
spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md
domain: devops
---

## What
One-command adoption of EngineOS in a child project: `scripts/init-project.sh` plus
the `/engineos:init` slash command, backed by a single shared scaffold function
(`hooks/scaffold-layout.sh`) that the SessionStart hook and the bootstrap both use.

## Why
Adoption was a manual, multi-step ritual (copy the CLAUDE.md template, `mkdir
.engineos` or export `ENGINEOS_SCAFFOLD=1`, open a session and hope the hook fires).
Every step was a place to stop halfway, and a half-adopted project gets no routing,
no risk classification and no change-record gate. The scaffold logic also existed
only inside the SessionStart hook, so nothing else could reuse it without copying
it — and a second copy is a second definition of "the standard layout".

## Scope
- `hooks/scaffold-layout.sh` (new) — `engineos_scaffold_layout <root> <repo_dir>`
- `hooks/ensure-project-layout.sh` — calls the shared function instead of its own loop
- `scripts/init-project.sh` (new, executable) — project-scoped bootstrap
- `commands/init.md` (new) — `/engineos:init`
- `templates/project-claude.md` — LLM router hint + `## EngineOS` section
- `docs/ADOPTION.md` — §2 and §3 collapsed into one "one command" step
- `install.sh` — one per-project hint line after the success message
- `hooks/test-layout.sh` — init-project cases

## Checklist
- [x] Write the failing hook test cases in `hooks/test-layout.sh`
- [x] Extract the scaffold into `hooks/scaffold-layout.sh` (single implementation)
- [x] Rewire `hooks/ensure-project-layout.sh` onto the shared function
- [x] Write `scripts/init-project.sh` with the 0/1/2/3 exit contract, executable
- [x] Add the `/engineos:init` slash command
- [x] Update `templates/project-claude.md`, `docs/ADOPTION.md`, `install.sh`
- [ ] Run `hooks/test-layout.sh` and `shellcheck` (deferred to the final gate)
- [ ] Validator check C29 wiring (moved to a separate task by controller ruling)

## What was made
`hooks/scaffold-layout.sh` now holds the only implementation of the standard-layout
scaffold: `engineos_scaffold_layout <project_root> <engineos_repo_dir>` walks
`LAYOUT_MANIFEST`, creates each missing dir, seeds missing files from the manifest's
`src:dest` pairs, prints each created dir on its own line and always returns 0 so a
session start can never break on it. `hooks/ensure-project-layout.sh` lost its
private copy of that loop (and its `resolve_src` helper) and now sources the shared
file defensively (`2>/dev/null || exit 0`), joins the printed list with a bash
substitution and prints the same one warn line it printed before. Everything above
the scaffold in that hook — bypass expiry, the
stale-flag and telemetry reaps, the engineos-repo skip, the `ENGINEOS_SCAFFOLD`
opt-in gate — is byte-identical.

`scripts/init-project.sh` is the project-scoped counterpart to the machine-scoped
`install.sh`. It gates on the machine install being present (the same `IMPORT_RE`
regex `install.sh` uses on `~/.claude/CLAUDE.md`, exit 1), on the target being a git
work tree (exit 2), and refuses to run inside the EngineOS repo itself (exit 3,
detected by the `hooks/layout-manifest.sh` + `hooks/hooks.json` + `install.sh` triple at the root, or by the root equalling the EngineOS checkout; 64 = bad usage). Then it scaffolds
the layout through the shared function and copies `templates/project-claude.md` to
`<project>/CLAUDE.md` only when the project has none — an existing one is reported
and left untouched. `--dry-run` prints what it would ensure without writing;
`--dir PATH` targets another checkout. It closes with the follow-ups that stay
optional (MCP servers, CI agents, gate confirmation).

`commands/init.md` exposes it as `/engineos:init`: resolve the EngineOS repo from the
import line, run the script against the git toplevel, show the output verbatim, and
translate exit 1 / exit 3 into plain advice. It explicitly tells the model not to
edit `CLAUDE.md` itself.

`docs/ADOPTION.md` §2 and §3 became one section, "Adopt EngineOS in the project (one
command)", stating what the script creates, that committing `.engineos/` and
`CLAUDE.md` is what makes the SessionStart scaffold and the Stop gate engage for
every teammate rather than just the person who ran it, and keeping the old hook-only
path as a "Manual equivalent" sub-heading. §4-9 are unchanged and unrenumbered.
`install.sh` gained one hint line after its success message; its fail-closed secrets
gate was not touched. `templates/project-claude.md` got the RAG-baseline pointer on
the LLM router-hint row and a final `## EngineOS` section recording how the project
was adopted and where it requires tests.

`hooks/test-layout.sh` gained eight assertions covering the exit-0 fresh-repo path,
`.engineos/changes` creation, the CLAUDE.md copy, idempotency, the never-overwrite
guarantee, exit 1 without the machine install, exit 3 inside the EngineOS repo, and
that the SessionStart hook stops printing the opt-in hint once init has run. They use
a fake `HOME` so the suite never reads or writes the operator's real
`~/.claude/CLAUDE.md`.

## Verification
UNVERIFIED beyond syntax. Per the dispatch brief and the fix-round ruling, the only
check executed was `bash -n` on all four shell files (clean). The eight test cases
were written but `hooks/test-layout.sh` was not run, and `shellcheck -S error` was
not run against `hooks/scaffold-layout.sh`, `scripts/init-project.sh` or
`hooks/ensure-project-layout.sh`. Both belong to the final gate, which runs once
after the last unit of the plan is integrated.

## Changes registered
```
 M .engineos/changes/2026-09-03-init-project-adoption.md   (new, this record)
 M docs/ADOPTION.md
 M hooks/ensure-project-layout.sh
 M hooks/test-layout.sh
 M install.sh
 M templates/project-claude.md
?? commands/init.md
?? hooks/scaffold-layout.sh
?? scripts/init-project.sh
```
`git log --oneline ef387ee..HEAD` on `feat/init-project-adoption`:
```
1425664 feat(adoption): add init-project bootstrap and /engineos:init
<fix>  fix(adoption): drop paste, harden init exit codes
```
The second line is the review fix-round-1 commit that carries this very edit, so it
cannot hold its own sha; the sha is recorded in
`.superpowers/sdd/2026-09-03-engineos-default-methodology-plan/task-7-report.md`
under `## Fix round 1`.

## Notes
- The scaffold function is the seam that makes one-command adoption honest: the hook
  and the bootstrap cannot disagree about what "the layout" is, because there is one
  definition. Any future third caller (a CI adoption check, a `--repair` flag) gets
  it for free.
- `.engineos/` presence stays the opt-in signal. Init does not invent a new flag; it
  just creates the signal deliberately instead of asking the user to `mkdir` it.
- `templates/project-claude.md` names EngineOS 1.6.0 in its new `## EngineOS`
  section, per the plan. `.claude-plugin/plugin.json` is still 1.5.0 at this base
  commit — the version bump is another task's file, so this line is correct only once
  that lands.
- Validator check C29 (wiring assertions) was deliberately left out of this change by
  controller ruling; `scripts/validate-engineos.sh` and its test file are untouched.
- paste removed after review; sandbox list unchanged. Both scripts join the scaffold's
  line-per-dir output with `${var//$'\n'/, }` instead, so the hook keeps working on a
  reduced PATH and `init-project.sh` can no longer exit 127 outside its contract.
