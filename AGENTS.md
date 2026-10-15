# EngineOS — Engineering Constitution & Router

Team-shared AI engineering environment. This file is versioned in the `engineos` repo.
Do NOT edit your local copy in place — change it via PR to the repo.
Personal preferences (output style, personal hooks, API keys) live in your own
`~/.Codex/AGENTS.md` lines and `settings.local.json`, never here.

## Always-on rules

@rules/base.md
@rules/security.md
@rules/git.md
@rules/parallelism.md
@rules/models.md
@rules/memory.md
@rules/subagents.md
@rules/verification.md
@rules/risk-autonomy.md
@rules/context.md
@rules/gates.md

## Router — classify before acting

Before any substantive task (anything that creates/modifies code, designs, or docs),
classify the intent and load the matching rules/skills below using the Read tool
(rules) and Skill tool (skills), and dispatch the agents the matched rows name.
Then announce in one line:

`[router] intent=<intent> risk=<low|medium|high> autonomy=<A0-A4> loaded=<rules/skills> agent=<agents dispatched|none>`

The `risk` and `autonomy` fields come from always-on `rules/risk-autonomy.md` and
are classified BEFORE the first write. They set which gates apply
(`rules/gates.md`) and what the work is permitted to do on its own. `agent` names
what was dispatched, or `none` — see `rules/subagents.md`.

Rules for routing:
- Multiple intents can match — load all that apply, in table order.
- **A row's load list must be closed.** If a rule file cross-references another
  (`backend.md` defers logging to `observability.md`, `data.md` defers SQL binding to
  `security.md`), every row that loads the first MUST also load the second — otherwise
  the deferred rule silently disappears. Always-on files (`base.md`, `security.md`,
  `git.md`, …) are always available; they may point only at other always-on files,
  at repo templates, or at `registries/*.json`. Non-always-on files may point at
  always-on files or at files loaded in the same row. `scripts/validate-engineos.sh`
  checks both halves of this rule — it is enforced, not just stated.
- Unknown intent → proceed with always-on rules only. Never block on routing.
- Pure questions/explanations need no routing — answer directly.
- **A row that names an agent means dispatch it**, except a complete kernel-resolved
  eligible direct execution contract under rules/parallelism.md. Otherwise doing the work
  inline when a row names an agent is a defect — see `rules/subagents.md`.
- **Security-review timing overrides immediate dispatch:** route and record the
  `security-reviewer` requirement now; queue its dispatch and automated security
  scans until final integrated consent under `rules/verification.md`. Keep security
  rules active and assign an appropriate stack worker to implementation; a
  read-only reviewer never becomes its writer.
- **Simple-task choice first:** resolve complete execution facts before creating documents. Eligible small, low-risk, reversible work asks permitted clickable **Implement directly** / **Create a lightweight spec** choices. A current scope-bound direct choice uses stack guidance plus security/Git safeguards, without mandatory prototype or PRD/ADR/tickets. Missing facts or expanded scope require re-resolution; independent security/design gates remain.
- **Test timing overrides immediate dispatch:** queue test-writer and every executable check until ALL implementation tickets and corrections are integrated, then always ask fresh final clickable consent. Earlier broad requests are not check approval.
- Rules paths are relative to this file's directory.
- Before selected-spec production implementation or resume, follow
  rules/parallelism.md **Prototype preview choice**; unanswered choice pauses
  production writes/dispatch, and selected preview needs scoped revision approval.
- After the work is delivered, offer the output artifact — see **Output artifact** below.
- The **stack/domain rows** below (backend, frontend, mobile, LLM, DBA, DevOps,
  security, test, and the mobile store-release split) are mirrored
  deterministically by the `PreToolUse` hook `hooks/route-before-change.sh`.
  The canonical path→domain map is `registries/routing.json` (`match`/
  `excluded` globs), resolved by `scripts/kernel.sh route-path`. This table is
  the human mirror of the **registry**. **They no longer drift silently:**
  `scripts/validate-engineos.sh` fails CI if the table and the registry
  disagree. All other rows are request-driven and have no hook equivalent.
- **Multi-match applies to this table only.** The hook emits exactly ONE route —
  first match wins, in this precedence chain: security → test → backend → dba →
  backend-python → ios-release → android-release → devops → mobile → frontend → llm. When you route from the table yourself, load
  every row that applies; when the hook speaks, it is giving you the single
  highest-precedence domain, not the complete set.
- **Stack rows follow the repository's stack.** An intent row carrying a `stack`
  (`backend` is node, `backend-python` is python) is rebound to its `stack_sibling`
  when the repository's resolved stack (`scripts/kernel.sh resolve-stack`) lacks
  that stack — "add an endpoint" in a FastAPI-only repo loads the FastAPI row.
  Evidence is read frameworks first (`stack_frameworks`: NestJS vs FastAPI/Django/Flask),
  then languages, and the package holding the working directory before the whole
  repository — so a FastAPI backend beside a React frontend still rebinds; only a
  repository with both backend frameworks keeps the keyword result. The kernel
  reports each swap as `rebound`.
- **A switch, never a model, picks who decides the intents.** In Claude Code the
  prompt hook reads `ENGINEOS_ROUTER` = `keyword` | `llm` | `jev` | `auto` (personal env)
  and `router.mode` in the repo's `.engineos/config.json`; the more restrictive wins, and
  unset means `registries/policy.json` `router_decision.default` (`jev`, a recorded
  developer decision a golden-set run may overwrite; the keyword answer is always logged
  beside it). Its line shows `router=<mode>[/<confidence>]` and announces every
  fallback as `[engineos] router: llm (<mode> unavailable: <reason>)` — a failure degrades
  to the router agent, never silently to the keyword floor. Here no hook
  runs, so route from the table and dispatch the `router` agent yourself before any
  write when only generic words matched or the request spans domains.
- **Hooks do not run under Codex.** The `[router] …` context, the edit-time
  route and both Stop gates are model discipline here — see
  `templates/adapters/codex.md`. In Claude Code they need node >= 18 and are
  registered in `hooks/hooks.json`.

- **Bypass short-circuits everything below.** When `/engineos:bypass` is on, the
  `UserPromptSubmit` hook injects `[engineos] BYPASS ACTIVE` on every turn. On seeing
  it: skip this table, emit no `[router]` line, dispatch no agents, skip the spec gate,
  the change record, and the output-artifact offer — and open your reply with
  `[engineos] bypassed` so the user knows the guardrails are down. The rule files stay
  in context (nothing can unload a `AGENTS.md` import); treat them as not applicable.
  The per-repo marker expires at the next SessionStart; the machine-wide flag
  (`~/.Codex/engineos.bypass`) and `ENGINEOS_BYPASS=1` do not — they hold until
  toggled off.

| Intent (signals) | Load |
|---|---|
| New feature / multi-file change ("add", "build", "create", "implement") — new behavior with no more-specific row below; a more specific matching row suppresses this one | `/engineos:new-feature` — resolve the kernel planning lane first; eligible simple tasks ask clickable direct/spec choices before artifacts. Direct uses stack rules and security/Git safeguards; selected specs use native `engineos-spec` with Matt Pocock `to-tickets` and a consolidated dependency graph. Non-simple feature design produces PRD + ADR + SPEC + TASKS; `engineos-implement-spec` consumes every independent ready ticket. Preserve artifact paths and design review gates. External Matt Pocock/tlc-spec-lean skills are optional upstream references. Apply rules/parallelism.md task-budget guidance, then routed stack rules. A small single-file non-feature change resolves the execution lane and may use direct execution only when the complete kernel contract permits it |
| Big / multi-domain / sweep work (>3 files, >1 domain, ≥3 independent tasks, "across all X", migration, backfill) | Apply `rules/parallelism.md` + `rules/models.md` (always-on); fan out — `/engineos:implement <domain> <task>` for changes, `/engineos:audit` for analysis, or N Task calls in ONE message over disjoint scopes. Skills: `superpowers:dispatching-parallel-agents`, `superpowers:subagent-driven-development`; `/engineos:implement` dispatch is spec-gated |
| Bug / unexpected behavior ("broken", "fails", error pasted, "why does X happen") | `superpowers:systematic-debugging` |
| Backend work (NestJS, API, service, controller, migration, queue) | `rules/architecture.md` + `rules/backend.md` + `rules/testing.md` + `rules/observability.md`; skill `nestjs-patterns`; nestjs MCP for codegen; agent `backend-coordinator` |
| Backend work (FastAPI, router, endpoint, Pydantic, SQLAlchemy, Alembic) | `rules/architecture.md` + `rules/backend-python.md` + `rules/backend.md` + `rules/data.md` + `rules/testing.md` + `rules/observability.md`; skill `python-patterns`; agent `backend-coordinator` |
| Frontend work (React, Next, component, page/app, UI, styling) | `rules/architecture.md` + `rules/frontend.md` + `rules/testing.md`; skill `react-patterns`; agent `frontend-coordinator` |
| Mobile work / mirror web to mobile (React Native, screen, navigation, native module, iOS/Android app; "mirror to mobile", "port to mobile", "mobile parity") | `rules/architecture.md` + `rules/frontend.md` + `rules/backend.md` (API-consumption parts) + `rules/observability.md` + `rules/testing.md`, adapted the mobile way; agent `mobile-coordinator` (elias) |
| Mobile store release ("build ios", "publish to App Store", "TestFlight", "build android", "Play Store", "release the app", ipa/aab, store submission) | `rules/security.md` (signing keys/store credentials); agent `ios-builder` for Apple, `android-builder` for Google Play. Store review submission / production rollout only on explicit instruction |
| LLM/agent work (prompt, agent, RAG, embedding, eval, tool schema, LangGraph, LangChain) | `rules/llm-apps.md`; skill `llm-engineering`; agent `llm-coordinator` |
| Multi-agent system design (multi-agent, orchestration, supervisor agent, agent topology, LangGraph, A2A, handoff between agents) | `/engineos:design-agents` + `rules/llm-apps.md`; skill `agent-system-design`; agent `llm-coordinator` (hermsdorff) in INTERVIEW mode (`patterns/3-Agent-topology-interview.md`), interactive, one step at a time; developer approval (hitl reason `topology-approval`) recorded in the change record before any graph code |
| DBA / data layer (`*.sql`, migrations, schema, query perf, indexing) | `rules/architecture.md` + `rules/data.md`; agent `dba-coordinator` (writes migrations/queries, holds NO database MCP). Live schema/plan introspection is the read-only `postgres-specialist` / `oracle-specialist` leaves |
| DevOps / infra (CI/CD, Docker, k8s/Helm, Terraform, `.github/workflows/`, cloud) | `rules/architecture.md` + `rules/observability.md`; agent `devops-coordinator` (writes config, holds NO cloud MCP). Live cluster/cloud/CI introspection is the read-only `kubernetes-specialist` / `gcp-specialist` / `cicd-specialist` leaves |
| Editing security-sensitive files (auth, guard, middleware, secret, `.env`, credentials) | `rules/security.md`; dispatch `security-reviewer` |
| System comprehension / onboarding docs ("document the system", "architecture docs", "docs for new devs", "understand the codebase") | `/analyze-architecture` + `rules/memory.md`; agent `architecture-analyst` (analyst) runs `patterns/1-Analysis.md` |
| Fill doc gaps by interview ("interview me about the system", "ask me about how X works", resolve open hypotheses) | `/talk-about-the-system` + `rules/memory.md`; `architecture-analyst` in INTERVIEW mode (`patterns/2-Interview-brainstorm.md`), interactive, folds answers back into `docs/` |
| End-to-end API QA ("test all endpoints", "run the API test suite", "QA the system", Postman/Newman run) | agent `qa-tester` (qa) — non-interactive, skips MFA/email steps |
| Multi-domain audit / system health check ("audit", "analyze the system", "what's broken across X") | `/engineos:audit <domain\|all>` — fans out to coordinators + MCP leaf specialists, consolidates into a status report |
| Refactor / cleanup ("refactor", "clean up", "simplify", "tech debt") | `rules/architecture.md`; finish with a simplify pass |
| Architecture decision ("should we use X or Y", "how should we structure") | skill `adr` + `rules/memory.md` — decision gets recorded, not just chatted |
| Release notes ("write release notes", "document version X.Y.Z", "what changed in this release", version bump) | skill `release-notes` |
| Business / career strategy — market opportunity ("where is this market going", "before competitors"), skill learning path ("what do I learn, in what order"), blocked non-technical decision ("X or Y and I can't decide"), positioning & perceived authority, monetizing existing assets | skill `strategy` — five modes over one grounding discipline: every claim traced to a dated web source or a file in this repo, output persisted to `docs/strategy/`. Technical "X vs Y" stays with `adr`; `strategy` handles business/career/positioning decisions |
| Review / pre-merge ("review", "is this safe", PR URL) | skill `code-review` (external — provided by the Codex environment, not this repo); if diff touches auth/input/data/LLM, also dispatch `security-reviewer` subagent (Agent tool) |
| Test writing — explicit request only ("write tests", "add coverage", "integration tests", "E2E", "TDD this", "run the suite", regression test for a fix) | Read `rules/testing.md`; dispatch `test-writer` subagent for well-scoped targets. This row IS the opt-in path — tests get written/run here, on request, never implicitly by other rows |
| Eval setup ("set up evals", "golden set", new LLM feature lacking evals) | Read `rules/llm-apps.md`; skill `eval-harness` |
| Independent verification of high-risk work ("is this actually right", pre-release check on risk=high, release gate needs an independent pass) | `critic` agent (alias `rogerio`) — adversarial correctness review, read-only, tries to refute the claim that the work is done. Required by `rules/gates.md` at risk=high; `security-reviewer` still owns the security lens |
| Handoff between agents, waves or sessions ("hand this off", wave barrier reached, session ending mid-task) | `templates/handoff.md` — objective, state (gate, risk), done, decisions, files, evidence, known failures and open risks, not done, next step, resume. Never hand off with "continue where you left off" |
| Continuous improvement ("run a retro", "what should we improve", same correction recurring, monthly cadence) | skill `retro` — mines `.engineos/archived/`, `.engineos/skill-observations/log.md`, eval failures and integrity failures for patterns with 3+ occurrences, proposes rule/skill/registry deltas as a PR. Proposes only; a human merges |
| Skill/rule friction observed mid-task ("log an observation", "watch for skill opportunities", "observation log", a loaded rule got violated, a correction reveals a missing rule, a skill section proves dead weight) | skill `task-observer` — appends to `.engineos/skill-observations/log.md`; capture only, `retro` consumes OPEN entries. Log at the moment of friction, don't wait for the retro |
| Work complete / close the change record ("record the change", "log this change", Stop gate reports unrecorded changes) | skill `record-change` |
| Ambiguous or multi-agent request needing a dispatch plan ("route this", "who should do this", "which agents", request spans several domains with no obvious owner) | `/engineos:route` — `router` agent runs one `scripts/kernel.sh resolve` call FIRST, then reasons only about the residue: intent tiebreaks, scope decomposition, wave grouping. Returns a dispatch plan (intents, rules, agents with disjoint file scopes, model per agent, risk, gates, waves); it never dispatches and never edits. When the kernel resolves the route on its own, no agent is dispatched at all |
| Claiming done / complete / fixed; spec archived / feature shipped ("archiving", "spec done", "moving to archive", spec moved to `.engineos/archived/` or the project's spec archive) | `superpowers:verification-before-completion` — evidence before assertion, always. For spec-archive / ship cases: the final gate (`rules/verification.md`) plus build + API/Web startup check, output shown; a bounded fix loop — 2 fix attempts per check, one model-tier escalation, then stop and report red (`registries/policy.json` `repair`; `scripts/kernel.sh repair` answers each attempt). Exhausting the bound reports red honestly — it never reports done. Automatic `stop-verify.sh` executes no checks; approved final manual validation supplies evidence. `record-verify.sh` still reports an unrecorded change record |

## Output artifact — offer after every request

After task delivery, separately follow rules/parallelism.md **Completion follow-up**
for optional Matt Pocock session `/retro`; execute only on opt-in and preserve
same-task answers on resume. This does not replace the artifact offer below.

Once the request has been answered or the work delivered (after
`superpowers:verification-before-completion` where it applies), ask in one question which
output artifact to produce next:

| Option | Offer when |
|---|---|
| Scaffold the implementation | the request has an implementable shape (code, config, infra) |
| Create a reusable template | **frontend / mobile intents only** |
| Create a UI/UX design | **frontend / mobile intents only** |
| Generate a flowchart of the proposed change or creation | there is a flow, sequence, or decision path worth drawing |
| Proceed without generating any additional artifact | always — list it last |

Rules:
- **Prune what doesn't apply.** Options are filtered per task; offering a dead option is a defect.
- **Never** offer template or UI/UX design for backend, DBA, DevOps, LLM, security, test,
  or docs work — those are frontend/mobile artifacts.
- Ask **once per request, after the work** — never as a substitute for doing it, never before.
- The user's pick becomes the next unit of work: classify it through the router table again.
- **No recursion.** An artifact produced from a prior offer does not itself trigger a new offer.
- **No offer on pure questions/explanations** — mirrors the routing exemption.
- **Multi-intent tiebreak:** template and UI/UX design are offered if ANY matched intent is
  frontend or mobile.
- **Scaffold** is offered only when the implementation was not already delivered as the work itself.

## Non-negotiables (apply regardless of routing)

Each item names the file that owns it. That file is the single source of truth —
read it there, not here.

1. **Spec before code** — any change touching >2 files or any new feature outside the complete kernel-resolved simple-task direct exception. Eligible simple tasks ask the clickable spec choice before creating artifacts; a direct choice needs no spec. A selected lightweight spec uses bounded tickets; a non-simple from-scratch feature carries PRD, ADR, SPEC and TASKS from `/engineos:new-feature`.
2. **The final gate before "done"** — `rules/verification.md`. Automatic Stop executes no package checks. Final manual checks require explicit
   fresh final clickable current-task approval after ALL implementation tickets and corrections integrate; earlier broad requests are insufficient. Existing JS/TS scripts are resolved
   under rules/verification.md. Deprecated Python declarations are compatibility only. This is
   the Validation gate of `rules/gates.md`, never the Release gate.
3. **No secrets** in code, config, or commits. Ever — `rules/security.md`.
4. **Project conventions win** over these rules when they conflict:
   project `AGENTS.md` > EngineOS > defaults.
5. **Standard project layout** — every project carries `.engineos/{changes,archived,memory}`
   + `docs/{specs,prds,rules}`; the SessionStart hook scaffolds anything missing —
   opt-in: it runs only when the project already carries `.engineos/` or
   `ENGINEOS_SCAFFOLD=1` is set, so unrelated clones are never dirtied (non-blocking).
   Every change gets a change record: it links its spec when #1 required one, and
   carries a checklist + a "what was made" account before it is archived. #1's
   threshold is the only spec threshold.
6. **Model tier per work type** — `rules/models.md`.
7. **Decompose and distribute** — `rules/parallelism.md`.
8. **Consume the resolved execution lane and announce it** — rules/subagents.md. A complete eligible `direct` contract permits main-executor work; otherwise dispatch the named routed worker. Missing facts never grant direct execution.
   This file is the standing user request for sub-agent use; a harness that waits
   to be asked has been asked here.
9. **Offer the output artifact** after every request — **Output artifact** above.
10. **Classify risk before the first write** — always-on `rules/risk-autonomy.md`, and
    never exceed the autonomy ceiling for that tier. The tier drives which gates apply
    (`rules/gates.md`) and which requirements fire (`registries/decision-rules.json`).
11. **Public surface changes follow `docs/COMPATIBILITY.md`** — rule paths, agent names,
    aliases, command names, skill directories, hook contracts and the return envelope
    are versioned surface. A rename is a deprecation with a window, never a silent `git mv`.
12. **Git writes follow the developer's `ENGINEOS_GIT_WRITES` setting** (`ask`, the
    default, or `auto`) — `rules/git.md`. Under `ask`, every git or forge command that
    writes becomes a permission prompt; an approval covers one action, never a session.
13. **Stack first on a greenfield repo** — ask the developer which stack to use, never pick one — `rules/base.md` "New projects — stack first".

## Codebase Overview

EngineOS is a prose constitution (`rules/`, `agents/`, `skills/`, `commands/`) projected
into `registries/*.json`, executed by a deterministic TypeScript kernel and the Claude
Code hooks registered in `hooks/hooks.json`, bundled into `dist/engineos.cjs`, and kept
coherent by a 68-check validator.

**Stack**: TypeScript (esbuild to one committed CJS bundle, node >= 18), JSON registries,
bash shims, Node built-in test runner; `console/` is a separate Next.js admin app.
**Structure**: prose layer -> `registries/` -> `src/{kernel,hooks,journal,checks,gen}` ->
`dist/engineos.cjs`; per-project state in `.engineos/` and `.git/engineos-telemetry/`.

For detailed architecture, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).
