# Adapter — Codex / OpenAI agents

## How rules load

`AGENTS.md` at the repo root, read automatically. Keep it to the always-on set
plus a pointer to the router table — the full corpus does not fit and should not
be loaded eagerly (`rules/context.md`).

```markdown
# Engineering rules
<always-on set inline>

# Routing
Before substantive work, classify the intent and read the matching files from
`rules/`. Table: <link to CLAUDE.md router section>. Announce what you loaded.
```

Nested `AGENTS.md` files in subdirectories are the closest analogue to
path-scoped routing: put the backend rules in `api/AGENTS.md`, the frontend rules
in `web/AGENTS.md`.

## What is enforced

- Always-on rules: yes.
- Directory-scoped rules: yes, via nested `AGENTS.md`.
- Everything else: no.

## What degrades to convention

- **All hooks.** No PreToolUse, PostToolUse or Stop equivalent. Routing, gate
  advisory, post-edit checks and both Stop gates are model discipline only.
- **The return envelope.** Still worth stating in `AGENTS.md` — a structured
  status is useful even when nothing parses it, because it forces the author to
  pick `BLOCKED` instead of writing a hopeful paragraph.

## CI fallback

The full `scripts/` suite. On this tool CI is not a backstop, it is the only
enforcement — weight it accordingly and make the checks blocking.
