---
name: 2026-10-10-routing-replacement-plan
status: active
branch: feat/routing-replacement
pr: https://github.com/ricardofagmer/engineer-spec-ia-pattern/pull/132
owner: Ricardo Fagmer
spec: docs/specs/2026-10-10-routing-replacement-plan.md
adr: docs/adr/2026-10-10-three-tier-router-and-jev-judge.md
domain: kernel, hooks, registries, docs
risk: high
---

## What
Replaces any-match prompt routing with a three-tier router (deterministic gates,
scored classifier, escalation), adds an opt-in TypeSafe Jev semantic judge
(shadow by default) and an opt-in local embedding tie-break, and cuts per-hook
spawn cost with a hot bundle and an opt-in in-process adapter. Implements spec
#118 and tickets #119-#131 (T01-T13).

## Why
Phrase any-matching misrouted three requests in one session, and every Bash and
Edit call paid 60 to 95 ms of Node spawn. The developer asked whether Julia,
"jev" or another decision framework would make EngineOS faster and smarter.

## Scope
About 200 files outside dist/ (0b2e442..HEAD): src/kernel/** (score, route,
combine, tiebreak-facts, judge-facts, resolve), src/judge/** (redaction, Jev
client, state, breaker, tie-break client), src/hooks/** (prompt-advisor,
prompt-judge, adapter), src/registry/**, src/checks/** (validator 117 results),
src/gen/router-table.ts, registries/{intents,policy,routing}.json,
hooks/hooks.json, dist/** (loader + runtime bundles), tools/embedding-daemon/**,
adapters/**, evals/** (284-case golden set, BASELINE, RUBRIC), docs (contracts
rev 4, ADR, OPT-IN-TIERS, COMPATIBILITY, release notes draft), CLAUDE.md
router table.

## Checklist
- [x] Plan, tasks, Jev request body (docs/specs/2026-10-10-*)
- [x] Developer approves a direction; prototype preview approved (71ce35fb93a0)
- [x] ADR recording the direction, intent-parity handling and Mastra non-applicability for the judge
- [x] T01-T12 implemented and integrated; security review, fix passes 1 and 2
- [x] T13 final stage: tests, golden set, calibration, dist build, final run 1, repair 1, final run 2
- [x] Critic pass (design tier) on 455634e
- [x] Critic findings fixed: max_intents cap (BLOCKING), redaction pre-cap leak (SERIOUS), docs drift and release notes (MINOR)
- [x] Affected final checks re-run after the critic fixes (scoped: build, typecheck, judge and route tests)
- [ ] Security review of the redaction fix (needs final security consent)
- [x] /code-review on the PR branch (standards + spec axes), one fix pass integrated
- [ ] Final checks on the code-review fix pass (needs approval)
- [ ] C38b golden-set presence check (needs a new finding code and test; final test stage)
- [ ] First live Jev shadow run (approved, blocked on TYPESAFE_API_KEY in the session env)
- [ ] Security review and recorded human decision before Jev leaves individual opt-in (rule-sensitive-data)
- [ ] main carries the base fixes (C5, C14, 93 base test failures); branch synced; PR marked ready

## What was made
A scored Tier 1 classifier over phrases, negatives and verb-object features
(src/kernel/score.ts) with policy-driven thresholds (router.scoring), a fold that
lets the judge only add and raise (src/kernel/combine.ts: high-floor intents are
never suppressed; model tier and risk floor never drop), a pinned-origin Jev
client with 27-kind SHA-256-pinned redaction, a fail-closed breaker and
judgeMayReceive gating, an embedding tie-break client with uncalibrated
placeholder thresholds, a hot bundle for PreToolUse/PostToolUse hooks (the
git-write-guard is never silenced), an in-process adapter with presence v2
checks, generated router-table markers in CLAUDE.md, new validator checks, and a
284-case golden set with held-out and untuned subsets. Live judge calls stay off
unless ENGINEOS_JUDGE=jev and TYPESAFE_API_KEY are set; authoritative mode
ships disabled.

## Verification
Final run 2 at 455634e (approved final stage, 2026-10-11):
build 0; typecheck 0; validate 115 passed / 2 failed (C5, C14, both already red
at base 0b2e442); hot bundle 1.7.0 with the guard asking; evals 12 passed /
0 failed / 284 skipped; npm test 2841 pass / 93 fail, 0 new failures, every
failure already red at base. Golden set: held-out exact 125/145, all 233/281,
untuned 23/31 (reproduced independently by the critic).
Scoped re-run after the critic fixes at 0bf60a7 (approved 2026-10-11):
typecheck 0; build 0; judge/*, route, route-cap and route-intent tests
218 pass / 2 fail. Both failures were route-intent cases still asserting the
pre-rev-4 cap (declared-evidence rows trimmed); repair 1 aligned them with
contracts rev 4 item (b), keeping both tests (trim and tie stay covered in
route-cap.test.ts). After the repair: typecheck 0; route-intent 16 pass / 0 fail.
Not re-run after the critic fixes (developer's scope): full npm test, validate,
evals.
Pending: bench/budget cells in evals/BASELINE.md; live shadow run and judge
calibration.

## Rollback
Revert the PR merge commit on main; dist/ is committed, so the revert restores
the previous bundles and hooks.json in one step. Without a revert, the judge
(ENGINEOS_JUDGE unset), the embedding tie-break and the in-process adapter are
all off by default and env-gated; unsetting their variables returns routing to
the deterministic Tier 0/1 path. No data migration is involved.
A machine whose ~/.claude/settings.json was merged by the 1.8.0 installer keeps
five hook entries pointing at dist/engineos-hot.cjs after a revert (the 1.7.0
settings-merge does not recognise them); delete them by hand, then re-run the
installer (docs/release-notes/1.8.0.md, Rollback).

## Human decisions
- 2026-10-10, Ricardo Fagmer: chose the routing-replacement plan for /implement-spec and approved the direction (phases P0-P5). Branch feat/routing-replacement from 0b2e442; uncommitted changes on main left untouched by the developer's choice.
- 2026-10-10, Ricardo Fagmer: preview requested (LOGIC branch), then preview-approved. Scope: routing replacement P0-P5. Artifact: scratchpad proto/routing-combination.PROTOTYPE.html (local pointer), revision sha256 71ce35fb93a0. Reason ids: high-risk.
- 2026-10-11, Ricardo Fagmer: T07's stray uncommitted drafts of commands/route.md and skills/retro/SKILL.md in the PR checkout discarded; T07's committed versions merged.
- 2026-10-11, Ricardo Fagmer: security re-review of fix pass 1 (3b38ce4..4ba0cd4) approved and run. Reason ids: high-risk.
- 2026-10-11, Ricardo Fagmer: security re-review of fix pass 2 (4ba0cd4..91bf8c4) declined. Its evidence stays pending.
- 2026-10-11, Ricardo Fagmer: final stage (T13) approved at 91bf8c4, including tests, golden set, calibration, dist build, the final command set and bounded repairs.
- 2026-10-11, Ricardo Fagmer: "Continue, report base red". The 93 base test failures and validate C5/C14 stay out of PR #132; the PR stays draft until main carries the base fixes and the branch is synced (a separate approved git action).
- 2026-10-11, Ricardo Fagmer: critic pass approved and run (read-only, 455634e). Reason ids: high-risk.
- 2026-10-11, Ricardo Fagmer: daemon lockfile generation and npm audit approved (registry access). Lockfile ca898fc; audit 0 vulnerabilities.
- 2026-10-11, Ricardo Fagmer: one live Jev shadow call approved for the committed request docs/specs/2026-10-10-jev-shadow-request.json only. Reason ids: high-risk, external-effect. Blocked: TYPESAFE_API_KEY not set; no request sent.
- 2026-10-11, Ricardo Fagmer: fix all critic findings (blocking cap, serious redaction leak, change record, minor docs drift, release notes).
- 2026-10-11, Ricardo Fagmer: re-run after the critic fixes scoped to "Typecheck and targeted tests only" (build, typecheck, judge and route test files); full npm test, validate and evals excluded.
- 2026-10-11, Ricardo Fagmer: final security review of the redaction fix (8742ba6) and the judge data paths at d54c802, with npm audit, declined. Reason ids: high-risk. The review stays pending; verified completion and release clearance are not established while it is open.
- 2026-10-11, Ricardo Fagmer: /code-review fix scope "Code and docs; defer tuning". One fix pass covers every Standards finding (redact.ts split included), Spec items 3, 6 and 7, and the ADR no-retry record. Spec items 1, 2 and 8 (threshold/margin calibration, single-common-word weights, authoritative-mode latency) go to a follow-up issue because they need eval evidence; routing behaviour does not change in this pass.
- Pending: security review of the redaction fix; security review before Jev leaves individual opt-in.

## Changes registered
See `git diff --stat 0b2e442..feat/routing-replacement`.

## Notes
The UserPromptSubmit advisor classified background-task notifications and
subagent report text as prompts and demanded router dispatches. Recorded as
misroute three in the plan; the hook-side prompt-source handling in this PR
was not verified against those exact inputs.
Follow-ups: npm warns that `onnxruntime-node-install` in tools/embedding-daemon/.npmrc
is an unknown project config; stop-verify.ts length; doubled newline in stderr
for an unknown hook; the fold returns intents in judge order; the prompt-advisor
tie-break fallback order is untested; hostPaths == sessionPaths is pending.
Code review (2026-10-11) labels: repair commit 773d460 is a routing behaviour
change (bare "pipeline" no longer routes to devops), made under the T13
calibration approval although its subject reads as a test repair. Deferred
tuning: threshold 0 and margin 0 leave low-confidence escalation and the
tie-break unreachable (plan §4); single common words still route alone at
weight 1 (plan §2 problem 1); authoritative mode runs the judge and tie-break
serially (400 + 150 ms of the 600 ms hook budget). Files over ~300 lines left
for later: kernel/cli.ts, git-write-guard.ts, report/usage.ts, registry/policy.ts.
