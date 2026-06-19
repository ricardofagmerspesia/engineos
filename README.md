# EngineOS

Shared AI engineering environment for Claude Code. One source of truth for how we build:
rules, skills, routing, quality-gate hooks, and MCP baseline — versioned, reviewed via PR,
installed with one command.

Spec: see `docs/PRD.md`. **Adopting EngineOS into a project? Follow [`docs/ADOPTION.md`](docs/ADOPTION.md)** — step-by-step from clone to working patterns.

## Install

Two modes — **pick one**, not both (both = duplicate skills/hooks):

**A. Script (recommended — full setup):**
```bash
git clone git@github.com:ricardofagmer/engineer-spec-ia-pattern.git ~/projects/engineos
cd ~/projects/engineos && ./install.sh
```

**B. Plugin (skills + agents + hooks only — no constitution import, no permissions):**
```
/plugin marketplace add ricardofagmer/engineer-spec-ia-pattern
/plugin install engineos@engineos
```
Plugin mode still needs the router: add `@<plugin-path>/CLAUDE.md` to your `~/.claude/CLAUDE.md` manually, or just use mode A.

Mode A is idempotent — re-run after every `git pull`. The installer:
1. Refuses to install if secret-looking strings are in the repo (fails closed).
2. Adds one import line to your `~/.claude/CLAUDE.md` (personal lines untouched).
3. Symlinks `skills/` and `agents/` into `~/.claude/`.
4. Merges the EngineOS hooks (routing, quality-gate, and change-governance) into `~/.claude/settings.json` (write-once backup), plus the shared read-only allowlist.

Personal stuff (output style, personal hooks, keys) stays in your own `~/.claude/CLAUDE.md`
and `settings.local.json` — this repo never touches it.

## What's inside

| Path | What | When it fires |
|---|---|---|
| `CLAUDE.md` | Constitution + intent router | Always loaded; routes every substantive prompt to the right rules/skills before action |
| `rules/base.md`, `security.md`, `git.md` | Always-on standards | Every session |
| `rules/architecture.md`, `backend.md`, `frontend.md`, `llm-apps.md`, `testing.md`, `data.md`, `observability.md` | Per-domain standards | Loaded by router per intent |
| `skills/nestjs-patterns` | Team NestJS shapes | Backend work |
| `skills/react-patterns` | Team React/Next shapes | Frontend work |
| `skills/llm-engineering` | Prompts, tools, RAG, evals | LLM/agent work |
| `skills/adr` | Decision records | Architecture choices |
| `skills/eval-harness` | Scaffold golden sets, runners, LLM-judge | LLM feature without evals |
| `skills/release-notes` | Structured release page from commits/PRs | Version bump / "write release notes" |
| `agents/security-reviewer.md` | Adversarial, OWASP-mapped diff review (read-only) | Pre-merge on risky diffs |
| `agents/test-writer.md` | Tests from acceptance criteria, regression tests | Coverage work |
| `agents/{backend,frontend,dba,devops,llm}-coordinator.md` | Domain specialists, dual-mode audit/implement, shared report format | Scoped domain analysis or changes |
| `agents/{kubernetes,gcp,postgres,oracle,cicd}-specialist.md` | Read-only MCP-bound leaf specialists for deep audits | Dispatched by /engineos:audit or coordinators |
| `agents/audit-consolidator.md` | Merges specialist reports into one status report (verdict + root cause + plan) | End of an audit run |
| `commands/audit.md`, `commands/implement.md` | Orchestrator entry points (`/engineos:audit`, `/engineos:implement`): fan out to specialists, consolidate | Multi-domain audit or coordinated change |
| `rules/memory.md` | Where knowledge lives (rules vs ADR vs CLAUDE.md vs memory) | Always on |
| `templates/permissions.template.json` | Shared read-only permission allowlist | Merged by installer |
| `hooks/route-before-change.sh` + `routing-map.sh` | Routes each edit to the right rules/skill/specialist via injected context (canonical path→domain map) | PreToolUse Edit\|Write |
| `hooks/post-edit-check.sh` | Typecheck+lint changed package after every AI edit | PostToolUse Edit\|Write |
| `hooks/mark-unrecorded.sh` | Flags unrecorded code changes for the record gate | PostToolUse Edit\|Write |
| `hooks/stop-verify.sh` | Blocks "done" once if code changed but nothing verified | Stop |
| `hooks/record-verify.sh` | Blocks "done" once if code changed but the change was not recorded | Stop |
| `skills/record-change` | Finalize a change: mark done, register files+movements, `changes/`→`archived/` | After completing work |
| `templates/mcp.template.json` | MCP baseline: docs (context7), github, chrome-devtools, nestjs; DBs (postgres/mysql/oracle); infra (docker/kubernetes); cloud (azure/aws/gcp); collab (mcp-atlassian/slack/discord) | Manual add — connect only what a machine needs; `$verify` entries confirm package first |
| `templates/project-claude.md` | Starter CLAUDE.md for project repos | Copy per repo |
| `changes/` | Active change records — one file per in-progress unit of work | While work is in progress |
| `archived/` | Completed change records, moved from `changes/` | After work is done + verified |
| `memory/` | Durable, team-shared takeaways that outlive a single change | When a finished change leaves a lasting fact |

## Relationship to plugins

EngineOS routes to — and depends on — these installed plugins, it does not replace them:
- **superpowers** — brainstorming, TDD, systematic debugging, verification-before-completion
- **tlc-spec-driven** — spec → design → tasks → execute workflow

Install both before/with EngineOS.

## CI agents

Copy `templates/github/*.yml` into a project's `.github/workflows/`:
- `claude-review.yml` — convention/correctness review on every PR (reads the repo's CLAUDE.md)
- `claude-security.yml` — adversarial security review, fires only on security-relevant paths

Both need repo secret `ANTHROPIC_API_KEY` — create a **CI-scoped key**, never reuse a personal one. Tune the security workflow's `paths` filter per repo.

## Usage analytics

```bash
./scripts/usage-report.sh 30   # which intents/skills fired in last 30 days
```
Quarterly: zero-hit rules/skills are prune candidates.

## Change tracking

Three git-tracked folders give every change an auditable trail. Each has a README
with the full file template; below is when and how to use each.

**1. Start a change → `changes/`**
When you begin a unit of work, create a record:
```bash
cp changes/_template.md "changes/$(date +%F)-<slug>.md"   # or copy the shape from changes/README.md
```
Fill in What / Why / Scope. Set `status: active`. Commit it with the work it tracks.

**2. Finish a change → `archived/`**
Once the work is done and verified (typecheck + lint + tests shown):
```bash
git mv "changes/<date>-<slug>.md" "archived/<date>-<slug>.md"
```
Set `status: done` and add `completed: <YYYY-MM-DD>`. Git keeps the full move history.

**3. Capture a lasting fact → `memory/`**
If the change leaves a durable takeaway (a decision, a convention, a gotcha),
write a one-concept file in `memory/` and link it from the archived record with
`[[memory-slug]]`. Skip this for routine changes — only distil what's worth recalling.

Boundaries: `memory/` is EngineOS's own knowledge store — not personal Claude
memory and not a copy of `rules/`. See `rules/memory.md` for which knowledge lives
where.

## Changing a standard

Rules are code. Open a PR, team reviews, merge, everyone `git pull && ./install.sh`.
No Slack-announcement standards.

## Security

- No secrets in this repo, ever. The installer and reviewers enforce it. Leaked = rotate.
- `mcp.template.json` uses env-var references only.
