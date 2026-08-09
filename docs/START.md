# Start Here — Working with EngineOS

New to EngineOS? This is how to actually use it day to day: what fires
automatically, and how to invoke the skills, agents, commands, and MCPs by hand.

> Setting it up for the first time? Do [`docs/ADOPTION.md`](docs/ADOPTION.md) first.
> This guide assumes EngineOS is already installed.

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

Most of it is **automatic**. You rarely invoke anything by name — the router and
hooks do it. The sections below are for when you want to drive a piece directly.

---

## 1. Skills — invoke by name, or let them trigger

Skills are procedures. They auto-trigger from your wording, or you invoke one
explicitly by typing its name (Claude runs it via the Skill tool).

| Skill | Use it when |
|---|---|
| `record-change` | A unit of work is done — mark its record done, log files, archive it |
| `tlc-spec-driven` | Planning a feature/project (specify → design → tasks → execute) |
| `adr` | Making an architecture decision worth recording |
| `eval-harness` | An LLM feature has no evals yet |
| `release-notes` | Writing release notes / documenting a version |
| `nestjs-patterns` | Building NestJS backend code |
| `react-patterns` | Building React/Next frontend code |
| `llm-engineering` | Building prompts/agents/RAG/tools |
| `strategy` | Business/career strategy: market opportunity, learning path, blocked decision, positioning, monetizing existing assets — grounded in web sources + this repo, written to `docs/strategy/` |

Invoke explicitly: just say `record-change` or "use the eval-harness skill".
Process skills from the `superpowers` plugin (`brainstorming`,
`systematic-debugging`, `verification-before-completion`) trigger first when
relevant — let them.

---

## 2. Agents — dispatch for scoped analysis or change

Agents run in their own context and report back. Dispatch with the Task tool, or
say "use the `<name>` agent to …".

**Domain coordinators** (dual-mode — AUDIT read-only, or IMPLEMENT writes):
`backend-coordinator`, `frontend-coordinator`, `dba-coordinator`,
`devops-coordinator`, `llm-coordinator`.

**Leaf specialists** (read-only, MCP-backed deep dives — usually auto-dispatched by
`/audit`): `kubernetes-specialist`, `gcp-specialist`, `postgres-specialist`,
`oracle-specialist`, `cicd-specialist`.

**Reviewers / writers:** `security-reviewer` (adversarial, read-only),
`test-writer`, `audit-consolidator` (merges reports into one verdict).

Example: `use the backend-coordinator to audit src/payments for IDOR and N+1`.

**Aliases** — these agents also answer to a short name (say either):

| Canonical | Alias |
|---|---|
| backend-coordinator | borisenko |
| frontend-coordinator | arturo |
| devops-coordinator | hinokuma |
| dba-coordinator | ronaldo |
| llm-coordinator | hermsdorff |
| oracle-specialist | leo |
| kubernetes-specialist | kovac |
| gcp-specialist | nakamura |
| postgres-specialist | pereira |
| cicd-specialist | gustavo |
| security-reviewer | leo-ely |
| test-writer | ameer |
| audit-consolidator | corradin |

e.g. `borisenko, audit the orders service` works the same as naming the coordinator.

---

## 3. Commands — orchestrators

Slash commands fan out to agents and consolidate. (Mode A installs them as `/audit`
and `/implement`; plugin mode namespaces them `/engineos:audit`.)

```
/audit all                  # read-only audit across all domains → status report
/audit dba src/orders       # one domain, scoped
/implement backend add idempotency keys to the payments webhook
```
`/audit` writes `docs/audits/<date>-<domain>.md` (verdict + root cause + plan).
`/implement` is spec-gated and closes with a change record.

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

Connect them per [`docs/ADOPTION.md`](docs/ADOPTION.md) §4 — env-var creds only,
read-only roles. Baseline config + `$verify` notes: `templates/mcp.template.json`.
Check what's live: the leaf returns real findings instead of `UNKNOWN`.

---

## 5. Hooks — automatic, you don't invoke them

These run on their own. Know what they do and how to respond:

| Hook | Fires | What you do |
|---|---|---|
| `route-before-change` | before each edit | nothing — read the injected `[router]` line; follow it |
| `mark-unrecorded` | after a code edit | nothing — flags that a change needs recording |
| `stop-verify` | when finishing | if it blocks: run lint + typecheck, show output. Tests join only if they were requested for this task, or `ENGINEOS_VERIFY_TESTS=1` is set |
| `record-verify` | when finishing | if it blocks: run the `record-change` skill |

Gates block **once** (never loop). A block means "do the thing, then finish."

Every hook in this table checks the bypass marker first and exits early when it is
set — see `/bypass` in §3. That is the only supported way to silence them; editing
`settings.json` to unwire a hook takes it off for good, not for one task.

**Tests are opt-in, not automatic.** EngineOS writes no tests and runs no test
suite unless you ask for them ("write tests", "add coverage", "TDD this", "run
the suite"), your project's `CLAUDE.md` requires them, a test agent
(`test-writer` / `qa-tester`) was dispatched on purpose, or you named a
release/merge gate that includes tests. Otherwise the finalization gate is
**lint + typecheck only** — see `rules/testing.md` for the full policy, and set
`ENGINEOS_VERIFY_TESTS=1` to force tests back into the Stop gate unconditionally.

---

## 6. Specs — where plans live

Multi-file changes and new features get a spec before code (a non-negotiable).
- Created by the `brainstorming` → `writing-plans` flow, or `tlc-spec-driven`.
- Stored in `docs/superpowers/specs/<date>-<topic>-design.md`.
- Read the relevant spec before implementing; it carries the approved design + the
  verification plan.

---

## 7. Rules — the standards being enforced

- **Always-on:** `rules/base.md`, `security.md`, `git.md`, `memory.md`.
- **Per-domain (routed):** `architecture.md`, `backend.md`, `frontend.md`,
  `llm-apps.md`, `testing.md`, `data.md`, `observability.md`.
- The routing hook injects the right ones per edit; you don't load them manually.
- **Project `CLAUDE.md` overrides EngineOS** where they conflict.

---

## 8. The change lifecycle (every unit of work)

```
open a record            → cp .engineos/changes/_template.md .engineos/changes/<date>-<slug>.md  (status: active)
   ↓ do the work (routing + gates active)
verify                   → lint + typecheck, output shown (tests too, only if in scope)
record-change skill      → status done, register files+movements, git mv → .engineos/archived/YYYY/MM/DD/
```
This is what the Stop gates enforce. Distil any durable decision into `.engineos/memory/`.

---

## Your first task — walkthrough

1. Ask for the change ("add pagination to the orders list endpoint").
2. Router announces backend rules + `nestjs-patterns` + `backend-coordinator`.
3. For >2 files / a new feature, brainstorming + a spec come first — go with it.
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
| Plan a feature | `tlc-spec-driven` (or just describe it — brainstorming triggers) |
| Record an architecture decision | `adr` skill |
| Security-check a diff | `security-reviewer` agent |
| Add test coverage | `test-writer` agent |
| Change a team standard | PR to the EngineOS repo (`CONTRIBUTING.md`) |
| Know why a gate blocked me | §5 — verify or record, then finish |
| Turn EngineOS off for one task | `/bypass` — and `/bypass off` when you're done |
