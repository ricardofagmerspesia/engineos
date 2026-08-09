# EngineOS — Engineering Constitution & Router

Team-shared AI engineering environment. This file is versioned in the `engineos` repo.
Do NOT edit your local copy in place — change it via PR to the repo.
Personal preferences (output style, personal hooks, API keys) live in your own
`~/.claude/CLAUDE.md` lines and `settings.local.json`, never here.

## Always-on rules

@rules/base.md
@rules/security.md
@rules/git.md
@rules/memory.md
@rules/parallelism.md
@rules/models.md
@rules/subagents.md

## Router — classify before acting

Before any substantive task (anything that creates/modifies code, designs, or docs),
classify the intent and load the matching rules/skills listed below using the Read tool
(rules) and Skill tool (skills), and dispatch the agents the matched rows name.
Then announce in one line what was loaded:

`[router] intent=<intent> loaded=<rules/skills> agent=<agents dispatched|none>`

Rules for routing:
- Multiple intents can match — load all that apply, in table order.
- **A row's load list must be closed.** If a rule file cross-references another
  (`backend.md` defers logging to `observability.md`, `data.md` defers SQL binding to
  `security.md`), every row that loads the first MUST also load the second — otherwise
  the deferred rule silently disappears. Always-on files (`base.md`, `security.md`,
  `git.md`, …) are always available and never point outward; only non-always-on files
  point, and only at always-on files or at files loaded in the same row.
- Unknown intent → proceed with always-on rules only. Never block on routing.
- **Bypass short-circuits everything below.** When `/engineos:bypass` is on, the
  `UserPromptSubmit` hook injects `[engineos] BYPASS ACTIVE` on every turn. On seeing
  it: skip this table, emit no `[router]` line, dispatch no agents, skip the spec gate,
  the change record, and the output-artifact offer — and open your reply with
  `[engineos] bypassed` so the user knows the guardrails are down. The rule files stay
  in context (nothing can unload a `CLAUDE.md` import); treat them as not applicable.
  The bypass expires at the next SessionStart.
- **A row that names an agent means dispatch it**, not "mention it". Doing the
  work inline when a row names `agent:<x>` is a defect — see `rules/subagents.md`
  for dispatch and for the green, line-broken announcement format every agent gets.
- Pure questions/explanations need no routing — answer directly.
- Rules paths are relative to this file's directory.
- After the work is delivered, offer the output artifact — see **Output artifact** below.
- The **stack/domain rows** below (backend, frontend, mobile, LLM, DBA, DevOps,
  security, test) are mirrored deterministically by the `PreToolUse` hook
  `hooks/route-before-change.sh`. Its canonical path→domain map is
  `hooks/routing-map.sh` — that file is authoritative for file-pattern routing;
  this table is the human mirror, keep them in sync. All other rows are
  request-driven and have no hook equivalent.
- **Multi-match applies to this table only.** The hook emits exactly ONE route
  (first match wins, security checked first, mobile before frontend). When you
  route from the table yourself, load every row that applies; when the hook speaks,
  it is giving you the single highest-precedence domain, not the complete set.
- **The hooks need `jq`.** Without it, `route-before-change.sh`,
  `mark-unrecorded.sh`, `record-verify.sh`, and `task-scale-advisor.sh` exit 0
  silently — routing guidance and the change-record Stop gate simply do not fire.
  If you are not seeing `[router] …` context on edits, check `jq` before assuming
  the routing is wrong.

| Intent (signals) | Load |
|---|---|
| New feature / multi-file change ("add", "build", "create", "implement") | `superpowers:brainstorming` first, then `superpowers:writing-plans` for spec/design/tasks, then stack rules below. Once tasks exist, apply `rules/parallelism.md`: independent tasks get dispatched as parallel agents, not done one by one |
| Big / multi-domain / sweep work (>3 files, >1 domain, ≥3 independent tasks, "across all X", migration, backfill) | Read `rules/parallelism.md` + `rules/models.md`; fan out — `/engineos:implement <domain> <task>` for changes, `/engineos:audit` for analysis, or N Task calls in ONE message over disjoint scopes. Skills: `superpowers:dispatching-parallel-agents`, `superpowers:subagent-driven-development` |
| Bug / unexpected behavior ("broken", "fails", error pasted, "why does X happen") | `superpowers:systematic-debugging` |
| Backend work (NestJS, API, service, controller, migration, queue) | Read `rules/architecture.md` + `rules/backend.md` + `rules/testing.md` + `rules/observability.md`; skill `nestjs-patterns`; nestjs MCP for codegen; `backend-coordinator` agent for scoped analysis/changes |
| Frontend work (React, Next, component, page/app, UI, styling) | Read `rules/architecture.md` + `rules/frontend.md` + `rules/testing.md`; skill `react-patterns`; `frontend-coordinator` agent |
| Mobile work / mirror web to mobile (React Native, screen, navigation, native module, iOS/Android app; "mirror to mobile", "port to mobile", "same feature on mobile", "mobile parity") | Read `rules/architecture.md` + `rules/frontend.md` (component/state patterns) + `rules/backend.md` (API-consumption parts) + `rules/testing.md`, adapted mobile way; `mobile-coordinator` agent (alias `elias`) — web->mobile feature mirror: reads the web frontend as read-only source of truth and writes only in the mobile tree, never API/backend, web frontend, or DevOps |
| Mobile store release ("build ios", "publish to App Store", "TestFlight", "build android", "Play Store", "release the app", ipa/aab, store submission) | Read `rules/security.md` (signing keys/store credentials); `ios-builder` agent for Apple, `android-builder` agent for Google Play — full pipeline: preflight, version bump, quality gates, signed build, track/TestFlight upload; store review submission / production rollout only on explicit instruction |
| LLM/agent work (prompt, agent, RAG, embedding, eval, tool schema) | Read `rules/llm-apps.md`; skill `llm-engineering`; `llm-coordinator` agent |
| DBA / data layer (`*.sql`, migrations, schema, query perf, indexing) | Read `rules/architecture.md` + `rules/data.md`; `dba-coordinator` agent (writes migrations/queries; holds NO database MCP). Live schema/plan introspection is the read-only `postgres-specialist` / `oracle-specialist` leaves |
| DevOps / infra (CI/CD, Docker, k8s/Helm, Terraform, `.github/workflows/`, cloud) | Read `rules/architecture.md` + `rules/observability.md`; `devops-coordinator` agent (writes config; holds NO cloud MCP). Live cluster/cloud/CI introspection is the read-only `kubernetes-specialist` / `gcp-specialist` / `cicd-specialist` leaves |
| Editing security-sensitive files (auth, guard, middleware, secret, `.env`, credentials) | Read `rules/security.md`; dispatch `security-reviewer` subagent |
| System comprehension / onboarding docs ("document the system", "architecture docs", "docs for new devs", "understand the codebase") | `/analisy-architecture` — `architecture-analyst` agent (alias `analyst`) runs `patterns/1-Analisys`, produces code-grounded architecture + onboarding docs |
| Fill doc gaps by interview ("interview me about the system", "ask me about how X works", resolve open hypotheses) | `/talk-about-the-system` — `architecture-analyst` in INTERVIEW mode (`patterns/2-Interview-brainstorm.md`), interactive, folds answers back into `docs/` |
| End-to-end API QA ("test all endpoints", "run the API test suite", "QA the system", Postman/Newman run) | `qa-tester` agent (alias `qa`) — clean-slate Docker up, endpoint inventory JSON + Postman collection, headless Newman run of all endpoints/scenarios (skips MFA/email), pass/fail report; non-interactive |
| Multi-domain audit / system health check ("audit", "analyze the system", "what's broken across X") | `/engineos:audit <domain\|all>` — fans out to coordinators + MCP leaf specialists, consolidates into a status report |
| Coordinated multi-domain change | `/engineos:implement <domain> <task>` — dispatches coordinators in implement mode (spec-gated) |
| Refactor / cleanup ("refactor", "clean up", "simplify", "tech debt") | Read `rules/architecture.md`; finish with a simplify pass |
| Architecture decision ("should we use X or Y", "how should we structure") | skill `adr` — decision gets recorded, not just chatted |
| Release notes ("write release notes", "document version X.Y.Z", "what changed in this release", version bump) | skill `release-notes` |
| Business / career strategy — market opportunity ("where is this market going", "before competitors"), skill learning path ("what do I learn, in what order"), blocked non-technical decision ("X or Y and I can't decide"), positioning & perceived authority, monetizing existing assets | skill `strategy` — five modes over one grounding discipline: every claim traced to a dated web source or a file in this repo, output persisted to `docs/strategy/`. Technical "X vs Y" stays with `adr`; `strategy` handles business/career/positioning decisions |
| Review / pre-merge ("review", "is this safe", PR URL) | code-review skill; if diff touches auth/input/data/LLM, also dispatch `security-reviewer` subagent (Agent tool) |
| Test writing — explicit request only ("write tests", "add coverage", "integration tests", "E2E", "TDD this", "run the suite", regression test for a fix) | Read `rules/testing.md`; dispatch `test-writer` subagent for well-scoped targets. This row IS the opt-in path — tests get written/run here, on request, never implicitly by other rows |
| Eval setup ("set up evals", "golden set", new LLM feature lacking evals) | skill `eval-harness` |
| Claiming done / complete / fixed | `superpowers:verification-before-completion` — evidence before assertion, always |
| Spec archived / feature shipped ("archiving", "spec done", "moving to archive", spec moved to `specs/archive/` or `.engineos/archived/`) | `superpowers:verification-before-completion` — lint + typecheck + build + API/Web startup check, output shown; fix loop until clean before reporting done. The `Stop` hooks (`stop-verify.sh` + `record-verify.sh`) are the automated half; they gate on scoped lint/typecheck by default, tests only when ON per `rules/testing.md`, and on an unrecorded change record |

## Output artifact — offer after every request

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

## Non-negotiables (apply regardless of routing)

1. Spec before code for any change touching >2 files or any new feature.
2. Verification at task finalization, before "done": lint + typecheck run ONCE,
   after the last unit of work is integrated, with output shown. Tests join that
   gate only when they were ON for the task per `rules/testing.md` "Tests are
   opt-in". Never mid-task — no per-edit, per-file, or per-wave runs stalling the
   build loop (`rules/testing.md` "Verification timing"). Deferring the gate to
   the end makes it more mandatory there, not optional: red means fix loop until
   green.
3. No secrets in code, config, or commits. Ever. See `rules/security.md`.
4. Follow existing project conventions over these rules when they conflict —
   project `CLAUDE.md` > EngineOS > defaults.
5. Standard project layout: every project carries `.engineos/{changes,archived,memory}`
   + `docs/{specs,prds,rules}`. The SessionStart hook scaffolds anything missing
   (non-blocking). Every change gets a change record; the record links its spec when
   #1 required one, and carries a checklist + a "what was made" account before it is
   archived. The spec threshold is #1's — this rule does not impose a second, stricter one.
6. Model assignment per `rules/models.md`: spec/PRD on the most capable tier (`fable`),
   architecture/design/hard-debug/security on the design tier (`opus`), code and tests on
   the build tier (`sonnet`), mechanical work on the cheap tier (`haiku`). The tier is the
   contract, the model name is today's binding — rebind when a stronger model ships.
   Never trade correctness for cost.
7. Decompose and distribute per `rules/parallelism.md`: every substantive task starts
   as a task list, and every task without an in-flight dependency goes to a sub-agent —
   freeze the shared contracts, then dispatch the whole wave in ONE message over
   disjoint file scopes. The orchestrator handles contracts, dispatch, integration,
   and the final verification gate; doing distributable tasks inline or serially is
   a defect, not a style choice.
8. Sub-agents per `rules/subagents.md`: when a router row names an agent, that agent
   is dispatched — inlining the work instead is a defect. Every dispatch and every
   return is announced in a green `diff`-fenced block on its own line, blank line
   above and below, one line per agent, so which agent is working is always visible.
   This file is the standing user request for sub-agent use; a harness that waits to
   be asked has been asked here.
9. Offer the output artifact after every request per **Output artifact** above: scaffold,
   flowchart, and "no artifact" are eligible for any task; reusable template and UI/UX design
   only for frontend and mobile intents. Options that don't fit the task are not offered.
