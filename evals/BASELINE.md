# Routing baseline

Recorded numbers for the three-tier router (plan
`docs/specs/2026-10-10-routing-replacement-plan.md`, contracts rev 2). Grading
definitions live in `evals/RUBRIC.md` ("Shadow tier"). Every value below reads
`pending approved run` until T13 runs the golden set and the bench at the
approved final stage (`rules/verification.md`). A pending value is not a pass,
and nothing here may be filled from an estimate, a prototype or a single
manual prompt.

## Run record

| Field | Value |
|---|---|
| Date | pending approved run |
| Source revision (commit) | pending approved run |
| Golden set (`evals/intent-routing-cases.jsonl`) case count / content hash | pending approved run |
| Held-out cases (no `exemplar: true`) | pending approved run |
| `registries/intents.json` version / content hash | pending approved run |
| `registries/policy.json` version (`router.scoring`, `judge.thresholds`) | pending approved run |
| Judge model (`policy.judge.model`) | pending approved run |
| Human decision allowing judge requests (T13, contract D5) | pending approved run |
| Bench host (OS, CPU, Node version) | pending approved run |

## Intent routing, per tier (held-out set)

| Metric | fallback (Tier 1 scored classifier) | judge (Jev, folded by contract §4.2) |
|---|---|---|
| Macro precision | pending approved run | pending approved run |
| Macro recall | pending approved run | pending approved run |
| MRR@3 (cases with `expect_primary`) | pending approved run | pending approved run |
| Notification pass rate (`source: notification`) | pending approved run | pending approved run |
| Judge expectation pass rate (`judge` keys) | n/a | pending approved run |
| Misroute 1 (`other`, no `llm`) | pending approved run | pending approved run |
| Misroute 2 (`adr` ahead of `new-feature`) | pending approved run | pending approved run |
| Misroute 3 (notification, no route) | pending approved run | pending approved run |

The same table over every case (exemplar cases included) is recorded beside it
in the T13 run and labelled as such; promotion reads the held-out table only.

## Intent routing, per intent (held-out set)

One row per active intent in `registries/intents.json` (the inactive
`backend-python` row is excluded). `n/a` marks an undefined ratio.

| Intent | Expected cases | fallback precision | fallback recall | judge precision | judge recall |
|---|---|---|---|---|---|
| new-feature | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| big-sweep | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| bug | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| backend | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| frontend | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| mobile | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| ios-release | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| android-release | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| llm | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| agent-system | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| dba | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| devops | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| security-files | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| system-comprehension | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| interview-gaps | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| qa-endpoints | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| audit | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| refactor | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| adr | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| release-notes | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| strategy | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| review | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| test-writing | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| eval-setup | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| critic-verification | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| handoff | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| retro | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| task-observer | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| record-change | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| verify-done | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |
| route-planning | pending approved run | pending approved run | pending approved run | pending approved run | pending approved run |

## Calibrated thresholds

Placeholders in `registries/policy.json` today; T13 records the calibrated
values here and in the registry together.

| Threshold | Value |
|---|---|
| `router.scoring.min_score` | pending approved run |
| `router.scoring.threshold` | pending approved run |
| `router.scoring.margin` | pending approved run |
| `router.scoring.bm25_weight` | pending approved run |
| `router.scoring.path_weight` | pending approved run |
| `judge.thresholds.intent_default` | pending approved run |
| `judge.thresholds.primary_confidence` | pending approved run |
| `judge.thresholds.margin` | pending approved run |
| `judge.thresholds.rule_default` | pending approved run |

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
