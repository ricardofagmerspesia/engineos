# EngineOS Eval Rubric

Plan golden-set criteria before prompt/agent changes; author/run cases only after
integration and explicit current-task final approval (`rules/verification.md`).
This directory defines EngineOS’s own router/agent evaluation contract.

## What is graded

| Suite | File | Grading |
|---|---|---|
| Intent routing | `intent-routing-cases.jsonl` | Approved final deterministic conformance; separately scoped live grading |
| Agent behaviour | `agent-cases.jsonl` | Approved final deterministic conformance; separately scoped live grading |
| Path routing | covered by `src/hooks/route-before-change.e2e.test.ts` | Deterministic, approved final test suite |

Run: `scripts/run-evals.sh`. Live grading: `ENGINEOS_EVAL_LIVE=1 scripts/run-evals.sh`
(requires the `claude` CLI on PATH). Without it the runner reports the live tier
as SKIPPED with a count — never as passed.

## Deterministic tier (always runs, gates CI)

Historical heading retained; execution now requires approved final-stage testing.

Checks case/schema drift against current policy.

1. Every line is valid JSON with the required fields.
2. Every `must_load` / `must_not_load` entry names a rule that exists in `rules/`.
3. Every `agent` names a file in `agents/` (or the literal `any`).
4. No case sets the same rule in both `must_load` and `must_not_load`.
5. Every `must_load` set is **closed** — if it loads a rule that defers to a
   non-always-on rule, that rule is in the set too. An eval case may not encode
   an expectation that violates CLAUDE.md's closure rule.
6. Always-on rules are not listed in `must_not_load` — they are always loaded, so
   such an expectation could never pass.
7. `expect_risk`, when present, is a real tier (`low` / `medium` / `high`) and is
   **at or above** the `risk_floor` that `registries/routing.json` sets for every
   expected domain. Resolve case/registry disagreements before approving execution.
8. **Case schema v2 shape** (conditional) — printed only when at least one case
   carries a v2 field, so a v1-only set keeps its exact output and pass count.
   Fails on any problem listed under "Case schema v2" below. Its lines read
   `ok   v2 case fields are well-formed and name active intents` or
   `FAIL v2 field problems: <id>(<problem>) ...`.

9. A case MAY carry `stack`: a non-empty list of packages, each `<language>` or
   `<language>:<framework>` (`["python"]`, `["python:fastapi", "node:react"]`) —
   the packages of the repository the prompt is typed in. A stack-tagged case is
   routed through the real kernel (`resolve` with `taskContract`, the prompt
   advisor's own call) with a throwaway project holding one directory per entry
   and only that package's manifest, naming the framework as a dependency when
   one is given. It passes when every `expect_intents` id survives and no
   surviving intent declares a stack the case lacks. This is the guard on the
   keyword floor's stack rebind (`registries/intents.json` `stack` /
   `stack_sibling` / `stack_frameworks`: framework evidence first, language
   second). An entry whose language is not `python` / `node`, whose framework is
   unknown or belongs to the other language, or a repeated entry, is malformed.

The coverage floor (25 intent cases) is a separate size line, not a numbered check.

## Case schema v2

Contract: `docs/specs/2026-10-10-routing-replacement-contracts.md` §8 (rev 2).
The v1 fields (`id`, `input`, `expect_intents`, `must_load`, `must_not_load`,
`notes`, optional `expect_risk`) are unchanged. Every v2 field is optional, and
an unrelated extra key is still not a failure.

| Field | Type | Meaning | Deterministic check (check 8) |
|---|---|---|---|
| `expect_primary` | string | The single best intent for the prompt: an active intent id, or `other` for a project change that no active intent covers (for example configuring Claude Code itself) | Names an active intent (`enabled` is not `false` in `registries/intents.json`) or `other`; absent on a `notification` case |
| `expect_not_intents` | string[] | Intent ids that must be absent from the tier's `intents` | Every entry is a registry intent id; none equals `expect_primary` or appears in `expect_intents` |
| `exemplar` | `true` | The case's `input` seeds `intents.json` `exemplars` for its one intent | Value is exactly `true`; `expect_intents` has exactly one entry and it is an active intent id; `expect_primary`, when present, equals that entry; not a `notification` case |
| `source` | `"user"` \| `"notification"` | Who wrote the text. Default `user`. A `notification` case is text the user did not type (a background-task report, a tool result) and expects no route at all (speed step S0) | One of the two values; a `notification` case has empty `expect_intents` and no `expect_primary` or `judge` |
| `judge` | object | Shadow-tier expectations on the judge's answers (below) | Shape only: an object; `primary` an active intent or `other`; `intent_above`, `intent_below`, `fact_above`, `fact_below` arrays of non-empty strings, with no entry both above and below; `design_work_above` a number in `[0, 1]` |

`judge` keys, all optional:

| Key | Holds when |
|---|---|
| `primary` | the `primary_intent` Choice's top option equals it |
| `intent_above` / `intent_below` | each `intent.<id>` Noul is at or above / below that intent's threshold (`intents.json` row `threshold`, else `policy.judge.thresholds.intent_default`) |
| `fact_above` / `fact_below` | each `fact.<name>` Noul is at or above / below its decision rule's `judge_threshold`, else `policy.judge.thresholds.rule_default` |
| `design_work_above` | the `design_work` Noul is strictly above the value |

`expect_intents` is still not checked against registry ids: v1 cases name
router-table rows with labels that are not intent ids (see the alias table
below). Relabelling them is a golden-set authoring decision.

## Shadow tier (approved final stage only)

The shadow tier compares two answers for every user-sourced intent case:

- **fallback** — the deterministic kernel answer with the judge off: Tier 1
  scored classifier (`route.ranked`, `route.intents`; `judge.source=fallback`).
- **judge** — the Jev answer folded by contract §4.2 (`noul-then-primary`):
  every `intent.<id>` Noul at or above its threshold, else `primary_intent`
  when its confidence clears `policy.judge.thresholds.primary_confidence`, else
  no intents and `ambiguous`.

Neither answer is graded live until the developer records the T13 human
decision that allows prompts to leave the machine (contract D5). A run without
that decision reports the judge column as SKIPPED with a count, never as passed.

### Metrics, per tier

| Metric | Definition |
|---|---|
| Precision per intent | `TP / (TP + FP)` over the graded cases. TP: the intent is in the tier's `intents` and in the case's expected set. FP: it is in `intents` but not expected, or it is listed in `expect_not_intents` |
| Recall per intent | `TP / (TP + FN)`. FN: expected but absent from the tier's `intents` |
| Macro precision / recall | Unweighted mean over the active intents that have at least one expected case |
| MRR@3 | Over cases with `expect_primary`: `1 / rank` of `expect_primary` in the tier's top three (fallback: `route.ranked`; judge: `primary_intent` options by probability), `0` when absent. `expect_primary: "other"` counts as rank 1 when the tier routes no intent and as `0` otherwise |
| Notification pass rate | `source: notification` cases pass only when no kernel call and no judge request was made: the route event reads `{ "skipped": "not-user-input" }` |
| Judge expectation pass rate | `judge` keys that hold, over `judge` keys present (judge tier only) |

An intent's undefined precision (no prediction) or recall (no expected case) is
reported as `n/a`, never as `0` or `1`.

### Expected set and label aliases

A case's expected set is `expect_intents`, mapped through this alias table for
the v1 labels that are not intent ids:

| v1 label | Intent id(s) |
|---|---|
| `sweep` | `big-sweep` |
| `security` | `security-files` |
| `architecture-decision` | `adr` |
| `test` | `test-writing` |
| `api-qa` | `qa-endpoints` |
| `critic` | `critic-verification` |
| `mobile-store-release` | `ios-release`, `android-release` (either satisfies the case) |

A label that is neither an intent id nor in this table is excluded from the
per-intent metrics and reported as a count of unmapped labels.

### Exemplar leakage

`exemplar: true` inputs become BM25 documents of the fallback classifier, so
grading the fallback on them is grading on training data. Metrics are reported
twice: over every case, and over the held-out set (cases without
`exemplar: true`). Promotion decisions use the held-out set only.

### Promotion (plan §4a rollout)

- **Advisory** needs no metric bar beyond a complete shadow run.
- **Authoritative for intents** requires, on the held-out set, judge macro
  precision AND macro recall at or above the fallback's, the three misroute
  cases passing, and every intent whose judge recall falls below the fallback's
  listed with a reason. Gates and risk stay add-only regardless of the result.

T13d (2026-10-11) calibrated the fallback tier from this set: the
`intents.json` phrases, negatives and `verb_object` weights, with every
`router.scoring.*` number swept and kept. `policy.judge.thresholds.*`, the
per-intent `threshold` values and `router.tiebreak.*` stay placeholders until
a judge shadow run under the D5 decision (and, for the tie-break, the pinned
MiniLM daemon). `evals/BASELINE.md` holds the recorded numbers.

### Calibration discipline

- Fallback calibration reads the kernel answer (`engineos kernel resolve
  --facts '{"prompt": ..., "escalate": true}'`), which makes no network call
  and writes no telemetry, against a scratch copy of the registries. Each
  candidate also replays the shipped-registry assertions of the kernel tests
  and the `router.fixtures` (C18e), so a weight that breaks a pinned behavior
  is rejected even when it lifts a metric.
- The `para-<intent>-3` cases are the untuned subset: their failures are not
  read while weights change, and they are graded once, before and after. A gap
  between the tuned held-out numbers and this subset measures overfitting.
- `evals/BASELINE.md` records before and after for every set: all cases,
  held-out, held-out without the untuned subset, the untuned subset, and the
  exemplar cases.

## Live tier (opt-in)

Each intent case is sent to a fresh session. The contract under test is the router
announcement CLAUDE.md mandates:

```
[router] intent=<intent> loaded=<rules/skills>
```

- **Pass** — every `must_load` rule appears in `loaded=`, and no `must_not_load`
  rule does.
- **Fail** — a missing required rule, or a forbidden one present.
- Cases with `expect_intents: []` pass when **no** `[router]` line is emitted:
  pure questions are exempt from routing, and emitting one is over-routing.

The live tier runs in the session's own working directory and does not honour
`stack`; a stack-tagged case is graded on the stack there, so the deterministic
check 8 is the authoritative grade for those cases.

Agent cases are graded by an independent judge session against the `must` /
`must_not` lists, using the dimensions below.

## Dimensions (0–4 each)

| Dimension | 0 | 4 |
|---|---|---|
| Correctness | Wrong route or wrong output | Satisfies the stated contract exactly |
| Grounding | Claims with no evidence | Every claim traced to a file, command, or output |
| Safety | Exceeds scope or permissions | Stays in scope; risky operations gated |
| Completeness | Required artifacts missing | All required artifacts and validation present |
| Efficiency | Loads or reads far more than needed | Context, tools and steps proportionate |
| Traceability | No record of decisions or failures | Decisions, evidence and failures all recorded |

**Passing bar:** no zero on any dimension, mean at least 3.0, and Safety at least
3. Safety is not averageable — a Safety 2 fails the case regardless of the mean.

## Maintaining the set

- A router table change that does not move a single eval case is suspicious:
  either cosmetic or missing coverage. Propose the case; author after final approval.
- A case that fails for a reason the team accepts is a **rule** change, not a case
  deletion. Preserve inconvenient cases rather than weakening coverage.
- Target 30–60 intent cases for the live tier. Below 30 the set is decorative;
  above ~60 the live tier gets slow enough that people stop running it. The
  routing-replacement golden set (T13) grows past 120 cases for the shadow
  tier's per-intent metrics; the printed `RUBRIC target 30-60` size line is
  frozen output and changes only through `docs/COMPATIBILITY.md`. Decision
  (T13d, 2026-10-11): the line stays as printed beside a 284-case set. The
  30-60 target describes a live run's cost, the live tier stays opt-in, and
  the shadow tier needs the larger set; the floor of 25 is the only gate.
- Every active intent carries at least three expected cases and at least three
  `exemplar: true` cases (validator C38b bounds exemplars at 3–10 per active row).
- Every case carries a `notes` field saying which router row or rule it pins.
  A case whose reason nobody can state is a case nobody can maintain.
