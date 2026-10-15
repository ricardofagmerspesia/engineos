# Compact agent announcements

Status: COMPACT-1 integrated; prototype declined; approved final proof passed 2026-10-15 (build, 61/61 announcement tests, validator 116/0). Change record archived at `.engineos/archived/2026/10/llm/2026-10-15-compact-agent-announcements.md`.
Scope revision: compact-v1. Risk: low. Autonomy: A2, reversible working-tree edits only.
Branch/current PR: `codex/engineos-workflow-updates`, ricardofagmer/engineer-spec-ia-pattern#139. Preserve unrelated dirty work.

## Problem and decision

The user asked to "summary the cmd to be in line and not two lines per cmd". Each dispatch currently prints a scope line and a separate status/task line per agent, so a three-agent batch is six wrapped lines.

Chosen: one line per agent per event, carrying role, optional instance, model, mode, status, scope and a short task. Instance becomes a `#<id>` suffix on the role so it costs no extra field. Rejected: keep two lines and only drop the `| model:` / `| status:` labels; it halves noise but still doubles every agent, which is what the user objected to. Rejected: a table; renderer-dependent and unreadable in plain terminals.

## Display contract (frozen)

The bold **Subagents starting work** label, one `diff` block per dispatch batch and blank lines around it stay. Inside the block, exactly one line per agent:

```diff
+ [<short role>] <model> <AUDIT|IMPLEMENT> starting — <scope> — <task>
+ [<short role>] <model> returned — <result summary>
+ [<short role>] <model> FAILED — <reason>
```

- `<short role>` comes from the existing mapping; two active workers sharing a role become `[qa#1]`, `[qa#2]` (actual host worker id or supervisor-assigned id), kept for their whole lifecycle.
- `<model>` is the actual configured host model; unavailable reads `inherited (exact model unknown)`; never a tier or a guess.
- Scope and task are each shortened to about 60 characters: a shared directory in braces (`docs/specs/{05-backend,08-security}.md`), a glob (`src/orders/**`) or `<first path> +N`; the task is a plain-English summary. An agent never wraps onto a second line.
- Optional purple role coloring on verified hosts, canonical agent IDs, aliases, responsibilities, hook envelopes and telemetry are unchanged.

Examples:

```diff
+ [docs] opus IMPLEMENT starting — docs/tasy/specs/{05-backend,08-security}.md — auth hardening + rev 7 docs
+ [backend#1] opus returned — 15 files, scoped diff inspected
```

## Ticket COMPACT-1

Exclusive paths: `rules/subagents.md` (section "Visible subagent announcements" only), `src/hooks/announce-agent-dispatch.ts`, `src/hooks/announce-agent-return.ts` (banner strings only), `src/hooks/announce-agent-dispatch.test.ts`, `src/hooks/announce-agent-return.test.ts`, `src/hooks/announce-agent.e2e.test.ts` (format expectations only), `templates/adapters/codex.md` (announcement paragraph only), `docs/COMPATIBILITY.md` (new dated section only), `dist/engineos.cjs` (rebuild by the supervisor after integration).

Acceptance: rule and both hook banners describe the one-line shape above; tests expect the new banner text; nothing else in the hooks (bounding, telemetry, status floor) changes. `templates/adapters/subagent-announcement.prototype.html` is a historical throwaway and stays untouched.

Final proof (after integration and fresh consent): `npm run build`, the three announcement suites, and `scripts/validate-engineos.sh`.
