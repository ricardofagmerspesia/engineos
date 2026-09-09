---
name: 2026-09-08-kernel-fail-closed
status: done
completed: 2026-09-08
owner: ricardo.fagmer
spec: docs/specs/2026-09-08-kernel-fail-closed.md
domain: devops
---

## What
Audit U7: `routing.json`/`intents.json` loaders fail closed; C14 joins `capability_ids` to capabilities.json, capability agents to agents.json and decision-rule `source` paths to files; `skill-state` withholds a skill whose frontmatter it cannot read (reason `unreadable`); `ENGINEOS_REQUIRE_PARITY=1` turns parity skips into failures and CI sets it; result count pinned.

## Why
`.engineos/audits/2026-09-08-all.md` lines 37-41: a malformed routing registry silently removed security routing; dangling capability ids and missing sources passed the validator; parity evidence could vanish without notice; a 64 KiB head bound failed open.

## Scope
Two disjoint units (spec "Frozen contracts"). Lands after PR #85 merges (shared dist / count-pin / COMPATIBILITY edits).

## Checklist
- [x] Unit A loaders + context typing + C14 joins + count pin (devops-coordinator)
- [x] Unit B skill-state fail closed + parity opt-in + ci env (devops-coordinator)
- [x] Barrier: COMPATIBILITY rows for Unit B, dist rebuild, final gate
- [x] Re-cut off main after #85 merges, PR

## What was made
- `src/registry/routing.ts`, `src/registry/intents.ts`: strict loaders via `strictReader`; any malformed field throws `KernelError` (CLI exit 1) instead of yielding an empty registry. `RoutingRegistry`/`IntentsRegistry` carry `version`. 19 loader tests added.
- `src/kernel/context.ts`: `capabilities` typed as `CapabilitiesRegistry`, `agents` as `Agent[]`, loaded through their loaders.
- `src/checks/registries-coherence.ts` + `registries.ts`: C14 gains `source-file-missing`, `dangling-capability-id`, `unknown-capability-agent` (3 results, 113 total); e2e pin `RESULT_COUNT = 113`; `CHECKS.length === CHECK_IDS.length` asserted.
- `src/kernel/skill-state.ts`: `readHead` reports truncation; a frontmatter block still open at the 64 KiB bound reads as `unreadable` and the skill is withheld (`SuppressedSkill.reason: 'disabled' | 'unreadable'`; sparse `unreadable` keys in section and lookup). `SkillReading` exported from the kernel barrel.
- `src/kernel/parity.test.ts`: `skipOrFail` fails instead of skipping when `ENGINEOS_REQUIRE_PARITY=1`; `.github/workflows/ci.yml` verify job sets it.
- `docs/COMPATIBILITY.md`: four Unreleased rows (loaders fail closed, C14 results, skill-state unreadable reason, `ENGINEOS_REQUIRE_PARITY`).
- `dist/engineos.cjs` rebuilt.

## Verification
2026-09-08, orchestrator, at the barrier on the integrated tree:
- `npm run build`: clean; `npm run typecheck`: clean.
- `node dist/engineos.cjs validate`: `passed 113, failed 0`.
- `npm test`: `# tests 2103 / # pass 2087 / # fail 0 / # skipped 16` (skips are macOS bash 3.2 parity skips; CI fails them via `ENGINEOS_REQUIRE_PARITY=1`).
- Kernel answers `route-path src/auth/jwt.guard.ts`, `route-intent add a NestJS controller`, `skill-state` byte-identical to the pre-change baseline (`cmp` clean).
- `git diff --check` clean.
- Re-cut off main after #85 merged: `src`, `dist`, `.github`, `registries` identical to the gated tree; validate re-run `passed 113, failed 0`.

## Human decisions
2026-09-08 | owner | none required (risk medium, A2, PR-gated) | approved | picked U7 as next unit

## Changes registered
- Branch `feat/kernel-fail-closed` off main (post #85); commits: spec + record, `feat(kernel): fail-closed loaders, C14 joins, unreadable skill state`, record close. One PR to main.
- Public surface: `docs/COMPATIBILITY.md` Unreleased, four rows.

## Notes
Work branch cut from feat/prose-truth-checks on purpose; see spec "Dependency".
