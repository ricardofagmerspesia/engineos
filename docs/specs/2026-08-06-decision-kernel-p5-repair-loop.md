# Decision Kernel — Phase 5: The Repair Loop

- **Date:** 2026-08-06
- **Status:** Approved (P5 slice of the user-approved "EngineOS Decision Kernel" plan)
- **Risk:** medium — additive versioned surface (one new `kernel.sh` subcommand,
  one new `registries/policy.json` top-level block, both MINOR per
  `docs/COMPATIBILITY.md`; no renames, no deprecation window). Reversible by
  revert. No data touched. Autonomy A2.
- **Depends on:** P1 (`registries/policy.json`, commit `9d718f9`), P2
  (`scripts/kernel.sh`, its `retry` subcommand and exit-code contract), P3
  (validator letters through C18), P4 (C19 — confirmed the last check block in
  `scripts/validate-engineos.sh` during authoring: `grep -n 'C19\|C20'` finds
  C19 at line 640 and no C20).
- **Parent plan:** "EngineOS Decision Kernel" (8 phases). This spec covers
  Phase 5 only. The parent plan's surviving wording for this phase is one line:
  *"repair loop — what happens when a gate or check fails mid-run."* This spec
  keeps the name and **narrows the scope on evidence**: the *gate* half and the
  *agent* half of "something failed mid-run" already have answers in the shipped
  system (shown below); the only failure kind whose policy exists solely as
  unbounded prose is the **check-level fix loop** — a red `lint`/`typecheck`/
  `test`/`build`/startup command during validation. P5 closes that gap and
  nothing else. Same move as P3's rejection of the literal
  `escalate = ambiguous` trigger and P4's rejection of frontmatter.

## Problem

When something fails mid-run, EngineOS today has three different answers of
three different qualities:

1. **A failed agent unit — SOLVED, data-backed.** `rules/parallelism.md`'s
   failure policy is `registries/policy.json.retry`
   (`max_attempts_per_unit: 2`, `escalations: 1`, five `by_situation` entries,
   a `never_retry` list), resolved deterministically by
   `scripts/kernel.sh retry --status <s> --attempt <n> [--situation <sit>]`
   and covered by nine cases in `scripts/test-kernel.sh` (lines 176–204).
   **P5 does not touch this.**

2. **A failed gate — answered, differently shaped.** A gate does not "fail" as
   a command; it is a set of unmet exit criteria. The responses already exist
   as prose with owners: `rules/gates.md` ("DO fail the gate loudly. A gate you
   passed by lowering its bar is worse than no gate"),
   `rules/risk-autonomy.md` ("DO drop autonomy one level when … the same
   approach has already failed once"), and the never-retry human-escalation
   floor in `policy.json.retry.never_retry`. There is no *loop* to bound here —
   you do not re-run a gate, you meet its criteria or you stop. **P5 does not
   invent one.**

3. **A failed check — the gap.** A red validation command has no bounded
   policy anywhere. The evidence, gathered during authoring:

   | Surface | What it says about a red check | Bound |
   |---|---|---|
   | CLAUDE.md `verify-done` row (line 98) | "fix loop until clean before reporting done" | none |
   | `registries/intents.json`, `verify-done` intent's `note` | "a fix loop until clean before reporting done" | none |
   | `rules/gates.md` Validation ladder | four rungs, promote through them | no cap, no escalation, no human exit |
   | `superpowers:verification-before-completion` (external plugin skill) | evidence before assertion | `grep -iE 'loop\|retry\|until\|attempt'` on its SKILL.md: **zero matches** — no bound |
   | `~/.claude/skills/post-spec-verify` (personal skill, outside this repo) | "Repeat until all checks pass — do not … report done until clean" | none |
   | `hooks/stop-verify.sh` | blocks with the failure output | **fires once**: the `stop_hook_active` guard (line 29) exits 0 on the next Stop, so the fix is never re-verified by the hook |
   | `hooks/post-edit-check.sh` | exit 2 with the error so "Claude sees it and fixes it" | re-fires per edit, counts nothing |

   So the entire fix loop after the first red signal is model discipline
   governed by the two words "until clean" — an unbounded promise. This is the
   exact defect class the epic exists to kill, and the repo's own prose already
   states why it is a defect: `rules/parallelism.md`, "An agent retried until
   it succeeds has not succeeded — it has been sampled until it looked right."
   Nothing applies that sentence to checks. A fix loop with no bound also has
   no honest exit: "until clean" cannot end with *red, reported* — which is the
   ending `rules/gates.md` demands ("DO fail the gate loudly") and the
   `status: FAILED` half of the return envelope exists for.

   One more asymmetry, verified: `scripts/kernel.sh` `cmd_gates()` (lines
   182–188) answers only membership — "which gates apply at risk tier X". It
   says nothing about failure. `cmd_retry()` keys on the agent return envelope
   (`OK|DEGRADED|BLOCKED|FAILED`) — a lint command exiting 1 has no envelope,
   no `BLOCKED`, no `DEGRADED`. The existing machinery cannot answer
   "this is fix-attempt 2 for the typecheck — what now" at all.

**P5 in one sentence:** the check-level fix loop gets the same treatment the
agent-level retry got in P1/P2 — a `policy.json` block, a kernel verb, prose
mirrors that carry the bound instead of denying it, and a validator that keeps
all of them in agreement.

## Scope

**In:** one new `policy.json` block (`repair`, 1.2.0 → 1.3.0), one new kernel
subcommand (`kernel.sh repair`), two prose-mirror edits (the CLAUDE.md
`verify-done` row and the `intents.json` `verify-done` note — the two homes of
"until clean"), one bounded-loop sentence wired into `hooks/stop-verify.sh`'s
block message (numbers read from the registry, never hardcoded), validator C20
(four sub-checks) with planted breakage, and behavioral tests. Nine files.

**Out (one line each, per the parent plan's remaining phases):**

- **P6 — spec-conformance:** checking delivered work against its spec; not
  touched.
- **P7 — telemetry:** measuring kernel/router/repair usage; not touched — and
  it is the phase that would justify changing the repair bound's numbers,
  which is exactly why they ship as data.
- **P8 — contradiction cleanup:** the audited prose contradictions; only the
  two "until clean" occurrences are edited here, because they are this phase's
  subject.
- **ai-se-os runner adoption:** the external runner consuming the kernel
  (including `repair`) instead of its hardcoded `ESCALATION_ORDER` /
  `MAX_ATTEMPTS`; a follow-on in that repo, not this one.

Also explicitly out, with reasons:

- **`policy.json.retry` and `kernel.sh retry`** — done, frozen P2 surface,
  byte-identical (same discipline as P3 leaving `route-intent` untouched).
- **Gate-failure machinery** — no loop exists to bound (Problem item 2).
- **`hooks/record-verify.sh`** — its failure is "a change record is missing",
  a debt flag, not a red command; it already has a bounded response (block
  once, offer the defer marker).
- **`hooks/post-edit-check.sh`** — its exit-2 signal is per-edit feedback, not
  a loop manager; the loop it feeds is the same model loop the Stop-gate
  message now bounds. Adding a second bound announcement per edit would be
  noise, not policy.
- **The personal `post-spec-verify` skill and the `superpowers` plugin skill**
  — both live outside this repo (`~/.claude/skills/`, plugin cache) and are
  not this repo's surface; this repo's prose and hooks are what P5 fixes, and
  external skills inherit the bound through the CLAUDE.md row they run under.
- **Executing any fix** — the kernel answers, it never acts (Decision 2).
- **Persisting attempt state** — rejected alternative 4.

### Deliverables

| Unit | Files owned | Content |
|---|---|---|
| U1 | `registries/policy.json`, `scripts/kernel.sh`, `CLAUDE.md`, `registries/intents.json` | The `repair` block, the `repair` subcommand, and both prose mirrors. One unit because C20's mirror checks make these a single atomic change — landing any one alone fails CI |
| U2 | `hooks/stop-verify.sh`, `hooks/test-verify.sh` | The bounded-loop sentence in the block message, sourced from the registry; the test case proving it |
| U3 | `scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh`, `scripts/test-kernel.sh` | C20 checks, planted breakage, kernel behavioral cases (barrier unit, consumes U1–U2) |

C16's intent-count drift alarm is unaffected: U1 edits the `verify-done`
intent's `note` and the matching CLAUDE.md row; it adds neither an intent nor
a row.

---

## Decision 1 — a new `repair` block and verb, not an extension of `retry`

**Decision: check-level repair is its own `policy.json` block and its own
kernel subcommand, structurally parallel to `retry` but not shared with it.**

The tempting alternative — add check situations to `retry.by_situation` and
overload `kernel.sh retry` — fails on the shipped shapes:

- `retry`'s input vocabulary is the **agent return envelope**:
  `OK|DEGRADED|BLOCKED|FAILED` (`cmd_retry` line 216–229). A red lint has no
  envelope. `BLOCKED` ("the input is missing — supply it or drop the unit")
  and `DEGRADED` ("accept, carry the caveat") have no check analog: a
  typecheck is never "degraded", and a check that cannot run is a tooling gap,
  not a missing brief.
- Checks have two situations agents lack: **infra** (the check could not run —
  `stop-verify.sh`'s own comment: "Never blocks on infra quirks — only on
  genuine red"; `post-edit-check.sh`: "a tooling gap, not a code defect") and
  **flaky** (the check flips green on re-run with no diff —
  `rules/testing.md`: "Flaky test = broken test … never retry-until-green").
- `retry` is frozen P2 public surface with consumers (`test-kernel.sh` cases,
  the `rules/parallelism.md` failure-policy table it encodes). Mutating its
  situation set to serve a second failure kind is the silent-contract-change
  `docs/COMPATIBILITY.md` exists to prevent.

The two blocks deliberately share the **bound discipline** — two attempts, one
escalation, then a human — because that is the only evidenced bound in the
repo (`rules/parallelism.md` "Bound the loop"; `rules/models.md` "Escalate one
tier when: an agent failed the same task twice"). They do not share a schema,
because their inputs are different kinds of thing.

## Decision 2 — the kernel answers; it never runs the loop

**Decision: `kernel.sh repair` returns `{action, reason}` for "this is
fix-attempt N for check X"; it never executes a check, never executes a fix.**

`scripts/kernel.sh`'s own header is the contract: "One entry point, JSON out,
no model calls." Every existing verb — including `retry`, the closest sibling
— answers a question and exits. The looping party is the model (or, later, the
ai-se-os runner), which already owns running the checks, reading their output,
and writing the fix. A kernel that shells out to `npm run lint` would need a
package-runner detection layer (`hooks/lib-common.sh`'s `runner_detect`), a
timeout policy, and a working-directory contract — all of which
`stop-verify.sh` already has and the kernel has never had. Answering is the
kernel's whole identity; P5 does not change it.

## Decision 3 — who counts the attempts

**Decision: the caller supplies `--attempt <n>`, exactly as `retry` does.
Nothing writes attempt state to disk.**

The looping party knows N — it is the one looping. This is already how
`retry` works (the orchestrator passes `--attempt`), and the attempt count is
session state by nature: `rules/memory.md`, "Session-only context — nowhere;
let it die with the session." The one hook that touches the loop
(`stop-verify.sh`) does not need N: it fires once per stop cycle by design
(the `stop_hook_active` guard) and its job is to *start* the loop with the
bound stated, not to arbitrate it. See rejected alternatives 4 and 5 for the
disk-counter and hook-enforcement variants and why each fails.

---

## Frozen contract 1 — `registries/policy.json` (1.2.0 → 1.3.0, additive)

New top-level block, after `retry`:

```json
"repair": {
  "note": "Check-level failure policy: what to do when a validation check is red during a fix loop. The agent-unit counterpart is the retry block; both encode the same bound discipline (rules/parallelism.md: two attempts, one escalation, then a human) over different failure kinds — an agent unit reports an envelope status, a check exits nonzero. Read by scripts/kernel.sh repair; hooks/stop-verify.sh reads the numbers for its block message. The numeric agreement with retry is evidence-based, not law: if P7 telemetry ever justifies a different check bound, this block changes and nothing else does.",
  "checks": ["lint", "typecheck", "test", "build", "startup"],
  "max_fix_attempts_per_check": 2,
  "escalations": 1,
  "by_situation": [
    { "situation": "red",   "response": "fix-attempt-ladder" },
    { "situation": "infra", "response": "report-tooling-gap-no-attempt-consumed" },
    { "situation": "flaky", "response": "fix-or-delete-never-rerun-until-green" }
  ],
  "never_repair": [
    "weaken-the-check",
    "behavior-change-required"
  ]
}
```

Field semantics, frozen:

| Field | Semantics | Evidence for the value |
|---|---|---|
| `checks` | Closed enum of check ids `kernel.sh repair` accepts. Unknown id → error (fail-closed, same as `risk`'s unknown-input rule). | The union of what the shipped surfaces actually run: `stop-verify.sh` and `post-edit-check.sh` run `lint`/`typecheck`/`test`; the CLAUDE.md `verify-done` row adds `build` and the "API/Web startup check" (`startup`). |
| `max_fix_attempts_per_check` | Fix attempts at the current tier before escalating. | `rules/parallelism.md` "Two attempts per unit"; `rules/models.md` "failed the same task twice" as the escalation trigger. The only evidenced bound in the repo — see rejected alternative 8 for why no other number. |
| `escalations` | Model-tier escalations before stopping. | `rules/parallelism.md` "one escalation, then a human". |
| `by_situation` | Closed situation vocabulary. `red` = genuine failure, walks the attempt ladder. `infra` = the check could not run (missing tool/script, environment) — reports the gap, consumes no attempt, because editing code cannot fix a missing binary (`post-edit-check.sh`'s probe-the-binary comment is the precedent). `flaky` = green on re-run with no diff — `rules/testing.md`: fix or delete within the week, never retry-until-green; re-running is not an attempt, it is the anti-pattern. | The three situations observed in the shipped hooks and testing rules; agents' `BLOCKED`/`DEGRADED` deliberately have no analog here (Decision 1). |
| `never_repair` | Situations that end the loop immediately, escalating to a human on the FIRST occurrence — same semantics as `retry.never_retry`. `weaken-the-check`: the only available fix is skipping/deleting the failing test, disabling the lint rule, loosening the type config — `rules/gates.md`: "A gate you passed by lowering its bar is worse than no gate." `behavior-change-required`: the fix cannot avoid changing business logic — the fix loop's brief is "make the checks pass without changing what the code does" (the personal skill's own template says "Do not change business logic"; a behavior change re-enters the change through the front door: spec threshold, risk classification, its own validation). | `rules/gates.md`; `rules/risk-autonomy.md`'s never-retry-uncertainty principle. |

No `fixtures` array, deliberately: `repair` is a pure function of two enums
and an integer, composing nothing. `retry` — the structural twin — ships with
zero validator fixtures and full behavioral coverage in `test-kernel.sh`, and
that precedent holds here. (`router.fixtures` earned its place in P3 because
`route-escalate` composes prompt matching over two registries — fragile in a
way a case ladder over enums is not.) One live-canary check remains in C20b.

## Frozen contract 2 — `scripts/kernel.sh repair`

Added to the usage block and the dispatch `case` (after `retry`, its sibling):

```
kernel.sh repair --check <id> --attempt <n> [--situation <sit>] -> {check, action, reason}
```

Resolution order, mirroring `cmd_retry`'s exactly (never-list first, then
situations, then the ladder):

| Input | Action | Reason (one line, in the answer) |
|---|---|---|
| `--situation` in `never_repair` | `never-repair` | "situation <s> is on the never-repair list — a fix that weakens the check or changes behavior is not a fix; escalate to a human on the first occurrence" |
| `--situation infra` | `report-tooling-gap` | "the check could not run — that is a tooling gap, not a code defect; report it, consume no fix attempt (hooks/stop-verify.sh: never block on infra quirks)" |
| `--situation flaky` | `fix-or-delete` | "green on re-run with no diff is a broken test, not a pass — fix or delete within the week, never retry-until-green (rules/testing.md)" |
| default (`red`), attempt ≤ 1 | `fix-same-tier` | "first red — fix and re-run the check at the same tier" |
| default (`red`), attempt = 2 | `escalate-one-tier` | "the same check failed twice — escalate one model tier for the fix and re-run once; that is the last attempt (rules/models.md)" |
| default (`red`), attempt ≥ 3 | `stop-report-red` | "the bound is exhausted — stop, report the check red with what was tried; a loop continued past this point is sampling until it looks right, not fixing (rules/parallelism.md)" |

Argument contract: `--check` is always required and must be in
`policy.json.repair.checks` (unknown → `{"error": ...}`, exit 1 — fail-closed).
`--attempt` is required and numeric on the ladder path (default/`red`), exactly
as `retry --status FAILED` requires it; the three situation paths ignore it.
An unknown `--situation` is an error, not a fallthrough. All bounds and the
never-list are read from the registry at call time — the ladder's breakpoints
are `max_fix_attempts_per_check` and `max_fix_attempts_per_check + escalations`,
never literals. Exit codes and the `{"error": ...}`-on-stdout convention follow
the P2 header contract unchanged.

The header's verb list and the final `case` dispatcher gain the `repair` line;
nothing else in the file is touched.

## Frozen contract 3 — the prose mirrors carry the bound

"Until clean" has exactly two homes in this repo (verified:
`grep -rn 'until clean'` → CLAUDE.md line 98 and the `verify-done` note in
`registries/intents.json`; the worktree copies under `.claude/worktrees/` are
untracked mirrors and not surface). Both are rewritten; C20c keeps the phrase
dead — the same the-prose-stays-dead discipline as P4's C19a.

**CLAUDE.md `verify-done` row**, Load cell — the sentence

> fix loop until clean before reporting done.

becomes, literally:

> a bounded fix loop — 2 fix attempts per check, one model-tier escalation,
> then stop and report red (`registries/policy.json` `repair`;
> `scripts/kernel.sh repair` answers each attempt). Exhausting the bound
> reports red honestly — it never reports done.

The numbers appear in prose deliberately: prose is the human mirror, and P1
already set the precedent of extracting numbers from prose and comparing them
against `policy.json` in CI (cap 6, attempts 2+1). C20c does the same
extraction here, so the row and the registry cannot drift.

**`registries/intents.json`** (1.2.0 → 1.2.1 — prose-only edit inside data,
PATCH): the `verify-done` intent's `note` phrase "with a fix loop until clean
before reporting done" becomes "with a bounded fix loop — attempts, escalation
and the never-repair floors per registries/policy.json repair, answered per
attempt by scripts/kernel.sh repair; exhausting the bound reports red, never
done". Every other field of the intent is unchanged.

## Frozen contract 4 — `hooks/stop-verify.sh` wiring

The Stop gate is the one automated red signal the loop gets (it fires once per
stop cycle — the `stop_hook_active` guard — and never re-verifies the fix), so
its block message is where the bound must be stated: it is the loop's starting
gun. Following the P2 rewiring pattern (`gate-advisor.sh`: data from the
registry, formatting in the hook), the jq branch of the decide step gains a
bound sentence sourced from the registry:

```bash
# ---------- decide ----------
if [ "$FAILED" -eq 1 ]; then
  SUMMARY=$(printf '%s' "$OUT" | sed '/./,$!d' | head -80)
  BOUND=""
  POLICY="$DIR/../registries/policy.json"
  if command -v jq >/dev/null 2>&1 && [ -f "$POLICY" ]; then
    MAXFIX=$(jq -r '.repair.max_fix_attempts_per_check // empty' "$POLICY" 2>/dev/null)
    ESC=$(jq -r '.repair.escalations // empty' "$POLICY" 2>/dev/null)
    [ -n "$MAXFIX" ] && [ -n "$ESC" ] && \
      BOUND=" The fix loop is bounded: ${MAXFIX} fix attempts per check, ${ESC} model-tier escalation, then stop and report red — ask scripts/kernel.sh repair --check <id> --attempt <n> at each step (registries/policy.json repair)."
  fi
  REASON="EngineOS gate: verification failed.${BOUND} ${SUMMARY}"
  ...
```

Frozen properties: the numbers come from the registry at runtime — a literal
attempt count in the hook body is the private-copy defect P2 killed, and C20d
greps against it. The no-jq fallback branch is untouched (it already degrades
to a generic message; a degraded hook stating no bound is honest, a degraded
hook stating a stale hardcoded bound is not). Non-blocking discipline,
`exit 0` always, the loop guard, and every other line of the hook are
untouched — `hooks/test-verify.sh`'s existing cases must pass unchanged, plus
one new case asserting the block reason contains `fix attempts per check` when
jq and the registry are present.

`hooks/record-verify.sh` is not wired: its failure kind is an unrecorded
change, not a red check (Scope).

---

## Validator additions — C20

Appended after the C19 block, inside the same jq-present guard (so `$PJ`-style
registry paths are in scope; C19 confirmed the last existing letter). Checks,
each with its `ok`/`bad` pair in house style:

- **C20a — the repair block is well-formed.** `policy.json.repair` exists;
  `checks` is a non-empty array of unique strings;
  `max_fix_attempts_per_check` is an integer ≥ 1; `escalations` is an integer
  ≥ 0; `by_situation` covers exactly the set {`red`, `infra`, `flaky`} (each
  with a non-empty `response`); `never_repair` is non-empty. Mirrors C16's
  retry-block invariants (`never_retry` non-empty) one letter over.
- **C20b — the ladder is live (behavioral canary).**
  `kernel.sh repair --check lint --attempt $((MAXFIX + ESC + 1))` — the
  breakpoint computed from the registry, never hardcoded — returns
  `action == "stop-report-red"`, and
  `kernel.sh repair --check lint --attempt 1 --situation weaken-the-check`
  returns `action == "never-repair"`. Same self-validating spirit as C17b's
  sample paths: the data and the code that reads it are checked against each
  other, not against a copy.
- **C20c — the prose mirrors agree and the unbounded promise stays dead.**
  (i) `grep -i 'until clean'` finds nothing in CLAUDE.md and nothing in
  `registries/intents.json`. (ii) The CLAUDE.md `verify-done` row (the `|`-row
  containing `kernel.sh repair`) exists, and the number extracted from its
  `<N> fix attempts` phrase equals `policy.json.repair.max_fix_attempts_per_check`
  — the P1 numbers-extracted-from-prose pattern. (iii) The `verify-done`
  intent's `note` contains `kernel.sh repair` (the pointer replaced the
  promise).
- **C20d — the hook carries no private copy.** `hooks/stop-verify.sh` contains
  the jq path literal `.repair.max_fix_attempts_per_check` (it reads the
  registry) and does not match `[0-9]+ fix attempts` as a source literal
  (the number reaches the message only through a variable). Same
  shim-not-copy discipline as C17d.

### Planted breakage (`scripts/test-validate-engineos.sh`)

Seven cases appended after the C19 block, each breaking exactly one invariant,
in the shipped `case_ "desc" "expected-bad-substring" "mutation"` pattern:

| Mutation | Expected failure (check) |
|---|---|
| Delete the `repair` block from `policy.json` (jq/python rewrite) | C20a |
| Set `max_fix_attempts_per_check` to `0` | C20a |
| Empty the `never_repair` array | C20a |
| Drop the `flaky` entry from `by_situation` | C20a |
| `sed` the `stop-report-red` literal in `scripts/kernel.sh` to `stop-report` | C20b |
| Reintroduce "until clean" into the CLAUDE.md `verify-done` row | C20c |
| Replace the hook's registry read with a hardcoded `2 fix attempts` sentence | C20d |

An eighth mirror-number case (row says `5 fix attempts`, registry says 2) is
covered by mutating the CLAUDE.md number instead of the phrase if the sixth
case's `sed` target proves ambiguous during implementation — implementer's
choice, one of the two ships, both may.

## Test surface

### `scripts/test-kernel.sh` (extended — a `-- repair --` section mirroring `-- retry --`)

- `repair --check lint --attempt 1` → `fix-same-tier`, exit 0.
- `repair --check lint --attempt 2` → `escalate-one-tier`.
- `repair --check lint --attempt 3` → `stop-report-red`.
- `repair --check test --situation infra` → `report-tooling-gap`.
- `repair --check test --situation flaky` → `fix-or-delete`.
- `repair --check build --attempt 1 --situation weaken-the-check` →
  `never-repair` (the never-list wins over a live attempt ladder, exactly as
  `never_retry` overrides `FAILED` attempt 1 in the retry cases).
- `repair --check nonsense --attempt 1` → exit 1, `{"error": ...}`.
- `repair --attempt 1` (missing `--check`) → exit 1.
- `repair --check lint` (ladder path, missing `--attempt`) → exit 1.
- `repair --check lint --attempt 1 --situation nonsense` → exit 1.

### `hooks/test-verify.sh` (extended)

- Existing cases green **unchanged** — proof the hook's behavior (loop guard,
  scoping, infra skips, block-on-red) is untouched.
- New: a failing package with jq present → the block `reason` contains
  `fix attempts per check` and `kernel.sh repair`.

### The boundary — stated, not papered over

These tests prove the **answer** (the ladder, the situations, the never-list,
all sourced from data) and the **announcement** (the Stop gate states the
bound). They prove nothing about whether the model *obeys* the bound — whether
it actually stops at attempt 3 and reports red instead of trying a fourth
time. That is model behavior, reachable only by the same two mechanisms P3
named for plan quality: eval golden cases and the `critic` agent. P5 ships
neither, and says so. What P5 guarantees is narrower and real: the policy
exists as data, any consumer can ask it, the one automated red signal states
it, and no prose in this repo promises an unbounded loop anymore.

---

## Rejected alternatives

1. **Extend the `retry` block/subcommand to cover checks** (new
   `by_situation` entries, overload `--status FAILED`). Rejected on the
   shipped shapes: `cmd_retry` keys on the agent return envelope
   (`OK|DEGRADED|BLOCKED|FAILED`, lines 216–229) and a red lint has no
   envelope — `BLOCKED` ("supply the input or drop the unit") and `DEGRADED`
   ("carry the caveat") have no check analog, while `infra` and `flaky` have
   no agent analog. It would also mutate frozen P2 surface with existing
   consumers (`test-kernel.sh` retry cases; the `rules/parallelism.md` table
   it encodes), the silent contract change `docs/COMPATIBILITY.md` forbids.
   P3 left `route-intent` byte-identical for the same reason.

2. **A generic "anything that can fail" abstraction** — one failure-policy
   engine parameterized over failure kinds. Rejected per the rule of three
   (`rules/base.md`, `rules/architecture.md`): exactly two kinds exist (agent
   unit, check), and the third candidate — a failed *gate* — is not a run
   failure at all but an unmet criterion with its own non-loop response
   (Problem item 2). Two parallel blocks that share a discipline but not a
   schema are cheaper than machinery for a third kind that has no evidence of
   ever arriving.

3. **The kernel runs the fix loop itself** (`kernel.sh repair --run "npm
   lint"`, re-executing and counting internally). Rejected against the
   kernel's own header contract — "One entry point, JSON out, no model calls"
   — and against the shipped division of labour: no kernel verb has ever
   executed anything; running checks needs `runner_detect`, timeouts and a
   cwd contract that live in `hooks/lib-common.sh` and `stop-verify.sh`
   today; and writing the fix needs a model, which the kernel by definition
   never calls. The kernel answers attempt N; the model (or the future
   runner) loops.

4. **Persist the attempt counter to disk** (e.g. `.git/ENGINEOS_REPAIR.$SID`
   so hooks could count across invocations). Rejected: the attempt count is
   session state and dies with the loop (`rules/memory.md`: "Session-only
   context — nowhere"); `retry`'s counter is already caller-supplied with no
   disk home, and symmetry matters for anyone learning one API from the
   other. The repo's one disk flag (`ENGINEOS_UNRECORDED.$SID`) is the
   opposite kind of thing — a debt marker that must survive the stop cycle by
   design, with reaping semantics (7 days) to match. A repair counter on disk
   would need the same reaping machinery to avoid a stale counter blocking
   fresh work, for zero benefit: the looping party already knows N.

5. **Make `stop-verify.sh` enforce the loop** — remove the
   `stop_hook_active` guard so the hook re-verifies every stop and blocks
   until green or bound. Rejected: the guard is the documented
   anti-infinite-loop mechanism (both Stop hooks carry it; `record-verify.sh`
   comments "Never loops"), and removing it converts a bounded advisory
   system into a hook that can hold a session hostage on an infra quirk —
   the exact unboundedness this phase exists to kill, relocated into shell.
   It would also require the hook to count attempts, which requires disk
   state (rejection 4). The hook's honest job is one clear red signal with
   the bound attached; arbitration belongs to the party that can read the
   failure and write the fix.

6. **Fix the prose only** — rewrite "until clean" with the bound in
   CLAUDE.md/gates.md and add no registry block or kernel verb. Rejected:
   unenforceable prose is the defect class P3 fixed for suppression and P4
   fixed for handoff sections; a bound that exists only as words cannot be
   asked by a hook (`stop-verify.sh` would hardcode it — the private-copy
   defect), cannot be validated (C20c's number extraction needs a data side
   to compare against), and cannot serve the ai-se-os runner follow-on, whose
   hardcoded `MAX_ATTEMPTS = 3` is P1's motivating contradiction.

7. **A standalone `registries/repair.json`.** Rejected on P4's rejection-8
   precedent, one-to-one: `policy.json` already owns failure policy (the
   `retry` block), the new data is one block of five keys with exactly one
   natural owner, and a new registry costs an envelope, validator plumbing, a
   COMPATIBILITY surface entry, and one more file every consumer must know
   about. The retry/repair adjacency inside one file is itself documentation
   — the two failure kinds sit side by side with their shared discipline
   stated in the `note`.

8. **Different constants for checks** — e.g. 3 or 5 fix attempts, "because a
   fix attempt is cheaper than an agent dispatch". Rejected for lack of any
   evidence: the repo contains exactly one bound, stated twice
   (`rules/parallelism.md` "Two attempts per unit, one escalation, then a
   human"; `rules/models.md` "escalate one tier when an agent failed the same
   task twice"), and no measurement suggesting checks deserve another. A
   second invented constant is a second thing to justify, validate and
   explain forever. The numbers ship as data precisely so that P7 telemetry
   can change them with evidence — the `repair.note` records that the
   agreement with `retry` is empirical, not law, so a future divergence is a
   data edit, not a schema argument.

---

## Verification

Definition of done, every command run with output shown in the change record:

- `jq empty registries/policy.json registries/intents.json` — clean;
  `jq -r '.version' registries/policy.json` prints `1.3.0`;
  `jq -r '.version' registries/intents.json` prints `1.2.1`.
- `bash -n` on `scripts/kernel.sh`, `hooks/stop-verify.sh`,
  `scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh`,
  `scripts/test-kernel.sh`, `hooks/test-verify.sh` — clean.
- `scripts/test-kernel.sh` — green, including the ten new `repair` cases; the
  existing `retry` cases pass **unchanged** (proof the sibling was not
  touched).
- `hooks/test-verify.sh` — green: every existing case unchanged plus the new
  bound-sentence case.
- `hooks/test-route.sh`, `hooks/test-route-advisor.sh`,
  `hooks/test-gate-advisor.sh`, `hooks/test-task-scale.sh` — green
  **unchanged**: P5 touched no other hook.
- `scripts/validate-engineos.sh` — green, visibly including the new C20 `ok`
  lines. Green here also proves both "until clean" occurrences were actually
  removed, since C20c fails on the old prose.
- `scripts/test-validate-engineos.sh` — green with the seven new
  planted-breakage cases, each printing `ok`; total case count grows by
  exactly seven.
- `scripts/run-evals.sh` unaffected (no eval cases change in P5).
- Manual smoke, output shown:
  `scripts/kernel.sh repair --check lint --attempt 3` returns
  `{"check":"lint","action":"stop-report-red",...}`, and a forced-red
  `hooks/test-verify.sh`-style invocation shows a block reason containing
  `The fix loop is bounded: 2 fix attempts per check`.

## Rollback

`git revert` of the P5 commits. `policy.json` returns to 1.2.0 (the `repair`
block disappears), `intents.json` to 1.2.0 (the note regains its old
sentence), `kernel.sh` loses the `repair` verb, the CLAUDE.md row and the
Stop-gate message return to "until clean", and C20 plus its seven cases
disappear together. Nothing else consumes the block or the verb — the hooks'
degraded paths never depended on them — so revert is complete and the pre-P5
(unbounded-prose) behavior is what remains. The surface is purely additive;
no deprecation window is owed under `docs/COMPATIBILITY.md`.
