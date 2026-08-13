# Sub-agent Rules — always on

The router names agents. Naming an agent and then doing the work inline is a
defect: the specialist's rules, model tier, and file scope never get applied.

## Dispatch is mandatory

- DO dispatch the agent the router row names, via the Agent/Task tool, whenever
  that row matches. `agent:backend-coordinator` in a row is an instruction, not a
  footnote.
- DO treat this file as the user's standing request to use sub-agents — a harness
  that only spawns agents "when the user asks" has been asked, here, once and for all.
- DO dispatch even for a single unit of work. Fan-out (`rules/parallelism.md`) is
  about how MANY agents run at once; this file is about whether ANY runs at all.
- DO pass every agent its MODE (AUDIT|IMPLEMENT), exact file scope, frozen
  contracts, model per `rules/models.md`, and the output format expected back.
- DON'T dispatch for pure questions, explanations, or a single-line mechanical
  edit the router didn't route. Those are answered directly.
- DON'T dispatch an agent whose file scope overlaps another in-flight agent —
  disjoint scopes or serialize (`rules/parallelism.md`).

## Announcement format — green, on its own line

Every dispatch is announced BEFORE the agent runs, and every return is announced
after. Each announcement is a `diff`-fenced block so the terminal renders it
green, separated from surrounding prose by a blank line above and below — one
agent per line, never inline in a paragraph.

```diff
+ [agent] borisenko (backend-coordinator) | model: opus | mode: IMPLEMENT | scope: src/orders/**
```

On return:

```diff
+ [agent] borisenko -> done | 3 files | final gate green
```

- DO use the alias when the agent has one (`borisenko`, `arturo`, `elias`, …),
  with the canonical name in parentheses on first mention.
- DO emit one line per agent when a wave is dispatched — the wave is one fenced
  block, one line inside it per agent, so the reader sees who is working at a glance.
- DO announce failure on the same green line with `-> FAILED` and the reason;
  never let a wave summary hide a dead branch (`rules/parallelism.md`).
- DON'T bury an agent name in a sentence, and DON'T batch several agents onto one
  line. Which agent is working must be readable without parsing prose.

## If you are the dispatched agent

The brief names your mode. `MODE: AUDIT` is read-only — inspect, gather evidence,
report, edit nothing. `MODE: IMPLEMENT` makes the change, then states what it
changed and how it verified. Absent a mode, infer one: a question or
"review/analyze" reads as AUDIT, an explicit task as IMPLEMENT.

You are probably one of several agents on this repo right now, so:

- **Stay inside the file scope you were given** — report anything outside it as
  `### Out of scope` for the orchestrator to route. Another agent likely owns it.
- **Honor the frozen contracts** (types, API payloads, DB schema, module
  surfaces) verbatim. Report a contract that looks wrong; never redefine one
  unilaterally, since siblings are coding against it.
- **Verify with scoped lint/typecheck only.** Repo-wide formatters, codemods and
  `git` writes collide with concurrent agents. Tests join that run only when the
  brief marked them in scope (`rules/verification.md` "Tests are opt-in"); the
  full suite and the final gate belong to the orchestrator.
- **Project `CLAUDE.md` outranks EngineOS** wherever the two conflict.

## Relation to the router

`rules/parallelism.md` decides how the work splits. `rules/models.md` decides the
tier each agent runs at. This file decides that the agent runs and that the user
can see it. All three apply together.

Enforced at the hook level, not by prose alone: `hooks/announce-agent-dispatch.sh` and
`announce-agent-return.sh` re-inject the banner at dispatch/return time. See README.
