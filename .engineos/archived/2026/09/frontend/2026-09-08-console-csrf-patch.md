---
name: 2026-09-08-console-csrf-patch
status: done
completed: 2026-09-08
owner: Ricardo Fagmer
spec: docs/specs/2026-09-08-console-csrf-patch.md
domain: frontend
---

## What
Same-origin gate (Next middleware + loopback binding) on the console's write routes;
validated `PUT /api/skills/:id` body with an allowlist parser instead of a cast.

## Why
Audit console report, two HIGH findings: publish/rollback commit and revert with no
origin check (CSRF-able, bound to every interface); PUT body cast desynchronises the
console's `enabled` from the kernel's reading and 500s on non-string descriptions.

## Scope
console/src/middleware.ts, console/src/lib/request-origin.ts (+test),
console/package.json (scripts), console/tsconfig.test.json,
console/src/lib/validate/skill-patch.ts (+test), console/src/app/api/skills/[id]/route.ts,
console/src/lib/entities/types.ts, console/src/components/types.ts,
console/src/components/api/skills.ts, console/src/components/skills/skill-detail-drawer.tsx,
console/src/middleware.test.ts, console/eslint.config.mjs, docs/COMPATIBILITY.md.

## Checklist
- [x] originVerdict + middleware, 403 on cross-site writes, GET untouched
- [x] dev/start bind 127.0.0.1
- [x] parseSkillPatch allowlist; PUT returns 400 on bad JSON / bad shape, no cast left
- [x] SkillPatch defined once
- [x] security-reviewer + critic pass, findings addressed or recorded
- [x] console gate green: typecheck, lint, test, build; root validate green
- [x] COMPATIBILITY.md Unreleased row

## What was made
- `console/src/lib/request-origin.ts`: pure `originVerdict` — rule 0 Host allowlist
  (`127.0.0.1` / `localhost` / `[::1]`, optional numeric port, case-insensitive, every
  method; closes DNS rebinding, which the security pass reproduced end to end against an
  isolated copy: a rebound hostname committed via `POST /api/publish`), then safe methods
  allow, then `Sec-Fetch-Site` (`same-origin` only; `none` refused on writes), then
  `Origin` host vs `Host`, then both-absent allow. 21 cases.
- `console/src/middleware.ts` on `/api/:path*`: `403 { ok:false, reason:'Cross-site request refused.' }`
  on refuse, pass-through otherwise; tested with real `NextRequest` (3 cases); bundled by
  `next build` (`Middleware 34.5 kB`).
- `console/package.json`: `dev` / `start` bind `-H 127.0.0.1` (flag verified in next 15.5.23,
  no env override).
- `console/src/lib/validate/skill-patch.ts`: `parseSkillPatch(entityId, unknown)` allowlist
  (`description: string`, `enabled: boolean`), unknown fields named up to 5 then a tally,
  plain-object check (`__proto__` / `constructor` refused as unknown). 15 cases.
- `PUT /api/skills/:id`: 413 above 16 384 declared bytes, 400 on malformed JSON or shape,
  then the unchanged candidate → `validateSkill` (422) → `upsertEntity`. The `as SkillPatch`
  cast is gone; `SkillPatch` is defined once in `entities/types.ts`, re-exported through
  `components/types.ts`, used by the API client and the drawer.
- `tsconfig.test.json` include widened to the new modules; `eslint.config.mjs` ignores
  `.test-build/**` (a lint run after a local `npm test` read compiled output).
- `docs/COMPATIBILITY.md` Unreleased row for the console write routes.
- Spec amended once (`## Amendment 1`) after the security-reviewer and critic passes.

## Verification
Console gate, once, 2026-09-08 in `console/`: `npm run typecheck` exit 0; `npm run lint`
exit 0 (after adding the `.test-build/**` ignore — the first run read a stale test build
left by an agent, 51 `no-require-imports` on compiled output); `npm test` → 58 tests,
58 pass; `npm run build` exit 0, `Compiled successfully`, `Middleware 34.5 kB`. Root
`node dist/engineos.cjs validate` → `passed 108, failed 0`.
Independent passes: `security-reviewer` PASS-WITH-FINDINGS (HIGH rebinding → fixed by
rule 0; LOW `none` → refused; LOW amplification → cap + 413; MEDIUM no-header local
writes → accepted below; two pre-existing LOWs deferred to U11); `critic` NOT REFUTED
WITH GAPS (middleware untested → `middleware.test.ts`; `HEAD`/`OPTIONS`/null-host
uncovered → cases added; drawer shape duplicate → `SkillPatch`; record scope → fixed).
Live probes by both auditors (curl against `next dev` on an isolated copy): cross-site /
same-site / rebound-host POST → 403; same-origin → handler; every bad PUT body → 400;
CVE-2025-29927 `x-middleware-subrequest` variants → 403.

## Human decisions
2026-09-08, Ricardo Fagmer: chose "U5 console CSRF + PATCH" as the next unit. Risk
classified high (shortcut floor: access control on routes that write and commit);
autonomy A3 — the PR is the human gate before merge; `security-reviewer` and `critic`
passes required by `rules/gates.md` at this tier. HITL reason: `high-risk`.
2026-09-08, Ricardo Fagmer: accepted the residual that a request carrying neither
`Sec-Fetch-Site` nor `Origin` (a non-browser client — another local process or user on
the same host) still reaches the write routes. Reason: single-operator local tool; a
local uid with that access already has the repository itself. A shared-secret token was
offered as a separate unit and not taken. Disclosed in `docs/COMPATIBILITY.md`.

## Release gate (rules/gates.md, risk high)
- Owner: Ricardo Fagmer. Rollback: `git revert` of the PR; no data migration, no
  persisted state format changes.
- Residual risks accepted: no-header local writes (above); the loopback binding lives in
  the npm scripts only (`npx next dev` binds every interface — the middleware is the wall
  that still holds); 413 reads the declared `content-length`, chunked bodies rely on the
  bounded issue list; `GET /api/skills` still writes to the draft store (U11);
  `needsQuoting` misses `: ` and ` #` (U11).
- Watch after merge: operator reports of `Cross-site request refused.` from the console's
  own UI (would mean a legitimate origin shape was refused — none found in review) for
  the first two weeks of use.

## Changes registered
- d78f8a7 docs(spec): console same-origin gate and validated PUT body (audit U5)
- 9275326 docs(spec): U5 amendment 1 — host allowlist, none refused, caps, middleware test
- 38fc33b fix(console): same-origin gate on write routes, validated PUT body (this record archived in the same commit)
