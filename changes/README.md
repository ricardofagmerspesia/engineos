# changes/

In-progress change records — one file per change, initiative, or unit of work
currently active. The working surface for tracking what is being changed and why,
versioned in git so the trail is auditable.

One change per file. Filename: `<YYYY-MM-DD>-<short-kebab-slug>.md`.

```markdown
---
name: <YYYY-MM-DD>-<short-kebab-slug>
status: active
owner: <name>
---

## What
<the change in one or two sentences>

## Why
<motivation / problem being solved>

## Scope
<files, modules, or surfaces touched>

## Verification
<how it was checked: typecheck, lint, tests, manual>

## Notes
<decisions, gotchas, links — [[memory-slug]] for durable takeaways>
```

## Lifecycle

```
changes/  --(work complete + verified)-->  archived/
```

When a change is done and verified, set `status: done` and move the file to
`archived/`. Distil any lasting fact into `memory/` and link it. Git retains the
full move history — nothing is lost.
