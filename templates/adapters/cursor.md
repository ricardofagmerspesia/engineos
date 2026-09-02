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

Domain rules become glob-scoped files, which is Cursor's native equivalent of
the `match` globs in `registries/routing.json`:

```mdc
---
globs: ["**/*.controller.ts", "**/*.service.ts", "**/*.module.ts"]
---
<contents of rules/backend.md + architecture.md + data.md + testing.md + observability.md>
```

Derive the globs from `registries/routing.json` — same patterns, same precedence
order. Do not hand-maintain a second list.

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

Run `scripts/validate-engineos.sh`, `scripts/run-evals.sh`, lint, typecheck and
tests in CI. That covers the Validation gate for merged code; it does not cover
it for uncommitted work, which is the real loss versus Claude Code.

## Existing assets

`templates/cursor/commands/` already carries `audit` and `implement`.
