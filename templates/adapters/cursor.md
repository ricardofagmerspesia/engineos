# Adapter — Cursor

## How rules load

`.cursor/rules/*.mdc` files, each with frontmatter controlling when it applies:

```mdc
---
description: EngineOS always-on rules
alwaysApply: true
---
<contents of rules/base.md, security.md, git.md, memory.md,
 parallelism.md, models.md, risk-autonomy.md, context.md>
```

Domain rules use registry match globs:

```mdc
---
globs: ["**/*.controller.ts", "**/*.service.ts", "**/*.module.ts"]
---
<contents of rules/backend.md + architecture.md + data.md + testing.md + observability.md>
```

Derive patterns/precedence from registries/routing.json; no second hand-maintained list.

## What is enforced

- Always-on rules: yes, natively.
- File-pattern routing: yes, via globs. Cursor applies **all** matching rule
  files, unlike the hook's first-match-wins — so the security and mobile
  precedence carve-outs must be expressed as negative globs, or accepted as
  over-loading.
- Everything else: no.

## What degrades to convention

- **Stop gates.** Cursor has no post-turn hook. "Verification before done" and
  "record the change" become PR-checklist items and CI checks.
- **Gate advisory.** `registries/decision-rules.json` is not consulted
  automatically; include a condensed version of `rules/gates.md` in the
  always-apply rule so the model applies it from context.
- **Post-edit checks.** EngineOS runs none; request approval for final validation.

## User decisions

Apply rules/base.md **Awaiting user input** to every user decision with permitted
clickable host controls; offer **Provide details** when free text is needed. Explain
labelled-text fallback when controls are unavailable or prohibited for that
decision. For specific final checks, follow rules/verification.md: clickable
**Run** / **Skip** per exact distinct command, batch within host limits, then
clickable confirmation of the selected commands at the integrated revision.
Record submitted choices, never inferred defaults; these remain host conventions.

## CI fallback

Apply the kernel simple planning choice before artifacts: **Implement directly** /
**Create a lightweight spec** through permitted clickable host controls. Direct
requires complete eligible facts and current scope-bound choice, with stack rules
and security/Git safeguards. It needs no mandatory prototype or ticket workflow.
Selected specs use Matt Pocock tracer-bullet tickets and a capacity-bounded ready
frontier. After ALL implementation tickets integrate, always ask fresh clickable
**Run proposed checks** / **Choose specific checks** / **Skip for now** consent.
Use honest labelled text only when permitted controls are unavailable.

Final CI lint/typecheck/build/tests/evals/integrity checks require explicit
current-task final approval for the integrated ref (rules/verification.md).
CI cannot enforce uncommitted work; the model must apply its final gate.

## Existing assets

`templates/cursor/commands/` already carries `audit` and `implement`.
