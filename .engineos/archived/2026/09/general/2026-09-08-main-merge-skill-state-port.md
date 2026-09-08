---
name: 2026-09-08-main-merge-skill-state-port
status: done
completed: 2026-09-08
owner: Ricardo Fagmer
spec: docs/specs/2026-09-08-hook-hardening.md
domain: general
---

## What
Merge `origin/main` (e01-e03, kernel-wave1d, journal-wave2) into `fix/hook-hardening`
for PR #70, keep `scripts/kernel.sh` as the TypeScript shim, port main's
`skill-state` subcommand and `skills_suppressed` field into `src/kernel`, port
main's bash kernel tests for it to node:test, gate the jq-version-dependent
telemetry parity cases, and pin the actions in the CI jobs main added.

## Why
This record closes the conflict-resolution wave for PR #70 under the hook-hardening
spec; the skill-state port adds no feature beyond what main already declared public.
PR #70 (`fix/hook-hardening` -> `main`) was CONFLICTING. main had added
`skill-state` to the bash kernel the stack had already replaced with a shim, and
modified `scripts/test-kernel.sh`, which the stack had deleted. Taking main's bash
kernel back would have regressed the 1.7.0 migration; dropping `skill-state` would
have removed a surface main's `docs/COMPATIBILITY.md` already declares public.
Separately, `telemetry-parity` fails on every ubuntu-latest runner because jq 1.7
prints `1E-7` where the port reproduces jq 1.6's `1e-07`.

## Scope
scripts/kernel.sh (conflict: shim kept), scripts/test-kernel.sh (conflict: deletion kept)
src/kernel/** (skill-state port + tests), test/fixtures/legacy-kernel/** (pinned bash kernel refreshed to main)
src/journal/telemetry-parity.test.ts (jq version gate)
.github/workflows/ci.yml (SHA pins on console/package jobs)
docs/CODEBASE_MAP.md, docs/COMPATIBILITY.md, docs/CAPABILITIES.md
dist/engineos.cjs (rebuilt)

## Checklist
- [x] Merge committed with both conflicts resolved (cef6dad)
- [x] skill-state + skills_suppressed answered by the TypeScript kernel, key order matching bash
- [x] main's skill-state test cases ported to node:test
- [x] parity fixture pinned to main's kernel.sh
- [x] telemetry parity gated on jq 1.6
- [x] CI actions pinned in the merged jobs
- [x] dist rebuilt, validator green, tests green

## What was made
- `src/kernel/skill-state.ts` (new): bounded frontmatter reader (64 KiB head) over
  `skills/*/SKILL.md`; only a literal `enabled: false` in the first `---` block
  disables a skill. `readSkillState`, `isSkillEnabled`, `enabledSkills`,
  `suppressedSkills`, `skillStateSection`, `skillLookupSection`.
- `src/kernel/context.ts`: `Registries` split into `RegistryFiles` + memoized
  `skillState`; `src/checks/mirrors.ts` follows (`RegistryName = keyof RegistryFiles`).
- `src/kernel/route.ts`, `resolve.ts`: `skills_suppressed` (`[{id, reason: "disabled"}]`,
  always present) in `route-path`, `route-intent` matches and `resolve-task`, key
  order byte-identical to main's bash kernel.
- `src/kernel/cli.ts`: `skill-state` subcommand; `--id X` -> `{id, exists, enabled}`,
  no id -> `{skills, disabled}`; error strings match bash.
- `scripts/kernel.sh` header lists `skill-state`; `scripts/test-kernel.sh` stays deleted,
  its 66-line skill-state block ported to `src/kernel/kernel-skill-state.e2e.test.ts`
  (17 cases, drives `dist/engineos.cjs`) and `skill-state.test.ts` (10 cases).
- `test/fixtures/legacy-kernel/kernel.sh` refreshed to main's version, pinned to
  `02c9f82ae36f2509671b4c482be997c2bbb9333e`; `parity.test.ts` +5 cases, skips with a
  reason when the host bash cannot parse the fixture (`bash -n`, bash < 4).
- `src/journal/telemetry-parity.test.ts`: nine number samples moved to per-sample
  subtests, probed with `jq -nc --argjson` against jq-1.6 bytes; skipped with a
  reason on other jq versions. `APPEND_CASES` unconditional.
- `.github/workflows/ci.yml`: `console` and `package` jobs from main pinned to the
  same checkout/setup-node/upload-artifact SHAs as the rest of the workflow.
- Docs: `CODEBASE_MAP.md`, `COMPATIBILITY.md`, `CAPABILITIES.md` name the port.
- `dist/engineos.cjs` rebuilt.

## Verification
Final gate, run once at the wave barrier (2026-09-08):
- `npm run build` -> ok, dist rebuilt
- `bash scripts/gen-agent-commands.sh` + `gen-agent-registry.sh` -> no drift in
  `commands/agents/`, `registries/agents.json`
- `npm run typecheck` -> clean
- `node dist/engineos.cjs validate` -> `passed 104, failed 0`
- `npm test` -> `# tests 2010 / # pass 1994 / # fail 0 / # skipped 16` (skips: jq-1.7
  number samples and bash-3.2 kernel parity on this macOS host; both run in CI)
- smoke: `bash scripts/kernel.sh skill-state` answers through dist

## Human decisions
2026-09-08, Ricardo Fagmer, reason: high-risk (stack-to-main merge touching the
kernel's public surface). Approved: keep the TypeScript shim and port skill-state;
gate the jq-dependent parity cases; pin the new CI jobs' actions. Refused: porting
main's bash checks C32-C35 to src/checks in this PR (left on disk, not executed by
the validator shim); taking main's bash kernel back.

## Known follow-ups (not in this change)
- scripts/checks/80-portability.sh and 85-skill-enablement.sh (C32-C35) are not run
  by the TypeScript validator; port or delete.
- PR #69 (`fix/hook-hardening` -> `feat/suites-wave6b`) now carries all of main;
  superseded by #70.

## Changes registered
Commit on `fix/hook-hardening`, after `cef6dad` (merge): feat(kernel): port skill-state
and skills_suppressed to the TypeScript kernel. PR #70 (`fix/hook-hardening` -> `main`).
