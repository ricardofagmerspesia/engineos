---
name: 2026-09-08-hook-hardening
status: done
completed: 2026-09-08
owner: Ricardo Fagmer
spec: docs/specs/2026-09-08-hook-hardening.md
domain: security
---

## What
Gate the Stop verification hook behind the project's `.engineos/` opt-in, remove
five arbitrary-execution entries from the shared permission allowlist, narrow the
session id before it names a file in two hooks, bound the dispatch banner text,
harden CI (least-privilege token, SHA-pinned actions, `npm audit`, Dependabot), and
extend the security reviewer's hardening checklist with the two items that would
have caught the HIGH findings.

## Why
A security-reviewer AUDIT pass on 2026-09-08 reproduced a repository-defined
`package.json` script executing on Stop with no permission prompt, and found the
installer widening the user's global allowlist with `find`, `rg`, `npm run` and
`npx` prefixes.

## Scope
src/hooks/stop-verify.ts (+ .test.ts, .e2e.test.ts)
src/hooks/mark-unrecorded.ts, src/hooks/record-verify.ts, src/hooks/announce-agent-dispatch.ts (+ tests)
.github/workflows/ci.yml, .github/workflows/live-evals.yml, .github/dependabot.yml (new)
templates/permissions.template.json, agents/security-reviewer.md, README.md, docs/COMPATIBILITY.md, docs/CODEBASE_MAP.md
docs/specs/2026-09-08-hook-hardening.md (new), dist/engineos.cjs (rebuilt)

## Checklist
- [x] Unit A: Stop gate returns silent without `.engineos/`
- [x] Unit B: hookPathSlug on both marker sites; banner fields bounded
- [x] Unit C: permissions block, SHA pins, audit step, dependabot.yml
- [x] Unit D: template pruned, checklist +2 items, docs updated
- [x] dist rebuilt, gen scripts clean, validator green, tests green

## What was made
One wave, four disjoint-scope opus agents against the frozen contracts in the spec.
Unit A added an `isDirectory(join(root, '.engineos'))` guard in `verify()` before
the transcript is read, one new unit test (non-adopted repo with a red typecheck
script spawns nothing), and put `.engineos/.keep` in fourteen e2e fixtures; one
existing test that asserted a `block` on a non-adopted repo now asserts `silent`,
since that is the removed behaviour. Unit B derives the unrecorded marker name via
`hookPathSlug(env.sessionId)` in both writer and reader, and added `bannerField`
(control chars and backtick to space, collapse, trim, truncate to 64/160 with `...`)
in front of `dispatchBanner`; `spanIdFrom` untouched. Unit C pinned
`actions/checkout` and `actions/setup-node` to the v4.4.0 commit SHAs resolved via
`gh api`, added `permissions: contents: read` to both workflows, a `Dependency
audit` step, and `.github/dependabot.yml`. Unit D removed five template entries
(18 to 13), reworded checklist item 1 and appended two items (21 total), and updated
README, CODEBASE_MAP and a new `## Unreleased` section in COMPATIBILITY.

Deviations from the spec, recorded back into it: `isDirectory` instead of
`existsSync` (a file named `.engineos` is not adoption); the flipped test
assertion; `## Unreleased` placed last, not above 1.6.0.

## Verification
Run 2026-09-08 after the owner approved, once, at the barrier:
- `npm run typecheck` -- clean
- `node dist/engineos.cjs validate` -- passed 104, failed 0
- `npm test` -- 1967 pass, 0 fail (96s)
- `npm audit --audit-level=high` -- exit 0 (the new CI step starts green)
- `scripts/gen-agent-commands.sh` + `gen-agent-registry.sh` -- no drift

## Human decisions
2026-09-08, Ricardo Fagmer, reason: high-risk finding triage. Approved: fix both
HIGH findings, all four LOW findings, amend checklist with two items plus an
environment note. Refused: splitting the checklist by target shape. Approved the
final gate run.

## Known follow-ups (not in this change)
- `skills/record-change/SKILL.md` clears the marker with the raw `$CLAUDE_SESSION_ID`;
  agrees with the slug for UUID ids, would not for a non-slug id.
- `live-evals.yml` installs `@anthropic-ai/claude-code` unpinned.
- `actions/checkout` keeps `persist-credentials` default.
- Already-merged allowlist entries in existing `~/.claude/settings.json` files are
  not pruned by re-running the installer.
- `ENGINEOS_ROOT` / `NVM_DIR` trusted unconditionally (informational).

## Changes registered
- src/hooks/stop-verify.ts, stop-verify.test.ts, stop-verify.e2e.test.ts -- modified
- src/hooks/mark-unrecorded.ts, mark-unrecorded.test.ts -- modified
- src/hooks/record-verify.ts, record-verify.test.ts -- modified
- src/hooks/announce-agent-dispatch.ts, announce-agent-dispatch.test.ts -- modified
- .github/workflows/ci.yml, live-evals.yml -- modified; .github/dependabot.yml -- added
- templates/permissions.template.json, agents/security-reviewer.md, README.md, docs/COMPATIBILITY.md, docs/CODEBASE_MAP.md -- modified
- docs/specs/2026-09-08-hook-hardening.md -- added
- dist/engineos.cjs -- rebuilt
- .engineos/changes/2026-09-08-hook-hardening.md -> .engineos/archived/2026/09/security/2026-09-08-hook-hardening.md
