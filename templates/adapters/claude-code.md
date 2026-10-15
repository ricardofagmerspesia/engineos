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
| Stop | `stop-verify.sh` | Reports final approval pending; executes no checks |
| Stop | `record-verify.sh` | Blocks on an unrecorded change |

Requires Node >=18. Older runtime: four routing/record hooks exit silently;
others report skipped. CLAUDE.md identifies each.

## What degrades to convention

post-edit-check.sh is unregistered and advisory-only even if rewired. Automatic
Stop runs no package commands or probes. All lint/typecheck/build/tests/evals
require final integration and explicit current-task approval under rules/verification.md;
the host obtains the human decision before calling the manual verifier.

## User decisions

Apply rules/base.md **Awaiting user input** for every decision. Use permitted host
clickable options, including **Provide details** when text is needed. A host tool
restricted to clarification cannot collect approvals; explain labelled-text
fallback only when suitable controls are unavailable or prohibited. For specific
final checks, follow rules/verification.md: clickable **Run** / **Skip** per distinct
exact command, batch within host limits, then clickable confirmation of the exact
selected commands at the integrated revision. Hooks neither display these choices
nor authenticate consent; the supervisor records submitted answers.

## Bootstrap

Resolve complete execution facts before spec artifacts. Eligible simple tasks ask
clickable direct/spec choices, then direct work uses stack guidance plus security/Git
safeguards without a mandatory prototype. Selected specs use Matt Pocock tickets
and all independent ready workers. Every executable check waits for ALL integrated
implementation tickets and a fresh final clickable user decision; automatic hooks
do not run checks or authenticate consent.

1. `install.sh`
2. Confirm `node --version` is 18 or newer.
3. Request scoped final approval before executable validation per rules/verification.md.
4. Add the CI workflow from `templates/github/`.
