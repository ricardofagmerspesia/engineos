# .engineos/changes/

In-progress change records — one file per change, initiative, or unit of work
currently active. The working surface for tracking what is being changed and why,
versioned in git so the trail is auditable.

One change per file. Filename: `<YYYY-MM-DD>-<short-kebab-slug>.md`.

The record shape is `_template.md` — copy it; never restate the schema here.
The schema is data on the `record-change` intent (`registries/intents.json`:
`required_sections` / `required_fields` / `archive_contract`), and
`scripts/validate-engineos.sh` (C21) validates the template, every archived
record, and this file's silence against it.

## Lifecycle

```
.engineos/changes/  --(work complete + verified)-->  .engineos/archived/
```

When a change is done and verified, set `status: done` and move the file to
`.engineos/archived/<YYYY>/<MM>/<domain>/` (grouped by completed month, then by the
record's `domain:` field — see `.engineos/archived/README.md`).
Distil any lasting fact into `.engineos/memory/` and link it. Git retains the full move
history — nothing is lost.
