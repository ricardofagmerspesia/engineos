# EngineOS

Shared AI engineering environment for Claude Code. One source of truth for how we build:
rules, skills, routing, quality-gate hooks, and MCP baseline — versioned, reviewed via PR,
installed with one command.

Spec: see `docs/PRD.md`.

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
1. Refuses to install if secret-looking strings are in the repo.
2. Adds one import line to your `~/.claude/CLAUDE.md` (personal lines untouched).
3. Symlinks `skills/` into `~/.claude/skills/`.
4. Merges the two quality-gate hooks into `~/.claude/settings.json` (backup created).

Personal stuff (output style, personal hooks, keys) stays in your own `~/.claude/CLAUDE.md`
and `settings.local.json` — this repo never touches it.

## What's inside

| Path | What | When it fires |
|---|---|---|
| `CLAUDE.md` | Constitution + intent router | Always loaded; routes every substantive prompt to the right rules/skills before action |
| `rules/base.md`, `security.md`, `git.md` | Always-on standards | Every session |
| `rules/architecture.md`, `backend.md`, `frontend.md`, `llm-apps.md`, `testing.md` | Per-domain standards | Loaded by router per intent |
| `skills/nestjs-patterns` | Team NestJS shapes | Backend work |
| `skills/react-patterns` | Team React/Next shapes | Frontend work |
| `skills/llm-engineering` | Prompts, tools, RAG, evals | LLM/agent work |
| `skills/adr` | Decision records | Architecture choices |
| `skills/eval-harness` | Scaffold golden sets, runners, LLM-judge | LLM feature without evals |
| `skills/release-notes` | Structured release page from commits/PRs | Version bump / "write release notes" |
| `agents/security-reviewer.md` | Adversarial, OWASP-mapped diff review (read-only) | Pre-merge on risky diffs |
| `agents/test-writer.md` | Tests from acceptance criteria, regression tests | Coverage work |
| `rules/memory.md` | Where knowledge lives (rules vs ADR vs CLAUDE.md vs memory) | Always on |
| `templates/permissions.template.json` | Shared read-only permission allowlist | Merged by installer |
| `hooks/post-edit-check.sh` | Typecheck+lint changed package after every AI edit | PostToolUse Edit\|Write |
| `hooks/stop-verify.sh` | Blocks "done" once if code changed but nothing verified | Stop |
| `templates/mcp.template.json` | MCP baseline: docs (context7), github, chrome-devtools, nestjs; DBs (postgres/mysql/oracle); infra (docker/kubernetes); cloud (azure/aws/gcp); collab (jira/slack/discord) | Manual add — connect only what a machine needs; `$verify` entries confirm package first |
| `templates/project-claude.md` | Starter CLAUDE.md for project repos | Copy per repo |

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

## Changing a standard

Rules are code. Open a PR, team reviews, merge, everyone `git pull && ./install.sh`.
No Slack-announcement standards.

## Security

- No secrets in this repo, ever. The installer and reviewers enforce it. Leaked = rotate.
- `mcp.template.json` uses env-var references only.
