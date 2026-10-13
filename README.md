# EngineOS

Shared AI engineering environment for Claude Code. One source of truth for how we build:
rules, skills, routing, quality-gate hooks, and MCP baseline — versioned, reviewed via PR,
installed with one command. Active development uses JavaScript/TypeScript: NestJS for every application backend, Next.js/React for frontend, React Native for mobile, and Mastra for LLM agents and chatbots inside NestJS providers. Node.js is the runtime/tooling layer. Nest's Express adapter is allowed; standalone Node/Express backend apps are outside policy.

Spec: see `docs/PRD.md`.

- **Context discovery:** [`docs/context/README.md`](docs/context/README.md) explains task-scoped loading; consult the Markdown catalogue on demand.
- **New user? Read [`docs/START.md`](docs/START.md)** — how to invoke the skills, agents, commands, MCPs, hooks, and the change lifecycle day to day.
- **Adopting into a project? Follow [`docs/ADOPTION.md`](docs/ADOPTION.md)** — step-by-step from clone to working patterns.

## Install

Two modes — **pick one**, not both (both = duplicate skills/hooks):

**A. Script (recommended — full setup):**
```bash
git clone git@github.com:ricardofagmer/engineer-spec-ia-pattern.git ~/projects/engineos
cd ~/projects/engineos && ./install.sh
```

Windows: use `install.ps1`; both installers require node >= 18, no jq.

**B. Plugin (skills/agents/hooks; no constitution import or permissions):**
```
/plugin marketplace add ricardofagmer/engineer-spec-ia-pattern
/plugin install engineos@engineos
```
Add `@<plugin-path>/CLAUDE.md` to personal `~/.claude/CLAUDE.md` for routing,
or use mode A. Choose one mode to avoid duplicate hooks/skills.

Mode A is idempotent; rerun after pull. It:
1. Fails closed on secret-looking repository strings.
2. Updates one constitution import without altering personal lines.
3. Links skills/agents/commands/rules/patterns into `~/.claude/`, pruning stale
   skills/agents/commands symlinks. Locked Matt Pocock/Tech Leads Club skills link
   from `.agents/skills/` when no canonical source overrides them; missing sources
   or non-symlink targets warn/skip. PowerShell uses equivalent junctions.
4. Merges routing/validation/change hooks and read-only permissions into
   `settings.json` with a write-once backup.

Personal style/hooks/keys remain in personal CLAUDE/settings.local files.
`ENGINEOS_GIT_WRITES=ask` defaults to one permission per git/forge write;
`auto` permits unprompted writes (`rules/git.md`, "Who may write").

### Windows

Hooks execute `node "<repo>/dist/engineos.cjs" hook <name>` directly; plugin and
script modes use identical commands. Git Bash is outside the hook path (avoiding
terminal-launcher windows), but needed for `scripts/kernel.sh` until 2.0. Node
must be on Claude's PATH. jq is unnecessary: merge, parsing, generators/evals,
bench/usage/validator use the bundle. Repository development needs node >= 18
and shellcheck for installer/shims.

## What's inside

| Path | What | When it fires |
|---|---|---|
| `CLAUDE.md` | Constitution, supervisor routing and non-negotiables | Always loaded; routes every substantive prompt to the right rules/skills before action, announcing `risk=`/`autonomy=` alongside the loaded rules |
| `rules/base.md`, `security.md`, `git.md`, `context.md` | Always-on ecosystem/security/git/context core | Every session |
| `rules/subagents.md` | Mandatory visible flat worker dispatch and ownership | Loaded when the task contract names agents |
| `rules/verification.md` | Final non-test gate; tests only with final approval | Loaded for verification/done claims |
| `rules/risk-autonomy.md` | Risk inputs, A0–A4 ceilings and human decisions | Loaded for substantive work |
| `rules/gates.md` | Risk-selected discovery/design/implementation/validation/release gates | Loaded for substantive work |
| `rules/context.md` | Task-scoped loading and source-attributed context | Always on |
| `rules/parallelism.md` | Frozen contracts, exclusive files, useful host-bounded concurrency (policy cap 6), refill and bounded retries | In the substantive-task policy bundle; enforced when scale requires it |
| `rules/models.md` | Work-type tiers, model bindings and budget degradation ladder | In the substantive-task policy bundle |
| `rules/architecture.md`, `backend.md`, `backend-python.md`, `frontend.md`, `llm-apps.md`, `testing.md`, `data.md`, `observability.md` | Domain standards, one file per stack (NestJS and FastAPI) | Loaded by router per intent |
| `rules/production-backend-standards.md` | Deprecated 2026-09-28 client overlay; migrate applicable sections to project rules; remove next MAJOR | Never (kept for the deprecation window) |
| `registries/routing.json` | Canonical domain path map, precedence, rules/skills/agents and risk floors | Read by `scripts/validate-engineos.sh` |
| `registries/decision-rules.json` | Conditional requirements resolved in task contracts | Resolved by `scripts/kernel.sh resolve-task`, surfaced by `hooks/prompt-advisor.sh` |
| `skills/nestjs-patterns` | Team NestJS shapes | Backend work |
| `skills/react-patterns` | Team React/Next shapes | Frontend work |
| `skills/llm-engineering` | Prompts, tools, RAG, evals | LLM/agent work |
| `skills/python-patterns` | Team FastAPI shapes (ports and adapters, routers, schemas, settings, migrations) | Python backend work |
| `skills/mastra-patterns` | Mastra agents, tools, workflows, memory and NestJS integration; multi-agent implementations require an approved topology | LLM agents and chatbots |
| `skills/langgraph-patterns` | Team LangGraph conventions for tool-using agent loops on the Python stack | After the topology approval, Python agent systems |
| `skills/agent-system-design` | 12-step topology interview/catalog; developer approval before implementation | Any system with more than one agent, before graph code |
| `skills/adr` | Decision records | Architecture choices |
| `skills/eval-harness` | Approved final golden-set/runner/judge scaffolding | LLM feature without evals |
| `skills/release-notes` | Structured release page from commits/PRs | Version bump / "write release notes" |
| `skills/strategy` | Five business/career modes grounded in dated sources; outputs docs/strategy/ | Business/career strategy questions |
| `agents/architecture-analyst.md` | Code-grounded architecture/onboarding analysis and gap interviews | Documenting/understanding a system |
| `agents/qa-tester.md` | Approved final API QA: Docker, endpoint inventory/Postman, Newman and report | Approved final API regression / smoke QA |
| `agents/security-reviewer.md` | Adversarial, OWASP-mapped diff review (read-only) | Pre-merge on risky diffs |
| `agents/critic.md` | Read-only adversarial correctness; defaults not proven | Required at risk=high per `rules/gates.md`; on explicit request |
| `agents/test-writer.md` | Tests from acceptance criteria after completed integration and explicit current-task user approval | Approved final test work |
| `agents/{backend,frontend,mobile,dba,devops,llm}-coordinator.md` | Scoped dual-mode domain workers with shared envelope | Scoped domain analysis or changes |
| `agents/{kubernetes,gcp,postgres,oracle,cicd}-specialist.md` | Read-only MCP leaf specialists; supervisor dispatches | Supervisor-dispatched audit leaves |
| `agents/audit-consolidator.md` | Merges specialist reports into one status report (verdict + root cause + plan) | End of an audit run |
| `agents/ios-builder.md`, `agents/android-builder.md` | Preflight/version/sign/upload pipelines; production release only on instruction | Mobile store release |
| `commands/analyze-architecture.md`, `commands/talk-about-the-system.md` | Architecture analysis and interactive documentation interviews | System comprehension / onboarding |
| `commands/design-agents.md` | Interview writes topology spec; waits recorded topology-approval | Multi-agent system design |
| `commands/new-feature.md` | Reviewed stack/ADR/PRD/SPEC/TASKS flow; tests only after integration and explicit approval | A feature built from scratch |
| `commands/audit.md`, `commands/implement.md` | Supervisor entrypoints: freeze, dispatch ready units, refill and integrate | Multi-domain audit or coordinated change |
| `commands/agents/*.md` (generated by `scripts/gen-agent-commands.sh`) | Generated name/alias commands: plugin /engineos:agents:<name>, installed /<name>; remove @generated to preserve custom edits | Named worker invocation; supervisor routing still applies |
| `commands/bypass.md` | Disable constitution routing/gates/records/offers with on/off/status; repo marker expires next SessionStart, machine/env flags persist | One-off work that needs bypass |
| `hooks/bypass.sh` | Compatibility shim; `engineos bypass on/off/status [cwd]` manages the switch read by `src/hooks/bypass.ts` | Manual toggle |
| `rules/memory.md` | Where knowledge lives (rules vs ADR vs CLAUDE.md vs memory) | Loaded when durable knowledge or recall is in scope |
| `templates/permissions.template.json` | Shared read-only permission allowlist | Merged by installer |
| `hooks/prompt-advisor.sh` | Unified task contract; greenfield prompts record NestJS and ask unresolved tiers; advisory, bypass-aware | UserPromptSubmit |
| `hooks/route-before-change.sh` | Edit routing from canonical registry via kernel route-path | PreToolUse Edit\|Write |
| `hooks/announce-agent-dispatch.sh` + `announce-agent-return.sh` | Inject visible dispatch/return banners; Cursor mirrors prompt-only convention | PreToolUse / PostToolUse `Agent\|Task` |
| `hooks/post-edit-check.sh` | Retired per-edit gate; opt-in compatibility only | not wired (opt-in) |
| `hooks/mark-unrecorded.sh` | Flags unrecorded code changes for the record gate | PostToolUse Edit\|Write |
| `hooks/stop-verify.sh` | Opted-in final lint/typecheck Stop gate; no automatic tests; deprecated VERIFY_TESTS ignored; budget override | Stop |
| `hooks/git-write-guard.sh` | Per-command git/forge write permission (ask default/auto personal override); survives bypass | PreToolUse `Bash` |
| `hooks/record-verify.sh` | Blocks "done" once if code changed but the change was not recorded | Stop |
| `src/docs/prose-layer.e2e.test.ts` + `registries/docs-ledger.json` | Approved tests for pointers/closure/generated drift; ledger declares existing debt and retirement | Approved final tests (manual CI approval) |
| `skills/record-change` | Finalize file movements/account and archive change record | After completing work |
| `skills/retro` | Mine repeated (3+) evidence; propose improvement PR, never merge | "Run a retro", monthly cadence, a correction recurring |
| `patterns/3-Agent-topology-interview.md` | Topology interview procedure | Multi-agent design sessions |
| `templates/agent-topology.md` | Stepwise topology spec and approval contract | Written by `/engineos:design-agents` |
| `templates/handoff.md` | Resumable objective/state/decisions/files/evidence/next-step contract | Every wave barrier (`rules/parallelism.md`), session boundaries |
| `docs/BIG-PICTURE.md` | Mermaid architecture, lifecycle, hooks, roles and knowledge map | Consult when asking "what fires when, and who decides" |
| `docs/COMPATIBILITY.md` | Public surfaces and semantic-version/deprecation windows | Any rename or removal of public surface |
| `templates/adapters/` | Tool-specific enforcement and conventional fallback mappings | Porting EngineOS to a non-Claude-Code tool |
| `templates/mcp.template.json` | Optional docs/git/browser/backend/data/infra/cloud/collaboration MCP baseline; verify packages before connecting | Manual add — connect only what a machine needs; `$verify` entries confirm package first |
| `templates/project-claude.md` | JavaScript/TypeScript project constitution starter | Written by `init` when the project has none |
| `templates/agent-skills/issue-tracker.md`, `domain.md` | Per-project skill config for PRD/tickets/ADR/glossary paths; init copies without overwrite | Copied to `docs/agents/` by `init` when absent, never overwritten |
| `templates/project-claude-python.md` | Python-only project constitution starter | Written by `init` when every resolved package is Python |
| `.engineos/config.json` | Declared package stacks; `init --stack auto` or explicit frameworks writes once; resolve-stack uses declaration or truthful detection; legacy fields remain compatible | Read per package by the gate and hooks |
| `.engineos/changes/` | Active change records — one file per in-progress unit of work | While work is in progress |
| `.engineos/archived/` | Completed change records, moved from `.engineos/changes/` | After work is done + verified |
| `.engineos/memory/` | Durable, team-shared takeaways that outlive a single change | When a finished change leaves a lasting fact |

## Relationship to plugins

EngineOS routes to — and depends on — these installed plugins, it does not replace them:
- **superpowers** — brainstorming, TDD, systematic debugging, verification-before-completion
- **tlc-spec-driven** — spec → design → tasks → execute workflow

Install both before/with EngineOS.

From-scratch `/engineos:new-feature` instead uses pinned Matt Pocock
`grill-with-docs`/`to-spec`/`to-tickets` and Tech Leads Club `tlc-spec-lean`
(CC-BY-4.0), linked through `skills-lock.json` and the installer.

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

Three tracked homes preserve each change:

1. **Start:** copy `.engineos/changes/_template.md` to `<date>-<slug>.md`;
   fill What/Why/Scope and `status: active`. Commit with its work under git-write policy.
2. **Finish:** after shown final lint/typecheck and explicitly approved final tests
   (or honest pending test status under `rules/verification.md`), use
   `record-change` to move to
   `.engineos/archived/<YYYY>/<MM>/<domain>/<date>-<slug>.md`. Domain comes from
   frontmatter; no day folder. Set `status: done`, `completed: <YYYY-MM-DD>`;
   preserve git move history under authorized git writes.
3. **Remember:** lasting decisions/conventions/gotchas get one-concept files in
   `.engineos/memory/`, linked from the archive via `[[memory-slug]]`.
   Routine changes need no memory file.

Folder READMEs/templates own file shapes. Team memory is neither personal Claude
memory nor duplicated rules; `rules/memory.md` assigns knowledge homes.

## Changing a standard

Standards change through a reviewed PR, then `git pull && ./install.sh`.
Public paths/names/contracts follow `docs/COMPATIBILITY.md`: deprecation windows,
never silent renames.

At the final stage, propose relevant integrity/eval scope for user approval:
```bash
scripts/validate-engineos.sh   # 68 self-integrity Checks
scripts/run-evals.sh           # router + agent golden set
```
These behavioral checks and `npm test` run only after integrated implementation
and explicit current-task approval. Non-test typecheck/build remain the final
automatic validation path; pending tests/evals are reported honestly.

Validator shim invokes `engineos validate`; `src/checks/index.ts` declares
families under `src/checks/`. `--list` shows ids; `--only C17,C21c` selects
subsets (parent ids include suffixes). Validator-surface tests live in
`src/validate/validate.e2e.test.ts`; family planted-breakage tests assert finding
codes rather than rendered output.

CI behavioral suites require manual approval. `.github/workflows/live-evals.yml`
is manual, approval-gated and needs a CI-scoped `ANTHROPIC_API_KEY`; live calls
measure router accuracy, while deterministic conformance checks set validity.
Neither environment flags nor CI configuration substitute for task approval.

## Security

- No secrets in this repo, ever. The installer and reviewers enforce it. Leaked = rotate.
- `mcp.template.json` uses env-var references only.
