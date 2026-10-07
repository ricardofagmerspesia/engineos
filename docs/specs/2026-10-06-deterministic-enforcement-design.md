# Deterministic enforcement: moving rules from instruction to mechanism — design

*Status: DRAFT for refinement · 2026-10-06 · Sergio Hermsdorff (owner), drafted with Claude*
*Companion: `2026-10-06-routing-decision-layer-design.md`. Nothing here is implemented; open questions are marked `[?]`.*

## 1. Problem

Most of EngineOS is delivered deterministically and obeyed probabilistically. Hooks
reliably inject the contract and the routing; whether the model then loads the rule,
dispatches the agent, writes the spec or waits for approval is an instruction, and
instructions get dropped under pressure. The developer's own rule, "no git writes
without my permission", was bypassed by agents even after the guard shipped.

Measured on 2026-10-06 against the installed guard (`hook git-write-guard`):

| Command | Guard |
|---|---|
| `git commit -m x` | ask |
| `npm version patch` | silent |
| `sh ./scripts/release.sh` | silent |
| `node -e "execSync('git commit -am x')"` | silent |
| `make release` | silent |
| `python3 deploy.py` | silent |

The guard inspects command text for the tokens `git`/`gh`. Any program that reaches
git on its own is invisible to it. The second bypass is plainer: sessions opened before
the installer re-run on 2026-09-29 never loaded the hook.

Claude Code facts (docs read 2026-10-06): a hook's `ask` forces a prompt even in auto
mode and the classifier cannot approve it silently; PreToolUse hooks fire for
subagents' tool calls too. So the guard is sound for what it sees; the gap is what it
cannot see.

## 2. The honest map

| Rule | Today | Enforceable? | Proposed mechanism |
|---|---|---|---|
| Git writes need the developer's approval | Bash-command guard (bypassable by indirection) | **Yes** | E1 git-layer hooks |
| Dispatch the agent the row names | prose (`rules/subagents.md`) | **Yes, at Stop** | E2 dispatch audit |
| Spec before code (>2 files / new feature) | prose (non-negotiable #1) | **Yes, at Stop** | E3 spec counter |
| Topology approval before graph code | prose + hitl note | **Yes, at write time** | E4 write block |
| No secrets in commits | prose + installer scan of the EngineOS repo only | **Yes, at commit** | E5 secret scan |
| Model tier per agent | agent frontmatter (harness-enforced) | already | — |
| Tests opt-in | Stop gate reads `ENGINEOS_VERIFY_TESTS` | already | — |
| Lint/typecheck before "done" | Stop gate | already | — |
| Change record before "done" | Stop gate | already | — |
| Load the rules the contract named | prose | **No** (cannot observe reading) | reduce exposure: E6 context isolation |
| Classify risk before the first write | prose | partial | E7 risk line check `[?]` |
| Offer the output artifact | prose | no | leave as prose |
| One step at a time in the design form | prose | partial | E4 covers the outcome, not the dialogue |

"Enforceable" means a hook or a git hook can refuse the action or refuse "done".
Everything else stays an instruction and is said so in `rules/gates.md`.

## 3. Mechanisms

### E1. Git writes at the git layer

**Where.** A global `core.hooksPath` (`~/.claude/engineos-git-hooks/`) installed by
`install.sh`, holding `pre-commit`, `pre-push`, `reference-transaction` and
`pre-rebase`. `reference-transaction` fires on every ref update (commit, branch,
tag, reset, merge, rebase, checkout of branches) whatever process caused it; `pre-push`
covers the network write; `pre-commit` gives the earliest, clearest message.

**Condition.** The hook refuses when all hold: `CLAUDE_CODE_ENTRYPOINT` is set (Claude
Code sets it in every shell it spawns, including subagents' and wrapper scripts'),
`ENGINEOS_GIT_WRITES` is not exactly `auto`, and no approval is present.

**Approval, two sources, either suffices.**
1. **In-app approval carried into the command.** The Bash guard keeps answering `ask`,
   and adds `updatedInput` prefixing the command with `ENGINEOS_GIT_APPROVED=<nonce>`.
   The nonce is written by the Bash guard to `~/.claude/engineos-git-approvals/<nonce>`
   with a 60 s expiry `[?]` and is consumed by the git hook on first use. The developer
   approving the prompt is what lets the prefixed command run; an agent typing the
   prefix itself still hits the Bash guard, because any command containing
   `ENGINEOS_GIT_APPROVED` is treated as a write and asks.
2. **A dialog raised by the git hook itself** when no nonce is present (the
   indirection case): macOS `osascript` "Claude Code wants to `<op>` in `<repo>`.
   Allow / Deny"; Linux `zenity`; Windows PowerShell. Deny → exit 1 with the reason;
   no dialog tool available → refuse with a message naming the command that was
   blocked and how to approve it. `[?]` The dialog is the part that makes wrappers
   safe; without it, E1 only blocks and the developer re-runs the direct git command.

**Bypass analysis.** `npm version`, scripts, `node -e`, `make`, Python: all end in a
git ref update under `CLAUDE_CODE_ENTRYPOINT` → caught. `git -c core.hooksPath=/dev/null`:
the Bash guard tokenizer sees `-c core.hooksPath` and asks; `[?]` treat any
`core.hooksPath` or `--no-verify` in a command as a write that asks. A repo-local
`.git/hooks` does not override a global `core.hooksPath`, but a repo that sets
`core.hooksPath` in its own config would: the installer's global hook is also written
as `init.templateDir`, and `init-project.sh` sets the repo's `core.hooksPath` to the
EngineOS dir when it differs. `[?]` Husky-style projects (console/ uses none; LabV
repos: check) need the EngineOS hook to chain to the project's own hooks dir.

**Scope.** `install.sh`/`install.ps1`, new `hooks/git/*` scripts, `src/hooks/git-write-guard.ts`
(nonce + `updatedInput`), `src/install/*` (hooks path setup, idempotent, never
overwrites a user's existing global `core.hooksPath` without asking — `[?]` refuse
install with a message instead), tests with a temp repo and a fake dialog command,
`rules/git.md`, docs.

### E2. Agent dispatch audit at Stop

**Fact.** `announce-agent-dispatch` writes an `agent` span per dispatch to the exec
journal with the agent name; the prompt-advisor writes a `router` span per prompt
with the contract's agents.

**Mechanism.** A Stop check: for every `router` span of this session whose contract
named agents, and whose prompt led to edits (the unrecorded flag or the transcript
says files changed), require at least one `agent` span for each named agent after
that prompt. Missing → block once: `EngineOS gate: the contract named <agent> and
it was never dispatched. Dispatch it, or record why under "## Human decisions"`.
A recorded waiver line (`<date> | <developer> | dispatch-waived | <agent> | <reason>`)
in the change record satisfies the gate.

**Limits.** Checks dispatch, not quality; a dispatched agent that did nothing still
passes. Pure questions produce no edits and are exempt.

**Scope.** new `src/hooks/dispatch-verify.ts` (Stop, after `stop-verify`), journal
reader, `hooks.json`, `rules/subagents.md` (states it is enforced), tests over a fake
journal. `[?]` Whether `dispatch-waived` joins the hitl vocabulary (C26) or is a
record-only token.

### E3. Spec before code, as a counter

**Fact.** `stop-verify` already extracts the edited files from the transcript.

**Mechanism.** At Stop, when the edited code files for this session exceed 2 (the
non-negotiable's threshold) and the active change record's `spec:` is `n/a` or
missing, or the prompt matched `rule-spec-threshold`'s new-feature signal, block
once: `EngineOS gate: <n> files changed and the change record links no spec`. A
record with `spec: n/a — <reason>` passes (the escape hatch already exists in the
template).

**Scope.** new `src/hooks/spec-verify.ts` or a branch in `record-verify.ts`, record
front-matter reader, tests, `rules/gates.md` Design row becomes "blocking at Stop".

### E4. Topology approval as a write block

**Mechanism.** PreToolUse `Write|Edit|NotebookEdit` under `**/graph/**`, `**/agents/**`,
`**/tools/**` (the Python agent-project layout; `[?]` make the globs a
`policy.json` list) in a repo whose active change record carries `domain: llm` and no
`topology-approval | approved` line → `permissionDecision: deny` with the reason and
the path of the record. Files outside those trees are untouched. Deferred last week
as "instruction-level for now"; this is the follow-up.

**Scope.** branch in `src/hooks/route-before-change.ts` (it already sees the path and
the root), record reader shared with E3, tests, `rules/llm-apps.md` wording.

### E5. Secrets at commit time

**Mechanism.** The E1 `pre-commit` hook runs the installer's `SECRET_PATTERNS`
(moved to one shared file, `registries/secret-patterns.json`, read by both) over the
staged diff; a hit refuses the commit and names the file and line. Under
`CLAUDE_CODE_ENTRYPOINT` and outside it alike: a human committing a key is the same
leak.

**Scope.** `hooks/git/pre-commit`, `install.sh` (reads the shared file), tests.

### E6. Context isolation per stack (reduces what cannot be enforced)

- `rules/base.md` idioms split into `rules/idioms-ts.md` and `rules/idioms-python.md`,
  loaded by the stack-bearing rows, not always-on.
- Skills visible per stack: `install.sh` links all skills (unchanged), but the advisor
  tells Claude which skills are **not applicable** to the resolved stack in one line;
  `[?]` stronger: `.engineos/config.json` `stack` drives a per-repo
  `~/.claude/skills` view — not possible with symlinks shared across repos; leave as the
  advisor line.
- `llm-engineering` and `eval-harness` split their Node and Python examples into
  `references/<stack>.md`, the body stays agnostic.
- `templates/project-claude.md`: `init` writes only the resolved stack's block (today it
  writes both and asks the developer to delete one).

### E7. Risk classification check `[?]`

The router line `[router] intent=… risk=… autonomy=…` is prose. A PostToolUse check
after the first `Write` of a session could require that the transcript contains a
`[router]` line with a risk tier before it, blocking at Stop otherwise. Cheap, but it
verifies the line was written, not that it was thought about. `[?]` Worth it, or
theatre.

## 4. What stays an instruction, and is said so

Reading a rule, the quality of a plan, the honesty of a `done` claim beyond lint,
typecheck and tests, the output-artifact offer, the one-step-at-a-time dialogue of the
design form. `rules/gates.md`'s strength column is updated so every row says
`blocking`, `checked` or `instruction` with no softer word.

## 5. Order of work (after refinement, on the developer's word)

| Wave | Units | Why this order |
|---|---|---|
| 1 | E1 git layer (hooks, nonce, dialog, installer), E5 secret scan (same hook) | the rule the developer was burned by |
| 2 | E2 dispatch audit, E3 spec counter (share the record reader) | turns the two most-ignored instructions into gates |
| 3 | E4 topology write block, E6 context isolation | closes last week's deferral; shrinks wrong context |
| 4 | E7 if kept, docs, `rules/gates.md` strengths, COMPATIBILITY, change record | |

Each wave: typecheck, tests, validator, evals green; E1 additionally proven with the
six commands above against a temp repo, and against a real session after `install.sh`.

## 6. Open questions, collected

1. E1 nonce expiry (60 s?) and whether the dialog path is in scope for wave 1 or only the block.
2. E1 handling of `core.hooksPath` / `--no-verify` in commands (treat as writes that ask).
3. E1 projects with their own git hooks (Husky): chain or refuse.
4. E2 `dispatch-waived` as a hitl reason (C26) or a record token.
5. E4 globs in `policy.json`.
6. E6 how far to go on per-stack skill visibility.
7. E7 keep or drop.
8. Installer behaviour when a global `core.hooksPath` already exists.
