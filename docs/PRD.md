# PRD: AI Engineering Environment ("EngineOS")

**Status:** Draft v1 (2026-06-11) — **out of date with respect to the code since 2026-09-07** · **Owner:** Ricardo Fagmer

> **Read first:** this PRD records the original intent of the product, not the
> current state. What is implemented, what is partial and what is design only is in
> [`docs/CAPABILITIES.md`](CAPABILITIES.md), measured over snapshot `99b5eec`.
> Three *non-goals* from section 3 are no longer true (adapters for other tools, a
> marketplace entry and CI automation exist in the repository) and are listed as
> divergences in that document. Rewriting the scope is work for epic E01 of the
> production readiness plan and has not been done yet: no capability should be
> announced from this file.

**Scope:** Global (`~/.claude`), distributed to a 2–10 person team via a versioned git repo.
**Stacks:** TypeScript/Node (NestJS), React/Next, AI/LLM apps, with a stack-agnostic base layer.

---

## 1. Problem Statement

Engineers using Claude Code today get inconsistent results: each prompt starts from zero, conventions live in people's heads, and quality depends on how well each person prompts. On a small team this multiplies — two devs ask for the same NestJS service and get two different architectures, reviews catch the same issues repeatedly, and new hires take weeks to absorb unwritten standards.

The cost of not solving this: rework from off-pattern AI output, duplicated prompting effort, drift between projects, and AI used as a fancy autocomplete instead of a disciplined engineering system.

## 2. Goals

1. **Consistency:** Any team member asking for the same class of task (new endpoint, bug fix, new component, agent feature) gets output following the same architecture rules and quality gates.
2. **Routing before action:** ≥90% of substantive prompts pass through an intent router that loads the right rules/skills *before* Claude touches code.
3. **Onboarding speed:** A new hire produces on-pattern, review-passing AI-assisted code on day 1 (vs. weeks of convention absorption).
4. **Quality floor:** Every code-producing session ends with verification (typecheck, tests, lint) enforced by hooks — not by memory or goodwill.
5. **Shareability:** One-command install of the entire environment on a fresh machine (`git clone && ./install.sh`), with zero secrets in the repo.

## 3. Non-Goals

- **Building a custom plugin marketplace** — superpowers + official plugins cover the workflow layer; we layer on top, we don't fork. (Premature; revisit if team >10.)
- **Replacing existing plugins (superpowers, tlc-spec-driven)** — they already handle brainstorming, TDD, debugging, plans. EngineOS *routes to* them. Duplicating them creates conflicting instructions.
- **CI/CD agent automation** (agents reviewing PRs in CI, scheduled audits) — separate initiative; P2 architectural insurance only.
- **Per-project deep customization** — projects get a thin `.claude/CLAUDE.md` override layer, not full per-repo environments. (Drift risk; the point is one source of truth.)
- **Non-Claude tooling** (Cursor rules, Copilot instructions) — single-tool focus for v1; the rules files are written tool-agnostically so porting later is cheap.

## 4. User Stories

**Team developer**
- As a team developer, I want my prompt ("add refund endpoint") automatically routed to the API-design rules and NestJS skill so that I don't have to remember which conventions apply.
- As a team developer, I want hooks to run typecheck/lint after every AI edit so that broken code never silently accumulates.
- As a team developer, I want a `verify-before-done` gate so that Claude never claims "done" without evidence.

**Tech lead**
- As a tech lead, I want architecture and security rules versioned in git so that changing a standard is a PR, not a Slack announcement.
- As a tech lead, I want spec-driven workflow triggered for any multi-file feature so that design happens before code, every time.
- As a tech lead, I want a security-reviewer subagent invokable on any diff so that the security floor doesn't depend on who's reviewing.

**New hire**
- As a new hire, I want one install command that gives me the full team environment so that my first AI-assisted PR follows team patterns without me knowing them yet.
- As a new hire, I want the router to *tell me* which rules/skills it loaded so that I learn the conventions by seeing them applied.

**LLM-app engineer (tasy-agent work)**
- As an engineer building agents, I want an llm-engineering skill (prompt design, eval harnesses, tool schemas, RAG patterns) so that agent code gets the same rigor as API code.

## 5. Requirements

### P0 — Must-Have

**R1. Router (`CLAUDE.md` + `skills/router/`)**
A thin global `CLAUDE.md` acting as constitution + routing table. Before any substantive action, Claude classifies intent and loads the matching rules/skills.

Intent map (initial):

| Intent | Route to |
|---|---|
| New feature / multi-file change | `superpowers:brainstorming` → `tlc-spec-driven` → stack skill |
| Bug / unexpected behavior | `superpowers:systematic-debugging` |
| Backend (NestJS) work | `rules/backend.md` + `skills/nestjs-patterns` + nestjs MCP |
| Frontend (React/Next) work | `rules/frontend.md` + `skills/react-patterns` |
| LLM/agent work | `rules/llm-apps.md` + `skills/llm-engineering` |
| Refactor / cleanup | `rules/architecture.md` + simplify pass |
| Review / pre-merge | code-review skill + security-reviewer subagent |
| "Done" claim | `superpowers:verification-before-completion` |

Acceptance criteria:
- [ ] Router fires on every substantive prompt; announces which rules/skills it loaded (one line).
- [ ] Unknown intent falls through to base rules, never blocks.
- [ ] Routing table is data (markdown table), editable without touching skill logic.

**R2. Rules files (`~/.claude/rules/`)**
Always-relevant, terse, declarative standards. Each ≤150 lines (context budget).

- `base.md` — naming, error handling, no-dead-code, comments-say-why, small functions, explicit types.
- `architecture.md` — module boundaries, dependency direction, composition over inheritance, 12-factor config, when-to-split-services.
- `backend.md` — NestJS: module/provider structure, DTO validation at edges, repository pattern, transaction boundaries, idempotency, pagination defaults.
- `frontend.md` — React/Next: server-vs-client components, state colocation, accessibility floor, design-token usage.
- `llm-apps.md` — prompt versioning, structured outputs over parsing, eval-before-ship, token budgets, fallback/retry policy, never trust model output at trust boundaries.
- `security.md` — input validation, secrets handling (no keys in repo/settings), authz at every layer, dependency hygiene, OWASP top-10 checklist pointer.
- `testing.md` — test pyramid, what must have tests (P0: business logic, trust boundaries), TDD via superpowers when implementing.
- `git.md` — branch naming, conventional commits (caveman-commit), PR size limits, atomic commits.

Acceptance criteria:
- [ ] Each rules file ≤150 lines, declarative ("DO/DON'T"), zero narrative.
- [ ] `CLAUDE.md` imports `base.md` always; router loads the rest per intent.

**R3. Core skills (`~/.claude/skills/`)**
Only skills that don't already exist in installed plugins:

- `router` — the intent classifier (R1).
- `nestjs-patterns` — team-specific NestJS conventions, references nestjs MCP for codegen.
- `react-patterns` — component/data-fetching/styling conventions.
- `llm-engineering` — agent design, tool schemas, eval harness setup, prompt iteration loop.
- `adr` — write/update Architecture Decision Records in `docs/adr/` per project.

Acceptance criteria:
- [ ] Each skill has valid frontmatter (`name`, `description` with trigger conditions).
- [ ] No skill duplicates a superpowers/tlc capability — it routes to it instead.

**R4. MCP baseline**
Keep: `context7` (live library docs), `nestjs` (already installed), `pencil`.
Add to team config: `github` (PRs/issues), `chrome-devtools` or `playwright` (verify UI changes), `postgres` (read-only DB introspection for the team's databases).

Acceptance criteria:
- [ ] MCP config in the repo is secret-free (env-var references only).
- [ ] Each MCP documented in `README` with one-line "when it's used".

**R5. Hooks (quality gates)**
- Keep existing `PreToolUse(Bash)` RTK rewrite.
- `Stop` hook → if code was edited this session and scoped lint + typecheck never ran, remind/block "done". Tests join the gate only when they were in scope for the task or `ENGINEOS_VERIFY_TESTS=1` is set (`rules/verification.md` "Tests are opt-in").
- No per-edit verification hook: gating after every `Edit|Write` stalled the build loop, so verification runs once at `Stop`. `hooks/post-edit-check.sh` stays on disk as an opt-in for teams that want it back.

Acceptance criteria:
- [ ] Hook failures are fed back to Claude (not silently logged).
- [ ] Hooks add <5s latency per edit (scope to changed package, not monorepo-wide).

**R6. Distribution repo**
`engineos` git repo containing `CLAUDE.md`, `rules/`, `skills/`, `hooks/`, `mcp.template.json`, `install.sh` (symlinks into `~/.claude`, validates no secrets, installs plugin deps).

Acceptance criteria:
- [ ] Fresh-machine install in one command; idempotent re-run.
- [ ] **Secrets check:** install refuses to proceed if `settings.json` would contain literal API keys (current settings has a plaintext `ANTHROPIC_API_KEY` — must be moved to env/keychain and rotated before repo creation).
- [ ] Team member's local overrides live in `settings.local.json`, never overwritten.

### P1 — Nice-to-Have

- **Security-reviewer subagent** (`agents/security-reviewer.md`) — adversarial diff review, OWASP-mapped findings; router invokes pre-merge.
- **Test-writer subagent** — generates tests from acceptance criteria in specs.
- **Eval harness skill** for LLM apps — scaffold evals (golden sets, LLM-judge) for agent features like tasy-agent's doc agent.
- **Project layer template** — `.claude/` starter for repos (project CLAUDE.md that declares stack so router skips detection).
- **Memory conventions** — what goes in Claude memory vs. ADRs vs. rules (decision: durable team standards → rules repo; per-project context → project CLAUDE.md; personal → memory).
- **`fewer-permission-prompts` baseline** — shared allowlist for common read-only commands.

### P2 — Future Considerations

- **CI agents:** code-review/security skills running headless on PRs (design skills so prompts are reusable headless — no interactive assumptions in P0/P1 skill bodies).
- **Org plugin:** package EngineOS as an installable plugin with marketplace entry when team >10.
- **Usage analytics:** track which rules/skills fire, prune dead ones quarterly.
- **Multi-tool port:** rules written declaratively so they can compile to Cursor/Copilot formats later.

## 6. Success Metrics

**Leading (first 30 days)**
- Router announce-line appears in ≥90% of substantive sessions (spot-check 20 sessions).
- 100% of team installed via `install.sh` within 1 week of release.
- Hook-caught failures per week >0 (proves gates fire) and trending down per dev (proves learning).

**Lagging (quarter)**
- PR review comments about *convention violations* (naming, structure, missing validation) drop ≥50% vs. pre-EngineOS baseline (sample 20 PRs before/after).
- New-hire time-to-first-merged-PR ≤2 days.
- Zero secrets incidents in the shared repo (audited monthly).

**Measurement:** session transcripts spot-check + PR label `convention` count in GitHub; evaluate at 30 days and 90 days.

## 7. Open Questions

- **(You/team, blocking R6)** Where does the `engineos` repo live — personal GitHub or org? Private?
- **(You, blocking R6)** Confirm API-key rotation before first push — key currently in `settings.json` is exposed in this machine's config.
- **(Team, non-blocking)** Which Postgres instances should the read-only MCP cover, and credentials process?
- **(You, non-blocking)** Caveman mode: personal preference or team default? (Recommend: personal — keep out of shared `CLAUDE.md`.)
- **(Tech lead, non-blocking)** PR size limit number for `git.md` (suggest ≤400 lines changed).

## 8. Timeline Considerations

No hard deadlines. Suggested phasing:

- **Phase 1 (now):** R1 router + R2 rules + R6 repo skeleton + secrets fix. Immediately useful solo.
- **Phase 2 (+1 week):** R3 stack skills + R5 hooks. Team install.
- **Phase 3 (+2–4 weeks):** P1 subagents + eval harness, after 2 weeks of real usage feedback.

Dependency: Phase 2 hooks depend on each project exposing fast `typecheck`/`lint` scripts per package.
