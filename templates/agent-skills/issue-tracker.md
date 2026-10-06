# Issue tracker: Local Markdown (EngineOS layout)

Local Markdown, not hosted tickets. Seeded by engineos init; edits are preserved.

## Conventions

- PRDs: docs/prds/YYYY-MM-DD-<feature>.md, one per feature.
- Tickets: docs/specs/<feature>/tickets/NN-<slug>.md, numbered from 01, one per file.
- Same kebab <feature> slug in PRD, ticket directory, .specs/features/<feature>/
  and docs/specs/YYYY-MM-DD-<feature>.md index.
- Ticket header: **Status:** ready-for-agent | in-progress | done | blocked.
  New tickets start ready-for-agent; claim → in-progress; checks pass → done;
  external dependency → blocked with reason on next line. Closed vocabulary.
- Blocked by: NN, NN or none; listed tickets must be done first.
- Closes checks: <ids> from .specs/features/<feature>/checks.md; no check → explain why.
- Append conversation under ## Comments.
- Triage roles needs-triage/needs-info/ready-for-human/wontfix belong on Triage:,
  never **Status:**.

```markdown
# 03 — Persist orders

**Status:** ready-for-agent
Blocked by: 01, 02
Closes checks: C4, C5
```

## When a skill says "publish to the issue tracker"

Create today's PRD path above, or next free NN ticket; create directories as needed.

## When a skill says "fetch the relevant ticket"

Read its referenced path. Bare ticket numbers resolve in current feature's tickets/.

## Wayfinding operations

For /wayfinder, map = docs/specs/<feature>/map.md (Notes/Decisions-so-far/Fog);
children use ticket paths above and carry their question and Type:
research/prototype/grilling/task.

- Blocking: all listed Blocked by tickets done.
- Frontier: ready-for-agent with all blockers done, lowest number first.
- Claim: save **Status:** in-progress before work.
- Resolve: append ## Answer, set **Status:** done, then append gist+link pointer
  to map.md Decisions-so-far.
