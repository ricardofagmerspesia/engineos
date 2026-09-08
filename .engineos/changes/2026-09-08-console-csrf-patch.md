---
name: 2026-09-08-console-csrf-patch
status: in-progress
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
console/src/lib/entities/types.ts, console/src/components/api/skills.ts,
docs/COMPATIBILITY.md.

## Checklist
- [ ] originVerdict + middleware, 403 on cross-site writes, GET untouched
- [ ] dev/start bind 127.0.0.1
- [ ] parseSkillPatch allowlist; PUT returns 400 on bad JSON / bad shape, no cast left
- [ ] SkillPatch defined once
- [ ] security-reviewer + critic pass, findings addressed or recorded
- [ ] console gate green: typecheck, lint, test, build; root validate green
- [ ] COMPATIBILITY.md Unreleased row

## What was made
(pending)

## Verification
(pending)

## Human decisions
2026-09-08, Ricardo Fagmer: chose "U5 console CSRF + PATCH" as the next unit. Risk
classified high (shortcut floor: access control on routes that write and commit);
autonomy A3 — the PR is the human gate before merge; `security-reviewer` and `critic`
passes required by `rules/gates.md` at this tier. HITL reason: `high-risk`.

## Changes registered
(pending)
