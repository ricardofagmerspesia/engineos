# Replace any-match intent routing with a three-tier router and an opt-in, add-only Jev judge

Date: 2026-10-10
Status: proposed (accepted on merge of PR #132; developer approved the direction and the prototype preview, revision `71ce35fb93a0`, on 2026-10-10)

Source: `docs/specs/2026-10-10-routing-replacement-plan.md` §1–§4a, §8;
contracts `docs/specs/2026-10-10-routing-replacement-contracts.md` (rev 1);
GitHub issue #118 (plan), #119 (this ticket).

## Context

The kernel routes a prompt by literal phrase lists: any `signals` entry found
with word boundaries fires the intent (`src/kernel/route.ts routeByIntent`,
32 rows in `registries/intents.json`), with no weights, no negation, no
confidence and no notion of the verb's object. One session on 2026-10-10
produced three misroutes from exactly those gaps: "agent" sent a Claude Code
tooling request to the `llm` row with Mastra rules; "create" sent an
architecture plan to `new-feature`; and a subagent's background notification,
which the user never typed, was routed as a seven-intent high-risk dispatch.
The answer envelope, `intents.json`, the hook contracts and the byte-parity
fixtures (`test/fixtures/legacy-kernel/`) are versioned public surface
(`docs/COMPATIBILITY.md`), the runtime floor is Node 18 with one committed
bundle and no runtime dependencies, and `rules/base.md` keeps the ecosystem
JavaScript/TypeScript. Hook latency is spawn-bound (60–95 ms of a 93–138 ms
p50), so the decision logic itself has microseconds, not seconds, to spend.

## Options considered

1. **Three-tier router: Tier 0 deterministic gates, Tier 1 scored TypeScript
   classifier, Tier 2 router-agent escalation; TypeSafe Jev as an opt-in
   semantic judge that produces facts the kernel consumes and may only add
   gates or raise risk** (chosen).
   - Pros: fixes the observed failures (weights, negatives, verb-object pairs,
     exemplar similarity, a source check); stays deterministic and replayable
     (Jev's answers are journaled facts, the kernel never calls the network);
     pure TypeScript, no dependency, sub-millisecond; Jev adds calibrated
     semantic judgment at 70–500 ms with plain `fetch`, inside the 600 ms
     prompt-advisor budget, off by default and shadow-first.
   - Cons: two classifiers to keep honest (fallback and judge) and a golden set
     that must grow from 36 to 120+ cases before thresholds mean anything;
     prompts leave the machine when the judge is on, which is a data-egress risk
     that needs redaction, a key from the environment, zero-data-retention
     terms before any team default, a security review and a recorded human
     decision; the TypeSafe API is early access and `jev-1.13` has a
     first-option bias and reads state literally, so the question set is
     prompt engineering with its own eval obligations; intent-routing byte
     parity with the retired bash kernel cannot survive a router that changes
     answers on purpose.
2. **Port the kernel to Julia** (rejected). A standard Julia runtime starts in
   seconds; `juliac --trim` binaries start fast but trimming is experimental
   and ships about 90 MB of runtime libraries per platform. It adds no
   intelligence by itself and breaks both the JS/TS-only ecosystem rule and the
   single committed bundle.
3. **GoRules Zen (JDM decision tables) for the policy tables** (deferred, not
   adopted). Fast evaluation, but a native Rust addon per platform plus load
   cost on every spawn, for tables of 3–10 rows with boolean and enum inputs
   that an in-house FIRST/COLLECT evaluator under 100 lines covers. Its real
   strength is a visual editor for non-developers, which nobody has asked for.
   Revisit only on that need.
4. **LLM classification per prompt in the hook (a Haiku call)** (rejected).
   Seconds per prompt against a 600 ms budget, and it answers in prose that
   must be parsed; Jev answers the same questions typed and calibrated at a
   fraction of the latency. The `router` agent remains the escalation for
   low-confidence cases, which is the one place a full model earns its cost.
5. **Local embedding model (transformers.js, MiniLM-class) loaded on each
   spawn** (rejected as a spawn-time tier; kept as an opt-in warm daemon in
   phase P5). Model load on every spawn is far over budget and adds about
   25 MB of model plus an ONNX runtime to the install. Only a warm daemon makes
   it viable, and only as a tie-breaker when the fallback is ambiguous.
6. **Keep any-match and only add more phrases and a stop-list** (rejected).
   Cheapest, but it keeps every root cause: single common words still decide
   alone, there is still no confidence, no ranking for the router agent, and
   nothing distinguishes user text from a notification.

## Decision

Option 1, with these bound sub-decisions:

- **Tiers.** Tier 0 (path globs, security/destructive/secret decision rules,
  HITL floors) is unchanged in meaning and can never be removed by a score or a
  judge. Tier 1 is `src/kernel/score.ts`: weighted phrases, verb-object pairs,
  negative phrases, path tokens and BM25 over per-intent exemplars, producing
  `ranked` candidates with score, confidence and margin (contracts §2, §9).
  Tier 2 is the existing `router` agent, now handed the ranked candidates and
  the features that fired. `route.intents` and `route.matches` keep their pinned
  shapes; the ranking is a sibling key, `ranked` (contracts D2).
- **Judge.** TypeSafe Jev is consulted at most once per user prompt, from
  `src/hooks/prompt-advisor.ts` through `src/judge/jev.ts`, never from Bash,
  Edit or Stop hooks. It is enabled only by `ENGINEOS_JUDGE=jev` plus a
  non-empty `TYPESAFE_API_KEY` in the environment (never a repository file),
  default off, `mode: shadow` first (recorded, not applied), then `advisory`
  (shown), then `authoritative` for intents only after shadow precision and
  recall beat the fallback on the golden set. Gates and risk are add-only
  permanently: a judge fact can add a decision rule's requirements or raise
  the floor, never remove or lower one (contracts §4). The model is pinned to
  `jev-1.13.0`; a version bump is a prompt change and needs fresh eval
  evidence. The prompt is redacted with the `install.sh` secret pattern set,
  carried as data in `policy.judge.redaction.patterns`, before it enters the
  request; the request body carries only `model`, `state` and `questions`.
  Zero-data-retention terms from TypeSafe are a precondition for any team-wide
  default-on; until then the judge is a per-machine opt-in.
- **Source check.** `classifyPromptSource` runs before anything else; a
  notification, tool result or hook echo gets no routing and no judge call.
- **Parity retirement.** Intent-routing byte parity with the pinned bash kernel
  is retired: the arms `route-intent answers identically to the pinned bash
  kernel`, `route-escalate answers identically to the pinned bash kernel` and
  `resolve-task answers identically to the pinned bash kernel` in
  `src/kernel/parity.test.ts` are skipped in T13 with a comment citing this
  ADR. Path parity (`route-path ...`) and every policy arm (`model`, `risk`,
  `gates`, `repair`, `admit`, `breaker`, `hitl`, `waves`, `decision-rules`,
  `scale`, `skill-state`, and the `resolve` section test for those sections)
  stay. The reason is the decision itself: a scored router changes intent
  answers on purpose, and a fixture that pins the old answers would pin the
  misroutes.
- **Mastra does not apply.** `rules/llm-apps.md` requires Mastra inside NestJS
  for LLM applications. The judge is a single typed classifier call (one HTTPS
  request, typed Choice/Score/yes-no answers, no generation, no tools, no
  memory) inside a CLI hook with a 400 ms deadline and a Node 18 floor. It is
  not an LLM application: there is no agent, no conversation and no server
  host, and a Mastra dependency would break the no-runtime-dependency bundle.
  Recorded here as the policy deviation the plan asks for; the rule's
  prompt-injection and structured-output obligations (untrusted state,
  schema-validated answers, no regex parsing) still apply and are met by the
  add-only combination and the response validation in `src/judge/jev.ts`.
- **Branch base.** This work lands on `feat/routing-replacement` from
  `0b2e442` HEAD only. The main checkout's uncommitted workflow work
  (`src/kernel/execution.ts`, `src/scheduler/`, `src/workflow/`,
  `policy.workflow`, `src/kernel/skill-reference.ts`) is not pulled in; the
  policy-table rows for those modules and the skill-reference dedupe are out
  of scope here and follow that work when it is committed (developer decision,
  2026-10-10).
- **Compatibility class.** Every change is MINOR under `docs/COMPATIBILITY.md`:
  additive envelope keys (trailing only), a new `resolve --facts` key, new
  `policy.json`/`decision-rules.json` blocks, intents.json v2 fields with
  `signals` read for one window, a second bundle for the hot hooks, a generated
  router table, and the Warn step for the already-deprecated `.sh` shims.
  Nothing is removed or renamed; removal of `signals` and of the shims is 2.0.
- **Deferred, recorded.** Moving `git-write-guard`'s verb and flag sets into a
  registry (plan §6) is not part of this change; the in-process early exit is.
  `install.sh` keeps its own bash copy of the secret patterns because the
  installer runs without the bundle; the two lists are kept equal by review,
  not by a check, until a validator row is added.

## Consequences

- Easier: misroutes become data changes (`phrases`, `negative`, `exemplars`
  proposed by `retro` from `corrected_from=` tokens and route/judge events);
  the router agent reasons over ranked candidates instead of a flat set; the
  CLAUDE.md/AGENTS.md router table is generated from `intents.json`, which
  retires a class of prose-drift findings; non-user text stops being routed.
- Harder: two sources of truth per intent (`signals` during the window,
  `phrases` after) until 2.0; every threshold is a placeholder until T13
  calibrates it, and calibration may move the six `policy.router.fixtures`
  (they move with this ADR, never silently); `confidence` is relative
  (`score / total`), so legitimately co-routed domains report a small margin,
  which is why `margin` is reported but the escalation cut defaults to `0`
  until the golden set says otherwise; a judge fact is replayable but a judge
  *call* is not, so shadow comparisons are single-pass evidence with a pinned
  model.
- We commit to maintaining: the golden set (120+ cases, 3+ per active intent,
  exemplars mirrored into the registry), `evals/BASELINE.md`, the question
  generator and the committed shadow request file in lockstep, the redaction
  pattern list in two places, the breaker state file under the consumer's git
  dir, and a security review of `src/judge/**` before the judge leaves
  individual opt-in.
- Compatibility: `docs/COMPATIBILITY.md` "Unreleased" gains one row per
  surface change (contracts §14); release notes name the parity retirement
  and the shim warning.

Revisit triggers: shadow-tier precision or recall of Jev below the fallback on
the golden set after calibration (drop the judge, keep Tier 1); TypeSafe
declining zero-data-retention terms or leaving early access with a breaking
API (the judge stays per-machine or is removed; the kernel is unaffected);
prompt-advisor p95 above its 600 ms budget with the judge on (lower
`timeout_ms` or move the call off the prompt path); a real need for a visual
rule editor (reopen option 3 for the policy tables only); Claude Code's
function-hook API leaving early access (promote the P5 in-process adapter from
opt-in).
