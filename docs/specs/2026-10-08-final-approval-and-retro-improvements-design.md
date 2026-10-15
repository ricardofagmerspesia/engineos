# Final-only approved checks and session-retro improvements

Date: 2026-10-08. Risk high, autonomy A2; working-tree changes only.
Branch main, PR unknown; preserve all unrelated existing changes.
User requested all checks/tests only at final integrated stage with explicit approval,
and all five session-retro recommendations. User explicitly declined prototype for
this implementation scope on 2026-10-08. No check execution is approved yet.

## Frozen behavior

1. Automatic Stop performs no lint, typecheck, tests, runner probes or other package
commands. It reports pending final approval honestly; adoption/env/repo markers
are not consent. Retain the existing manual ladder, containment, repair bounds,
telemetry and timeouts behind an explicit host-approved final integrated context.
2. Pure workflow gate evaluates bounded exact facts: taskId, scopeRevision,
sourceRevision, phase (planning/implementation/final), integrated, preview
(choice pending/declined/selected, scopeRevision, artifactRevision,
approvedArtifactRevision), validation (decision pending/declined/approved,
scopeRevision, sourceRevision, checks). Missing/stale facts deny, never authorize.
Preview decline permits production through other gates; selected preview needs
explicit same-scope exact artifact revision approval. Validation needs final,
integrated and exact task/scope/source/check consent. Environment/file flags do
not supply trusted approval. CLI evaluation only, never executes checks or claims
human approval authentication. A host remains the authority for actual user choice.
3. launchReady requires matching task/plan scope preview admission before any
launcher call; absence denies. Bind scope to deterministic immutable units graph
fingerprint including paths, dependencies and contract revisions, not state counters.
Host direct executor must apply the same evaluator convention; no native launcher
or universal tool interception is claimed.
4. Approved final manual verification runs each distinct command once per immutable
revision; lint/typecheck identical package scripts deduplicate. Repeat only impacted
commands after source changes/failures, within existing repair bound. No intermediate
component checks/TDD defaults; explicit new user exception must name scope/timing.
5. All entrypoint/rule/CI mirrors state conditional final approval. Automated PR/push
must not run package lint/typecheck/tests without per-run explicit final opt-in;
manual inputs are host/user attestation, not automatic repository permission.
6. Preserve tests. At final approval stage reconcile FastAPI/Django deprecated
stack expectations and enabled-intent signal iteration; retain explicit Python
compatibility declaration coverage and negative disabled-autodetection/routing
assertions. Add regression coverage for gate denial/stale approval and no automatic
check execution. Do not skip/delete failing coverage.
7. Discover skills through a bounded named resolver/manifest distinguishing upstream
session-retro from native recurring retro; include actual paths and availability.
Use existing kernel/parser contract rather than invented flags. Cache/reuse unchanged
loaded source references, narrow reads and report missing dependencies once.
8. One user question per decision. Prototype choice, preview approval, final validation
approval, retro opt-in and artifact selection are separate; wait for each required
answer. No recursive retro offer and no inferred approval from ambiguous yes.

## Units / ownership

U1 runtime gate + hook/launcher/CLI + coherence source, one owner.
U2 policy/procedure/CI/discovery guidance and registry mirrors, one owner.
U3 final tests/legacy corrections + approved verification, only after U1/U2 integrated
and explicit final user approval. Independent critic/security review read-only.
3 units, no per-file tasks. U1/U2 independent against this behavior contract;
U3 depends on U1/U2. Supervisor owns spec/record and final bundle integration.

## Alternatives and rollback

Rejected prose-only correction: automatic Stop would still execute commands.
Rejected accepting env/repo approval flags: no trusted current user decision.
Accepted pure approval evaluator + explicit host boundary + advisory Stop.
Rollback only this scoped delta against starting working tree; preserve prior work.
No PR/release/deploy/branch/commit/worktree/installation authorized.

## Final validation plan (pending user approval)

One deduplicated typecheck, build/bundle, focused gate/Stop/scheduler/kernel/skill
resolver/coherence tests and integrity checks. Report wider failures honestly.
No checks/tests/builds during implementation. Read-only review allowed meanwhile.
