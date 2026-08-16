# Decision Kernel — Phase 7: Telemetry

- **Date:** 2026-08-06
- **Status:** Approved (P7 slice of the user-approved "EngineOS Decision Kernel" plan)
- **Risk:** medium — additive versioned surface (`registries/policy.json` gains
  one top-level block, MINOR per `docs/COMPATIBILITY.md`; one new script in the
  `exec-journal.sh` mold; three hooks gain a write, but `hooks/hooks.json` and
  every hook's event contract are untouched). Data sensitivity is bounded by
  design: the captured events are ids and booleans only — the schema
  structurally cannot carry prompt text (Decision 4). Reversible by revert.
  Autonomy A2.
- **Depends on:** P1 (`registries/policy.json`, commit `9d718f9`), P2
  (`scripts/kernel.sh`, `hooks/gate-advisor.sh` rewiring), P3
  (`hooks/route-advisor.sh`, `kernel.sh route-escalate`), P5 (`kernel.sh
  repair`, the `repair.note` that names this phase), P6 (validator letters
  through C21 — confirmed the last check block during authoring:
  `grep -n 'C21\|C22' scripts/validate-engineos.sh` finds C21 at line 771 and
  no C22).
- **Parent plan:** "EngineOS Decision Kernel" (8 phases). This spec covers
  Phase 7 only. The parent plan's surviving wording for this phase is one line:
  *"telemetry: measuring kernel/router/repair usage."* This spec keeps the name
  and **narrows the scope on evidence**: the epic's two prior specs left P7 a
  concrete backlog (P5's repair-bound justification, P6's capture of which
  decision rules fired), and investigation shows exactly one honest capture
  point exists for each capturable event — the hooks that already hold the
  kernel's answer — while the repair/retry attempt ladder has **no mediation
  point at all** and is explicitly deferred, not faked (Decision 2). Same move
  as P3's rejection of the literal `escalate = ambiguous` trigger, P4's
  rejection of frontmatter, P5's narrowing to the check-level loop, and P6's
  narrowing to the record.

## Problem

Every kernel answer is computed, injected into one turn's context, and
discarded. The evidence, gathered during authoring:

| Surface | What it does with its answer | What persists |
|---|---|---|
| `scripts/kernel.sh` (all 12 verbs) | JSON on stdout, exit code. `grep -c '>>' scripts/kernel.sh` → 0 appends; no `date` call, no file write anywhere in the script | Nothing |
| `hooks/route-advisor.sh` | computes `route-escalate` per prompt, emits one `additionalContext` line, exits | Nothing |
| `hooks/gate-advisor.sh` | computes `decision-rules` per prompt, emits matched requirements, exits | Nothing |
| `hooks/task-scale-advisor.sh` | computes `scale` per prompt, emits reminders, exits | Nothing |
| `hooks/route-before-change.sh` | computes `route-path` per edit, emits guidance, exits | Nothing |
| `hooks/stop-verify.sh` | runs scoped lint/typecheck/test, blocks on red with the P5 bound sentence, exits | Nothing |
| `hooks/mark-unrecorded.sh` | the repo's ONLY hook-side persistent write: `: > "$GITDIR/ENGINEOS_UNRECORDED.$SID"` — a content-free debt flag in `.git/`, session-scoped, reaped after 7 days by `ensure-project-layout.sh` | A flag, no event data |

Two artifacts that look like telemetry already exist, and neither is:

1. **`scripts/exec-journal.sh`** (2026-08-05, pre-epic) is a JSONL
   **schema contract with no writer**: per-capability-dispatch records
   (`run_id`, `capability_id`, `agent`, `model_tier`, `status`, tokens,
   duration) designed for the ai-se-os headless runner. Its own header says
   so: "This is a schema contract, not a running service: EngineOS itself has
   no agent-dispatch loop to instrument." Verified: nothing in `hooks/`,
   `scripts/`, `agents/`, `commands/` or `skills/` calls
   `exec-journal.sh append` outside its own test file.
2. **`scripts/usage-report.sh`** is a **reader with no reliable source**: it
   greps `$HOME/.claude/projects/*.jsonl` session transcripts for `[router]
   intent=` announce lines, skill-invocation strings, and `EngineOS gate`
   block counts — and its own output admits the fragility ("none found —
   router not announcing?"). Its stated purpose is real and quarterly:
   "prune rules/skills with zero hits."

And the two prior phases named what this phase owes them:

- **P5** (`policy.json.repair.note`, verbatim): "The numeric agreement with
  retry is evidence-based, not law: if P7 telemetry ever justifies a different
  check bound, this block changes and nothing else does."
- **P6** (Decision 1 finding 2, rejected alternative 8): "checking that a
  delivered change produced the artifact a decision rule required requires
  knowing which rules matched the work at the time, **and nothing records
  that**… inventing [a `requirements:` field] now would be capture machinery
  with no reader — P7 telemetry's subject." C21 could therefore check only the
  three requirements the record structurally carries (`spec:`,
  `## Verification`, the record itself); `adr`, `threat-model`,
  `compatibility-plan` and the rest of `decision-rules.json`'s `require`
  vocabulary are post-hoc unverifiable for lack of this capture.

**P7 in one sentence:** the hooks that already hold a kernel answer append it —
ids and outcomes only, never prompt text — as one JSONL line per event to a
session-scoped file under `.git/`, with the schema, the event vocabulary, and
the retention policy as registry data, and with both of the repo's existing
mining tools (`retro`, `usage-report.sh`) wired to read it.

## What P7 delivers against the named backlog — and what it defers

Stated up front because the two deferrals from P5/P6 are this phase's charter,
and only one of them is fully deliverable here:

1. **P6's capture half ships in full.** `hooks/gate-advisor.sh` is the one
   place in the system where "which decision rules fired" exists as a computed
   fact (the keyword tier — `kernel.sh decision-rules` output, in the hook's
   `$RESULT` variable). P7 persists it. **The check half is a named follow-on,
   and structurally cannot be a CI check over telemetry:** the events live in
   `.git/` on the developer's machine (Decision 3), and a CI clone has no
   session data — so the future reader is session-side, at `record-change`
   time (the skill mining the session's own fired rules into the record's
   frontmatter), after which a C21 successor can validate the record's named
   artifacts in CI. That pipeline is: capture (P7, this spec) → record field +
   skill mining (follow-on) → CI check (follow-on). Building stages 2–3 now
   would also be premature for a second reason: they check data that needs to
   exist for a while first.
2. **P5's repair-bound justification is deferred with its reason named.**
   `kernel.sh repair` and `kernel.sh retry` are invoked by the model through
   the Bash tool mid-loop — **no hook mediates those calls**, and the only
   party that could log them is the kernel itself, which stays pure
   (Decision 1). What P7 does capture is the loop's *starting gun*: a `verify`
   event from `hooks/stop-verify.sh` (red or green, which targets), which is
   the honest mechanical proxy for "how often does a fix loop begin". The
   attempt-level outcome data the bound question actually needs already has a
   designed home — `scripts/exec-journal.sh`'s `status` field — whose writer
   is the ai-se-os runner follow-on. The repair/retry numbers get revisited on
   that data, not manufactured here.
3. **The keyword-tier boundary is stated, not papered over.** Decision rules
   with no `signals` array (`rule-change-record`, `rule-high-risk-critic`) are
   model-only by design, and rules whose conditions the prompt cannot reveal
   (`files_changed`, `affects_public_contract`) are applied by the model per
   `rules/gates.md`. Model-side rule application happens in reasoning, not in
   any process this repo controls — it is capturable only by self-report,
   which is the record-side follow-on above, at the record's existing trust
   level. P7's telemetry captures what fired *mechanically*; it never claims
   to capture what the model applied.

## Scope

**In:** one new `policy.json` block (`telemetry`, 1.3.0 → 1.4.0), one new
writer/validator CLI (`scripts/telemetry.sh`, the `exec-journal.sh` mold) with
its own test file, three hook writes (`route-advisor.sh`, `gate-advisor.sh`,
`stop-verify.sh`) with their test extensions, the retention reaper in
`ensure-project-layout.sh`, two reader wirings (`skills/retro/SKILL.md`,
`scripts/usage-report.sh`), validator C22 (three sub-checks) with planted
breakage. Fourteen files (this spec is the fifteenth).

**Out (one line each, per the parent plan's remaining phase and follow-ons):**

- **P8 — contradiction cleanup:** the audited prose contradictions; not
  touched.
- **ai-se-os runner adoption:** the external runner consuming the kernel and
  writing `exec-journal.sh` lines (the attempt-level data P5's bound question
  needs); a follow-on in that repo, not this one.
- **The conformance reader** (record-change mining the session's fired rules
  into the record, and the C21-successor check over the resulting field):
  named follow-on per item 1 above — it needs P7's data to exist first.

Also explicitly out, with reasons:

- **`scripts/kernel.sh`** — no change, Decision 1. Stated so nobody
  "completes" it later.
- **`registries/intents.json` and `CLAUDE.md`** — untouched. Telemetry is not
  a routable intent and gets no router row; C16's intent-count drift alarm is
  trivially unaffected. (P6 was the first phase not to touch CLAUDE.md; P7 is
  the first to touch neither.)
- **`hooks/hooks.json`** — untouched: no new hook, no new event. The writes
  ride inside three hooks that already run.
- **`hooks/task-scale-advisor.sh`** — not wired: its `scale` answer is already
  embedded verbatim in `route-escalate`'s output (`.scale`), which the `route`
  event carries. A second event would be the same fact in two homes
  (`rules/memory.md`).
- **`hooks/route-before-change.sh`** — not wired: rejected alternative 7.
- **`scripts/exec-journal.sh`** — untouched, byte-identical: rejected
  alternative 5.
- **Capturing `repair`/`retry` calls** — impossible without breaking kernel
  purity or inventing disk counters P5 already rejected; deferred per item 2
  above and rejected alternative 8.

### Deliverables

| Unit | Files owned | Content |
|---|---|---|
| U1 | `registries/policy.json`, `scripts/telemetry.sh`, `scripts/test-telemetry.sh` | The `telemetry` block (events, samples, value pattern, retention), the writer/validator CLI, its behavioral proof |
| U2 | `hooks/route-advisor.sh`, `hooks/gate-advisor.sh`, `hooks/stop-verify.sh`, `hooks/test-route-advisor.sh`, `hooks/test-gate-advisor.sh`, `hooks/test-verify.sh`, `hooks/ensure-project-layout.sh` | The three event writes (each gated, each `|| true`), the retention reaper, the test cases proving write/no-write behavior |
| U3 | `skills/retro/SKILL.md`, `scripts/usage-report.sh` | The two readers wired: one bullet in retro's gather step; a telemetry-backed section in the usage report |
| U4 | `scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh` | C22 checks + eight planted-breakage cases (barrier unit, consumes U1–U3) |

U2 depends on U1 (the hooks call `telemetry.sh`); U3 is independent of U2;
U4 is the barrier.

---

## Decision 1 — the kernel stays pure; hooks own the capture

**`scripts/kernel.sh` gains no logging, no side effect, no subcommand.** Three
reasons, all from shipped code rather than taste:

1. **The kernel cannot tell a session apart from a test.** `test-kernel.sh`
   invokes it 153 times per run; `validate-engineos.sh`'s behavioral canaries
   (C17b sample paths, C18e router fixtures, C20b repair ladder) invoke it on
   every CI run. An in-kernel append would fill the telemetry with test and CI
   noise, or require an opt-in environment gate — and the kernel's real
   session-time callers include the model via the Bash tool, whose environment
   no hook controls, so the gate would silently exclude exactly the calls
   worth counting. The parties that DO know they are in a session are the
   hooks: they receive `session_id` and `cwd` on stdin, on every event, by
   contract (`mark-unrecorded.sh` and `record-verify.sh` already consume
   both).
2. **Purity is the shipped contract.** The header — "One entry point, JSON
   out, no model calls" — plus five specs of practice: no kernel verb has ever
   written a file, and P5's Decision 2 restated it ("the kernel answers, it
   never acts"). P2's division of labour is the operative rule here in its
   original form: matching lives in the kernel, everything with side effects
   stays in the hook.
3. **The hooks already hold the answer.** `route-advisor.sh` has
   `route-escalate`'s full JSON in `$RESULT`; `gate-advisor.sh` has
   `decision-rules`'s. Capture is a `jq -c` projection and one append — no
   second kernel call, no re-derivation.

## Decision 2 — three events, each with a named, already-existing consumer

The event vocabulary is exactly the set for which both a capture point and a
consumer exist today. Nothing speculative ships:

| Event | Written by | Payload (ids and booleans only) | Named consumer |
|---|---|---|---|
| `route` | `hooks/route-advisor.sh`, once per prompt (including zero-match — the denominator) | `escalate`, `reasons[]`, `intents[]`, `suppressed[]` (ids), `agents[]` | `scripts/usage-report.sh`'s stated prune purpose ("which intents/skills actually fire… prune rules/skills with zero hits"), today served by a fragile transcript grep for `[router] intent=`; `retro` step 1 |
| `decision-rules` | `hooks/gate-advisor.sh`, only when ≥1 rule matched | `rules[]` (ids), `any_high` | P6's deferred capture (the load-bearing consumer — item 1 above); `retro` step 1 |
| `verify` | `hooks/stop-verify.sh`, when verification actually ran | `failed`, `targets[]` (package dirs relative to the repo root) | `usage-report.sh`'s existing "Hook gate hits (stop-verify blocks)" section, today a transcript grep for `EngineOS gate`; the honest proxy for P5's "how often does a fix loop start" |

Not captured, each stated so nobody "completes" it: `route-path` per-edit
events (rejected alternative 7 — no consumer, highest volume), `scale` as its
own event (embedded in `route`), `repair`/`retry` calls (no mediation point —
rejected alternative 8), and free text of any kind (Decision 4).

**Zero-match `route` events are logged deliberately.** "Intent X never fires"
is only computable against a denominator of prompts that fired nothing; a
match-only log cannot distinguish an unused intent from an unused system.
`decision-rules` does NOT log zero-match: its denominator is the `route`
event stream (one per prompt), so a second empty line per prompt would be the
same fact twice.

## Decision 3 — the data lives in `.git/`, session-scoped, reaped by policy

**Home: `$GITDIR/engineos-telemetry/<session_id>.jsonl`**, resolved via
`lib-common.sh`'s `git_dir` (worktree-safe), in the **consumer project's**
repository — EngineOS is a plugin; the hooks run wherever the session runs,
and the events belong to the project the session worked on, exactly like its
change records do.

- **`.git/`, not the worktree.** The repo's only existing hook-written state
  (`ENGINEOS_UNRECORDED.$SID`) lives in `$GITDIR` precisely so it can never
  dirty a diff, never land in a commit, and never cross a worktree boundary.
  Telemetry is volatile machine-local data — `rules/memory.md`: volatile facts
  rot in any versioned home — and `.git/` makes "never committed" a structural
  property instead of a `.gitignore` entry this repo cannot write into its
  consumers. A subdirectory rather than flat `ENGINEOS_TELEMETRY.$SID` files
  because this is a growing class of files (one per session, retained for a
  quarter — the flag precedent is a single ephemeral marker), and readers
  glob one directory.
- **Per-session files, not one growing log.** Retention becomes the same
  `find -mtime` reap the flag files already use; and the future conformance
  reader (item 1) needs "this session's fired rules", which a per-session file
  answers with zero parsing of other sessions.
- **Opt-in mirrors the scaffolder.** A write happens only when the project has
  adopted EngineOS (`.engineos/` exists at the repo root — the exact gate
  `ensure-project-layout.sh` uses) and `ENGINEOS_TELEMETRY` is not `0` (the
  kill switch, mirroring `ENGINEOS_SCAFFOLD=0`). Unrelated clones get nothing.
- **Retention is registry data** (`rules/data.md`: "DO define retention and
  deletion for every data class" — a repo-local JSONL is a data class).
  `retention_days: 90`: `usage-report.sh`'s own header says "run quarterly"
  with a 30-day default window; one quarter covers both existing readers'
  cadence, and the number lives in `policy.json` so changing it is a data
  edit. The reaper rides in `ensure-project-layout.sh` next to the existing
  7-day flag reaper, reading the number from the registry at runtime — a
  hardcoded `-mtime +90` would be the private-copy defect C17d/C20d exist to
  kill, and C22c greps against it.
- **Scale check, so the policy is sized to reality:** at most 2 events per
  prompt (`route` always, `decision-rules` on match) plus ≤1 `verify` per stop
  cycle, ~150–250 bytes per line. A heavy day (200 prompts) writes under
  100 KB; a full 90-day retention window worst-cases around 5–8 MB per repo.
  Bounded, local, and reaped.

## Decision 4 — ids and outcomes only; prompt text is structurally impossible

`rules/security.md` (PII never in logs) and `rules/context.md` (never carry
secrets into anything logged or summarized) bound this phase hard. The prompt
text passes through the hooks today — stdin JSON → `--prompt` argv → discarded
with the process — and nothing this repo writes persists it. (Claude Code's own
transcripts under `$HOME/.claude/projects/` already persist full prompt text
for the human who owns the machine; duplicating that into a second store this
repo controls would add risk and no capability — `usage-report.sh` proves the
transcripts are already minable when text is genuinely needed.)

P7 keeps that property by **schema, not by discipline**:

1. Every event's payload keys are a closed set in the registry; unknown keys
   are an append-time error.
2. Payload values may be booleans, numbers, or strings/arrays-of-strings whose
   every string matches `policy.json.telemetry.value_pattern` — an ERE with
   **no whitespace class** (`^[A-Za-z0-9@_./:-]+$`). Intent ids, rule ids,
   reason ids, agent names, and relative package paths all pass; no natural
   sentence, prompt fragment, or secret-with-spaces can. Nested objects are
   rejected (no blob smuggling).
3. `scripts/telemetry.sh` enforces 1–2 on every `append` and re-checks them on
   `validate`; C22b proves both rejections fire; C22c additionally greps that
   no hook's append invocation references `$PROMPT` or `$INPUT`.

## Decision 5 — a dedicated writer CLI, deliberately parallel to `exec-journal.sh`

The schema needs one home. Three hooks writing hand-built `jq -nc` lines would
be three private copies of it — the exact drift P2 killed for routing patterns.
`scripts/telemetry.sh` is that home, in the proven `exec-journal.sh` mold
(append + validate verbs, jq required as a hard error, `--arg` escaping for
every value, a timestamp default with an override):

- **Timestamps:** `date -u +%Y-%m-%dT%H:%M:%SZ` by default, `--ts <iso8601>`
  override. This is `exec-journal.sh` line 99's exact precedent — the repo
  does NOT avoid timestamp *generation*; C21's string-compare avoided the
  `date` binary only for date *arithmetic* portability across the BSD/GNU
  split. The override exists so tests are deterministic, same as
  `--timestamp` on the sibling.
- **Not merged with `exec-journal.sh`:** rejected alternative 5.
- **Registry-driven, fail-closed:** the event enum, per-event key sets, and
  `value_pattern` are read from `policy.json.telemetry` at call time. An
  unknown event, an unknown key, or a value failing the pattern is
  `{"error": …}` on stdout, exit 1 — the kernel's own error convention, and
  the same fail-closed posture as `risk`'s unknown-input rule.

---

## Frozen contract 1 — `registries/policy.json` (1.3.0 → 1.4.0, additive)

New top-level block, after `repair`:

```json
"telemetry": {
  "note": "Kernel-decision event capture: which routes, decision rules and verifications actually fired, as ids and outcomes only — never prompt text (value_pattern has no whitespace class; scripts/telemetry.sh rejects on append and validate). Written by hooks/route-advisor.sh, hooks/gate-advisor.sh and hooks/stop-verify.sh to $GITDIR/engineos-telemetry/<session_id>.jsonl in the consumer project, only where .engineos/ exists (the scaffolder's own opt-in gate) and ENGINEOS_TELEMETRY is not 0. Read by skills/retro (step 1) and scripts/usage-report.sh; reaped by hooks/ensure-project-layout.sh after retention_days. Events live in .git and never reach CI — validate-engineos.sh C22 checks this policy and the plumbing, never the data. The samples are asserted by C22b against the running telemetry.sh, the self-validating-registry pattern of routing.json's sample_path and router.fixtures. Attempt-level repair/retry outcomes are deliberately absent: no hook mediates those model-invoked kernel calls, and their designed home is the exec-journal schema, written by the ai-se-os runner follow-on.",
  "home": ".git/engineos-telemetry/<session_id>.jsonl",
  "retention_days": 90,
  "value_pattern": "^[A-Za-z0-9@_./:-]+$",
  "events": [
    {
      "id": "route",
      "written_by": "hooks/route-advisor.sh",
      "keys": ["escalate", "reasons", "intents", "suppressed", "agents"],
      "sample": {"escalate": true, "reasons": ["multi-agent-dispatch"], "intents": ["backend", "mobile"], "suppressed": ["new-feature"], "agents": ["backend-coordinator", "mobile-coordinator"]}
    },
    {
      "id": "decision-rules",
      "written_by": "hooks/gate-advisor.sh",
      "keys": ["rules", "any_high"],
      "sample": {"rules": ["rule-spec-threshold", "rule-verification"], "any_high": false}
    },
    {
      "id": "verify",
      "written_by": "hooks/stop-verify.sh",
      "keys": ["failed", "targets"],
      "sample": {"failed": true, "targets": ["apps/api"]}
    }
  ]
}
```

Field semantics, frozen:

| Field | Semantics | Evidence for the value |
|---|---|---|
| `home` | Documentation of the path convention (the hooks compute it from `git_dir` + stdin `session_id`; nothing parses this string at runtime). | `.git/` home: the `ENGINEOS_UNRECORDED.$SID` precedent (Decision 3). |
| `retention_days` | Age in days past which `ensure-project-layout.sh` deletes a session file. Integer ≥ 1, read via jq at reap time, never hardcoded. | `usage-report.sh`: quarterly cadence, 30-day default window — 90 covers both readers. |
| `value_pattern` | ERE every string value in every event payload must match, at append and at validate. The anti-prompt-text guard (Decision 4). | `rules/security.md` / `rules/context.md`; every legitimate value (intent/rule/reason/agent ids, relative paths) is whitespace-free by construction. |
| `events[].keys` | Closed payload vocabulary per event. Unknown key → append error (fail-closed). | The three hooks' actual `$RESULT` projections; nothing else has a consumer. |
| `events[].sample` | A conforming payload, asserted round-trip by C22b and `test-telemetry.sh`. | Self-validating registry: C17b `sample_path`, C18e `router.fixtures` precedent. |
| `events[].written_by` | The one hook that owns the event — documentation plus C22c's wiring grep target. | One writer per event; two hooks writing one event would be the drift pair. |

## Frozen contract 2 — `scripts/telemetry.sh`

```
scripts/telemetry.sh append <file> --session <sid> --event <id> --data <json> [--ts <iso8601>]
scripts/telemetry.sh validate <file>
```

- jq required — hard error, exit 1 (`exec-journal.sh` precedent; this CLI is
  called on purpose, and the hooks check jq before calling it).
- `append` validates before writing: `--event` must be an id in
  `policy.json.telemetry.events`; `--data` must be a flat JSON object whose
  keys are a subset of that event's `keys`, whose values are booleans, numbers,
  strings matching `value_pattern`, or arrays of such strings — nested objects
  and arrays-of-non-strings are errors. On pass, exactly one line is appended:

  ```json
  {"ts":"2026-08-06T14:00:00Z","session_id":"<sid>","event":"route","data":{...}}
  ```

  Values reach the line through `jq --arg`/`--argjson`, never hand-built
  string interpolation (the sibling's own escaping rule).
- `--ts` defaults to `date -u +%Y-%m-%dT%H:%M:%SZ`; the override exists for
  deterministic tests, exactly like `--timestamp` on `exec-journal.sh`.
- `validate <file>` re-checks every line against the same rules (ts and
  session_id are non-empty strings; event in the enum; data obeys keys +
  `value_pattern`), reporting each bad line number and exiting 1 on any — the
  sibling's loop, including its no-trailing-newline `|| [ -n "$line" ]` guard.
- Errors are `{"error": "..."}` on stdout, exit 1 — the kernel's P2 convention,
  so callers parse one stream.

## Frozen contract 3 — the hook writes

All three writes share one frozen discipline: **the write is best-effort and
can never change hook behavior.** Every step is `2>/dev/null` with a final
`|| true`; a missing `telemetry.sh`, an unwritable `.git`, or a malformed
registry silently skips the write and the hook's existing output and exit code
are byte-identical to today. The gate, identical in all three:

```bash
# telemetry (best-effort, never affects hook behavior)
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"' 2>/dev/null)
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
if [ "${ENGINEOS_TELEMETRY:-}" != "0" ] && [ -n "$CWD" ]; then
  if TROOT=$(repo_root "$CWD") && [ -d "$TROOT/.engineos" ] && TGIT=$(git_dir "$CWD") && [ -n "$TGIT" ]; then
    mkdir -p "$TGIT/engineos-telemetry" 2>/dev/null || true
    "$DIR/../scripts/telemetry.sh" append "$TGIT/engineos-telemetry/$SID.jsonl" \
      --session "$SID" --event <id> --data "$TDATA" >/dev/null 2>&1 || true
  fi
fi
```

`route-advisor.sh` and `gate-advisor.sh` do not currently source
`lib-common.sh`; they gain the source line (for `repo_root`/`git_dir`) —
`route-before-change.sh` and `mark-unrecorded.sh` set the precedent.

Per hook, frozen:

1. **`hooks/route-advisor.sh`** — the write goes immediately after `$RESULT`
   is validated as JSON and **before** the zero-match early exit (line 31),
   because zero-match prompts are the denominator (Decision 2):

   ```bash
   TDATA=$(printf '%s' "$RESULT" | jq -c \
     '{escalate: (.escalate // false), reasons, intents,
       suppressed: [.suppressed[]?.id], agents}' 2>/dev/null)
   ```

2. **`hooks/gate-advisor.sh`** — the write goes after the `MATCH_COUNT` check
   (line 28), so only real matches log:

   ```bash
   TDATA=$(printf '%s' "$RESULT" | jq -c \
     '{rules: [.matches[].id], any_high: (.any_high // false)}' 2>/dev/null)
   ```

3. **`hooks/stop-verify.sh`** — the write goes in the decide step, jq branch
   only (telemetry.sh needs jq anyway; the no-jq degraded path stays
   untouched, same as P5 left it), after `$FAILED` is final and regardless of
   red or green — a green verify is half the base-rate `usage-report.sh`'s
   block count has always lacked. The hook gains `SID` extraction in its jq
   branch (`record-verify.sh` line 23's exact expression). Targets are the
   package dirs relative to the repo root:

   ```bash
   TDATA=$(printf '%s\n' "$PKG_LIST" | grep -v '^$' \
     | sed "s|^$ROOT/||; s|^$ROOT\$|.|" \
     | jq -R . | jq -cs --argjson f "$([ "$FAILED" -eq 1 ] && echo true || echo false)" \
       '{failed: $f, targets: .}')
   ```

   The write happens on the pre-block pass only — the `stop_hook_active` guard
   already exits before this point on the second pass, so one stop cycle logs
   one `verify` event, never two.

## Frozen contract 4 — the reaper and the readers

**`hooks/ensure-project-layout.sh`** — immediately after the existing
`ENGINEOS_UNRECORDED` reap (line 33), same shape, number from the registry:

```bash
if command -v jq >/dev/null 2>&1 && [ -n "$GITDIR" ] && [ -d "$GITDIR/engineos-telemetry" ]; then
  RET=$(jq -r '.telemetry.retention_days // empty' "$REPO_DIR/registries/policy.json" 2>/dev/null)
  case "$RET" in ''|*[!0-9]*) : ;; *)
    find "$GITDIR/engineos-telemetry" -maxdepth 1 -name '*.jsonl' -mtime "+$RET" -exec rm -f {} + 2>/dev/null || true ;;
  esac
fi
```

No jq → no reap this session (honest degradation: files persist until a
jq-present session, never a stale hardcoded window). The reap runs before the
engineos-repo skip and the opt-in gate, like the flag reap it sits beside.

**`skills/retro/SKILL.md`** — one bullet appended to step 1's existing "Also
gather, when the repo has them" list:

```markdown
- kernel telemetry: `.git/engineos-telemetry/*.jsonl` (route, decision-rules
  and verify events — ids and outcomes per session; see
  `registries/policy.json` telemetry). Intents and rules that never fire are
  prune evidence; repeated `verify failed` on the same target is a pattern
  candidate.
```

**`scripts/usage-report.sh`** — a new section that reads the **current repo's**
telemetry when present (the transcript sections stay — they cover other
projects and older sessions):

```bash
echo ""
echo "## Kernel telemetry (this repo, .git/engineos-telemetry)"
TDIR=$(git rev-parse --absolute-git-dir 2>/dev/null)/engineos-telemetry
if [ -d "$TDIR" ] && command -v jq >/dev/null 2>&1; then
  find "$TDIR" -name '*.jsonl' -mtime "-$DAYS" -exec cat {} + 2>/dev/null | jq -rs '
    "prompts routed: \([.[] | select(.event=="route")] | length) (\([.[] | select(.event=="route" and (.data.intents|length)==0)] | length) unrouted, \([.[] | select(.event=="route" and .data.escalate)] | length) escalated)",
    "intents fired:", ([.[] | select(.event=="route") | .data.intents[]] | group_by(.) | map("  \(length)  \(.[0])") | .[]),
    "decision rules fired:", ([.[] | select(.event=="decision-rules") | .data.rules[]] | group_by(.) | map("  \(length)  \(.[0])") | .[]),
    "verify runs: \([.[] | select(.event=="verify")] | length) (\([.[] | select(.event=="verify" and .data.failed)] | length) red)"'
else
  echo "(none — telemetry not adopted here, or jq missing)"
fi
```

---

## Validator additions — C22

Appended after the C21 block, inside the same jq-present guard (C21 confirmed
the last existing letter). **C22 validates the policy and the plumbing, never
the event data** — the data lives in `.git/` on developer machines and a CI
clone has none by construction; a check that pretended otherwise would be
green against an absence forever. Sub-checks, house style:

- **C22a — the telemetry block is well-formed.** `policy.json.telemetry`
  exists; `retention_days` is an integer ≥ 1; `value_pattern` is present and a
  valid ERE (the `printf x | grep -qE` probe, C21a's exact pattern); `events`
  is non-empty with unique ids; every event has a non-empty `keys` array, a
  `written_by` naming an existing hook file, and a `sample` object whose keys
  are a subset of `keys`.
- **C22b — the writer is live (behavioral canary).** For every registry event,
  `telemetry.sh append` its `sample` into a `mktemp` file with a fixed `--ts`,
  then `telemetry.sh validate` passes — the data and the code that reads it
  checked against each other, not against a copy (C17b/C20b spirit). Then two
  rejections must fire, each exit 1 with an `error` body: an unknown event id,
  and a `route` payload whose `intents` contains a two-word string (the
  whitespace guard — the privacy invariant proven live, not asserted).
- **C22c — wiring, no private copies, no prompt text.** (i) Each of the three
  `written_by` hooks contains `telemetry.sh` and the literal `--event <its
  id>`; each hook's append invocation lines (the lines matching
  `telemetry.sh append`… through the `--data` argument construction) reference
  neither `$PROMPT` nor `"$INPUT"` as a data source. (ii)
  `ensure-project-layout.sh` contains the jq path literal
  `.telemetry.retention_days` and does not match `-mtime "\?+[0-9]` as a
  telemetry-reap literal (the number reaches `find` only through a variable —
  C20d's shim-not-copy discipline). (iii) `skills/retro/SKILL.md` and
  `scripts/usage-report.sh` both contain `engineos-telemetry` (mirror
  containment, C19c leniency — the readers cannot silently forget the source
  exists).

### Planted breakage (`scripts/test-validate-engineos.sh`)

Eight cases appended after the C21 block, each breaking exactly one invariant,
in the shipped `case_ "desc" "expected-bad-substring" "mutation"` pattern:

| # | Mutation | Expected failure (check) |
|---|---|---|
| 1 | python: delete the `telemetry` block from `policy.json` | C22a |
| 2 | python: set `retention_days` to `0` | C22a |
| 3 | python: set `value_pattern` to `(` (invalid ERE) | C22a |
| 4 | python: empty the `route` event's `keys` array | C22a |
| 5 | python: put `"two words"` into the `decision-rules` sample's `rules` | C22b (the canary append rejects its own registry sample) |
| 6 | `sed` the `telemetry.sh` call out of `hooks/gate-advisor.sh` | C22c |
| 7 | `sed` route-advisor's `--data "$TDATA"` to `--data "$PROMPT"` | C22c |
| 8 | `sed` ensure-project-layout's `"+$RET"` to `+90` | C22c |

The `sed` targets are single-occurrence in the post-U2 files by construction
(each hook calls `telemetry.sh` exactly once; `"+$RET"` appears exactly once);
the harness's copy-and-`.bak`-restore mechanism covers hook files already
(P3's route-advisor cases).

## Test surface

### `scripts/test-telemetry.sh` (new, the `test-exec-journal.sh` mold)

- Append each registry event's `sample` with `--ts 2026-08-06T00:00:00Z` →
  exit 0, file gains exactly one line, `validate` passes, the line's `ts`
  equals the override (determinism proven).
- Rejections, each exit 1 with an `error` body: unknown `--event`; a data key
  not in the event's `keys`; a string value containing a space; an
  array-of-strings with one whitespace value; a nested object as a value;
  `--data` that is not JSON; a flag with no value following (the sibling's
  `set -u` regression case).
- `validate` catches a hand-corrupted line (bad event id) with its line
  number; a final line without a trailing newline is still read (the
  sibling's EOF guard case).
- Missing jq (`PATH` stripped) → hard error exit 1, matching the sibling.

### Hook test extensions (`hooks/test-route-advisor.sh`, `test-gate-advisor.sh`, `test-verify.sh`)

Each gains write/no-write cases against a scratch git repo the existing
harnesses already construct or can construct with `git init`:

- Adopted repo (`.engineos/` present), event-producing stdin → the session
  file exists under `<gitdir>/engineos-telemetry/`, contains exactly one line
  whose `event` is the hook's own, and `telemetry.sh validate` passes on it;
  the hook's stdout and exit code are unchanged from the pre-P7 assertion.
- `ENGINEOS_TELEMETRY=0` → no file written; stdout unchanged.
- Non-adopted repo (no `.engineos/`) → no file written.
- route-advisor only: a zero-match, no-scale prompt still writes a `route`
  line with empty `intents` (the denominator case) while producing NO
  `additionalContext` — the write happens before the silent exit.
- stop-verify only: a green run (checks pass) writes `failed: false`; the
  existing red-path case additionally asserts `failed: true`; the
  `stop_hook_active` re-entry case asserts no second line.

### The boundary — stated, not papered over

These tests prove the **schema** (closed events, closed keys, the whitespace
guard), the **plumbing** (three hooks write, gates and kill switch honored,
hook behavior byte-stable), and the **lifecycle** (reap by registry number).
They prove **nothing about the data's future interpretations**: whether 90
days of `verify` events actually justifies changing `repair`'s bound, whether
the fired-rules capture leads to a conformance check worth having — those are
questions for the readers once data exists, which is the correct order
(capture must precede the study; the study was never this phase's claim). And
per Decision 2's boundary, the `decision-rules` events are the keyword tier
only; what the model applied from the full registry remains self-reported
territory. What P7 guarantees is narrower and real: the kernel's decisions
stop evaporating, the two tools that already mine this repo get a reliable
source, no prompt text can enter the store, and the store cannot grow without
bound.

---

## Rejected alternatives

1. **The kernel logs its own calls** (an append inside `kernel.sh`, catching
   every verb including model-invoked `repair`/`retry`). Rejected on shipped
   evidence: the kernel cannot distinguish a session call from
   `test-kernel.sh`'s 153 per-run invocations or the validator's C17b/C18e/
   C20b canaries on every CI run — the log would be mostly test noise; an
   environment gate cannot fix it because the model's Bash-tool calls carry no
   hook-controlled environment, so the gate would drop exactly the calls worth
   counting; and it breaks the header contract ("One entry point, JSON out")
   plus five specs of no-side-effect practice (P5 Decision 2: "the kernel
   answers, it never acts"). The hooks hold the same answers AND the session
   identity. See Decision 1.

2. **A remote/cloud telemetry backend** (events posted to a service,
   dashboards). Rejected: this is a local dev-tooling plugin with no service
   component, no infra, and no operator — `rules/architecture.md`'s
   monolith-first/no-premature-split discipline applied to observability. It
   would also convert a privacy non-issue into a real one: events that never
   leave `.git/` need no transport security, no tenancy, and no PII review
   beyond Decision 4's schema guard. The consumers are two local shell/skill
   readers; a backend serves neither.

3. **An analytics/aggregation layer** (a `kernel.sh stats` verb, a report
   generator, trend storage). Rejected per YAGNI and the one-caller rule
   (`rules/base.md`): the two named consumers are `retro` (a model reading
   JSONL with the skill's existing clustering discipline) and
   `usage-report.sh` (a 20-line jq section, shipped in U3). Nothing has asked
   for aggregation beyond `group_by | length`, and machinery built ahead of
   its consumer is the exact defect P6 rejected for the `requirements:` field
   — cited there as "P7 telemetry's subject, built ahead of its consumer";
   the lesson transfers unchanged to P7 overbuilding itself.

4. **Capture prompt text** (full or truncated, "for later analysis or
   training"). Rejected on `rules/security.md` (PII/secrets never in logs —
   prompts routinely contain both) and `rules/context.md` (never carry secrets
   into anything logged); no P7 consumer needs text — the prune analysis needs
   ids, the conformance capture needs rule ids, the bound question needs
   outcomes; and the text already exists once, in Claude Code's own
   transcripts under `$HOME/.claude/projects/`, where `usage-report.sh`
   already mines it — a second, repo-adjacent copy would double the exposure
   surface for zero new capability. Decision 4 makes the rejection
   structural: the schema's `value_pattern` cannot represent a sentence.

5. **Extend `scripts/exec-journal.sh` instead of adding `telemetry.sh`.**
   Rejected on subject mismatch, field by field: the exec-journal schema is
   per-capability-dispatch run accounting (`run_id`, `capability_id`,
   `tokens_in/out`, `duration_ms`, envelope `status`) whose designed writer is
   the external ai-se-os runner — none of those fields exists for a hook-side
   kernel-decision event, and none of `route`'s fields fits its schema.
   Overloading it would mutate a shipped schema contract with a declared
   external consumer (`docs/COMPATIBILITY.md`'s silent-contract-change
   prohibition — P5 rejection 1's exact reasoning against overloading
   `retry`). The two remain deliberately parallel CLIs over deliberately
   distinct JSONL shapes; the day both streams exist, they join on timestamp
   and session/run id without translation, which is the sibling's own design
   goal.

6. **Commit the events to the worktree** (`.engineos/telemetry/`, alongside
   `changes/`). Rejected: telemetry is volatile machine data —
   `rules/memory.md` forbids volatile facts in versioned homes — and
   committing it would put one diff-noise line into every PR per prompt of
   work, teach reviewers to ignore `.engineos/` diffs, and ship
   machine-local session ids to the whole team. The repo's own precedent for
   hook-written state is `$GITDIR` (the unrecorded flag), which makes
   never-committed structural. The cost is accepted and stated: CI can never
   read the events (C22's design), and cross-machine aggregation does not
   exist (neither consumer wants it).

7. **Capture `route-path` events** (per-edit domain routing, from
   `route-before-change.sh` / PreToolUse). Rejected for now: it is the
   highest-volume surface (every Edit/Write, typically several per prompt),
   and no consumer exists — `usage-report.sh` reports intents and gates, not
   path domains; `retro`'s placement table has no path-routing row; the
   conformance pipeline keys on decision rules. The registry's closed event
   enum means adding it later is one entry plus one hook line plus one C22c
   grep — when a consumer arrives, exactly like P4's deferred kernel verb.

8. **Capture repair/retry attempts anyway** — a disk counter the model
   increments, or a wrapper script the model is told to call instead of
   `kernel.sh repair`. Rejected: the disk counter is P5 rejection 4 verbatim
   (attempt state is session state; `rules/memory.md`); the wrapper is policy
   enforced by politeness — the model can and will call `kernel.sh` directly
   since C18b requires agents to be told to, so the wrapper would produce a
   confidently incomplete dataset, which is worse for the bound question than
   an honest absence. The attempt-level data has a designed home with a
   designed writer (exec-journal ← ai-se-os runner follow-on); P7 ships the
   loop-start proxy (`verify`) and defers the rest with this paragraph as the
   record.

---

## Verification

Definition of done, every command run with output shown in the change record:

- `jq empty registries/policy.json` — clean; `jq -r '.version'` prints
  `1.4.0`.
- `bash -n` on `scripts/telemetry.sh`, `scripts/test-telemetry.sh`, the three
  wired hooks, `hooks/ensure-project-layout.sh`, `scripts/usage-report.sh`,
  `scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh` — clean.
- `scripts/test-telemetry.sh` — green (new).
- `hooks/test-route-advisor.sh`, `hooks/test-gate-advisor.sh`,
  `hooks/test-verify.sh` — green: every pre-P7 case **unchanged** (the writes
  are behavior-invisible by contract) plus the new write/no-write cases.
- `hooks/test-route.sh`, `hooks/test-task-scale.sh` — green **unchanged**:
  P7 touched neither hook.
- `scripts/test-kernel.sh` — 153/0, green **unchanged**: proof P7 touched no
  kernel behavior (there is no kernel diff to have touched it).
- `scripts/test-exec-journal.sh` — 14/0, green **unchanged**: proof the
  sibling schema was not touched.
- `scripts/validate-engineos.sh` — green, visibly including the new C22 `ok`
  lines.
- `scripts/test-validate-engineos.sh` — green with the eight new cases; total
  case count grows by exactly eight (66 → 74).
- `scripts/run-evals.sh` — 11/0, unaffected (no eval cases change in P7).
- Manual smoke, output shown: in a scratch git repo with `.engineos/` present,
  `printf '{"session_id":"smoke","cwd":"<repo>","prompt":"add a paginated orders endpoint to the API and mirror the screen to mobile"}' | hooks/route-advisor.sh`
  emits its escalation notice unchanged AND
  `<gitdir>/engineos-telemetry/smoke.jsonl` contains one `route` line with
  `"escalate":true`; `scripts/telemetry.sh validate` on that file passes; and
  `scripts/telemetry.sh append /tmp/x --session s --event route --data '{"intents":["two words"]}'`
  fails with an `error` body (the privacy guard, demonstrated live).

## Rollback

`git revert` of the P7 commits. `policy.json` returns to 1.3.0 (the
`telemetry` block disappears), the three hooks lose their best-effort writes
(their behavior was byte-identical with or without them, so nothing else
notices), the reaper and the two reader wirings disappear, and C22 plus its
eight cases go with them. `scripts/telemetry.sh` and its tests are removed;
nothing else calls them. Event files already written under
`.git/engineos-telemetry/` are inert local data — unread after revert and
deleted by hand or by the next `git gc`-era cleanup at the owner's discretion;
they were never committed, so history carries nothing. The surface is purely
additive; no deprecation window is owed under `docs/COMPATIBILITY.md`.
