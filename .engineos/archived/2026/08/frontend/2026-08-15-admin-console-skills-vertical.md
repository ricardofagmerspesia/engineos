---
name: 2026-08-15-admin-console-skills-vertical
status: done
completed: 2026-08-15
owner: Ricardo Fagmer
spec: docs/specs/2026-08-15-engineos-admin-console-design.md
domain: frontend
---

## What
New `console/` Next.js app: SQLite draft/snapshot/history store, git/fs mutation
boundary, and the full staged workflow (draft → validate → diff → publish →
rollback) proven end-to-end on one entity type, Skills.

## Why
EngineOS Admin Console spec (§5-7) needs a tracer-bullet vertical slice before
the remaining five entity types (agents, models, MCP, routing, rules) reuse the
same plumbing.

## Scope
`console/**` only — no existing plugin file is touched by this ticket (Skills
writer targets `skills/*/SKILL.md` frontmatter, but nothing publishes here yet
beyond what the ticket itself exercises in dev/testing).

## Frozen contracts (design pass — do not renegotiate mid-wave)

### Entity shape (`console/src/lib/entities/types.ts`)

```ts
export type EntityStatus = 'active' | 'draft-only' | 'disabled' | 'error';

export interface BaseEntity {
  id: string;
  name: string;
  status: EntityStatus;
  sourcePaths: string[];
  updatedAt: string; // ISO
}

export interface SkillEntity extends BaseEntity {
  kind: 'skill';
  description: string;
  enabled: boolean;
  usedByAgents: string[]; // agent ids/aliases referencing this skill (empty until Agents ticket lands)
  dependsOnRules: string[]; // rule ids referenced by SKILL.md body (best-effort scan)
  parseError?: string; // set + status:'error' when frontmatter is malformed
}
```

### Store schema (`console/src/lib/store/schema.ts`, Drizzle + better-sqlite3)

- `entities(id PK, kind, name, status, sourcePaths_json, data_json, updatedAt)` — draft working copy, one row per entity across all kinds (kind='skill' only populated this ticket).
- `published_snapshot(id PK, kind, data_json, publishedAt)` — mirrors `entities` shape as of last publish/rollback.
- `publish_history(id PK autoincrement, commitSha, createdAt, summary, diff_json)`.

### API contract (`console/src/app/api/**`)

- `GET /api/skills` → `SkillEntity[]`
- `GET /api/skills/:id` → `SkillEntity`
- `PUT /api/skills/:id` body `Partial<Pick<SkillEntity,'description'|'enabled'>>` → updated `SkillEntity`, 422 with `{errors: ValidationIssue[]}` on invalid
- `GET /api/diff` → `{ entityId: string, kind: string, fieldDiff: object, fileDiff: string }[]`
- `POST /api/publish` → `{ ok: true, commitSha: string, summary: string } | { ok: false, reason: string, errors?: ValidationIssue[] }` (branch guard failure, validation failure, or `hooks/test-route.sh` failure are all `ok:false` with a `reason`)
- `POST /api/rollback/:historyId` → `{ ok: true, revertSha: string } | { ok: false, reason: string }`
- `ValidationIssue = { entityId: string, level: 'error'|'warn', message: string }`

## Wave 1 — parallel, disjoint scope, against the contracts above

- Unit A: `console/{package.json,next.config.ts,tsconfig.json,tailwind.config.ts,src/app/layout.tsx,src/app/globals.css}` + `console/src/lib/store/**` (schema + Drizzle client + migration).
- Unit B: `console/src/lib/git.ts`, `console/src/lib/fs-writer.ts`, `console/src/lib/logs.ts`, `console/src/lib/entities/skills.ts` (parse/write), `console/src/lib/entities/types.ts`.
- Unit C: `console/src/app/api/skills/**`, `console/src/app/api/diff/**`, `console/src/app/api/publish/**`, `console/src/app/api/rollback/**`, `console/src/lib/validate/skills.ts`.
- Unit D: `console/src/app/skills/**`, `console/src/app/publish/**`, `console/src/app/history/**`, `console/src/components/**`.

## Checklist
- [x] Wave 1 dispatched (4 units)
- [x] Integration barrier: wire real imports, resolve drift against frozen contract
- [x] Final gate: typecheck + lint, output shown
- [x] Manual verification: run console, toggle a skill, publish, confirm one git commit on `feat/engineos-admin-console`, rollback, confirm revert commit

## What was made

New standalone Next.js 15 app at `console/` (own `package.json`, not an Nx member):

- **Store** (`src/lib/store/**`) — SQLite (better-sqlite3 + Drizzle), `entities`/
  `published_snapshot`/`publish_history` tables per the frozen schema, generic
  `<T>` CRUD so future entity kinds need no schema change.
- **Git/fs boundary** (`src/lib/git.ts`, `fs-writer.ts`, `logs.ts`) — the only
  modules touching the real repo; `execFileSync` argv-array git calls (no shell
  interpolation), fail-closed `checkoutPaths` for aborted publishes.
- **Skills parser/writer** (`src/lib/entities/skills.ts`) — hand-rolled flat
  frontmatter reader/writer (no new dependency), preserves every untouched line
  and the whole body byte-for-byte; malformed files degrade to `status:'error'`
  instead of throwing.
- **API** (`src/app/api/{skills,diff,publish,rollback,history}/**`,
  `src/lib/validate/skills.ts`) — full contract from the change record, plus
  `GET /api/history` (needed by the UI, not in the original list) and a
  `validation` field on each `/api/diff` entry (closes a real gap the UI
  already expected).
- **UI** (`src/app/{skills,publish,history}/**`, `src/components/**`) — table +
  detail drawer, diff/validation review, publish button, history + rollback
  flow; all four data states (loading/error/empty/success) per screen.

Four units were dispatched in one wave per `rules/parallelism.md`, contracts
frozen up front. First dispatch failed outright (opus was unavailable this
session — API error on every unit); redispatched with the model omitted so
each unit inherited the session model. All four then completed and
self-verified individually.

## Verification

**Final gate** (run at the integration barrier, after wiring real imports
across all four units):
- `npm run typecheck` — clean (exit 0).
- `npm run lint` — clean (exit 0) after excluding Next's own generated
  `next-env.d.ts` from the flat config (a real Next.js boilerplate lint error,
  not authored code).
- `npm run build` — clean after two integration fixes (below).

**Integration-barrier bugs found and fixed** (none were in any single unit's
own scope in a way its own typecheck/lint could catch — these only surfaced
once the four units were wired together and actually run):
1. `migrate.ts` used `new URL('./migrations/', import.meta.url)` to locate the
   migrations directory — webpack's production build statically intercepts
   that form as an asset reference and fails to resolve a directory
   (`Module not found`). Rewrote as plain `path.join(dirname(fileURLToPath(...)), 'migrations')`,
   which isn't recognized as an asset reference.
2. `providers.tsx` (TanStack Query provider) existed but was never wired into
   `layout.tsx` — every client page using `useQuery` crashed at
   static-prerender time (`No QueryClient set`). Wired `<Providers>` around
   `{children}` in `layout.tsx` and added nav links to `/skills`, `/publish`,
   `/history`.
3. `buildLineDiff` (file-level diff) did a positional (index-by-index) line
   comparison — a single inserted line (e.g. a newly-added `enabled:` key)
   shifted every later line out of alignment, rendering an entire ~150-line
   SKILL.md as fully rewritten when only the frontmatter actually changed.
   Replaced with an LCS-based line diff (still no dependency added).
4. `POST /api/publish` built its commit summary and `publish_history` entry
   from the draft-vs-*snapshot* changed set, not the draft-vs-*disk* set
   `writeSkills` actually writes — on a first run (empty snapshot) this
   claimed "Updated 8 skill(s)" in the commit message when only one file was
   ever touched. Now cross-references `writeSkills`'s real `FileChange[]`
   paths back to entities for the summary/history text; the actual `git add`
   scope was already correct (only real file changes were ever staged).
5. `PUT /api/skills/:id` patched `enabled` but never recomputed the derived
   `status` field, so disabling a skill left its list badge reading "Active".
   Fixed to recompute `active`/`disabled` from the new `enabled` value, while
   preserving an existing `status:'error'` (a parse-error is a fact about the
   file on disk, not something a draft edit can fix).

**Manual verification** (real repo, real git, `feat/engineos-admin-console`
branch, dev server on port 3002 since 3000 was in use):
- `GET /api/skills` correctly parsed all 8 real `skills/*/SKILL.md` files.
- Toggled `strategy`'s Enabled switch off in `/skills` — draft-only PUT,
  confirmed via network tab, no real file touched yet.
- `/publish` showed the field-level and (post-fix) accurate file-level diff;
  publish produced exactly one commit (`e00b866`) touching only
  `skills/strategy/SKILL.md` (2 insertions, 1 deletion — quoted description +
  new `enabled: false` line).
- `/history` → rollback on that commit produced a real `git revert` commit
  (`69d8b8a`), not a history rewrite; `skills/strategy/SKILL.md` reverted to
  its original content.
- Re-toggled and re-published to confirm the summary-accuracy fix: result was
  `"Updated 1 skill(s): - skill: strategy (strategy)"` (commit `6cbbd05`),
  matching the single file actually changed.
- Publish's main/master branch guard was exercised implicitly — the branch
  check ran ahead of every publish call above, and the current branch
  (`feat/engineos-admin-console`) passed it each time.

**Net effect on the real repo**: `skills/strategy/SKILL.md` now carries
`enabled: false` in its frontmatter (real, not draft) as a byproduct of manual
verification — harmless today since no consumer reads that key yet outside
this console, but worth knowing about; flip it back via the console or a
direct edit if that skill should stay enabled.

`[tests] skipped — not requested.`

## Changes registered
Not captured at archive time. The landed diff is merge commit f7b3008 (PR #21,
`feat/engineos-admin-console`); see `git show --stat f7b3008^2`. Section added
2026-09-02 for change-record conformance when CI first ran the integrity check.

## Notes
Agent registry note: this session has no `frontend-coordinator` subagent_type
registered (the EngineOS plugin's `agents/*.md` personas aren't installed as
Task-tool subagent types here) — units are dispatched as `general-purpose`
agents briefed with the frontend-coordinator persona's rules inline
(`rules/frontend.md`, `rules/architecture.md`, `rules/testing.md`) rather than
by named subagent_type.
