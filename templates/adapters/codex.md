# Adapter — Codex / OpenAI agents

## How rules load

Root AGENTS.md loads automatically. Keep always-on guidance and a router pointer;
load activity references on demand (rules/context.md).

```markdown
# Engineering rules
<always-on set inline>

# Routing
Supervisor routes project writes/dispatch, including small edits/follow-ups.
Read matching rules/skills/patterns; table: <CLAUDE.md router link>. Announce route.
```

Nested AGENTS.md supplies directory guidance (e.g. api/ and web/).

## The AGENTS.md copy

Root AGENTS.md mirrors CLAUDE.md by hand, retaining these intentional differences:
- Longer always-on imports: parallelism, models, memory, subagents, verification,
  risk-autonomy and gates; no prompt advisor loads them.
- Install path ~/.Codex/AGENTS.md; wording "the Codex environment".
- Rule citations say "always-on", not "from the task contract".
- Hooks are absent, rather than requiring a Node version.

Other content and router rows stay aligned: C16 validates CLAUDE.md against
registries/intents.json, so copy-only rows escape validation. Scripted generation
was rejected because maintaining the four substitutions costs more than hand sync.

## What is enforced

Always-on and nested directory instructions load; other EngineOS gates do not.

## What degrades to convention

All hooks: routing/advisory, edit checks and Stop gates are model discipline.
Keep the return envelope: explicit BLOCKED/FAILED status remains useful without a parser.

## CI fallback

CI is the portable executable enforcement. Final lint/typecheck/build can block
merges; tests/evals/behavioral scripts need explicit current-task approval after
integration (rules/verification.md), including manual CI dispatch.
