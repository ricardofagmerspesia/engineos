# Routing replacement — frozen contracts (rev 4)

*Companion to `2026-10-10-routing-replacement-plan.md` (the plan) and
`docs/adr/2026-10-10-three-tier-router-and-jev-judge.md` (the decision). Every
ticket T02–T13 of the plan's task graph builds against the shapes below and
changes none of them. A change to a contract comes back here first (rev 5, ...),
then to the units that consume it. Consumers cite `contracts.md@rev4`; a rev1,
rev2 or rev3 citation stays valid for every section the changelog below does not
name.*

## Changelog

**rev 4 (2026-10-11) — security fix pass on PR #132.** Ratifies the security
fixes merged at PR head `a481025`; where an earlier line of this document and
that code disagree, the code wins and the line is corrected here. Full text:
**§17 Revision 4**. Sections edited in place: §4.1, §4.2, §4.3, §5, §6.2,
§10.1, §10.2, §10.6, §14, §15, §16.7.

1. §4.1–§4.3 — the authoritative fold is **add-only for high-floor intents**:
   every deterministic survivor with a `high` risk floor is appended after the
   judge's choice and protected from suppression; `model_tier` is the higher of
   `route.model_tier` and the folded set's tier; `rule-spec-threshold` reads the
   folded set (§17.6).
2. §5 — new `judgeMayReceive`: the judge-only source rule, stricter than
   `classifyPromptSource` and fail-closed (§17.5). Routing and the tie-break
   keep `classifyPromptSource`.
3. §6.2 — `judge.redaction` grows to 25 kinds; the loader refuses unbounded
   quantifiers; the endpoint origin is fixed in code and an off-origin
   endpoint refuses the **whole** `policy.json` load (§17.4).
4. §10.1 — enablement order gains `endpoint off-origin → skipped: disabled`
   after `no-fetch`, before the breaker.
5. §10.2, §10.6 — text is pre-capped, redacted to a prefix that agrees with
   redaction of the whole prompt, then cut (§17.4; item 9(d) replaced the
   trailing-fragment drop).
6. §17.1–§17.3 — new presence section: record v2, the handshake, the
   heartbeat and the full stand-down list (the presence file had no section
   before; §16.7 described it informally).
7. §17.7–§17.9 — mod git fallback, C18f `hook-target-missing`, compile cache,
   daemon install and model cache, and the known residuals.
8. §6.2, §17.11 — re-review fixes at PR head `9f17b55` (same revision, no
   rev 5): the loader refuses `{m,}` of any width and quantified groups holding
   alternation or nested quantifiers; `key_env`, `enabled_env`,
   `enabled_value` and the redaction list's SHA-256 are pinned in code and
   `max_state_bytes` is capped at 16384; redaction grows to 27 kinds; the mod
   abandons a host on its first hook timeout and the host stops itself on a
   stalled request.
9. §0 D6, §1.5, §11, §14 — critic fix pass on PR #132 (2026-10-11, same
   revision, no rev 5); each line now states what the code does:
   (a) §11 names the region markers the generator and the committed
   `CLAUDE.md`/`AGENTS.md` actually use, `<!-- engineos:router-table:begin -->`
   and `<!-- engineos:router-table:end -->` (`src/gen/router-table.ts`
   `ROUTER_TABLE_BEGIN`/`ROUTER_TABLE_END`). The `@generated:router-table
   start … / end` lines were never implemented.
   (b) §1.5 — `router.scoring.max_intents` trims only exemplar-assisted
   admissions (`b3c041d`, `src/kernel/route.ts keptIntentIds`). A high-floor
   intent and an intent whose declared evidence alone clears `min_score` are
   always kept. With v1 data, which has no exemplars, the cap can never bind,
   so the any-match set is kept whole, high-floor rows included.
   (c) D6 and §14 — the three intent parity arms are kept, not retired. They
   compare the legacy keys after stripping the trailing additive keys
   (§2.2–§2.4) over the pinned v1 fixture registries, and skip where bash or
   jq is missing or `bash -n` cannot parse the pinned kernel (the skip
   message names bash >= 4; the macOS `/bin/bash` 3.2 fails it). CI's
   `ENGINEOS_REQUIRE_PARITY=1` turns that skip into a failure and is the
   enforcing control.
   (d) §10.2, §17.4 — redaction order corrected to the critic fix: a capped
   prompt no longer drops a trailing non-whitespace run. `redactBounded`
   runs each pattern on the pre-capped prefix and keeps only the prefix in
   which that pass provably agrees with the same pass on the whole prompt,
   so its output is always a prefix of `redactText(wholePrompt)`. The
   earlier "final limit is at most half the pre-cap" argument failed once
   earlier redactions shrank the text (critic, PR #132).
   (e) §2.2, §17.1 — code-review fix pass on PR #132 (same revision, no
   rev 5), wording only. §2.2's `matches` line now states the §1.5 cap rule
   from (b) instead of "at most `max_intents`": the cap trims only
   exemplar-assisted admissions, high-floor and declared-evidence intents are
   always kept, so a route can exceed `max_intents`. §17.1 and the rev 4
   evidence list name the presence record's real homes,
   `adapters/claude-code-mod/host/presence.ts` and `src/lib/runtime-dir.ts`;
   no `src/inprocess/` directory exists.

**rev 3 (2026-10-11)** — five T06 questions, the T12 tie-break fact, and T12's
accepted spawn-count deviation. Full text and consumer deltas: **§16 Revision 3**.
Sections edited in place: §1.2, §2.4, §2.5, §3, §4 (preamble, §4.4, §4.5, new
§4.7), §6.1, §6.2, §6.3, §10.6 (new), §14, §15.

1. §2.5, §4 — `risk_proposal` is **reported in every mode** and folded only in
   `authoritative` (ratifies T06; the §4 preamble's "`riskProposal: null`" was
   the contradiction).
2. §4.4 — `hitl` receives the **post-fold** floor, judge proposal included
   (ratified). A proposal still never triggers `hitl` on its own.
3. §4.4 — an authoritative `jev` fact turns a `null` floor into at least `low`
   (§4.4 read literally; ratified).
4. §4.5 — **changed:** `multi-agent-dispatch` and `requires-dispatch-plan` are
   re-evaluated over the folded survivors and **added** (union, never removed).
   Consumer delta for T09d (`combine.ts`).
5. §1.2, §6.2, §6.3 — a threshold that compares against a sparse probability is
   in `(0, 1]`; zero is refused (ratifies T09a's loaders).
6. §4.7, §6.1, §3, §2.4, §10.6 — new: the **embedding tie-break fact**
   (`resolve --facts` key `tiebreak`), policy `router.tiebreak.{min_similarity, margin}`,
   task-contract key 23 `tiebreak`. Consumer deltas for T09a, T09d, T13.
7. §16.7, ADR consequences — accepted deviation (T12): with the in-process
   adapter on, each call costs **one immediate-exit spawn per registered
   `hooks.json` route**, not zero.

**rev 2 (2026-10-11)** — four consumer-raised deltas; every other line is
byte-identical to rev 1.

1. §1.2, §1.5, §9.1 — **path feature gated on declared `phrases`** (ratifies
   T03's integrated reading). A row scores the path feature only when the
   registry row declares a non-empty `phrases` array; the kernel-internal flag
   `IntentRow.phrases_declared` carries that fact (not a registry key). This
   keeps §1.5 exact for v1 rows (`path_weight 1.0 >= min_score 1.0` would
   otherwise let a path token alone route a v1 row) without zeroing the feature
   for v2 rows, which `path_weight: 0` would have done. Affects T03 (already
   conforms), T13 (calibration reads the gate).
2. §10, §10.3, §7 — `JudgeOutcome` `facts` variant gains
   `tokens_in: number | null` from the response's `usage.input_tokens`, so the
   hook fills the §7 span's `tokens_in`. Additive. `JevFact` (the kernel fact)
   is unchanged. Affects T04 (producer), T05 (span writer).
3. §10.3 — `oversize-state` is decided before any request is sent and is a
   property of the prompt, not the provider: it **does not** increment the
   breaker (ratifies T04's reading). It is still a `failed` outcome, still a
   `fallback` reason in the fact, and still gets one `FAILED` span (§7) so the
   retro sees it. Affects T04, T05.
4. §10.3 — TypeSafe wire names confirmed by T04 (read 2026-10-11:
   `https://docs.typesafe.ai/api.md`, `/primitives/{choice,noul,score}.md`);
   the "to be confirmed" marker is replaced by the confirmed shapes and the
   four documented error codes (401, 422, 429, 529). The `JevFact` mapping is
   unchanged. Affects T04 only.
5. §15 — ownership notes: T03's wiring request W3 (`export type RankedIntent`
   from `src/kernel/index.ts`) is owned by T06; `README.md` is in T09's
   exclusive paths (D4).

- **Revision:** rev 4 (2026-10-11); rev 3 (2026-10-11); rev 2 (2026-10-11); rev 1 (2026-10-10). **Owner:** T01 (contract owner).
- **rev 4 evidence read** (PR checkout `feat/routing-replacement` at `a481025`):
  `src/kernel/{combine,combine-aggregate}.ts`, `src/hooks/{adapter,prompt-source,prompt-judge}.ts`,
  `src/judge/{jev,redact,state,tiebreak}.ts`, `src/registry/policy-judge.ts`,
  `src/lib/runtime-dir.ts`, `adapters/claude-code-mod/host/presence.ts`, `src/checks/kernel-router.ts`,
  `adapters/claude-code-mod/hooks/register.ts`, `scripts/build.mjs`,
  `tools/embedding-daemon/{.npmrc,src/*}`, `registries/policy.json`.
- **rev 3 evidence read** (PR checkout `feat/routing-replacement` at `64dfce8`):
  `src/kernel/{combine,judge-facts,resolve,decisions,route}.ts`,
  `src/judge/tiebreak.ts`, `docs/OPT-IN-TIERS.md`, `src/hooks/prompt-advisor.ts`,
  `src/hooks/prompt-advisor-guidance.ts`; T09a's in-flight loaders
  `src/registry/{policy-judge,policy-router,intents,decision-rules}.ts`
  (threshold bounds only).
- **Base:** branch `feat/routing-replacement` at `0b2e442`, HEAD-only (decision D1).
- **Evidence read:** `src/registry/intents.ts`, `src/registry/policy.ts`,
  `src/kernel/{route,resolve,decisions,scale,breaker,cli}.ts`,
  `src/hooks/{envelope,telemetry}.ts`, `src/registry/policy-telemetry.ts`,
  `src/journal/schema.ts`, `src/evals/deterministic.ts`,
  `src/checks/decision-registries-intents.ts`, `registries/*.json`,
  `docs/COMPATIBILITY.md`, `install.sh:28`, the approved prototype
  `approved-prototype-logic.js` (revision `71ce35fb93a0`).
- **Placeholders:** every numeric threshold below is a placeholder until T13
  calibrates it from the golden set at the approved final stage. Placeholders
  are chosen so that a v1 registry routes exactly as today (contract 1, §1.5).

Compatibility classes use `docs/COMPATIBILITY.md`: **MINOR** = additive or
tightening; **MAJOR** = removal, rename or meaning reversal. Nothing in this
document is MAJOR; one window (`signals`) is opened, none is closed.

---

## 0. Recorded decisions (closed; do not reopen in consumer tickets)

| Id | Decision | Where it binds |
|---|---|---|
| D1 | **Branch base is HEAD-only.** The main checkout's uncommitted workflow work (`src/kernel/execution.ts`, `src/scheduler/`, `src/workflow/`, `src/kernel/skill-reference.ts`, `registries/skill-references.json`, `policy.workflow`, wave cap 3) does **not** land on `feat/routing-replacement`. Developer decision, 2026-10-10. T10's and T11's conditional parts report `out_of_scope`; T09 merges `policy.json` against the 1.7.0 shape at `0b2e442`. | T09, T10, T11 |
| D2 | `route.intents` and `route.matches` keep their pinned shapes; ranking lives in the sibling key `ranked` (§2). | T03, T06, T07 |
| D3 | Shim warnings go to stderr and are silenced by `ENGINEOS_QUIET_SHIMS=1` only. `ENGINEOS_TELEMETRY=0` keeps its single meaning. | T11, T08 (bench sets the env) |
| D4 | Check-count literals: T09 owns `CLAUDE.md`, `AGENTS.md`, `docs/CODEBASE_MAP.md` **and `README.md`** (C37 reads all four). Supervisor: add `README.md` to T09's exclusive paths. | T09 |
| D5 | No live call to TypeSafe before T13's recorded human decision. `src/judge/**` takes `fetch` by injection; the kernel never imports `src/judge/**`. | T04, T05, T06, T13 |
| D6 | (rev 4 item 9, corrected to the code) Intent-routing byte parity is **kept on the legacy keys**: the `route-intent`, `route-escalate` and `resolve-task` arms of `src/kernel/parity.test.ts` still run against the pinned bash kernel over the pinned v1 fixture registries (`test/fixtures/legacy-kernel/`), stripping the trailing additive keys (§2.2–§2.4) before the byte comparison; any other difference, including a legacy key moved behind an additive one, fails. Like every arm, they skip when bash or jq is missing or `bash -n` cannot parse the pinned kernel (the skip message names bash >= 4; macOS `/bin/bash` 3.2 fails it); `ENGINEOS_REQUIRE_PARITY=1`, set on CI's `verify` job, turns the skip into a failure and is the enforcing control. Path parity (`route-path`) and every policy arm stay unchanged. Scored answers on the shipped v2 registries are pinned by the golden set (§8), not by parity. | T13 |
| D7 | The kernel answer carries the judge summary on `route` (escalate form) and `task_contract` only. There is **no** top-level `Answer.judge` key (refines T06's draft wording). A `judge` fact without a `taskContract` fact is refused. | T06 |
| D8 | The rendered CLAUDE.md/AGENTS.md router table is generated from `intents.json`; each row's prose comes from the optional v2 field `router_row` (§11), which lets T09's first generation be byte-identical to today's table. | T09 |

---

## 1. `registries/intents.json` v2 — MINOR

### 1.1 Top level

```text
{ "version": "2.0.0", "description": "...", "intents": [ ...rows per §1.2... ] }   (shape, not a literal)
```

`version` stays a **string** (`requireString`). `"2.0.0"` is informational: the
loader reads v2 fields on any row regardless of `version`, so a v1 file
(`"1.5.0"`, no v2 fields) loads unchanged.

### 1.2 Per-row additive fields (appended after today's keys, in this order)

| Key | Type | Required | Loader rule (T03, `src/registry/intents.ts`) |
|---|---|---|---|
| `phrases` | `Array<{ text: string; weight: number }>` | no | each `text` non-empty; each `weight` a finite number `> 0`. Absent → derived from `signals` with weight `1`. Present and non-empty → `signals` becomes optional for this row |
| `verb_object` | `{ verbs: string[]; objects: string[]; weight: number }` | no | both arrays non-empty strings; `weight` finite `> 0`. Absent → no pair feature |
| `negative` | `Array<{ text: string; weight: number }>` | no | same shape rule as `phrases`; weights are **subtracted** |
| `exemplars` | `string[]` | no | non-empty strings. Count 3–10 on an active row is enforced by validator C38b, not the loader. Absent → `[]` (no BM25 document) |
| `threshold` | `number` | no | in `(0, 1]` (rev 3: `0` refused — an absent id reads as `0` and would qualify); the Jev noul cut for `intent.<id>`. Absent → `policy.judge.thresholds.intent_default` |
| `router_row` | `{ intent: string; load: string }` | no | both non-empty strings; the generated router-table cells (§11). Absent → cells derived from the other fields |

Existing refusals stay verbatim (empty `.intents`, empty `id`, malformed
`risk_floor`, non-boolean flags, unknown-key tolerance). The one changed rule:

> `signals` must be a non-empty string array **unless** `phrases` is a non-empty
> array, or the row is `enabled: false` and `deprecated: true`.

`IntentRow` gains the parsed fields: `phrases: Phrase[]` (always populated —
derived or declared), `verb_object: VerbObject | null`, `negative: Phrase[]`,
`exemplars: string[]`, `threshold: number | null`, `router_row: RouterRow | null`,
and the **kernel-internal** flag `phrases_declared: boolean` (rev 2) — true
when the registry row carries a non-empty `phrases` array, false when
`phrases` was derived from `signals`. It is not a registry key, is never
projected into an answer, and gates the §9.1 path feature.
`signals` keeps its slot and type.

Metasyntax ban (C16 today on `signals`) extends to `phrases[].text` and
`negative[].text` (C38). `text` is matched with today's `boundedContains`
semantics (ASCII downcase, Unicode alnum boundary), so a weight-1 phrase derived
from a `signals` entry fires on exactly the prompts the entry fires on today.

### 1.3 `signals` deprecation window

`signals` is **read for one window** (through 1.x) and never required when
`phrases` exists. T09 keeps `signals` on every active row of the shipped
registry so the HEAD loader, the pinned bash fixture
(`test/fixtures/legacy-kernel/`) and the hook mirror checks keep reading it.
Removal of `signals` is 2.0 (MAJOR) and out of this plan's scope. No `signals`
row is deleted (T09 acceptance).

### 1.4 Example v2 row (validates against §1.2 and the HEAD loader)

```json
{
  "id": "adr",
  "title": "Architecture decision",
  "signals": ["should we use", "how should we structure"],
  "rules": [],
  "skills": ["adr"],
  "agents": [],
  "commands": [],
  "mcp": [],
  "model_tier": "most-capable",
  "risk_floor": null,
  "hook_mirrored": false,
  "note": "The decision gets recorded, not just chatted. ...",
  "phrases": [
    { "text": "should we use", "weight": 3 },
    { "text": "adr", "weight": 3 },
    { "text": "how should we structure", "weight": 3 },
    { "text": "trade off", "weight": 2 },
    { "text": "decision", "weight": 1.5 },
    { "text": "plan", "weight": 1.2 },
    { "text": "replace", "weight": 1 },
    { "text": "framework", "weight": 1 },
    { "text": "evaluate", "weight": 1 }
  ],
  "verb_object": { "verbs": ["plan", "evaluate", "compare", "decide"], "objects": ["framework", "library", "architecture", "approach", "structure"], "weight": 2 },
  "negative": [ { "text": "implement", "weight": 1 } ],
  "exemplars": [
    "should we use postgres or mongo for events",
    "plan to replace the queue library and evaluate alternatives",
    "which framework fits the routing layer better",
    "how should we structure the billing module"
  ],
  "threshold": 0.5,
  "router_row": {
    "intent": "Architecture decision (\"should we use X or Y\", \"how should we structure\")",
    "load": "skill `adr` + `rules/memory.md` — decision gets recorded, not just chatted"
  }
}
```

The HEAD loader (`0b2e442`) loads this row: `signals` is non-empty, every
required key is present, and the six new keys are ignored as unknown. The T03
loader parses them.

### 1.5 Behaviour-preservation invariant (T03 acceptance)

With a registry in which every row has no v2 field (the HEAD file), §9 scoring
assigns every intent whose `signals` entry fires a score `>= 1` and every other
intent `0`; with the §6.1 placeholders (`min_score: 1.0`, `threshold: 0`,
`margin: 0`, `max_intents: 8`, no exemplars anywhere) `matches` equals today's
any-match set in registry order and `ambiguous` equals `matches.length === 0`.
The path feature (§9.1) cannot break this: it fires only on rows with
`phrases_declared`, and a v1 row has none (rev 2).

**Cap exemption (rev 4 item 9; `src/kernel/route.ts keptIntentIds`).** Let
*admitted* be the candidates scoring at or above `min_score`. When there are
at most `max_intents` of them, all are kept. Otherwise two kinds are exempt
from the cap and always kept, mirroring the fold's `keptHigh` (§4.1):

- every admitted intent whose row's `risk_floor` is `high`;
- every admitted intent whose **declared evidence alone** clears `min_score`:
  phrases (or a v1 row's `signals`), verb-object pair and path, minus
  negatives, scored with `bm25_weight` 0. This is the any-match set of this section.

The cap fills the remaining `max(0, max_intents - exempt)` slots, score
descending then registry order, from the intents that needed exemplar
similarity to reach `min_score`. A route may therefore carry more than
`max_intents` intents. A cap can drop an exemplar-assisted admission but
never lowers the route's risk floor and never removes a high-floor gate or
its reviewer. For v1 data (no exemplars anywhere) every admitted intent is
declared, so the cap can never bind and `matches` equals the any-match set
however many rows fire, high-floor rows included. The parity arms rely on
this. With the placeholder cap of 8 the cap does not bind on the golden set:
the largest routed set is 7 intents (`evals/BASELINE.md`).

---

## 2. Answer envelope — MINOR (trailing keys only)

### 2.1 Shared types (`src/kernel/route.ts`)

```ts
// One ranked candidate. features are deterministic, human-readable strings in
// the §9.4 grammar; never prompt text.
export interface RankedIntent {
  id: string;
  score: number;        // >= 0, two decimals
  confidence: number;   // [0,1], two decimals: score / sum(candidate scores)
  features: string[];
}

// Where the routing answer came from. The kernel emits 'jev' or 'fallback';
// 'skipped' is written only by the hook's route event when no kernel call was
// made (not-user-input).
export interface JudgeSummary {
  source: 'jev' | 'fallback' | 'skipped';
  reason: JudgeReason | null;   // null only when source === 'jev'
  model: string | null;         // e.g. 'jev-1.13.0'; null unless source === 'jev'
}

export type JudgeReason =
  | 'disabled' | 'no-key' | 'no-fetch' | 'breaker-open'      // not attempted
  | 'not-user-input'                                          // hook only
  | 'timeout' | 'http-429' | 'http-4xx' | 'http-5xx'          // attempted, failed
  | 'network' | 'invalid-response' | 'oversize-state'
  | 'no-judge-fact';                                          // kernel: no fact declared
```

`JudgeReason` is a closed, slug-safe vocabulary (telemetry `value_pattern`).

### 2.2 Intent form (`route-intent`, `resolve --facts {prompt}`)

Key order: `matches`, `ambiguous`, **`ranked`**, **`margin`**.

- `matches: IntentMatch[]` — the eleven-field object, unchanged, in **registry
  order**, for every candidate whose score `>= router.scoring.min_score`,
  capped by `router.scoring.max_intents` exactly as §1.5 states (rev 4): the
  cap trims only exemplar-assisted admissions (highest scores kept; ties by
  registry order), while every high-floor intent and every intent whose
  declared evidence alone clears `min_score` is always kept, so `matches` can
  carry more than `max_intents` entries.
- `ambiguous: boolean` — `matches.length === 0 || top.confidence < router.scoring.threshold || margin < router.scoring.margin`, where `top` is `ranked[0]`.
- `ranked: RankedIntent[]` — every candidate with score `> 0`, score descending,
  ties by registry order, truncated to `router.scoring.top_k`.
- `margin: number | null` — `(ranked[0].score - ranked[1].score) / ranked[0].score`
  two decimals; `1` when exactly one candidate; `null` when none.

### 2.3 Escalate form (`route-escalate`, `resolve-task`, `resolve --facts {prompt, escalate|taskContract}`)

Key order: `escalate`, `reasons`, `intents`, `suppressed`, `agents`,
`model_tier`, `risk_floor`, `scale`, `ambiguous`, **`ranked`**, **`margin`**,
**`judge`**.

- `intents: string[]` unchanged (survivors of suppression, registry order).
- `ranked`, `margin` as §2.2, passed through unchanged (suppression does not
  edit the ranking; the router agent sees every candidate).
- `ambiguous` as §2.2.
- `reasons` may now end with `low-confidence` (§6.1 `router.reasons`, appended
  last so emission order of the three existing ids is unchanged). It fires when
  `ranked.length > 0 && (ranked[0].confidence < scoring.threshold || margin < scoring.margin)`.
  Zero candidates do **not** fire it (pure questions keep routing nowhere).
- `judge: JudgeSummary` — the declared judge fact's summary; without a fact:
  `{ "source": "fallback", "reason": "no-judge-fact", "model": null }`.

The six `policy.router.fixtures` (C18e) assert `escalate`, `reasons`,
`intents` only; with §6.1 placeholders they resolve as recorded.

### 2.4 Task contract (`resolve-task`, `resolve --facts {prompt, taskContract}`)

`TaskContractSection` keeps its 20 keys and order, then appends:

| Position | Key | Type | Value |
|---|---|---|---|
| 21 | `judge` | `JudgeSummary` | same object as `route.judge` |
| 22 | `risk_proposal` | `RiskTier \| null` | §4.4; `null` without a `jev` fact; reported in **every** mode (rev 3) |
| 23 | `tiebreak` | `string \| null` | rev 3, §4.7: the winning intent id when the embedding tie-break narrowed `intents`; `null` otherwise (no fact, not consulted, or no selection) |

`decision_rules` (the section the task-contract block composes) gains a
trailing key **only in answers composed with a `taskContract` fact**:
`judge_added: string[]` — ids of decision rules synthesized from judge facts
(§4.3), `[]` otherwise. The standalone `decision-rules` arm and
`DecisionMatch`'s five-key order are untouched (policy parity stays).

`resolve-task` projection `{ task_contract, route, decision_rules, hitl | null }`
is unchanged in shape; the sections inside carry the keys above.

### 2.5 Modes and what changes in the contract

| `policy.judge.mode` | `route.*` | `task_contract.intents` and derived lists | gates / risk | notes in advisor |
|---|---|---|---|---|
| `shadow` | deterministic | deterministic | deterministic | none |
| `advisory` | deterministic | deterministic | deterministic | judge note shown |
| `authoritative` | deterministic (`judge` echoes the fact) | §4.2 from judge facts | §4.3 add-only, §4.4 raise-only | judge note shown |

`route.*` is always the deterministic answer. Only the task-contract block folds
judge facts, and only in `authoritative` mode. `task_contract.judge` and
`task_contract.risk_proposal` are reported in every mode (rev 3 confirms this
over the old §4 preamble): reporting is not folding, and shadow mode exists to
record what the judge *would* have changed. The advisor still prints no judge
note in `shadow` (§10.5).

The embedding tie-break fact (§4.7, rev 3) is independent of `judge.mode`: it
is read on the deterministic branch in every mode, and ignored when an
authoritative `jev` fact folds the intents. It never edits `route.*` either.

---

## 3. Judge fact — `resolve --facts` key `judge` — MINOR (new fact key)

Parsed in `src/kernel/cli.ts parseFacts` (`judgeFacts()`), typed and validated
in `src/kernel/judge-facts.ts` (kernel-local mirror; the kernel imports nothing
from `src/judge/**`). Unknown keys at any level are refused with
`resolve --facts: judge.<path> ...` like every other fact. The fact is a
discriminated union on `source`:

```ts
export type JudgeFact = JevFact | FallbackFact;

export interface FallbackFact {
  source: 'fallback';
  reason: Exclude<JudgeReason, 'not-user-input' | 'no-judge-fact'>;
}

export interface JevFact {
  source: 'jev';
  model: string;                 // slug; the version the response reported, e.g. 'jev-1.13.0'
  latency_ms: number;            // integer >= 0
  is_project_change: number;     // [0,1]
  primary: { id: string; confidence: number; margin: number };
  //   id: an active intent id or 'other'; confidence, margin in [0,1]
  //   margin = p(top option) - p(second option) from the Choice probabilities
  intents: Record<string, number>;   // active intent id -> noul p(yes) in [0,1]; unknown id refused
  rules: Record<string, number>;     // judge_fact name -> p(yes) in [0,1]; name must be a
                                     //   decision-rules.json `judge_fact` (§6.3); unknown name refused
  scale: 0 | 1 | 2;
  design_work: number;           // [0,1]
  risk: {
    reversibility: 0 | 1 | 2;
    blast_radius: 0 | 1 | 2;
    data_sensitivity: 0 | 1 | 2;
    contract_surface: 0 | 1 | 2;
    spend: 0 | 1 | 2;
  };
}
```

Rules:
- A `judge` fact without `taskContract: true` is refused (D7):
  `a judge fact cannot be declared without a task-contract fact`.
- Score levels (`scale`, `risk.*`) are integers computed by the judge client as
  `Math.round(sum(i * p_i))` over the Score's ordered probabilities (§10.4), so
  the kernel receives levels, never probabilities.
- `intents` may be sparse (ids absent read as `0`). `rules` likewise.
- Replayability: `prompt` + a journaled `judge` fact reproduce the answer
  offline; the kernel reads no clock, no network and no env for this fact.

### 3.1 Tie-break fact — `resolve --facts` key `tiebreak` — MINOR (rev 3)

```ts
// intent id -> the daemon's similarity in [0,1] (src/judge/tiebreak.ts
// TiebreakOutcome 'scores'.scores, passed through unchanged).
export type TiebreakFact = Record<string, number>;
```

```json
{ "prompt": "...", "taskContract": true, "judge": { "...": "..." }, "tiebreak": { "adr": 0.71, "new-feature": 0.52 } }
```

Rules (parsed in `src/kernel/cli.ts parseFacts` as `case 'tiebreak'`, validated
kernel-side; the kernel imports nothing from `src/judge/**`):
- A `tiebreak` fact without `taskContract: true` is refused:
  `a tiebreak fact cannot be declared without a task-contract fact` (same
  reason as D7: only the task contract reads it).
- Must be an object; each key an **active** intent id (else
  `resolve --facts: unknown fact tiebreak.<id>`); each value a finite number in
  `[0,1]` (else `resolve --facts: tiebreak.<id> must be a number in [0,1]`).
- Each key must be an id in the deterministic `route.ranked` for the same
  prompt (else `resolve --facts: tiebreak.<id> is not a ranked candidate`). The
  ranking is a pure function of prompt and registries, so a journaled fact
  replays; a score for a candidate the kernel never ranked is a broken caller.
- Sparse: an absent id is **unscored**, never `0` (§4.7 treats unscored
  survivors as blocking a selection).
- `{}` is accepted and selects nothing.
- The hook passes the fact only when the client outcome is `kind === 'scores'`;
  `skipped` and `failed` outcomes pass no fact (they leave the deterministic
  answer untouched, `docs/OPT-IN-TIERS.md` "Client outcomes").

---

## 4. Combination policy (`src/kernel/combine.ts`, authoritative mode)

Pure function, no I/O:

```ts
export interface CombineInput {
  route: EscalateRouteSection;        // deterministic
  decisions: DecisionsSection;        // regex matches
  scale: ScaleSection;
  judge: JudgeFact | null;
  mode: 'shadow' | 'advisory' | 'authoritative';
  regs: Registries;                   // intents thresholds, decision rules, policy.judge, policy.router
  tiebreak?: Record<string, number>;  // rev 3, §3.1/§4.7: validated TiebreakFact; absent = not consulted
}
export interface CombineOutput {
  intents: string[];
  ranked: RankedIntent[];             // route.ranked, unchanged
  ambiguous: boolean;
  decisionMatches: DecisionMatch[];   // regex matches first (priority order), then judge-added (priority order)
  judgeAdded: string[];
  anyHigh: boolean;
  riskProposal: RiskTier | null;
  judgeSummary: JudgeSummary;
  escalateReasons: string[];          // policy.router.reasons order
  // T06's implemented trailing keys (ratified rev 3): the derived lists §4.2
  // recomputes, emitted so the task contract reads one answer.
  suppressed: SuppressedIntent[];
  agents: string[];
  modelTier: string | null;
  riskFloor: RiskTier | null;
  tiebreakWinner: string | null;      // rev 3, §4.7; -> task_contract.tiebreak
}
export function combine(input: CombineInput): CombineOutput;
```

In `shadow`/`advisory`, or with `judge === null` / `source: 'fallback'`, the
intents, gates, floor and reasons are the deterministic input re-packaged
(`judgeAdded: []`, summary from the fact or `no-judge-fact`), except that the
§4.7 tie-break may narrow the intents. `riskProposal` is computed from a `jev`
fact in **every** mode and is `null` only without one (rev 3; it is reported,
not folded).

With a `jev` fact in `authoritative` mode:

### 4.1 Rule 1 — deterministic gates win
Every regex decision match, every path/intent-derived floor and every existing
escalation reason is kept. Nothing below removes an entry.

rev 4 (§17.6): the same holds for high-floor intents. `keptHigh` = the
deterministic survivors (`route.intents`) whose registry risk floor is `high`.
They are appended to the judge's choice (§4.2) and protected from suppression,
and `model_tier` = the higher of `route.model_tier` and the folded set's tier in
`registries/models.json` `escalation_order`. A judge answer can neither drop a high-floor
intent nor lower the model tier.

### 4.2 Rule 3 — intents (`combination.intents: "noul-then-primary"`)
1. `qualifying = ids of judge.intents with p >= thresholdOf(id)` where
   `thresholdOf(id) = intents.json row.threshold ?? judge.thresholds.intent_default`,
   ordered by `p` descending, ties by registry order, capped at
   `router.scoring.max_intents`.
2. If `qualifying` is non-empty → `intents = qualifying`, `ambiguous = false`.
3. Else if `primary.confidence >= judge.thresholds.primary_confidence`:
   `primary.id === 'other'` → `intents = []`, `ambiguous = false` (no routed
   intent: answer directly or use a general worker); otherwise
   `intents = [primary.id]`, `ambiguous = false`.
4. Else → `intents = []`, `ambiguous = true`.
5. (rev 4) Folded ids = the choice from steps 1–4, then every `keptHigh` id not
   already in it, in registry order (§4.1). The cap in step 1 applies to the
   judge's choice only; `ambiguous` is the choice's.

The contract's derived lists (`agents`, `rules`, `skills`, `commands`, `mcp`,
`model_tier`, `risk_floor`, `suppressed`) are recomputed from the folded
`intents` by the existing aggregation in `resolve.ts` (suppression runs over the
folded set exactly as `routeEscalate` runs it over the raw set; rev 4: a
`keptHigh` id is never suppressed).

### 4.3 Rule 2a — gates add-only (`combination.judge: "add-only"`)
For each decision rule `r` with `judge_fact !== null`, when
`judge.rules[r.judge_fact] >= (r.judge_threshold ?? judge.thresholds.rule_default)`
and `r` is not already matched: synthesize `DecisionMatch` from the registry row
(`id`, `then.require`, `then.prefer`, `then.gate`, `then.risk`; helper
`matchFromRule(id, regs)` exported by `src/kernel/decisions.ts`) and append.
Two rules are derived in code, not from `judge.rules`:
- `rule-fanout` ← `judge.scale === 2`;
- `rule-spec-threshold` ← `'new-feature'` is in the folded ids (rev 4: the
  judge's choice plus `keptHigh`, read before suppression).
`rule-verification`, `rule-change-record`, `rule-high-risk-critic` stay
regex/model-only (never synthesized). `anyHigh` is recomputed over the union.

### 4.4 Rule 2b — risk raise-only
`riskProposal = ['low','medium','high'][max(risk.reversibility, risk.blast_radius, risk.data_sensitivity, risk.contract_surface, risk.spend)]`.
Floor after fold: `max(floor, riskProposal)` by `RISK_ORDER`. A lower proposal
is reported and ignored. A judge-raised floor **does not** by itself fold the
`hitl` section (a proposal is not a classification); `hitl` folds exactly as
today from `anyHigh` (now over the union) or the topology fact.

Rev 3 clarifications (both ratify T06):
- **`null` is below `low`.** `max(null, p) = p`, and a `jev` proposal is never
  `null`, so in `authoritative` mode a prompt with no deterministic floor (a
  pure question) gets `risk_floor: "low"` and `autonomy_ceiling_at_floor` of the
  low tier. This is the safe direction: a `null` ceiling is the value a caller
  could misread as "no ceiling" (`resolve.ts ceilingAt`). `substantive`, the
  policy bundle and `hitl` are unaffected (none reads the floor).
- **`hitl` tier is the post-fold floor.** When `hitl` folds (from `anyHigh` or
  the topology fact), it is handed the same floor and ceiling the task contract
  publishes, judge proposal included. One answer never carries two tiers. The
  proposal can therefore add the `high-risk` reason to a `hitl` section that
  `anyHigh` or the topology fact already required, never create one.

### 4.5 Rule 4 — escalate on doubt (`combination.escalate_on_doubt: true`)
Append `low-confidence` to `escalateReasons` (policy order) when
`primary.confidence < judge.thresholds.primary_confidence || primary.margin < judge.thresholds.margin`,
or when §4.2 ended ambiguous. `task_contract.escalates` is true when
`escalateReasons` is non-empty. `route.reasons` is not edited (it is the
deterministic answer; its own `low-confidence` comes from §2.3).

**Rev 3 (changed): intent-derived reasons are re-evaluated over the fold, add-only.**
`escalateReasons` is the policy-ordered union of:
- every reason in `route.reasons` (Rule 1: none is removed);
- `multi-agent-dispatch` when the folded **survivors** (after §4.2 suppression)
  with a non-empty `agents` list number at least
  `policy.router.escalate_when.multi_agent_intents_min` — the same condition
  `routeEscalate` applies to the raw survivors;
- `requires-dispatch-plan` when some folded survivor has
  `requires_dispatch_plan: true`;
- `low-confidence` on doubt, as above.

`unrouted-scale` is **not** re-evaluated: it is defined on zero *raw* matches
and stays exactly as `route.reasons` reports it. Reason: without this, a judge
fold that routes to two agent-carrying intents publishes two agents with
`escalates: false`, and the advisor tells the supervisor that no dispatch plan
is needed — the folded contract would contradict its own escalation policy.

### 4.6 Rule 5 — fallback is visible
`judgeSummary` is always emitted; `source: 'fallback'` carries the reason.

### 4.7 Embedding tie-break (rev 3) — `CombineInput.tiebreak`

Consulted **only on the deterministic branch** (no `jev` fact, a `fallback`
fact, or a `jev` fact in `shadow`/`advisory`) and **only when
`route.ambiguous === true`**. On the folded branch (authoritative `jev`) it is
ignored: the judge is the semantic tier above it.

Selection, in order; the first failing step means **no selection** and the
deterministic output stands unchanged (`tiebreakWinner: null`):
1. `survivors = route.intents` (post-suppression, registry order). At least
   **two** survivors are required — there is nothing to break otherwise.
2. Every survivor must be in `route.ranked` **and** carry a score in
   `tiebreak`. An unscored survivor (beyond `top_k`, no exemplars, or dropped
   by the client's limits) blocks selection: the kernel never narrows on
   missing evidence.
3. Order survivors by score descending, ties by `route.ranked` order. `best` is
   the first, `second` the next.
4. `best.score >= router.tiebreak.min_similarity` and
   `best.score - second.score >= router.tiebreak.margin`.

On selection:
- **Never adds an intent.** The winner is one of the deterministic survivors;
  candidates that are ranked but not survivors (below `min_score`, suppressed,
  or unmatched) can receive a score but can never be selected. A prompt with
  zero survivors is never routed by the tie-break.
- **Narrowing.** `kept = [winner]` plus every other survivor whose registry
  `risk_floor` is `"high"` (a similarity score never drops a high-floor
  domain's rules or agents). `kept` is in registry order.
- **Re-aggregation.** `intents`, `agents`, `model_tier` and `risk_floor` are
  recomputed over `kept` with the same aggregation §4.2 uses
  (`aggregateIntents`; `kept` is a subset of survivors, so its suppression pass
  drops nothing). `suppressed = route.suppressed` followed by one
  `{ id, by: <winner id> }` per dropped survivor (registry order), so the
  answer says what displaced it.
- **Never lowers risk or tier.** `riskFloor = anyHigh ? 'high' : max(route.risk_floor, aggregate.riskFloor)`;
  `modelTier = max(route.model_tier, aggregate.modelTier)` by
  `models.escalation_order` (uncertainty favours the stronger tier,
  `rules/models.md`). Decision matches and `anyHigh` are untouched (the
  deterministic branch has no judge-added rules).
- **Reasons add-only.** `escalateReasons = route.reasons` unchanged —
  `low-confidence` stays when the route had it, so the router agent still sees
  the doubt; nothing is recomputed, because narrowing can only remove agents.
- `ambiguous = false`; `ranked` unchanged; `tiebreakWinner = winner`.

With the §6.1 scoring placeholders (`threshold: 0`, `margin: 0`) `ambiguous` is
true only when `matches` is empty, so step 1 always fails and the tie-break is
inert until T13 calibrates `router.scoring`. That is intended: a v1 registry
still routes exactly as the any-match router did (§1.5).

---

## 5. Prompt source (`src/hooks/prompt-source.ts`) — MINOR

```ts
export type PromptSource = 'user' | 'notification' | 'tool-result' | 'hook-echo';

export interface SourceMarkers {            // policy.router.source_markers
  notification: string[];
  tool_result: string[];
  hook_echo: string[];
}

// Pure. Reads env.prompt (and env.raw for a string `source`/`prompt_source`
// field when the host supplies one). A marker is a literal prefix compared
// after trimming leading whitespace, case-sensitive; first match wins in the
// order notification, tool_result, hook_echo; no match -> 'user'.
export function classifyPromptSource(env: HookEnvelope, markers: SourceMarkers): PromptSource;

// rev 4 (§17.5): the judge-only source rule. True only when, with nothing
// thrown (the markers thunk reads the registry and may throw):
//   classifyPromptSource(env, markers()) === 'user'
//   AND !/^<[A-Za-z][A-Za-z0-9_.:-]{0,63}(?:[\s/>]|$)/.test(env.prompt.trimStart())
// The tag-frame test applies even when the host declares the source 'user'.
// Any throw -> false (fail closed).
export function judgeMayReceive(env: HookEnvelope, markers: () => SourceMarkers): boolean;
```

rev 4: `src/hooks/prompt-judge.ts` declares a judge fact only when
`judgeMayReceive` is true; otherwise it returns no fact, so doubt resolves
toward no egress. The kernel route and the §10.6 tie-break keep
`classifyPromptSource`, unchanged.

Hook behaviour for a non-`user` source: no kernel call, no judge call, one
`route` event `{ "skipped": "not-user-input" }` (§6.4), `silent` decision
(advisor prints nothing). The marker literals in §6.1 are placeholders: T05
verifies them against a captured background-task payload and returns the exact
strings as a wiring request; markers are data, never regex.

---

## 6. `registries/policy.json` additions — MINOR

`policy.version` → `"1.8.0"`. Every new block is read by the strict loader
(`src/registry/policy.ts`, T09): a missing or malformed field is a `KernelError`
naming the JSON path. Prose `note` fields are allowed in each block and ignored.

### 6.1 `router` additions (merged into the existing block; existing keys unchanged)

```json
"reasons": ["multi-agent-dispatch", "unrouted-scale", "requires-dispatch-plan", "low-confidence"],
"scoring": {
  "note": "Tier 1 fallback classifier (src/kernel/score.ts). Placeholders: v1 registries route exactly as the any-match router did; T13 calibrates from the golden set. bm25_weight < min_score so exemplar similarity alone never routes until calibrated.",
  "min_score": 1.0,
  "threshold": 0.0,
  "margin": 0.0,
  "top_k": 5,
  "max_intents": 8,
  "bm25_weight": 0.9,
  "path_weight": 1.0
},
"combination": {
  "note": "Declared invariants of src/kernel/combine.ts, checked by C38c; the loader refuses any other value (fail closed).",
  "gates": "deterministic-wins",
  "judge": "add-only",
  "intents": "noul-then-primary",
  "escalate_on_doubt": true
},
"source_markers": {
  "note": "Literal prefixes (after leading whitespace) that mark text the user did not type. Placeholders verified by T05 against captured payloads.",
  "notification": ["<task-notification>", "<background-task", "[Task notification]"],
  "tool_result": ["<function_results>", "<tool_result>", "<tool-result>"],
  "hook_echo": ["[engineos]"]
},
"tiebreak": {
  "note": "Embedding tie-break (rev 3, contracts §4.7). Read by src/kernel/combine.ts only on an ambiguous deterministic route with a tiebreak fact; the daemon is opt-in (ENGINEOS_EMBED_DAEMON=1). Placeholders until T13 calibrates against the golden set with the pinned MiniLM revision.",
  "min_similarity": 0.6,
  "margin": 0.1
}
```

(The `source_markers` literals shown are the rev 1 placeholders; T05's verified
strings, landed by T09, replace them.)

Loader types: `scoring` all numbers (`min_score >= 0`, `threshold`, `margin` in
`[0,1]`, `top_k`, `max_intents` positive integers, `bm25_weight`, `path_weight >= 0`);
`combination` exact literals; `source_markers` three non-empty string arrays;
`tiebreak` (rev 3, required) `min_similarity` and `margin` numbers in `(0, 1]`
— `0` is refused: a zero similarity floor would let any score win, and a zero
margin would let an exact tie decide (refusal text as T09a's other cuts:
`.router.tiebreak.<key> must be greater than 0 and at most 1`).

### 6.2 New top-level `judge` block

```json
"judge": {
  "note": "TypeSafe Jev as the opt-in semantic judge (ADR docs/adr/2026-10-10-three-tier-router-and-jev-judge.md). Off unless the enabled_env equals enabled_value AND key_env is non-empty; key_env is the NAME of the environment variable holding the key, and no key material ever lives in this registry. enabled_env, enabled_value and key_env are pinned in code (src/registry/policy-judge.ts) to exactly these values, max_state_bytes is capped there at 16384, and the redaction list is pinned there by hash; the loader refuses any other value, so the registry cannot choose the key, the switch or a weaker redaction. Prompts leave the machine: redaction runs before the request, only text the judge-only source test proves the user typed is sent, and the endpoint origin is fixed in code to https://api.typesafe.ai (the loader refuses any other); mode shadow records only. Every threshold is a placeholder until T13; intent_default and rule_default must be above 0, because a zero cut would make an intent or rule the judge never scored qualify.",
  "enabled_env": "ENGINEOS_JUDGE",
  "enabled_value": "jev",
  "provider": "typesafe",
  "endpoint": "https://api.typesafe.ai/v1/systemone",
  "model": "jev-1.13.0",
  "timeout_ms": 400,
  "retries": 0,
  "key_env": "TYPESAFE_API_KEY",
  "mode": "shadow",
  "max_state_bytes": 16384,
  "thresholds": {
    "intent_default": 0.5,
    "primary_confidence": 0.5,
    "margin": 0.2,
    "rule_default": 0.5
  },
  "redaction": {
    "note": "(rev 4) Applied in list order before the judge state and the tie-break daemon; see registries/policy.json for the authoritative note.",
    "patterns": [
      "... 27 { kind, pattern } entries, authoritative in registries/policy.json and pinned by hash in code (rev 4, §17.4, §17.11):",
      "private-key-block, private-key, private-key-id, jwt, anthropic-key, openai-key,",
      "sk-key, stripe-key, aws-key, github-token, github-pat, gitlab-token, npm-token,",
      "huggingface-token, google-key, atlassian-token, slack-token, url-credentials,",
      "basic-auth, bearer-token, aws-secret, secret-assignment, email, phone, cnpj, cpf, phone-br"
    ]
  },
  "breaker": {
    "scope": "provider",
    "state_file": "engineos-judge-breaker.json",
    "cooldown_ms": 60000
  }
}
```

Loader types: `mode` one of `shadow | advisory | authoritative`; `timeout_ms`,
`max_state_bytes`, `cooldown_ms` positive integers; `retries` integer `>= 0`
(the hook honours only `0` on the hot path; any other value is a loader
refusal in 1.8); thresholds (rev 3): `intent_default` and `rule_default` in
`(0, 1]` — they cut sparse probabilities where an absent id reads as `0`, so a
zero cut would make every absent intent or rule qualify; `primary_confidence`
and `margin` in `[0, 1]` — they compare fields that are always present, and `0`
is a meaningful (if aggressive) calibration that disables that doubt test;
`patterns[].pattern` a JavaScript
`RegExp` source compiled with flag `g` at load (a non-compiling pattern is a
refusal; rev 4: so is a pattern that uses `*`, `+` or an open range `{m,}`
with any digit count outside a character class, or a quantified group whose
body holds `|` or another quantifier (§17.11), and so is any `patterns` array
whose SHA-256 differs from the one pinned in code); `breaker.scope`
must be a member of `policy.breaker.scopes`. rev 4 (§17.11): `key_env` must be
exactly `TYPESAFE_API_KEY`, `enabled_env` exactly `ENGINEOS_JUDGE`,
`enabled_value` exactly `jev`, and `max_state_bytes` at most 16384. rev 4: `endpoint` must parse as a
URL whose origin is exactly `https://api.typesafe.ai` (default port, no URL
credentials); the allowlist lives in code. Because `parseJudge` runs inside the
strict `policy.json` loader, an off-origin endpoint, like any other refusal in
this block, refuses the **whole** `policy.json` load (every kernel answer that
reads the policy exits 1; `validate` reports C38c `judge-block-malformed`).
The `patterns` array shown above is abbreviated; the 27 entries in
`registries/policy.json`, pinned by hash in `src/registry/policy-judge.ts`, are
the contract (§17.4, §17.11).
`failure_threshold` is read from the existing `policy.breaker.failure_threshold` (3).

### 6.3 `registries/decision-rules.json` per-rule additions

Every rule gains two keys after `then`: `judge_fact: string | null` and
`judge_threshold: number | null` (rev 3: in `(0, 1]`, `0` refused for the same
sparse-read reason as `rule_default`; a non-null `judge_threshold` requires a
non-null `judge_fact`). Version → `"1.2.0"`.

| Rule | `judge_fact` | `judge_threshold` |
|---|---|---|
| rule-large-change | `large_change` | 0.5 |
| rule-public-contract | `affects_public_contract` | 0.5 |
| rule-sensitive-data | `handles_sensitive_data` | 0.5 |
| rule-production-write | `production_write` | 0.5 |
| rule-destructive-ddl | `destructive_ddl_or_dml` | 0.5 |
| rule-secret-exposure | `secret_reached_git_or_shared_file` | 0.5 |
| rule-volatile-knowledge | `knowledge_changes_frequently` | 0.5 |
| rule-multi-agent-design | `multi_agent_system` | 0.5 |
| rule-rag-corpus-safety | `retrieval_over_shared_corpus` | 0.5 |
| rule-spec-threshold, rule-fanout | `null` (derived in code, §4.3) | `null` |
| rule-verification, rule-change-record, rule-high-risk-critic | `null` | `null` |

`judge_fact` values are exactly the `fact.<name>` question suffixes of
`docs/specs/2026-10-10-jev-shadow-request.json`; `src/judge/questions.ts`
generates the `fact.*` questions from these keys, so the registry is the one
source of the fact vocabulary. The kernel refuses a `judge.rules` key that no
rule declares.

### 6.4 `telemetry.events` additions

The `route` event's `keys` gain `"skipped"` (appended last). New event, appended
after `hitl`:

```json
{
  "id": "judge",
  "written_by": ["src/hooks/prompt-advisor.ts"],
  "keys": ["source", "model", "mode", "skipped_reason", "latency_bucket"],
  "sample": { "source": "fallback", "model": "jev-1.13.0", "mode": "shadow", "skipped_reason": "timeout", "latency_bucket": "over" }
}
```

`latency_bucket` ∈ `lt100 | lt200 | lt300 | lt400 | over`. `source` ∈
`jev | fallback | skipped`. `skipped_reason` ∈ `JudgeReason`. No key ever
carries prompt text (`value_pattern` has no whitespace class).
`TELEMETRY_EVENT_IDS` becomes `['route', 'decision-rules', 'verify', 'hitl', 'judge']`.

---

## 7. Exec-journal span for a judge call — no schema change

One span per **attempted** call (not for `skipped`), written by
`src/hooks/prompt-advisor.ts` through `withSpan`:

| Field | Value |
|---|---|
| `span_kind` | `model` |
| `capability_id` | `route` |
| `model_tier` | `cheap` (the router span's tier; the schema requires a tier id) |
| `provider` | `typesafe` |
| `model` | the response-reported version (top-level `model`), else `policy.judge.model` |
| `status` | `OK` (facts) · `FAILED` (timeout, http, network, invalid-response, oversize-state) · `DEGRADED` (facts received but `latency_ms > timeout_ms` slack, or breaker half-open probe) |
| `tokens_in` | `JudgeOutcome.tokens_in` (`usage.input_tokens`, rev 2) when present, else `null` |
| `tokens_out` | `null` |
| `duration_ms` | wall time of the call |
| `route` | `primary.id` when facts, else absent |
| `note` | `judge=<reason>` for a failure; never prompt text |
| `trace_id`/`run_id` | session id (as every hook span) |

---

## 8. Eval case schema v2 (`evals/intent-routing-cases.jsonl`) — MINOR

Existing fields unchanged (`id`, `input`, `expect_intents`, `must_load`,
`must_not_load`, `notes`, optional `expect_risk`). Additive, all optional:

| Field | Type | Grading (T02 deterministic tier; T13 shadow tier) |
|---|---|---|
| `expect_primary` | `string` | an active intent id or `other`; deterministic tier checks it names a known id |
| `expect_not_intents` | `string[]` | ids that must be absent from the fallback `intents` |
| `exemplar` | `true` | the case seeds `intents.json exemplars`; requires exactly one `expect_intents` entry |
| `source` | `'user' \| 'notification'` | default `user`; `notification` cases expect no route (S0) |
| `judge` | object below | shadow-tier only; ignored by the deterministic tier except for shape |

```json
"judge": {
  "primary": "adr",
  "intent_above": ["adr"],
  "intent_below": ["llm", "new-feature"],
  "fact_above": ["handles_sensitive_data"],
  "fact_below": ["multi_agent_system"],
  "design_work_above": 0.5
}
```

Unknown-field tolerance of the grader stays (an unrelated key is not a failure).

---

## 9. Scored classifier interface (`src/kernel/score.ts`) — internal, frozen for T03/T06/T12

```ts
export interface RankedIntent { id: string; score: number; confidence: number; features: string[] }

// Deterministic and pure: no Date, no random, no I/O. Returns every candidate
// with score > 0, score descending, ties by registry order, NOT truncated;
// route.ts applies min_score / max_intents / top_k.
export function scoreIntents(text: string, regs: Registries): RankedIntent[];

// Tokenizer shared with the BM25 document builder: asciiDowncase, non-[a-z0-9]
// runs to one space, split, stopwords dropped, light stemming (-ing / plural -s).
export function tokenize(text: string): string[];
```

### 9.1 Features (per intent row, summed)

| Feature | Fires when | Contribution | `features[]` entry |
|---|---|---|---|
| phrase | `boundedContains(asciiDowncase(text), asciiDowncase(p.text))` | `+p.weight` | `+<w> "<text>"` |
| verb-object | some `verbs[]` stem and some `objects[]` stem both in `tokenize(text)` | `+verb_object.weight` (once) | `+<w> pair <verb>+<object>` |
| negative | phrase test on `n.text` | `-n.weight` | `-<w> "<text>"` |
| path | **only when the row has `phrases_declared` (rev 2)**, a whitespace-delimited raw token of `text` containing `/` or matching `*.<ext>` / `.<ext>` routes through `routeByPath` semantics to a non-excluded routing domain whose id equals this row's `domain` | `+scoring.path_weight` (once) | `+<w> path <token>` |
| exemplar | BM25 (k1 1.2, b 0.75; documents = `tokenize(exemplars.join(' '))` of every row that has exemplars; `idf = ln(1 + (N - df + 0.5) / (df + 0.5))`) normalised by the maximum over rows; rows without exemplars score 0 | `+scoring.bm25_weight * lex_i / max_lex` when `lex_i > 0` | `+<x.xx> exemplar` |

`score = max(0, round2(sum))`. Stopword list and stemming rules are
implementation details of `score.ts` (constants in the module), not contract.

### 9.2 Aggregates
`confidence_i = round2(score_i / Σ candidate scores)`; `margin` per §2.2.

### 9.3 Cost
Target `< 1 ms` per prompt on the bench host (measured in T13); no compiled
regex per phrase (substring scan, as today).

### 9.4 `features[]` grammar
`<sign><number> <kind>[ <detail>]` with `kind ∈ "<phrase>" | pair | path | exemplar`;
numbers printed with up to two decimals, no trailing zeros for integers. Never
contains prompt text other than the matched phrase or path token.

---

## 10. Judge client interface (`src/judge/`) — internal, frozen for T04/T05/T12

```ts
// src/judge/types.ts
export type { JudgeFact, JevFact, FallbackFact, JudgeReason } from '../kernel/judge-facts';  // mirror or re-declare identically

export interface JudgeInput {
  text: string;                       // raw prompt; redaction happens inside judge()
  source: PromptSource;               // judge() answers skipped: not-user-input for non-user
  repository: { declared_stack: string[]; active_spec: boolean; open_change_record: boolean };
  session: { last_intent: string | null };
}

export interface BreakerStore {       // src/judge/breaker.ts, file <gitdir>/engineos-telemetry/<state_file>
  read(): { failures: number; opened_at: number | null };
  recordFailure(now: number): void;   // atomic write; opens at policy.breaker.failure_threshold
  recordSuccess(): void;              // closes (failures 0, opened_at null)
}

export interface JudgeDeps {
  fetch: typeof globalThis.fetch | undefined;   // undefined -> skipped: no-fetch
  now: () => number;                            // epoch ms
  env: Record<string, string | undefined>;
  breaker: BreakerStore;
  policy: JudgePolicy;                          // regs.policy.judge
  questions: QuestionSet;                       // from src/judge/questions.ts (deterministic)
}

export type JudgeOutcome =
  | { kind: 'facts'; facts: JevFact; tokens_in: number | null }   // tokens_in: usage.input_tokens, null when absent (rev 2)
  | { kind: 'skipped'; reason: 'disabled' | 'no-key' | 'no-fetch' | 'breaker-open' | 'not-user-input' }
  | { kind: 'failed'; reason: 'timeout' | 'http-429' | 'http-4xx' | 'http-5xx' | 'network' | 'invalid-response' | 'oversize-state' };

// src/judge/jev.ts
export function judge(input: JudgeInput, deps: JudgeDeps): Promise<JudgeOutcome>;
```

### 10.1 Enablement order (first hit wins)
`source !== 'user'` → `skipped: not-user-input`; `env[enabled_env] !== enabled_value`
→ `skipped: disabled`; `env[key_env]` empty → `skipped: no-key`; `fetch`
undefined → `skipped: no-fetch`; (rev 4) endpoint origin not exactly
`https://api.typesafe.ai`, or URL credentials present → `skipped: disabled`
(re-check for a policy built without the loader; no breaker file is read or
written and no request is sent); breaker open and `now - opened_at < cooldown_ms`
→ `skipped: breaker-open` (no file write). Half-open (cooldown elapsed): one
probe proceeds; success closes, failure re-opens.

### 10.2 Request
`POST policy.judge.endpoint`, headers `Authorization: Bearer <key>`,
`Content-Type: application/json`; body is exactly `{ model, state, questions }`
with `model = policy.judge.model`, `questions` from `questions.ts`
(byte-identical to the committed `2026-10-10-jev-shadow-request.json` for the
same registries), and

```json
"state": {
  "request": { "text": "<redacted prompt>", "source": "user" },
  "repository": { "declared_stack": ["typescript", "nextjs"], "active_spec": false, "open_change_record": false },
  "session": { "last_intent": null }
}
```

Redaction (`src/judge/redact.ts`): each `policy.judge.redaction.patterns[]`
match in `text` is replaced by `<redacted:<kind>>`, in list order, before
serialization; asserted on the serialized body. rev 4 order (`redactBounded`):
(1) pre-cap the raw text to `2 × max_state_bytes` UTF-16 units (never splitting a
surrogate pair); (2) redact pattern by pattern, keeping after each pass only the prefix in
which that pass provably matches as it would on the whole prompt (rev 4
item 9(d)); the result is always a prefix of the whole prompt's redaction, and
a pattern the analysis cannot model keeps nothing (fail closed); (3) the size
cut below. A capped prompt carries `"truncated": true`. Size: when the serialized
`state` exceeds `max_state_bytes`, `request.text` is cut at a UTF-8 character
boundary until it fits and `"truncated": true` is added to `request`; a state
that cannot fit with an empty text → `failed: oversize-state`.
`AbortController` deadline `timeout_ms`; `retries: 0`.

### 10.3 Response → facts (rev 2: wire names confirmed)
HTTP status → reason: `429` → `http-429`; `401` (bad key) and `422` (request
rejected by the API's schema — our question set or state is malformed) →
`http-4xx`; `529` (overloaded) and every other 5xx → `http-5xx`; abort →
`timeout`; fetch rejection → `network`; non-JSON or schema failure →
`invalid-response`. Every one of those increments the breaker and a `facts`
outcome resets it. **`oversize-state` does not touch the breaker** (rev 2): it
is decided before any request is sent and describes the prompt, not the
provider; it still returns `failed`, still becomes a `fallback` reason, and
still writes one `FAILED` span (§7).

Wire shape, confirmed by T04 on 2026-10-11 against
`https://docs.typesafe.ai/api.md` and `/primitives/{choice,noul,score}.md`:
response top level `{ model, answers, usage }` — `model` the concrete version
served (slug, e.g. `jev-1.13.0`), `answers` an object keyed by question id,
`usage.{input_tokens, output_tokens}` integers. Documented error statuses:
`401`, `422`, `429`, `529`. Per answer type:

| Question | Answer object | Mapping |
|---|---|---|
| `primary_intent` (choice) | `{ type: "choice", choice, probabilities: { <option>: p }, confidence }` (`confidence` is spread-derived by the API) | `primary.id = choice`; `primary.confidence = confidence`; `primary.margin = probabilities[choice] - max(probabilities[other options])` (`1` with one option) |
| `intent.<id>` (noul) | `{ type: "noul", noul }` — `noul` is p(yes); no confidence field | `intents[id] = noul` |
| `fact.<name>` (noul) | same | `rules[name] = noul` |
| `is_project_change`, `design_work` (noul) | same | same-named fields |
| `scale`, `risk.*` (score) | `{ type: "score", score, confidence, legend, probabilities: { "0": p0, ..., "<n-1>": p } }` | `Math.round(Σ i·probabilities[String(i)])` → `0 \| 1 \| 2`; `score` and `legend` are read for schema validation only |
| top level | `model`, `usage.input_tokens` | `facts.model`; outcome `tokens_in` → span `tokens_in` (§7); `usage.output_tokens` is not billed and is left out of the span (`tokens_out: null`) |

Schema validation (`invalid-response`): every question id sent must be present
in `answers` with the matching `type`; every probability finite in `[0,1]`;
choice `choice` must be a sent option; score `probabilities` must carry exactly
the keys `"0"`..`"<levels-1>"`. `latency_ms` = `now()` after minus before the
request.

### 10.4 Question set (`src/judge/questions.ts`)
Generated deterministically from `intents.json` (active rows, registry order,
`backend-python` excluded, `other` last) and `decision-rules.json`
(`judge_fact !== null`, registry order): 1 Choice + N Nouls + `is_project_change`
+ `design_work` + 9 `fact.*` + `scale` + 5 `risk.*` = 49 today. The committed
shadow request file is regenerated from it (T04) and must agree byte for byte.

### 10.5 Hook integration (T05)
`prompt-advisor` awaits `judge()` with a hard deadline of `timeout_ms`
(the module's own abort plus a `Promise.race` guard); total hook budget stays
600 ms. Outcome → fact: `facts` → the `JevFact`; `failed`/`skipped` (except
`not-user-input`) → `{ source: 'fallback', reason }`; both are passed as
`resolve({ prompt, taskContract: true, judge })`. Advisor note (advisory and
authoritative modes only):

```
[engineos] judge (<source>, <model>): ranked=<id:p,...> flags=<rule:p,...> risk_proposal=<tier> — model judgment, not a gate
```

### 10.6 Embedding tie-break client (`src/judge/tiebreak.ts`) — internal, frozen as implemented by T12 (rev 3)

The interface is ratified exactly as merged in `64dfce8`: `tiebreak(input: TiebreakInput, deps: TiebreakDeps): Promise<TiebreakOutcome>`,
`nodeTiebreakDeps(env, redaction)`, `TiebreakInput { text; ambiguous; candidates: { id; exemplars }[] }`,
and

```ts
export type TiebreakOutcome =
  | { kind: 'scores'; scores: Record<string, number>; model: string; latency_ms: number }
  | { kind: 'skipped'; reason: 'disabled' | 'not-ambiguous' | 'no-candidates' | 'no-socket' | 'unsafe-socket' | 'oversize' }
  | { kind: 'failed'; reason: 'timeout' | 'network' | 'busy' | 'invalid-response' };
```

`scores` holds only offered ids, each in `[0,1]` (the client refuses the whole
reply otherwise), so it satisfies §3.1's value and ranked-candidate rules
whenever `candidates` is drawn from `route.ranked`.

Hook integration (T09d, `src/hooks/prompt-advisor.ts` / `prompt-judge.ts`):
1. Resolve the task contract as today (`resolve({ prompt, taskContract: true, judge? })`).
2. Consult the client only when `route.ambiguous` is true, `route.intents.length >= 2`,
   and the answer is not on the folded branch (no `jev` fact with
   `policy.judge.mode === 'authoritative'`); otherwise the kernel would ignore
   the fact, so the call is skipped.
3. `candidates = route.ranked.map(r => ({ id: r.id, exemplars: <intents.json row r.id>.exemplars }))`
   in ranked order; `text` = the raw prompt (the client redacts with
   `policy.judge.redaction.patterns`, rev 4: after the same pre-cap and
   trailing-fragment drop as §10.2, at `2 × 2,000` = 4,000 characters, then cuts
   to its 2,000-character limit); `deps = nodeTiebreakDeps(env, policy.judge.redaction.patterns)`.
4. On `kind === 'scores'` only, re-resolve with `tiebreak: outcome.scores` added
   to the same facts and use that answer; any other outcome keeps the first
   answer. Kernel calls are sub-millisecond; the second one is the cost of
   keeping the kernel free of I/O.
5. Budget: the client's own 150 ms deadline plus the judge's `timeout_ms`
   (400) stays inside the 600 ms advisor budget even when run one after the
   other; the hook may run the two concurrently (the deterministic route does
   not depend on the judge). No new telemetry event in rev 3: the route event
   keeps reporting `route.*`, which the tie-break never edits.

---

## 11. Router-table generation (`engineos gen router-table`) — MINOR

Region markers, each on its own line, in `CLAUDE.md` and `AGENTS.md`:

```
<!-- engineos:router-table:begin -->
| Intent (signals) | Load |
|---|---|
| ...one row per registry row... |
<!-- engineos:router-table:end -->
```

(rev 4 item 9) These are the exact strings of `ROUTER_TABLE_BEGIN` and
`ROUTER_TABLE_END` in `src/gen/router-table.ts`, matched as whole lines; the
generator writes nothing else on the marker lines. Edit
`registries/intents.json`, never the region.

- Rows: one per `intents.json` row in registry order, **including** the
  inactive `backend-python` row (it is in today's table), except
  `ios-release` + `android-release`, which emit **one** row at the position of
  `ios-release`. C16's arithmetic (`intents.length === rows + 1`) is unchanged;
  comment lines do not start with `|` and are not counted.
- Cell source: `router_row.intent` / `router_row.load` when present (the
  merged store-release row reads `ios-release.router_row`). When absent:
  intent cell = `<title> (<"phrase", ...>)` listing `phrases[].text` in
  registry order; load cell = `rules/<r>.md` joined by ` + `, then
  `skill \`<s>\`` per skill, `/engineos:<c>` per command, `agent \`<a>\``
  per agent, `<m> MCP` per mcp, separated by `; `, then ` — <note>` when a
  note exists.
- Idempotent on the committed files; C38d fails when the region differs from
  the generator's output; a file without both markers is left untouched and
  reported (the `commands/agents` preserve rule).

---

## 12. Shim warning line (T11) — Warn step of the 1.7.0 deprecation

Every entry-point shim under `hooks/*.sh` (not the two sourced libs) and every
`scripts/*.sh` shim prints, to **stderr**, before `exec`:

```
[engineos] <path> is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs <sub> ...
```

`<path>` is repo-relative (`hooks/prompt-advisor.sh`, `scripts/kernel.sh`);
`<sub> ...` is the exact replacement (`hook prompt-advisor`, `kernel ...`,
`journal ...`, `telemetry ...`, `init ...`, `bypass ...`, `validate`,
`gen agent-commands`, `gen agent-registry`, `evals`, `bench`, `usage-report`).
`ENGINEOS_QUIET_SHIMS=1` suppresses it (D3). Stdout is untouched. COMPATIBILITY
row text: *warn since 1.8.0, removed in 2.0*.

---

## 13. Supervisor correction token (T07) — MINOR (prose + usage-report)

The `[router]` announcement may end with `corrected_from=<id>[,<id>...]`, the
kernel-ranked intent ids the supervisor overrode. `src/report/usage.ts` mines
it with a sibling of `ROUTER_INTENT` and prints a `Misroutes` section
(`<kernel intent> -> <corrected intent>  <count>`). `retro` step 4 proposes
`phrases` / `negative` / `exemplars` deltas (three-occurrence rule).

---

## 14. Compatibility summary (for `docs/COMPATIBILITY.md` "Unreleased", T09)

| Surface | Change | Kind |
|---|---|---|
| `registries/intents.json` | `version "2.0.0"`; per-row `phrases`, `verb_object`, `negative`, `exemplars`, `threshold`, `router_row`; `signals` optional when `phrases` exists (read through 1.x, removed 2.0) | MINOR, one window opened |
| `route-intent` / `resolve {prompt}` | trailing `ranked`, `margin`; `ambiguous` may be true on weak confidence/margin | MINOR (tightening) |
| `route-escalate` / `resolve-task` route | trailing `ranked`, `margin`, `judge`; reason `low-confidence` appended to `policy.router.reasons` | MINOR |
| `resolve-task` task_contract | trailing `judge`, `risk_proposal`, `tiebreak` (rev 3); `decision_rules.judge_added` in task-contract answers; authoritative fold may add `multi-agent-dispatch` / `requires-dispatch-plan` to `escalation_reasons` (rev 3, add-only) | MINOR |
| `resolve --facts` | new fact keys `judge`, `tiebreak` (rev 3) | MINOR |
| `registries/policy.json` | `router.scoring`, `router.combination`, `router.source_markers`, `router.tiebreak` (rev 3), `judge`, telemetry `judge` event, route event key `skipped`; version 1.8.0 | MINOR |
| `registries/decision-rules.json` | per-rule `judge_fact`, `judge_threshold`; version 1.2.0 | MINOR |
| `hooks/hooks.json` | the five per-call hooks run `dist/engineos-hot.cjs` (T08); event contract unchanged | MINOR |
| `dist/engineos-hot.cjs` | new bundle (hot hooks only) | MINOR |
| `engineos gen router-table` | new gen arm; CLAUDE.md/AGENTS.md generated region | MINOR |
| `validate` | C38, C38b, C38c, C38d | MINOR (new failing checks) |
| `hooks/*.sh`, `scripts/*.sh` shims | Warn step (stderr line; `ENGINEOS_QUIET_SHIMS`) | deprecated → warn |
| `src/kernel/parity.test.ts` intent arms | kept (rev 4 item 9): `route-intent`, `route-escalate`, `resolve-task` compare the legacy keys after stripping the trailing additive keys, over the pinned v1 fixture registries; skip when bash/jq is missing or `bash -n` cannot parse the pinned kernel (macOS `/bin/bash` 3.2) unless `ENGINEOS_REQUIRE_PARITY=1` (set in CI) | test surface, recorded |
| Environment | `ENGINEOS_JUDGE`, `TYPESAFE_API_KEY`, `ENGINEOS_QUIET_SHIMS` (new; opt-in); rev 3 (T12): `ENGINEOS_INPROCESS`, `ENGINEOS_ROOT`, `ENGINEOS_NODE`, `ENGINEOS_EMBED_DAEMON`, `ENGINEOS_EMBED_CACHE`, `ENGINEOS_EMBED_OFFLINE`, `ENGINEOS_EMBED_IDLE_MINUTES` | added |
| In-process presence record v2 and shell stand-down (rev 4, §17.1–§17.3) | record `{ v: 2, pid, socket, session, started_at, served, root, version }`; written at the handshake; 5 s heartbeat, 30 s staleness; full condition list; `git-write-guard` never stands down | MINOR (tightening) |
| Mod git fallback (rev 4, §17.7) | asks on a git-like Bash call `git-write-guard` did not answer, unless `ENGINEOS_GIT_WRITES=auto`; `.catch` asks with no env check | MINOR (tightening) |
| `validate` C18f (rev 4, §17.8) | finding `hook-target-missing`; check count stays 72 | MINOR (new failing finding) |
| `judge.endpoint`, `judge.redaction`, judge source rule (rev 4, §17.4–§17.5) | exact origin, whole-load refusal; 25 kinds, bounded quantifiers, pre-cap order; `judgeMayReceive` | MINOR (tightening) |
| Authoritative fold (rev 4, §17.6) | high-floor survivors kept and protected; tier max; `rule-spec-threshold` on the folded ids | MINOR (tightening) |
| Compile cache, daemon install and cache (rev 4, §17.9) | per-uid private compile cache; `--ignore-scripts` + `.npmrc`; per-revision model cache, 0700 | MINOR |
| `adapters/claude-code-mod/`, `dist/engineos-inprocess.cjs`, `tools/embedding-daemon/` (rev 3, T12) | opt-in in-process adapter plugin, its host bundle, and the tie-break daemon package; none loaded by `dist/engineos.cjs`. Documented limit: with the adapter on, the registered `hooks.json` command hooks still spawn once per call and exit immediately (§16.7) | MINOR (opt-in) |

---

## 15. Consumer map

| Ticket | Sections consumed |
|---|---|
| T02 | §8 |
| T03 | §1, §2.2–2.3, §6.1 (`scoring`, `reasons`), §9. Its wiring request W3 (`export type RankedIntent` from `src/kernel/index.ts`) is **owned by T06**, which owns that barrel (rev 2) |
| T04 | §3 (fact shape), §6.2, §6.3, §7, §10 (rev 2: `tokens_in`, breaker exemption for `oversize-state`, confirmed wire names) |
| T05 | §2.1, §5, §6.1 (`source_markers`), §6.4, §7, §10.5 (rev 2: span `tokens_in` from `JudgeOutcome.tokens_in`; `oversize-state` spans) |
| T06 | §2.3–2.5, §3, §4, §6.1 (`combination`), §6.2 (`thresholds`, `mode`); owns `src/kernel/index.ts` exports incl. T03's W3 (rev 2) |
| T07 | §2.1, §13 |
| T08 | §14 (hot bundle rows), D3 |
| T09 | every registry section (§1, §6), §11, §14, D1, D4 (`README.md` is in T09's exclusive paths, rev 2), D8 |
| T10 | D1 |
| T11 | §12, D1, D3 |
| T12 | §4 (`tiebreak` slot), §10.6 (client ratified as merged); rev 3 records its accepted spawn-count deviation (§16.7) |
| T09a (rev 3) | §1.2 `threshold`, §6.1 `router.tiebreak`, §6.2 thresholds, §6.3 `judge_threshold` bounds (§16.5, §16.6) |
| T09d (rev 3) | §3.1, §4.5 rev 3, §4.7, §10.6 hook integration, §2.4 key 23 (§16.4, §16.6) |
| T13 | D5, D6, every placeholder (rev 3 adds `router.tiebreak.*`), the §16 test list, the §16.7 spawn measurement, the §17.10 test list, the daemon lockfile and the committed `dist/` bundles |
| SF (rev 4, security fix pass) | §4.1–§4.3, §5, §6.2, §10.1, §10.2, §10.6, §17 (ratified as merged at `a481025`) |

---

## 16. Revision 3 (2026-10-11) — decisions and consumer deltas

Owner: T01. Inputs: the T06 questions and the T12 wiring requests (supervisor
notes, "Contract rev3 queue" and "T12 returned DEGRADED"), checked against the
code merged at `64dfce8`. Rule applied: ratify implemented behaviour unless it
is unsafe or contradicts the ADR. Five items are ratified, one is changed, one
is new, one records a deviation.

| # | Question | Decision |
|---|---|---|
| 1 | `risk_proposal` in shadow/advisory | **Ratified** (T06): reported in every mode, folded only in authoritative |
| 2 | `hitl` tier on a topology fold | **Ratified**: the post-fold floor, judge proposal included |
| 3 | Authoritative `jev` turns a `null` floor into `low` | **Ratified**: §4.4 literally |
| 4 | Intent-derived reasons over judge-added intents | **Changed**: re-evaluated over the fold, add-only |
| 5 | Zero judge thresholds | **Ratified** (T09a): refused where the cut reads a sparse probability |
| 6 | Embedding tie-break fact | **New**: §3.1, §4.7, §6.1, §10.6, key 23 |
| 7 | Spawn count with the in-process adapter on | **Accepted deviation** (T12) |

### 16.1 `risk_proposal` reporting (ratified)

§2.4 and §2.5 already said "reported in every mode"; only the §4 preamble said
`riskProposal: null` in shadow/advisory. The preamble was the error. Reporting
is not folding, and shadow mode has no purpose if it does not record what the
judge would have proposed. The advisor still prints no judge note in shadow.
No consumer delta: `combine.ts` already computes the proposal before the mode
branch.

### 16.2 `hitl` tier (ratified)

`resolve.ts` hands `hitlSection` the floor the task contract publishes. Keeping
one tier per answer is the stronger invariant. The proposal can only add the
`high-risk` reason to a `hitl` section that `anyHigh` or the topology fact
already required, so it never creates a human gate by itself. No consumer delta.

### 16.3 `null` floor to `low` (ratified)

A `jev` proposal is never `null`, and `null` sorts below `low`. The result is
the low ceiling instead of a `null` ceiling, and a `null` ceiling is the value
`resolve.ts` warns a caller could read as "no ceiling". `substantive`, the
policy bundle and `hitl` do not read the floor, so a pure question still loads
nothing. The span `risk` field already defaults a `null` floor to `low`. This
applies only in authoritative mode. No consumer delta.

### 16.4 Intent-derived escalation reasons (changed)

**Why:** the fold replaces the intents and recomputes `agents`, but T06 kept
`route.reasons` plus `low-confidence`. A judge that folds to two
agent-carrying intents therefore publishes two agents with `escalates: false`.
The advisor guidance then says "No router dispatch needed", which contradicts
the escalation condition `routeEscalate` applies to the same kind of set.
Re-evaluating adds reasons and never removes one, so Rule 1 holds.

**Consumer delta, T09d:**
- `src/kernel/combine.ts`, `aggregateIntents`: also return the surviving rows,
  or two booleans (`multiAgent`: surviving rows with `agents.length > 0`
  number at least `regs.policy.router.escalate_when.multi_agent_intents_min`;
  `dispatchPlan`: some surviving row has `requires_dispatch_plan`).
- `src/kernel/combine.ts`, `folded`: the `escalateReasons` filter keeps
  `reason` when `route.reasons.includes(reason)`, or `reason === 'multi-agent-dispatch' && multiAgent`,
  or `reason === 'requires-dispatch-plan' && dispatchPlan`, or
  `reason === 'low-confidence' && doubt`. `unrouted-scale` keeps only the
  `route.reasons` term.
- The `deterministic` branch is unchanged.
- T13 tests: (a) a fold to two agent intents adds `multi-agent-dispatch` and
  sets `escalates: true`; (b) a fold to one intent keeps the deterministic
  `multi-agent-dispatch` (add-only); (c) a fold to a `requires_dispatch_plan`
  row adds that reason; (d) the policy order is preserved.

### 16.5 Zero thresholds (ratified)

These cuts are in `(0, 1]` because each one compares a sparse probability where
an absent key reads as `0`:
- `judge.thresholds.intent_default` and `rule_default`;
- intents row `threshold`;
- decision-rules `judge_threshold`, which also requires a non-null
  `judge_fact`.

`primary_confidence` and `margin` stay in `[0, 1]`: they compare fields that are
always present.

This matches T09a's in-flight loaders (`src/registry/policy-judge.ts`
`aboveZero` and `unitInterval`, `src/registry/intents.ts` `judgeCut`,
`src/registry/decision-rules.ts` `judgeFields`). **Consumer delta, T09a:** none
beyond what it already implements. T13 adds the refusal tests (each `0` cut
refused with its JSON path; `primary_confidence: 0` and `margin: 0` accepted).

### 16.6 Embedding tie-break (new)

Contract: §3.1 (the fact), §4.7 (selection), §6.1 (`router.tiebreak`), §10.6
(client and hook), §2.4 key 23. The ADR's own words, "only as a tie-breaker
when the fallback is ambiguous", become five invariants:
- the fact is read on the deterministic branch only;
- it is read only when `route.ambiguous` is true;
- the winner must already be a deterministic survivor;
- it never adds an intent, never lowers risk or model tier, and never edits
  `route.*`;
- it never removes an escalation reason.

The placeholders keep it inert until T13 calibrates `router.scoring` (§4.7,
last paragraph).

**Consumer delta, T09a (registries/loaders):**
- `src/registry/policy-router.ts`: add `TiebreakPolicy { min_similarity: number; margin: number }`
  and `RouterPolicy.tiebreak: TiebreakPolicy` (required). Parse both keys in
  `(0, 1]` with the error
  `.router.tiebreak.<key> must be greater than 0 and at most 1`. Prose `note`
  is allowed.
- `registries/policy.json`: add the `router.tiebreak` block of §6.1 after
  `source_markers`. Version stays `1.8.0` (unreleased).
- `test/fixtures/legacy-kernel/registries/policy.json`: only if the fixture is
  read by the strict TS loader (T03 W4 precedent). Add the same block there.

**Consumer delta, T09d (kernel + hook wiring):**
- `src/kernel/` (a new `tiebreak-facts.ts`, or `judge-facts.ts`):
  `tiebreakFact(value: unknown, regs: Registries): Record<string, number>`.
  It requires an object with active-intent keys and finite `[0,1]` values, with
  the §3.1 messages.
- `src/kernel/cli.ts` `parseFacts`: `case 'tiebreak': facts.tiebreak = value; break;`.
- `src/kernel/resolve.ts`:
  - `DeclaredFacts.tiebreak?: unknown`;
  - refuse it without `taskContract: true` (§3.1 message);
  - after `routeEscalate`, refuse keys not in `route.ranked` (§3.1 message);
  - pass `tiebreak` into `combine`;
  - add `TaskContractSection.tiebreak: string | null` as key 23, filled from
    `combined.tiebreakWinner`.
- `src/kernel/combine.ts`:
  - `CombineOutput.tiebreakWinner: string | null`;
  - in `deterministic`, apply §4.7 when `input.tiebreak !== undefined && route.ambiguous`;
  - in `folded`, ignore `tiebreak` and set `tiebreakWinner: null`;
  - reuse `aggregateIntents` and `highest`;
  - replace the "Reserved for T12; never read here" comment.
- `src/hooks/prompt-advisor.ts` / `src/hooks/prompt-judge.ts`: apply the
  §10.6 hook-integration steps 1–5, using `tiebreak` and `nodeTiebreakDeps`
  from `src/judge/tiebreak.ts`. Pass the exemplars from the loaded intents
  registry.
- `src/hooks/prompt-advisor-guidance.ts` (optional): print `tiebreak=<id>` on
  the task-contract line when it is non-null.
- T09d's other T12 items (build entry, shell guard, optional
  `src/lib/runtime-dir.ts`) are wiring, not contract. The shell guard stays
  security-sensitive and needs `security-reviewer`; rev 3 does not change it.

**T13 tests and calibration:**
- Calibrate `router.tiebreak.{min_similarity, margin}` with
  `router.scoring.{threshold, margin}`. The tie-break only acts after the
  scoring cuts are non-zero.
- Kernel tests:
  - no selection with fewer than two survivors;
  - no selection when a survivor is unscored;
  - no selection below `min_similarity` or within `margin`;
  - the winner is kept, and a high-floor survivor is kept too;
  - dropped survivors are appended to `suppressed` with `by: <winner>`;
  - `risk_floor` and `model_tier` are never lowered;
  - `escalation_reasons` are unchanged;
  - ignored on the authoritative fold;
  - applied in shadow and advisory with a `jev` fact;
  - every §3.1 refusal;
  - `route.*` is byte-identical with and without the fact.
- Hook tests:
  - the client is not called when the route is not ambiguous, has fewer than
    two survivors, or is on the authoritative fold;
  - only a `scores` outcome causes the re-resolve.

### 16.7 Spawn count with the in-process adapter (accepted deviation)

T12's acceptance target was zero per-call hook spawns with
`ENGINEOS_INPROCESS=1`. That target **cannot be met on the current host**.
Claude Code spawns every registered command hook in the root `hooks.json`
whatever the plugin does. With the adapter on, the shell side finds a live,
private, same-session v2 presence record that lists its hook and passes every
§17.3 condition (rev 4), and exits immediately. The cost is
**one immediate-exit spawn per registered `hooks.json` route per call**.

Zero needs one of two host-side changes:
- a host feature to disable one plugin's command hooks;
- an install variant that ships without `hooks.json` when the adapter is on.

Answering classic events without `next` is rejected, because it would also
suppress the user's own hooks.

Status: **DEGRADED, accepted with caveat**, never relabelled OK. T13 measures
and reports the per-route immediate-exit count and its latency. The ADR
consequences record the gap. Revisit when the host ships per-plugin
command-hook disable.

---

## 17. Revision 4 (2026-10-11) — security fix pass

Owner: T01. Inputs: the security review of PR #132 and its fix units, checked
against the code merged at PR head `a481025`. Rule applied: the merged code is
the contract; every earlier line here that it contradicts is corrected in
place (changelog rev 4). Operator-facing detail lives in `docs/OPT-IN-TIERS.md`;
the decision and threat model live in the ADR ("Threat model and redaction").

### 17.1 Presence record v2 (`adapters/claude-code-mod/host/presence.ts`, `src/lib/runtime-dir.ts`)

Paths (one home, `src/lib/runtime-dir.ts`; directory `0700`, refused when a
symlink, owned by another uid, or carrying any group/other bit; socket `0600`;
record written atomically `0600`):

```
<XDG_RUNTIME_DIR | TMPDIR | os.tmpdir()>/engineos-<uid>/h-<sha256(session_id)[0:16]>.json
<XDG_RUNTIME_DIR | TMPDIR | os.tmpdir()>/engineos-<uid>/h-<sha256(session_id)[0:16]>.sock
```

```ts
interface PresenceRecordV2 {
  v: 2;
  pid: number;            // positive integer
  socket: string;         // the expected socket path above
  session: string;        // the envelope session_id
  started_at: number;     // epoch ms
  served: string[];       // <= 64 names, each ^[a-z][a-z0-9-]{0,63}$
  root: string;           // realpath(resolveRoot(env)); absolute, <= 4096 chars
  version: string;        // host bundle ENGINEOS_VERSION, <= 64 chars; 'unbuilt' when unbundled
}
```

A version-1 record, or any record missing a field or out of bounds, is not a
presence record.

### 17.2 Handshake and heartbeat

- The host writes the record while answering the mod's first
  `GET /v1/routes`, never on listen. A write failure answers `500`
  `presence-unwritable`; the mod abandons the host (ends the child) and the
  shell hooks stay in charge.
- The mod's deadlines: `READY_DEADLINE_MS` 5,000 for the host to be ready,
  `ROUTES_DEADLINE_MS` 1,000 for the route answer. Abandon reasons:
  `routes-unreadable`, `ready-timeout`, `host-exited`.
- Heartbeat: the host re-stamps the record mtime every `PRESENCE_HEARTBEAT_MS`
  (5,000). A record older than `PRESENCE_STALE_MS` (30,000) is dead; the shell
  ignores it and `claimPaths` removes it (and its socket) for a new host on the
  same session. A missed stamp is logged, not fatal.

### 17.3 Stand-down (`servedInProcess`, `src/hooks/adapter.ts`)

A shell hook exits silently only when all of these hold, in this order; any
failure or exception runs the hook:

1. hook is not `git-write-guard` (**the guard never stands down**);
2. `ENGINEOS_INPROCESS=1`;
3. raw `session_id` matches `^[A-Za-z0-9._-]{1,128}$`;
4. a POSIX uid exists;
5. the shell entry is bundled and carries its version (unbundled never stands down);
6. the runtime directory passes the privacy rule;
7. the record file is regular, owned by uid, no group/other bits, opened with
   `O_NOFOLLOW`, at most 4 KiB;
8. it parses as `PresenceRecordV2`;
9. `session` and `socket` match;
10. the hook is in `served`;
11. `version` equals this bundle's `ENGINEOS_VERSION`;
12. mtime within `PRESENCE_STALE_MS`;
13. a socket owned by uid exists at the path (not a file or symlink);
14. `pid` is not the hook's own;
15. `process.kill(pid, 0)` succeeds;
16. `root` equals the realpath of the nearest directory above the shell entry's
    own file that holds `hooks/hooks.json` (search depth `MAX_ROOT_DEPTH` 8),
    deliberately not `ENGINEOS_ROOT`.

### 17.4 Judge egress (`src/registry/policy-judge.ts`, `src/judge/{jev,redact,state,tiebreak}.ts`)

- **Endpoint.** The loader refuses any `judge.endpoint` whose origin is not
  exactly `https://api.typesafe.ai` (default port; no URL credentials). The
  refusal is inside the strict `policy.json` loader, so the whole load fails
  (C38c `judge-block-malformed`). `jev.ts` re-checks after `no-fetch` and before
  the breaker, answering `skipped: disabled` (§10.1).
- **Redaction kinds**, in application order: `private-key-block`,
  `private-key`, `private-key-id`, `jwt`, `anthropic-key`, `openai-key`,
  `sk-key`, `stripe-key` (`sk_`/`rk_` with `live_`/`test_`), `aws-key`
  (`AKIA`, `ASIA`), `github-token` (`gh[opsur]_`), `github-pat`,
  `gitlab-token`, `npm-token`, `huggingface-token`, `google-key`,
  `atlassian-token`, `slack-token` (`xox[abprs]-`), `url-credentials`,
  `bearer-token`, `aws-secret`, `secret-assignment`, `email`, `phone`, `cnpj`,
  `cpf`. Sources are authoritative in `registries/policy.json`. Every
  pre-existing kind keeps its name.
- **Bounded quantifiers.** The loader refuses a pattern using `*`, `+` or
  `{m,}` outside a character class.
- **Order.** Pre-cap (judge `2 × max_state_bytes`, tie-break `2 × 2,000`
  characters) → redact to the prefix that agrees with redaction of the
  whole prompt (rev 4 item 9(d)) → final cut; a capped judge prompt carries `request.truncated: true`.

### 17.5 Judge-only source rule

`judgeMayReceive(env, markers)` (§5) is true only when `classifyPromptSource`
answers `user`, the prompt with leading whitespace trimmed does not match
`^<[A-Za-z][A-Za-z0-9_.:-]{0,63}(?:[\s/>]|$)`, and nothing throws (including the
marker registry read). It applies even when the host declares the source
`user`. Routing and the tie-break are unchanged.

### 17.6 Authoritative fold (`src/kernel/combine.ts` `folded()`)

`keptHigh` = deterministic survivors with risk floor `high`; folded ids =
judge choice, then `keptHigh` ids not already chosen; `aggregateIntents(ids,
regs, keptHigh)` protects `keptHigh` from suppression; `modelTier =
highest(route.model_tier, aggregate.modelTier)`; `rule-spec-threshold` reads the
folded ids. Note: a kept high-floor id still takes part in suppression of other
ids, judge-chosen ones included, exactly as the existing aggregation does. The
§4.7 `narrowed()` path already kept high-floor survivors and the tier max
(rev 3); rev 4 makes the fold match it.

### 17.7 Mod git fallback (`adapters/claude-code-mod/hooks/register.ts`)

- `ENGINEOS_ROOT` / `ENGINEOS_NODE` are honoured only when absolute and NUL-free;
  otherwise a debug line and the default.
- `needsGitFallback`: flag on, tool `Bash`, `git-write-guard` did not answer,
  no other EngineOS hook asked or blocked, and `looksLikeGitCommand` (strip
  `'`, `"`, `\`, then `/g(?:it|h)/`) → `ask`, **unless**
  `ENGINEOS_GIT_WRITES === 'auto'`.
- The `.catch` path, when the handler throws before `next`: `ask` on a git-like
  Bash call, with no environment check.

### 17.8 `validate` C18f — `hook-target-missing` (`src/checks/kernel-router.ts`)

Reports a `hooks.json` command whose `${CLAUDE_PLUGIN_ROOT}/<path>` target is
missing; a path that is absolute, contains a backslash or has a `..` segment;
and, for an existing `dist/` loader, a missing `require('./runtime/...')`
bundle. No new check id (72 checks). It fires at the PR head until the approved
final build commits the `dist/` bundles.

### 17.9 Compile cache and daemon

- **Compile cache** (generated `dist/` loaders):
  `<XDG_RUNTIME_DIR || TMPDIR || os.tmpdir()>/engineos-<uid>/compile-cache`.
  Both directories are created `0700` and verified by `lstat` (a real
  directory, owned by uid, no group/other bits); otherwise, or without a POSIX
  uid, the cache is skipped. This avoids Node's shared default
  `<tmpdir>/node-compile-cache`.
- **Daemon install:** `npm --prefix tools/embedding-daemon ci --ignore-scripts`;
  `tools/embedding-daemon/.npmrc` sets `ignore-scripts=true`,
  `onnxruntime-node-install=skip`, `save-exact`, `engine-strict` and
  `fund=false`. The lockfile is pending until T13 (needs network).
- **Model cache:** `<cacheDir>/<MODEL_REVISION>/`, created recursively with
  mode `0700`; `MODEL_REVISION` is the pinned
  `751bff37182d3f1213fa05d7196b954e230abad9`.

### 17.10 Known residuals and tests

Residuals (accepted; both resolve toward a double fire or a failed adapter
start, never a silenced guard):
- a second Claude Code process on the same session id can have its advisory
  hooks stand down on the first process's live record (needs an owner field;
  out of scope for PR #132);
- the listen-to-handshake race.

Tests: no new list. The existing T13 list (§16 and the plan) covers these
surfaces at the approved final stage.

### 17.11 Re-review fixes (E1–E4)

Inputs: the security re-review of PR #132 at `4ba0cd4` (2026-10-11, APPROVE
WITH CONDITIONS, new low findings N1–N4) and the second fix pass. Still rev 4:
these lines tighten §6.2, §17.4 and §17.7 without a new revision. Where §17.4
lists 25 kinds or the bounded-quantifier rule alone, this section supersedes it.

- **E1 — loader linearity** (`src/registry/policy-judge-pattern.ts`
  `patternShape`, called from `src/registry/policy-judge.ts`). Outside a
  character class the loader refuses `*`, `+`, and `{m,}` with any digit count
  (the old check allowed only 1–6 digits), and refuses any group followed by
  a quantifier (`?` or `{...}`) whose body holds `|` or another quantifier at
  any nesting depth. Character classes are exempt, as are alternations and
  quantifiers inside a group that is not itself quantified. A refusal names
  the pattern's JSON path and the shape (`unbounded-quantifier`,
  `quantified-ambiguous-group`, `unbalanced-group`). The shipped set is
  linear; the loader refuses unbounded quantifiers and quantified groups
  holding alternation or nested quantifiers, and pins the shipped list by hash
  (E2). The shape test is a floor, not a proof.
- **E2 — registry pins** (`src/registry/policy-judge.ts`, beside
  `JUDGE_ENDPOINT_ORIGIN`). `key_env` must equal `TYPESAFE_API_KEY`,
  `enabled_env` `ENGINEOS_JUDGE` and `enabled_value` `jev`; `max_state_bytes`
  must be at most `16384` (the shipped value); and
  `sha256(JSON.stringify(judge.redaction.patterns))`, over the array as parsed
  (rows and key order as in the file), must equal
  `dffb903c4b0f554d494e3cf78981703f3c85f42c97240de5be2e844d82d86058`. Row
  checks run first, then the hash. Any mismatch is a malformed `judge` block,
  so the whole `policy.json` load is refused (C38c `judge-block-malformed`).
  `src/judge/jev.ts` is unchanged: it reads the env names from the loaded,
  now pinned, policy. `test/fixtures/legacy-kernel/registries/policy.json`
  carries the identical `judge.redaction` block (same hash).
- **E3 — redaction classes.** 27 kinds, in order: `private-key-block`,
  `private-key`, `private-key-id`, `jwt`, `anthropic-key`, `openai-key`,
  `sk-key`, `stripe-key`, `aws-key`, `github-token`, `github-pat`,
  `gitlab-token`, `npm-token`, `huggingface-token`, `google-key`,
  `atlassian-token`, `slack-token`, `url-credentials`, `basic-auth`,
  `bearer-token`, `aws-secret`, `secret-assignment`, `email`, `phone`, `cnpj`,
  `cpf`, `phone-br`. New: `basic-auth` (`[Bb]asic\s{1,4}[A-Za-z0-9+/]{8,4096}={0,2}`)
  and `phone-br` (word-bounded Brazilian national number: `(DD)`, `DD ` or
  `DD-` then an 8- or 9-digit subscriber number with an optional separator,
  or the bare 11-digit mobile form `DD9` plus 8 digits). Changed:
  `url-credentials` password part `[^\s/]{1,256}` (may hold `@`; backtracks to
  the last `@` before `/` or whitespace); `secret-assignment` gains quoted
  value branches `"[^"\n]{4,256}"` and `'[^'\n]{4,256}'`. Rewritten without
  quantified groups to pass E1, matching the same or more text:
  `private-key-block` and `private-key` (`[A-Z0-9 ]{0,51}` for the key-type
  words), `aws-secret` (`(?:AWS)?[_-]?` and `(?:ACCESS)?[_-]?` forms),
  `secret-assignment` (prefix `[A-Za-z0-9_-]{0,33}`), `email` (domain
  `[A-Za-z0-9-]{1,63}\.[A-Za-z0-9.-]{0,251}[A-Za-z0-9-]`) and `phone` (seven
  unrolled separator-digit steps, then a bounded tail ending in a digit; still
  at least 8 digits after `+`). Each pattern's worst time over adversarial
  inputs of 32,768 characters (`2 × max_state_bytes`) stayed under 2 ms.
  Intentionally unmasked classes: none (ADR "Classes intentionally unmasked").
- **E4 — unresponsive host** (`adapters/claude-code-mod/hooks/register.ts`,
  `host/lifetime.ts`, `host/protocol.ts`). Only a `callHook` timeout abandons
  the host: its state is `failed` for the rest of the session, the mod calls
  `child.return()` (the host's exit handler removes the presence record and
  socket) and stops routing to it, logging at debug, so the shell hooks serve.
  A refused, non-ok or malformed answer is logged and skipped as before; a
  dead host is caught by the existing spawn-loop exit. After a timeout the
  remaining hooks of that matcher group are not called for that event; the
  §17.7 git fallback ask still applies to that call. Host watchdog: the host
  stops itself (removes record and socket, exits, `stopping
  reason=stalled-hook`) when it holds a hook request longer than
  `HOST_STALL_MS = max(HOOK_DEADLINE_MS) + 5 s` (15 s today); the stall check
  runs before the heartbeat stamp, so an abandoned host never re-stamps, and
  the record stays fresh at most about 20 s after a stalled request arrives.
  The deadline table moved to `host/protocol.ts` as `HOOK_DEADLINE_MS`, values
  unchanged. While the host is down the §17.7 fallback is over-inclusive (it
  asks on any `gh` or `git` substring, `high` included); accepted as fail-safe
  and kept as decided in D2.
- **Residual rulings.** The re-review accepted (a) the same-session second
  process, (b) the listen-to-handshake race, (c) the fallback skipped under
  `ENGINEOS_GIT_WRITES=auto`, and (d) lexical redaction and same-uid trust,
  with the E3 shapes masked. New residual: a synchronously blocked host can
  leave its record fresh up to `PRESENCE_STALE_MS` (30 s) after its last stamp
  unless the engine escalates to SIGKILL (the pid probe then fails); it never
  affects `git-write-guard`. The owner-field change and the unresponsive-host
  family are a tracked follow-up.
- **Tests.** Added to the T13 list at the approved final stage: loader
  refusals for each E1 shape and each E2 pin (including a one-character
  pattern edit and a reordered list), acceptance of the shipped block and of
  the fixture block, an E3 coverage corpus with negatives, the adversarial
  timing test at `2 × max_state_bytes`, and the E4 abandon, no-double-kill,
  fallback-after-timeout and host-watchdog cases.
