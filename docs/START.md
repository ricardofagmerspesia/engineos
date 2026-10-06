# Start Here — Working with EngineOS

New to EngineOS? This is how to actually use it day to day: what fires
automatically, and how to invoke the skills, agents, commands, and MCPs by hand.

> Setting it up for the first time? Do [`ADOPTION.md`](ADOPTION.md) first —
> `init-project.sh --stack auto|<framework>[@dir],...` declares the stack the Stop
> gate verifies. This guide assumes EngineOS is already installed.

## Mental model

```
You type a request
      │
      ▼
[router]  ── classifies intent (CLAUDE.md) ──► loads the right rules + skills + agents
      │
      ▼
You + Claude do the work
      │  every file edit → PreToolUse hook injects the matching rule/specialist
      ▼
Finish ── Stop hooks gate: verified?  recorded?  ──► done
```

Want the full map — layers, hook events, kernel, gates, agent roster — as
flowcharts? [`BIG-PICTURE.md`](BIG-PICTURE.md).

Most of it is **automatic**. You rarely invoke anything by name — the router and
hooks do it. The sections below are for when you want to drive a piece directly.

---

## 1. Skills — invoke by name, or let them trigger

Skills are procedures. They auto-trigger from your wording, or you invoke one
explicitly by typing its name (Claude runs it via the Skill tool).

| Skill | Use it when |
|---|---|
| `record-change` | A unit of work is done — mark its record done, log files, archive it |
| `retro` | Mine closed change records + eval/integrity failures for durable rule improvements (3+ occurrences required); proposes a PR, never merges |
| `tlc-spec-driven` | Planning a feature/project (specify → design → tasks → execute) |
| `tlc-spec-lean` | The SPEC stage of `/new-feature` (plan, then checks, in `.specs/features/<feature>/`) and its independent Verifier — loaded by the command, not invoked on its own |
| `grill-with-docs`, `to-spec`, `to-tickets` | Matt Pocock's ADR, PRD and TASKS stages of `/new-feature`. Human-invoked only (`disable-model-invocation: true`) — Claude cannot trigger them from your wording; the command runs them for you |
| `adr` | Making an architecture decision worth recording |
| `eval-harness` | An LLM feature has no evals yet |
| `release-notes` | Writing release notes / documenting a version |
| `nestjs-patterns` | Building NestJS backend code |
| `react-patterns` | Building React/Next frontend code |
| `llm-engineering` | Building prompts/agents/RAG/tools |
| `python-patterns` | Building FastAPI/Django/Flask backend code |
| `agent-system-design` | Designing a system with more than one agent — the 12-step form behind `/design-agents`, approval before any graph code |
| `langgraph-patterns` | Implementing an approved agent topology in LangGraph — loads after the approval, never to choose for you |
| `strategy` | Business/career strategy: market opportunity, learning path, blocked decision, positioning, monetizing existing assets — grounded in web sources + this repo, written to `docs/strategy/` |

Invoke explicitly: just say `record-change` or "use the eval-harness skill".
Process skills from the `superpowers` plugin (`brainstorming`,
`systematic-debugging`, `verification-before-completion`) trigger first when
relevant — let them. The one exception is a feature built from scratch: it goes
through `/new-feature` (§3), not `brainstorming` → `writing-plans`.

---

## 2. Agents — dispatch for scoped analysis or change

Agents run in their own context and report back. Dispatch with the Task tool, or
say "use the `<name>` agent to …".

EngineOS ships 22 agents total.

**Domain coordinators** (dual-mode — AUDIT read-only, or IMPLEMENT writes):
`backend-coordinator`, `frontend-coordinator`, `mobile-coordinator`,
`dba-coordinator`, `devops-coordinator`, `llm-coordinator`.

**Leaf specialists** (read-only, MCP-backed deep dives — usually auto-dispatched by
`/audit`): `kubernetes-specialist`, `gcp-specialist`, `postgres-specialist`,
`oracle-specialist`, `cicd-specialist`.

**Reviewers / writers:** `security-reviewer` (adversarial security lens,
read-only), `critic` (adversarial general-correctness lens, read-only — tries to
refute that work is done; required at risk=high per `rules/gates.md`),
`test-writer`, `audit-consolidator` (merges reports into one verdict),
`architecture-analyst` (system comprehension + onboarding docs + interview mode).

**Store-release pipelines** (no alias): `ios-builder`, `android-builder` — full
build/version-bump/quality-gate/signed-upload pipeline for TestFlight/Play,
production submission only on explicit instruction.

Example: `use the backend-coordinator to audit src/payments for IDOR and N+1`.

**Aliases** — these agents also answer to a short name (say either):

| Canonical | Alias |
|---|---|
| backend-coordinator | borisenko |
| frontend-coordinator | arturo |
| mobile-coordinator | elias |
| devops-coordinator | hinokuma |
| dba-coordinator | ronaldo |
| llm-coordinator | hermsdorff |
| oracle-specialist | leo |
| kubernetes-specialist | kovac |
| gcp-specialist | nakamura |
| postgres-specialist | pereira |
| cicd-specialist | gustavo |
| security-reviewer | leo-ely |
| critic | vera |
| test-writer | ameer |
| audit-consolidator | corradin |
| architecture-analyst | analyst |
| qa-tester | qa |

`ios-builder` and `android-builder` have no alias — always invoke by full name.

e.g. `borisenko, audit the orders service` works the same as naming the coordinator.

---

## 3. Commands — orchestrators

Slash commands fan out to agents and consolidate. (Mode A installs them as `/audit`
and `/implement`; plugin mode namespaces them `/engineos:audit`.)

```
/audit all                  # read-only audit across all domains → status report
/audit dba src/orders       # one domain, scoped
/implement backend add idempotency keys to the payments webhook
/design-agents              # design a system with more than one agent — before any graph code
/design-agents resume       # pick a draft topology spec back up at its first unfilled step
/new-feature orders         # a feature from scratch: PRD + ADR + SPEC + TASKS before code
/new-feature orders resume  # restart at the earliest stage whose artifact is missing
```
`/audit` writes `.engineos/audits/<date>-<domain>.md` (verdict + root cause + plan).
`/implement` is spec-gated and closes with a change record.
`/design-agents` is interactive: `llm-coordinator` (hermsdorff) walks the
`agent-system-design` form with you one step at a time — topology, roster, tools,
protocol, context scoping, memory, harness, guardrails, failure policy,
observability, evals, diagrams — writing `docs/specs/<date>-<slug>-agent-topology.md`
as you answer, and closes only when your approval line (`topology-approval`) is in
the change record. `langgraph-patterns` loads after that, never to choose for you.

`/new-feature <feature-slug> [resume]` runs in your session, one stage at a time,
and stops for your review at the end of each:

| Stage | Produces |
|---|---|
| 0. Stack | only in a greenfield repo — the stack question, `init --stack`, the first ADR |
| 1. Preconditions | `docs/agents/issue-tracker.md` and `docs/agents/domain.md` (from `templates/agent-skills/` if missing); a change record |
| 2. ADR (`grill-with-docs`) | `docs/adr/YYYY-MM-DD-<slug>.md`, glossary in `CONTEXT.md` |
| 3. PRD (`to-spec`) | `docs/prds/YYYY-MM-DD-<feature>.md` |
| 4. SPEC (`tlc-spec-lean`) | `.specs/features/<feature>/plan.md` (stops for review), then `checks.md`; index `docs/specs/YYYY-MM-DD-<feature>.md` |
| 5. TASKS (`to-tickets`) | `docs/specs/<feature>/tickets/NN-<slug>.md`, each with `Blocked by:` and `Closes checks:` |
| 6. Build + verify | the code, with tests ON (the `checks.md` proofs), then a fresh Verifier writing `.specs/features/<feature>/verification.md` |

The SPEC itself lives in `.specs/` because `tlc-spec-lean` is installed unchanged;
`docs/specs/` only holds the index. In stage 6, `tlc-spec-lean` decides between one
builder or sequential batches (advancing only on green) — that stage does not fan
out in parallel the way `rules/parallelism.md` would by default.

**Escape hatch — `/bypass`.** Some work isn't worth the constitution: a throwaway
script, a one-line spike, someone else's repo you're just poking at.

```
/bypass              # EngineOS off — no routing, no agents, no spec gate, no Stop gates
/bypass status       # active | bypassed
/bypass off          # back on
```
This is not a polite request to ignore the rules — it writes a marker file into the
repo's git dir that every hook checks, so the gates genuinely stop firing. Two
things stay true while it's on: the assistant tells you `[engineos] bypassed` on
every turn (a silent bypass is the dangerous one), and the marker is deleted at the
next SessionStart, so a bypass you forget about expires into gates-ON rather than
persisting. Secrets hygiene and confirmation before destructive actions are not
EngineOS rules and do not switch off.

---

## 4. MCPs — what powers the leaf specialists

MCP servers give agents live access to infra/data/tools. Each leaf specialist binds
to one:

| Specialist | MCP server | Without it |
|---|---|---|
| postgres-specialist | `postgres` | returns `UNKNOWN — no DB access` |
| oracle-specialist | `oracle` | `UNKNOWN` |
| kubernetes-specialist | `kubernetes` | `UNKNOWN` |
| gcp-specialist | `gcp` | `UNKNOWN` |
| cicd-specialist | `github` | falls back to repo workflow files |
| audit-consolidator | `mcp-atlassian` | skips Jira context |

Connect them per [`ADOPTION.md`](ADOPTION.md) §4 — env-var creds only,
read-only roles. Baseline config + `$verify` notes: `templates/mcp.template.json`.
Check what's live: the leaf returns real findings instead of `UNKNOWN`.

---

## 5. Hooks — automatic, you don't invoke them

These run on their own. Know what they do and how to respond:

| Hook | Fires | What you do |
|---|---|---|
| `route-before-change` | before each edit | nothing — read the injected `[router]` line; follow it |
| `mark-unrecorded` | after a code edit | nothing — flags that a change needs recording |
| `stop-verify` | when finishing | if it blocks: run the gate for the touched packages and show output — Node: lint + typecheck; Python: ruff + pyright (see "Python projects" below). Tests join only if they were requested for this task, or `ENGINEOS_VERIFY_TESTS=1` is set |
| `record-verify` | when finishing | if it blocks: run the `record-change` skill |
| `ensure-project-layout` | session start | nothing — scaffolds missing `.engineos/{changes,archived,memory}` + `docs/{specs,prds,rules}` (opt-in: only when `.engineos/` exists or `ENGINEOS_SCAFFOLD=1`) and prints one `[engineos] stack: fastapi@backend · react@frontend · runners: …` line so you can see which gate will run; if it names the wrong stack, edit `.engineos/config.json`. In a greenfield repo (no `.engineos/config.json`, no package manifest) it instead adds `[engineos] no stack declared …`: expect Claude's first reply to ask you which stack to use per tier — answer it, and it persists your choice with `init --stack` and records it as the first ADR |
| `prompt-advisor` | on your prompt | nothing — one non-blocking task contract combining route, scale, model tier, policy loads and matched decision rules; in a greenfield repo a build-type prompt (feature, backend, frontend, mobile, LLM, agent system) also carries the `no stack declared` note. Advisory — it never blocks |
| `git-write-guard` | before each `Bash` call | answer the permission prompt when the command writes to git or the forge (`commit`, `push`, `add`, `checkout`, `gh pr create`, …). Read-only git never prompts. Personal setting `ENGINEOS_GIT_WRITES=ask` (default) \| `auto` in `~/.claude/settings.local.json` — see `rules/git.md` "Who may write" |

Gates block **once** (never loop). A block means "do the thing, then finish."

Every hook in this table except `git-write-guard` checks the bypass marker first
and exits early when it is set — see `/bypass` in §3. That is the only supported
way to silence them; editing `settings.json` to unwire a hook takes it off for
good, not for one task. The git-write guard is the developer's own safety net, not
a constitutional rule, so bypass leaves it on; switch it off per machine with:

```json
{"env": {"ENGINEOS_GIT_WRITES": "auto"}}
```

in `~/.claude/settings.local.json`.

**Tests are opt-in, not automatic.** EngineOS writes no tests and runs no test
suite unless you ask for them ("write tests", "add coverage", "TDD this", "run
the suite"), your project's `CLAUDE.md` requires them, a test agent
(`test-writer` / `qa-tester`) was dispatched on purpose, or you named a
release/merge gate that includes tests. Work that runs `/new-feature` has tests ON:
the proofs in `.specs/features/<feature>/checks.md` are its tests. Otherwise the finalization gate is
**lint + typecheck only** — see `rules/verification.md` for the full policy, and set
`ENGINEOS_VERIFY_TESTS=1` to force tests back into the Stop gate unconditionally.

**Python projects.** For a package the stack resolves to Python (`.engineos/config.json`,
else a `pyproject.toml`/`requirements.txt`), the Stop gate runs `ruff` and `pyright`
(plus `pytest` when tests are on) through the first environment it finds:
`.venv/bin` (package, then repo root) → `uv run` when a `uv.lock` exists → `docker compose
exec -T <compose_service>` when `.engineos/config.json` names one. It never installs
anything. With no environment it says so and moves on —
`[engineos] stop-verify skipped for <pkg>: no Python environment found (venv, uv or compose)` —
so a skipped package is visible, never silent. `ENGINEOS_VERIFY_TESTS=1` adds `pytest`;
`ENGINEOS_VERIFY_BUDGET_S=<seconds>` raises every target's timeout (default 90s, 180s for
tests) when pyright's first run over a large repo needs it. Pin `ruff`, `pyright` and
`pytest` to exact versions in the project's dev dependencies: an unpinned tool gets an
advisory line (`… not pinned to exact versions (rules/verification.md)`), not a block.

---

## 6. Specs — where plans live

Multi-file changes and new features get a spec before code (a non-negotiable).
- A feature built from scratch: `/new-feature` (§3) writes PRD + ADR + SPEC + TASKS
  before code — the SPEC in `.specs/features/<feature>/`, indexed from
  `docs/specs/<date>-<feature>.md`, the tickets in `docs/specs/<feature>/tickets/`.
- Other multi-file changes: a design doc in `docs/specs/<date>-<topic>-design.md`
  (`tlc-spec-driven` works too).
- Read the relevant spec before implementing; it carries the approved design + the
  verification plan.

---

## 7. Rules — the standards being enforced

- **Always-on:** `rules/base.md`, `security.md`, `git.md`, `context.md`.
- **Task-contract-loaded:** `memory.md`, `parallelism.md`, `models.md`,
  `subagents.md`, `verification.md`, `risk-autonomy.md`, `gates.md`.
- **Per-domain (routed):** `architecture.md`, `backend.md`, `backend-python.md`, `frontend.md`,
  `llm-apps.md`, `testing.md` (test craft, loaded when tests are on), `data.md`,
  `observability.md`, `memory.md`.
- The routing hook injects the right ones per edit; you don't load them manually.
- Every substantive request now carries a **risk tier and autonomy ceiling**
  (`risk-autonomy.md`) which sets which gates apply (`gates.md`) — see the
  `[router] intent=… risk=… autonomy=… loaded=…` line.
- **Project `CLAUDE.md` overrides EngineOS** where they conflict.

---

## 8. The change lifecycle (every unit of work)

```
open a record            → cp .engineos/changes/_template.md .engineos/changes/<date>-<slug>.md  (status: active)
   ↓ classify risk + autonomy (rules/risk-autonomy.md), which sets the gates that apply (rules/gates.md)
   ↓ do the work (unified prompt advisor + edit routing active)
verify                   → the final gate: lint + typecheck, output shown (tests too, only if in scope)  (Validation gate)
release-ready?           → named owner + rollback path + residual risks accepted (Release gate — required to ship)
record-change skill      → status done, register files+movements, git mv → .engineos/archived/YYYY/MM/<domain>/
```
This is what the Stop gates enforce. Distil any durable decision into `.engineos/memory/`.

---

## Output artifact offer

Once a request is delivered, expect a single follow-up question: which output
artifact to produce next. Options are pruned to what fits the task —
**scaffold** and **flowchart** (or **none**) can apply to anything; **reusable
template** and **UI/UX design** are only offered for frontend/mobile work. Pick
one, or say "none" to stop there; your pick becomes the next unit of work and
goes back through the router.

---

## Your first task — walkthrough

1. Ask for the change ("add pagination to the orders list endpoint").
2. Router announces backend rules + `nestjs-patterns` + `backend-coordinator`.
3. For >2 files a spec comes first — go with it. For a feature built from scratch,
   type `/new-feature <slug>`: PRD, ADR, SPEC and TASKS are written, one review at a
   time, before any code. In an empty repo, Claude asks for the stack before anything else.
4. Open a `.engineos/changes/` record.
5. Implement (or `/implement backend ...`). Each edit gets routed guidance.
6. Verify — show lint/typecheck output (add test output only if tests were
   requested for this change).
7. `record-change` to close and archive. Done.

## Cheat sheet — "I want to… → do…"

| I want to… | Do |
|---|---|
| Analyze a domain / whole system | `/audit <domain\|all> [scope]` |
| Make a coordinated change | `/implement <domain> <task>` |
| Deep DB / cluster / CI inspection | leaf specialist (or `/audit` dispatches it) |
| Record finished work | `record-change` skill |
| Build a feature from scratch | `/new-feature <slug>` — PRD + ADR + SPEC + TASKS before code; `resume` picks up at the first missing artifact |
| Start a brand-new repo | just ask — Claude's first reply asks which stack per tier; never let it pick |
| Design a multi-agent system | `/design-agents` — the 12-step form, approval before any graph code; `resume` picks a draft back up |
| Record an architecture decision | `adr` skill |
| Security-check a diff | `security-reviewer` agent |
| Get an independent "is this actually done" check | `critic` agent (alias `vera`) — required at risk=high |
| Add test coverage | `test-writer` agent |
| Hand work off mid-task | `templates/handoff.md` — never just "continue where I left off" |
| Learn from recent work / recurring corrections | `retro` skill |
| Change a team standard | PR to the EngineOS repo (`CONTRIBUTING.md`) |
| Know why a gate blocked me | §5 — verify or record, then finish |
| Turn EngineOS off for one task | `/bypass` — and `/bypass off` when you're done |
