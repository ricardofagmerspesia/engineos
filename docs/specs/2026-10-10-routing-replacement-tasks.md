# TASKS — routing replacement (spec `docs/specs/2026-10-10-routing-replacement-plan.md`)

Base: branch `feat/routing-replacement`
at `0b2e442`. Companion notes (supervisor scratch, outside the repo): `explore-routing-kernel.md`, `explore-hooks-runtime.md`,
`explore-validator-and-generation.md`, `explore-policy-tables-and-divergences.md` (read the last
one first: the spec cites uncommitted main-tree files).

Standing rules for every ticket:
- Nothing calls the TypeSafe API. `src/judge/**` takes `fetch` by injection; every worker uses a
  recorded/stub transport. Live shadow runs, threshold calibration (P1c) and baseline numbers (P0)
  are deferred to the approved final stage (T13), after the security review and the recorded
  human decision (`rule-sensitive-data`, external effect + spend).
- No test authoring or execution before T13. Tickets list the test files they will need.
- No `dist/engineos.cjs` rebuild before T13. No git writes by workers.
- Registries, `hooks/hooks.json`, `src/cli.ts`, `src/kernel/cli.ts`, `src/checks/ids.ts`,
  `src/checks/index.ts`, `CLAUDE.md`, `AGENTS.md`, `docs/COMPATIBILITY.md`, `.github/workflows/`
  have ONE owner: T09. Other tickets return exact deltas for those files in their envelope under
  `### Wiring requests`.
- Public surface rules: `docs/COMPATIBILITY.md` (additive = MINOR; removal/rename = MAJOR; the
  hook shims are already deprecated, so only the Warn step is available now).

Ticket count: 13. The spec has 9 phases, 6 speed steps, registry + envelope changes and a
compatibility section; they consolidate into one contract ticket, nine implementation tickets
grouped by review boundary and exclusive path set, one wiring/landing ticket, one opt-in tier
ticket and one final integration ticket. Fewer would merge unrelated review boundaries (judge
code with kernel combination; speed work with policy tables); more would split single files.

---

## T01 — Freeze contracts and write the ADR

- **Phase:** P0 prerequisite (spec §4 registry/envelope, §4a facts, §8 compatibility).
- **Tier/model:** most-capable (`fable`). **Risk:** medium (defines versioned public surface).
- **Deliverable:**
  1. `docs/adr/2026-10-10-three-tier-router-and-jev-judge.md` — direction (Tier 0 gates / Tier 1
     scored TS classifier / Tier 2 router agent; Jev as opt-in shadow-first judge that only adds
     safety); rejected alternatives from spec §3 (Julia, GoRules Zen, LLM-per-prompt, local
     embeddings-on-spawn); **retirement of intent-routing byte parity** (route-intent,
     route-escalate, resolve-task arms of `src/kernel/parity.test.ts`; path and policy parity
     stay); **Mastra non-applicability** for the judge (typed classifier call inside a CLI hook, not
     an LLM application per `rules/llm-apps.md`); pinned model `jev-1.13.0`; data-egress posture
     (`ENGINEOS_JUDGE=jev` + `TYPESAFE_API_KEY` env only, default off, ZDR before team default-on).
  2. `docs/specs/2026-10-10-routing-replacement-contracts.md` — the frozen contracts, each with a
     revision tag `rev 1`:
     - **intents.json v2**: top-level `version: "2.0.0"` (string); per-intent additive fields
       `phrases: [{text, weight}]`, `verb_object: {verbs[], objects[], weight}`, `negative: [{text,
       weight}]`, `exemplars: string[]` (3–10), `threshold: number` (judge noul cut, placeholder
       0.5). v1 compatibility: a row with `signals` and no `phrases` reads as weight-1 phrases;
       `signals` stays for one window (read, never required when `phrases` exists).
     - **Answer envelope (additive, trailing keys only)**: `route.ranked: [{id, score, confidence,
       features: string[]}]` appended to BOTH the intent form (after `ambiguous`) and the escalate
       form; `route.margin: number|null`; `route.judge: {source: 'jev'|'fallback'|'skipped',
       reason: string|null, model: string|null}`; `task_contract.judge` (same object) and
       `task_contract.risk_proposal: RiskTier|null`. `route.intents`/`route.matches` keep their
       exact shapes. `route.ambiguous` becomes true also when confidence < `router.scoring.threshold`
       or margin < `router.scoring.margin` (MINOR tightening).
     - **Judge facts** (new `resolve --facts` key `judge`, MINOR): `{source, model, latency_ms,
       is_project_change: number, primary: {id, confidence}, intents: Record<id, number>,
       rules: Record<ruleId, number>, scale: 0|1|2, design_work: number, risk: {reversibility,
       blast_radius, data_sensitivity, contract_surface, spend} each 0|1|2}`. All numbers in [0,1]
       except the 3-level scores. Unknown keys refused like every other fact.
     - **Prompt source**: `src/hooks/prompt-source.ts` `classifyPromptSource(env): 'user' |
       'notification' | 'tool-result' | 'hook-echo'`; markers as data in
       `policy.json .router.source_markers` (literal prefixes, no regex). Non-user text: no judge
       call, route event carries `skipped: not-user-input`, advisor silent.
     - **policy.json blocks** (exact JSON): `router.scoring {threshold, margin, top_k, max_intents}`;
       `router.combination {gates: "deterministic-wins", judge: "add-only", intents:
       "noul-then-primary", escalate_on_doubt: true}`; `judge {enabled_env: "ENGINEOS_JUDGE",
       enabled_value: "jev", provider: "typesafe", endpoint, model: "jev-1.13.0", timeout_ms: 400,
       retries: 0, key_env: "TYPESAFE_API_KEY", mode: "shadow"|"advisory"|"authoritative",
       max_state_bytes, thresholds: {intent_default, primary_confidence, margin, rule_default},
       redaction: {patterns: [...]}, breaker: {scope: "provider", state_file:
       "engineos-judge-breaker.json"}}`; `telemetry.events[]` gains `{id: "judge", keys: [source,
       model, skipped_reason, latency_bucket]}`; `router.source_markers`.
     - **Journal span** for a judge call: `span_kind: model`, `provider: typesafe`, `model`,
       `capability_id: route`, `status` OK|FAILED|DEGRADED, `tokens_in` when reported. No schema change.
     - **Eval case schema v2** (additive): `expect_primary`, `expect_not_intents[]`, `exemplar:
       true`, `source` (`user|notification`), `judge: {intent_above: [...], intent_below: [...],
       fact_above/fact_below}` for shadow acceptance cases.
     - **Scored classifier interface**: `scoreIntents(text, regs): Ranked[]` in `src/kernel/score.ts`;
       features = phrase hits, verb-object pairs, negatives, path/extension tokens, BM25 over exemplars.
     - **Judge client interface**: `judge(input: JudgeInput, deps: {fetch, now, env, breaker}):
       Promise<JudgeOutcome>` in `src/judge/jev.ts`; `JudgeOutcome = {kind:'facts', facts} |
       {kind:'skipped', reason} | {kind:'failed', reason}`; hook awaits with a hard 400 ms deadline.
     - **CLAUDE.md router-table generation**: markers `<!-- @generated:router-table start -->` /
       `end`; one row per active intent except ios/android (one row); C16 arithmetic preserved.
     - **Shim warning line** (stderr): `[engineos] <path> is deprecated since 1.7.0 and will be
       removed in 2.0 — use: node dist/engineos.cjs <sub> ...`.
     - **Branch-base decision** recorded: whether the main checkout's uncommitted workflow work
       (`src/kernel/execution.ts`, `src/scheduler/`, `src/workflow/`, `policy.workflow`) lands on
       this branch before T09/T10 (see divergences note). Until decided, T10 is HEAD-only.
- **Exclusive write paths:** `docs/adr/2026-10-10-*.md`, `docs/specs/2026-10-10-routing-replacement-contracts.md`.
- **Blocked by:** none. **Consumes:** spec §4/§4a/§8, companion JSON, `docs/COMPATIBILITY.md`.
  **Produces:** contracts rev 1 (every consumer cites `contracts.md@rev1`).
- **Acceptance criteria:** ADR has >= 3 rejected alternatives with reasons; names parity
  retirement scope by test name; names the Mastra deviation and its reason; every contract above
  has exact key names, types, order position, and a compatibility class (MINOR/MAJOR); the
  intents.json v2 example row validates against the loader rules in `explore-routing-kernel.md`;
  the policy blocks are copy-pasteable JSON; the branch-base decision is written as a decision,
  not an open question.

## T02 — P0 golden set growth and baseline scaffolding

- **Phase:** P0. **Tier:** build. **Risk:** low.
- **Deliverable:** `evals/intent-routing-cases.jsonl` grows from 36 to >= 120 cases: every
  active intent gets >= 3 paraphrases, the three observed misroutes (spec §2: misroute 1 ->
  `other`/no `llm`; misroute 2 -> `adr` ahead of `new-feature`; misroute 3 -> `source:
  notification`, no route), negative cases for the common-word traps ("agent", "create",
  "service", "prompt", "UI", "review"), the six `policy.router.fixtures` prompts, and >= 3
  `exemplar: true` cases per intent (these become `intents.json exemplars` in T09). Shadow
  acceptance cases per spec §4a table carry the `judge` expectations. `evals/RUBRIC.md` documents
  the v2 fields and the shadow-tier grading (precision/recall per intent, fallback vs judge).
  `src/evals/deterministic.ts` accepts the v2 fields (unknown-field tolerance stays; `expect_primary`
  must name an intent; `exemplar` cases must have exactly one `expect_intents`), keeps the 7
  assertions and `COVERAGE_FLOOR`. `evals/BASELINE.md` is created with the metric table (precision,
  recall, MRR@3 per tier, bench p50/p95 per scenario) and the fields marked `pending approved run`
  — numbers are filled in T13 only.
- **Exclusive write paths:** `evals/**`, `src/evals/deterministic.ts`, `src/evals/live.ts`.
- **Blocked by:** T01 (eval case schema v2). **Consumes:** contracts@rev1 eval schema.
  **Produces:** exemplar set (consumed by T09), golden set (consumed by T13).
- **Acceptance criteria (deferred to T13 for execution):** `node dist/engineos.cjs evals` deterministic
  tier passes with >= 120 intent cases; every active intent appears in `expect_intents` of >= 3
  cases; the three misroute cases exist with the expected fields; no case lists an always-on rule
  in `must_not_load`; the six router fixtures appear unchanged.
- **Tests needed later:** `src/evals/deterministic.test.ts` (v2 field validation cases).

## T03 — P1 scored classifier and v2 intents loader

- **Phase:** P1. **Tier:** build (design review of feature weights by the supervisor). **Risk:**
  medium (changes routing answers on purpose; parity retirement).
- **Deliverable:** `src/kernel/score.ts` (new, < 300 lines): tokenizer (reuse `asciiDowncase`,
  boundary semantics of `boundedContains`), feature extraction per contract, BM25 over exemplars,
  score/confidence/margin, Tier 0 untouched. `src/registry/intents.ts`: parse v2 fields with v1
  fallback (`signals` -> weight-1 phrases), refuse malformed weights/thresholds, keep every existing
  refusal. `src/kernel/route.ts`: `routeByIntent` keeps its 11-field `matches` for every intent
  whose score clears `router.scoring.threshold` (registry order preserved), appends `ranked` and
  `margin`; `ambiguous` per contract; `routeEscalate` passes `ranked` through unchanged and keeps
  suppression, reasons, aggregation and key order. Fixture `test/fixtures/intents-v2/intents.json`
  (five-intent v2 sample for later unit tests). The six `policy.router.fixtures` must still resolve
  as recorded (C18e) — verify by reading, not by running.
- **Exclusive write paths:** `src/kernel/score.ts`, `src/kernel/route.ts`, `src/registry/intents.ts`,
  `test/fixtures/intents-v2/**`.
- **Blocked by:** T01. **Consumes:** contracts@rev1 (v2 schema, `ranked` shape, scoring block
  names — read `regs.policy.router.scoring`, whose loader fields T09 adds; code against the typed
  name and list it under Wiring requests).
- **Acceptance criteria:** same input -> same `ranked` (deterministic, no Date/random); a v1-only
  registry (the HEAD file) loads and routes every existing golden case to the same `intents` set
  as `boundedContains` did (behaviour-preserving when every weight is 1 and no negatives exist);
  misroute 1 ("create a mod ...") no longer ranks `llm` first; misroute 2 ranks `adr` above
  `new-feature` given the v2 data; `route-intent` key order for `matches[]` unchanged; scoring
  adds < 1 ms per prompt on the bench host (measured in T13).
- **Tests needed later:** `src/kernel/score.test.ts`, updates to `src/kernel/route.test.ts`,
  `src/kernel/resolve.test.ts` (v2 loader), parity arm removals per ADR.

## T04 — P1b Jev judge module (machinery only; never invoked)

- **Phase:** P1b. **Tier:** build; `security-reviewer` dispatched at integration (T09) — required
  by the spec and `rules/security.md` (data egress). **Risk:** high (third-party data egress);
  autonomy A2 for code in the tree, A3 for any live call (none here).
- **Deliverable:** `src/judge/types.ts` (contract types), `src/judge/questions.ts` (generate the
  question set deterministically from `registries/intents.json` + `decision-rules.json`: Choice
  `primary_intent` with `other` last and the inactive `backend-python` excluded, one noul per active
  intent, `fact.*` for the 9 prompt-revealable rules, `scale`, `design_work`, five `risk.*` scores,
  `is_project_change`; stable intent order), `src/judge/redact.ts` (patterns from
  `policy.judge.redaction.patterns`; replaces matches with `<redacted:kind>`; applied to the prompt
  before it enters `state`), `src/judge/breaker.ts` (file-backed consecutive-failure count in
  `<gitdir>/engineos-telemetry/<state_file>`, thresholds from `policy.breaker`; atomic write),
  `src/judge/jev.ts` (`judge()` per contract: enabled only when `env[ENGINEOS_JUDGE] === 'jev'`
  and the key env var is non-empty; plain `fetch` injected; `AbortController` deadline
  `timeout_ms`; no retry; 429/5xx/timeout/parse failure -> `failed` + breaker increment; response
  schema-validated into `JudgeFacts`; the request body never contains anything but
  `{model, state, questions}`; `state` holds only redacted `request.text`, `repository`, `session`).
  Regenerate `docs/specs/2026-10-10-jev-shadow-request.json` from `questions.ts` so the committed
  draft and the generator agree byte for byte (state text = misroute 2). Node 18 floor: global
  `fetch` exists on 18; guard its absence as `skipped: no-fetch`.
- **Exclusive write paths:** `src/judge/**`, `docs/specs/2026-10-10-jev-shadow-request.json`.
- **Blocked by:** T01. **Consumes:** contracts@rev1 (judge facts, policy.judge block names).
  **Produces:** `JudgeClient` surface consumed by T05.
- **Acceptance criteria:** with `ENGINEOS_JUDGE` unset the module returns `skipped: disabled`
  without touching the network or the breaker file; with the env set but the key missing ->
  `skipped: no-key`; a stub `fetch` that never resolves yields `failed: timeout` within 400 ms
  (+ scheduler slack) and increments the breaker; three consecutive failures open the breaker and
  the next call is `skipped: breaker-open` without calling `fetch`; every pattern in the redaction
  list is replaced before serialization (asserted on the serialized body); the generated question
  set equals the committed JSON; no `fetch` call anywhere in `src/judge` outside the injected seam.
  **No live call is made by this ticket.**
- **Tests needed later:** `src/judge/jev.test.ts`, `src/judge/redact.test.ts`,
  `src/judge/questions.test.ts`, `src/judge/breaker.test.ts` (all with stub transport).

## T05 — S0 prompt-source check and advisor judge wiring (shadow/advisory notes)

- **Phase:** S0 + P1b hook half + §6 guidance literals. **Tier:** build. **Risk:** medium
  (UserPromptSubmit is the hot prompt path; e2e strings are asserted).
- **Deliverable:** `src/hooks/prompt-source.ts` (new; markers from `policy.router.source_markers`,
  reads `env.raw` and `env.prompt`; pure function). `src/hooks/prompt-advisor.ts`: source check
  first (non-user -> write a `route` event with `skipped` and return silent — no kernel call, no
  judge); then judge call (await with deadline; the hook becomes async — `src/hooks/cli.ts`
  `HookRun` must allow `HookDecision | Promise<HookDecision>`, which is a wiring request to T09;
  `runHook` renders after `await`); pass `judge` facts into `resolve({prompt, taskContract: true,
  judge})`; write the `judge` event and one `model` span per attempted call; keep every existing
  event/span. `src/hooks/prompt-advisor-guidance.ts`: new trailing notes `[engineos] judge
  (<source>, <model>): ranked=<id:score,...> flags=<rule:p,...> risk_proposal=<tier>` marked as
  model judgments and only in `advisory`/`authoritative` modes; in `shadow` mode nothing is
  announced; replace the literals `fable`/`opus`/`A3` (`:43`, `:48`, `:58`, `:85`) with lookups
  from `models.json` tiers and `policy.autonomy.ceiling_by_risk` while keeping the rendered text
  byte-identical for today's registries. `src/registry/policy-telemetry.ts`: add `'judge'` to
  `TELEMETRY_EVENT_IDS` (T09 lands the policy.json row).
- **Exclusive write paths:** `src/hooks/prompt-source.ts`, `src/hooks/prompt-advisor.ts`,
  `src/hooks/prompt-advisor-guidance.ts`, `src/registry/policy-telemetry.ts`.
- **Blocked by:** T01. Integrates after T04 (import `src/judge/jev`) and T06 (judge fact in
  `resolve`); code against the frozen interfaces.
- **Acceptance criteria:** a background-task notification payload produces no kernel call, no
  judge call, one `route` event with `skipped: not-user-input`; a user prompt with
  `ENGINEOS_JUDGE` unset produces the exact same context text as today (string equality on the
  existing e2e cases) plus `route.judge.source = fallback`; prompt text never appears in any
  event or span field; the hook never blocks and never exceeds the 600 ms prompt-advisor budget
  when the judge times out at 400 ms; the C18f literal `resolve-task` remains in the file.
- **Tests needed later:** `src/hooks/prompt-source.test.ts`, additions to
  `src/hooks/prompt-advisor.test.ts` and `.e2e.test.ts`, `src/registry/policy-telemetry.test.ts`.

## T06 — Combination policy and judge-fact fold in the kernel

- **Phase:** P1c code half (thresholds remain placeholders until T13). **Tier:** design
  (`opus`). **Risk:** medium (task-contract composition; add-only safety invariant).
- **Deliverable:** `src/kernel/combine.ts` (new): pure function `combine({route, decisions, scale,
  judge, policy}) -> {intents, ranked, ambiguous, decisionMatches, riskProposal, judgeSummary,
  escalateReasons}` implementing spec §4a rules 1–5: Tier 0 hits never removed; judge may only ADD
  decision matches (`rules[id] >= rule threshold` -> synthesize a `DecisionMatch` from the registry
  row) and only RAISE risk (`max(floor, proposal)`); intents = union of regex/score survivors and
  judge nouls above per-intent `threshold`, else `primary` when its confidence clears
  `thresholds.primary_confidence`, else ambiguous; low confidence or small margin -> escalation
  reason `low-confidence` (new id appended to `policy.router.reasons` by T09; emission order
  preserved). `src/kernel/resolve.ts`: accept the `judge` fact (type from `src/judge/types.ts` or a
  kernel-local mirror to keep the kernel import-free of the judge module — choose the mirror; the
  kernel stays network-free), fold it in the task-contract block, emit `route.judge`,
  `task_contract.judge`, `task_contract.risk_proposal`, and `judge` as an `Answer` key. `src/kernel/
  decisions.ts`: export a helper to synthesize a match from a rule id. `src/kernel/index.ts`: export
  the new types. Replayability: a journaled `judge` fact + prompt reproduce the answer offline.
- **Exclusive write paths:** `src/kernel/combine.ts`, `src/kernel/resolve.ts`,
  `src/kernel/decisions.ts`, `src/kernel/index.ts`, `src/kernel/judge-facts.ts` (kernel-side type
  + validator for the fact).
- **Blocked by:** T01. Integrates after T03 (`ranked` on the route section).
- **Acceptance criteria:** with no `judge` fact every existing `resolve-task` answer is
  byte-identical to T03's output plus the trailing additive keys; a judge fact that lowers every
  risk input never lowers `risk_floor` or removes a gate; a judge fact above a rule threshold adds
  exactly that rule's `require`/`gate`; a `primary` with confidence below threshold and no noul
  above threshold yields `ambiguous: true` and the `low-confidence` reason; key order of
  `TaskContractSection` is unchanged for the first 20 keys.
- **Tests needed later:** `src/kernel/combine.test.ts`, additions to `src/kernel/resolve.test.ts`,
  `src/kernel/kernel-route-escalate.e2e.test.ts`.

## T07 — P2 escalation payload and feedback loop

- **Phase:** P2. **Tier:** build. **Risk:** low.
- **Deliverable:** `agents/router.md`: step 2 reads `.route.ranked` and `.route.judge`; a
  candidate table (id, score, confidence, features) is quoted in the plan; `intent_overrides`
  must cite the candidate it overrides. `commands/route.md`: same fields in the one-line summary.
  Correction capture: the supervisor's `[router]` line gains an optional
  `corrected_from=<id,...>` token (CLAUDE.md delta returned to T09); `src/report/usage.ts` mines
  it (`ROUTER_INTENT` regex at `:66` gains a sibling) and prints a "Misroutes" section
  (kernel intent -> corrected intent, counts). `skills/retro/SKILL.md`: step 1 reads that section
  and `.git/engineos-telemetry` `route`/`judge` events; step 4 proposes `phrases`/`negative`/
  `exemplars` deltas for `intents.json` with the three-occurrence rule. No automatic registry
  writes (retro proposes, a human merges).
- **Exclusive write paths:** `agents/router.md`, `commands/route.md`, `skills/retro/SKILL.md`,
  `src/report/usage.ts`.
- **Blocked by:** T01. Independent of T03–T06 at the file level.
- **Acceptance criteria:** C18b/C18c stay green (router still declares one `resolve` call with
  `escalate: true` and holds no Edit/Write/Task); `usage-report` output for a transcript with two
  `corrected_from` lines lists both pairs; retro's proposal template names the exact v2 field it
  would change; `commands/agents/router.md` (generated) is untouched.
- **Tests needed later:** `src/report/usage.test.ts` additions.

## T08 — P3 speed: S1–S4 and a second hot-path bundle

- **Phase:** P3 (S1 matcher/early-exit, S2 compile cache, S3 bundle split, S4 merged edit state).
  **Tier:** build. **Risk:** low (no behaviour change; measured).
- **Deliverable:** S1: ask the `claude-code-guide` agent (read-only) whether Claude Code supports a
  command-content filter on `PreToolUse` hooks; record the answer in the envelope; regardless, add
  the in-process fast path to `src/hooks/git-write-guard.ts` (`GIT_MENTION` test before tokenizing;
  unchanged `ask` semantics on parse failure). S2: `scripts/build.mjs` injects a guarded banner
  (`try { require('node:module').enableCompileCache?.() } catch {}`) ahead of the node-guard code;
  silent on Node 18–21. S3: `scripts/build.mjs` builds two entries — `src/cli.ts` ->
  `dist/engineos.cjs` (unchanged surface) and `src/hot-cli.ts` (new, per-call hooks only:
  git-write-guard, route-before-change, mark-unrecorded, announce-*) -> `dist/engineos-hot.cjs`;
  `hooks.json` command changes for those five hooks and a CI drift line are Wiring requests to T09;
  `src/node-guard.ts` SILENT_HOOKS unchanged. S4: `src/hooks/route-before-change.ts` and
  `src/hooks/mark-unrecorded.ts` share one `gitInfo`/self-dirs read via a new
  `src/hooks/edit-context.ts` (one `git rev-parse`, cached `self_dirs` from the route cache key).
  Bench: `src/bench/scenarios.ts` gains `bash-noop` (git-write-guard on `ls`) and the hot bundle
  parse scenario; `src/bench/run.ts` gains a `bundle size` budget line for `dist/engineos-hot.cjs`.
- **Exclusive write paths:** `scripts/build.mjs`, `src/hot-cli.ts`, `src/hooks/git-write-guard.ts`,
  `src/hooks/route-before-change.ts`, `src/hooks/mark-unrecorded.ts`, `src/hooks/edit-context.ts`,
  `src/bench/**` (excluding tests).
- **Blocked by:** none. **Produces:** hooks.json/ci.yml deltas for T09.
- **Acceptance criteria (measured in T13):** `bench baseline` p50 for `direct-edit-warm`,
  `agent-dispatch`, `agent-return` and `bash-noop` drops measurably against
  `docs/perf/baselines/darwin-8x-f952b211276f.json` with no budget regression; `git-write-guard`
  answers are byte-identical on the full `git-write-guard.test.ts` corpus; both bundles pass the
  dist drift guard; `dist/engineos.cjs` keeps every subcommand.
- **Tests needed later:** `src/hooks/edit-context.test.ts`, `src/bench/scenarios.test.ts` additions,
  `src/hooks/route-before-change.test.ts` cache-sharing cases.

## T09 — Shared wiring and registry landing (single owner)

- **Phase:** cross-cutting integration of P0–P4. **Tier:** design (`opus`). **Risk:** medium
  (every registry and the constitution table).
- **Deliverable:** `registries/intents.json` v2 (version `2.0.0`; `phrases` with weights,
  `verb_object`, `negative`, `exemplars` copied from T02's `exemplar: true` cases, `threshold`
  placeholders; `signals` retained for the window); `registries/policy.json` (`router.scoring`,
  `router.combination`, `router.source_markers`, `router.reasons` + `low-confidence`, `judge`
  block, `telemetry.events` judge row, the P4 tables returned by T10, version bump);
  `registries/decision-rules.json` (per-rule `judge_fact` name + `threshold` placeholder);
  `src/registry/policy.ts` loader fields for every new block (strict); `src/kernel/cli.ts`
  (`judge` key in `parseFacts`, `judgeFacts()`); `src/hooks/cli.ts` (`HookRun` may return a
  Promise; `runHook` awaits); `hooks/hooks.json` (hot-bundle commands from T08); `src/cli.ts`
  (gen arm registration); `src/gen/router-table.ts` + `src/gen/cli.ts` (`engineos gen
  router-table` rewrites the marked region in `CLAUDE.md` and `AGENTS.md` from intents.json);
  `CLAUDE.md`/`AGENTS.md` (markers + generated table + `corrected_from` token + check-count
  literal); new validator family `src/checks/router-v2.ts` (C38 intents v2 well-formed and
  thresholds in [0,1]; C38b exemplars >= 3 per active intent and present in the golden set; C38c
  judge/scoring/combination blocks + fixtures; C38d generated table region matches `gen
  router-table` output) registered in `src/checks/ids.ts` and `src/checks/index.ts`;
  `docs/COMPATIBILITY.md` "Unreleased" rows for every surface change (intents v2, envelope keys,
  `judge` fact, hooks.json hot bundle, event id, reason id, shim warnings, parity retirement);
  `.github/workflows/ci.yml` (second drift guard, router-table drift guard); `docs/CODEBASE_MAP.md`
  check count. Dispatch `security-reviewer` on `src/judge/**` + the policy `judge` block before
  marking integrated.
- **Exclusive write paths:** `registries/**`, `src/registry/policy.ts`, `src/kernel/cli.ts`,
  `src/hooks/cli.ts`, `src/cli.ts`, `src/gen/router-table.ts`, `src/gen/cli.ts`, `hooks/hooks.json`,
  `src/checks/ids.ts`, `src/checks/index.ts`, `src/checks/router-v2.ts`, `CLAUDE.md`, `AGENTS.md`,
  `docs/COMPATIBILITY.md`, `docs/CODEBASE_MAP.md`, `.github/workflows/**`.
- **Blocked by:** T01, T02, T03, T04, T05, T06, T07, T08, T10, T11 (consumes every Wiring request).
- **Acceptance criteria:** every registry loads through its strict loader; C16 row arithmetic holds
  (intent count = table rows + 1); C18e fixtures unchanged; `engineos gen router-table` is
  idempotent on the committed files; all 68 + new checks are listed by `validate --list` and the
  count literals agree (C37); no `signals` row was deleted; `hooks.json` still has exactly one
  UserPromptSubmit command containing `prompt-advisor` (C18f); security review returned OK or its
  findings are resolved before T13.
- **Tests needed later:** `src/checks/router-v2.test.ts`, `src/gen/router-table.test.ts`,
  `src/kernel/cli.test.ts` (judge fact parsing).

## T10 — P4 policy tables and transition tables (HEAD-scoped)

- **Phase:** P4. **Tier:** build. **Risk:** medium (must reproduce byte-identical kernel answers).
- **Deliverable:** `src/kernel/table.ts` (< 100 lines: `evaluateFirst(rows, facts)` and
  `evaluateCollect(rows, facts)` over boolean/enum predicates, typed row shapes),
  `src/kernel/transitions.ts` (< 60 lines: typed `{from, guard, to, allow, reason}` table runner).
  Rewrite `src/kernel/hitl.ts` `triggeredReasons` as a COLLECT table whose rows come from
  `policy.hitl.reason_table` (external-effect floor from the table, not a literal);
  `src/kernel/admit.ts` as a FIRST table (`policy.parallelism.backpressure.rows`) keeping the
  literal `hitl: budget-exhausted` in the reject reason (C26d); `src/kernel/repair.ts` ladder +
  situation prose from `policy.repair`; `src/kernel/breaker.ts` from `policy.breaker.transitions`;
  `src/hooks/classify-failure.ts` runner regexes from `policy.repair.infra_patterns`. Update
  `src/checks/runtime-governance-{hitl,backpressure,repair,breaker}.ts` to validate the new
  blocks as schema (row shapes, every reason id declared, every state reachable) while keeping the
  in-process canaries. Add the new blocks to `test/fixtures/legacy-kernel/registries/policy.json`
  (bash ignores them) so policy parity keeps staging byte-identical registries. Return the exact
  policy.json JSON for T09. **Conditional (only after the branch-base decision lands the
  uncommitted workflow work):** `src/kernel/execution.ts` as COLLECT, `src/scheduler/state.ts` as
  a transition table — otherwise report `out_of_scope`.
- **Exclusive write paths:** `src/kernel/table.ts`, `src/kernel/transitions.ts`, `src/kernel/hitl.ts`,
  `src/kernel/admit.ts`, `src/kernel/repair.ts`, `src/kernel/breaker.ts`,
  `src/hooks/classify-failure.ts`, `src/checks/runtime-governance-*.ts`,
  `test/fixtures/legacy-kernel/registries/policy.json`.
- **Blocked by:** none (T01's branch-base decision gates only the conditional part).
- **Acceptance criteria:** `src/kernel/parity.test.ts` policy arms (admit, breaker, hitl, repair)
  stay byte-identical including reason strings and error messages; C24–C26 and their canaries pass;
  `policy.hitl.reasons` order still drives emission order; no new literal reason text lives in
  code (prose moves to the registry); `rules/parallelism.md` and `rules/risk-autonomy.md` mirror
  rows still resolve (mirrors.ts).
- **Tests needed later:** `src/kernel/table.test.ts`, `src/kernel/transitions.test.ts`; existing
  admit/breaker/hitl/repair tests unchanged.

## T11 — P4b compatibility warn step and duplicate cleanup

- **Phase:** P4b. **Tier:** cheap (`haiku`) for the mechanical shim edit; build for the dedupe.
  **Risk:** low.
- **Deliverable:** per `docs/COMPATIBILITY.md` the shims are already deprecated (1.7.0); this
  ticket performs the **Warn** step only: every entry-point shim under `hooks/*.sh` (not
  `layout-manifest.sh`, `scaffold-layout.sh`; `bypass.sh` warns too) and every `scripts/*.sh` shim
  (`kernel.sh`, `exec-journal.sh`, `telemetry.sh`, `init-project.sh`, `validate-engineos.sh`,
  `gen-agent-*.sh`, `run-evals.sh`, `bench-runtime.sh`, `usage-report.sh`) prints the contract
  warning line to **stderr** before `exec` (stdout stays the JSON/text the consumer parses), with
  `ENGINEOS_QUIET_SHIMS=1` silencing it so the bench and e2e spawns stay clean. Dedupe
  `PYTHON_PACKAGE_MARKERS` (`src/hooks/verify-targets.ts:31`) by importing `PYTHON_MARKERS` from
  `src/kernel/stack.ts:50`. Removal of shims is 2.0/MAJOR and out of scope; say so in the
  envelope. **Conditional:** `src/kernel/skill-reference.ts` `IDS` derived from
  `registries/skill-references.json` only if the branch-base decision lands that file; else
  `out_of_scope`. Return the COMPATIBILITY.md row text ("warn since <next version>, removed in 2.0")
  and the release-notes line for T09/T13.
- **Exclusive write paths:** `hooks/*.sh` (excluding the two sourced libs), `scripts/*.sh`
  (excluding `build.mjs`, `package-release.sh`), `src/hooks/verify-targets.ts`.
- **Blocked by:** none.
- **Acceptance criteria:** every warned shim still `exec`s the same bundle subcommand with
  `ENGINEOS_ROOT` exported; C30 file modes unchanged; `bash scripts/validate-engineos.sh` stdout is
  byte-identical to `node dist/engineos.cjs validate`; the warning appears exactly once on stderr
  and not at all with `ENGINEOS_QUIET_SHIMS=1`; `verify-targets` behaviour unchanged.
- **Tests needed later:** shim cases inside the existing `*.e2e.test.ts` files that spawn `bash`.

## T12 — P5 optional tiers (opt-in, default off)

- **Phase:** P5. **Tier:** design (`opus`) for the adapter boundary. **Risk:** medium (early-access
  host API; new optional dependency kept out of the root bundle).
- **Deliverable:** (a) In-process Claude Code adapter: `adapters/claude-code-mod/` (per the
  `plugin-authoring` skill's layout) importing `src/kernel` + `src/hooks/*` run functions directly
  and registering the same seven events; enabled only by `ENGINEOS_INPROCESS=1`; shell hooks remain
  the contract for Codex/Cursor and stay registered in `hooks.json`; the adapter must not double-fire
  (it detects the env flag and the shell hooks exit silently when it is set — a wiring request to
  T09 for the shell side). (b) Warm embedding tie-break daemon: a separate workspace package
  `tools/embedding-daemon/` with its own `package.json` (transformers.js pinned, maintenance
  checked per `rules/base.md`), a local socket API `rank(text, exemplars) -> scores`, started
  only by `ENGINEOS_EMBED_DAEMON=1`; `src/kernel/combine.ts` already accepts an optional
  `tiebreak` fact (frozen in T01) — the daemon client lives in `src/judge/tiebreak.ts` and is
  consulted only when `ambiguous` and the daemon socket exists; root `package.json` gains no
  dependency. Documentation for both in `docs/ADOPTION.md` (new section) or a new
  `docs/OPT-IN-TIERS.md`.
- **Exclusive write paths:** `adapters/claude-code-mod/**`, `tools/embedding-daemon/**`,
  `src/judge/tiebreak.ts`, `docs/OPT-IN-TIERS.md`.
- **Blocked by:** T01, T06 (tiebreak fact slot). Integrates after T09.
- **Acceptance criteria:** with both env flags unset nothing in either tier executes and no file
  under the two new directories is loaded by `dist/engineos.cjs`; the root bundle byte count does
  not grow from these tiers; with the adapter on, the per-call hook spawn count on a Bash call is
  zero (measured in T13); the daemon client returns `skipped` within 50 ms when the socket is absent.
- **Tests needed later:** `src/judge/tiebreak.test.ts`, adapter smoke under an env-guarded e2e.

## T13 — Final integration: tests, build, approved checks, deferred runs

- **Phase:** closes P0 (baseline numbers), P1 (bench), P1b (shadow run), P1c (calibration), P3
  (speed evidence). **Tier:** build for tests; `critic` pass required (risk high per
  `rules/gates.md`). **Risk:** high (first live external call + spend; release-shaped evidence).
- **Deliverable:** author every test file listed under "Tests needed later" (T02–T12), remove or
  skip the three intent-parity arms per the ADR with a comment citing it, rebuild
  `dist/engineos.cjs` and `dist/engineos-hot.cjs`, then — only after explicit current-task
  approval under `rules/verification.md` and the recorded human decision for sending prompt text
  to TypeSafe (`## Human decisions`: external-effect, high-risk/rule-sensitive-data) — run: `npm run
  typecheck`, `npm test`, `node dist/engineos.cjs validate`, `node dist/engineos.cjs evals`,
  `node dist/engineos.cjs bench` and `bench baseline --write`, the shadow run of the golden set
  against the live service with `ENGINEOS_JUDGE=jev` (single pass, pinned model), threshold
  calibration from that run written into `registries/policy.json`/`intents.json` placeholders (a
  registry edit — coordinate with T09's ownership by having T09 integrated first), `evals/BASELINE.md`
  numbers, `docs/perf/baselines/<host>.json`. Record evidence (commands, revisions, output) in the
  change record `.engineos/changes/2026-10-10-routing-replacement-plan.md` and the release-notes
  draft `docs/release-notes/<next>.md`.
- **Exclusive write paths:** `src/**/*.test.ts`, `test/fixtures/**` (except what T03/T10 created),
  `dist/**`, `evals/BASELINE.md` (numbers only), `docs/perf/baselines/**`, `docs/release-notes/**`,
  `.engineos/changes/2026-10-10-routing-replacement-plan.md`, threshold values in
  `registries/policy.json` and `registries/intents.json` (after T09 is integrated).
- **Blocked by:** T09, T12 (and the security review + critic outputs).
- **Acceptance criteria:** every command above shows its real output at one immutable revision;
  golden-set precision/recall of the fallback classifier >= the recorded baseline; the three
  misroute cases pass on the fallback path; shadow results show per-intent precision/recall for Jev
  vs fallback (authoritative mode is NOT switched on here — spec §4a rollout step 3 needs a
  separate decision); bench shows no budget regression and the speed deltas from T08; validator
  green with the new checks; repair bound (2 attempts per check, 1 escalation) respected and any
  remaining red reported red.

---

## Frontier / waves (capacity = min(policy cap, host slots); policy cap 3 in the constitution)

| Wave | Ready units | Notes |
|---|---|---|
| 1 | T01 (fable), T08, T10 | T11 refills the first free slot (no deps). |
| 2 (after T01) | T03, T04, T06 first (core path), then T02, T05, T07 as slots free | T05 and T06 code against frozen interfaces; integrate T03 -> T06 -> T05 in that order. T12 may start once T06 returns. |
| 3 | T09 | Waits for every Wiring request (T02–T08, T10, T11). Security review on `src/judge/**` runs here. |
| 4 | T12 (if not already done) then T13 | T13 needs explicit final-stage approval and the recorded human decision before any live call. |

Blocked-by graph: T01 -> {T02, T03, T04, T05, T06, T07, T12}; T06 -> T12;
{T01..T08, T10, T11} -> T09; {T09, T12} -> T13. T08, T10, T11 have no prerequisites.

## Open ambiguities for the supervisor (answered in T01 or before dispatch)

1. **Branch base.** The spec's §6 inventory and the constitution loaded in this session come from
   the main checkout's uncommitted work (`src/kernel/execution.ts`, `src/scheduler/`, `src/workflow/`,
   `policy.workflow`, wave cap 3, workflow-gate/skill-reference arms). None of it exists at
   `0b2e442`. Decide: land that work on `feat/routing-replacement` first (then T10/T11
   conditionals activate and T09 must merge `policy.json` against the 1.8.0 shape), or keep this
   branch HEAD-only and defer those rows.
2. **`route.intents` shape.** Spec §4 asks to enrich `route.intents[]`; the pinned shape is
   `string[]`. T01 adopts a sibling `ranked` key; confirm.
3. **Live Jev run.** Even in T13 the shadow run is an external data transfer and spend; it needs the
   change record's open checklist items ("Developer approves sending prompt text", "Security review
   and recorded human decision") closed first. No earlier ticket may call the service.
4. **Shim warnings and bench noise.** Warnings go to stderr with an opt-out env; confirm the env
   name `ENGINEOS_QUIET_SHIMS` or prefer silence when `ENGINEOS_TELEMETRY=0` is set by the bench.
5. **Check-count literals.** New checks (C38*) change the "68-check" literals in CLAUDE.md,
   README.md, docs/CODEBASE_MAP.md (C37); T09 owns the edit — confirm README.md is in T09's scope.
