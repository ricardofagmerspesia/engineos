# Routing decision layer: keyword → Jev / LLM, with a deterministic switch — design

*Status: DRAFT for refinement · 2026-10-06 · Sergio Hermsdorff (owner), drafted with Claude*
*Companion: `2026-10-06-deterministic-enforcement-design.md`. Nothing here is implemented; open questions are marked `[?]`.*

## 1. Problem

Prompt routing is keyword-only. `routeByIntent` lowercases the prompt and matches
literal signal words from `registries/intents.json`; the repository's stack, which the
kernel can resolve (`kernel.sh resolve-stack`), is never consulted. Measured on
2026-10-06 against the built bundle, from inside `labv-assist` (FastAPI only):

| Prompt | Result |
|---|---|
| "add an endpoint that lists invoices" | `backend` → `rules/backend.md` + `nestjs-patterns` |
| "fix the service that validates the order" | same |
| "add a controller for refunds" | same |
| "write a migration adding a column to users" | same |
| "add a queue worker for emails" | same |

Only a prompt that literally names FastAPI, Pydantic, SQLAlchemy, Alembic, Django,
Flask, uvicorn or pyproject reaches `backend-python`. The prompt-advisor then injects
NestJS guidance into a Python session, and Claude invents Python equivalents of
class-validator, `ValidationPipe` and BullMQ. The edit-time hook routes correctly by
file path, but it fires after the frame was set.

Paraphrases the keywords cannot see ("expose a list of invoices over HTTP") route
nowhere at all and fall to `new-feature`.

## 2. Decisions taken so far (developer, 2026-10-06)

| # | Decision | Choice |
|---|---|---|
| R1 | Decision layer | Jev (TypeSafe System One) **and** an LLM router, selectable |
| R2 | Switch | Deterministic: a setting, never a model's choice; a mode that sends nothing to TypeSafe must exist |
| R3 | Keyword matcher | Stays as the floor and the offline fallback; never removed |
| R4 | Stack | Always resolved first and used as a hard constraint on what the decision layer may choose |
| R5 | Process | Design first (this document), refine, then implement on the developer's word |

## 3. Architecture

Three layers in the prompt-advisor, in order. Each layer can only narrow or choose
among what the previous one allowed; none can widen.

```
prompt + cwd
   │
   ▼
[1] Deterministic floor (kernel, no network)
    resolve-stack(cwd) → languages
    keyword match → raw candidates
    stack constraint: drop/rebind intents whose `stack` is absent from the repo
    decision-rules regex, scale regex (unchanged)
    → candidates, generic_only flag, hard facts
   │
   ▼
[2] Decision layer (one of: keyword | jev | llm), chosen by the switch
    input: prompt, languages, candidates (+ every intent as an option), project CLAUDE.md head
    output: chosen intents, confidence, mode, latency
    failure → mode "keyword" with a visible note
   │
   ▼
[3] Contract (unchanged shape, + `router: {mode, confidence}`)
    low confidence or tie → escalation note: dispatch the `router` agent (existing)
```

### 3.1 Layer 1: the deterministic floor (always on)

- `resolveStack(ctx.root)` once per prompt; config wins over detection; result cached
  per root for the session (`src/hooks/cache.ts`).
- `intents.json` rows gain two optional fields: `stack: "node" | "python"` and
  `stack_sibling: "<intent id>"`. `backend` ↔ `backend-python` are the first pair.
- **Rebind rule.** A matched intent whose `stack` is not among the repo's languages is
  replaced by its sibling when the sibling's stack is present; dropped when neither
  is present; kept when the repo is mixed. Recorded as `rebound: [{from, to, reason}]`
  in the route section (additive field).
- **generic_only.** True when every surviving match came from signals in a
  `generic` list (`API, service, controller, endpoint, router, migration, queue,
  add, build, create, implement, fix`) — the prompts the keywords cannot
  disambiguate. `[?]` the list lives in `intents.json` per row (`generic_signals`) or
  in `policy.json` (`router.generic_signals`); registry-per-row is more honest.
- Hard facts handed down: languages, file paths named in the prompt (routed by
  `route-path`), decision-rule matches, scale flags. The decision layer cannot
  contradict them.

Layer 1 alone already fixes the five prompts above. It ships first (wave 1) and is
useful even if layers 2 and 3 are never enabled.

### 3.2 Layer 2: the decision layer

**Switch.** `ENGINEOS_ROUTER` = `keyword` | `jev` | `llm` | `auto`.

- Personal default in `~/.claude/settings.local.json` env.
- Per-repo override in `.engineos/config.json`: `"router": {"mode": "keyword"}`.
  **The more restrictive wins**: a repo that says `keyword` is never routed through a
  network model whatever the personal setting says (client code never leaves the
  machine). Order: `keyword` < `llm` < `jev` < `auto` in restrictiveness, where
  `auto` = `jev` when a key is present, else `llm` when the `claude` CLI is present,
  else `keyword`. `[?]` Confirm the restrictiveness order: is `llm` (Anthropic, the
  provider the session already talks to) really less restrictive than `jev`
  (a second provider)? Proposed: yes — `llm` sends to the provider the session
  already uses; `jev` adds TypeSafe.
- **Default when unset: decided by the end-to-end golden set, never hardcoded.**
  `registries/policy.json` `router.default` is written by the golden-set run
  (§6) with the winning mode and the run's date and score; the hook reads it.
  Before a run exists the field is `null`, and the hook runs in **shadow**: it
  applies `auto` (best available mode) and also computes the keyword answer,
  logging both and any disagreement to the router span, so the first golden set is
  built from real prompts and real disagreements, not invented cases. The
  developer flips nothing by hand; a new golden-set run rewrites the field.

**Mode `jev`.** One HTTP call, `POST https://api.typesafe.ai/v1/systemone`, bearer
`TYPESAFE_API_KEY`, via node `fetch` (no new dependency; node ≥ 18). Budget 400 ms
`[?]`, no retries (429/529 → fallback, never backoff inside a hook).

- `state`: `{ prompt, languages, frameworks, project_claude_head (≤ 1500 chars),
  files_named }`. No file contents, no diff. `[?]` whether the CLAUDE.md head is
  sent at all for client repos — the per-repo `keyword` override exists for that.
- Question `intents` (type `choice`): one option per intent id, `criteria` = the row's
  `title` + `note` (so the registry is the single source of the descriptions), plus
  `__none__`. Options whose `stack` is absent from the repo are **not offered**
  (the floor's constraint, applied before the call).
- Question `needs_router_agent` (type `noul`): "Is this request ambiguous across
  several of the offered intents, or does it span domains?" → feeds escalation.
- Answer: `choice`, `confidence`, `probabilities`. Threshold `router.min_confidence`
  (policy.json, `[?]` 0.6 to start): below it, or when the top two are within
  `router.tie_margin` (`[?]` 0.15), the contract carries the keyword result **and**
  the escalation note for the `router` agent.
- Multi-intent prompts: `[?]` ask one `choice` per surviving candidate as a `noul`
  ("does this intent apply?") instead of a single choice, so a prompt can keep two
  intents (e.g. backend + security). Proposed: a single `choice` for the primary
  intent, plus the floor's other matches kept when their signal was non-generic.

**Mode `llm`.** No API key. Two sub-options, `[?]` pick one:

- (a) **In-session router agent, on the residue only.** The hook does not call a
  model. When `generic_only` is true or the floor matched nothing, the contract
  carries the escalation note; Claude dispatches `agents/router.md` (exists today)
  with the stack, candidates and prompt, and follows its plan. Zero hook latency;
  one agent round-trip only on ambiguous prompts; relies on Claude obeying the
  escalation note (which plan 2's dispatch audit makes checkable).
- (b) **In-hook `claude -p`.** The hook runs `claude -p --model <cheap tier> --output-format json`
  with the same question as Jev and validates the JSON against the intent ids. The
  live eval tier already does exactly this (`src/evals/live.ts`), so the plumbing
  exists. Deterministic to invoke, but 2–6 s per prompt and a nested Claude process
  inside a Claude session.

Proposed: (a) as the `llm` mode. (b) only as the eval harness's grader.

**Mode `keyword`.** Layer 1 only. The contract says `router=keyword`.

**Fallback, every mode.** Any error, timeout, missing key or CLI → keyword result
plus one visible line: `[engineos] router: keyword (jev unavailable: <reason>)`. A
silent downgrade is the one thing this layer must never do.

### 3.3 Layer 3: the contract

- Shape unchanged; one additive section: `router: { mode, confidence, rebound,
  generic_only, latency_ms }`.
- The advisor's contract line gains `router=<mode>[/<confidence>]`.
- The exec journal `router` span (already written per prompt) gains `mode`,
  `confidence`, `latency_ms`, `fallback_reason` — this is how `scripts/usage-report.sh`
  and the retro see which mode decided what.

## 4. Privacy and data

| Mode | What leaves the machine | To whom |
|---|---|---|
| keyword | nothing | — |
| llm (a) | the prompt, as any Claude turn already does | Anthropic (existing relationship) |
| llm (b) | same, via the CLI | Anthropic |
| jev | prompt + languages + frameworks + CLAUDE.md head + file names | TypeSafe |

TypeSafe (docs read 2026-10-06): no training on customer data; DPA; zero data
retention only for enterprise via sales; no on-prem/VPC found; no certifications
listed. Consequence: `jev` is a personal-repo default at most; client repos declare
`keyword` or `llm` in `.engineos/config.json`, and that file is committed so the
whole team inherits it. `[?]` Castrolanda / LabV decision is theirs.

## 5. Components and files

| Area | Change |
|---|---|
| `registries/intents.json` | `stack`, `stack_sibling`, `generic_signals` on rows; `backend`/`backend-python` pair |
| `registries/policy.json` | `router: { min_confidence, tie_margin, jev_budget_ms, modes }` |
| `src/registry/intents.ts`, `policy.ts`, `project-config.ts` | the new fields (strict) |
| `src/kernel/route.ts` | stack rebind, `generic_only`, `rebound` |
| new `src/kernel/decision-layer.ts` | mode switch, Jev client (fetch), restrictiveness merge, fallback |
| `src/kernel/resolve.ts` | compute languages once, call the layer, emit `router` section |
| `src/hooks/prompt-advisor.ts`, `prompt-advisor-guidance.ts` | render `router=`, fallback line, escalation on low confidence |
| `src/hooks/cache.ts` | stack per root; decision per (prompt hash, languages, mode) |
| `src/journal/*` | router span fields |
| `agents/router.md` | receives stack + candidates + confidence; its brief says it is the residue path |
| `rules/context.md` or `rules/base.md` | one paragraph: the router mode and what it may decide |
| `CLAUDE.md`, `AGENTS.md`, `docs/*` | router rules bullet, COMPATIBILITY (additive) |
| `evals/` | stack-tagged cases (`stack: ["python"]`), new `jev` tier in `scripts/run-evals.sh` |
| tests | route rebind, decision-layer with fake fetch/fake CLI, fallback paths, restrictiveness merge |

No new runtime dependency. `TYPESAFE_API_KEY` only in personal settings or CI secrets.

## 6. End-to-end golden set and the default

The golden set is built **after** the modes exist, from real use, end to end:

- **Collection.** With `router.default = null` the hook runs in shadow (§3.2) and
  the router span records, per real prompt: repo, languages, keyword answer, decision-
  layer answer, confidence, and whether the developer corrected the route (a later
  `[router]` line or an edit routed to another domain). `scripts/router-golden.sh
  collect` turns the journal into candidate cases across every repo the developer
  works in (labv-assist, the demo, portal_dds, nexxus, ppp, lana, gest_leite).
- **Curation.** The developer labels the expected intent per case; cases are stored
  with `stack`, `repo`, `expect_intents`, and `source: real`. Synthetic cases (the
  five prompts above, their Node mirrors, paraphrases, cross-domain) are added with
  `source: synthetic` and never outnumber the real ones.
- **Run.** `scripts/router-golden.sh run` grades every mode (`keyword`, `llm`,
  `jev`) on the whole set, end to end through the real hook binary against each
  repo's checkout, reporting intent accuracy, stack correctness, p95 latency and
  fallback rate per mode.
- **Default.** The run writes `router.default` in `policy.json` with the winner,
  the date and the scores; the hook obeys it from the next session. The spec's
  `## Results` section carries the table. Ties and a stack-correctness below 100%
  leave the field `null` (shadow continues) and say so.
- The existing `evals/intent-routing-cases.jsonl` deterministic tier keeps guarding
  the keyword floor and the stack rebind; the golden set above is the new, separate
  artifact that decides the default.

## 7. Non-goals

- Replacing path routing (`route-before-change`): it is correct and stays.
- Using Jev for anything but routing in this change (output verification is plan 2's
  foreign-stack check, deterministic).
- An embedding classifier (on the shelf unless `llm` (a) proves too slow in use).

## 8. Open questions, collected

1. `generic_signals` per row or global list.
2. Restrictiveness order `keyword < llm < jev < auto`.
3. ~~Default mode when unset~~ — decided: written by the golden-set run, shadow until then.
4. Jev budget (400 ms?), `min_confidence` (0.6?), `tie_margin` (0.15?).
5. Send the CLAUDE.md head to Jev, or only languages/frameworks.
6. Multi-intent answers: single `choice` + floor extras, or one `noul` per candidate.
7. `llm` mode = in-session router agent (a) or in-hook `claude -p` (b).
8. Castrolanda/LabV repos: `keyword` or `llm`, declared in their `.engineos/config.json`.

## 9. Waves (after refinement, on the developer's word)

| Wave | Units |
|---|---|
| 0 | Freeze: intents fields, policy `router` block, `router` section shape, decision-layer interface, eval case schema |
| 1 | (a) floor: rebind + generic_only + tests · (b) eval cases + stack-aware deterministic tier |
| 2 | (a) decision-layer: switch, restrictiveness, fallback, Jev client with fake fetch tests · (b) advisor rendering + journal span · (c) router agent brief + prose |
| 3 | Shadow logging + `router-golden.sh collect` · docs · change record (default stays `null`) |
| 4 (later, after real use) | Curate the e2e golden set · `router-golden.sh run` over every mode · write `router.default` + `## Results` |
