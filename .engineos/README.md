# .engineos/

All EngineOS working state for this repo, kept in one hidden folder so it doesn't
clutter the project root.

| Subfolder | Holds |
|---|---|
| `changes/` | Active change records (one per in-progress unit of work) + `_template.md` |
| `archived/` | Completed records, grouped `archived/<YYYY>/<MM>/<DD>/` |
| `memory/` | Durable, repo-specific takeaways that outlive a single change |
| `audits/` | `/audit` reports (`<date>-<domain>.md`) — created on first audit |

Lifecycle: open a record in `changes/` → work → close with the `record-change`
skill (moves it to `archived/<YYYY>/<MM>/<DD>/`, clears the Stop-gate flag) → distil
any lasting fact into `memory/`. See each subfolder's README.

This is the EngineOS governance store, not personal Claude memory
(`~/.claude/.../memory/`) and not a copy of the team `rules/`.
