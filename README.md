# EngineOS

Shared AI engineering environment for Claude Code. One source of truth for how we build:
rules, skills, routing, quality-gate hooks, and MCP baseline — versioned, reviewed via PR,
installed with one command.

Spec: see `docs/PRD.md`.

- **New user? Read [`docs/START.md`](docs/START.md)** — how to invoke the skills, agents, commands, MCPs, hooks, and the change lifecycle day to day.
- **Adopting into a project? Follow [`docs/ADOPTION.md`](docs/ADOPTION.md)** — step-by-step from clone to working patterns.

## Install

Two modes — **pick one**, not both (both = duplicate skills/hooks):

**A. Script (recommended — full setup):**
```bash
git clone git@github.com:ricardofagmer/engineer-spec-ia-pattern.git ~/projects/engineos
cd ~/projects/engineos && ./install.sh
```

On Windows, run `install.ps1` instead (PowerShell) — same steps, plus it wires the
hooks through Git Bash's `bash.exe`. See [Windows](#windows) below.

**B. Plugin (skills + agents + hooks only — no constitution import, no permissions):**
```
/plugin marketplace add ricardofagmer/engineer-spec-ia-pattern
/plugin install engineos@engineos
```
Plugin mode still needs the router: add `@<plugin-path>/CLAUDE.md` to your `~/.claude/CLAUDE.md` manually, or just use mode A.

Mode A is idempotent — re-run after every `git pull`. The installer:
1. Refuses to install if secret-looking strings are in the repo (fails closed).
2. Adds or updates one import line in your `~/.claude/CLAUDE.md` (re-run refreshes a stale path; personal lines untouched).
3. Symlinks `skills/` and `agents/` into `~/.claude/`.
4. Merges the EngineOS hooks (routing, quality-gate, and change-governance) into `~/.claude/settings.json` (write-once backup), plus the shared read-only allowlist.

Personal stuff (output style, personal hooks, keys) stays in your own `~/.claude/CLAUDE.md`
and `settings.local.json` — this repo never touches it.

### Windows

Use `install.ps1` (mode A). Two Windows-specific facts:

- **Hooks are invoked as `"<git>/bin/bash.exe" "<hook>.sh"`, never as a bare `.sh` path.**
  Windows resolves a bare `.sh` through its file association, which Git for Windows
  points at `git-bash.exe` — a *terminal launcher*. That opens a visible Git Bash
  window on every hook fire: every prompt, every edit, every stop. `bash.exe` is a
  plain console binary and stays invisible. `install.ps1` locates it and wraps the
  commands; re-run it if you see terminal windows appearing.
  WSL's `bash` is not a substitute — it cannot resolve the `C:/...` paths in the
  hook commands.
- **`jq` is required.** Without it every hook that parses tool input exits 0
  silently: no `[router]` guidance, no change-record Stop gate. `winget install jqlang.jq`.

Mode B (plugin) registers the hooks as bare `${CLAUDE_PLUGIN_ROOT}/hooks/*.sh` paths,
which hits the terminal-window behaviour above. On Windows, prefer mode A.

## What's inside

| Path | What | When it fires |
|---|---|---|
| `CLAUDE.md` | Constitution + intent router | Always loaded; routes every substantive prompt to the right rules/skills before action |
| `rules/base.md`, `security.md`, `git.md` | Always-on standards | Every session |
| `rules/parallelism.md` | Fan-out doctrine: when to split work, contract freeze, waves, disjoint file scopes, one-message dispatch | Always on; enforced on big tasks |
| `rules/models.md` | Model tiers: spec/PRD `fable`, design/security `opus`, code `sonnet`, mechanical `haiku` — tier is the contract, model name is today's binding | Always on |
| `rules/architecture.md`, `backend.md`, `frontend.md`, `llm-apps.md`, `testing.md`, `data.md`, `observability.md` | Per-domain standards | Loaded by router per intent |
| `skills/nestjs-patterns` | Team NestJS shapes | Backend work |
| `skills/react-patterns` | Team React/Next shapes | Frontend work |
| `skills/llm-engineering` | Prompts, tools, RAG, evals | LLM/agent work |
| `skills/adr` | Decision records | Architecture choices |
| `skills/eval-harness` | Scaffold golden sets, runners, LLM-judge | LLM feature without evals |
| `skills/release-notes` | Structured release page from commits/PRs | Version bump / "write release notes" |
| `skills/strategy` | Five strategist modes — market opportunity, learning path, blocked decision, positioning, hidden monetization — each grounded in dated web sources + this repo's code/docs/git history, persisted to `docs/strategy/` | Business/career strategy questions |
| `agents/architecture-analyst.md` | System comprehension → code-grounded architecture + onboarding docs (`/analisy-architecture`); interactive gap-filling interview (`/talk-about-the-system`) | Documenting/understanding a system |
| `agents/qa-tester.md` | Autonomous end-to-end API QA (alias `qa`): clean Docker up, endpoint-inventory JSON + Postman collection, headless Newman run of all endpoints/scenarios, pass/fail report | Full API regression / smoke QA |
| `agents/security-reviewer.md` | Adversarial, OWASP-mapped diff review (read-only) | Pre-merge on risky diffs |
| `agents/test-writer.md` | Tests from acceptance criteria, regression tests | Coverage work |
| `agents/{backend,frontend,dba,devops,llm}-coordinator.md` | Domain specialists, dual-mode audit/implement, shared report format | Scoped domain analysis or changes |
| `agents/{kubernetes,gcp,postgres,oracle,cicd}-specialist.md` | Read-only MCP-bound leaf specialists for deep audits | Dispatched by /engineos:audit or coordinators |
| `agents/audit-consolidator.md` | Merges specialist reports into one status report (verdict + root cause + plan) | End of an audit run |
| `commands/audit.md`, `commands/implement.md` | Orchestrator entry points (`/engineos:audit`, `/engineos:implement`): freeze contracts, plan waves, fan out to specialists in parallel, consolidate | Multi-domain audit or coordinated change |
| `commands/agents/*.md` (generated by `scripts/gen-agent-commands.sh`) | Direct per-agent entry points: invoke any agent by name or alias, e.g. `/engineos:backend-coordinator` or `/engineos:borisenko`. Generated files carry a `@generated` marker; **delete that marker line to hand-customize a command and the generator will preserve it** on every future run | Call one agent directly without the orchestrator |
| `commands/bypass.md` | `/engineos:bypass [on\|off\|status]` — turns EngineOS off: routing, rule loading, agent dispatch, spec gate, change records and both Stop gates. Enforced at the hook level by a marker file in the git dir, not by prompt alone; expires at the next SessionStart | One-off work that the constitution gets in the way of |
| `hooks/bypass.sh` | Marker-file switch behind `/engineos:bypass`; sourced by every hook, also usable as a CLI (`bypass.sh on\|off\|status [cwd]`) | Library + manual toggle |
| `rules/memory.md` | Where knowledge lives (rules vs ADR vs CLAUDE.md vs memory) | Routed: architecture-docs, interview, and `adr` rows |
| `templates/permissions.template.json` | Shared read-only permission allowlist | Merged by installer |
| `hooks/task-scale-advisor.sh` | Detects big-task / spec / design prompts and injects the fan-out + model-tier reminder (non-blocking). Under an active bypass it announces `BYPASS ACTIVE` instead — the one hook that speaks up while the rest go quiet | UserPromptSubmit |
| `hooks/route-before-change.sh` + `routing-map.sh` | Routes each edit to the right rules/skill/specialist via injected context (canonical path→domain map) | PreToolUse Edit\|Write |
| `hooks/announce-agent-dispatch.sh` + `announce-agent-return.sh` | Backstop for the green agent banner in `rules/subagents.md`. The rule was prose-only and drifted — dispatches happened silently. These re-inject the exact banner format as `additionalContext` at dispatch/return time, the same pattern `route-before-change.sh` uses for file routing. Smoke test: `hooks/test-agent-announce.sh`. Cursor has no hook system and no agent registry, so `.cursor/rules/subagent-dispatch.mdc` mirrors the convention prompt-only, best-effort | PreToolUse / PostToolUse `Agent\|Task` |
| `hooks/post-edit-check.sh` | Per-edit typecheck+lint — retired from default wiring (verification runs once at Stop); kept on disk as opt-in | not wired (opt-in) |
| `hooks/mark-unrecorded.sh` | Flags unrecorded code changes for the record gate | PostToolUse Edit\|Write |
| `hooks/stop-verify.sh` | Blocks "done" once if code changed but scoped lint+typecheck weren't run; tests are opt-in (`rules/testing.md`) and join the gate only when `ENGINEOS_VERIFY_TESTS=1` or the task had tests in scope | Stop |
| `hooks/record-verify.sh` | Blocks "done" once if code changed but the change was not recorded | Stop |
| `skills/record-change` | Finalize a change: mark done, register files+movements, `.engineos/changes/`→`.engineos/archived/` | After completing work |
| `templates/mcp.template.json` | MCP baseline: docs (context7), github, chrome-devtools, nestjs; DBs (postgres/mysql/oracle); infra (docker/kubernetes); cloud (azure/aws/gcp); collab (mcp-atlassian/slack/discord) | Manual add — connect only what a machine needs; `$verify` entries confirm package first |
| `templates/project-claude.md` | Starter CLAUDE.md for project repos | Copy per repo |
| `.engineos/changes/` | Active change records — one file per in-progress unit of work | While work is in progress |
| `.engineos/archived/` | Completed change records, moved from `.engineos/changes/` | After work is done + verified |
| `.engineos/memory/` | Durable, team-shared takeaways that outlive a single change | When a finished change leaves a lasting fact |

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

**1. Start a change → `.engineos/changes/`**
When you begin a unit of work, create a record:
```bash
cp .engineos/changes/_template.md ".engineos/changes/$(date +%F)-<slug>.md"   # or copy the shape from .engineos/changes/README.md
```
Fill in What / Why / Scope. Set `status: active`. Commit it with the work it tracks.

**2. Finish a change → `.engineos/archived/`**
Once the work is done and verified (lint + typecheck shown, plus tests only when they were in scope for the task — see `rules/testing.md`):
```bash
mkdir -p ".engineos/archived/<YYYY>/<MM>/<DD>" && git mv ".engineos/changes/<date>-<slug>.md" ".engineos/archived/<YYYY>/<MM>/<DD>/<date>-<slug>.md"
```
Set `status: done` and add `completed: <YYYY-MM-DD>`. Git keeps the full move history.

**3. Capture a lasting fact → `.engineos/memory/`**
If the change leaves a durable takeaway (a decision, a convention, a gotcha),
write a one-concept file in `.engineos/memory/` and link it from the archived record with
`[[memory-slug]]`. Skip this for routine changes — only distil what's worth recalling.

Boundaries: `.engineos/memory/` is EngineOS's own knowledge store — not personal Claude
memory and not a copy of `rules/`. See `rules/memory.md` for which knowledge lives
where.

## Changing a standard

Rules are code. Open a PR, team reviews, merge, everyone `git pull && ./install.sh`.
No Slack-announcement standards.

## Security

- No secrets in this repo, ever. The installer and reviewers enforce it. Leaked = rotate.
- `mcp.template.json` uses env-var references only.
