# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase. Layout: **single-context**. Seeded by `engineos init`; edit
freely — init never overwrites this file.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: the domain glossary.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence;
don't suggest creating them upfront. The `/domain-modeling` skill (reached via
`/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when
terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 2026-01-15-event-sourced-orders.md
│   └── 2026-02-03-postgres-for-write-model.md
└── src/
```

ADR filenames are `YYYY-MM-DD-<slug>.md` — the date the decision was taken, then a
kebab-case slug. Never sequence numbers: parallel branches collide on them.

## Use the glossary's vocabulary

When your output names a domain concept (in a ticket title, a refactor proposal, a
hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to
synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're
inventing language the project doesn't use (reconsider) or there's a real gap (note
it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding:

> _Contradicts ADR 2026-01-15-event-sourced-orders, but worth reopening because…_
