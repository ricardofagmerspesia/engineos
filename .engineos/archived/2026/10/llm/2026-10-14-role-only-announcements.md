# Role-only agent announcements

status: done
completed: 2026-10-14
domain: llm
spec: docs/specs/2026-10-14-role-only-announcements.md
Status: ROLE-1 integrated; approved final proof passed.
Spec: `docs/specs/2026-10-14-role-only-announcements.md`.
Scope revision: role-only-v1. Risk: medium. Autonomy: A2.
Branch/current PR: unknown; retain existing branch/PR and unrelated dirty work.

## Human decisions

- User confirmed "Use role-only labels; keep responsibilities." This authorizes presentation work; it does not rename dispatch IDs or change duties.
- User selected "Skip prototype; update the announcements" for scope revision role-only-v1. Prototype declined; presentation implementation authorized. Supervisor explicitly dispatched ROLE-1 against this scope.
- Final consent: on 2026-10-14 the user submitted **Run proposed checks** for integrated-v1 covering both role-label and progressive-execution changes: focused regression authoring, announcement-expectation updates, `npm run build`, and the displayed focused `npm test` suites. No Git writes, deployments or installations were approved.
- Git writes, releases, installations and external effects: not authorized in this task.

## Checklist

- [x] Clarify visible role labels versus coordination responsibilities.
- [x] Inspect existing display contract and all 22 registered agents read-only.
- [x] Draft scoped spec, complete mapping, ROLE-1 and dependent ROLE-PROOF.
- [x] Record preview/design decision before production dispatch/writes.
- [x] Implement ROLE-1 presentation guidance and inspect scoped diff/contracts.
- [x] Supervisor confirms ROLE-1 integration into the approved scope.
- [x] Obtain fresh final consent and complete approved ROLE-PROOF work.
- [x] Attach actual evidence and report validation status honestly.

## What was made

Spec and this open change record; ROLE-1 updates `rules/subagents.md`, `src/hooks/announce-agent-dispatch.ts`, `src/hooks/announce-agent-return.ts`, `templates/adapters/codex.md` and the current announcement paragraph in `docs/COMPATIBILITY.md`. Visible lifecycle labels now use `[<short role>]`, including a complete 22-agent mapping, truthful model fallback and separate instance identity for equal roles. Hook changes touch only instruction strings; canonical agent IDs, registered aliases, hook envelopes/quoted context, telemetry, capabilities, dispatch behavior and responsibilities retain their existing contracts.

## Evidence and limits

Read-only scoped diff and source inspection confirm the role-only launch/return examples, startup status/task fields, complete mapping, separate instance guidance and matching Codex/compatibility notes. Existing unrelated dirty edits were retained through targeted hunks. No test files, generated bundles, Git state or external systems were changed. No executable checks were run. Existing announcement tests still contain former literal expectations and the committed bundle still needs the approved final proof update/rebuild. Validation remains pending; no completion or release claim is established.

## Rollback and residual risk

Remove/reverse only identified task patch hunks through ordinary file edits, preserving all earlier dirty work. Main risk: divergent lifecycle examples or stale test literal expectations; ROLE-1 has one owner and ROLE-PROOF covers the integrated guidance. Owner: top-level supervisor. Existing historical preview layouts remain reference unless separately selected for revision.

## Final proof

User approved the exact final proof on 2026-10-14. Updated the three announcement suites without weakening technical identity, envelope, sanitization or telemetry coverage. Added role-only negative regressions. `npm run build` exited 0; the approved seven-suite command compiled TypeScript and passed 104 tests, with 0 failed/cancelled/skipped. No HITL reason fired and no correction/retry was needed. No Git writes, release or installation occurred.

## Changes registered

Actual scoped status (includes preceding dirty changes):

```text
 M dist/engineos.cjs
 M docs/COMPATIBILITY.md
 M rules/subagents.md
 M src/hooks/announce-agent-dispatch.test.ts
 M src/hooks/announce-agent-dispatch.ts
 M src/hooks/announce-agent-return.test.ts
 M src/hooks/announce-agent-return.ts
 M src/hooks/announce-agent.e2e.test.ts
 M templates/adapters/codex.md
```

Actual `git diff --stat HEAD` snapshot for the combined proof scope is recorded in the sibling progressive-execution archive. Relevant rows:

```text
 dist/engineos.cjs                         | 2961 +++++++++++++++++------------
 docs/COMPATIBILITY.md                     |  180 ++
 rules/subagents.md                        |  114 +-
 src/hooks/announce-agent-dispatch.test.ts |   12 +-
 src/hooks/announce-agent-dispatch.ts      |    6 +-
 src/hooks/announce-agent-return.test.ts   |   20 +-
 src/hooks/announce-agent-return.ts        |    5 +-
 src/hooks/announce-agent.e2e.test.ts      |   20 +-
 templates/adapters/codex.md               |   90 +-
```

Snapshot is not attribution of every dirty hunk to this task. No commits were made. Canonical identifiers/responsibilities remain intact; visible labels are role-only.

Optional artifact and session-retro choices were offered once with the combined delivery; no follow-up selected yet.
