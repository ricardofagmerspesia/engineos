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
- **Post-edit lint.** Use Cursor's own lint-on-save plus CI.

## CI fallback

Final CI lint/typecheck/build covers integrated code. Tests/evals/behavioral
validator require explicit current-task final approval (rules/verification.md).
CI cannot enforce uncommitted work; the model must apply its final gate.

## Existing assets

`templates/cursor/commands/` already carries `audit` and `implement`.
