# EngineOS — Engineering Constitution & Router

Team-shared constitution, versioned in EngineOS. Change its repository source via
PR, never installed copies. Personal style/hooks/keys belong in
`~/.claude/CLAUDE.md` and `settings.local.json`.

## Always-on rules

@rules/base.md
@rules/security.md
@rules/git.md
@rules/context.md

## Router — classify before acting

One top-level supervisor routes every project code/config/design/docs change,
including mechanical edits and follow-ups, BEFORE dispatch or writes. Classify
intent/paths, load matching rules/skills with Read/Skill and dispatch named agents.
Announce:

`[router] intent=<intent> risk=<low|medium|high> autonomy=<A0-A4> loaded=<rules/skills> agent=<agents dispatched|none>`

Use the prompt advisor's deterministic task contract (intents, policy loads, risk
floor, autonomy ceiling, agents, skills, gates). Load its rules and classify final
risk/autonomy BEFORE writing. Supervisor resolves residue; read-only `router`
plans unresolved cases. `/engineos:route` remains plan-only.

Apply `rules/subagents.md` and `rules/parallelism.md`: flat scoped workers for
every implementation unit; fill useful policy/host capacity and refill slots.
One indivisible unit needs one worker; pure explanations need none. Brief workers
with roles, rules/skills/patterns, exclusive paths, frozen contracts, dependencies,
risk/autonomy, branch/PR and return expectations. Reroute scope changes, preserve
current branch/PR and final approval-only tests. Routing adds no approval gate to
authorized work.

Rules for routing:
- Multiple intents can match — load all that apply, in table order.
- **A row's load list must be closed.** If a rule file cross-references another
  (`backend.md` defers logging to `observability.md`, `data.md` defers SQL binding to
  `security.md`), every row that loads the first MUST also load the second — otherwise
  the deferred rule silently disappears. Always-on files (`base.md`, `security.md`,
  `git.md`, `context.md`) are always available; they may point only at other always-on files,
  at repo templates, or at `registries/*.json`. Non-always-on files may point at
  always-on files or at files loaded in the same row. `scripts/validate-engineos.sh`
  checks both halves of this rule — it is enforced, not just stated.
- Unknown intent → proceed with always-on rules only. Never block on routing.
- Pure questions/explanations need no routing — answer directly.
- **A row that names an agent means dispatch it**, not "mention it". Doing the work
  inline when a row names an agent is a defect — see `rules/subagents.md`.
- Rules paths are relative to this file's directory.
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
- **A switch, never a model, picks who decides the intents.** `ENGINEOS_ROUTER` =
  `keyword` | `llm` | `jev` | `auto` (personal env) and `router.mode` in the repo's
  `.engineos/config.json` cap it; the more restrictive wins. Unset, `registries/policy.json`
  `router_decision.default` applies — `jev` today, a recorded developer decision that a
  golden-set run may overwrite; the keyword answer is always logged beside it (shadow). The contract line shows `router=<mode>[/<confidence>]`; a fallback is always
  announced as `[engineos] router: llm (<mode> unavailable: <reason>)` — a failure degrades
  to the in-session router agent, never silently to the keyword floor, which decides
  alone only when a setting names it. When the line says the router could not decide,
  dispatch the `router` agent before any write.
- **The hooks need node >= 18.** Every `hooks/*.sh` is a shim over
  `dist/engineos.cjs`; `jq` is no longer a hook dependency. Under a missing or
  too-old node, `route-before-change.sh`, `mark-unrecorded.sh`,
  `record-verify.sh` and `prompt-advisor.sh` exit 0 silently — routing guidance
  and the change-record Stop gate simply do not fire — while the other hooks
  emit a `[engineos] <hook> skipped: node >= 18 required` system message. If you
  are not seeing `[router] …` context on edits, check which `node` the hook PATH
  resolves to before assuming the routing is wrong.

- **Bypass short-circuits everything below.** When `/engineos:bypass` is on, the
  `UserPromptSubmit` hook injects `[engineos] BYPASS ACTIVE` on every turn. On seeing
  it: skip this table, emit no `[router]` line, dispatch no agents, skip the spec gate,
  the change record, and the output-artifact offer — and open your reply with
  `[engineos] bypassed` so the user knows the guardrails are down. The rule files stay
  in context (nothing can unload a `CLAUDE.md` import); treat them as not applicable.
  The per-repo marker expires at the next SessionStart; the machine-wide flag
  (`~/.claude/engineos.bypass`) and `ENGINEOS_BYPASS=1` do not — they hold until
  toggled off.

| Intent (signals) | Load |
|---|---|
| New feature / multi-file change ("add", "build", "create", "implement") — new behavior with no more-specific row below; a more specific matching row suppresses this one | `/engineos:new-feature` — PRD + ADR + SPEC + TASKS before code: Matt Pocock skills `grill-with-docs` (ADRs → `docs/adr/`, glossary `CONTEXT.md`) → `to-spec` (PRD → `docs/prds/`) → skill `tlc-spec-lean` plan and acceptance criteria, then implementation (SPEC → `.specs/features/<feature>/`, indexed from `docs/specs/`) → `to-tickets` (TASKS → `docs/specs/<feature>/tickets/`, each naming the acceptance criteria it closes) → parallel build and integration → final non-test validation → test authoring/execution only with explicit current-task user approval; then stack rules below. Applies at non-negotiable #1's threshold — a small single-file tweak skips straight to the stack rules. Once tasks exist, apply `rules/parallelism.md`: independent tasks dispatch concurrently within min(policy cap, available host slots), refilling completed slots as dependencies become ready |
| Big / multi-domain / sweep work (>3 files, >1 domain, ≥3 independent tasks, "across all X", migration, backfill) | Apply `rules/parallelism.md` + `rules/models.md` from the task contract; fan out — `/engineos:implement <domain> <task>` for changes, `/engineos:audit` for analysis, or N Task calls in ONE message over disjoint scopes. Skills: `superpowers:dispatching-parallel-agents`, `superpowers:subagent-driven-development`; `/engineos:implement` dispatch is spec-gated |
| Bug / unexpected behavior ("broken", "fails", error pasted, "why does X happen") | `superpowers:systematic-debugging` |
| Backend work (NestJS, Express, Node backend, Node.js backend, plain Node, pure Node, API, service, controller, migration, queue, router, endpoint) | `rules/architecture.md` + `rules/backend.md` + `rules/testing.md` + `rules/observability.md`; skill `nestjs-patterns`; nestjs MCP for codegen; agent `backend-coordinator` |
| Backend work (FastAPI, router, endpoint, Pydantic, SQLAlchemy, Alembic) | `rules/architecture.md` + `rules/backend-python.md` + `rules/data.md` + `rules/testing.md` + `rules/observability.md`; skill `python-patterns`; agent `backend-coordinator` |
| Frontend work (React, Next, component, page/app, UI, styling) | `rules/architecture.md` + `rules/frontend.md` + `rules/testing.md`; skill `react-patterns`; agent `frontend-coordinator` |
| Mobile work / mirror web to mobile (React Native, screen, navigation, native module, iOS/Android app; "mirror to mobile", "port to mobile", "mobile parity") | `rules/architecture.md` + `rules/frontend.md` + `rules/backend.md` (API-consumption parts) + `rules/observability.md` + `rules/testing.md`, adapted the mobile way; agent `mobile-coordinator` (elias) |
| Mobile store release ("build ios", "publish to App Store", "TestFlight", "build android", "Play Store", "release the app", ipa/aab, store submission) | `rules/security.md` (signing keys/store credentials); agent `ios-builder` for Apple, `android-builder` for Google Play. Store review submission / production rollout only on explicit instruction |
| LLM/agent/chatbot work (Mastra, chatbot, chat bot, conversational AI, prompt, agent, RAG, embedding, eval, tool schema; LangGraph/LangChain migration) | `rules/llm-apps.md`; skills `llm-engineering` + `mastra-patterns`; agent `llm-coordinator`; Mastra orchestration in NestJS providers |
| Multi-agent system design (multi-agent, orchestration, supervisor agent, agent topology, legacy LangGraph migration, A2A, handoff between agents) | `/engineos:design-agents` + `rules/llm-apps.md`; skill `agent-system-design`; agent `llm-coordinator` (hermsdorff) in INTERVIEW mode (`patterns/3-Agent-topology-interview.md`), interactive, one step at a time; developer approval (hitl reason `topology-approval`) recorded before multi-agent Mastra workflow code; Mastra/chatbot alone does not require topology approval |
| DBA / data layer (`*.sql`, migrations, schema, query perf, indexing) | `rules/architecture.md` + `rules/data.md`; agent `dba-coordinator` (writes migrations/queries, holds NO database MCP). Live schema/plan introspection is the read-only `postgres-specialist` / `oracle-specialist` leaves |
| DevOps / infra (CI/CD, Docker, k8s/Helm, Terraform, `.github/workflows/`, cloud) | `rules/architecture.md` + `rules/observability.md`; agent `devops-coordinator` (writes config, holds NO cloud MCP). Live cluster/cloud/CI introspection is the read-only `kubernetes-specialist` / `gcp-specialist` / `cicd-specialist` leaves |
| Editing security-sensitive files (auth, guard, middleware, secret, `.env`, credentials) | `rules/security.md`; dispatch `security-reviewer` |
| System comprehension / onboarding docs ("document the system", "architecture docs", "docs for new devs", "understand the codebase") | `/analyze-architecture` + `rules/memory.md`; agent `architecture-analyst` (analyst) runs `patterns/1-Analysis.md` |
| Fill doc gaps by interview ("interview me about the system", "ask me about how X works", resolve open hypotheses) | `/talk-about-the-system` + `rules/memory.md`; `architecture-analyst` in INTERVIEW mode (`patterns/2-Interview-brainstorm.md`), interactive, folds answers back into `docs/` |
| End-to-end API QA after implementation/integration and explicit current-task approval ("test all endpoints", "run the API test suite", "QA the system", Postman/Newman run) | agent `qa-tester` (qa) — only after explicit approval for final test work; non-interactive execution skips MFA/email steps |
| Multi-domain audit / system health check ("audit", "analyze the system", "what's broken across X") | `/engineos:audit <domain\|all>` — fans out to coordinators + MCP leaf specialists, consolidates into a status report |
| Refactor / cleanup ("refactor", "clean up", "simplify", "tech debt") | `rules/architecture.md`; finish with a simplify pass |
| Architecture decision ("should we use X or Y", "how should we structure") | skill `adr` + `rules/memory.md` — decision gets recorded, not just chatted |
| Release notes ("write release notes", "document version X.Y.Z", "what changed in this release", version bump) | skill `release-notes` |
| Business / career strategy — market opportunity ("where is this market going", "before competitors"), skill learning path ("what do I learn, in what order"), blocked non-technical decision ("X or Y and I can't decide"), positioning & perceived authority, monetizing existing assets | skill `strategy` — five modes over one grounding discipline: every claim traced to a dated web source or a file in this repo, output persisted to `docs/strategy/`. Technical "X vs Y" stays with `adr`; `strategy` handles business/career/positioning decisions |
| Review / pre-merge ("review", "is this safe", PR URL) | skill `code-review` (external — provided by the Claude Code environment, not this repo); if diff touches auth/input/data/LLM, also dispatch `security-reviewer` subagent (Agent tool) |
| Test writing — explicit request only ("write tests", "add coverage", "integration tests", "E2E", "TDD this", "run the suite", regression test for a fix) | Read `rules/testing.md`; dispatch `test-writer` subagent for well-scoped targets. This row identifies test ownership; write/run only at the end, after implementation/integration and explicit current-task user approval. TDD sequencing does not override the final-phase policy |
| Eval setup in the explicitly approved final test phase ("set up evals", "golden set", new LLM feature lacking evals) | Read `rules/llm-apps.md`; skill `eval-harness` |
| Independent verification of high-risk work ("is this actually right", pre-release check on risk=high, release gate needs an independent pass) | `critic` agent (alias `vera`) — adversarial correctness review, read-only, tries to refute the claim that the work is done. Required by `rules/gates.md` at risk=high; `security-reviewer` still owns the security lens |
| Handoff between agents, waves or sessions ("hand this off", wave barrier reached, session ending mid-task) | `templates/handoff.md` — objective, state (gate, risk), done, decisions, files, evidence, known failures and open risks, not done, next step, resume. Never hand off with "continue where you left off" |
| Continuous improvement ("run a retro", "what should we improve", same correction recurring, monthly cadence) | skill `retro` — mines `.engineos/archived/`, `.engineos/skill-observations/log.md`, eval failures and integrity failures for patterns with 3+ occurrences, proposes rule/skill/registry deltas as a PR. Proposes only; a human merges |
| Skill/rule friction observed mid-task ("log an observation", "watch for skill opportunities", "observation log", a loaded rule got violated, a correction reveals a missing rule, a skill section proves dead weight) | skill `task-observer` — appends to `.engineos/skill-observations/log.md`; capture only, `retro` consumes OPEN entries. Log at the moment of friction, don't wait for the retro |
| Work complete / close the change record ("record the change", "log this change", Stop gate reports unrecorded changes) | skill `record-change` |
| Ambiguous or multi-agent request needing a dispatch plan ("route this", "who should do this", "which agents", request spans several domains with no obvious owner) | `/engineos:route` — `router` agent runs one `scripts/kernel.sh resolve` call FIRST, then reasons only about the residue: intent tiebreaks, scope decomposition, wave grouping. Returns a dispatch plan (intents, rules, agents with disjoint file scopes, model per agent, risk, gates, waves); it never dispatches and never edits. When the kernel resolves the route on its own, no router planner agent is needed; the supervisor still dispatches workers for implementation. An explicit route-only request returns the plan without dispatching implementation |
| Claiming done / complete / fixed; spec archived / feature shipped ("archiving", "spec done", "moving to archive", spec moved to `.engineos/archived/` or the project's spec archive) | `superpowers:verification-before-completion` — evidence before assertion, always. For spec-archive / ship cases: the final gate (`rules/verification.md`) plus build + API/Web startup check, output shown; a bounded fix loop — 2 fix attempts per check, one model-tier escalation, then stop and report red (`registries/policy.json` `repair`; `scripts/kernel.sh repair` answers each attempt). Exhausting the bound reports red honestly — it never reports done. The `Stop` hooks (`stop-verify.sh` + `record-verify.sh`) are the automated half; they gate on scoped lint/typecheck and an unrecorded change record; separately approved final tests run after integration |

## Output artifact — offer after every request

After delivery (and applicable `superpowers:verification-before-completion`),
ask one question choosing an applicable next artifact:

| Option | Offer when |
|---|---|
| Scaffold the implementation | the request has an implementable shape (code, config, infra) |
| Create a reusable template | **frontend / mobile intents only** |
| Create a UI/UX design | **frontend / mobile intents only** |
| Generate a flowchart of the proposed change or creation | there is a flow, sequence, or decision path worth drawing |
| Proceed without generating any additional artifact | always — list it last |

Rules:
- Prune inapplicable options. Templates/designs only for frontend/mobile (including
  any matching intent); scaffold only if implementation was not already delivered.
- Ask once AFTER work, never instead of doing it; no offers for pure explanations.
- Route the chosen next task. No recursive offer for an artifact from a prior offer.

## Non-negotiables (apply regardless of routing)

Each item names the file that owns it. That file is the single source of truth —
read it there, not here.

1. **Spec before code** — any change touching >2 files or any new feature. A from-scratch feature carries four artifacts before code — PRD, ADR, SPEC, TASKS — produced by `/engineos:new-feature`.
2. **The final gate before "done"** — `rules/verification.md`. The automated Stop-gate
   half covers JS/TS packages (npm/pnpm/yarn/Nx scripts). Active development is JavaScript/TypeScript only; application backends use NestJS, frontends Next.js/React, mobile React Native, and Node.js supplies runtime/tooling. Tests require explicit approval after integration. This is
   the Validation gate of `rules/gates.md`, never the Release gate.
3. **No secrets** in code, config, or commits. Ever — `rules/security.md`.
4. **Project conventions win** over these rules when they conflict:
   project `CLAUDE.md` > EngineOS > defaults.
5. **Standard project layout** — every project carries `.engineos/{changes,archived,memory}`
   + `docs/{specs,prds,rules}`; the SessionStart hook scaffolds anything missing —
   opt-in: it runs only when the project already carries `.engineos/` or
   `ENGINEOS_SCAFFOLD=1` is set, so unrelated clones are never dirtied (non-blocking).
   Every change gets a change record: it links its spec when #1 required one, and
   carries a checklist + a "what was made" account before it is archived. #1's
   threshold is the only spec threshold.
6. **Model tier per work type** — `rules/models.md`.
7. **Decompose and distribute** — `rules/parallelism.md`.
8. **Dispatch the agent the router names, and announce it** — `rules/subagents.md`.
   This file is the standing user request for sub-agent use; a harness that waits
   to be asked has been asked here.
9. **Offer the output artifact** after every request — **Output artifact** above.
10. **Classify risk before the first write** — load `rules/risk-autonomy.md` from the
    prompt advisor's task contract, and
    never exceed the autonomy ceiling for that tier. The tier drives which gates apply
    (`rules/gates.md`) and which requirements fire (`registries/decision-rules.json`).
11. **Public surface changes follow `docs/COMPATIBILITY.md`** — rule paths, agent names,
    aliases, command names, skill directories, hook contracts and the return envelope
    are versioned surface. A rename is a deprecation with a window, never a silent `git mv`.
12. **Git writes follow the developer's `ENGINEOS_GIT_WRITES` setting** (`ask`, the
    default, or `auto`) — `rules/git.md`. Under `ask`, every git or forge command that
    writes becomes a permission prompt; an approval covers one action, never a session.
13. **Stack first on a greenfield repo** — record NestJS for application backends and ask only for unresolved tiers/deployment constraints — `rules/base.md` "New projects — stack first".

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
