# Final-only approval workflow — validation evidence

Date: 2026-10-08. Working-tree implementation validated; Git integration pending.
Scope: docs/specs/2026-10-08-final-approval-and-retro-improvements-design.md.

## Delivered

- Automatic Stop and legacy post-edit hooks run no package checks/probes.
- Manual verification requires host-sourced final integrated task/scope/source/check
  approval and canonical approved files, with SHA256 scope binding. Prior-task files
  are excluded; physical containment and symlink checkout handling are preserved.
- Pure workflow-gate and scheduler launch admission reject absent/stale preview consent.
  CLI reports host-attestation-only; human authentication remains the host's duty.
- Command aliases are deduplicated, successes reused only at the same exact revision;
  cache keys use collision-safe tuples. Known nested tests/evals require test consent.
- CI execution requires explicit manual final approve_checks; tests need approve_tests.
- Named skill discovery distinguishes upstream session-retro/native recurring-retro.
- Unchanged context is reused; decisions use separate questions with no inferred yes.
- Three legacy Python tests now reflect disabled autodetection/routing while preserving
  explicit compatibility declarations and negative routing/detection coverage.

## Actual final-stage evidence

Developer explicitly approved final regression authoring and execution on 2026-10-08.
No worker ran intermediate checks. Authoring followed production integration.

| Check | Observed outcome |
|---|---|
| Emitting TypeScript compilation (`tsc -p tsconfig.json`) | Initial attempt found two new test-fixture type errors. Both corrected; compilation passed. The emission supplies typecheck and test JS, avoiding separate identical lint/noEmit runs. |
| Build (`npm run build`) | Passed; rebuilt bundle. |
| Fourteen directed test files | 309 cases: initial run 307 pass, 2 fail (missing-file symlink identity and incomplete compatibility fixture). |
| Affected retry only: Stop + kernel CLI | After narrow fixes, 103/103 pass, zero skipped. Other 206 cases were unaffected and already passed. This is aggregate coverage, not a fabricated single 309/309 run. |
| Source-changing repair | Recompiled and rebuilt only because the scoped runtime/test inputs changed; no unchanged-code reassurance runs. |
| Integrity (`node dist/engineos.cjs validate`) | 113 passed, 0 failed. |
| Whitespace (`git diff --check`) | Passed. |
| Independent critic + security lens | Read-only review clear after file-scope/cache-key fixes; approval authenticity remains host-owned. |

Saved local output: /tmp/engineos-final-approval-tests.tap,
/tmp/engineos-final-approval-repaired-tests.tap and
/tmp/engineos-final-approval-integrity.txt. Output files use the runtime's default
reporter despite their .tap filenames. No repository-wide suite or empirical
TTFR/token/cost reduction is claimed. No release/deploy/installation performed.

## Git integration boundaries

Current checkout main, no topic PR exists. Only changes from this conversation
are candidates for integration. Concurrent agent aliases/commands/architecture
visualizations, agent registry/eval edits and preexisting pnpm files are excluded.
Shared constitution/intent files require partial staging to preserve those deltas.
Git writes remain governed by rules/git.md; no commit directly to main.
