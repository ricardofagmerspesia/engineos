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

## The AGENTS.md copy

`AGENTS.md` at the repo root is a copy of `CLAUDE.md`, kept in sync by hand. It
deliberately differs in four places, and a sync that "fixes" them is a
regression:

- The always-on import list is longer: `parallelism`, `models`, `memory`,
  `subagents`, `verification`, `risk-autonomy` and `gates` are always-on here,
  because no prompt advisor loads them per intent.
- The install path is `~/.Codex/AGENTS.md`, and the tool is named "the Codex
  environment" where `CLAUDE.md` names Claude Code.
- Rule files are cited as "(always-on)" where `CLAUDE.md` says "from the task
  contract" — there is no prompt advisor here to produce a contract.
- The hooks bullet says the hooks do not run at all, instead of naming their
  node floor.

Everything else is the same document, including the router table row for row:
C16 counts `CLAUDE.md`'s rows against `registries/intents.json`, so a row that
lives only in the copy is invisible to the validator and drifts unnoticed. That
is how the copy carried a "Coordinated multi-domain change" row and a
`hooks/routing-map.sh` mention for a release after both were gone. Rejected once
already: generating the copy from `CLAUDE.md` by script — the substitution table
the four deltas need is more machinery than the hand sync it would replace.

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
