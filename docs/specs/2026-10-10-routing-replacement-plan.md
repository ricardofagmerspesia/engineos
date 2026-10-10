# Routing replacement and decision-framework plan

- **Status:** proposed (plan only, nothing implemented). Revised 2026-10-10 to add
  TypeSafe Jev as the semantic judge.
- **Date:** 2026-10-10
- **Owner:** Ricardo Fagmer
- **Risk:** medium. The kernel answer envelope, `registries/intents.json`, the hook
  contracts and the byte-parity fixtures are versioned public surface
  (`docs/COMPATIBILITY.md`).
- **Decision record:** an ADR is written once a direction below is approved.

## 1. Recommendation in one paragraph

Keep the kernel in TypeScript and keep it deterministic where safety depends on it.
Replace the any-phrase-matches intent router with a three-tier router. Hard gates
come first: path globs plus security, destructive and secret rules, unchanged in
meaning. Next comes a semantic judge: **TypeSafe Jev**, a System One model that
answers typed Choice, Score and yes/no questions with calibrated probabilities in
70 to 500 ms. It runs once per user prompt, never on Bash or Edit hooks. Jev
produces *facts* that the deterministic kernel consumes, so the kernel stays
replayable from the journal. A pure-TypeScript scored classifier runs alongside as
the offline and timeout fallback. Jev may raise risk or add gates, but never lower
a deterministic floor. Low-confidence prompts escalate to the existing `router`
agent with the ranked candidates attached. Jev is opt-in, because prompts leave the
machine, and it starts in shadow mode. Make
it faster by cutting the per-event process cost, not by changing language: split
the bundle per hook, enable the V8 compile cache and filter hook matchers. An
in-process Claude Code adapter can follow later, behind a flag. Do not port to
Julia. Treat decision-table engines such as GoRules Zen as a later option, for the
policy tables only, if a non-developer authoring surface becomes a real need.

## 2. Current state (evidence)

| Area | How it decides today | Source |
|---|---|---|
| Prompt intent routing | Literal phrase list per intent. Any phrase found with word boundaries fires the intent. 32 intents, multi-match, no weights, no negation, no confidence | `src/kernel/route.ts` `routeByIntent`, `boundedContains`; `registries/intents.json` |
| Fallback suppression | A generic intent is dropped when a more specific one matches (`suppressible`, `suppressed_by`) | `src/kernel/route.ts`, intents.json |
| Scale and design flags | Five regexes (action, scale, spec, design strong/weak) | `src/kernel/scale.ts`; `policy.json` `parallelism.prompt_signals` |
| Decision rules | 14 regex rules with priority, `require`/`prefer` artifacts and gates | `src/kernel/decisions.ts`; `registries/decision-rules.json` |
| Path routing | First glob match in a fixed precedence chain | `route-path`; `registries/routing.json` |
| Escalation to a model | `router` agent when the kernel answer is ambiguous, multi-agent or unrouted-scale | `policy.json` `router.escalate_when` |
| Hook runtime | Every hook event spawns `node dist/engineos.cjs` (470 KB bundle). Each Bash call spawns one process, each Edit/Write two, each Agent call two | `hooks/hooks.json` |
| Measured cost | 93 to 138 ms p50 per hook scenario, of which Node spawn alone is 60 to 95 ms. Table below | `docs/perf/baselines/darwin-8x-f952b211276f.json` (M2, Node 22, v1.7.0); `src/bench/run.ts:33`, `:128` |

**Recorded hook latency** (p50 / p95, ms):

| Scenario | p50 | p95 |
|---|---|---|
| prompt-routing | 109 | 177 |
| direct-edit-cold | 93 | 198 |
| direct-edit-warm | 138 | 259 |
| agent-dispatch | 128 | 228 |
| agent-return | 130 | 214 |
| final-gate | 98 | 289 |

Budgets in `src/bench/run.ts:204-208` are 250 ms for route-intent, 500 ms for
resolve-task and 600 ms for prompt-advisor end to end.

**Observed misroutes in one session (2026-10-10).** All three came from single
words or from classifying text the user did not type.

| Prompt | Kernel answer | Correct |
|---|---|---|
| "for each agent and sub-agent when they're called create a mod with a icon" | `llm` (word "agent"), Mastra rules and skills | Claude Code tooling, no LLM-app rules |
| "create a plan to replace our routing ..." | `new-feature` (word "create") | Architecture decision and plan (`adr`) |
| A subagent's audit report, delivered as a background notification | Seven intents, high risk floor, demand to dispatch the `router` agent | No routing. The text was a tool result, not a user prompt |

### Root causes

1. **Any-match on single words.** "agent", "create", "service", "prompt", "UI" and
   "review" are common English words. They fire on topic mentions, not on intent.
2. **No notion of the object of the verb.** "create a plan" and "create an endpoint"
   score the same.
3. **No confidence.** The answer is a set with no ranking, so the supervisor can't
   tell a strong match from an accidental one. `ambiguous` is true only when
   nothing matched.
4. **No learning loop.** Route events are journaled, but nothing turns supervisor
   corrections into registry changes.
5. **Prose and data drift guard.** The CLAUDE.md router table mirrors intents.json,
   and much of the 68-check validator exists to keep them in sync.
6. **Spawn-bound latency.** The decision logic itself takes microseconds. Node spawn
   alone is 60 to 95 ms of a 93 to 138 ms hook, paid on every Bash and Edit call.
7. **The advisor classifies non-user text.** The UserPromptSubmit hook ran the router
   on a background-task notification and demanded a seven-intent dispatch. The
   classifier needs to know the source of the text.

## 3. Options evaluated

"Jev" is TypeSafe's first System One model
([announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev)).
It is evaluated in its own row and designed in detail in section 4a. JEXL, GoRules
JDM and JVM rules engines remain in the table as the rule-engine alternatives.

| Option | What it would replace | Speed | Intelligence | Fit with EngineOS | Verdict |
|---|---|---|---|---|---|
| **Julia port** | The kernel | Worse. A normal runtime takes seconds to start. `juliac --trim` binaries start fast, but trimming is still experimental and needs about 90 MB of runtime libraries | None by itself | Breaks the JS/TS-only ecosystem rule (`rules/base.md`) and the single committed bundle | Reject |
| **GoRules Zen (JDM)** | Policy tables: risk, HITL, admit, breaker, repair, decision rules | Fast evaluation, but a native Rust addon per platform plus load cost on every spawn | None. Tables are deterministic like today | Breaks the single committed bundle and adds platform binaries. Its strength is a visual editor for non-developers | Defer. Revisit only for a business-user authoring need |
| **JEXL / CEL** | Regex signals in decision rules | Neutral | Small. Typed expressions over facts instead of regexes | Pure JS ports exist, but adds a dependency for what regex plus facts already do | Optional, low value |
| **json-rules-engine** | Policy tables | Neutral | None | Pure JS, but EngineOS tables are simpler than its model | Reject. Our own evaluator is under 100 lines |
| **OPA / Rego** | Policy tables | Wasm load per spawn | None | Heavy toolchain, a new language for contributors | Reject |
| **Drools / JVM** | Everything | JVM startup per spawn | None | Wrong runtime | Reject |
| **XState (state machine)** | Workflow and gate transitions | Neutral | Clearer, checkable transitions | Pure TS, good fit if workflow logic is ad hoc | Candidate. See section 6 |
| **TypeSafe Jev (System One model)** | Intent any-match, regex decision rules, scale and design signals, router-agent escalations | 70 to 500 ms per request, one HTTPS call per user prompt. Many questions in one call run in parallel | Highest of the fast options. Typed Choice, Score and yes/no answers with probabilities and confidence. TypeSafe's skill-selection cookbook cut wrong skill loads from 16.8% to 7.3% | Plain `fetch`, no SDK needed, so the Node 18 floor and the single bundle stay. Prompts go to a third party. API is early access | **Adopt as the semantic judge**, opt-in, shadow mode first. Section 4a |
| **Scored lexical classifier (BM25 plus weighted features)** | Intent any-match | Under 1 ms, no dependency | Medium. Ranked intents, confidence, verb-object awareness, negative signals | Pure TS, data stays in registries, deterministic and testable | **Adopt as the fallback** when Jev is off, offline or slow |
| **Local embedding model (transformers.js, MiniLM-class)** | Intent tie-breaks | Model load on every spawn is far over budget. Viable only in a warm daemon | High for paraphrases | Adds about 25 MB of model plus an ONNX runtime | Optional tier, daemon only, opt-in |
| **LLM classification per prompt (Haiku hook)** | Intent routing | Seconds per prompt | High | Generates text that must be parsed. Jev answers the same questions typed and calibrated at a fraction of the latency | Reject. Keep the `router` agent for low-confidence cases |
| **In-process Claude Code function hooks ("mods")** | Process-per-event hooks | No spawn at all | None by itself | Early-access API that may change without notice. Other hosts still need shell hooks | Later phase, behind a flag |

## 4. Target architecture: three-tier router

```
prompt / path / facts
      |
      v
Tier 0  Hard gates (deterministic, auditable, unchanged meaning)
        path globs, security files, destructive DDL, secret exposure,
        production write, HITL floors  -> always win, never overridden by scores
      |
      v
Tier 1  Scored classifier (pure TS, <1 ms)
        features: weighted phrases, verb+object pairs, negative phrases,
        file paths and extensions in the prompt, session state
        (active spec, open change record, last intent)
        + BM25 over per-intent exemplars (golden set + notes)
        -> ranked intents with score, confidence and margin
      |
      +-- confidence >= threshold and margin >= m  -> task contract (as today)
      |
      v
Tier 2  Escalation
        router agent receives the top-k candidates with scores and the
        features that fired; optional warm embedding daemon breaks ties
      |
      v
Feedback  journal route decision + supervisor correction
          -> retro mines misroutes -> proposes weight/exemplar deltas (PR)
```

### Registry changes (additive, versioned)

- Extend `intents.json` with `version: 2` fields per intent:
  - `phrases`: a list of `{ text, weight }`, replacing flat `signals`. A v1 flat list
    reads as weight 1.
  - `verb_object`: `{ verbs: [...], objects: [...], weight }`, so "create" counts
    only next to "endpoint", "screen" and the like.
  - `negative`: phrases that subtract, for example `llm` minus "claude code mod"
    and "subagent".
  - `exemplars`: three to ten example prompts, which seed BM25 and double as eval cases.
- Add `policy.json` `router.scoring`: `threshold`, `margin`, `top_k`, `max_intents`.
- Keep v1 readable for one deprecation window, per `docs/COMPATIBILITY.md`.

### Answer envelope changes (additive)

- `route.intents[]` gains `score`, `confidence` and `features` (the phrases and
  pairs that fired). Existing keys and their order stay the same.
- `route.ambiguous` becomes true when confidence or margin falls below threshold,
  not only on zero matches.

### Why this beats the alternatives

- **It fixes the observed failure.** Single common words stop deciding alone.
- **It stays deterministic.** The same input gives the same answer, so tests and
  byte-parity style checks still work.
- **It keeps the hot path cheap.** The scoring adds microseconds to a process that
  costs 60 to 95 ms to start.
- **It improves from data.** Exemplars and weights live in registries and change by
  PR, mined by the existing `retro` skill.

## 4a. Jev as the semantic judge

### What Jev is, in the terms that matter here

| Property | Value | Source |
|---|---|---|
| Output | Typed answers only: Choice (one of up to 255 options), Score (2 to 10 ordered levels), Noul (probability of yes). Every Choice and Score has `probabilities` and `confidence` | API reference |
| Latency | 70 to 500 ms end to end; the skill-selection cookbook saw 0.09 to 0.31 s per call | Announcement; cookbook |
| Price | $0.042 per million input tokens; output not billed | Announcement |
| Endpoint | `POST https://api.typesafe.ai/v1/systemone`, bearer key, `state` plus a map of `questions` | API reference |
| Model ids | `jev-latest`; responses report the concrete version, for example `jev-1.13.0` | API reference |
| Data | No training on customer data. Zero data retention for enterprise customers only. Residency, SOC 2 and inference location are not documented | Legal page |
| Status | Early access | Announcement |

**Cost check.** One routing request carries the prompt plus about 32 intent
descriptions and about 20 yes/no questions, roughly 3,000 input tokens. That is
about $0.00013 per prompt, or about 13 cents per thousand prompts.

**Known weaknesses of jev-1.13 that shape the design:**
- **Literal reading.** It answers the question as written, so every question must be
  phrased exactly, without double negatives.
- **First-option bias.** It leans toward the first Choice option. Put the no-match
  option first only where a false "none" is cheap, and keep intent order stable so
  shadow comparisons are fair.
- **Irrelevant state hurts.** Send the prompt and minimal session facts, not the
  conversation or rule files.
- **Adversarial content.** State is not treated as hostile. A prompt can try to
  steer its own routing. This is why Jev can never lower a deterministic gate.
- **No arithmetic or dates.** Counting files or comparing dates stays in code.

### Where Jev sits

```
UserPromptSubmit (once per user prompt)
   |
   +--> source check (deterministic): skip notifications, tool results, hook echoes
   |
   +--> judge.ts  --HTTPS, 400 ms timeout-->  Jev: one request, ~50 questions
   |       |                                  in parallel
   |       +--> on timeout / error / opt-out: score.ts (deterministic fallback)
   |
   v
facts { intent_probs, intent_confidence, rule_flags, scale, risk_inputs, source: jev|fallback, model }
   |
   v
kernel resolve --facts   (deterministic, no network, replayable from the journal)
   |
   v
task contract + journal span (facts, model version, latency, tokens)
```

Path routing, the git write guard, mark-unrecorded and the Stop hooks never call
Jev. They are exact lookups or safety checks, and they run on every tool call.

### The question set (one request per prompt)

`state` is a small JSON object: the prompt text in a clearly named field, the
repository's declared stack, whether a spec or change record is active, and the
last routed intent. Each question carries its full meaning, because question ids
are not sent to the model.

| Question id | Type | Replaces | Use |
|---|---|---|---|
| `primary_intent` | Choice over the 31 active intents plus `other` last (the inactive `backend-python` entry is excluded) | Any-match winner | Ranking, confidence and margin |
| `intent.<id>` (one per intent) | Noul | Multi-match | Several intents can apply, which a single Choice can't express. Threshold per intent, calibrated on the golden set |
| `is_project_change` | Noul | `substantiveAction` regex | Pure questions skip routing, as CLAUDE.md requires |
| `fact.<name>` (one per decision-rule `when` fact that a prompt can reveal) | Noul | Regex signals of 10 of the 14 rules in `decision-rules.json` | Raises gates. The regex stays in force, and the final flag is regex OR Jev |
| `scale` | Score, 3 levels: single unit, several units in one domain, multi-domain or sweep | `prompt_signals` big_task regex | Feeds the parallelism decision |
| `design_work` | Noul | `design_strong`/`design_weak` regexes | Design-gate hint |
| `risk.reversibility`, `risk.blast_radius`, `risk.data_sensitivity`, `risk.contract_surface`, `risk.spend` | Score, 3 levels each matching the `rules/risk-autonomy.md` table | Nothing today: risk inputs are left to the model | Proposed risk tier. The kernel takes max(deterministic floor, Jev proposal) |

### Shadow request file

[`2026-10-10-jev-shadow-request.json`](2026-10-10-jev-shadow-request.json) is
the full POST body for `https://api.typesafe.ai/v1/systemone`, ready to review.
It holds only the three keys the API accepts (`model`, `state`, `questions`),
so it can be sent unchanged. The model is pinned to `jev-1.13.0`. It has 49
questions: 1 Choice, 42 Nouls and 6 Scores, about 4,800 tokens in total, or
about $0.0002 per prompt at $0.042 per million input tokens. That is well
inside the 32k limit for state plus the longest question.

The `state.request.text` in the file is misroute 2. In shadow mode the
`prompt-advisor` hook swaps in the live prompt text, after redaction, and fills
`repository` and `session` from `.engineos/config.json` and the session journal.

How the file was written, following the TypeSafe guidance:

- Each intent option names what the intent covers and, for intents that are easy
  to confuse, a `not_for` contrast. The confusable groups are llm, agent-system
  and Claude Code tooling; new-feature, adr and refactor; audit,
  system-comprehension and review; test-writing, qa-endpoints and eval-setup;
  mobile and the two release intents; verify-done and record-change; retro and
  task-observer.
- `other` comes last and explicitly covers configuring Claude Code itself
  (hooks, settings, mods, the status line). That is the gap behind misroute 1.
- The `adr` option covers "planning or evaluating an architectural change before
  building it", and `new-feature` excludes it. That is the gap behind misroute 2.
- Each Noul tests one condition, phrased so that yes means the condition holds.
- Score levels describe situations, never numbers.
- Every question points at state with the backticked path `request.text`.

Mapping from decision rules to `fact.*` questions:

| Decision rule | `when` fact | Question |
|---|---|---|
| `rule-spec-threshold` | `or_new_feature` | `intent.new-feature`; `files_changed` comes from `scale` |
| `rule-large-change` | `estimated_change_lines > 500` | `fact.large_change` (an approximation: Jev cannot count lines) |
| `rule-public-contract` | `affects_public_contract` | `fact.affects_public_contract` |
| `rule-sensitive-data` | `handles_sensitive_data` | `fact.handles_sensitive_data` |
| `rule-production-write` | `tool_effect` + `environment` | `fact.production_write` |
| `rule-destructive-ddl` | `destructive_ddl_or_dml` | `fact.destructive_ddl_or_dml` |
| `rule-secret-exposure` | `secret_reached_git_or_shared_file` | `fact.secret_reached_git_or_shared_file` |
| `rule-fanout` | `independent_units >= 3` | `scale` level 2 |
| `rule-volatile-knowledge` | `knowledge_changes_frequently` | `fact.knowledge_changes_frequently` |
| `rule-multi-agent-design` | `multi_agent_system` | `fact.multi_agent_system` (excludes Claude Code subagents) |
| `rule-rag-corpus-safety` | `retrieval_over_shared_corpus` | `fact.retrieval_over_shared_corpus` |
| `rule-verification`, `rule-change-record` | `code_changed` | none: known from the diff, not the prompt |
| `rule-high-risk-critic` | `risk = high` | none: derived from the `risk.*` Scores in code |

Shadow acceptance cases. P1b passes only if each holds on the live service.
They join the golden set in `evals/intent-routing-cases.jsonl` at the approved
final stage:

| Case | Prompt | Expected |
|---|---|---|
| Misroute 1 | "for each agente and sub-agent when they're called create a mod with a icon for all" | `primary_intent` is `other`; `intent.llm` below its threshold; `fact.multi_agent_system` below 0.5 |
| Misroute 2 | "create a plan to replace our routing and check the other files ..." | `primary_intent` is `adr`, ahead of `new-feature`; `design_work` above 0.5 |
| Misroute 3 | A background-task notification | No request sent: the S0 source check skips it before Jev. Logged as `skipped: not-user-input` |

The file is a draft for review. Nothing has been sent to TypeSafe: sending
prompt text is an external data transfer and a spend, and both wait for the
developer's decision and the `rule-sensitive-data` review below.

### Combination policy (kept in code, versioned in `policy.json`)

1. **Deterministic gates win.** A Tier 0 hit (path glob, shortcut risk floor,
   regex decision rule) can't be removed by Jev.
2. **Jev only adds safety.** A `rule.<id>` above its threshold adds that rule's
   gate. A higher Jev risk proposal raises the tier. A lower one is ignored.
3. **Intents.** Load every intent whose Noul is at or above its threshold. If none
   qualifies, use `primary_intent` when its confidence is at or above the threshold.
   Otherwise mark the answer ambiguous.
4. **Escalate on doubt.** Low `primary_intent` confidence, or a small margin between
   the top two, sends the ranked candidates to the `router` agent.
5. **Fallback is visible.** When Jev was off, slow or failed, the contract says
   `judge=fallback` and why, so nothing pretends the semantic layer ran.

Every threshold starts as a placeholder and is set from the golden set. The
cookbook values, such as 0.5 confidence and 0.30 fit, are examples, not defaults.

### Security and policy obligations

- **Data egress is the main risk.** User prompts can contain code, secrets or
  personal data. Jev is off by default and enabled per machine with
  `ENGINEOS_JUDGE=jev` plus `TYPESAFE_API_KEY` from the environment, never from a
  file in the repository (`rules/security.md`).
- **Redact before sending.** Run the existing secret patterns over the prompt and
  replace matches before the request. Send only the fields listed above.
- **Enterprise zero retention.** Get TypeSafe's ZDR and data-processing terms
  before any team-wide default-on. This classifies as `rule-sensitive-data`, which
  needs a security review and a recorded human decision.
- **Untrusted state.** Delimit the prompt as data, as `rules/llm-apps.md` requires.
  The combination policy above means injected text can at worst add gates or force
  an escalation. It can't remove one.
- **Reliability.** 400 ms timeout and no retry on the hot path; a 429 or 529 falls
  back immediately. A circuit breaker uses the existing `breaker` policy with the
  provider as the key.
- **Pinned model.** Pin a concrete version such as `jev-1.13.0`, not `jev-latest`.
  A version bump is a prompt-change event and needs fresh eval evidence.
- **Telemetry.** Journal model version, latency, tokens, `judge` source and the
  answers per span (`rules/observability.md`).
- **Policy deviation to record.** `rules/llm-apps.md` says LLM applications use
  Mastra inside NestJS. This is a typed classifier call inside a CLI hook, not an
  LLM application. The ADR should record that Mastra does not apply here, with the
  reason.

### Rollout

1. **Shadow.** Jev runs and is journaled, but the contract comes from the
   deterministic path. Compare both against the golden set and live corrections.
2. **Advisory.** Jev's ranked intents and flags appear in the advisor notes, marked
   as model judgments.
3. **Authoritative for intents.** Only after shadow precision and recall beat the
   fallback on the golden set. Gates and risk stay add-only permanently.

## 5. Speed plan

Order is by expected gain divided by risk. Each item is measured with the existing
five-budget bench before and after.

| Step | Change | Expected effect |
|---|---|---|
| S0 | Skip classification when the submitted text is a system or task notification, not user input. Detect it deterministically from its markers; a Jev `is_user_authored` Noul can back it up | Removes false escalations like the third misroute above, and avoids sending non-user text to Jev |
| S1 | Narrow hook matchers so `git-write-guard` runs only for git or gh commands. Use the host's hook `if` filter where the Claude Code version supports it, and check that support first | Removes one spawn from most Bash calls |
| S2 | Enable the V8 compile cache (`module.enableCompileCache()`, Node 22.1 and later, with a silent fallback on Node 18 to 20) | Cuts bundle parse time on warm runs |
| S3 | Split the bundle per hook family: per-call hooks (git guard, route-before-change, mark-unrecorded, announce) versus session hooks (SessionStart, Stop, prompt-advisor) | Smaller parse for the hottest hooks |
| S4 | Merge `route-before-change` and `mark-unrecorded` state into one cache read per edit | Fewer filesystem reads per edit |
| S5 | Optional in-process adapter: a Claude Code mod that imports the kernel directly. Off by default, shell hooks stay as the contract for Codex and Cursor | Removes the spawn entirely on Claude Code |

## 6. Other decision logic that could move to a framework

Read-only inventory, 2026-10-10. Hit policy FIRST means the first matching row
wins. COLLECT means every matching row contributes, which fits reason lists.

| File (lines) | Decision | Today | Best fit |
|---|---|---|---|
| `src/kernel/execution.ts` (83) | 10 facts to direct, delegate or parallel, plus reasons | 10 if statements, each adding a reason (`:26-36`) | **Decision table, COLLECT.** Strongest candidate: flat boolean predicates and a reason vocabulary |
| `src/kernel/hitl.ts` (217) | Risk, evidence, effect, situation to HITL reasons and autonomy | Collects reasons (`:150-170`); `EXTERNAL_EFFECT_FLOOR='A3'` hard-coded (`:44`); situation pairs are literals (`:161-166`) | **Decision table, COLLECT** for reasons. Keep the autonomy clamp as code |
| `src/kernel/breaker.ts` (105) | Circuit breaker state and allow | `TRANSITIONS` map in code, state names in the registry | **State machine.** States in data and edges in code is a split source of truth |
| `src/scheduler/state.ts` (108) | Unit state plus event to new state; launch admission | If-chain transitions (`:73-107`); never-retry guard duplicated at `:75` and `:98` | **State machine** (7 states, 7 events, guards) |
| `src/kernel/admit.ts` (78) | In-flight and queued to dispatch, defer or reject | 3 branches (`:47-70`) | **Decision table, FIRST** (3 rows) |
| `src/kernel/repair.ts` (94) | Check, situation, attempt to repair action | Never-repair check, `BY_RESPONSE` map (`:29-41`), attempt ladder (`:71-93`) | **Decision table** keyed by situation and attempt band |
| `src/workflow/gates.ts` (107) | Preview and validation facts to whether production or validation is allowed | Two large boolean expressions (`:61-71`) | **Named predicates in a table.** CEL or Rego only if gates multiply |
| `src/hooks/classify-failure.ts` (89) | Evidence to red or infrastructure, with reason | Switch plus per-runner regex table (`:51-55`) | **Decision table plus regex data.** Keep it auditable, not learned |
| `src/hooks/git-write-guard.ts` (472) | Bash command to whether it is a git or gh write | Tokenizer (`:118-300`) plus about 14 verb and flag sets | **Keep the tokenizer as code.** Move verb and flag sets to a registry |
| `src/hooks/prompt-advisor-guidance.ts` (129) | Answer to advisory notes | If statements; hard-codes `fable`, `opus` (`:43`, `:48`, `:85`) and `A3` (`:58`) | **Read models.json and `ceiling_by_risk`** instead of literals |
| `src/kernel/stack.ts`, `src/hooks/verify-targets.ts`, `src/hooks/mark-unrecorded.ts` | Framework detection, extension and marker lists | Constant lists; `PYTHON_MARKERS` defined twice (`stack.ts:49`, `verify-targets.ts:31`) | **Lookup tables in a registry** |
| `src/kernel/skill-reference.ts` (42) | Id to manifest entry | `IDS` literal duplicates `registries/skill-references.json` | **Derive from the manifest** |
| `risk.ts`, `model.ts`, `waves.ts`, `scheduler/validation.ts`, `stop-verify.ts` | Lookups, a graph algorithm, invariants, I/O orchestration | Already data-driven or not rules | **Keep as code** |

**Implication for the framework choice.** The tables are small: 3 to 10 rows, two
hit policies, boolean and enum inputs. One in-house evaluator under 100 lines
covers FIRST and COLLECT with JSON tables in `policy.json`. A rules engine's bundle
and load cost would be paid on every spawn for no added expressiveness. For the
two state machines, a 50-line typed transition-table helper gives most of XState's
value. Adopt XState itself only if a visualizer or model-based testing is wanted.
Moving tables to data also collapses checks C24 to C26, which today grep source
code to keep prose and code in sync. C26d greps `admit.ts` for a literal.

**Prose and code duplication to remove on the way:**
- Breaker transitions appear in `rules/parallelism.md`, `policy.breaker.note` and code.
- The literal `"hitl: budget-exhausted"` lives in `admit.ts:66`, `policy.json` and
  the HITL situation list.
- Repair reason text is in code while its keys are registry values.

**Dead weight.** The `hooks/*.sh` hook shims are bypassed, because `hooks/hooks.json`
calls the bundle directly. Three files are exceptions: `bypass.sh` is a user
command, and `scaffold-layout.sh` plus `layout-manifest.sh` are required by
`src/init/project.ts:52`. The `scripts/*.sh` wrappers are public CLI surface and
stay until a deprecation window retires them. `package-release.sh` holds real logic.

## 7. Phased roadmap

| Phase | Deliverable | Exit criteria | Risk |
|---|---|---|---|
| P0 Baseline | Golden set grows from 36 to at least 120 intent cases, including this session's two misroutes and paraphrases. Record current precision, recall and bench numbers | Baseline numbers written to `evals/BASELINE.md` after approved eval run | low |
| P1 Fallback classifier | `src/kernel/score.ts` and intents.json v2 fields, with v1 compatibility. Additive envelope fields | Precision and recall on the golden set at or above baseline, no Tier 0 regression, bench within budget | medium |
| P1b Jev judge, shadow | `src/judge/jev.ts` (plain `fetch`, 400 ms timeout, redaction, breaker), question set generated from intents.json and decision-rules.json, facts passed to `resolve --facts`, journal spans. Off by default | Security review recorded. Shadow results on the golden set. Prompt-advisor stays within its 600 ms budget at p95 with Jev on | high (third-party data egress) |
| P1c Jev advisory, then authoritative for intents | Thresholds calibrated per intent and per rule. Combination policy in `policy.json` | Jev beats the fallback on the golden set. Gates and risk stay add-only | medium |
| P2 Escalation and feedback | Router agent gets candidates and scores. Journal records supervisor corrections. `retro` gains a misroute miner | Misroutes become proposed registry deltas automatically | low |
| P3 Speed | S1 to S4 | Bench p50 for Bash and Edit hooks down measurably, with no budget regression | low |
| P4 Policy tables | In-house FIRST/COLLECT table evaluator for execution, HITL, admit and repair. Typed transition tables for breaker and scheduler. Literals in prompt-advisor-guidance read from registries | Same answers on all existing fixtures; C24 to C26 become schema checks | medium |
| P4b Cleanup | Deprecate the bypassed `hooks/*.sh` shims per `docs/COMPATIBILITY.md`. Dedupe `PYTHON_MARKERS` and skill-reference ids | Shims removed after the window; no caller breaks | low |
| P5 Optional tiers | Warm embedding daemon (opt-in) and in-process Claude Code adapter (flagged) | Each opt-in, default off, documented | medium |

## 8. Compatibility and retirements

- **Public surface.** intents.json v2, the envelope additions and any hook matcher
  changes follow `docs/COMPATIBILITY.md` with a deprecation window.
- **Byte-parity fixtures.** `test/fixtures/legacy-kernel/` pins answers from the
  retired bash kernel. The scored router changes answers on purpose. Retiring
  intent-routing parity is a decision of its own and needs recording in the ADR.
  Path routing and policy parity can stay.
- **Kernel purity.** The kernel keeps its "no model calls" property. Jev runs in a
  separate judge module before the kernel and hands it facts, so a journaled answer
  replays without the network.
- **CLAUDE.md router table.** Generate the table from intents.json, the way
  `commands/agents/` is generated from agent frontmatter. That removes a class of
  validator drift checks.

## 9. Open questions

1. Will the team obtain TypeSafe enterprise zero data retention before enabling Jev
   beyond individual opt-in?
2. Is a visual rule editor for non-developers a real need? That is the only case
   where GoRules Zen earns its native dependency.
3. What is the minimum Node version to support? Node 18 rules out the compile cache
   without a fallback.
4. Should the in-process adapter wait until the function-hooks API leaves early access?
5. Should Jev also pick skills per turn, as in TypeSafe's skill-selection cookbook,
   instead of the router table listing them? That would be a second phase after
   intent routing proves out.

## Sources

- TypeSafe Jev: [announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev),
  [API reference](https://docs.typesafe.ai/api.md),
  [intent-routing pattern](https://docs.typesafe.ai/patterns/intent-routing.md),
  [skill-suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion.md),
  [jev-1.13 known weaknesses](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md),
  [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md),
  [legal and data terms](https://docs.typesafe.ai/legal.md), accessed 2026-10-10.

- Julia trimmed binaries: [LWN, Julia 1.12 `--trim`](https://lwn.net/Articles/1044281/),
  [Julia 1.13 highlights](https://julialang.org/blog/2026/09/julia-1.13-highlights/),
  accessed 2026-10-10.
- GoRules Zen for Node.js: [docs.gorules.io Node reference](https://docs.gorules.io/reference/nodejs),
  [zen-go README](https://pkg.go.dev/github.com/gorules/zen-go/v2), accessed 2026-10-10.
- transformers.js: [huggingface transformers.js examples](https://www.sourcepulse.org/projects/1833922),
  accessed 2026-10-10.
