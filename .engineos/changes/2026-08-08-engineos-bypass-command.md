---
name: engineos-bypass-command
status: active
owner: ricardo
spec: none (self-contained tooling addition; >2 files but no new product surface)
domain: devops
---

## What

`/engineos:bypass` — a switch that turns EngineOS off for the session.

```
/engineos:bypass           # off  (routing, rules, agents, gates all stop)
/engineos:bypass status    # active | bypassed
/engineos:bypass off       # back on
```

The switch is a marker file, `ENGINEOS_BYPASS`, written into the repo's git dir —
the same home as the existing `ENGINEOS_UNRECORDED.<sid>` flag, so it is per-repo,
per-worktree, and never committed. `hooks/bypass.sh` is the single source of truth
for resolving and reading it, and is also a small CLI (`bypass.sh on|off|status [cwd]`)
for use outside a Claude session.

Every hook sources it and exits early when the marker is present:
`route-before-change`, `mark-unrecorded`, `stop-verify`, `record-verify`,
`announce-agent-dispatch`, `announce-agent-return`.

`task-scale-advisor` is the deliberate exception: instead of going quiet it injects
`[engineos] BYPASS ACTIVE …` on every turn. `ensure-project-layout` (SessionStart)
deletes the marker before its own git and engineos-repo skips, so the expiry fires
even in repos those skips would exempt.

On the prompt side, `CLAUDE.md` gains a routing rule that short-circuits the whole
router on seeing that banner, and `commands/bypass.md` spells out what is off
(routing, rule loading, agent dispatch, spec gate, change record, verification
gate, artifact offer) and what is not.

## Why

The user asked for a way to skip EngineOS. A prompt-only slash command cannot
deliver that: the hooks fire from `settings.json` regardless of what the command
text says, so the Stop gates would still block a session that had been told it was
bypassed — the worst outcome, since it looks off and behaves on. Real bypass needs
a signal the hooks themselves can read, which is what the marker file is.

Two design choices worth recording:

**It is repo-scoped, not session-scoped.** A slash command runs as a Bash snippet
with no access to `session_id`, so a session-keyed marker could be turned on but
never reliably turned off by the same mechanism. Repo-scoped plus SessionStart
expiry gets the property that actually matters — a bypass never outlives the
session that asked for it — without a key the writer cannot produce.

**The failure direction is gates-ON.** A forgotten bypass expires at the next
session start. A bypass that is on stays loudly visible, because the one hook that
keeps speaking says so every turn. The dangerous failure mode for a governance
switch is not "it was too hard to turn off", it is "it was off and nobody noticed".

## Scope

Added:
- `hooks/bypass.sh` — marker resolution, `engineos_bypass_active`,
  `engineos_bypass_active_for_payload`, CLI mode
- `hooks/test-bypass.sh` — 18 assertions
- `commands/bypass.md` — the slash command
- `templates/cursor/commands/bypass.md` — Cursor mirror (prompt-only; Cursor has
  no hooks to disable and no SessionStart to expire the switch)

Guarded:
- `hooks/route-before-change.sh`, `mark-unrecorded.sh`, `record-verify.sh`,
  `announce-agent-dispatch.sh`, `announce-agent-return.sh` — inline-source guard
  after the `jq` check
- `hooks/stop-verify.sh` — guard keyed on the already-extracted `CWD` so it
  survives the no-`jq` fallback path
- `hooks/task-scale-advisor.sh` — announces the bypass instead of exiting
- `hooks/ensure-project-layout.sh` — expires the marker at SessionStart

Docs:
- `CLAUDE.md` — routing rule: bypass short-circuits the router table
- `README.md` — command + hook table rows
- `docs/START.md` — §3 escape hatch, §5 note, cheat sheet row

No installer changes: `install.sh` / `install.ps1` glob `commands/*.md` and
`chmod +x hooks/*.sh`, so both new files are picked up as-is.

## Checklist

- [x] Marker never committed (lives in the git dir, not the work tree)
- [x] Every hook registered in `hooks/hooks.json` checks the switch
- [x] `stop-verify` guard works on the no-`jq` path
- [x] SessionStart expiry fires inside the engineos repo too
- [x] Bypass is announced every turn, never silent
- [x] Non-git dirs degrade cleanly (CLI exits 1, hooks behave normally)
- [x] Cursor mirror states plainly that it is prompt-only
- [x] `bash -n` + `jq empty` + all seven smoke suites green

## What was made

`hooks/test-bypass.sh` initially reported `pass=17 fail=1` on "record gate still
blocked under bypass". The hook was correct; the assertion was not. It piped the
hook's stdout straight into `jq -r '.decision // "none"'`, but a correctly-silent
hook emits nothing, and `jq` on empty stdin prints nothing — the `// "none"`
fallback needs valid JSON to fire, so the captured value was `""` rather than
`"none"`. Replaced with a `dec()` helper that captures output first and treats
empty as `none`, matching how `test-governance.sh` already handled it.

## Verification

```
bash -n hooks/*.sh install.sh        all parsed OK
jq empty hooks/hooks.json            OK

test-agent-announce.sh   pass=5  fail=0
test-bypass.sh           pass=18 fail=0
test-governance.sh       pass=6  fail=0
test-layout.sh           pass=10 fail=0 skip=1
test-route.sh            pass=21 fail=0
test-task-scale.sh       8 passed, 0 failed
test-verify.sh           pass=9  fail=0
```

`test-governance.sh`, `test-layout.sh` and `test-task-scale.sh` exercise hooks this
change touched and were re-run for regressions, not just the new suite.

## Notes

The marker is checked, not cached. A bypass toggled mid-session takes effect on the
next hook invocation with no restart.

Unwiring a hook in `settings.json` is still possible and still the wrong tool: it
disables the hook permanently and silently. The bypass is the supported way to
skip the gates for one task.
