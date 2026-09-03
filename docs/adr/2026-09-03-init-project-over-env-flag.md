# Bootstrap child projects with `scripts/init-project.sh` rather than an environment flag

Date: 2026-09-03
Status: accepted

Source: `docs/specs/2026-09-03-engineos-default-methodology-plan.md` Part A1 row 8, Part A2.4, Part A3 row "Adoption entry point".

## Context

Part A1 finding 8 — "Child-project adoption under-specified" — verdict **true**:

> `install.sh` is machine-scoped (symlinks into `~/.claude`, absolute `@import` in global `CLAUDE.md`). `hooks/ensure-project-layout.sh:70-73` scaffolds only where `.engineos/` already exists or `ENGINEOS_SCAFFOLD=1`. `templates/project-claude.md` is a manual copy. No per-project bootstrap command; `docs/ADOPTION.md` §2–3 describe three manual steps.

At authoring time the opt-in gate reads (observed at `hooks/ensure-project-layout.sh:63-67` in the current tree; the plan cites 70-73):

```sh
[ "${ENGINEOS_SCAFFOLD:-}" = "0" ] && exit 0
if [ ! -d "$ROOT/.engineos" ] && [ "${ENGINEOS_SCAFFOLD:-}" != "1" ]; then
  printf '[engineos] layout not scaffolded (opt-in): run `mkdir .engineos` in the project or set ENGINEOS_SCAFFOLD=1\n'
  exit 0
fi
```

So a project becomes an EngineOS project either by someone creating `.engineos/` by hand or by a machine-wide environment variable. Neither is a command a new developer can run, and the env-var path leaves nothing in the repo that says the project opted in.

## Options considered

1. **`scripts/init-project.sh` + `/engineos:init`; scaffold logic extracted to `hooks/scaffold-layout.sh` and shared with the SessionStart hook** (chosen).
   - Pros: one command, idempotent, visible in the repo afterwards (`.engineos/` is committed, which is the opt-in signal every hook already reads); the same scaffold code runs on init and on SessionStart, so the two cannot disagree about the layout.
   - Cons: new public surface (a script and a slash command) under `docs/COMPATIBILITY.md`; the extraction touches the SessionStart hook that every adopted project already runs, a regression risk; it still presupposes the machine install, so adoption remains two steps (machine, then project).
2. **`ENGINEOS_SCAFFOLD=1` in every shell profile** (rejected).
   - Pros: zero new code; works today.
   - Cons: Part A3: "Env var is machine-wide and invisible in the repo; `init` leaves `.engineos/` in git, which is the opt-in signal every hook already reads." Every repo on the machine is opted in, including ones that should not be, and a teammate cloning the project learns nothing from the tree.

## Decision

Option 1. Adoption is a per-project command that leaves its evidence in git. The deciding reasons: the opt-in signal must live in the repository, not in a shell profile, and the scaffold must have one implementation shared by the bootstrap and the hook.

## Consequences

The implementing task honours the Part A2.4 contract verbatim:

> `scripts/init-project.sh [--dir PATH] [--dry-run]` — idempotent; exits 1 with instructions if the machine install is missing; refuses to run inside the engineos repo; creates `.engineos/` + `docs/` via the shared scaffold; copies `templates/project-claude.md` to `CLAUDE.md` only when absent; prints the three remaining optional steps (MCP, CI, gates check). Exposed as `/engineos:init` (`commands/init.md`).

Further obligations:

- The scaffold logic moves out of `hooks/ensure-project-layout.sh` into `hooks/scaffold-layout.sh`; the SessionStart hook and `init-project.sh` both source it. There is one implementation of "create the standard layout".
- Idempotent means a second run on an initialised project changes nothing and exits 0; `--dry-run` prints what would be created and writes nothing.
- The script never overwrites an existing `CLAUDE.md`; a project's own conventions outrank EngineOS (non-negotiable #4).
- The existing `.engineos/`-present gate and the `ENGINEOS_SCAFFOLD` variable are not removed or changed by this decision. Retiring the variable would be a public-surface deprecation under `docs/COMPATIBILITY.md` and is not decided here.
- `docs/ADOPTION.md` §2–3 are rewritten around the one command; the three manual steps become the script's printed follow-ups.
- What becomes harder: `init-project.sh`, `/engineos:init` and `hooks/scaffold-layout.sh` are versioned surface from the day they land; renaming any of them later is a deprecation with a window.

Revisit triggers: the machine install becoming per-project (then `init` and `install` merge into one entry point), or a second adoption path (for example a GitHub template repository) that would make the shared scaffold the wrong abstraction level.
