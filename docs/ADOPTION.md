# Adopting EngineOS in a New Project

Follow in order to install routing, scoped workers, and final gates. Read only
the current setup step; daily usage is in [START.md](START.md).

> Conventions: `~/projects/engineos` is the cloned EngineOS repo; `<project>` is the
> repo you're adopting into. `$` commands run in a normal terminal.


## 0. Prerequisites

- **Claude Code** installed (CLI / desktop / IDE).
- **node >= 18** — the installer's only hard dependency, and the hook runtime.
  `hooks/hooks.json` registers `node "<repo>/dist/engineos.cjs" hook <name>`, and
  `install.sh` merges `settings.json` by calling `engineos settings-merge`.
- `jq` and `python3` are **not** needed — not to adopt EngineOS and not to work on
  it. Working *on* this repo needs node >= 18 plus `shellcheck` for `install.sh`
  and the bash shims: `brew install shellcheck` (macOS) / `apt install shellcheck`.
- macOS only: **`coreutils`** for the post-edit timeout safety net: `brew install coreutils`.
- The plugins EngineOS routes to — install both:
  - `superpowers` (brainstorming, TDD, debugging, verification)
  - `tlc-spec-driven` (spec → design → tasks → execute)

Verify: `node --version` (>= 18) and `claude --version` both print.


## 1. Install EngineOS (once per machine)

```bash
git clone <engineos-repo-url> ~/projects/engineos
cd ~/projects/engineos && ./install.sh
```

What it does (idempotent — re-run after every `git pull`):
1. **Secrets gate** — refuses to install if the repo contains secret-looking strings (fails closed).
2. Adds or updates one `@~/projects/engineos/CLAUDE.md` import line in your `~/.claude/CLAUDE.md` (re-run refreshes a stale path; personal lines untouched).
3. Symlinks `skills/`, `agents/`, and `commands/` into `~/.claude/`.
4. Merges the EngineOS hooks (routing + quality-gate + change-governance) and the read-only allowlist into `~/.claude/settings.json` (write-once backup at `settings.json.engineos.bak`).

Verify:
```bash
ls ~/.claude/agents ~/.claude/commands        # coordinators, specialists, /audit, /implement
node -p 'Object.keys(require(process.env.HOME+"/.claude/settings.json").hooks)'   # PreToolUse, PostToolUse, Stop, SessionStart, UserPromptSubmit
```
**Restart Claude Code** so the hooks load in new sessions.

> Plugin mode alternative: `/plugin install engineos@engineos`. Note plugin mode does
> NOT import the constitution automatically — add `@<plugin-path>/CLAUDE.md` to your
> `~/.claude/CLAUDE.md` manually, or just use the installer (recommended).

### Pause EngineOS (`/engineos:bypass`)

Kill switch — it does **not** uninstall. Three switches, any one of which turns
every hook off:

```text
/engineos:bypass on       # per-repo marker in the git dir; expires at the next SessionStart
/engineos:bypass off      # clear it
/engineos:bypass status   # report which switch is on

export ENGINEOS_BYPASS=1              # process-scoped, sticky
touch ~/.claude/engineos.bypass       # machine-wide, sticky until deleted
```

While any of them is on, every EngineOS hook exits immediately — except
`prompt-advisor.sh`, which announces `BYPASS ACTIVE` each turn so an unguarded
session never looks guarded, and `git-write-guard`, which is yours rather than the
constitution's (next section). The constitution import in `~/.claude/CLAUDE.md`
stays (nothing can unload it); the command instructs the model to treat the rules
as not applicable. Nuclear option: comment out the `@…/engineos/CLAUDE.md` import.

### Git writes: ask or auto (`ENGINEOS_GIT_WRITES`)

By default Claude does not write to git on its own. The PreToolUse hook
`git-write-guard` inspects every `Bash` command and turns each git or forge
**write** (`add`, `commit`, `push`, `checkout`, `merge`, `rebase`, `reset`,
`stash`, `tag <name>`, `gh pr create|merge`, …) into Claude Code's permission
prompt, tagged `[engineos] git write: <command>`. Read-only git (`status`, `log`,
`diff`, `show`, `branch --list`, …) never prompts. One approval covers one command.

This is a **personal** setting, per machine, never per repo. To let Claude write
without prompting, add to `~/.claude/settings.local.json`:

```json
{"env": {"ENGINEOS_GIT_WRITES": "auto"}}
```

Only the exact word `auto` switches it off; anything else (unset, empty, a typo)
means `ask`. `/engineos:bypass` does not touch it. The full read/write split is in
`rules/git.md` under "Who may write".


## 2. Adopt EngineOS in the project (one command)

```bash
cd <project>
~/projects/engineos/scripts/init-project.sh                       # --stack auto (default): detect
~/projects/engineos/scripts/init-project.sh --stack nestjs@backend,next@frontend
```
Or, inside a Claude Code session in `<project>`: `/engineos:init`. Add `--dry-run`
to see what it would do first. `--stack` takes `auto` or a comma list of
`<framework>[@dir]` — one of `nestjs`, `react`, `next`, `react-native`; `@dir` is the package directory relative to the repo root (omit it
for `.`).

A brand-new repo has nothing to detect: the SessionStart hook tells Claude to ask you for
the stack in its first reply (`rules/base.md` "New projects — stack first"); answer, and it
persists the choice with `--stack` and records it as the first ADR. From-scratch features then
run `/engineos:new-feature` (PRD, ADR, SPEC, TASKS before code).

What it creates:
- `.engineos/{changes,archived,memory}` plus `docs/{specs,prds,rules}`, each seeded
  with its `README.md`/`_template.md`. `memory/` is part of the standard layout, not
  optional — it's where durable, team-shared decisions get distilled
  (`rules/memory.md`). `.engineos/audits/` is created separately, by `/audit`, on
  first use.
- `.engineos/config.json` — the project's declared stack, written **once** from
  `--stack` (or from what detection found) and never overwritten, so edit it freely:
  `{ "version": 1, "stack": { "packages": [{ "dir": "backend", "language": "node",
  "framework": "nestjs", "compose_service": null, "python_env": "auto" }] } }`.
  It is what `scripts/kernel.sh resolve-stack` answers from, and so what the Stop
  gate, the SessionStart `[engineos] stack: …` line and the coordinators read.
  Nothing is written when detection finds no package; declare one with `--stack`.
- `CLAUDE.md` from `templates/project-claude.md`, only when absent. Set the
  project name, commands and rule deltas; do not copy shared rules. Project
  instructions take precedence. NestJS is mandatory for application backends;
  Node is the runtime/tooling, Next.js/React the UI, Mastra the LLM framework.

It is idempotent (re-run after every `git pull`) and it never overwrites a file you
own. Exit codes: `0` done, `1` cannot proceed from this machine — the machine install
is missing (Step 1 first), `$HOME` is unset, or the checkout is broken; the message
says which, `2` not a git work tree, `3` you are inside the EngineOS repo itself,
`64` bad usage.

Legacy Python config fields/templates remain compatibility surface; active init
and automatic verification target JS/TS. Explicit `node` or `express` application
backend declarations are rejected with NestJS guidance. Existing apps/configs are
not silently converted.

**Commit `.engineos/` and `CLAUDE.md`.** That commit is what makes EngineOS the
default for every teammate: the presence of `.engineos/` is the opt-in signal the
`SessionStart` scaffold reads, and it's what puts the change-record Stop gate and the
per-edit routing in force in their sessions too — not just yours.

Then: open a `.engineos/changes/<date>-<slug>.md` when you start work, close it with
the `record-change` skill when done (Step 7).

Verify: `ls .engineos/changes/ .engineos/archived/ .engineos/memory/ docs/specs/ docs/prds/ docs/rules/`
all exist, `ls .engineos/config.json` shows the stack file (edit it if detection
guessed wrong), and a Claude session in `<project>` reads the project `CLAUDE.md`
and opens with a `[engineos] stack: …` line naming the packages you expect.

### Manual equivalent

The `SessionStart` hook (`ensure-project-layout.sh`) does the same scaffold, gated on
opt-in so it never dirties repos that haven't adopted EngineOS. Without the script:
run `mkdir .engineos` in the project (or set `ENGINEOS_SCAFFOLD=1`), then open a
Claude Code session in `<project>` and the hook creates anything missing —
non-blocking, safe to run every session. `ENGINEOS_SCAFFOLD=0` disables it entirely.
You then copy `templates/project-claude.md` to `<project>/CLAUDE.md` by hand.


## 4. Connect MCP servers (powers the leaf specialists)

Coordinators work with no MCP. The **leaf specialists** (kubernetes, gcp, postgres,
oracle, cicd) need their MCP connected — until then they return `UNKNOWN — no access`
(by design, never guessing). Use `templates/mcp.template.json` as the baseline.

Rules:
- **Env-var references only** — never paste literal tokens. `export VAR=...` in your
  shell, reference `${VAR}` in the config.
- **Read-only creds** for audit safety: a read-only DB role, a limited kubeconfig
  context, a scoped API token.
- `$verify` entries in the template use community servers — confirm the package name
  and pin a version before trusting.

| Leaf specialist | MCP server (template key) | Connect with |
|---|---|---|
| postgres-specialist | `postgres` | read-only Postgres role URL |
| oracle-specialist | `oracle` | read-only Oracle connection |
| kubernetes-specialist | `kubernetes` | a read-only kubeconfig context |
| gcp-specialist | `gcp` | Application Default Credentials (`gcloud auth ...`) |
| cicd-specialist | `github` | GitHub MCP token (read scopes) |
| audit-consolidator | `mcp-atlassian` | Jira API token (read) — optional, context only |

Add a server (example, read-only Postgres):
```bash
# set the connection string in your shell (NOT in any committed file); use a
# read-only role. Format: a standard postgres URL with credentials.
export POSTGRES_URL_READONLY='<read-only-postgres-connection-string>'
# copy the "postgres" entry from templates/mcp.template.json into ~/.claude/settings.json
```
Restart Claude Code. The EngineOS allowlist intentionally does NOT auto-approve MCP
write tools (least privilege) — you'll be prompted on first use; scope safety via
read-only creds.

Verify: in a session, `/audit dba` returns real findings instead of `UNKNOWN`.


## 5. Add the CI agents (optional but recommended)

```bash
mkdir -p <project>/.github/workflows
cp ~/projects/engineos/templates/github/claude-review.yml   <project>/.github/workflows/
cp ~/projects/engineos/templates/github/claude-security.yml <project>/.github/workflows/
```
- Add repo secret `ANTHROPIC_API_KEY` — a **CI-scoped** key, never a personal one.
- Tune `claude-security.yml`'s `paths:` filter to the project's sensitive paths.

Verify: open a PR; both workflows run.


## 6. Confirm the gates are live

In a `<project>` session, make a trivial code edit. You should see:
- a `[router]` line naming the rules/skill/specialist for that file (PreToolUse routing);
- on finishing without verifying, a one-time **Stop block** asking for lint + typecheck
  for JS/TS; tests/evals require a separate approved final-stage command;
- on finishing with unrecorded changes, a one-time **Stop block** asking to run `record-change`.

If a Stop block loops or never fires, see Troubleshooting.


## 7. Daily workflow

Claude Code routes each edit: NestJS controllers → backend, `.tsx` → frontend
(or mobile paths → mobile), SQL → DBA, workflows → DevOps, Mastra/agents → LLM.
Codex has no hooks: follow `templates/adapters/codex.md`. One supervisor owns
contracts and integration; workers have exclusive files and no git/forge writes.
Schedule ready tasks up to useful host capacity, without unrelated wave barriers.
Keep the active branch/PR for related follow-ups until user-directed change.

**Audit the system** (read-only, fans out + consolidates):
```
/audit all                 # all domains
/audit dba src/orders      # one domain, scoped
```
→ writes `.engineos/audits/<date>-<domain>.md` with a top-line STATUS + remediation plan.

**Make a coordinated change** (spec-gated):
```
/implement backend add idempotency keys to the payments webhook
```
→ opens a change record, dispatches the coordinator(s) in IMPLEMENT mode, verifies.

**Close every unit of work** with the record-change skill:
```
record-change            # marks the .engineos/changes/ record done, registers files+movements,
                         # archive under git-write policy -> .engineos/archived/YYYY/MM/<domain>/
```

**Verification before "done"** is enforced: lint + typecheck, output shown, run once
after the last unit of work. The Stop gates make this non-optional.

**Tests/evals: final stage, explicit current-task user approval only.**
No feature, agent dispatch, environment flag or gate grants consent. Without it:
`[tests] pending — final-stage user approval required`. See `rules/verification.md`.


## 8. Changing a standard

Rules are code. Don't edit your local copy — open a PR to the EngineOS repo
(`CONTRIBUTING.md` has the workflow + per-artifact rules). Team merges, everyone
`git pull && ./install.sh`. Project-specific deltas stay in `<project>/CLAUDE.md`.


## 9. Troubleshooting

- **`settings.json` edits revert** — a sync tool (e.g. an editor extension) may own
  the file. Quit it, re-run `./install.sh`, relaunch. Backup at `settings.json.engineos.bak`.
- **Leaf specialist says `UNKNOWN — no access`** — its MCP isn't connected (Step 4).
- **Stop gate won't release** — the record flag lives at
  `$(git rev-parse --absolute-git-dir)/ENGINEOS_UNRECORDED.<session>`; running
  `record-change` clears it. The gate never loops (guarded), so just record and finish.
- **Secrets gate aborts install** — the repo contains a secret-looking string. Remove
  it and ROTATE the secret (removal alone is not enough), then re-install.
- **macOS: typecheck hangs an edit** — install `coreutils` (Step 0) for the timeout.


## Quick reference — what you get

| Capability | How to use |
|---|---|
| Per-edit rule/specialist routing | automatic (PreToolUse hook) |
| Domain analysis or change | `backend/frontend/mobile/dba/devops/llm`-coordinator agents |
| Multi-domain read-only audit | `/audit <domain\|all> [scope]` |
| Coordinated multi-domain change | `/implement <domain> <task>` |
| Deep MCP-backed inspection | leaf specialists (auto-dispatched by `/audit`) |
| Change record lifecycle | `.engineos/changes/` → `record-change` skill → `.engineos/archived/` |
| Verification + record enforcement | Stop gates (automatic) |
