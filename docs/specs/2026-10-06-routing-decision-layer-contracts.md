# Routing decision layer — frozen contracts (wave 0)

*Companion to `2026-10-06-routing-decision-layer-design.md`. Implementation waves build
against these shapes and change none of them; a change comes back here first.*

## 1. Registries

### intents.json (additive, per row, all optional)

```json
{ "id": "backend",
  "stack": "node",                   // "node" | "python"; absent = stack-neutral
  "stack_sibling": "backend-python", // must name an existing intent with the other stack; reciprocal
  "generic_signals": ["API", "service", "controller", "migration", "queue", "router", "endpoint"] }
{ "id": "backend-python", "stack": "python", "stack_sibling": "backend", "generic_signals": [] }
{ "id": "new-feature", "generic_signals": ["add", "build", "create", "implement"] }
{ "id": "bug", "generic_signals": ["fix"] }
```

Loader rules (`src/registry/intents.ts`, strict): `stack` ∈ {node, python}; `stack`
and `stack_sibling` come together or not at all; the sibling exists, has the other
stack, and names this row back; every `generic_signals` entry is also in `signals`.
Validator check (new, `src/checks/`): the same four rules, plus "every stack-bearing
intent has a routing domain whose `sample_path` routes to it" (reuses C17).

### policy.json (new block, additive)

```json
"router_decision": {
  "note": "Decision layer over the keyword floor. `default` is WRITTEN by scripts/router-golden.sh run, never by hand; null = shadow (apply best available, log keyword alongside).",
  "modes": ["keyword", "llm", "jev"],
  "restrictiveness": ["keyword", "llm", "jev", "auto"],
  "default": null,
  "default_written_by": null,
  "min_confidence": 0.6,
  "tie_margin": 0.15,
  "jev": { "endpoint": "https://api.typesafe.ai/v1/systemone", "model": "jev-latest", "budget_ms": 1000, "key_env": "TYPESAFE_API_KEY" },
  "state_fields": ["prompt", "languages", "frameworks", "files_named"]
}
```

`default_written_by`: `{ "date", "golden_set", "scores": { "<mode>": { "intent_accuracy", "stack_correctness", "p95_ms", "fallback_rate" } } }` or null. The existing
`policy.router` block (escalation to the router agent) is untouched; the two are
siblings on purpose: `router` = when a model must plan, `router_decision` = which
layer decides the intents.

### .engineos/config.json (additive, optional)

```json
"router": { "mode": "keyword" }   // "keyword" | "llm" | "jev" | "auto"
```

`init --stack …` writes `"router": { "mode": "auto" }` unless `--router <mode>` is given.
`src/registry/project-config.ts` validates the enum; absent = no repo cap.

## 2. Kernel

```ts
// src/kernel/route.ts — floor (wave 1)
export interface Rebound { from: string; to: string | null; reason: 'stack-absent' | 'stack-absent-no-sibling' }
export interface IntentRouteSection {      // existing, + two additive fields
  matches: IntentMatch[]; ambiguous: boolean;
  rebound: Rebound[];                      // [] when no stack info or mixed repo
  generic_only: boolean;                   // every surviving match hit only generic_signals
}
export function routeByIntent(text, regs, languages?: readonly Language[]): IntentRouteSection;
export function routeEscalate(text, regs, languages?: readonly Language[]): EscalateRouteSection; // forwards; section gains rebound + generic_only

// Rebind rule, applied to the RAW matches before suppression:
//   stack-bearing intent, its stack ∉ languages, sibling's stack ∈ languages → replace by sibling (dedupe if sibling already matched)
//   stack-bearing intent, its stack ∉ languages, sibling's stack ∉ languages → drop
//   languages empty (no manifest) or both stacks present → unchanged
```

```ts
// src/kernel/decision-layer.ts (wave 2)
export type RouterMode = 'keyword' | 'llm' | 'jev';
export type RouterSetting = RouterMode | 'auto';
export interface DecisionInput {
  prompt: string; languages: Language[]; frameworks: string[]; filesNamed: string[];
  candidates: IntentMatch[];              // floor result after rebind + suppression
  offered: IntentRow[];                   // every intent whose stack is absent-or-neutral, i.e. what the layer MAY choose
  genericOnly: boolean;
}
export interface Decision {
  mode: RouterMode;                       // the mode that actually decided
  requested: RouterSetting;               // after the restrictiveness merge
  intents: string[];                      // chosen primary + kept specific extras
  confidence: number | null;              // null for keyword
  escalate: boolean;                      // low confidence / tie / llm residue → router agent
  fallback_reason: string | null;         // "no-key" | "timeout" | "http-429" | "http-529" | "bad-answer" | "repo-cap" | null
  shadow: { keyword_intents: string[]; disagreement: boolean } | null;  // non-null iff policy default is null
  latency_ms: number;
}
export function effectiveSetting(personal: string | undefined, repo: string | undefined, policyDefault: RouterMode | null): RouterSetting;
//   most restrictive of (personal ?? policyDefault ?? 'auto', repo ?? 'auto') on the restrictiveness order
export function decide(input: DecisionInput, setting: RouterSetting, regs: Registries, deps?: DecisionDeps): Decision;
export interface DecisionDeps { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; now?: () => number; hasClaudeCli?: () => boolean }
```

Mode semantics:
- `keyword`: `intents = candidates`, `confidence = null`, `escalate` = the existing
  policy.router rules only.
- `llm`: no network. `escalate = genericOnly || candidates.length === 0 || existing rules`;
  `intents = candidates`. (The in-session router agent is the decider; its brief gets
  `offered`, `languages`, `genericOnly`.)
- `jev`: one `fetch` to `policy.router_decision.jev.endpoint`, body
  `{ model, state: { prompt, languages, frameworks, files_named }, questions: { intent: { type: "choice", instructions: <fixed text>, criteria: { <id>: "<title>. <note>" ..., "__none__": "none of these" } }, needs_router: { type: "noul", instructions: <fixed text> } } }`,
  `criteria` keys = `offered` ids only. Answer validated: `choice` ∈ offered ∪ {__none__},
  `confidence` ∈ [0,1]. `intents = [choice] ∪ specific extras from candidates`;
  `escalate = confidence < min_confidence || top2 gap < tie_margin || needs_router ≥ 0.5 || existing rules`.
  Any failure → `mode: 'llm'` (the llm verdict over the same candidates), `fallback_reason` set
  (amended 2026-10-13, below; was `'keyword'`).
- `auto` resolves to `jev` when `env[key_env]` is set, else `llm` (amended 2026-10-13;
  the CLI probe is gone); the resolved mode is reported in `requested` as `auto`
  and in `mode` as what ran.
- Shadow (policy `default === null`): the keyword result is always computed; when
  `mode !== 'keyword'`, `shadow.disagreement = intents differ from keyword_intents`.

```ts
// src/kernel/resolve.ts — task contract gains one additive section
answer.router = Decision;   // emitted only for resolve-task (taskContract: true)
```

### §2 amendment (2026-10-07, wave-1 barrier) — framework-first, package-first

Found at the barrier: a language-only rebind left every FastAPI-plus-React
repository (portal_dds, nexxus, ppp, lana, the opensearch demo) on the NestJS
row, because the React frontend made the repository "mixed". Replaced by:

- `intents.json` rows gain `stack_frameworks` (`backend`: `["nestjs"]`;
  `backend-python`: `["fastapi","django","flask"]`). Each entry must be a known
  framework of the row's own stack; absent = count by language.
- The router takes `StackInput = readonly Language[] | { packages: PackageStack[]; focus: PackageStack | null }`.
  A bare language list becomes framework-less packages with no focus.
- `KernelContext.project` is the repo root of the caller's cwd (NOT `root`,
  which is the EngineOS checkout); `KernelContext.projectCwd` is the cwd, and
  `focus` is the deepest package containing it.
- Rebind order, first place that holds either row decides: frameworks in the
  focus package → frameworks in the repo → language in the focus package →
  language in the repo. The row itself holding keeps the keyword result; only
  the sibling holding swaps; nothing holding anywhere keeps the keyword result
  (no more drop).
- `Rebound = { from, to, reason: 'framework' | 'language', scope: 'package' | 'repo' }`.
- Eval `stack` entries may be `<language>:<framework>`; one package directory per entry.

## 3. Prompt-advisor and journal

- Contract line (prompt-advisor-guidance.ts) gains ` router=<mode>` and, when
  `confidence !== null`, `/<confidence to 2 decimals>`.
- New line when `fallback_reason !== null`:
  `[engineos] router: <mode> (<requested> unavailable: <fallback_reason>)` — `<mode>` is the
  mode that took over (amended 2026-10-13: `llm`; `keyword` only under an explicit keyword setting).
- New line when `escalate` and the existing route did not already escalate:
  `[engineos] router: <mode> could not decide (<reason>) — dispatch the router agent … (same wording as the existing escalation note)`.
- Router span (`withSpan` in prompt-advisor.ts) fields, all EXISTING journal fields:
  `provider = <mode>`, `model = policy jev model | "keyword" | "router-agent"`,
  `cost_micros` (from Jev `usage.cost` when present), `cache_hit`,
  `note = "req=<requested> conf=<c> esc=<0|1> fb=<reason|-> kw=<keyword intents csv> dis=<0|1>"` (≤ 256 chars, slug-safe inside note is not required).
  No journal schema change in this change.
- Cache (`src/hooks/cache.ts`): `languages` per root for the session; `Decision`
  per `sha256(prompt)+languages+mode` for the session (Jev calls are not repeated for
  an identical prompt).

### §2/§3 amendment (2026-10-07, before wave 2) — async decision layer

Fact: every hook handler is synchronous (`run(env, ctx): HookDecision`; no
`await` anywhere in src/hooks/cli.ts or src/dispatch.ts), and a Jev call is an
async `fetch`. So:

- `resolve()` stays synchronous and deterministic (CLI arms, validator, evals
  depend on that). It does NOT call the decision layer and emits no `router`
  section.
- `decide(input, setting, policy, deps): Promise<Decision>` lives in
  `src/kernel/decision-layer.ts`, pure apart from the injected `fetch`/`env`/`now`/`hasClaudeCli`.
  It also exports `buildDecisionInput(task, stack, prompt, regs)` that derives
  `DecisionInput` from a resolve-task answer, and `effectiveSetting(...)`.
- The prompt-advisor calls `resolve` (sync, now with `project` = repo root of
  `env.cwd` and `projectCwd` = `env.cwd`), then `await decide(...)`, then renders.
  The hook dispatcher (`src/hooks/cli.ts`, `src/dispatch.ts`, `src/cli.ts`)
  accepts `HookDecision | Promise<HookDecision>` and awaits; every existing
  handler is unchanged.
- Hard deadline inside the hook: `policy.router_decision.jev.budget_ms` via
  `AbortController`; on abort → keyword with `fallback_reason: "timeout"`.
- Jev answers are cached per session in `src/hooks/cache.ts` keyed by
  `sha256(prompt) + languages + mode`, so a resubmitted prompt costs no call.
- Wave split by dependency: 2a decision-layer (+tests) and 2c prose run in
  parallel; 2b advisor/dispatcher/cache/span runs after 2a lands.

### Wave 2a as built (2026-10-07) — supersedes the §2 decision-layer signatures

- `effectiveSetting(personal, repo, policyDefault, restrictiveness)`; `resolveAuto(setting, env, keyEnv, hasClaudeCli)`; `claudeCliOnPath(env)` (PATH probe, no process spawned);
  `decide(input, mode, requested, policy, deps): Promise<Decision>` — `auto` is resolved before `decide`.
- `Decision` field order: `mode, requested, intents, confidence, escalate, fallback_reason, shadow, latency_ms, cost_micros`; `cost_micros = round(usage.cost × 1e6)` or null.
- `DecisionDeps.schedule` injectable timer; the deadline also covers the body read.
- `no-cli` fires for explicit `llm` too. `repo-cap` is reported by the advisor (it compares personal vs effective), not by `decide`.
- **`offered` must be framework-aware (wave 2b):** an intent the floor would rebind away (route.ts two-level rule) is not offered to Jev; route.ts exports the eligibility helper the floor already uses.

### Amendment (2026-10-13) — keyword is never the implicit default

The developer's rule: the keyword floor decides alone only when a setting names it.
The installed hook had shown `router=keyword` under `auto` because the `claude` CLI is
not on the hook's PATH — a leftover of the rejected in-hook `claude -p` variant; the
chosen `llm` mode is the in-session router agent and needs nothing on the machine.

- `resolveAuto(setting, env, keyEnv)` → `jev` when `env[keyEnv]` is set, else `llm`. `claudeCliOnPath` and `DecisionDeps.hasClaudeCli` are removed; `'no-cli'` leaves `FallbackReason` (and the cache's accepted set).
- `llm` never falls back. Every `jev` failure (`no-key`, `timeout`, `http-N`, `bad-answer`, `network`) returns the **llm verdict** over the same candidates — `mode: 'llm'`, `fallback_reason` set, the llm escalation rule (`generic-only` / `no-match`) intact — so a lost key degrades to the router agent, never silently to the floor. `mode: 'keyword'` is produced only when the resolved mode is `keyword`.
- Advisor error path (the decision path threw): `mode` is `keyword` when the personal setting is `keyword`, else `llm` with the escalation read off the kernel's route (`generic_only` / no intents); the span records that mode. The personal setting is read before the policy loads so a thrown policy still reports it.
- Fallback line: `[engineos] router: <mode> (<requested> unavailable: <reason>)`, `<mode>` being the mode that took over.
- Golden set: `llm` cases never count as fallbacks; `jev` without a key is a fallback to `llm` (rate 1.0 as before).
- **Default is `jev` (2026-10-13, developer decision).** `default_written_by` admits two provenance shapes: a golden-set run (`date`, `golden_set`, `scores`) or a developer decision (`date`, `decided_by`, `reason`); a row mixing both is refused, and a default with no provenance stays refused. `decide` now always carries `shadow` (keyword intents + disagreement), so the golden set keeps collecting under a written default. `run --write-default` with no winner leaves a developer decision untouched and only retires a golden-set winner. Unset personal setting → `jev`; without a key → `llm` with the `jev unavailable: no-key` line on every prompt.
- `jev.budget_ms` 400 → 1000 (2026-10-13, after the first live run): five real calls measured 363–399 ms inside the layer, one at the budget; a 400 ms deadline would turn ordinary jitter into `timeout` fallbacks. The hook's total wall time was 500–650 ms per prompt, 120 ms on a cache hit.

## 4. Router agent brief (wave 2c)

`agents/router.md` gains an input section: `languages`, `frameworks`, `offered`
(ids with titles), `candidates`, `genericOnly`, `decision.mode`. Its output contract is
unchanged (dispatch plan). It may choose only among `offered`.

## 5. Golden set (wave 3/4 shapes, frozen now so shadow logging matches)

`evals/router-golden/cases.jsonl`, one line per case:
```json
{ "id": "rg-001", "source": "real" | "synthetic", "repo": "labv-assist", "stack": ["python"], "frameworks": ["fastapi"],
  "prompt": "add an endpoint that lists invoices", "expect_intents": ["backend-python"], "expect_escalate": false,
  "collected_at": "2026-10-20", "note": "" }
```
`scripts/router-golden.sh collect` reads the journal (router spans, `note` fields)
into candidate lines with `expect_intents: null`; the developer fills them.
`scripts/router-golden.sh run [--mode m]` runs every mode through `dist/engineos.cjs`
against `repo`'s checkout and writes `evals/router-golden/RESULTS.md` + the
`policy.json` `default`/`default_written_by` when the acceptance rule holds
(stack_correctness = 1.0 for the winner and intent_accuracy strictly highest; else
leaves `default` null and says why).

## 6. Wave 1 ownership (disjoint)

| Unit | Owns | Reads |
|---|---|---|
| 1a floor | `src/kernel/route.ts` (+test), `src/registry/intents.ts` (+test), `registries/intents.json` (fields on backend/backend-python/new-feature/bug), `src/kernel/resolve.ts` (languages once from `resolveStack(ctx.root)`, pass to route), new validator check in `src/checks/`, `CLAUDE.md`/`AGENTS.md` one router bullet | §1 intents, §2 route |
| 1b evals + config | `evals/intent-routing-cases.jsonl` (stack-tagged cases; schema gains optional `stack`), `src/evals/deterministic.ts` (+test) honouring `stack` by passing languages, `scripts/run-evals.sh` if needed, `src/registry/project-config.ts` (+test) `router.mode`, `src/init/project.ts` (+test) `--router`, `registries/policy.json` `router_decision` block + `src/registry/policy.ts` (+test) loader | §1 policy/config, §5 |

Wave 2: (a) `decision-layer.ts` + tests with fake fetch · (b) prompt-advisor rendering + span + cache · (c) `agents/router.md` brief + `rules/` prose + docs. Wave 3: shadow collect script + docs + change record.
