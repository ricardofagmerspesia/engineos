# Console: same-origin gate on write routes, validated PUT body (audit U5)

**Date:** 2026-09-08
**Status:** approved (owner picked "U5 console CSRF + PATCH" after wave 2; audit `.engineos/audits/2026-09-08-all.md`, console report)
**Risk:** high — shortcut floor: the change is an access-control decision on routes that write files and run `git commit` / `git revert` in the operator's repository. Blast radius is the operator's working tree; reversible by `git revert` of the PR.
**Autonomy:** A3 — owner approved the unit; `security-reviewer` and `critic` pass over the diff before the gate; PR is the human gate before merge.

## Problem

1. `POST /api/publish` and `POST /api/rollback/:historyId` commit and revert in the
   repository with no authentication and no origin check, and there is no
   `middleware.ts`. Publish takes no body, so a cross-site `<form method=post>` or
   `fetch(..., {mode:'no-cors'})` from any page open while `next dev` runs reaches the
   handler without a preflight. `next dev` / `next start` bind every interface by
   default, so "local single-operator tool" is not enforced by anything.
2. `PUT /api/skills/:id` casts the body: `(await request.json()) as SkillPatch`.
   `{"enabled":"false"}` is stored as a string, `serializeValue` quotes it, publish
   writes `enabled: "false"`, and `src/kernel/skill-state.ts` reads a non-boolean as
   enabled while the console shows Disabled. `{"description":123}` reaches
   `validateSkill` and throws (`.trim` on a number) → unhandled 500. Malformed JSON →
   500. Unknown keys pass through the spread.

## Decision

Two disjoint units in one wave, one agent each; no new dependency (`rules/base.md`: a
schema library for two fields is a dependency for what 20 lines do).

Rejected: session auth / a token for the console — it is a local tool with no user
model, and the threat is the browser being tricked, not a stranger with credentials;
a same-origin check plus loopback binding closes that. Rejected: zod — not a console
dependency today and the body has exactly two optional fields.

## Frozen contracts

### Unit A — same-origin gate (`console/src/middleware.ts` (new), `console/src/lib/request-origin.ts` (new), `console/src/lib/request-origin.test.ts` (new), `console/package.json` scripts only, `console/tsconfig.test.json` include list only)

- `request-origin.ts`, pure, no Next import:
  `export type OriginVerdict = 'allow' | 'refuse';`
  `export interface OriginSignals { method: string; secFetchSite: string | null; origin: string | null; host: string | null; }`
  `export function originVerdict(signals: OriginSignals): OriginVerdict`.
  Rules, in order: methods `GET`, `HEAD`, `OPTIONS` → `allow` (reads are not the
  threat; the handlers that write are all `POST`/`PUT`). `Sec-Fetch-Site` present:
  `same-origin` or `none` → `allow`; anything else (`cross-site`, `same-site`) →
  `refuse`. Header absent and `Origin` present: `allow` only if the `Origin` URL's host
  (including port) equals `host`; a malformed `Origin` → `refuse`. Both absent →
  `allow` (a non-browser client cannot be CSRF'd; every browser that can be sends
  `Sec-Fetch-Site`). The WHY comment says exactly that.
- `middleware.ts`: `export const config = { matcher: '/api/:path*' }`; builds
  `OriginSignals` from `request.method` and `request.headers`; on `refuse` returns
  `NextResponse.json({ ok: false, reason: 'Cross-site request refused.' }, { status: 403 })`;
  otherwise `NextResponse.next()`. Nothing else.
- `package.json`: `"dev": "next dev -H 127.0.0.1"`, `"start": "next start -H 127.0.0.1"`
  — loopback only; a comment is impossible in JSON, so the WHY lives in the
  `middleware.ts` header comment ("binding is the first wall, origin the second").
- `tsconfig.test.json` `include` gains `src/lib/request-origin.ts`,
  `src/lib/request-origin.test.ts`.
- Tests (in scope, `node --test` under `.test-build` exactly like `publish-lock.test.ts`):
  GET cross-site → allow; POST same-origin → allow; POST none → allow; POST cross-site →
  refuse; POST same-site → refuse; POST no Sec-Fetch-Site, Origin host equal → allow;
  Origin host differs (other port) → refuse; malformed Origin → refuse; both absent →
  allow. Method comparison is case-insensitive only if `request.method` can be
  lowercase — it cannot in Next, so compare exact uppercase and say so.

### Unit B — validated PUT body (`console/src/lib/validate/skill-patch.ts` (new), `console/src/lib/validate/skill-patch.test.ts` (new), `console/src/app/api/skills/[id]/route.ts`, `console/src/lib/entities/types.ts`, `console/src/components/api/skills.ts`, `console/src/components/types.ts` only if it re-exports entity types)

- `types.ts` (entities): `export type SkillPatch = Partial<Pick<SkillEntity, 'description' | 'enabled'>>;`
  — the one definition. The route and `components/api/skills.ts` import it; their
  local duplicates go away.
- `skill-patch.ts`, pure:
  `export type SkillPatchParse = { ok: true; patch: SkillPatch } | { ok: false; issues: ValidationIssue[] };`
  `export function parseSkillPatch(entityId: string, input: unknown): SkillPatchParse`.
  Refuses (level `error`, one issue per defect, `entityId` set): input not a plain
  object (null, array, primitive) → "Patch body must be a JSON object."; a key outside
  `description` / `enabled` → "Unknown field: <key>." (allowlist — mass assignment is
  blocked here, not by the spread); `description` present and not a string →
  "description must be a string."; `enabled` present and not a boolean → "enabled must
  be a boolean." (the string `"false"` is the case the audit found — name it in the
  test); no recognised field present → "Patch carries no field to apply.". Length and
  emptiness of `description` stay in `validateSkill`, which runs after — do not
  duplicate them.
- Route `PUT`: `let body: unknown; try { body = await request.json(); } catch { return 400 with issues [{entityId:id, level:'error', message:'Request body is not valid JSON.'}] }`;
  then `parseSkillPatch(id, body)`; `ok: false` → `400 { errors }`; `ok: true` → the
  existing candidate construction from `parse.patch`, unchanged from there on
  (`validateSkill` → 422, `upsertEntity`). The response type union gains nothing new
  (`{ errors: ValidationIssue[] }` already exists). The `as SkillPatch` cast is gone.
- `tsconfig.test.json` is Unit A's file: Unit B does NOT edit it. Unit B's test files
  are picked up because the include list will carry `src/lib/validate/**/*.ts` — Unit A
  adds that glob together with its own entries. Unit B verifies its tests by compiling
  with an explicit `npx tsc -p tsconfig.test.json` AFTER Unit A lands, or by a scratch
  tsconfig it deletes — say which under Verification.
- Tests: each refusal above (including `enabled: "false"` and `description: 123`),
  unknown key `sourcePaths`, array input, null input, empty object; acceptance of
  `{enabled:false}`, `{description:'x'}`, both. `issues` compared with `deepEqual`.

### Orchestrator

`security-reviewer` (AUDIT, the whole console diff) and `critic` (AUDIT, refute
"CSRF closed, PUT validated") in one wave after the units land; console gate once:
`npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` in
`console/`; `docs/COMPATIBILITY.md` Unreleased row (console write routes: tightened —
cross-site writes refused, loopback binding); record, commit, PR stacked on #79.

## Out of scope

`GET /api/skills` mutating the store, unreferenced `api/agents|models|effective`
handlers and the `?path=`/`?prompt=` cap, write-path containment under `REPO_ROOT`,
accessibility gaps, stale copy — U11 console hygiene. Kernel accepting non-`false`
spellings of `enabled` — kernel owner.

## Verification

Console gate above, once, orchestrator only; both units run `node --test` on their own
compiled test files and `npx tsc --noEmit` in `console/` (needs `console/node_modules`;
run `npm ci` there first if absent — it is gitignored). No root gate needed: nothing
under `src/`, `dist/`, `registries/` changes — but `node dist/engineos.cjs validate`
runs once anyway (C33 CRLF now covers `console/**/*.ts`).
