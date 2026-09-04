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
3. Symlinks `skills/`, `agents/`, `commands/`, `rules/`, and `patterns/` into `~/.claude/` (and prunes any dangling symlink under `skills/`, `agents/`, or `commands/` left over from a prior rename).
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
| `CLAUDE.md` | Constitution + intent router | Always loaded; routes every substantive prompt to the right rules/skills before action, announcing `risk=`/`autonomy=` alongside the loaded rules |
| `rules/base.md`, `security.md`, `git.md`, `context.md` | Small always-on safety and context core | Every session |
| `rules/subagents.md` | Dispatch doctrine: the router naming an agent means dispatch it, announce it, and what a dispatched agent may run | Loaded when the task contract names agents |
| `rules/verification.md` | The final gate: lint + typecheck at finalization, tests opt-in (`ENGINEOS_VERIFY_TESTS=1`) | Loaded for verification/done claims |
| `rules/risk-autonomy.md` | Risk tiers (low/medium/high) and autonomy ceilings (A0-A4) — classify before the first write; every other gate is proportional to this | Loaded for substantive work |
| `rules/gates.md` | Named gates (discovery/design/implementation/validation/release) mapped to their enforcement mechanism, plus the validation ladder | Loaded for substantive work |
| `rules/context.md` | Context-as-budget: never sweep the repo, load only what the route names, state what evidence was used | Always on |
| `rules/parallelism.md` | Fan-out doctrine: when to split work, contract freeze, waves, disjoint file scopes, one-message dispatch, the failure/retry/escalation policy | In the substantive-task policy bundle; enforced when scale requires it |
| `rules/models.md` | Model tiers: spec/PRD `fable`, design/security `opus`, code `opus`, mechanical `haiku` — tier is the contract, model name is today's binding. Plus the budget degradation ladder (cache -> reduce context -> smaller model -> defer -> deny) | In the substantive-task policy bundle |
| `rules/architecture.md`, `backend.md`, `frontend.md`, `llm-apps.md`, `testing.md`, `data.md`, `observability.md` | Per-domain standards | Loaded by router per intent |
| `registries/routing.json` | Machine-readable domain routing — rules, skill, agent, precedence, risk floor per domain; cross-checked against `CLAUDE.md`'s router table so the two cannot drift silently | Read by `scripts/validate-engineos.sh` |
| `registries/decision-rules.json` | Gate requirements as data (`when → then require`), so a new requirement is a registry entry, not a constitutional amendment | Resolved by `scripts/kernel.sh resolve-task`, surfaced by `hooks/prompt-advisor.sh` |
| `skills/nestjs-patterns` | Team NestJS shapes | Backend work |
| `skills/react-patterns` | Team React/Next shapes | Frontend work |
| `skills/llm-engineering` | Prompts, tools, RAG, evals | LLM/agent work |
| `skills/adr` | Decision records | Architecture choices |
| `skills/eval-harness` | Scaffold golden sets, runners, LLM-judge | LLM feature without evals |
| `skills/release-notes` | Structured release page from commits/PRs | Version bump / "write release notes" |
| `skills/strategy` | Five strategist modes — market opportunity, learning path, blocked decision, positioning, hidden monetization — each grounded in dated web sources + this repo's code/docs/git history, persisted to `docs/strategy/` | Business/career strategy questions |
| `agents/architecture-analyst.md` | System comprehension → code-grounded architecture + onboarding docs (`/analyze-architecture`); interactive gap-filling interview (`/talk-about-the-system`) | Documenting/understanding a system |
| `agents/qa-tester.md` | Autonomous end-to-end API QA (alias `qa`): clean Docker up, endpoint-inventory JSON + Postman collection, headless Newman run of all endpoints/scenarios, pass/fail report | Full API regression / smoke QA |
| `agents/security-reviewer.md` | Adversarial, OWASP-mapped diff review (read-only) | Pre-merge on risky diffs |
| `agents/critic.md` | Adversarial general-correctness review (read-only, alias `vera`) — tries to refute the claim that work is done, defaults to "not proven" | Required at risk=high per `rules/gates.md`; on explicit request |
| `agents/test-writer.md` | Tests from acceptance criteria, regression tests | Coverage work |
| `agents/{backend,frontend,mobile,dba,devops,llm}-coordinator.md` | Domain specialists, dual-mode audit/implement, shared report format | Scoped domain analysis or changes |
| `agents/{kubernetes,gcp,postgres,oracle,cicd}-specialist.md` | Read-only MCP-bound leaf specialists for deep audits | Dispatched by /engineos:audit or coordinators |
| `agents/audit-consolidator.md` | Merges specialist reports into one status report (verdict + root cause + plan) | End of an audit run |
| `agents/ios-builder.md`, `agents/android-builder.md` | Store-release pipelines: preflight, version bump, quality gates, signed build, TestFlight/Play-track upload — production rollout only on explicit instruction. No alias. | Mobile store release |
| `commands/analyze-architecture.md`, `commands/talk-about-the-system.md` | Whole-system analysis → code-grounded architecture + onboarding docs; interactive interview to fill the gaps docs can't cover | System comprehension / onboarding |
| `commands/audit.md`, `commands/implement.md` | Orchestrator entry points (`/engineos:audit`, `/engineos:implement`): freeze contracts, plan waves, fan out to specialists in parallel, consolidate | Multi-domain audit or coordinated change |
| `commands/agents/*.md` (generated by `scripts/gen-agent-commands.sh`) | Direct per-agent entry points: invoke any agent by name or alias, e.g. `/engineos:agents:backend-coordinator` or `/engineos:agents:borisenko` in **plugin mode** (files under `commands/agents/` are namespaced by that subdirectory); `install.sh`/`install.ps1` symlink mode installs them flat, so there they invoke as bare `/backend-coordinator` or `/borisenko`. Generated files carry a `@generated` marker; **delete that marker line to hand-customize a command and the generator will preserve it** on every future run | Call one agent directly without the orchestrator |
| `commands/bypass.md` | `/engineos:bypass [on\|off\|status]` — turns EngineOS off: routing, rule loading, agent dispatch, spec gate, change records and both Stop gates. Enforced at the hook level by a marker file in the git dir, not by prompt alone; the per-repo marker expires at the next SessionStart, while `~/.claude/engineos.bypass` and `ENGINEOS_BYPASS=1` hold until toggled off | One-off work that the constitution gets in the way of |
| `hooks/bypass.sh` | Switch behind `/engineos:bypass`: per-repo marker, machine-wide `~/.claude/engineos.bypass`, or `ENGINEOS_BYPASS=1`; sourced by every hook, also usable as a CLI (`bypass.sh on\|off\|status [cwd]`) | Library + manual toggle |
| `rules/memory.md` | Where knowledge lives (rules vs ADR vs CLAUDE.md vs memory) | Loaded when durable knowledge or recall is in scope |
| `templates/permissions.template.json` | Shared read-only permission allowlist | Merged by installer |
| `hooks/prompt-advisor.sh` | Calls `kernel.sh resolve-task` once and injects one task contract covering route, task scale, model tier, policy loads and matched gate requirements. Under bypass it announces `BYPASS ACTIVE` | UserPromptSubmit |
| `hooks/route-before-change.sh` | Routes each edit to the right rules/skill/specialist via injected context, resolved by `scripts/kernel.sh route-path` against `registries/routing.json` (the canonical path→domain map) | PreToolUse Edit\|Write |
| `hooks/announce-agent-dispatch.sh` + `announce-agent-return.sh` | Backstop for the green agent banner in `rules/subagents.md`. The rule was prose-only and drifted — dispatches happened silently. These re-inject the exact banner format as `additionalContext` at dispatch/return time, the same pattern `route-before-change.sh` uses for file routing. Smoke test: `hooks/test-agent-announce.sh`. Cursor has no hook system and no agent registry, so `.cursor/rules/subagent-dispatch.mdc` mirrors the convention prompt-only, best-effort | PreToolUse / PostToolUse `Agent\|Task` |
| `hooks/post-edit-check.sh` | Per-edit typecheck+lint — retired from default wiring (verification runs once at Stop); kept on disk as opt-in | not wired (opt-in) |
| `hooks/mark-unrecorded.sh` | Flags unrecorded code changes for the record gate | PostToolUse Edit\|Write |
| `hooks/stop-verify.sh` | Blocks "done" once if code changed but scoped lint+typecheck weren't run; tests are opt-in (`rules/verification.md`) and join the gate only when `ENGINEOS_VERIFY_TESTS=1` or the task had tests in scope | Stop |
| `hooks/record-verify.sh` | Blocks "done" once if code changed but the change was not recorded | Stop |
| `hooks/test-docs.sh` + `docs-ledger.sh` | Probes the prose layer the hook tests can't reach: dangling `rules/`/agent/skill pointers, orphaned agents, `commands/agents/` drift from the roster, router-row closure, and single-source-of-truth budgets. Known debt is declared in the ledger with a reason and a retirement path — visible, defended, and red on the next instance. Not a hook; run `hooks/test-docs.sh` | Test (manual / CI) |
| `skills/record-change` | Finalize a change: mark done, register files+movements, `.engineos/changes/`→`.engineos/archived/` | After completing work |
| `skills/retro` | Mines archived change records + eval/integrity failures for patterns with 3+ occurrences, proposes rule/skill/registry deltas as a PR — proposes only, never merges | "Run a retro", monthly cadence, a correction recurring |
| `templates/handoff.md` | Structured handoff contract (objective, state, gate, decisions, files, evidence, next step) — the test: could the next executor resume from this file alone? | Every wave barrier (`rules/parallelism.md`), session boundaries |
| `docs/BIG-PICTURE.md` | One-page architectural map: layered system, request lifecycle, hook event map, risk→gates, kernel callers, fan-out waves, agent roster, knowledge homes — as Mermaid flowcharts | Consult when asking "what fires when, and who decides" |
| `docs/COMPATIBILITY.md` | What counts as public surface (rule paths, agent names, aliases, commands, hook contracts), semver rules, deprecate→warn→remove window | Any rename or removal of public surface |
| `templates/adapters/` | How the methodology maps onto Cursor, Codex and Copilot — what's enforced natively vs degrades to CI-only convention | Porting EngineOS to a non-Claude-Code tool |
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
Once the work is done and verified (lint + typecheck shown, plus tests only when they were in scope for the task — see `rules/verification.md`):
```bash
mkdir -p ".engineos/archived/<YYYY>/<MM>/<domain>" && git mv ".engineos/changes/<date>-<slug>.md" ".engineos/archived/<YYYY>/<MM>/<domain>/<date>-<slug>.md"
```
Archives group by month + `domain:` from the record's front matter — no day
folder; the exact date still lives in the filename prefix. Set `status: done`
and add `completed: <YYYY-MM-DD>`. Git keeps the full move history.

**3. Capture a lasting fact → `.engineos/memory/`**
If the change leaves a durable takeaway (a decision, a convention, a gotcha),
write a one-concept file in `.engineos/memory/` and link it from the archived record with
`[[memory-slug]]`. Skip this for routine changes — only distil what's worth recalling.

Boundaries: `.engineos/memory/` is EngineOS's own knowledge store — not personal Claude
memory and not a copy of `rules/`. See `rules/memory.md` for which knowledge lives
where.

## Changing a standard

Rules are code. Open a PR, team reviews, merge, everyone `git pull && ./install.sh`.
No Slack-announcement standards. Public surface (rule paths, agent names, aliases,
commands, registries) follows `docs/COMPATIBILITY.md` — a rename is a deprecation
with a window, never a silent `git mv`.

Before merging any change to `rules/`, `agents/`, `skills/`, `commands/`,
`registries/`, or `hooks/`, run:
```bash
scripts/validate-engineos.sh   # 44 self-integrity Checks
scripts/run-evals.sh           # golden set for router + agent behaviour
```
`validate-engineos.sh` is a harness; the Checks themselves are `check_<id>()`
functions in `scripts/checks/<family>.sh`, discovered by name. `--list` prints
the ids, `--only C17,C21c` runs a subset (a parent id also selects its
letter-suffixed sub-checks).

CI runs both, plus `scripts/test-validate-engineos.sh` — planted-breakage cases,
one per Check, proving the validator actually catches what it claims to.

`.github/workflows/live-evals.yml` runs the eval set's live tier weekly (manual
dispatch also works) — real model calls, so it is cost-gated off the PR path
and needs an `ANTHROPIC_API_KEY` repo secret. It measures router *accuracy*,
which the PR-gating deterministic tier cannot: that tier only proves the eval
set itself is well-formed.

## Security

- No secrets in this repo, ever. The installer and reviewers enforce it. Leaked = rotate.
- `mcp.template.json` uses env-var references only.
