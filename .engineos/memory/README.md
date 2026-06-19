# memory/

Persistent, team-shared knowledge that outlives any single change — decisions,
conventions, and facts the team wants to recall later. Versioned in git.

One concept per file. Kebab-case filename. Each file:

```markdown
---
name: <short-kebab-slug>
description: <one-line summary>
type: decision | convention | fact | reference
---

<the knowledge. Link related entries with [[other-slug]].>
```

## Boundaries (avoid duplication — see rules/memory.md)

- This is the **engineos repo's own** knowledge store. NOT personal Claude memory
  (`~/.claude/.../memory/`) and NOT a place to copy EngineOS `rules/`.
- Team engineering standards stay in `rules/`. Architectural decisions that belong
  to a *consuming* project stay in that project's `docs/adr/`.
- Use this for knowledge about EngineOS itself that isn't a rule, skill, or code.

## Relationship to .engineos/changes/ and .engineos/archived/

- `.engineos/changes/` — in-progress change records (active work).
- `.engineos/archived/` — completed change records, moved out of `.engineos/changes/`.
- `.engineos/memory/` — the distilled, durable takeaways. A finished change in `.engineos/archived/`
  may leave a lasting fact here; link back with `[[change-slug]]`.
