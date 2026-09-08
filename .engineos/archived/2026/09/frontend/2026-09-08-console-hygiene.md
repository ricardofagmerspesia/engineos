---
name: 2026-09-08-console-hygiene
status: done
owner: Ricardo Fagmer
spec: docs/specs/2026-09-08-console-hygiene.md
domain: frontend
---

## What
Console hygiene from the audit: pure GET, seed-on-write, write-path containment,
kernel argument caps, YAML-safe frontmatter quoting, true config invariant, English
comments; UI accessibility floor (valid table semantics, focus trap, tabs focus
follow, generated ids), derived drawer state, dead code and stale copy removed,
focus-ring token.

## Why
Audit console report MEDIUM/LOW findings plus two LOWs deferred from U5
(`GET /api/skills` store write, `needsQuoting`).

## Scope
See spec Unit S and Unit U file lists.

## Checklist
- [x] GET /api/skills pure; PUT seeds on first write
- [x] resolveInside on writeSkills + publish compare
- [x] kernel argument guard + effective route 400
- [x] needsQuoting covers ': ', ' #', leading '#' and '- '
- [x] cwd read only in config.ts; English comments
- [x] tr has no role=button; drawer focus trap; tabs focus follows; useId
- [x] drawer derives, key remount; stale copy, TODOs, dead badge gone; landing page
- [x] focus-ring token replaces inline copies
- [x] console gate green; root validate green

## What was made
Unit S (server, commit 11fea84, PR `chore/console-hygiene`): `GET /api/skills` is a
pure read merging parsed skills with drafts; `PUT /api/skills/:id` falls back to the
disk parse and seeds the store on first write. New `lib/contained-path.ts`
(`resolveInside`, `PathEscapesRootError`) used by `writeSkills` and all three path
compares in the publish route. `lib/kernel.ts` gains `assertKernelArgument` (512 /
2000 char caps, no leading `-`, no control chars) called by `routePath` and
`resolveTask`; `GET /api/effective` answers 400 on `KernelArgumentError`.
`needsQuoting` also quotes `: `, ` #`, leading `#` and `- `. `migrate.ts` anchors on
`CONSOLE_ROOT`. English comments in `publish-lock.ts` and `.gitignore`; stale doc
comments in `validate/skills.ts`, `middleware.ts`, `request-origin.ts` corrected.
Four COMPATIBILITY.md Unreleased rows. Tests: 8 contained-path, 12 kernel-args,
6 needsQuoting/writeSkills (console suite 82).

Unit U (UI, this commit, PR `chore/console-hygiene-ui`): `TableRow` drops
`role="button"`/`tabIndex`/`onKeyDown`; the skill name renders as a real
`<button>`. Drawer: `useId()` title, Tab/Shift+Tab focus trap. Tabs: roving focus on
Arrow/Home/End, `idPrefix` + `label` props. `SearchInput` uses `useId()`.
`ValidationLevelBadge` and its tables deleted (uncalled). Drawer description state
seeded once, reset effect deleted, `key={selectedSkill?.id}` at the call site. Stale
copy replaced; two TODOs deleted; `/` is a real landing page linking the three
screens. `globals.css` defines `focus-ring`, `focus-ring-inset`,
`focus-ring-danger`; all sixteen inline copies replaced (twelve in components, four in
the app page clients). `tailwind.config.ts` untouched (the `@apply` compiled).

Deviations from spec, accepted: containment applied at three publish sites, not one
(the compare must agree with the rebase); a third token `focus-ring-inset` for the two
`-2px` sites; `Tabs` takes `idPrefix`/`label` props because `TabPanel` is a sibling,
not a child. Deferred: `skill-detail-drawer.tsx` textarea id still literal;
`detectBaseConflicts` read path still `path.join` (hash compare only, write refuses
first); `GET /api/skills/:id` 404s without a draft (no caller).

## Verification
2026-09-08, orchestrator, once at the barrier, in `console/`: `npm run typecheck`
exit 0; `npm run lint` exit 0; `npm test` tests 82 pass 82 fail 0; `npm run build`
exit 0 (middleware 34.5 kB, all routes compiled). Root `node dist/engineos.cjs
validate`: passed 108, failed 0. Focus trap and roving focus verified by typecheck
and lint only; no component test harness exists (tests out of scope for Unit U).

## Human decisions
2026-09-08, Ricardo Fagmer: chose "U11 console hygiene" as the next unit. Risk
medium, autonomy A2, no HITL reason fires. Decision recorded: unreferenced read-only
handlers `api/agents`, `api/models`, `api/effective` are kept (file reads, no side
effect; `effective` gets caps).

## Changes registered
- 11fea84 fix(console): pure GET, path containment, kernel arg caps, YAML-safe quoting
- (this commit) refactor(console): a11y floor, derived drawer state, focus-ring token, landing page

## Release gate
Owner: Ricardo Fagmer. Rollback: revert the two commits; no schema, no data
migration, no external effect. Residual risks: focus trap unverified at runtime;
`detectBaseConflicts` still joins without containment (read-only, hash compare).
Watch after release: the first publish from a draft whose description carries `: `
must produce a JSON-quoted line and a clean `git diff`.
