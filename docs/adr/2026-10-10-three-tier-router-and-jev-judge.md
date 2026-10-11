# Replace any-match intent routing with a three-tier router and an opt-in, add-only Jev judge

Date: 2026-10-10
Status: proposed (accepted on merge of PR #132; developer approved the direction and the prototype preview, revision `71ce35fb93a0`, on 2026-10-10)

Source: `docs/specs/2026-10-10-routing-replacement-plan.md` §1–§4a, §8;
contracts `docs/specs/2026-10-10-routing-replacement-contracts.md` (rev 4;
rev 3 adds the embedding tie-break semantics and records the in-process spawn
deviation; rev 4, the security fix pass on PR #132, records the presence v2
contract, the judge egress rules and the add-only fold, and its §17.11 the
re-review fixes E1-E4; all are reflected below);
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
     parity with the retired bash kernel cannot pin the scored answers on the
     shipped registries, which change on purpose (parity survives only on the
     legacy keys over the pinned v1 fixture data; see "Parity scope" below).
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
  binding description. An authoritative fold keeps every deterministic
  survivor with a high risk floor (appended after the judge-chosen set and
  never suppressed by it), and the model tier is the higher of
  `route.model_tier` and the folded set's tier. It may drop a medium or
  null-floor intent and that intent's agent; "The authoritative fold" below
  states exactly what it can and cannot remove. Authoritative mode ships
  disabled (`mode: shadow`).
  Zero-data-retention terms from TypeSafe are a precondition for any team-wide
  default-on; until then the judge is a per-machine opt-in.
- **Source check.** `classifyPromptSource` runs before anything else; a
  notification, tool result or hook echo gets no routing and no judge call.
  For the judge only, the check fails closed toward no egress
  (`judgeMayReceive`): a prompt is sent only when `classifyPromptSource` says
  `user`, the prompt with leading whitespace trimmed does not open a tag frame
  (`^<[A-Za-z][A-Za-z0-9_.:-]{0,63}(?:[\s/>]|$)`), and nothing throws,
  including the registry read that supplies the markers. The tag-frame test
  applies even when the host declares the source `user`. Kernel routing and
  the tie-break keep their own source behaviour unchanged.
- **Embedding tie-break (P5, opt-in).** The warm MiniLM daemon from option 5
  is consulted only when the deterministic route is ambiguous and
  `ENGINEOS_EMBED_DAEMON=1`. Its scores reach the kernel as a journaled
  `tiebreak` fact, so the kernel still does no I/O. The scores may only narrow
  the deterministic survivors to one winner. They never add an intent, never
  lower the risk floor or model tier, never remove an escalation reason and
  never edit `route.*`. The judge's authoritative fold takes precedence over
  them (contracts rev 3 §4.7).
- **Parity scope (corrected 2026-10-11 to match the code).** Intent-routing
  byte parity with the pinned bash kernel is **kept on the legacy keys**, not
  retired. The arms `route-intent answers identically to the pinned bash
  kernel`, `route-escalate answers identically to the pinned bash kernel` and
  `resolve-task answers identically to the pinned bash kernel` in
  `src/kernel/parity.test.ts` still run. Each compares the pinned bash kernel
  with the TypeScript projection over the pinned v1 fixture registries
  (`test/fixtures/legacy-kernel/`). Before the byte comparison it strips the
  trailing additive keys of contracts §2.2–§2.4 (`ranked`, `margin`, `judge`,
  `risk_proposal`, `tiebreak`, `judge_added`). Any other difference fails,
  including a legacy key moved behind an additive one. On v1 data the scored
  router reproduces the any-match set (contracts §1.5), which is why these
  arms can stay. Path parity (`route-path ...`) and every policy arm
  (`model`, `risk`, `gates`, `repair`, `admit`, `breaker`, `hitl`, `waves`,
  `decision-rules`, `scale`, `skill-state`, and the `resolve` section test)
  stay as before. Like every arm, the three skip when bash or jq is missing
  or when `bash -n` cannot parse the pinned kernel; the macOS `/bin/bash` 3.2
  fails that probe, so local macOS runs skip. CI's `verify` job sets
  `ENGINEOS_REQUIRE_PARITY=1`, which turns those skips into failures. That CI
  setting is the control that enforces parity. Scored answers on the shipped
  v2 registries are not pinned by parity: the golden set
  (`evals/intent-routing-cases.jsonl`) and `evals/BASELINE.md` pin them. An
  earlier draft of this ADR said the three arms would be skipped in T13; that
  skip was never implemented, and contracts rev 4 item 9 records the
  correction.
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
  checked, until a validator row is added. The policy list itself is pinned by
  hash in `src/registry/policy-judge.ts` (E2), so changing it is a code change.

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

**Endpoint allowlist.** The judge's policy loader
(`src/registry/policy-judge.ts`) refuses any `judge.endpoint` whose origin is
not exactly `https://api.typesafe.ai`; a different host or a non-default port
is refused, as are credentials in the URL. The allowlist lives in code, not in
the registry, so editing `policy.json` cannot redirect prompts to another host.
The refusal is a malformed `judge` block, and `judge` is part of the strict
`policy.json` loader, so the **whole `policy.json` load is refused**: every
kernel answer that reads the policy exits 1, and `validate` reports C38c
`judge-block-malformed`. `src/judge/jev.ts` checks the origin again for a
policy built any other way, and answers `skipped: disabled` before the breaker
file is read and before any byte is sent.

**Registry pins (E2).** The same argument applies to the rest of the judge
block, so the loader pins it in code next to the origin and refuses any other
value as a malformed `judge` block (the whole `policy.json` load, C38c
`judge-block-malformed`):
- `key_env` must be exactly `TYPESAFE_API_KEY`, so a registry cannot choose
  which environment secret is sent as the bearer key;
- `enabled_env` must be exactly `ENGINEOS_JUDGE` and `enabled_value` exactly
  `jev`, so a registry cannot turn the judge on through a variable that is
  always set;
- `max_state_bytes` is capped at 16,384 (the shipped value), so a registry
  can lower the state size and the redaction pre-cap but never raise them;
- `judge.redaction.patterns` must hash to the SHA-256 held in
  `src/registry/policy-judge.ts`, computed over `JSON.stringify` of the array
  as parsed (rows and key order as in the file). Changing, adding, removing or
  reordering a pattern is therefore a reviewed code change, and a registry
  cannot ship a weaker list. The legacy-kernel fixture carries the identical
  block.

`src/judge/jev.ts` still reads the variable names from the loaded policy;
after the pins those are the only names it can see.

**Order of operations.**
1. Cap the text before redaction, so no pattern runs over unbounded input. The
   judge caps at twice `max_state_bytes` in characters; the tie-break caps at
   twice its 2,000-character prompt-text limit.
2. When the text was capped, drop its trailing run of non-whitespace as well.
   It may be the first half of a token whose pattern needs the rest (a minimum
   length, a JWT's second dot), and half a secret is still a secret.
3. Redact the capped text.
4. Cut the result to the final limit. Redaction has already run on the whole
   capped text, so the cut cannot expose part of a secret that redaction would
   have hidden. A judge prompt that was capped or cut carries
   `request.truncated: true`.

**Redaction classes** (`policy.judge.redaction.patterns`). Each match is
replaced with `<redacted:<kind>>`. The patterns apply in list order, so an
earlier, more specific kind wins over a later, broader one. The kinds, in
order:
1. `private-key-block`: a PEM or PGP private-key block, header to footer;
2. `private-key`: a private-key header with no footer, and its body;
3. `private-key-id`: a Google service-account `private_key_id` field;
4. `jwt`: `eyJ...` `.` `eyJ...` `.` signature;
5. `anthropic-key`, `openai-key`, `sk-key`: `sk-ant-`, `sk-proj-`, `sk-`
   prefixed keys;
6. `stripe-key`: `sk_live_`, `sk_test_`, `rk_live_`, `rk_test_`;
7. `aws-key`: `AKIA` and `ASIA` access key ids;
8. `github-token`, `github-pat`: `gho_`, `ghp_`, `ghr_`, `ghs_`, `ghu_`,
   `github_pat_`;
9. `gitlab-token`, `npm-token`, `huggingface-token`, `google-key`,
   `atlassian-token`, `slack-token`: `glpat-`, `npm_`, `hf_`, `AIza`, `ATATT`,
   `xox[abprs]-`;
10. `url-credentials`: `[a-z][a-z+]{0,31}://[^/\s:@]{1,256}:[^\s/]{1,256}@`.
    The password part may itself hold `@`: the bounded run backtracks to the
    last `@` before a `/` or whitespace, so the whole password is masked;
11. `basic-auth`: an HTTP basic-scheme value, `[Bb]asic\s{1,4}` followed by
    8 to 4,096 base64 characters and optional padding;
12. `bearer-token`: a bearer authorization value;
13. `aws-secret`: an AWS secret access key in an assignment;
14. `secret-assignment`: a password, passwd, pwd, secret, token, API key, access
    key, private key or credential(s) name assigned a value with `=` or `:`.
    A double- or single-quoted value is masked whole (4 to 256 characters, no
    line break), so a multi-word quoted password does not leak its later words;
15. `email`, `phone` (E.164-like: `+`, then at least 8 digits with bounded
    separators), `cnpj`, `cpf`;
16. `phone-br`: a Brazilian national number with no country code, word-bounded:
    two-digit area code in parentheses or followed by a space or hyphen, then
    an 8- or 9-digit subscriber number with an optional separator, or the bare
    11-digit mobile form (area code, then `9`, then 8 digits).

**Linear-time patterns (E1).** The shipped set is linear; the loader refuses
unbounded quantifiers and quantified groups holding alternation or nested
quantifiers, and pins the shipped list by hash (E2). In detail, outside a
character class the loader (`src/registry/policy-judge-pattern.ts`) refuses
`*`, `+` and `{m,}` with any digit count, and refuses any group followed by a
quantifier (`?` or `{...}`) whose body, at any depth, holds `|` or another
quantifier: `(?:a|a){1,28}b` is bounded and still exponential. Character
classes are exempt, as is an alternation inside a group that is not itself
quantified. This is a syntactic floor, not a proof (adjacent overlapping
bounded runs are polynomial in their bounds), which is why the hash pin, not
the shape test, is what holds the shipped list in place. Every shipped pattern
was timed against adversarial inputs of 32,768 characters (twice
`max_state_bytes`): the slowest single pattern took under 2 ms.

**Classes intentionally unmasked** (the `## Redaction` statement
`rule-sensitive-data` requires). None. No class is left unmasked on purpose.
What is not masked is the residual in (d) below: novel secret formats and
personal data with no fixed shape. Masking errs toward over-redaction:
`basic-auth` also masks the word "basic" followed by a long word in ordinary
prose, and `phone-br` masks any word-bounded number of that shape. Both only
remove text from the judge's view.

**Prompt-source check fails closed for the judge.** The judge receives a prompt
only when all three hold:
- `classifyPromptSource` says `user`;
- the prompt, with leading whitespace trimmed, does not match
  `^<[A-Za-z][A-Za-z0-9_.:-]{0,63}(?:[\s/>]|$)`, which is any tag frame,
  listed in `router.source_markers` or not;
- nothing throws, including the registry read that supplies the markers.

The tag-frame test applies even when the host declares the source `user`. A
non-user prompt is never sent, and no judge fact is declared for it. Doubt
therefore resolves toward no egress. Kernel routing and the tie-break are
unaffected by this judge-only rule.

**What the authoritative fold can and cannot remove.** In authoritative mode
the judge chooses the intent set, so it can drop a deterministic survivor whose
risk floor is medium or null, and that intent's agent with it (for example
`review` and its `security-reviewer`, or `backend` and its
`backend-coordinator`). It cannot:
- drop a deterministic survivor with a high risk floor: those are appended
  after the judge's choice and protected from suppression by it;
- lower the model tier: the tier is the higher of `route.model_tier` and the
  folded set's tier;
- lower the risk floor or remove a decision-rule match: both stay raise-only
  and add-only, and `rule-spec-threshold` reads the folded set (the judge's
  choice plus those kept survivors) before suppression.

Authoritative mode ships disabled: the registry says `mode: shadow`, and the
move to `authoritative` waits for the golden-set evidence named under "Judge"
above. In shadow and advisory mode the judge changes no routing answer.

**Unresponsive host (E4).** The adapter's host can be alive and still stall a
hook. On the first `callHook` timeout the mod abandons the host for the rest of
the session: it marks the host failed, ends it (`child.return()`; the host's
exit handler removes the presence record and the socket) and stops routing to
it, so the shell hooks serve again. The abandon is logged at debug. Only a
timeout abandons the host; a refused, non-ok or malformed answer is logged and
skipped as before, and a dead host is caught by the existing spawn-loop exit.
On the call that timed out, the remaining hooks of that matcher group are not
called, and the mod's git fallback ask still applies to that call. The host
also has its own watchdog (`adapters/claude-code-mod/host/lifetime.ts`): when
it holds one hook request longer than `HOST_STALL_MS` (the largest
`HOOK_DEADLINE_MS` value plus 5 s, 15 s today) it removes its record and
socket and exits with `stopping reason=stalled-hook`. The stall check runs
before the heartbeat stamp, so an abandoned host never re-stamps its record;
the worst case is a record that stays fresh about 20 s after a stalled request
arrives. The deadline table lives in `adapters/claude-code-mod/host/protocol.ts`
as `HOOK_DEADLINE_MS`, with unchanged values.

**Residual risks, accepted.** The re-review of 2026-10-11 at `4ba0cd4`
(security-reviewer) accepted residuals (a) to (d) below.
- (a) The presence record names a session, not an owner. A second Claude Code
  process on the same session id, with the adapter flag on, could have its
  advisory shell hooks stand down on the first process's live record. Closing
  this needs an owner field in the record, out of scope for PR #132; the
  owner-field change and the unresponsive-host family (E4 and the window
  below) are a tracked follow-up. `git-write-guard` is unaffected: it never
  stands down.
- (b) A narrow race remains between the host binding its socket and the mod's
  first route handshake. Its worst case is a hook that fires twice or an
  adapter that fails to start; it never silences the guard.
- (c) The mod's git fallback ask is skipped when `ENGINEOS_GIT_WRITES` is
  exactly `auto`, the same switch the guard itself honours (`rules/git.md`).
  The hook-error path asks with no environment check, and the shell guard runs
  regardless.
- (d) Redaction is lexical, and processes running as the same user are
  trusted. A novel secret format, an unusual ID layout, or personal data with
  no fixed shape (names, addresses, free-text health or financial details) can
  pass through; shadow mode records only, but the request is still sent in
  shadow mode. The runtime directory, the presence record, the sockets, the
  compile cache and the daemon's model cache are protected against other
  users, not against code already running under the developer's uid. The
  common fixed shapes the re-review named (HTTP basic-scheme values, quoted
  multi-word passwords, URL passwords holding `@`, Brazilian national phones)
  are masked since E3 and are not part of this residual.
- A host whose event loop is blocked synchronously runs neither its heartbeat
  nor its watchdog nor its SIGTERM handler. Its record can stay fresh for up
  to the 30 s stale window (`PRESENCE_STALE_MS`) after its last stamp, unless
  the engine escalates to SIGKILL, after which the pid probe fails. This
  window existed before E4, is bounded, and never affects `git-write-guard`.
- The daemon installs a large third-party tree. Lifecycle scripts are off
  (`npm ci --ignore-scripts`, and `ignore-scripts=true` in the package's
  `.npmrc`), and the model is cached per pinned revision in an owner-only
  directory, but the packages themselves are trusted once the lockfile is
  reviewed at the approved final stage.
- TypeSafe has not yet granted zero-data-retention terms. Until it does, the
  judge stays a per-machine opt-in (see "Judge" above).

**Security review and human approval.** A security review of the PR head
`3b38ce4` returned BLOCK on 2026-10-11. The fixes recorded in this section and
in `docs/OPT-IN-TIERS.md` answer that verdict: `git-write-guard` never stands
down; the presence record is version 2, published only on the route handshake,
kept fresh by a heartbeat and bound to the hooks served, the build version and
the registering checkout; the mod asks on a possible git command the guard did
not answer for; `validate` reports a missing hook target; the endpoint is
allowlisted; redaction is bounded and pre-capped; the source check fails closed
for the judge; the fold is add-only; the compile cache is private; and the
daemon installs without lifecycle scripts. The re-review at `4ba0cd4` on
2026-10-11 returned APPROVE WITH CONDITIONS, with four new low findings that
the second fix pass answers: the loader refuses non-linear pattern shapes
(E1); the key variable, the enable switch, the state cap and the redaction
list are pinned in code (E2); basic-scheme values, quoted values, URL
passwords holding `@` and Brazilian national phones are masked (E3); and the
mod abandons a host after its first hook timeout (E4). They go back to
`security-reviewer` after integration. Accepting this
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
  exits at once only when a live adapter host serves that hook for that
  session, as its version-2 presence record states (`docs/OPT-IN-TIERS.md`
  "Avoiding double-fire"). The real cost is
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
  pattern list in two places (plus its hash pin in code and the identical copy
  in the legacy-kernel fixture), the breaker state file under the consumer's git
  dir, and a security review of `src/judge/**` before the judge leaves
  individual opt-in.
- Compatibility: `docs/COMPATIBILITY.md` "Unreleased" gains one row per
  surface change (contracts §14); release notes name the parity scope (intent
  arms kept on the legacy keys, enforced in CI) and the shim warning.

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
