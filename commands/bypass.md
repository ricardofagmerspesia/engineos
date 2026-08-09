---
description: Turn EngineOS off for this session — no routing, no rules, no agent dispatch, no spec gate, no Stop gates. Run with `off` to restore.
argument-hint: "[on|off|status]  (default: on)"
allowed-tools: Bash
---

Toggle the EngineOS bypass. `$ARGUMENTS` is `on`, `off`, or `status` — empty means `on`.

## What to do

The switch is a marker file in the repo's git dir. Set or clear it with plain git,
so this works in both install modes without resolving a plugin path:

- **on** — `touch "$(git rev-parse --absolute-git-dir)/ENGINEOS_BYPASS"`
- **off** — `rm -f "$(git rev-parse --absolute-git-dir)/ENGINEOS_BYPASS"`
- **status** — `test -f "$(git rev-parse --absolute-git-dir)/ENGINEOS_BYPASS" && echo bypassed || echo active`

If the working directory is not a git repo, say so and stop: there is nowhere to
put the marker, so the hooks cannot be bypassed. Nothing else is affected.

Then report the new state in one line and stop. Do not do any other work in the
same turn — the user toggles the switch, then makes their request.

## What bypass turns off

Setting the marker makes every EngineOS hook exit early:
`route-before-change`, `mark-unrecorded`, `stop-verify`, `record-verify`,
`announce-agent-dispatch`, `announce-agent-return`. The Stop gates stop blocking
and no routing context is injected.

While the switch is on, also drop the prompt-side conventions:

- **No routing.** Skip the router table in `CLAUDE.md`. Emit no `[router]` line.
- **No rule loading.** `rules/*.md` are still in context because `CLAUDE.md`
  imports them at session start and nothing can unload that. Treat them as not
  applicable rather than as standards to enforce.
- **No agent dispatch.** Do the work inline. No coordinators, no specialists, no
  fan-out, no green `diff` banners.
- **No spec gate and no change record.** Non-negotiables 1 and 5 are off.
- **No output-artifact offer.** Answer the request and stop.
- **No verification gate.** Non-negotiable 2 is off; run lint/typecheck only if
  the user asks. Tests were already opt-in (`rules/testing.md`).

## What bypass does NOT turn off

This switch removes EngineOS process, not judgment. Still in force:

- No secrets in code, config, or commits — that is a floor, not an EngineOS rule.
- Confirm destructive or outward-facing actions before taking them.
- The project's own `CLAUDE.md` conventions, if the project has any. Bypass turns
  off the shared constitution, not the repo's own house rules.

## Lifetime

The bypass is cleared at the next `SessionStart` (`ensure-project-layout.sh`
deletes the marker), so it never outlives the session that asked for it. It is
per-repo, not per-session, so a second session started in the same repo clears it.
The failure direction is deliberate: a forgotten bypass expires into gates-ON.

While it is on, the `UserPromptSubmit` hook injects a `BYPASS ACTIVE` reminder on
every turn. Surface that state to the user rather than working silently
unguarded — say `[engineos] bypassed` in your first line.
