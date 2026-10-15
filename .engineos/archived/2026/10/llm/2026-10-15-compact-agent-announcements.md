---
name: 2026-10-15-compact-agent-announcements
status: done
completed: 2026-10-15
domain: llm
spec: docs/specs/2026-10-15-compact-agent-announcements.md
owner: Claude supervisor (side session of the PR139 session)
---

# Compact agent announcements

## What

Agent lifecycle announcements become one line per agent per event instead of a scope line plus a status/task line.

## Why

The user found the two-line format ugly: "summary the cmd to be in line and not two lines per cmd".

## Scope

`rules/subagents.md` announcement section, both announce hook banners and their three test suites, the Codex adapter paragraph, a dated `docs/COMPATIBILITY.md` note and the rebuilt `dist/engineos.cjs`.

Scope revision: compact-v1. Risk: low (presentation text, reversible). Autonomy: A2.
Branch/current PR: `codex/engineos-workflow-updates`, ricardofagmer/engineer-spec-ia-pattern#139.

## Human decisions

- 2026-10-15: user selected "Skip prototype" for compact-v1 after seeing the frozen one-line examples. Prototype declined; COMPACT-1 implementation authorized.
- 2026-10-15: user selected "Run proposed checks" (build, tsc + three announcement suites, validator) for integrated compact-v1.
- Git writes: not authorized in this task; each needs its own approval.
- HITL: no `hitl.reasons` fired (risk low, no external effect, no destructive action).

## Checklist

- [x] Inspect current display contract, hooks, tests and mirrors read-only.
- [x] Freeze the one-line contract in the spec.
- [x] Record preview decision.
- [x] Implement COMPACT-1 and inspect the scoped diff.
- [x] Rebuild `dist/engineos.cjs`.
- [x] Obtain final consent and attach evidence.

## Evidence

2026-10-15, user selected **Run proposed checks** for the integrated compact-v1 working tree (disclosed that the rebuild bundles the other uncommitted `src/` edits too):

- `npm run build`: exit 0; `dist/engineos.cjs` now contains "Never split an agent across two lines" and no `status: starting | task:`.
- `npx tsc -p tsconfig.json`: no diagnostics.
- `node --test` on the three announcement suites in `build/`: 61 tests, 61 pass, 0 fail.
- `scripts/validate-engineos.sh`: passed 116, failed 0.

Not committed; git writes need separate approval.

## What was made

COMPACT-1 (one general-purpose opus worker, integrated by the supervisor after read-only diff inspection):

- `rules/subagents.md` "Visible subagent announcements": one line per agent per event (`starting`, `returned`, `FAILED`), `#<instance>` role suffix replaces the separate instance field, scope/task shortened to about 60 characters; short-role mapping, model truthfulness, color and queued/starting/running rules kept. Section went from 75 to 73 lines.
- `src/hooks/announce-agent-dispatch.ts` and `src/hooks/announce-agent-return.ts`: banner instruction strings only; bounding, telemetry and status floor untouched.
- Three announcement test suites: format expectations updated; the e2e dispatch case now also asserts the old `status: starting | task:` second line is absent.
- `templates/adapters/codex.md` announcement paragraph and a new dated section in `docs/COMPATIBILITY.md`.

Left as historical: older dated COMPATIBILITY section, earlier specs/PRDs/plans, `templates/adapters/subagent-announcement.prototype.html`. `docs/BIG-PICTURE-lifecycle.html` still shows a pre-role-only format (out of scope).

## Changes registered

Files owned by this change (`git status --short`, filtered; the working tree also holds unrelated uncommitted edits from the PR139 merge session and the user, not part of this record):

```
 M dist/engineos.cjs
 M docs/COMPATIBILITY.md
 M rules/subagents.md
 M src/hooks/announce-agent-dispatch.test.ts
 M src/hooks/announce-agent-dispatch.ts
 M src/hooks/announce-agent-return.test.ts
 M src/hooks/announce-agent-return.ts
 M src/hooks/announce-agent.e2e.test.ts
 M templates/adapters/codex.md
?? docs/specs/2026-10-15-compact-agent-announcements.md
?? .engineos/archived/2026/10/llm/2026-10-15-compact-agent-announcements.md (moved from .engineos/changes/)
```

`git diff --stat HEAD` for those files:

```
 dist/engineos.cjs                         | 68 ++++++++++++++++++++++-------
 docs/COMPATIBILITY.md                     | 10 ++++-
 rules/subagents.md                        | 71 +++++++++++++++----------------
 src/hooks/announce-agent-dispatch.test.ts |  4 +-
 src/hooks/announce-agent-dispatch.ts      |  2 +-
 src/hooks/announce-agent-return.test.ts   |  6 +--
 src/hooks/announce-agent-return.ts        |  2 +-
 src/hooks/announce-agent.e2e.test.ts      | 12 +++---
 templates/adapters/codex.md               | 10 +++--
 9 files changed, 115 insertions(+), 70 deletions(-)
```

Notes: `docs/COMPATIBILITY.md` stat includes one pre-existing unrelated deletion near line 770; `dist/engineos.cjs` was rebuilt from the whole working tree, so it also bundles the other uncommitted `src/` edits. Not committed.
