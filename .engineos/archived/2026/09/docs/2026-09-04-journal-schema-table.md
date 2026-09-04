---
name: 2026-09-04-journal-schema-table
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: docs
---

## What

Amend the TypeScript runtime migration design and plan so the exec-journal span
schema is one field table, `src/journal/schema.ts`, from which append,
validate, usage and the hook span writer derive; enum vocabularies come from
registry loaders; check C27e and the ten `ej_*` sed parsers are retired
(deviation 4). Add **Span** to `CONTEXT.md`.

## Why

Architecture review (2026-09-04, candidate 4 of 9). `scripts/exec-journal.sh`
spells the 22-field schema seven times, its enums twice more plus once in
`policy.json`, and `scripts/checks/70-runtime.sh` carries ten sed parsers so
C27 and C27e can prove the copies agree. Plan Task 14 named `schema.ts` but had
it drive append and validate only, kept the hook writer stringly
(`Record<string,string>`) and re-pointed the parsers at TS source text.
Deletion test: remove the table and the field list reappears in seven places.

## Scope

- `docs/specs/2026-09-04-typescript-runtime-migration-design.md`
- `docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
- `CONTEXT.md`

Docs and glossary only; amendment to an existing spec.

## What was made

- Design: Layout line for `journal/`; invariant rewritten (table drives append,
  validate, usage, hook writer; C27e holds by construction); new deviation 4
  (delete C27e and the `ej_*` parsers, shrink C27); new section "Journal
  schema" with the frozen `FieldSpec` row shape (guard, json type, presence,
  registry-sourced enum values), `SpanFields`, derivation rules, sanitizer
  walk, tests, deletion test and rejected alternatives.
- Plan: Task 14 files (delete `check_C27e` + ten parsers, shrink `check_C27`),
  interface block (`Guard` gains `bool`, `JsonType`, `Presence`, `FieldName`,
  `SpanFields`, `parseAppendArgs`, `usage`, `regs` parameters), invariants
  (enum sources, `schema.test.ts`, per-class tests), acceptance (check count
  drops by one); Task 16 `span` takes `SpanFields` and sanitizes per row class.
- `CONTEXT.md`: **Span** entry after **Evidence**.

## Checklist

- [x] Row shape frozen: guard, json type, presence, registry-sourced values
- [x] Every consumer named: append, validate, usage, hook writer; no field literal elsewhere
- [x] Enum sources named per field; no literal in schema.ts
- [x] C27e and parsers retired as a recorded deviation; C27b/c/d/f kept
- [x] Hook writer typed; sanitizer walk per class stated
- [x] Glossary term added
- [x] Change record written and archived

## Verification

Docs-only change, no build. `scripts/validate-engineos.sh` run once on the
branch after the PR opened, at the owner's request; result recorded in the PR.

## Human decisions

No HITL reason fired (risk low, docs only, `git revert` undoes it). Owner
decisions from the grilling round, 2026-09-04: table drives everything (append,
validate, usage, hook writer, checks); enums from registry loaders only; retire
C27e and the ten parsers; row = guard + json type + presence; typed
`SpanFields` with per-class sanitizer; derive usage and drop the header flag
list; add **Span** to `CONTEXT.md`.

## Changes registered

Branch `docs/journal-schema-table` from `origin/main` (f3d5594). Files:

```
CONTEXT.md
docs/specs/2026-09-04-typescript-runtime-migration-design.md
docs/specs/2026-09-04-typescript-runtime-migration-plan.md
.engineos/archived/2026/09/docs/2026-09-04-journal-schema-table.md
```

## Residual risk

Removing C27e changes the validator's `passed N` total; the README count and
any test asserting `passed 108` follow in Task 14's PR. PRs #42, #44 and #45
edit neighbouring lines of the same specs and `CONTEXT.md`; adjacent hunks,
later merges may need a trivial rebase.
