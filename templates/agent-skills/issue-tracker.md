# Issue tracker: Local Markdown (EngineOS layout)

Specs and tickets for this repo live as markdown files in the EngineOS standard
layout, not in a hosted tracker. Seeded by `engineos init`; edit freely — init never
overwrites this file.

## Conventions

- PRDs (from `/to-spec`): one file per feature at `docs/prds/YYYY-MM-DD-<feature>.md`.
- Tickets (from `/to-tickets`): one file per ticket at
  `docs/specs/<feature>/tickets/NN-<slug>.md`, numbered from `01`, never a single
  combined tickets file.
- `<feature>` is the same kebab-case slug everywhere: the PRD filename, the tickets
  directory, `.specs/features/<feature>/` (tlc-spec-lean) and the spec index
  `docs/specs/YYYY-MM-DD-<feature>.md`.
- Every ticket carries, near the top:
  - `**Status:**` — exactly one of `ready-for-agent | in-progress | done | blocked`,
    a closed vocabulary (`/engineos:new-feature` marks tickets `done` and resumes
    from this line). New tickets from `/to-tickets` start at `ready-for-agent`;
    a ticket moves to `in-progress` when work starts, to `done` when its checks
    pass, and to `blocked` while it waits on something outside the ticket set
    (say what on the next line).
  - `Blocked by: NN, NN` — the ticket numbers that must be `done` first, or
    `Blocked by: none`.
  - `Closes checks: <id>, <id>` — the check ids from
    `.specs/features/<feature>/checks.md` this ticket proves. A ticket that closes
    no check says why on that line.
- Comments and conversation history append to the bottom of the file under a
  `## Comments` heading.
- `/triage` role strings (`needs-triage`, `needs-info`, `ready-for-human`,
  `wontfix`) never go on the `**Status:**` line; when triage runs, it records the
  role on a separate `Triage:` line.
- Example ticket header:

  ```markdown
  # 03 — Persist orders

  **Status:** ready-for-agent
  Blocked by: 01, 02
  Closes checks: C4, C5
  ```

## When a skill says "publish to the issue tracker"

- A PRD: create `docs/prds/YYYY-MM-DD-<feature>.md` (today's date).
- A ticket: create the next free `NN-<slug>.md` under
  `docs/specs/<feature>/tickets/`, creating the directory if needed.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The developer will normally pass the path or
the ticket number directly; a bare number resolves inside the current feature's
`tickets/` directory.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `docs/specs/<feature>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `docs/specs/<feature>/tickets/NN-<slug>.md`, with the question in
  the body. A `Type:` line records the ticket type
  (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: the `Blocked by:` line above. A ticket is unblocked when every
  ticket it lists is `done`.
- **Frontier**: scan `docs/specs/<feature>/tickets/` for files at
  `**Status:** ready-for-agent` whose blockers are all `done`; first by number wins.
- **Claim**: set `**Status:** in-progress` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set
  `**Status:** done`, then append a context pointer (gist + link) to the map's
  Decisions-so-far in `map.md`.
