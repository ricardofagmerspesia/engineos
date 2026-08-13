# /bypass — turn EngineOS off for this session

Trailing text is `on`, `off`, or `status` — empty means `on`.

Cursor has no hook system, so there are no gates to disable here: EngineOS in
Cursor is prompt-only to begin with. This command is therefore prompt-only too,
and it does exactly one thing — it tells you to stop applying the constitution.
The marker file the Claude Code version writes is not used; nothing outside this
conversation changes.

## Steps

1. **Parse** the argument. Empty or `on` -> bypass ON. `off` -> bypass OFF.
   `status` -> report the current state and stop.

2. **Report the new state in one line and stop.** Do not do any other work in the
   same turn — the user flips the switch, then makes their request.

3. **While the bypass is ON**, for the rest of this conversation:

   - **No routing.** Skip the router table in `AGENTS.md` / the EngineOS rules.
     Emit no `[router]` line.
   - **No rule loading.** Treat `rules/*.md` as not applicable rather than as
     standards to enforce.
   - **No agent dispatch.** Do the work inline — no coordinators, no fan-out, no
     green banners (`.cursor/rules/subagent-dispatch.mdc`).
   - **No spec gate, no change record.** Non-negotiables 1 and 5 are off.
   - **No verification gate.** Run lint/typecheck only if the user asks. Tests
     were already opt-in (`.cursor/rules/testing-opt-in.mdc`).
   - **No output-artifact offer.** Answer the request and stop.
   - **Say `[engineos] bypassed`** in the first line of every reply. A silent
     bypass is the failure mode: the user must never read unguarded work as
     guarded.

## What bypass does NOT turn off

This switch removes EngineOS process, not judgment:

- No secrets in code, config, or commits. That is a floor, not an EngineOS rule.
- Confirm destructive or outward-facing actions before taking them.
- The project's own `CLAUDE.md` / `AGENTS.md` house rules still apply. Bypass
  drops the shared constitution, not the repo's own conventions.

## Lifetime

It lasts until `/bypass off` or the end of this conversation. Unlike the Claude
Code version, nothing expires it automatically — Cursor has no `SessionStart`
hook to clear it. If you are unsure whether it is still on, say so and ask.
