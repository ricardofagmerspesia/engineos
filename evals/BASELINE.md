# Routing baseline

Recorded numbers for the three-tier router (plan
`docs/specs/2026-10-10-routing-replacement-plan.md`, contracts rev 2). Grading
definitions live in `evals/RUBRIC.md` ("Shadow tier"). T13d filled the fallback
(Tier 1) column at the approved final stage (`rules/verification.md`). Every
value still reading `pending approved run` needs its own approved run: a
pending value is not a pass, and nothing here may be filled from an estimate,
a prototype or a single manual prompt.

## Run record

| Field | Value |
|---|---|
| Date | 2026-10-11 |
| Source revision (commit) | `b0291ed` (PR #132, `feat/routing-replacement`) plus the uncommitted T13d changes to `evals/intent-routing-cases.jsonl`, `registries/intents.json`, `registries/policy.json` (`router.scoring.note` and `router.tiebreak.note` only), `evals/RUBRIC.md` and `docs/specs/2026-10-10-jev-shadow-request.json` |
| Golden set (`evals/intent-routing-cases.jsonl`) case count / content hash | 284 cases / sha256 `7f76056fd6464b7f327e121d04f83eb32049999571e86e5db87c85bf5e5b61b7` |
| Held-out cases (no `exemplar: true`) | 148 (145 graded, 3 `source: notification`) |
| `registries/intents.json` version / content hash | 2.0.0 / sha256 `8d79dbd9f5d5a14eed657ccde04a37c37c1c108b8b207522a6eba2462590f92f` |
| `registries/policy.json` version (`router.scoring`, `judge.thresholds`) | sha256 `0b6ffe89cb14d85e636dd72496ec1f18422cb6b828d884333a2a23fa4519d871`; `router.scoring` numbers unchanged from `b0291ed`; `judge.thresholds` untouched placeholders |
| Judge model (`policy.judge.model`) | `jev-1.13.0` (not called: no judge request left the machine) |
| Human decision allowing judge requests (T13, contract D5) | pending approved run |
| Bench host (OS, CPU, Node version) | pending approved run (calibration host: Darwin arm64, Apple M5, Node v24.21.0; no bench run) |

### Method

- Fallback numbers come from the shipped kernel answer,
  `node dist/engineos.cjs kernel resolve --facts '{"prompt": <input>, "escalate": true}'`
  (bundle committed at `b0291ed`), run once per case against a scratch copy of
  the registries. The kernel CLI makes no network call and writes no
  telemetry. "Before" is the `b0291ed` registries; "after" is this revision.
  Both are graded on the same 284-case file.
- Every calibration candidate also replayed 67 regression probes: the
  shipped-registry assertions of `kernel.e2e.test.ts`, `resolve.test.ts`,
  `cli.test.ts`, `kernel-route-escalate.e2e.test.ts` and
  `prompt-advisor.test.ts` (silent prompts route nothing), the
  multi-agent decision-rule phrases (must land `llm` or `agent-system`),
  every active intent's first signal routing to its own intent, and the six
  `router.fixtures` (C18e). The final registries hold 67/67. A probe replay
  is not a test run; the suites themselves stay with the supervisor's
  final validation.
- `node dist/engineos.cjs evals` (deterministic tier, `ENGINEOS_EVAL_LIVE`
  and `ENGINEOS_JUDGE` unset) ran twice:
  run 1 `passed 11, failed 1, skipped 284` (check 8, unclosed `must_load`
  sets on intent-034/035, already failing at `b0291ed`, see below); run 2
  `passed 12, failed 0, skipped 284`.
- The 31 `para-<intent>-3` cases are the untuned subset (`evals/RUBRIC.md`
  "Calibration discipline"). Disclosure: their failure list was printed once,
  at the end of tuning; the only weight change after that print (`fastapi` and
  `django` on `backend`, for intent-034/035) left the subset's numbers
  unchanged, and no change was made because of that list.
- Exemplar leakage: the 136 `exemplar: true` cases are BM25 documents, so
  their row is training data. The held-out set also fed the phrase choices
  (it is in-sample for the weights); the untuned subset is the only
  out-of-sample fallback number.

## Intent routing, per tier (held-out set)

| Metric | fallback before (`b0291ed`) | fallback after (T13d) | judge (Jev, folded by contract §4.2) |
|---|---|---|---|
| Macro precision | 0.854 | 0.929 | pending approved run (SKIPPED: 145 cases, no D5 decision) |
| Macro recall | 0.609 | 0.965 | pending approved run (SKIPPED) |
| MRR@3 (cases with `expect_primary`, n=102) | 0.858 | 0.990 | pending approved run (SKIPPED) |
| Exact cases (expected set routed, no extra, primary at rank 1) | 69/145 | 124/145 | pending approved run (SKIPPED) |
| Notification pass rate (`source: notification`) | 3/3 inputs begin with a `router.source_markers.notification` literal (inspection); the hook path that yields `{ "skipped": "not-user-input" }` was not executed: pending approved run | same | pending approved run |
| Judge expectation pass rate (`judge` keys) | n/a | n/a | pending approved run (SKIPPED) |
| Misroute 1 (`other`, no `llm`) | fail: routed `new-feature` | pass: no intent, `ambiguous`, escalates with `unrouted-scale` | pending approved run |
| Misroute 2 (`adr` ahead of `new-feature`) | fail: routed `new-feature` only (`adr` 0.9, below `min_score`) | pass: routed `adr` only (4.5; `new-feature` 0.82) | pending approved run |
| Misroute 3 (notification, no route) | marker present (inspection); hook pending | same | pending approved run |

The kernel does not see the prompt source: the notification skip happens in
the prompt hook (`src/hooks/prompt-source.ts`) before any kernel call, so the
fallback column cannot pass or fail those cases by itself.

### Every set, fallback before -> after

| Set | Graded | Exact | Macro precision | Macro recall | MRR@3 (n) |
|---|---|---|---|---|---|
| All cases | 281 | 130 -> 232 | 0.854 -> 0.919 | 0.585 -> 0.958 | 0.889 -> 0.992 (238) |
| Held-out | 145 | 69 -> 124 | 0.854 -> 0.929 | 0.609 -> 0.965 | 0.858 -> 0.990 (102) |
| Held-out minus the untuned subset | 114 | 60 -> 102 | 0.827 -> 0.940 | 0.703 -> 0.995 | 0.892 -> 1.000 (71) |
| Untuned subset (`para-*-3`) | 31 | 9 -> 22 | 0.769 -> 0.907 | 0.306 -> 0.871 | 0.780 -> 0.968 (31) |
| Exemplar cases (training data) | 136 | 61 -> 108 | 0.847 -> 0.909 | 0.553 -> 0.950 | 0.913 -> 0.993 (136) |
| v1 cases (`intent-001`..`036`) | 36 | 17 -> 35 | | | |

The tuned-to-untuned gap (macro recall 0.995 vs 0.871, macro precision 0.940
vs 0.907) is the overfitting estimate for the phrase weights.

## Intent routing, per intent (held-out set)

One row per active intent in `registries/intents.json` (the inactive
`backend-python` row is excluded). `n/a` marks an undefined ratio. Fallback
cells read `after (before)`.

| Intent | Expected cases | fallback precision | fallback recall | judge precision | judge recall |
|---|---|---|---|---|---|
| new-feature | 3 | 1.000 (0.111) | 0.667 (0.333) | pending approved run | pending approved run |
| big-sweep | 8 | 1.000 (0.625) | 0.750 (0.625) | pending approved run | pending approved run |
| bug | 7 | 1.000 (0.714) | 1.000 (0.714) | pending approved run | pending approved run |
| backend | 10 | 0.714 (0.529) | 1.000 (0.900) | pending approved run | pending approved run |
| frontend | 7 | 0.778 (0.556) | 1.000 (0.714) | pending approved run | pending approved run |
| mobile | 6 | 1.000 (1.000) | 1.000 (0.500) | pending approved run | pending approved run |
| ios-release | 5 | 1.000 (1.000) | 1.000 (0.800) | pending approved run | pending approved run |
| android-release | 3 | 1.000 (1.000) | 1.000 (0.333) | pending approved run | pending approved run |
| llm | 8 | 0.889 (0.700) | 1.000 (0.875) | pending approved run | pending approved run |
| agent-system | 4 | 1.000 (1.000) | 1.000 (0.750) | pending approved run | pending approved run |
| dba | 7 | 0.778 (0.500) | 1.000 (0.143) | pending approved run | pending approved run |
| devops | 5 | 0.833 (1.000) | 1.000 (0.200) | pending approved run | pending approved run |
| security-files | 5 | 0.714 (0.667) | 1.000 (0.800) | pending approved run | pending approved run |
| system-comprehension | 4 | 1.000 (1.000) | 1.000 (0.500) | pending approved run | pending approved run |
| interview-gaps | 3 | 1.000 (1.000) | 1.000 (0.667) | pending approved run | pending approved run |
| qa-endpoints | 4 | 1.000 (1.000) | 1.000 (0.750) | pending approved run | pending approved run |
| audit | 4 | 1.000 (1.000) | 1.000 (0.750) | pending approved run | pending approved run |
| refactor | 4 | 0.800 (0.750) | 1.000 (0.750) | pending approved run | pending approved run |
| adr | 5 | 1.000 (1.000) | 1.000 (0.600) | pending approved run | pending approved run |
| release-notes | 4 | 1.000 (1.000) | 1.000 (1.000) | pending approved run | pending approved run |
| strategy | 4 | 1.000 (1.000) | 0.750 (0.500) | pending approved run | pending approved run |
| review | 4 | 0.500 (0.333) | 1.000 (0.500) | pending approved run | pending approved run |
| test-writing | 4 | 1.000 (1.000) | 1.000 (0.750) | pending approved run | pending approved run |
| eval-setup | 4 | 1.000 (1.000) | 1.000 (0.750) | pending approved run | pending approved run |
| critic-verification | 4 | 1.000 (1.000) | 0.750 (0.250) | pending approved run | pending approved run |
| handoff | 4 | 1.000 (1.000) | 1.000 (0.500) | pending approved run | pending approved run |
| retro | 4 | 0.800 (1.000) | 1.000 (0.750) | pending approved run | pending approved run |
| task-observer | 3 | 1.000 (1.000) | 1.000 (0.333) | pending approved run | pending approved run |
| record-change | 4 | 1.000 (1.000) | 1.000 (0.500) | pending approved run | pending approved run |
| verify-done | 3 | 1.000 (1.000) | 1.000 (0.333) | pending approved run | pending approved run |
| route-planning | 3 | 1.000 (1.000) | 1.000 (1.000) | pending approved run | pending approved run |

Precision drops (devops 1.000 -> 0.833, retro 1.000 -> 0.800) are one false
positive each, bought by the recall gains on the same rows.

### Remaining fallback misses (held-out, 21)

Recorded for the judge tier, which reads meaning rather than words:

- Missed intent: intent-025 (`big-sweep` absent; three domains named, no
  sweep wording), para-new-feature-3, para-big-sweep-3, para-strategy-3,
  para-critic-verification-3 (no calibrated phrase in the wording).
- Co-routed noun: `review` on "review notes", "submit to apple for review" and
  "code review tools" (para-ios-release-2/3, para-strategy-1); `backend` on
  "service", "REST to GraphQL", "migration" (para-refactor-1, para-adr-3,
  para-dba-2, para-route-planning-1); `dba` on "migration"
  (para-critic-verification-1, para-route-planning-1); `security-files` on
  "auth" (para-critic-verification-2); `refactor` on "after the refactor"
  (para-qa-endpoints-1); `devops` on "pipeline" (para-llm-3); `retro` on "the
  retro" (para-task-observer-3).
- The v1 signal `Next` (frontend) matches "next session", "next wave" and
  "next steps" (para-handoff-3 here; ex-handoff-1/3/4 in the exemplar set).
  Signals are kept through the 1.x window (C38), so the fix is a frontend
  negative such as "next session"/"next wave"/"next step"; not added, because
  the case that shows it in the held-out set is in the untuned subset.
- Questions the router should leave alone (traps): trap-prompt (`llm`,
  `security-files` on "prompt" and "guard"), trap-ui (`frontend` on "UI"),
  trap-review (`review` on "review text").

### Existing cases changed, with reasons

- **intent-034, intent-035** (FastAPI/Django prompts): were
  `expect_intents: ["backend-python"]`, `must_load` with `backend-python` and
  `must_not_load: ["backend", "frontend"]`. Unsatisfiable since the Python
  deprecation: `backend-python` is an inactive compatibility row (no
  automatic routing) and `rules/backend-python.md` defers new backend work to
  `rules/backend.md`, so the deterministic tier's closure check (check 8)
  failed on both cases at `b0291ed` already. Now `expect_intents: ["backend"]`,
  `must_load` = the backend row's rules, `must_not_load:
  ["backend-python", "frontend"]`; `fastapi` and `django` were added to the
  backend phrases so both route there, where the backend agent reports the
  unsupported stack. This tracks a rule change; it does not weaken coverage.
- No other v1 case changed. intent-025 still fails (was missing `dba`, now
  missing `big-sweep` only, because `migration` moved to `dba`). The other
  34 v1 cases pass; 17 passed at `b0291ed`.
- ex-new-feature-1 ("add a csv export button to the invoices page") and
  ex-task-observer-3 passed before and fail now: the first routes `frontend`
  and `frontend` suppresses `new-feature` (CLAUDE.md: a more specific matching
  row suppresses new-feature); the second co-routes `retro` because the prompt
  says "for the retro". Exemplar cases carry exactly one intent by schema, so
  both read as misses although the routes follow the router's own rules.

## Calibrated thresholds

| Threshold | Value |
|---|---|
| `router.scoring.min_score` | 1.0 (kept). Sweep on the tuned held-out set: 0.8 -> macro precision 0.745 and 6 broken probes (silent prompts route); 1.2 -> precision 0.945, recall 0.958 (from 0.995), exact 99 (from 102). 1.0 keeps every weight-1 signal routing alone |
| `router.scoring.threshold` | 0.0 (kept). 0.15 and 0.2 move no metric; 0.2 marks "add a fix for something broken" ambiguous (a pinned kernel.e2e behavior). Top confidence below 0.20 flags 2 of 107 routed cases, 1 of them wrong, against 12 wrong overall: not a misroute predictor |
| `router.scoring.margin` | 0.0 (kept). 0.05 and 0.1 move no metric; 0.1 adds `low-confidence` to router fixtures 1 and 3 (C18e). Margin below 0.1 flags 3 routed cases, none wrong |
| `router.scoring.bm25_weight` | 0.9 (kept). 0.5 -> precision 0.942, recall 0.985, MRR 0.986; 0.7 -> 0.940 / 0.985 / 1.000; 0.9 and 0.95 -> 0.940 / 0.995 / 1.000. Stays below `min_score` so exemplar similarity alone never routes |
| `router.scoring.path_weight` | 1.0 (kept). 0.5 and 1.5 give identical results (path facts appear in 2 cases) |
| `router.scoring.top_k` / `max_intents` | 5 / 8 (not swept: the largest routed set on the golden set is 7 intents, notification-2, which the prompt hook skips) |
| `router.tiebreak.min_similarity` / `margin` | 0.6 / 0.1, placeholders: calibrating needs the pinned MiniLM daemon, whose model download is outside an offline run. Tie-break margin decision below |
| `judge.thresholds.intent_default` | pending approved run (judge block outside T13d) |
| `judge.thresholds.primary_confidence` | pending approved run |
| `judge.thresholds.margin` | pending approved run |
| `judge.thresholds.rule_default` | pending approved run |

### Phrase, negative and pair weights (`registries/intents.json`)

The fallback gain comes from the rows, not from `router.scoring`. Per active
row: phrases before -> after (added), reweighted phrases, negatives before ->
after, and the `verb_object` weight (placeholder 0.05 before; a pair alone
stays below `min_score`, a pair plus the top exemplar similarity can route).

| Row | Phrases | Reweighted | Negatives | verb_object |
|---|---|---|---|---|
| new-feature | 4 -> 7 (+3) | | 0 -> 10 | |
| big-sweep | 4 -> 12 (+8) | migration 1 -> 0.3 | 0 | |
| bug | 5 -> 18 (+13) | | 0 -> 3 | |
| backend | 13 -> 23 (+10) | migration 1 -> 0.3 | 0 -> 5 | 0.05 -> 0.5, terms widened |
| frontend | 6 -> 19 (+13) | | 0 -> 4 | 0.05 -> 0.5, terms widened |
| mobile | 9 -> 13 (+4) | | 0 -> 2 | 0.05 -> 0.5 |
| ios-release | 6 -> 12 (+6) | | 0 | |
| android-release | 5 -> 12 (+7) | | 0 | |
| llm | 21 -> 28 (+7) | | 5 -> 15 | 0.05 -> 0.4 |
| agent-system | 14 -> 21 (+7) | multi-agent, multi agent, multiagent, orchestrate, orchestration, orchestrator 1 -> 1.5 | 5 -> 9 | |
| dba | 5 -> 17 (+12) | | 0 | 0.05 -> 0.5, terms widened |
| devops | 6 -> 19 (+13) | | 0 | 0.05 -> 0.5, terms widened |
| security-files | 6 -> 16 (+10) | | 0 | |
| system-comprehension | 4 -> 11 (+7) | | 0 | |
| interview-gaps | 3 -> 8 (+5) | | 0 | |
| qa-endpoints | 4 -> 12 (+8) | | 0 | |
| audit | 4 -> 9 (+5) | | 0 | |
| refactor | 4 -> 9 (+5) | | 0 -> 1 (`local` 0.5) | 0.05 -> 0.5 |
| adr | 2 -> 16 (+14) | | 0 -> 1 | 0.05 -> 0.5, terms widened |
| release-notes | 4 -> 7 (+3) | | 0 | 0.05 -> 0.5 |
| strategy | 7 -> 14 (+7) | | 0 | |
| review | 3 -> 8 (+5) | | 0 -> 5 | |
| test-writing | 3 -> 10 (+7) | | 0 | 0.05 -> 0.5 |
| eval-setup | 3 -> 7 (+4) | | 0 | |
| critic-verification | 3 -> 10 (+7) | | 0 | |
| handoff | 3 -> 8 (+5) | | 0 -> 3 | |
| retro | 4 -> 10 (+6) | | 0 | |
| task-observer | 4 -> 9 (+5) | | 0 | |
| record-change | 3 -> 9 (+6) | | 0 | |
| route-planning | 5 -> 9 (+4) | | 0 | |
| verify-done | 5 -> 12 (+7) | | 0 | |

Signals, exemplars, per-intent `threshold` values and `router_row` cells are
unchanged, so the generated CLAUDE.md/AGENTS.md router table (C38d) does not
move. `migration` moved to `dba` (weight 1) because the schema owner is the
DBA row; on big-sweep and backend it now contributes 0.3. A local rename stays
unrouted (`refactor` negative `local`), which keeps intent-032 passing.

### Tie-break margin (contracts §4.7)

`tiebreak-facts.ts` declines to narrow when `best.score - second.score <
policy.margin`, compared as floats. With two-decimal inputs, 0.7 - 0.6 is
0.09999999999999998, below 0.1, so a gap of exactly 0.1 does not narrow.
Decision: keep `router.tiebreak.margin` 0.1 and the literal float comparison.
Not narrowing is the fail-closed side, because the tie-break only removes
intents from an ambiguous deterministic answer; a borderline gap keeps the
full answer. The daemon returns unrounded cosine similarities, so an exact
0.1 gap arises only in hand-written two-decimal fixtures. The tie-break is
also inert while `router.scoring.threshold` and `margin` are 0, since only an
ambiguous route reads it. A test that pins this edge (0.70 against 0.60 does
not narrow) and a contracts note belong to T13 tests and the contracts owner.

## Hook latency, per bench scenario (`engineos bench`)

Milliseconds. The 1.7.0 numbers in the plan (§2) were recorded before the
bundle split and S0/S1; they are context, not this baseline.

| Scenario | p50 | p95 |
|---|---|---|
| prompt-routing | pending approved run | pending approved run |
| direct-edit-cold | pending approved run | pending approved run |
| direct-edit-warm | pending approved run | pending approved run |
| agent-dispatch | pending approved run | pending approved run |
| agent-return | pending approved run | pending approved run |
| final-gate | pending approved run | pending approved run |
| bash-noop | pending approved run | pending approved run |
| hot-bundle-load | pending approved run | pending approved run |
| full-bundle-load | pending approved run | pending approved run |

## Runtime budgets (`engineos bench`)

| Budget line | Budget | Actual |
|---|---|---|
| route-intent | 250 ms | pending approved run |
| resolve-task | 500 ms | pending approved run |
| prompt-advisor (end to end) | 600 ms | pending approved run |
| route-before-change (cache hit) | 150 ms | pending approved run |
| always-on context | 32000 bytes | pending approved run |
| per-call hook bundle | 320000 bytes | pending approved run |

## Classifier cost

| Metric | Target | Actual |
|---|---|---|
| `scoreIntents` per prompt on the bench host (contract §9.3) | < 1 ms | pending approved run |
| Judge request latency p50 / p95 (journaled `latency_ms`) | within `policy.judge.timeout_ms` (400 ms) | pending approved run |
