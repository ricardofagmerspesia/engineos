---
name: 2026-10-06-routing-decision-layer
status: active
owner: Sergio Hermsdorff
spec: docs/specs/2026-10-06-routing-decision-layer-design.md
domain: llm
---

## What
Replace keyword-only prompt routing with a stack-aware deterministic floor plus a
selectable decision layer (keyword | llm | jev) behind a deterministic switch, with
shadow logging that feeds an end-to-end golden set which later writes the default.

## Why
Measured 2026-10-06: in a FastAPI repo every generic backend prompt loads the NestJS
rules and skill, because routing matches literal keywords and never consults the
repository's stack. The injected contract is the hallucination source.

## Scope
See spec §5 and contracts §6. Kernel (`route.ts`, new `decision-layer.ts`,
`resolve.ts`), registries (`intents.json`, `policy.json`, `project-config`),
prompt-advisor rendering + span, evals, router agent brief, prose, docs.
No new runtime dependency; `TYPESAFE_API_KEY` only in personal settings / CI secrets.

## Checklist
- [x] Plan drafted and refined with the developer (spec + contracts)
- [x] Wave 1 — (a) floor: stack rebind, generic_only, validator check · (b) stack-tagged eval cases, config `router.mode`, policy `router_decision` · barrier fix: framework-first, package-first rebind + `fixtures` skipped in detection (contracts §2 amendment)
- [x] Wave 2 — decision layer (modes, restrictiveness, fallback, Jev client; async, called by the hook), async hook dispatch, advisor rendering + span + cache, framework-aware `offered`, router agent brief + prose
- [ ] Wave 3 — shadow collect script, docs, COMPATIBILITY
- [ ] Later, after real use — golden set curated and run; `router_decision.default` written by the run

## What was made
<filled on completion>

## Verification
Wave 1 barrier (2026-10-07): typecheck clean; full suite in a scratch mirror without console/node_modules 2362 tests, 0 failed, 23 skipped; validator 116/116; evals 13/13 deterministic incl. 19 stack-tagged cases. Live, rebuilt kernel, five generic backend prompts (endpoint, service, controller, migration, worker): backend-python from labv-assist, the opensearch demo (root and backend/), portal_dds (root, backend/, frontend/), portal_nexxus, projeto_ppp, lana_documento_ssma; backend from gest_leite and from the EngineOS repo itself. The prompt hook does not pass the project yet (wave 2b), so sessions still route by keywords until then.
Wave 2 barrier (2026-10-07): typecheck clean; full suite in a mirror 2441 tests, 0 failed, 23 skipped; validator 116/116; evals 13/13 incl. 19 stack cases. Live through the real prompt-advisor hook (no TYPESAFE_API_KEY in env): portal_dds (root, backend/), portal_nexxus, labv-assist → backend-python + python-patterns, `rebound=backend->backend-python(framework/…)`; gest_leite → backend, no rebound; `ENGINEOS_ROUTER=jev` without a key → `[engineos] router: keyword (jev unavailable: no-key)`. The `claude` CLI is not on the hook's PATH here, so `auto` resolves to keyword on this machine.
Planned: typecheck, `npm test`, `validate-engineos.sh`, `run-evals.sh`; live kernel
runs from labv-assist (python) and gest_leite (node) with the five measured prompts;
Jev client against a fake fetch; fallback paths; real run against the installed hook
after `install.sh`.

## Human decisions
<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
- 2026-10-06 | Sergio Hermsdorff | design | approved | Jev + LLM router, selectable by a deterministic switch; a mode that sends nothing to TypeSafe must exist; keyword stays as floor/fallback
- 2026-10-06 | Sergio Hermsdorff | design | approved | the default mode is never hardcoded: written by the end-to-end golden-set run; shadow logging until then
- 2026-10-06 | Sergio Hermsdorff | design | approved | open questions settled as proposed: generic_signals per row; restrictiveness keyword<llm<jev<auto; thresholds in policy.json (400 ms / 0.6 / 0.15); Jev state = prompt+languages+frameworks+files named; single choice + specific extras; llm mode = in-session router agent on the residue; client repos declare keyword or llm

## Changes registered
<filled on completion>

## Notes
- Wave 2 deviations accepted: `Decision.escalate_reason` added (tie vs needs-router is not derivable); decision cache key also includes frameworks, focus package and requested setting; contract line says "Router dispatch needed" when the router line follows; C27c accepts `withSpanAsync`.
- Open: under `llm`, every generic-only prompt escalates to the router agent even when the stack floor already settled it — cost to weigh before `llm` can win the golden set.
- Barrier findings, fixed before commit: (1) the contract said "stack from ctx.root", but root is the EngineOS checkout — `KernelContext.project`/`projectCwd` added; (2) a language-only rebind left every FastAPI+React repo on NestJS — `stack_frameworks`, framework-first then language, focus package first then repo; (3) EngineOS's own `test/fixtures/py-fastapi` made the repo look like FastAPI — `fixtures` added to the detector's skip list.
- Open for wave 2: should an explicitly named framework ("build it with FastAPI" in a node-only repo) beat the rebind? Recommended yes; awaiting the developer.
- `console/node_modules` (created 2026-09-29 by Claude for the console CI fix) makes the in-repo `npm test` copy ~500 MB per check case; deletion awaits the developer's approval.
- Git writes: every commit is asked for explicitly (ENGINEOS_GIT_WRITES=ask; Sergio's rule).
- Journal: shadow data rides in existing span fields (provider, model, note); no schema change this round.
