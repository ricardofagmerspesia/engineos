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
@rules/risk-autonomy.md
@rules/context.md
@rules/gates.md

## Router — classify before acting

Before any substantive task (anything that creates/modifies code, designs, or docs),
classify the intent and load the matching rules/skills listed below using the Read tool
(rules) and Skill tool (skills). Then announce in one line what was loaded:

`[router] intent=<intent> risk=<low|medium|high> autonomy=<A0-A4> loaded=<rules/skills>`

The `risk` and `autonomy` fields come from always-on `rules/risk-autonomy.md` and
are classified BEFORE the first write. They set which gates apply
(`rules/gates.md`) and what the work is permitted to do on its own.

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
- Rules paths are relative to this file's directory.
- After the work is delivered, offer the output artifact — see **Output artifact** below.
- The **stack/domain rows** below (backend, frontend, mobile, LLM, DBA, DevOps,
  security, test, and the mobile store-release split) are mirrored
  deterministically by the `PreToolUse` hook `hooks/route-before-change.sh`.
  The canonical path→domain map is `registries/routing.json` (`match`/
  `excluded` globs), resolved by `scripts/kernel.sh route-path`;
  `hooks/routing-map.sh` is a compatibility shim kept only for its function
  contracts — it carries no routing data of its own. This table is the human
  mirror of the **registry**. **They no longer drift silently:**
  `scripts/validate-engineos.sh` fails CI if the table and the registry
  disagree. All other rows are request-driven and have no hook equivalent.
- **Multi-match applies to this table only.** The hook emits exactly ONE route —
  first match wins, in this precedence chain: security → test → backend → dba →
  ios-release → android-release → devops → mobile → frontend → llm. When you route from the table yourself, load
  every row that applies; when the hook speaks, it is giving you the single
  highest-precedence domain, not the complete set.
- **The hooks need `jq`.** Without it, `route-before-change.sh`,
  `mark-unrecorded.sh`, `record-verify.sh`, `task-scale-advisor.sh`,
  `gate-advisor.sh`, and `route-advisor.sh` exit 0
  silently — routing guidance and the change-record Stop gate simply do not fire.
  If you are not seeing `[router] …` context on edits, check `jq` before assuming
  the routing is wrong. Those six are the only ones that go silent:
  `stop-verify.sh` and `post-edit-check.sh` degrade to grep/sed parsing and keep
  running, and `ensure-project-layout.sh` keeps running via a grep fallback.

| Intent (signals) | Load |
|---|---|
| New feature / multi-file change ("add", "build", "create", "implement") — new behavior with no more-specific row below; a more specific matching row suppresses this one | `superpowers:brainstorming` first, then `superpowers:writing-plans` for spec/design/tasks, then stack rules below. The brainstorm+plan workflow applies at non-negotiable #1's threshold (>2 files or any new feature) — a small single-file tweak skips straight to the stack rules. Once tasks exist, apply `rules/parallelism.md`: independent tasks get dispatched as parallel agents, not done one by one |
| Big / multi-domain / sweep work (>3 files, >1 domain, ≥3 independent tasks, "across all X", migration, backfill) | Apply `rules/parallelism.md` + `rules/models.md` (always-on); fan out — `/engineos:implement <domain> <task>` for changes, `/engineos:audit` for analysis, or N Task calls in ONE message over disjoint scopes. Skills: `superpowers:dispatching-parallel-agents`, `superpowers:subagent-driven-development`; `/engineos:implement` dispatch is spec-gated |
| Bug / unexpected behavior ("broken", "fails", error pasted, "why does X happen") | `superpowers:systematic-debugging` |
| Backend work (NestJS, API, service, controller, migration, queue) | Read `rules/architecture.md` + `rules/backend.md` + `rules/data.md` + `rules/testing.md` + `rules/observability.md` (`data.md` because the signals include migrations and `nestjs-patterns` defers migration safety to it); skill `nestjs-patterns`; nestjs MCP for codegen; `backend-coordinator` agent for scoped analysis/changes |
| Frontend work (React, Next, component, page/app, UI, styling) | Read `rules/architecture.md` + `rules/frontend.md` + `rules/testing.md`; skill `react-patterns`; `frontend-coordinator` agent |
| Mobile work / mirror web to mobile (React Native, screen, navigation, native module, iOS/Android app; "mirror to mobile", "port to mobile", "same feature on mobile", "mobile parity") — store build/publish requests go to the store-release row below, not here | Read `rules/architecture.md` + `rules/frontend.md` (component/state patterns) + `rules/backend.md` (API-consumption parts) + `rules/observability.md` (closure: `backend.md` defers to it) + `rules/testing.md`, adapted mobile way; skill `react-patterns` (adapted to React Native); `mobile-coordinator` agent (alias `elias`) — mobile domain specialist: greenfield mobile features and web->mobile mirroring (web frontend read-only reference when mirroring); writes only in the mobile tree, never API/backend, web frontend, or DevOps |
| Mobile store release ("build ios", "publish to App Store", "TestFlight", "build android", "Play Store", "release the app", ipa/aab, store submission) | Apply `rules/security.md` (always-on) for signing keys/store credentials; `ios-builder` agent for Apple, `android-builder` agent for Google Play — full pipeline: preflight, version bump, quality gates, signed build, track/TestFlight upload; store review submission / production rollout only on explicit instruction |
| LLM/agent work (prompt, agent, RAG, embedding, eval, tool schema) | Read `rules/llm-apps.md`; skill `llm-engineering`; `llm-coordinator` agent |
| DBA / data layer (`*.sql`, migrations, schema, query perf, indexing) | Read `rules/architecture.md` + `rules/data.md`; `dba-coordinator` agent (writes migrations/queries; holds NO database MCP). Live schema/plan introspection is the read-only `postgres-specialist` / `oracle-specialist` leaves |
| DevOps / infra (CI/CD, Docker, k8s/Helm, Terraform, `.github/workflows/`, cloud) | Read `rules/architecture.md` + `rules/observability.md`; `devops-coordinator` agent (writes config; holds NO cloud MCP). Live cluster/cloud/CI introspection is the read-only `kubernetes-specialist` / `gcp-specialist` / `cicd-specialist` leaves |
| Editing security-sensitive files (auth, guard, middleware, secret, `.env`, credentials) | Apply `rules/security.md` (always-on); dispatch `security-reviewer` subagent |
| System comprehension / onboarding docs ("document the system", "architecture docs", "docs for new devs", "understand the codebase") — this row is for docs/onboarding output; defect and health findings go to the audit row below | `/analyze-architecture` — `architecture-analyst` agent (alias `analyst`) runs `patterns/1-Analysis.md`, produces code-grounded architecture + onboarding docs |
| Fill doc gaps by interview ("interview me about the system", "ask me about how X works", resolve open hypotheses) | `/talk-about-the-system` — `architecture-analyst` in INTERVIEW mode (`patterns/2-Interview-brainstorm.md`), interactive, folds answers back into `docs/` |
| End-to-end API QA ("test all endpoints", "run the API test suite", "QA the system", Postman/Newman run) | `qa-tester` agent (alias `qa`) — clean-slate Docker up, endpoint inventory JSON + Postman collection, headless Newman run of all endpoints/scenarios (skips MFA/email), pass/fail report; non-interactive |
| Multi-domain audit / system health check ("audit", "analyze the system", "what's broken across X") — this row is for defect and health findings; docs/onboarding output goes to the system-comprehension row above | `/engineos:audit <domain\|all>` — fans out to coordinators + MCP leaf specialists, consolidates into a status report |
| Refactor / cleanup ("refactor", "clean up", "simplify", "tech debt") | Read `rules/architecture.md`; finish with an explicit simplify pass over the diff (dead code, one-caller abstractions, `rules/base.md` hygiene) |
| Architecture decision ("should we use X or Y", "how should we structure") | skill `adr` — decision gets recorded, not just chatted |
| Release notes ("write release notes", "document version X.Y.Z", "what changed in this release", version bump) | skill `release-notes` |
| Business / career strategy — market opportunity ("where is this market going", "before competitors"), skill learning path ("what do I learn, in what order"), blocked non-technical decision ("X or Y and I can't decide"), positioning & perceived authority, monetizing existing assets | skill `strategy` — five modes over one grounding discipline: every claim traced to a dated web source or a file in this repo, output persisted to `docs/strategy/`. Technical "X vs Y" stays with `adr`; `strategy` handles business/career/positioning decisions |
| Review / pre-merge ("review", "is this safe", PR URL) | skill `code-review` (external — provided by the Claude Code environment, not this repo); if diff touches auth/input/data/LLM, also dispatch `security-reviewer` subagent (Agent tool) |
| Test writing ("write tests", "add coverage", regression test for a fix) | Read `rules/testing.md`; dispatch `test-writer` subagent for well-scoped targets |
| Eval setup ("set up evals", "golden set", new LLM feature lacking evals) | Read `rules/llm-apps.md`; skill `eval-harness` |
| Independent verification of high-risk work ("is this actually right", pre-release check on risk=high, release gate needs an independent pass) | `critic` agent (alias `vera`) — adversarial correctness review, read-only, tries to refute the claim that the work is done. Required by `rules/gates.md` at risk=high; `security-reviewer` still owns the security lens |
| Handoff between agents, waves or sessions ("hand this off", wave barrier reached, session ending mid-task) | `templates/handoff.md` — objective, state (gate, risk), done, decisions, files, evidence, known failures and open risks, not done, next step, resume. Never hand off with "continue where you left off" |
| Continuous improvement ("run a retro", "what should we improve", same correction recurring, monthly cadence) | skill `retro` — mines `.engineos/archived/`, eval failures and integrity failures for patterns with 3+ occurrences, proposes rule/skill/registry deltas as a PR. Proposes only; a human merges |
| Work complete / close the change record ("record the change", "log this change", Stop gate reports unrecorded changes) | skill `record-change` |
| Ambiguous or multi-agent request needing a dispatch plan ("route this", "who should do this", "which agents", request spans several domains with no obvious owner) | `/engineos:route` — `router` agent runs `scripts/kernel.sh route-escalate` and `risk` FIRST, then reasons only about the residue: intent tiebreaks, scope decomposition, wave grouping. Returns a dispatch plan (intents, rules, agents with disjoint file scopes, model per agent, risk, gates, waves); it never dispatches and never edits. When the kernel resolves the route on its own, no agent is dispatched at all |
| Claiming done / complete / fixed; spec archived / feature shipped ("archiving", "spec done", "moving to archive", spec moved to `.engineos/archived/` or the project's spec archive) | `superpowers:verification-before-completion` — evidence before assertion, always. For spec-archive / ship cases: lint + typecheck + build + API/Web startup check, output shown; a bounded fix loop — 2 fix attempts per check, one model-tier escalation, then stop and report red (`registries/policy.json` `repair`; `scripts/kernel.sh repair` answers each attempt). Exhausting the bound reports red honestly — it never reports done. The `Stop` hooks (`stop-verify.sh` + `record-verify.sh`) are the automated half; they gate on scoped lint/typecheck/tests and on an unrecorded change record |

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
- **No recursion.** An artifact produced from a prior offer does not itself trigger a new offer.
- **No offer on pure questions/explanations** — mirrors the routing exemption.
- **Multi-intent tiebreak:** template and UI/UX design are offered if ANY matched intent is
  frontend or mobile.
- **Scaffold** is offered only when the implementation was not already delivered as the work itself.

## Non-negotiables (apply regardless of routing)

1. Spec before code for any change touching >2 files or any new feature.
2. Verification before "done": typecheck + lint + relevant tests, with output shown.
   The automated Stop-gate half covers JS/TS-family packages only; other stacks are
   verified manually. This is the Validation gate of `rules/gates.md` — it is not
   the Release gate, which additionally wants an owner and a rollback path.
3. No secrets in code, config, or commits. Ever. See `rules/security.md`.
4. Follow existing project conventions over these rules when they conflict —
   project `CLAUDE.md` > EngineOS > defaults.
5. Standard project layout: every project carries `.engineos/{changes,archived,memory}`
   + `docs/{specs,prds,rules}`. The SessionStart hook scaffolds anything missing —
   opt-in: it runs only when the project already carries `.engineos/` or
   `ENGINEOS_SCAFFOLD=1` is set, so unrelated clones are never dirtied
   (non-blocking). Every change gets a change record; the record links its spec when
   #1 required one, and carries a checklist + a "what was made" account before it is
   archived. The spec threshold is #1's — this rule does not impose a second, stricter one.
6. Model assignment per `rules/models.md`: the tier is the contract, the model name is
   today's binding — rebind when a stronger model ships. Never trade correctness for cost.
7. Parallel by default per `rules/parallelism.md`: when work splits into independent
   units — that file owns the thresholds — freeze the shared contracts, then dispatch a
   whole wave of agents in ONE message over disjoint file scopes. Doing independent units
   serially is a defect, not a style choice.
8. Offer the output artifact after every request per **Output artifact** above: options are
   filtered per the Output artifact table's conditions; offering a dead option is a defect.
9. Classify risk before the first write, per always-on `rules/risk-autonomy.md`, and
   never exceed the autonomy ceiling for that tier. The tier drives which gates apply
   (`rules/gates.md`) and which requirements fire
   (`registries/decision-rules.json`). A tier assigned after the fact to justify work
   already done is not a classification.
10. Public surface changes follow `docs/COMPATIBILITY.md`: rule paths, agent names,
    aliases, command names, skill directories, hook contracts and the return envelope
    are versioned surface. A rename is a deprecation with a window, never a silent `git mv`.
