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
- [x] Wave 3b — hand-backs/notifications kept out of the prompt hook; wave 3c (2026-10-13) — keyword is never the implicit default: `auto` → `jev` or `llm`, the CLI probe removed, every Jev failure degrades to `llm`, the fallback line names the mode that took over
- [x] Wave 3 — `router-golden collect` (shadow spans joined to transcript prompts → gitignored candidates), `router-golden run` (every mode graded end to end, RESULTS.md, `--write-default` as the only writer of the default), README, START/CODEBASE_MAP/COMPATIBILITY
- [ ] Later, after real use (the developer's step) — install the new bundle so sessions write shadow spans, collect across repos, curate `evals/router-golden/cases.jsonl`, `router-golden.sh run --write-default`; `router_decision.default` stays `null` until then

## What was made
- Wave 1: the keyword floor became stack-aware. Intents gained `stack`, `stack_sibling`, `stack_frameworks` and `generic_signals`; a stack-bearing intent the repository cannot use is rebound to its sibling (frameworks first, focus package before repo, then languages), and every route reports `rebound` and `generic_only`. `policy.json` gained the `router_decision` block with its own strict loader, `.engineos/config.json` gained `router.mode` (`init --router`), and intent eval cases gained `stack`, routed through the real kernel in throwaway projects. A validator check guards the new intent fields.
- Wave 2: the decision layer (`src/kernel/decision-layer.ts`) chooses who decides the intents — `keyword`, `llm` (in-session router agent on the residue) or `jev` (one TypeSafe call under a 400 ms deadline, offered only stack-eligible intents) — from the personal setting capped by the repo's, falling back to keyword visibly on any failure. The hook dispatcher became async-capable, the prompt advisor runs resolve-task then the decision, renders `router=<mode>[/<confidence>]` plus fallback and escalation lines, caches decisions per session, and writes the shadow facts into the router span (`provider`, `model`, `note`). The router agent brief and the routing prose followed.
- Wave 3d (2026-10-13): Jev is the shipped default. `router_decision.default: "jev"` with a developer-decision provenance (`date`, `decided_by`, `reason`), a second provenance shape the strict loader now admits beside the golden-set one (a row mixing both, or a default with none, is refused). `decide` always carries `shadow`, so the golden set keeps collecting under a written default; `router-golden run --write-default` with no winner leaves a developer decision untouched and only retires a golden-set winner. An unset `ENGINEOS_ROUTER` now means `jev`; without a key every prompt says `router: llm (jev unavailable: no-key)`. Jev budget 400 → 1000 ms after the live run. Prose: START, CLAUDE, AGENTS, CODEBASE_MAP, golden README, contracts amendment.
- Wave 3c (2026-10-13): the installed hook showed `router=keyword` under `auto` because `resolveAuto` probed for a `claude` executable on the hook's PATH (a leftover of the rejected in-hook `claude -p` variant) and fell to keyword without it. The chosen `llm` mode is the in-session router agent and needs nothing on the machine, so the probe, `DecisionDeps.hasClaudeCli` and the `no-cli` reason are gone: `auto` is `jev` with a key, else `llm`. Every Jev failure now returns the llm verdict (floor intents, llm escalation rule, `fallback_reason` set), the advisor's thrown-path fallback is `llm` unless the personal setting is `keyword` (read before the policy loads), the span records that mode, and the fallback line reads `[engineos] router: <mode> (<requested> unavailable: <reason>)`. `keyword` is produced only when a setting names it. Contracts amended (2026-10-13 block), START/CLAUDE/AGENTS/BIG-PICTURE/CODEBASE_MAP/COMPATIBILITY/golden README reworded.
- Wave 3: `scripts/router-golden.sh` (`engineos router-golden`). `collect` reads each repo's router spans, joins each to the human prompt that fired it via the session transcript, resolves the repo's stack, and appends de-duplicated candidates to the gitignored `evals/router-golden/candidates.local.jsonl`, printing counts only. `run` grades every mode on the curated `cases.jsonl` through resolve-task and the advisor's `routeDecision` in throwaway stack projects (stack project builder extracted from the stack-routing tier and shared), writes `RESULTS.md`, and with `--write-default` applies the acceptance rule and rewrites only `default`/`default_written_by` in place, restoring the file if the strict loader refuses it. README for the set; START, CODEBASE_MAP and COMPATIBILITY updated. `default` remains `null`.

## Verification
Wave 1 barrier (2026-10-07): typecheck clean; full suite in a scratch mirror without console/node_modules 2362 tests, 0 failed, 23 skipped; validator 116/116; evals 13/13 deterministic incl. 19 stack-tagged cases. Live, rebuilt kernel, five generic backend prompts (endpoint, service, controller, migration, worker): backend-python from labv-assist, the opensearch demo (root and backend/), portal_dds (root, backend/, frontend/), portal_nexxus, projeto_ppp, lana_documento_ssma; backend from gest_leite and from the EngineOS repo itself. The prompt hook does not pass the project yet (wave 2b), so sessions still route by keywords until then.
Wave 2 barrier (2026-10-07): typecheck clean; full suite in a mirror 2441 tests, 0 failed, 23 skipped; validator 116/116; evals 13/13 incl. 19 stack cases. Live through the real prompt-advisor hook (no TYPESAFE_API_KEY in env): portal_dds (root, backend/), portal_nexxus, labv-assist → backend-python + python-patterns, `rebound=backend->backend-python(framework/…)`; gest_leite → backend, no rebound; `ENGINEOS_ROUTER=jev` without a key → `[engineos] router: keyword (jev unavailable: no-key)`. The `claude` CLI is not on the hook's PATH here, so `auto` resolves to keyword on this machine.
Wave 3 (2026-10-12): typecheck clean; router-golden + stack-routing suites 25/25; full suite in a mirror 2457 tests, 0 failed, 23 skipped; validator 116/116; evals 13/13 (55 live skipped); `router-golden.sh collect` on this repo: spans read 84, no decision 83, non-human 1, appended 0 (the installed hook predates wave 2, so almost no span carries a decision yet); `router-golden.sh run`: no cases, exit 0.
Wave 3c (2026-10-13): typecheck clean; decision-layer + advisor-router + guidance + cache + router-golden suites 93/93; validator 116/116; evals 13/13 (55 live skipped); rebuilt `dist/engineos.cjs` and ran the real prompt hook from labv-assist with the `claude` CLI deliberately off PATH and no key: `auto` → `router=llm` plus the generic-only handoff line; `ENGINEOS_ROUTER=jev` without a key → `router=llm` and `[engineos] router: llm (jev unavailable: no-key)`; `ENGINEOS_ROUTER=keyword` → `router=keyword`, no fallback line. Wave 3d (2026-10-13): typecheck clean; loader + decision-layer + advisor + guidance + cache + golden suites 125/125; validator and evals rerun (see below); real hook with nothing set and no key → `router=llm` plus `[engineos] router: llm (jev unavailable: no-key)`, shadow note still written.
Jev live end-to-end (2026-10-13, Sergio's key exported in his own shell, script `.engineos/tmp/jev-e2e.sh`, labv-assist): 7 prompts, 5 real calls all answered and parsed (confidence 0.85–0.98, 363–399 ms in the layer, 500–650 ms hook wall time), cache hit on the repeat (15 ms), pure question made no call, key absent from telemetry and cache; two floor disagreements both in Jev's favour (bug over backend-python, dba first on a migration prompt); multi-agent prompt kept the topology-approval HITL line. Found: when the kernel itself escalates, Jev's pick reaches only the span and cache, not the rendered line (open); `cost_micros` null on every span — the response carries no `usage.cost` where it is read (open).
Full suite in a scratch mirror without console/node_modules: 2470 tests, 2446 passed, 23 skipped, 1 failed — `init refuses the engineos repo with 3`, a mirror artifact (the mirror carried no `.git`, so init answered 2 "not a git repo"); that file reruns 36/36 from the real checkout.
Planned: typecheck, `npm test`, `validate-engineos.sh`, `run-evals.sh`; live kernel
runs from labv-assist (python) and gest_leite (node) with the five measured prompts;
Jev client against a fake fetch; fallback paths; real run against the installed hook
after `install.sh`.

## Human decisions
<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
- 2026-10-06 | Sergio Hermsdorff | design | approved | Jev + LLM router, selectable by a deterministic switch; a mode that sends nothing to TypeSafe must exist; keyword stays as floor/fallback
- 2026-10-06 | Sergio Hermsdorff | design | approved | the default mode is never hardcoded: written by the end-to-end golden-set run; shadow logging until then
- 2026-10-13 | Sergio Hermsdorff | design | approved | Jev is the shipped default (`router_decision.default: jev`, provenance = this decision), superseding "the default mode is never hardcoded" below; a golden-set run with a strictly better mode may still overwrite it; shadow logging stays on regardless
- 2026-10-13 | Sergio Hermsdorff | design | approved | Jev budget 400 → 1000 ms after the first live end-to-end run (real calls 363–399 ms, one at the old budget)
- 2026-10-13 | Sergio Hermsdorff | design | approved | the keyword floor is never the implicit default: `auto` without a key is `llm`, and a Jev failure degrades to `llm`, not keyword (supersedes "keyword stays as fallback" above; keyword stays as the floor every mode starts from and as an explicit setting)
- 2026-10-06 | Sergio Hermsdorff | design | approved | open questions settled as proposed: generic_signals per row; restrictiveness keyword<llm<jev<auto; thresholds in policy.json (400 ms / 0.6 / 0.15); Jev state = prompt+languages+frameworks+files named; single choice + specific extras; llm mode = in-session router agent on the residue; client repos declare keyword or llm

## Changes registered
Commits on `feat/routing-decision-layer` (`git log --oneline 571a633..HEAD`, base = the merged Python-stack work):
```
11fb255 fix(hooks): route only the human part of a prompt; hand-backs and notifications stay silent
e0bb2ba feat(routing): router-golden collect/run tooling, docs close-out, change record (wave 3)
dae8e52 feat(routing): async decision layer with keyword/llm/jev switch, wired into the prompt hook; shadow logging (wave 2)
b229853 feat(routing): stack-aware routing floor, framework-first rebind, router_decision policy and stack-tagged evals (wave 1)
```
Working tree at close: clean except `PR-python-stack-and-agent-design.md` (pre-existing, not part of this change).

## Notes
- Wave 3b (2026-10-12): UserPromptSubmit fires for subagent hand-backs, task/system notifications and local-command echoes, and the hook had been routing them (a task contract on every agent report all session; spans that would have polluted the golden set). Fixed by stripping leading harness blocks and routing the residue; a prompt that is harness text end to end is silent. Verified live: hand-back → no output; reminder block + prompt → contract for the prompt.
- Wave 2 deviations accepted: `Decision.escalate_reason` added (tie vs needs-router is not derivable); decision cache key also includes frameworks, focus package and requested setting; contract line says "Router dispatch needed" when the router line follows; C27c accepts `withSpanAsync`.
- 2026-10-13, Sergio: "the default should not be keyword" — applied as wave 3c; recorded under Human decisions.
- Open: under `llm`, every generic-only prompt escalates to the router agent even when the stack floor already settled it — cost to weigh before `llm` can win the golden set.
- Barrier findings, fixed before commit: (1) the contract said "stack from ctx.root", but root is the EngineOS checkout — `KernelContext.project`/`projectCwd` added; (2) a language-only rebind left every FastAPI+React repo on NestJS — `stack_frameworks`, framework-first then language, focus package first then repo; (3) EngineOS's own `test/fixtures/py-fastapi` made the repo look like FastAPI — `fixtures` added to the detector's skip list.
- Open for wave 2: should an explicitly named framework ("build it with FastAPI" in a node-only repo) beat the rebind? Recommended yes; awaiting the developer.
- `console/node_modules` (created 2026-09-29 by Claude for the console CI fix) makes the in-repo `npm test` copy ~500 MB per check case; deletion awaits the developer's approval.
- Git writes: every commit is asked for explicitly (ENGINEOS_GIT_WRITES=ask; Sergio's rule).
- Wave 3 deviations: the module is split into six files (cli, cases, collect, transcript, run, policy) to stay under the ~300-line rule; candidates also carry `frameworks` (contracts §5 shape) and `shadow.escalate`; the span records the decided intents only as `route`, so a disagreeing candidate's `shadow.intents` is the primary only; `--write-default` refuses a run that did not score every policy mode, and a no-winner run writes `null`/`null` (retiring an earlier winner); `run` uses the in-process advisor path in throwaway stack projects rather than `dist/engineos.cjs` against each repo's checkout (brief over contracts §5).
- UserPromptSubmit also fires for subagent hand-backs and task notifications (verified in a live transcript 2026-10-12): those spans are routed and are counted `non-human` by `collect`, never attributed to a human prompt. Whether the hook should skip them at all is open.
- Journal: shadow data rides in existing span fields (provider, model, note); no schema change this round.
