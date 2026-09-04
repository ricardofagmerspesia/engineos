---
name: 2026-09-04-kernel-wave1d
status: done
completed: 2026-09-04
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 1(d) of the TypeScript runtime migration: `decision-rules`, `scale`,
`route-escalate`, `resolve-task` and the new `resolve --facts` arm; the
`scripts/kernel.sh` shim swap to the node runtime with the route-guidance
registry deletion; the router agent's single `resolve` call.

## Why
Plan Tasks 12, 13, 13b (`docs/specs/2026-09-04-typescript-runtime-migration-plan.md`
Wave 1(d)). Waves 1(a)-1(c) ported ten arms; this closes the kernel port.

## Scope
- `src/registry/{decision-rules,intents,policy}.ts` + tests
- `src/kernel/{decisions,scale,route,resolve,cli,index,context}.ts` + tests,
  `parity.test.ts`
- `docs/COMPATIBILITY.md` (kernel row gains `resolve`)
- `scripts/kernel.sh` (shim), `scripts/test-kernel.sh` (relocated fixture),
  `scripts/checks/{20-registries,40-decision-registries,50-kernel,70-runtime}.sh`,
  `registries/routing.json` (drop `hook_guidance`/`risk_floor`),
  `docs/CONTRIBUTING.md`
- `agents/router.md`, `commands/route.md`
- `dist/engineos.cjs` (rebuilt)

Branch `feat/kernel-wave1d` cut from `feat/kernel-wave1c` (4d3c7b8).

## Checklist
- [x] Task 12: decision-rules, scale, route-escalate, resolve-task, `resolve --facts`
- [x] Task 12: `docs/COMPATIBILITY.md` kernel row (MINOR)
- [x] Task 13: `scripts/kernel.sh` shim, relocated fixture carries the bundle
- [x] Task 13: routing.json loses `hook_guidance`/`risk_floor`; checks re-pointed
- [x] Task 13b: router agent calls `resolve` once; C18b re-pointed
- [x] Final gate: typecheck + unit tests + build + test-kernel + validator +
      bench + test-route + test-prompt-advisor + validator self-test, once, after asking

## What was made
- `src/registry/decision-rules.ts` (new, strict loader; `then.prefer` is one
  string), `src/registry/strict.ts` (new; the `registries/<file>: <path> must be
  ...` reader shared by the policy and decision-rules loaders — third duplicate
  justified the extraction, policy.ts had crossed 300 lines),
  `src/registry/policy.ts` (`parallelism.prompt_signals`, `router` block),
  `src/registry/intents.ts` (`suppressible`, `suppressed_by`,
  `requires_dispatch_plan`).
- `src/kernel/decisions.ts` (`decision_rules` section), `src/kernel/scale.ts`
  (`scale` section, memoised prompt regexes), `src/kernel/route.ts`
  (`routeEscalate`, escalate form of `route`), `src/kernel/resolve.ts`
  (`escalate`/`taskContract` prompt modifiers, `task_contract` composition:
  `hitl` folds only from `decisions.any_high`), `src/kernel/cli.ts` (arms
  `decision-rules`, `scale`, `route-escalate`, `resolve-task`, and
  `resolve --facts <json>` with a typed fact parser), `context.ts` loads
  decision-rules strictly.
- Parity: 27 differential cases incl. all six `policy.json .router.fixtures[]`
  byte-identical to the pinned bash kernel.
- `scripts/kernel.sh` is the plan's shim over `dist/engineos.cjs`;
  `scripts/test-kernel.sh` carries the bundle at all seven relocation sites;
  `scripts/checks/lib.sh` `ADMIT_TS`; C26d greps `src/kernel/admit.ts`; C6/C7/C8
  read `agent`/`skills[]`/`rules[]`; C14 guidance half, C16 floor row and C8
  domain floor row deleted; `registries/routing.json` domain rows lost
  `hook_guidance`/`risk_floor` (20 lines); `docs/CONTRIBUTING.md` names `hint`;
  fixture README explains why the legacy snapshot keeps both fields;
  `docs/COMPATIBILITY.md` MINOR notes for `resolve` and for the shim/registry.
- `agents/router.md` steps 2-4 are one `resolve --facts '{"prompt", "escalate":
  true, "signals": {"inputs": ...}}'` call, model via `{"workType"}`, waves via
  `{"waves": {"units"}}`; `kernel.risk`/`kernel.gates` kept as projections of
  `kernel.resolve`; `commands/route.md` builds the payload with `jq -nc`;
  C18b greps the one `resolve` literal plus the four facts.
- Orchestrator: `scripts/test-validate-engineos.sh` C18b case re-pointed; C20b
  and four C26b behavioural canaries now mutate `dist/engineos.cjs` (the shim
  has no text to mutate; src edits do not execute without a rebuild);
  `registries/agents.json` regenerated (router description);
  `docs/BIG-PICTURE-lifecycle.html` names `resolve`; `hooks/test-route.sh`
  comment; `dist/engineos.cjs` rebuilt.
- Deviations accepted: `<arm>: unknown flag` / `--prompt requires a value`
  wording (parseFlags precedent); `resolve --facts` parser messages are new
  surface; `taskContract` refuses explicit `decisions`/`hitl`; test-kernel's
  "hitl still answers with adequate evidence" flipped to fail-closed because the
  strict policy loader refuses a malformed policy.json at load; agent test
  asserted `rule.gate` on a `DecisionRule` (fixed to `rule.then.gate`).

## Verification
Run once at the end, after asking (2026-09-04). Fix loop: 3 rounds.
```
npm run typecheck                    rc=0 (0 errors)
npm test                             # tests 389 / pass 389 / fail 0
npm run build                        rc=0 (dist/engineos.cjs rebuilt)
bash hooks/test-route.sh             pass=41 fail=0
bash scripts/test-kernel.sh          passed 334, failed 0
bash scripts/validate-engineos.sh    passed 106, failed 0
bash hooks/test-prompt-advisor.sh    65 passed, 0 failed
bash scripts/bench-runtime.sh
  route-intent: median=37.6ms budget<250.0ms
  resolve-task: median=38.8ms budget<500.0ms
  prompt-advisor (end to end): median=267.1ms budget<600.0ms
  route-before-change (cache hit): median=62.8ms budget<150.0ms
  always-on context: 27223 bytes budget<32000 bytes
bash scripts/test-validate-engineos.sh   passed 145, failed 0
```
Red -> green fixes: (1) `decision-rules.test.ts` asserted `rule.gate` on a
`DecisionRule` and `rule.then.gate` on the flattened projection — swapped;
(2) test-kernel "hitl still answers with adequate evidence" flipped to
`assert_err` (strict policy loader); (3) C26d grep skipped comment lines so the
C26d canary bites again (admit.ts comment named the literal).

## Human decisions
None fired so far: risk low-to-medium (shim swap changes the runtime behind a
public surface; `git revert` undoes it; no external effect), autonomy A2.

## Changes registered
```
 M agents/router.md
 M commands/route.md
 M dist/engineos.cjs
 M docs/BIG-PICTURE-lifecycle.html
 M docs/COMPATIBILITY.md
 M docs/CONTRIBUTING.md
 M hooks/test-route.sh
 M registries/agents.json
 M registries/routing.json
 M scripts/checks/20-registries.sh
 M scripts/checks/40-decision-registries.sh
 M scripts/checks/50-kernel.sh
 M scripts/checks/70-runtime.sh
 M scripts/checks/lib.sh
 M scripts/kernel.sh
 M scripts/test-kernel.sh
 M scripts/test-validate-engineos.sh
 M src/kernel/cli.test.ts
 M src/kernel/cli.ts
 M src/kernel/context.ts
 M src/kernel/index.ts
 M src/kernel/parity.test.ts
 M src/kernel/resolve.test.ts
 M src/kernel/resolve.ts
 M src/kernel/risk.test.ts
 M src/kernel/route.test.ts
 M src/kernel/route.ts
 M src/registry/intents.test.ts
 M src/registry/intents.ts
 M src/registry/policy.test.ts
 M src/registry/policy.ts
 M src/registry/routing.ts
 M test/fixtures/legacy-kernel/README.md
?? .engineos/changes/2026-09-04-kernel-wave1d.md
?? src/kernel/decisions.test.ts
?? src/kernel/decisions.ts
?? src/kernel/scale.test.ts
?? src/kernel/scale.ts
?? src/registry/decision-rules.test.ts
?? src/registry/decision-rules.ts
?? src/registry/strict.ts
```
```
 agents/router.md                         | 105 ++--
 commands/route.md                        |  18 +-
 dist/engineos.cjs                        | 702 +++++++++++++++++++----
 docs/BIG-PICTURE-lifecycle.html          |   2 +-
 docs/COMPATIBILITY.md                    |  51 +-
 docs/CONTRIBUTING.md                     |   5 +-
 hooks/test-route.sh                      |   7 +-
 registries/agents.json                   |   2 +-
 registries/routing.json                  |  20 -
 scripts/checks/20-registries.sh          |  39 +-
 scripts/checks/40-decision-registries.sh |  10 +-
 scripts/checks/50-kernel.sh              |  15 +-
 scripts/checks/70-runtime.sh             |  12 +-
 scripts/checks/lib.sh                    |   3 +
 scripts/kernel.sh                        | 924 +------------------------------
 scripts/test-kernel.sh                   |  32 +-
 scripts/test-validate-engineos.sh        |  38 +-
 src/kernel/cli.test.ts                   | 186 +++++++
 src/kernel/cli.ts                        | 192 ++++++-
 src/kernel/context.ts                    |  11 +-
 src/kernel/index.ts                      |   5 +-
 src/kernel/parity.test.ts                | 138 +++++
 src/kernel/resolve.test.ts               | 116 +++-
 src/kernel/resolve.ts                    | 236 +++++++-
 src/kernel/risk.test.ts                  |   1 +
 src/kernel/route.test.ts                 | 336 ++++++++++-
 src/kernel/route.ts                      | 148 ++++-
 src/registry/intents.test.ts             |  35 ++
 src/registry/intents.ts                  |  25 +-
 src/registry/policy.test.ts              |  34 ++
 src/registry/policy.ts                   | 113 ++--
 src/registry/routing.ts                  |   6 +-
 test/fixtures/legacy-kernel/README.md    |  30 +-
 33 files changed, 2341 insertions(+), 1256 deletions(-)
```

## Residual risk
- Plan Task 10 invariant text still says `repair` reads `retry.never_retry`; it
  does not. Plan fix owed (docs-only).
- `src/registry/models.ts` keeps its own require helpers; not yet on `strict.ts`.
- `asciiDowncase` lives in `scale.ts` (exported) and privately in `route.ts`;
  a third caller moves it to `src/lib/`.
- Behavioural canaries in `scripts/test-validate-engineos.sh` mutate the
  committed bundle text; an esbuild upgrade that reshapes those lines silently
  turns them into no-ops (the self-test then reports FAIL, so not silent).
- `docs/specs/2026-08-06-decision-kernel-p3-router-agent.md` frozen contracts
  4/5 describe pre-13b wiring; historical record, left as is.

## Notes
Waves: A = decision-rules+scale, intents fields+route-escalate (parallel);
B = integration; C = Task 13 shim swap, Task 13b router docs (parallel).

Wave B (integration) landed: `src/kernel/resolve.ts` gained `escalate`/`taskContract`
prompt modifiers and the `task_contract` composition; `cli.ts` gained the four
projections plus `resolve --facts` with a typed fact parser (unknown fact ->
`resolve --facts: unknown fact <key>`). Deviations accepted: `unknown flag` /
`--prompt requires a value` wording (parseFlags precedent), path+prompt refusal
stands, fact-parser messages are new surface, taskContract refuses explicit
`decisions`/`hitl`. `strict.ts` extracted from policy/decision-rules loaders
(policy.ts was 331 lines). Wave C dispatched: Task 13 shim + guidance cleanup,
Task 13b router doc.

Wave C landed: shim (plan text verbatim), 7 relocation sites in test-kernel.sh
carry dist/engineos.cjs, checks 20/40/70 + lib.sh ADMIT_TS, routing.json -20
lines, CONTRIBUTING/fixture README/COMPATIBILITY; router.md three resolve calls
with kernel.risk/gates kept as projections, commands/route.md jq-built payload,
C18b re-pointed. Orchestrator fixes: test-validate-engineos.sh C18b case +
five behavioural canaries (C20b, C26b x4) now mutate dist/engineos.cjs;
registries/agents.json regenerated; BIG-PICTURE html names resolve.
