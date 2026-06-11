# EngineOS — Engineering Constitution & Router

Team-shared AI engineering environment. This file is versioned in the `engineos` repo.
Do NOT edit your local copy in place — change it via PR to the repo.
Personal preferences (output style, personal hooks, API keys) live in your own
`~/.claude/CLAUDE.md` lines and `settings.local.json`, never here.

## Always-on rules

@rules/base.md
@rules/security.md
@rules/git.md

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

| Intent (signals) | Load |
|---|---|
| New feature / multi-file change ("add", "build", "create", "implement") | `superpowers:brainstorming` first, then `tlc-spec-driven` for spec/design/tasks, then stack rules below |
| Bug / unexpected behavior ("broken", "fails", error pasted, "why does X happen") | `superpowers:systematic-debugging` |
| Backend work (NestJS, API, service, controller, migration, queue) | Read `rules/architecture.md` + `rules/backend.md` + `rules/testing.md`; skill `nestjs-patterns`; nestjs MCP for codegen |
| Frontend work (React, Next, component, page, UI, styling) | Read `rules/architecture.md` + `rules/frontend.md` + `rules/testing.md`; skill `react-patterns` |
| LLM/agent work (prompt, agent, RAG, embedding, eval, tool schema) | Read `rules/llm-apps.md`; skill `llm-engineering` |
| Refactor / cleanup ("refactor", "clean up", "simplify", "tech debt") | Read `rules/architecture.md`; finish with a simplify pass |
| Architecture decision ("should we use X or Y", "how should we structure") | skill `adr` — decision gets recorded, not just chatted |
| Review / pre-merge ("review", "is this safe", PR URL) | code-review skill + Read `rules/security.md` checklist |
| Claiming done / complete / fixed | `superpowers:verification-before-completion` — evidence before assertion, always |

## Non-negotiables (apply regardless of routing)

1. Spec before code for any change touching >2 files or any new feature.
2. Verification before "done": typecheck + lint + relevant tests, with output shown.
3. No secrets in code, config, or commits. Ever. See `rules/security.md`.
4. Follow existing project conventions over these rules when they conflict —
   project `CLAUDE.md` > EngineOS > defaults.
