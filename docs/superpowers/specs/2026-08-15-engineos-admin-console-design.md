# EngineOS Admin Console — Design

Date: 2026-08-15
Status: proposed

## 1. Problem

EngineOS today is a Claude Code plugin made entirely of files: 18 agent personas
(`agents/*.md`), 5 skills (`skills/*/SKILL.md`), 16 rule files (`rules/*.md`), a
router table in `CLAUDE.md`, a second file-pattern router in
`hooks/routing-map.sh`, and an MCP server template (`templates/mcp.template.json`).
There is no dashboard: answering "which model runs this skill" or "which routes
can invoke this MCP" means grepping across six directories by hand, and the two
routing surfaces (`CLAUDE.md` table, `routing-map.sh`) drift silently unless a
human keeps them in sync (both files say so in their own comments).

There is also no staged-change workflow. Every edit to a rule, agent binding, or
router row is a direct file edit — nothing to review, diff, or roll back except
raw git history mixed in with unrelated commits.

## 2. Goal

A local admin console (new `console/` app, Next.js) that:

- Reads all six capability types — Skills, Agents (Actions/Tools), Models,
  MCP entries, Routing, Rules — into one browsable, searchable, cross-linked
  view with a dependency graph.
- Lets an operator edit them in a **draft** that never touches the real files.
- Validates the draft (broken references, missing env vars, orphaned entities,
  routing-surface drift) before it can publish.
- Shows a diff (field-level and file-level) of everything a publish would change.
- **Publishes** by writing the real files and making one git commit — the only
  moment the running plugin's behavior can change.
- Keeps history and supports **rollback** via `git revert` (never rewrites
  history).

Non-goals (this spec): multi-user auth/login (single local operator; "who
changed what" is the git commit author) — per-project override layer on top of
the shared plugin (this spec edits the plugin source itself; an overrides layer
is a future spec that can reuse this entity model) — regenerating agent/skill
prose bodies from structured fields (only metadata is structured; bodies stay
hand-edited markdown).

## 3. Scope decisions

Made during design, recorded here so they aren't re-litigated:

- **Config target**: this repo's own plugin source (`agents/`, `skills/`,
  `rules/`, `CLAUDE.md`, `hooks/routing-map.sh`, `templates/mcp.template.json`).
  Not a per-project adoption/override layer.
- **Routing scope**: both surfaces. `routing.json` becomes the real source of
  truth for file-pattern routing; `hooks/routing-map.sh` is generated from it on
  publish, gated by the existing `hooks/test-route.sh` suite. The `CLAUDE.md`
  intent-router table is edited directly (it's already the human/LLM-facing
  form, no generation step needed).
- **Draft lifecycle**: persists across app restarts (SQLite file on disk) —
  reopening the console shows unpublished edits from a prior session.
- **Publish branch policy**: publish refuses to run on `main`/`master`
  (`rules/git.md`: never commit to main). The operator checks out a feature
  branch first; the console does not create branches on its own.
- **Tests**: opt-in per `rules/verification.md`. Recommended-but-not-built-here:
  round-trip tests for the six parse/write modules, and a test for publish's
  fail-closed behavior when `hooks/test-route.sh` fails. `[tests] skipped — not
  requested`.

## 4. Entities & relationships

Six entity tables, each carrying `id, name, status, sourcePaths[], updatedAt`
plus:

| Entity | Type-specific fields | Key relationships |
|---|---|---|
| Skill | `description`, `enabled` (new field, written to SKILL.md frontmatter on publish) | `usedByAgents[]`, `dependsOnRules[]` |
| Agent (Action/Tool) | `description`, `tools[]`, `model` (tier), `alias` | `boundModel`, `loadsRules[]`, `usesSkills[]`, appears in `routerRows[]` |
| Model tier | `tier`, `boundModelName` | `usedByAgents[]` |
| MCP entry | `when`, `transport`, `command`/`url`, `envVars[]`, `enabled`, `verifyNeeded` | `invokableByAgents[]` (new field — the template has no such link today) |
| Router row (Routing) | `intentSignals`, `loadedRules[]`, `loadedSkills[]`, `dispatchedAgent`, `fallback?` | → agent, → skills, → rules; file-pattern rows also back the generated `routing-map.sh` case statement |
| Rule | `title`, `alwaysOn` (bool), `body` | `crossReferences[]` |

Validation, run on every edit (advisory) and again at publish (blocking on error):

- **Error** — router row references a non-existent agent alias; agent
  references a missing skill/rule path; enabled MCP entry missing a required
  env var; a rule cross-reference points at a file not loaded by every row that
  needs it (the "closed load list" rule `CLAUDE.md` already states by hand).
- **Warn** — orphaned skill/agent/MCP entry (zero incoming references); model
  tier bound to a model name outside the known provider list; a file-pattern
  router row whose generated `routing-map.sh` output would disagree with the
  `CLAUDE.md` table for the same pattern.

## 5. Architecture

`console/` at repo root, Next.js App Router (per `rules/frontend.md`: RSC-first,
TanStack Query for client fetches, Tailwind).

- `console/src/lib/entities/{skills,agents,models,mcp,routing,rules}.ts` — one
  parser+writer pair per type: `parse(basePath) -> Entity[]`,
  `write(basePath, Entity[]) -> FileChange[]`. Pure, base-path-injected, so unit
  tests (if later requested) never touch the real repo.
- `console/src/lib/store/` — SQLite (better-sqlite3 + Drizzle, matching this
  project's own stack preferences) holding three tables: `entities` (the
  draft), `published_snapshot` (state as of the last publish/rollback, refreshed
  after each), `publish_history` (commit sha, timestamp, entity summary, diff).
- `console/src/app/api/*` route handlers: CRUD per entity type against the
  draft store; `GET /diff` (draft vs snapshot, both field-level and file-level);
  `POST /publish`; `POST /rollback/:historyId`.
- `console/src/lib/git.ts` + `console/src/lib/fs-writer.ts` — the only modules
  allowed to touch the real filesystem/git. Every other module reads/writes the
  draft store or already-parsed entities.
- `console/src/lib/logs.ts` — every real mutation (write, commit, revert,
  `checkout --`) logged with path/action/result/timestamp, independent of
  `publish_history`, so a failed attempt stays inspectable even though nothing
  published.

## 6. Staged workflow

1. **Edit** — PUT against `/api/{entity}/:id` touches only the draft store.
   Pending-change count = draft rows whose hash differs from
   `published_snapshot`.
2. **Validate** — inline on every edit; authoritative again at publish.
3. **Diff** — `GET /api/diff`: field-level diff per changed entity, plus the
   file-level unified diff each entity's `write()` would produce, computed
   against a scratch copy — the real working tree is never touched to compute
   a diff.
4. **Publish**:
   - Branch guard: refuse if `git branch --show-current` is `main`/`master`.
   - Re-validate; abort (no writes at all) on any error.
   - Run each entity's `write()` against the real files.
   - Regenerate `hooks/routing-map.sh` from the routing entities (template
     preserves existing hand-written comments — e.g. "mobile MUST precede
     frontend" — as fixed prose blocks keyed to row ids, not regenerated text).
   - Run `hooks/test-route.sh`. On failure: `git checkout --` every path just
     written, report which router row broke it, commit nothing.
   - `git add` (only the changed paths, never `-A`) + one Conventional Commits
     commit (`rules/git.md`), body lists changed entities.
   - Refresh `published_snapshot` from the committed files; append a
     `publish_history` row.
5. **Rollback** — pick a `publish_history` row → `git revert <sha>` → re-run
   `hooks/test-route.sh` as a sanity check → refresh `published_snapshot`.

Previous published state is always what's on disk when publish returns,
success or failure — the fail-closed `checkout --` in step 4 runs before any
`git commit` is attempted.

## 7. Frontend screens

- `/` — overview: entity counts by status, pending-change count, drift
  warnings (routing-surface mismatch, missing `jq`), "Review & Publish" CTA.
- `/skills`, `/agents`, `/models`, `/mcp`, `/routing`, `/rules` — list screens:
  search, status/enabled filter, inline toggle where applicable, row → detail
  drawer.
- **Detail drawer** (shared component): editable metadata fields, a
  Relationships tab (clickable chips to related entities), a Raw Source tab
  (read-only file content as of last publish).
- `/graph` — dependency graph, filterable by entity type; node click opens the
  same detail drawer. Answers the ask's example questions directly (model that
  executes a skill = follow Skill → usedByAgents → boundModel).
- `/publish` — changed entities with expandable diffs, validation
  errors/warnings per entity, branch-guard banner, single Publish button
  (disabled while any error is unresolved).
- `/history` — reverse-chronological publishes, expandable diff per entry,
  "Rollback to here" with a confirmation step (git-reverting action).

All four data states (loading/error/empty/success) designed per screen —
`rules/frontend.md`.

## 8. Known gaps / deferred

- No per-project override layer — this console edits the shared plugin source
  only. A future spec can reuse the entity/relationship model for that.
- No auth — local single-operator tool. If this ever needs to run
  multi-operator or hosted, auth and concurrent-draft handling are a separate
  design.
- Agent/skill/rule **prose bodies** are hand-edited markdown, not generated
  from structured fields — only metadata (frontmatter, router rows, MCP
  entries) is structured and diffable at the field level.
