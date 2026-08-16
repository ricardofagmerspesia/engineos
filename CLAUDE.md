# EngineOS — Engineering Constitution & Router

Team-shared AI engineering environment. This file is versioned in the `engineos` repo.
Do NOT edit your local copy in place — change it via PR to the repo.
Personal preferences (output style, personal hooks, API keys) live in your own
`~/.claude/CLAUDE.md` lines and `settings.local.json`, never here.

## Always-on rules

@rules/base.md
@rules/security.md
@rules/git.md
@rules/parallelism.md
@rules/models.md
@rules/subagents.md
@rules/verification.md

## Router — classify before acting

Before any substantive task (anything that creates/modifies code, designs, or docs),
classify the intent and load the matching rules/skills below using the Read tool
(rules) and Skill tool (skills), and dispatch the agents the matched rows name.
Then announce in one line:

`[router] intent=<intent> loaded=<rules/skills> agent=<agents dispatched|none>`

Rules for routing:
- Multiple intents can match — load all that apply, in table order.
- **A row's load list must be closed.** If a rule file cross-references another
  (`backend.md` defers logging to `observability.md`, `data.md` defers SQL binding to
  `security.md`), every row that loads the first MUST also load the second — otherwise
  the deferred rule silently disappears. Always-on files are always available and never
  point outward; only non-always-on files point, and only at always-on files or at files
  loaded in the same row.
- Unknown intent → proceed with always-on rules only. Never block on routing.
- Pure questions/explanations need no routing — answer directly.
- **A row that names an agent means dispatch it**, not "mention it". Doing the work
  inline when a row names an agent is a defect — see `rules/subagents.md`.
- Rules paths are relative to this file's directory.
- After the work is delivered, offer the output artifact — see **Output artifact** below.
- **Bypass short-circuits everything below.** When `/engineos:bypass` is on, the
  `UserPromptSubmit` hook injects `[engineos] BYPASS ACTIVE` on every turn. On seeing
  it: skip this table, emit no `[router]` line, dispatch no agents, skip the spec gate,
  the change record, and the output-artifact offer — and open your reply with
  `[engineos] bypassed` so the user knows the guardrails are down. The rule files stay
  in context (nothing can unload a `CLAUDE.md` import); treat them as not applicable.
  The bypass expires at the next SessionStart.
- **Hook mirror.** The stack/domain rows (backend, frontend, mobile, LLM, DBA, DevOps,
  security, test) are mirrored by the `PreToolUse` hook `hooks/route-before-change.sh`;
  `hooks/routing-map.sh` is authoritative for file-pattern routing and this table is the
  human mirror — keep them in sync. The hook emits exactly ONE route (first match wins,
  security first, mobile before frontend); multi-match applies to this table only. All
  other rows are request-driven with no hook equivalent. The hooks need `jq` — without
  it they exit 0 silently, so check `jq` before assuming routing is broken.

| Intent (signals) | Load |
|---|---|
| New feature / multi-file change ("add", "build", "create", "implement") | `superpowers:brainstorming`, then `superpowers:writing-plans` for spec/design/tasks, then stack rules below. Once tasks exist, apply `rules/parallelism.md` — independent tasks get dispatched as parallel agents, not done one by one |
| Big / multi-domain / sweep work (>3 files, >1 domain, ≥3 independent tasks, "across all X", migration, backfill) | `rules/parallelism.md` + `rules/models.md`; fan out via `/engineos:implement <domain> <task>`, `/engineos:audit`, or N Task calls in ONE message over disjoint scopes. Skills: `superpowers:dispatching-parallel-agents`, `superpowers:subagent-driven-development` |
| Bug / unexpected behavior ("broken", "fails", error pasted, "why does X happen") | `superpowers:systematic-debugging` |
| Backend work (NestJS, API, service, controller, migration, queue) | `rules/architecture.md` + `rules/backend.md` + `rules/production-backend-standards.md` + `rules/testing.md` + `rules/observability.md`; skill `nestjs-patterns`; nestjs MCP for codegen; agent `backend-coordinator` |
| Frontend work (React, Next, component, page/app, UI, styling) | `rules/architecture.md` + `rules/frontend.md` + `rules/testing.md`; skill `react-patterns`; agent `frontend-coordinator` |
| Mobile work / mirror web to mobile (React Native, screen, navigation, native module, iOS/Android app; "mirror to mobile", "port to mobile", "mobile parity") | `rules/architecture.md` + `rules/frontend.md` + `rules/backend.md` (API-consumption parts) + `rules/observability.md` + `rules/testing.md`, adapted the mobile way; agent `mobile-coordinator` (elias) |
| Mobile store release ("build ios", "publish to App Store", "TestFlight", "build android", "Play Store", "release the app", ipa/aab, store submission) | `rules/security.md` (signing keys/store credentials); agent `ios-builder` for Apple, `android-builder` for Google Play. Store review submission / production rollout only on explicit instruction |
| LLM/agent work (prompt, agent, RAG, embedding, eval, tool schema) | `rules/llm-apps.md`; skill `llm-engineering`; agent `llm-coordinator` |
| DBA / data layer (`*.sql`, migrations, schema, query perf, indexing) | `rules/architecture.md` + `rules/data.md`; agent `dba-coordinator` (writes migrations/queries, holds NO database MCP). Live schema/plan introspection is the read-only `postgres-specialist` / `oracle-specialist` leaves |
| DevOps / infra (CI/CD, Docker, k8s/Helm, Terraform, `.github/workflows/`, cloud) | `rules/architecture.md` + `rules/observability.md`; agent `devops-coordinator` (writes config, holds NO cloud MCP). Live cluster/cloud/CI introspection is the read-only `kubernetes-specialist` / `gcp-specialist` / `cicd-specialist` leaves |
| Editing security-sensitive files (auth, guard, middleware, secret, `.env`, credentials) | `rules/security.md`; dispatch `security-reviewer` |
| System comprehension / onboarding docs ("document the system", "architecture docs", "docs for new devs", "understand the codebase") | `/analisy-architecture` + `rules/memory.md`; agent `architecture-analyst` (analyst) runs `patterns/1-Analisys` |
| Fill doc gaps by interview ("interview me about the system", "ask me about how X works", resolve open hypotheses) | `/talk-about-the-system` + `rules/memory.md`; `architecture-analyst` in INTERVIEW mode (`patterns/2-Interview-brainstorm.md`), interactive, folds answers back into `docs/` |
| End-to-end API QA ("test all endpoints", "run the API test suite", "QA the system", Postman/Newman run) | agent `qa-tester` (qa) — non-interactive, skips MFA/email steps |
| Multi-domain audit / system health check ("audit", "analyze the system", "what's broken across X") | `/engineos:audit <domain\|all>` — fans out to coordinators + MCP leaf specialists, consolidates into a status report |
| Coordinated multi-domain change | `/engineos:implement <domain> <task>` — dispatches coordinators in implement mode (spec-gated) |
| Refactor / cleanup ("refactor", "clean up", "simplify", "tech debt") | `rules/architecture.md`; finish with a simplify pass |
| Architecture decision ("should we use X or Y", "how should we structure") | skill `adr` + `rules/memory.md` — decision gets recorded, not just chatted |
| Release notes ("write release notes", "document version X.Y.Z", "what changed in this release", version bump) | skill `release-notes` |
| Business / career strategy — market opportunity, skill learning path, blocked non-technical decision ("X or Y and I can't decide"), positioning & perceived authority, monetizing existing assets | skill `strategy` — every claim traced to a dated web source or a file in this repo, output persisted to `docs/strategy/`. Technical "X vs Y" stays with `adr` |
| Review / pre-merge ("review", "is this safe", PR URL) | code-review skill; if the diff touches auth/input/data/LLM, also dispatch `security-reviewer` |
| Test writing — explicit request only ("write tests", "add coverage", "integration tests", "E2E", "TDD this", "run the suite", regression test for a fix) | `rules/testing.md`; dispatch `test-writer` for well-scoped targets. This row IS the opt-in path — tests get written/run here, on request, never implicitly by other rows |
| Eval setup ("set up evals", "golden set", new LLM feature lacking evals) | skill `eval-harness` |
| Claiming done / complete / fixed | `superpowers:verification-before-completion` — evidence before assertion, always |
| Spec archived / feature shipped ("archiving", "spec done", "moving to archive", spec moved to `specs/archive/` or `.engineos/archived/`) | the final gate (`rules/verification.md`) **plus** build + API/Web startup check, output shown; fix loop until clean before reporting done. The `Stop` hooks (`stop-verify.sh` + `record-verify.sh`) are the automated half, and also gate on an unrecorded change record |

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

Each item names the file that owns it. That file is the single source of truth —
read it there, not here.

1. **Spec before code** — any change touching >2 files or any new feature.
2. **The final gate before "done"** — `rules/verification.md`.
3. **No secrets** in code, config, or commits. Ever — `rules/security.md`.
4. **Project conventions win** over these rules when they conflict:
   project `CLAUDE.md` > EngineOS > defaults.
5. **Standard project layout** — every project carries `.engineos/{changes,archived,memory}`
   + `docs/{specs,prds,rules}`; the SessionStart hook scaffolds anything missing
   (non-blocking). Every change gets a change record: it links its spec when #1
   required one, and carries a checklist + a "what was made" account before it is
   archived. #1's threshold is the only spec threshold.
6. **Model tier per work type** — `rules/models.md`.
7. **Decompose and distribute** — `rules/parallelism.md`.
8. **Dispatch the agent the router names, and announce it** — `rules/subagents.md`.
   This file is the standing user request for sub-agent use; a harness that waits
   to be asked has been asked here.
9. **Offer the output artifact** after every request — **Output artifact** above.
