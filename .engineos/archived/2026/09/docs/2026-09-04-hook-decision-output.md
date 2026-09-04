---
name: 2026-09-04-hook-decision-output
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: docs
---

## What

Amend the TypeScript runtime migration design and plan so the hook contract has
an output half: `src/hooks/output.ts` with a five-kind `HookDecision`
(`silent | context | block | message | fail`) and one `render()` that owns hook
stdout and exit codes. Every hook becomes `run(env, ctx): HookDecision`; the
CLI adapter renders. Add **Hook decision** to `CONTEXT.md`.

## Why

Architecture review (2026-09-04, candidate 3 of 9). The Hook envelope models
what a hook receives; what it returns was re-derived per hook in bash: one
`hook_context` helper, three hand-written block literals (two in
`stop-verify.sh` with different reason text), a `systemMessage` in the node
guard, stderr + `exit 2` in `post-edit-check`, and silence. Plan Tasks 18-25
gave each ported hook the shape `(io) => number`, so rendering would have stayed
the test surface in nine files. Deletion test: remove `output.ts` and the
shapes reappear in nine hooks plus the guard.

## Scope

- `docs/specs/2026-09-04-typescript-runtime-migration-design.md`
- `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
- `CONTEXT.md`

Docs and glossary only; amendment to an existing spec, so `spec:` points at
the design it amends.

## What was made

- Design: Layout gains `hooks/output.ts`; node-guard paragraph says the
  deviation-2 `systemMessage` is a `message` decision rendered by `output.ts`;
  new section "Hook decision" with the frozen type, constructors, `render`,
  the `run(env, ctx)` hook shape, the single adapter, cache-the-decision rule,
  test discipline, deletion test and rejected alternatives; Testing bullets
  name `output.ts` and the decision-not-stdout rule.
- Plan: Task 16 files, interface block (`HookEventName`, `HookDecision`, five
  constructors, `render`, `HookContext`), invariants (render is the only
  stdout/exit-code writer; guard's `skip` branch re-pointed; `output.test.ts`
  alone asserts JSON text) and commit message; Tasks 18-25 common shape now
  `run(env, ctx): HookDecision` with the adapter and a Tests bullet; Task 20,
  21 (cache stores the decision), 25 (one block literal) and 25b (`fail`)
  rows; file structure gains `output`.
- `CONTEXT.md`: **Hook decision** entry after **Hook envelope**.

## Checklist

- [x] Interface frozen with exact kinds, constructors and render signature
- [x] Adapter is the only stdout/exit-code writer; hooks return values
- [x] Node guard's deviation-2 message routed through the same renderer
- [x] Route cache stores the decision, hit path renders
- [x] Test surface stated: decisions in hook tests, JSON in output.test.ts, stdout in Wave 6 e2e
- [x] Glossary term added
- [x] Change record written and archived

## Verification

Docs-only change, no build. `scripts/validate-engineos.sh` run once on the
branch after the PR opened, at the owner's request; result recorded in the PR.

## Human decisions

No HITL reason fired (risk low, docs only, `git revert` undoes it). Owner
decisions from the grilling round, 2026-09-04: five kinds, hooks only (CLI
`{error}` stays in `cli.ts`); `run(env, ctx) => HookDecision`; node guard emits
the `message` kind through `render`; cache the decision, not rendered stdout;
tests assert decision values plus one render test, e2e keeps stdout; module is
`src/hooks/output.ts` inside Task 16; add **Hook decision** to `CONTEXT.md`.

## Changes registered

Branch `docs/hook-decision-output` from `origin/main` (f3d5594). Files:

```
CONTEXT.md
docs/specs/2026-09-04-typescript-runtime-migration-design.md
docs/specs/2026-09-04-typescript-runtime-migration-plan.md
.engineos/archived/2026/09/docs/2026-09-04-hook-decision-output.md
```

## Residual risk

PRs #42 and #44 edit neighbouring lines of the same two specs (Layout,
Testing bullets, Task 16 area); hunks are adjacent, not overlapping, so the
later merges may need a trivial rebase. Task 3 (Wave 0, landed) keeps its
inline `writeJson` until Task 16 re-points it.
