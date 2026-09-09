# Console hygiene (audit U11)

**Date:** 2026-09-08
**Status:** approved (owner picked "U11 console hygiene" after U5; audit `.engineos/audits/2026-09-08-all.md`, console report MEDIUM/LOW items, plus two LOWs the U5 security pass deferred here)
**Risk:** medium — console only, reversible by revert; the write-path containment and the kernel-argument caps narrow behaviour, nothing widens. No auth surface changes.
**Autonomy:** A2.

## Problem

Server: `GET /api/skills` writes to the draft store (a cross-site GET can seed rows);
`GET /api/effective` passes unbounded `?path=` / `?prompt=` to `scripts/kernel.sh`
(argv-safe, but no length cap and a leading `-` reaches the CLI); `writeSkills` and the
publish route join `sourcePaths[0]` under `REPO_ROOT` with no containment check;
`needsQuoting` misses `: ` and ` #`, so a description with either publishes frontmatter
a YAML parser rejects; `config.ts` claims to be the only `process.cwd()` site while
`store/migrate.ts` reads it too; two Portuguese comments; a doc comment in
`validate/skills.ts` says `usedByAgents` is always `[]` when `relations.ts` populates it.

UI: `<tr role="button">` is invalid ARIA (row children lose their table roles); the
drawer has no focus trap; tab arrow keys move selection but not focus; DOM ids are
hard-coded (`console-search`, `drawer-title`); the drawer mirrors `skill.description`
into state through an effect; stale copy tells the operator an expected state "isn't a
bug"; dead TODOs and an uncalled `ValidationLevelBadge`; the root page is a placeholder
comment; the focus ring is copy-pasted sixteen times with no token.

## Decision

Two disjoint units, one wave, no new dependency. Server first in commit order so the
UI commit can be split into its own PR if the combined diff passes the 400-line
guideline. The three unreferenced read-only handlers (`api/agents`, `api/models`,
`api/effective`) stay: they are file reads with no side effect and the audit's own
remedy for `effective` is a cap, not deletion — recorded as a decision, not an
omission. Rejected: a `POST /api/skills/sync` action for seeding — it adds a write
route to a surface we just gated, when a pure merge on read plus seed-on-first-write
needs none.

## Frozen contracts

### Unit S — server hygiene

Scope: `console/src/app/api/skills/route.ts`, `console/src/app/api/skills/[id]/route.ts`
(PUT lookup only), `console/src/app/api/effective/route.ts`, `console/src/app/api/publish/route.ts`
(containment call only), `console/src/lib/contained-path.ts` (new, + test),
`console/src/lib/entities/skills.ts` (`needsQuoting`, `writeSkills` containment) +
`skills.test.ts`, `console/src/lib/kernel.ts` (argument guard) + `kernel-args.test.ts`
(new), `console/src/lib/store/migrate.ts` (cwd read only), `console/src/lib/config.ts`
(comment), `console/src/lib/publish-lock.ts` (one comment), `console/src/lib/validate/skills.ts`
(doc comment), `console/src/middleware.ts` (header comment only), `console/.gitignore`
(one comment), `console/tsconfig.test.json` (include, if new test files need it).

- `GET /api/skills` is pure: parse skills from disk, list drafts, return one row per
  parsed skill — the draft when one exists (with `usedByAgents` / `dependsOnRules`
  overlaid from the parsed entity, as today), else the parsed entity itself — plus any
  draft whose file is gone (as today). No `upsertEntity` in a GET. Comment says WHY.
- `PUT /api/skills/:id`: `existing = getEntity(id) ?? parseSkills(REPO_ROOT).find(s => s.id === id)`;
  no entity either way → the existing 404. The first write seeds the store; nothing else
  in the handler changes.
- `contained-path.ts`: `export class PathEscapesRootError extends Error` and
  `export function resolveInside(root: string, relative: string): string` — returns
  `path.resolve(root, relative)` when the result equals the resolved root or starts with
  `resolvedRoot + path.sep`, else throws. Pure, tested: plain child, nested child, `..`
  escape, absolute path outside, absolute path inside, root itself.
- `writeSkills`: `absolutePath = resolveInside(basePath, sourcePath)`; the publish
  route's compare at ~line 117 uses the same function so both sides agree. A
  `PathEscapesRootError` propagates as a publish failure through the existing catch.
- `needsQuoting` also returns true for `value.includes(': ')`, `value.includes(' #')`,
  `value.startsWith('#')`, `value.startsWith('- ')`; a test per new case asserting the
  written line is JSON-quoted and round-trips through the existing frontmatter parser.
- `kernel.ts`: `export const MAX_PATH_ARG_CHARS = 512`, `export const MAX_PROMPT_ARG_CHARS = 2000`,
  `export class KernelArgumentError extends Error`, and a pure
  `export function assertKernelArgument(kind: 'path' | 'prompt', value: string): string`
  that throws on length over the cap, on a leading `-`, and on any control character
  (the regex class for U+0000–U+001F and U+007F, written with `\u` escapes). `routePath`
  and `resolveTask` call it. `effective/route.ts` maps `KernelArgumentError` to
  `{ ok: false, reason }` with status 400 (today every error is a 200 body; the argument
  case is the caller's fault and says so). Tests for the guard.
- `migrate.ts`: `DEFAULT_DB_PATH = join(CONSOLE_ROOT, '.data', 'console.sqlite')`
  importing `CONSOLE_ROOT` from `@/lib/config`; `config.ts`'s comment stays true.
- `publish-lock.ts:14` "publicação concorrente" → English; `.gitignore:10` → English.
- `validate/skills.ts` doc comment: the `usedByAgents` warn path is live
  (`relations.ts` resolves it); drop the "always `[]`" sentence.
- `middleware.ts` header: remove the `GET /api/skills` caveat once the GET is pure.
- Tests in scope for: `contained-path`, `needsQuoting`, the kernel argument guard.

### Unit U — UI hygiene

Scope: `console/src/components/**`, `console/src/app/page.tsx`, `console/src/app/providers.tsx`,
`console/src/app/skills/page.tsx`, `console/src/app/skills/skills-page-client.tsx`
(drawer `key` only), `console/src/app/globals.css`, `console/tailwind.config.ts`.

- `ui/table.tsx`: no `role`/`tabIndex`/`onKeyDown` on `<tr>`. `TableRow` keeps
  `onClick` as a pointer convenience; keyboard access comes from a real `<button>` in
  the row's first cell — read `skills-table.tsx` and render the skill name as
  `<button type="button" onClick={...}>` with the row's `onClick` unchanged. Focus
  ring via the shared class below.
- `ui/drawer.tsx`: `useId()` for the title id; a focus trap — `Tab` / `Shift+Tab` on
  the last / first focusable element inside the panel wraps (query
  `a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])`);
  first focus goes to the panel as today. WHY comment: `aria-modal` promises the rest
  of the page is inert and without the trap it is not.
- `ui/tabs.tsx`: arrow keys move focus AND selection — keep a `useRef<Map<string, HTMLButtonElement>>`
  and `.focus()` the next tab after `onChange`; `Home` / `End` jump to first / last;
  ids prefixed with `useId()` so two tablists can coexist.
- `ui/search-input.tsx`: `useId()` for the label/input pair.
- `skill-detail-drawer.tsx`: `useState(skill?.description ?? '')` initialised once,
  the reset `useEffect` deleted; the caller in `skills-page-client.tsx` renders
  `<SkillDetailDrawer key={selectedSkill?.id ?? 'none'} …>` so a different skill
  remounts. Comment says WHY (derive, don't sync). Copy: the "No agents reference this
  skill yet" paragraph becomes "No agent under agents/ declares this skill."; the
  raw-source tab paragraph becomes "The console does not read full file content. Source
  paths:" (no ticket references). Keep everything else.
- `ui/badge.tsx`: delete `ValidationLevelBadge`, `LEVEL_LABEL` and `LEVEL_STYLES` if
  nothing else uses them (verify with a search first).
- `app/providers.tsx` and `app/skills/page.tsx`: delete the two stale TODO comments
  (layout already wraps `<Providers>` and renders the nav).
- `app/page.tsx`: a real landing — `<h1>EngineOS Admin Console</h1>`, one sentence,
  and a list of the three screens as links (`/skills`, `/publish`, `/history`) with a
  one-line description each; drop the "Unit D" comment.
- Focus ring token: `globals.css` gains
  `@layer components { .focus-ring { @apply focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500; } .focus-ring-danger { … outline-red-700 } }`
  and every inline copy of that class group (sixteen sites) becomes `focus-ring` /
  `focus-ring-danger`. The table row drops its ring once the button carries focus.
- `tailwind.config.ts` stays empty unless the `@apply` needs it; no colour token
  migration in this unit (deferred — a design decision, not hygiene).
- No tests in scope: the console's test build compiles `src/lib/**` only; component
  behaviour is verified by `npm run typecheck`, `npm run lint`, `npm run build`.

## Out of scope

Deleting `api/agents` / `api/models` (kept, decision above); colour tokens; the
placeholder `/` becoming a dashboard with data; `docs/CODEBASE_MAP.md` lines 103, 235,
348 claiming the console is not in CI (U9 docs sweep — the console job exists since E03).

## Verification

Orchestrator, once, in `console/`: `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`; root `node dist/engineos.cjs validate`. Agents verify scoped (`npx tsc
--noEmit`, `npx eslint <files>`, and for Unit S `npx tsc -p tsconfig.test.json && node
--test` on its own compiled files) and do not run the gate.
