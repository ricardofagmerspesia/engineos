# Replace any-match intent routing with a three-tier router and an opt-in, add-only Jev judge

Date: 2026-10-10
Status: proposed (accepted on merge of PR #132; developer approved the direction and the prototype preview, revision `71ce35fb93a0`, on 2026-10-10)

Source: `docs/specs/2026-10-10-routing-replacement-plan.md` §1–§4a, §8;
contracts `docs/specs/2026-10-10-routing-replacement-contracts.md` (rev 3;
rev 3 adds the embedding tie-break semantics and records the in-process spawn
deviation, both reflected below);
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
  evidence. The prompt is capped, redacted with the secret and personal-data
  set carried as data in `policy.judge.redaction.patterns`, and then cut to
  size before it enters the request. The request body carries only `model`,
  `state` and `questions`, and the endpoint's origin is allowlisted in code
  (`https://api.typesafe.ai`); "Threat model and redaction" below is the
  binding description. An authoritative fold is add-only: it unions every
  deterministic intent with a high risk floor into the judge-chosen set and
  takes the higher of `route.model_tier` and the folded set's tier.
  Zero-data-retention terms from TypeSafe are a precondition for any team-wide
  default-on; until then the judge is a per-machine opt-in.
- **Source check.** `classifyPromptSource` runs before anything else; a
  notification, tool result or hook echo gets no routing and no judge call.
  For the judge only, the check fails closed toward no egress: a prompt whose
  first non-space character opens an unlisted `<tag` frame is treated as
  non-user, and so is a prompt whose classification throws. Kernel routing
  keeps its own source behaviour unchanged.
- **Embedding tie-break (P5, opt-in).** The warm MiniLM daemon from option 5
  is consulted only when the deterministic route is ambiguous and
  `ENGINEOS_EMBED_DAEMON=1`. Its scores reach the kernel as a journaled
  `tiebreak` fact, so the kernel still does no I/O. The scores may only narrow
  the deterministic survivors to one winner. They never add an intent, never
  lower the risk floor or model tier, never remove an escalation reason and
  never edit `route.*`. The judge's authoritative fold takes precedence over
  them (contracts rev 3 §4.7).
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
  registry (plan §6) is not part of this change; the in-process early exit is,
  for every hook except `git-write-guard`, which never takes it. `install.sh`
  keeps its own bash copy of the secret patterns because the installer runs
  without the bundle. The two lists are no longer the same set: the policy list
  adds personal-data classes (email, phone, CPF, CNPJ) and token formats that
  the installer's secret scan does not use. They are reviewed together, not
  checked, until a validator row is added.

## Threat model and redaction

This section is the `threat-model` artifact that `rule-sensitive-data`
(`registries/decision-rules.json`) requires. A prompt can carry secrets and
personal data, and the judge sends prompt text to a third party. The rule's
other two artifacts are covered at the end of this section.

**What leaves the machine, and when.**
- Prompt text leaves only through the judge, and only when two conditions hold:
  `ENGINEOS_JUDGE=jev`, and a non-empty `TYPESAFE_API_KEY` in the environment.
  With either one unset, nothing is sent.
- The judge is consulted at most once per user prompt, from the prompt advisor
  only. Notifications, tool results and hook echoes are never sent (see "Source
  check" above).
- One HTTPS `POST` carries the request. Its body is `{ model, state, questions }`.
  `state` holds:
  - the redacted, capped prompt text;
  - the repository facts (declared stack, active spec, open change record);
  - the session's last intent.

  Nothing else from the environment enters the body.
- The key travels only in the `Authorization` header. Any redirect fails the
  call, so the bearer token cannot follow a redirect elsewhere.
- The embedding tie-break daemon is local. Its socket is a private unix socket,
  and it opens no TCP port. The prompt it receives is redacted with the same
  set. The daemon's only network traffic is the model download from the Hugging
  Face hub on first run, which carries no prompt text and is off under
  `ENGINEOS_EMBED_OFFLINE=1`.

**Endpoint allowlist.** The judge's policy loader refuses any `judge.endpoint`
whose origin is not `https://api.typesafe.ai`. The allowlist lives in code, not
in the registry, so editing `policy.json` cannot redirect prompts to another
host.

**Order of operations.**
1. Cap the text before redaction, so no pattern runs over unbounded input. The
   judge caps at twice `max_state_bytes` in characters; the tie-break caps at
   twice its prompt-text limit.
2. Redact the capped text.
3. Cut the result to the final limit. Redaction has already run on the whole
   capped text, so the cut cannot expose part of a secret that redaction would
   have hidden.

**Redaction classes** (`policy.judge.redaction.patterns`). Each match is
replaced with `<redacted:<kind>>`. Every pattern is bounded, with no unbounded
nested quantifier, so a crafted prompt cannot make redaction run away. The set
covers:
- a PEM private-key block, matched end to end (header, body and footer);
- a JWT (`eyJ...` `.` `eyJ...` `.` signature);
- underscore-prefixed and vendor-prefixed tokens: `sk_live_`, `sk_test_`,
  `rk_live_`, `ghp_`, `gho_`, `ghs_`, `ghu_`, `ghr_`, `github_pat_`, `npm_`,
  `hf_`, `xox[abpr]-`;
- an AWS secret access key in an assignment context;
- generic `password`, `secret`, `token` and `api_key` assignments;
- email addresses;
- phone numbers (E.164-like, bounded);
- Brazilian CPF and CNPJ numbers;
- URL credentials, bounded as
  `[a-z][a-z+]{0,31}://[^/\s:@]{1,256}:[^@\s/]{1,256}@`.

**Prompt-source check fails closed for the judge.** A prompt that opens with an
unlisted `<tag` frame, or whose classification throws, is treated as non-user.
A non-user prompt is never sent. Doubt therefore resolves toward no egress.
Kernel routing is unaffected by this judge-only rule.

**The authoritative fold is add-only.** Even a fully trusted judge answer
cannot remove a deterministic high-floor intent or lower the model tier:
- every deterministic intent with a high risk floor is unioned into the
  judge-chosen set;
- the tier is the higher of `route.model_tier` and the folded set's tier.

A manipulated or wrong judge answer can add work or raise a tier. It cannot
remove a gate.

**Residual risks, accepted.**
- Redaction is lexical. A novel secret format, an unusual phone or ID layout,
  or personal data with no fixed shape (names, addresses, free-text health or
  financial details) can pass through. Shadow mode records only, but the request
  is still sent in shadow mode.
- Processes running as the same user are trusted. The runtime directory, the
  presence record, the sockets and the compile cache are protected against
  other users, not against code already running under the developer's uid.
- TypeSafe has not yet granted zero-data-retention terms. Until it does, the
  judge stays a per-machine opt-in (see "Judge" above).

**Security review and human approval.** A security review of the PR head
`3b38ce4` returned BLOCK on 2026-10-11. The fixes recorded in this section
(guard stand-down, presence handshake, endpoint allowlist, bounded redaction,
fail-closed source check, add-only fold, private compile cache) answer that
verdict. They go back to `security-reviewer` after integration. Accepting this
ADR does not approve a live judge call. Before the first live call with a real
key, the developer gives a separate approval, recorded under `## Human
decisions` in the change record (`rules/risk-autonomy.md`).

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
- Accepted limit (contracts rev 3 §16.7): the in-process adapter
  (`ENGINEOS_INPROCESS=1`) does **not** reach zero per-call spawns. Claude Code
  still spawns every command hook registered in `hooks.json`; the shell side
  exits at once when a live adapter host owns the session. The real cost is
  one immediate-exit spawn per registered route per call. Reaching zero needs
  a host feature to disable one plugin's command hooks, or an install variant
  without `hooks.json` when the adapter is on. Until then the adapter saves the
  hook *work*, not the spawns. It is reported as degraded, not as meeting the
  original target. `git-write-guard` is outside this saving: its shell copy
  never stands down, so with the adapter on it may answer from both the host
  and the shell, and the two asks fold into one prompt.
- The tie-break stays inert until T13 calibrates `router.scoring`. With the
  placeholder cuts (`threshold: 0`, `margin: 0`) a route is ambiguous only when
  nothing matched, and the tie-break never routes a prompt that has no
  deterministic survivors.
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
opt-in); the host gaining a way to disable one plugin's command hooks (adopt it
when the adapter is on, closing the immediate-exit spawn gap).
