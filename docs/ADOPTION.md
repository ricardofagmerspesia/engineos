# Adopting EngineOS in a New Project

Step-by-step to bring the EngineOS patterns — intent router, domain coordinators,
audit/implement orchestrators, quality + change-governance gates — into a real
project. Follow in order. Each step says what it does and how to verify it.

> Conventions: `~/projects/engineos` is the cloned EngineOS repo; `<project>` is the
> repo you're adopting into. `$` commands run in a normal terminal.

---

## 0. Prerequisites

- **Claude Code** installed (CLI / desktop / IDE).
- **node >= 18** — the installer's only hard dependency, and the hook runtime.
  `hooks/hooks.json` registers `node "<repo>/dist/engineos.cjs" hook <name>`, and
  `install.sh` merges `settings.json` by calling `engineos settings-merge`.
- `jq` is **not** needed to adopt EngineOS. Only working *on* this repo needs it —
  `scripts/validate-engineos.sh` and `scripts/gen-agent-registry.sh`:
  `brew install jq` (macOS) / `apt install jq`.
- macOS only: **`coreutils`** for the post-edit timeout safety net: `brew install coreutils`.
- The plugins EngineOS routes to — install both:
  - `superpowers` (brainstorming, TDD, debugging, verification)
  - `tlc-spec-driven` (spec → design → tasks → execute)

Verify: `node --version` (>= 18) and `claude --version` both print.

---

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
session never looks guarded. The constitution import in `~/.claude/CLAUDE.md`
stays (nothing can unload it); the command instructs the model to treat the rules
as not applicable. Nuclear option: comment out the `@…/engineos/CLAUDE.md` import.

---

## 2. Adopt EngineOS in the project (one command)

```bash
cd <project>
~/projects/engineos/scripts/init-project.sh
```
Or, inside a Claude Code session in `<project>`: `/engineos:init`. Add `--dry-run`
to see what it would do first.

What it creates:
- `.engineos/{changes,archived,memory}` plus `docs/{specs,prds,rules}`, each seeded
  with its `README.md`/`_template.md`. `memory/` is part of the standard layout, not
  optional — it's where durable, team-shared decisions get distilled
  (`rules/memory.md`). `.engineos/audits/` is created separately, by `/audit`, on
  first use.
- `CLAUDE.md` from `templates/project-claude.md`, **only if the project has none**.
  An existing one is never touched. Edit it: project name, stack, build/test/lint
  commands, any rule overrides. **Do not** copy EngineOS rules in — project
  `CLAUDE.md` > EngineOS > defaults, and the routing hook already appends "follow
  project CLAUDE.md" on every edit.

It is idempotent (re-run after every `git pull`) and it never overwrites a file you
own. Exit codes: `0` done, `1` cannot proceed from this machine — the machine install
is missing (Step 1 first), `$HOME` is unset, or the checkout is broken; the message
says which, `2` not a git work tree, `3` you are inside the EngineOS repo itself,
`64` bad usage.

**Commit `.engineos/` and `CLAUDE.md`.** That commit is what makes EngineOS the
default for every teammate: the presence of `.engineos/` is the opt-in signal the
`SessionStart` scaffold reads, and it's what puts the change-record Stop gate and the
per-edit routing in force in their sessions too — not just yours.

Then: open a `.engineos/changes/<date>-<slug>.md` when you start work, close it with
the `record-change` skill when done (Step 7).

Verify: `ls .engineos/changes/ .engineos/archived/ .engineos/memory/ docs/specs/ docs/prds/ docs/rules/`
all exist, and a Claude session in `<project>` reads the project `CLAUDE.md`.

### Manual equivalent

The `SessionStart` hook (`ensure-project-layout.sh`) does the same scaffold, gated on
opt-in so it never dirties repos that haven't adopted EngineOS. Without the script:
run `mkdir .engineos` in the project (or set `ENGINEOS_SCAFFOLD=1`), then open a
Claude Code session in `<project>` and the hook creates anything missing —
non-blocking, safe to run every session. `ENGINEOS_SCAFFOLD=0` disables it entirely.
You then copy `templates/project-claude.md` to `<project>/CLAUDE.md` by hand.

---

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

---

## 5. Add the CI agents (optional but recommended)

```bash
mkdir -p <project>/.github/workflows
cp ~/projects/engineos/templates/github/claude-review.yml   <project>/.github/workflows/
cp ~/projects/engineos/templates/github/claude-security.yml <project>/.github/workflows/
```
- Add repo secret `ANTHROPIC_API_KEY` — a **CI-scoped** key, never a personal one.
- Tune `claude-security.yml`'s `paths:` filter to the project's sensitive paths.

Verify: open a PR; both workflows run.

---

## 6. Confirm the gates are live

In a `<project>` session, make a trivial code edit. You should see:
- a `[router]` line naming the rules/skill/specialist for that file (PreToolUse routing);
- on finishing without verifying, a one-time **Stop block** asking for lint + typecheck
  (tests only when they were in scope, or `ENGINEOS_VERIFY_TESTS=1` is set);
- on finishing with unrecorded changes, a one-time **Stop block** asking to run `record-change`.

If a Stop block loops or never fires, see Troubleshooting.

---

## 7. Daily workflow

**Routing is automatic.** Editing `*.controller.ts` injects backend rules +
`nestjs-patterns` + `backend-coordinator`; `*.tsx` injects frontend; a `.tsx`
under `mobile/`, `android/`, `ios/`, or `react-native/` injects mobile instead
(checked before the frontend pattern) + `mobile-coordinator`; `*.sql` injects
DBA; `.github/workflows/*` injects devops; etc. Follow what it surfaces.

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
                         # git mv .engineos/changes/ -> .engineos/archived/YYYY/MM/<domain>/, clears the Stop flag
```

**Verification before "done"** is enforced: lint + typecheck, output shown, run once
after the last unit of work. The Stop gates make this non-optional.

**Tests are opt-in.** EngineOS writes no tests and runs no suite unless you ask
("write tests", "add coverage", "integration tests", "TDD this"), your project's
`CLAUDE.md` requires them, or a test agent (`test-writer` / `qa-tester`) is
dispatched on purpose. When they are off, the session says so in one line:
`[tests] skipped — not requested`. Full policy: `rules/verification.md`. Set
`ENGINEOS_VERIFY_TESTS=1` to force tests into the Stop gate unconditionally.

---

## 8. Changing a standard

Rules are code. Don't edit your local copy — open a PR to the EngineOS repo
(`CONTRIBUTING.md` has the workflow + per-artifact rules). Team merges, everyone
`git pull && ./install.sh`. Project-specific deltas stay in `<project>/CLAUDE.md`.

---

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

---

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
