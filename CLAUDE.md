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

## Router — classify before acting

Before any substantive task (anything that creates/modifies code, designs, or docs),
classify the intent and load the matching rules/skills listed below using the Read tool
(rules) and Skill tool (skills). Then announce in one line what was loaded:

`[router] intent=<intent> loaded=<rules/skills>`

Rules for routing:
- Multiple intents can match — load all that apply, in table order.
- Unknown intent → proceed with always-on rules only. Never block on routing.
- Pure questions/explanations need no routing — answer directly.
- Rules paths are relative to this file's directory.
- The **stack/domain rows** below (backend, frontend, LLM, DBA, DevOps, security,
  test) are mirrored deterministically by the `PreToolUse` hook
  `hooks/route-before-change.sh`. Its canonical path→domain map is
  `hooks/routing-map.sh` — that file is authoritative for file-pattern routing;
  this table is the human mirror, keep them in sync. The **intent rows** (new
  feature, bug, refactor, ADR, release notes, eval, claiming-done) are
  request-driven and have no hook equivalent.

| Intent (signals) | Load |
|---|---|
| New feature / multi-file change ("add", "build", "create", "implement") | `superpowers:brainstorming` first, then `tlc-spec-driven` for spec/design/tasks, then stack rules below |
| Bug / unexpected behavior ("broken", "fails", error pasted, "why does X happen") | `superpowers:systematic-debugging` |
| Backend work (NestJS, API, service, controller, migration, queue) | Read `rules/architecture.md` + `rules/backend.md` + `rules/testing.md`; skill `nestjs-patterns`; nestjs MCP for codegen; `backend-coordinator` agent for scoped analysis/changes |
| Frontend work (React, Next, component, page/app, UI, styling) | Read `rules/architecture.md` + `rules/frontend.md` + `rules/testing.md`; skill `react-patterns`; `frontend-coordinator` agent |
| LLM/agent work (prompt, agent, RAG, embedding, eval, tool schema) | Read `rules/llm-apps.md`; skill `llm-engineering`; `llm-coordinator` agent |
| DBA / data layer (`*.sql`, migrations, schema, query perf, indexing) | Read `rules/architecture.md` + `rules/data.md`; `dba-coordinator` agent (postgres/oracle MCP for introspection) |
| DevOps / infra (CI/CD, Docker, k8s/Helm, Terraform, `.github/workflows/`, cloud) | Read `rules/architecture.md` + `rules/observability.md`; `devops-coordinator` agent (kubernetes/gcp/github MCP) |
| Editing security-sensitive files (auth, guard, middleware, secret, `.env`, credentials) | Read `rules/security.md`; dispatch `security-reviewer` subagent |
| Multi-domain audit / system health check ("audit", "analyze the system", "what's broken across X") | `/engineos:audit <domain\|all>` — fans out to coordinators + MCP leaf specialists, consolidates into a status report |
| Coordinated multi-domain change | `/engineos:implement <domain> <task>` — dispatches coordinators in implement mode (spec-gated) |
| Refactor / cleanup ("refactor", "clean up", "simplify", "tech debt") | Read `rules/architecture.md`; finish with a simplify pass |
| Architecture decision ("should we use X or Y", "how should we structure") | skill `adr` — decision gets recorded, not just chatted |
| Release notes ("write release notes", "document version X.Y.Z", "what changed in this release", version bump) | skill `release-notes` |
| Review / pre-merge ("review", "is this safe", PR URL) | code-review skill; if diff touches auth/input/data/LLM, also dispatch `security-reviewer` subagent (Agent tool) |
| Test writing ("write tests", "add coverage", regression test for a fix) | Read `rules/testing.md`; dispatch `test-writer` subagent for well-scoped targets |
| Eval setup ("set up evals", "golden set", new LLM feature lacking evals) | skill `eval-harness` |
| Claiming done / complete / fixed | `superpowers:verification-before-completion` — evidence before assertion, always |
| Spec archived / feature shipped ("archiving", "spec done", "moving to archive", spec moved to `specs/archive/` or `.engineos/archived/`) | skill `post-spec-verify` — lint + typecheck + build + API/Web startup check; fix loop until clean before reporting done |

## Non-negotiables (apply regardless of routing)

1. Spec before code for any change touching >2 files or any new feature.
2. Verification before "done": typecheck + lint + relevant tests, with output shown.
3. No secrets in code, config, or commits. Ever. See `rules/security.md`.
4. Follow existing project conventions over these rules when they conflict —
   project `CLAUDE.md` > EngineOS > defaults.
5. Standard project layout: every project carries `.engineos/{changes,archived,memory}`
   + `docs/{specs,prds,rules}`. The SessionStart hook scaffolds anything missing
   (non-blocking). Spec-first for every change; the change record links its spec and
   carries a checklist + a "what was made" account before it is archived.
