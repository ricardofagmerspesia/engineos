---
name: 2026-09-03-exec-journal-spans
status: active
owner: backend-coordinator
spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md
domain: general
---

## What

Extended `scripts/exec-journal.sh` from the v1 schema contract to a v2 span
schema (twelve optional fields), added one span helper family to
`hooks/lib-common.sh`, and made four hooks its first real writers: the
dispatch/return pair writes `agent` spans, `prompt-advisor.sh` writes `router`,
`stop-verify.sh` writes `verification`. Registered the schema as
`registries/policy.json` `telemetry.exec_journal`, mirrored it in
`rules/observability.md` "Agent traces", and added C27 (four sub-checks), C28
and C29 to `scripts/checks/70-runtime.sh`.

## Why

EngineOS could already answer what it DECIDED — route, risk, gates,
backpressure, breaker, HITL — and could not say what actually HAPPENED when
agents ran. The exec journal existed as a schema contract with no writer. One
session is now one trace, and every dispatched agent, router decision and
verification gate is a span in it, which is the evidence the breaker's
consecutive-failure count, `usage-report.sh` and the retro were designed to
read.

## Scope

- `scripts/exec-journal.sh` — v2 fields on `append` and `validate`
- `scripts/test-exec-journal.sh` — 19 new cases
- `hooks/lib-common.sh` — `hook_slug`, `hook_now_ms`, `hook_span_open`,
  `hook_span_close`, `hook_span`
- `hooks/announce-agent-dispatch.sh`, `hooks/announce-agent-return.sh`,
  `hooks/prompt-advisor.sh`, `hooks/stop-verify.sh` — the four writers
- `hooks/ensure-project-layout.sh` — retention for the journal and the markers
- `registries/policy.json` — `telemetry.exec_journal` (version stays 1.6.0)
- `rules/observability.md` — `## Agent traces`
- `scripts/checks/70-runtime.sh`, `scripts/checks/lib.sh`,
  `scripts/test-validate-engineos.sh` — C27/C28/C29 and their negative cases
- `hooks/test-verify.sh`, `hooks/test-prompt-advisor.sh`,
  `hooks/test-agent-announce.sh` — behavioral coverage per writer
- `scripts/validate-engineos.sh` — 0 lines changed, deliberately: the harness is
  discovery only, and every check this change adds lives in `scripts/checks/`

## Checklist

- [x] v2 fields accepted, validated and round-tripped by `append`
- [x] `validate` rejects every malformed v2 value, including a whitespace or
      newline slug, in any field position
- [x] a v1 line stays byte-identical and valid — no v2 key appears on it
- [x] one span helper in `lib-common.sh`, not four copies of the append
- [x] four writers wired; banner behavior and hook stdout unchanged
- [x] bypass, `ENGINEOS_TELEMETRY=0` and a non-adopted repo each write no spans
      and create no directory
- [x] `telemetry.exec_journal` registered; `version` untouched at 1.6.0
- [x] `## Agent traces` prose mirror added; `parallelism.md`'s forward
      reference is now live
- [x] C27a-d, C28 and C29 added to `70-runtime.sh`, not `validate-engineos.sh`
- [x] negative cases in `scripts/test-validate-engineos.sh`
- [x] C28 and C29 no longer red on this branch: guarded by
      `have_<family>_inputs` and reported as `skip`, see Notes
- [x] fix round 1: all nine findings of the two-reviewer round addressed, each
      with an executed probe rather than an argument — see **Fix round 1**

## What was made

`append` gained twelve optional flags (`--trace-id --span-id --parent-span-id
--span-kind --tool --provider --model --cost-micros --retry-attempt
--cache-hit --route --risk`), each with its own `_set` flag so an unset field is
a key that never appears rather than a key holding `null`; `with_entries` drops
them, so a v1 line is byte-identical to what v1 wrote. Enumerated values go
through `in_list`, numbers through `is_nonneg_int`, and the seven remaining
strings through a new `is_slug` + `check_slug_flag` pair. `validate` gained the
matching predicate.

`hooks/lib-common.sh` gained a helper family under a new "Agent spans" heading:
`hook_slug` (sanitize to the span class), `hook_path_slug` (the narrower class
for anything that becomes a filename), `hook_now_ms` (four clock rungs) and its
`hook_plausible_ms` magnitude guard, `hook_span_open` / `hook_span_close` (the
PreToolUse/PostToolUse marker pair, since the two are separate processes) and
`hook_span` (the one append site). The section header states no count, so it
cannot drift out of date the way "the four helpers below" did.

The four writers each add only what they know. `announce-agent-return.sh` reads
the agent's tier from `registries/agents.json`, so a design-tier agent is
recorded as `design`; its `status` comes from three structural sources — the harness's
own error flag, a top-level `.status` on an object response, and the envelope
vocabulary as the first token of a string response — and from nothing else.
`ensure-project-layout.sh` documents that its existing `*.jsonl` glob already
covers `<session>.exec.jsonl`, and reaps the span start markers one level down
that the glob never reaches.

## Verification

Every suite the change touches, run in this worktree:

```
scripts/validate-engineos.sh           rc=0  passed 104, failed 0 (2 skip)
scripts/test-validate-engineos.sh      rc=0  passed 128, failed 0
scripts/test-exec-journal.sh           rc=0  passed 45,  failed 0
hooks/test-agent-announce.sh           rc=0  pass=28 fail=0
hooks/test-verify.sh                   rc=0  pass=22 fail=0 skip=0
hooks/test-prompt-advisor.sh           rc=0  65 passed, 0 failed
hooks/test-lib-common.sh               rc=0  11 passed, 0 failed
hooks/test-bypass.sh                   rc=0  pass=27 fail=0
hooks/test-layout.sh                   rc=0  pass=14 fail=0 skip=0
```

The two `skip` lines in the full validator run are C28's and C29's input guards,
not silent passes — see Notes. `passed 104, failed 0` therefore means "every
check that could run, ran and passed", which is the property `skip_pending` was
added to preserve.

`shellcheck -S error` on all fourteen changed shell files: rc=0 each, aggregate
rc=0. `shellcheck -S warning -x scripts/checks/70-runtime.sh`: rc=0. CI runs the
same severities.

Backward compatibility, proven rather than asserted. The same v1 argument vector
was run through `git show 0bcf267:scripts/exec-journal.sh` and through the
current file; with only the timestamp VALUE normalised, the two 223-byte lines
are byte-identical and the key order is unchanged:

```
{"timestamp":"T","run_id":"r-1","capability_id":"validate","agent":"borisenko",
 "model_tier":"build","status":"OK","tokens_in":10,"tokens_out":20,
 "duration_ms":1234,"note":"a free text note, with spaces"}
keys_unsorted: timestamp,run_id,capability_id,agent,model_tier,status,
               tokens_in,tokens_out,duration_ms,note   (no v2 key present)
diff old new -> rc=0
```

Cross-validation both directions: the new validator accepts the v1-written line,
and the v1 validator accepts the new file's v1 line.

The three off-switches, each probed through the real hook pair, checking BOTH
that no span was written and that no directory was created:

```
adopted + telemetry on     spans=1  telemetry-dir=created   (control)
ENGINEOS_TELEMETRY=0       spans=0  telemetry-dir=absent
ENGINEOS_BYPASS=1          spans=0  telemetry-dir=absent
no .engineos/              spans=0  telemetry-dir=absent
```

Envelope integrity, since the span write shares stdout with the hook contract:
`announce-agent-dispatch.sh`, `announce-agent-return.sh` and `prompt-advisor.sh`
each emit exactly one parseable envelope (`jq -s length` = 1, hookEventName
`PreToolUse` / `PostToolUse` / `UserPromptSubmit`) with empty stderr.

Refutability, not just green: the new tests were run against
`git show 0bcf267:scripts/exec-journal.sh` and produced 9 FAIL lines. Eight
planted breakages against C27 (span kind renamed on either side, `home` no
longer `.exec.jsonl`, `is_slug` weakened to accept whitespace, the section
renamed, `cost_micros` dropped from the prose, the router span deleted, the
marker reap deleted) were each caught.

Fix round 1 added ten more negative cases, all passing: two on the length bound,
two on the `--agent` guard and the loop-level `check_len`, four on C27d's prose
mirror (the alternation line, the status FLOOR caveat, the slug claim
re-broadened past `note`, and the slug guard re-claiming that it classifies
content), and two on C27e plus one on C27f. Every leak probe was re-run and is
in **Fix round 1** below with its real output.

## Human decisions

<none — no `hitl.required` reason fired; risk is low/medium, reversible by
`git revert`, no external effect>

## Changes registered

`git status --short`:

```
 M hooks/announce-agent-dispatch.sh
 M hooks/announce-agent-return.sh
 M hooks/ensure-project-layout.sh
 M hooks/lib-common.sh
 M hooks/prompt-advisor.sh
 M hooks/stop-verify.sh
 M hooks/test-agent-announce.sh
 M hooks/test-prompt-advisor.sh
 M hooks/test-verify.sh
 M registries/policy.json
 M rules/observability.md
 M scripts/checks/70-runtime.sh
 M scripts/checks/lib.sh
 M scripts/exec-journal.sh
 M scripts/test-exec-journal.sh
 M scripts/test-validate-engineos.sh
?? .engineos/changes/2026-09-03-exec-journal-spans.md
?? .superpowers/
```

Fix round 1 touched the same set plus `scripts/checks/lib.sh` (`skip_pending`)
and added no new files. `scripts/validate-engineos.sh` stays at 0 lines changed
across both rounds.

`.superpowers/` holds the task brief, the amendments and the task report. It is
untracked in this repo by convention (`git ls-files .superpowers` is empty on
`main`) and is NOT part of the commit; `git check-ignore` confirms it is
untracked rather than ignored.

`git diff --stat 0bcf267`:

```
 .engineos/changes/2026-09-03-exec-journal-spans.md | 254 +++++++++
 hooks/announce-agent-dispatch.sh                   |  15 +
 hooks/announce-agent-return.sh                     |  59 +++
 hooks/ensure-project-layout.sh                     |  13 +-
 hooks/lib-common.sh                                | 165 ++++++
 hooks/prompt-advisor.sh                            |  16 +
 hooks/stop-verify.sh                               |  17 +
 hooks/test-agent-announce.sh                       | 233 +++++++++
 hooks/test-prompt-advisor.sh                       |  80 +++
 hooks/test-verify.sh                               |  63 +++
 registries/policy.json                             |  12 +-
 rules/observability.md                             |  59 +++
 scripts/checks/70-runtime.sh                       | 569 ++++++++++++++++++++-
 scripts/checks/lib.sh                              |  26 +-
 scripts/exec-journal.sh                            | 232 ++++++++-
 scripts/test-exec-journal.sh                       | 196 ++++++-
 scripts/test-validate-engineos.sh                  | 172 +++++++
 17 files changed, 2164 insertions(+), 17 deletions(-)
```

No renames, no deletions.

### PR size: 2164 lines against a 400-line limit

`rules/git.md` caps a PR at 400 lines changed and requires the hard-case
argument to be made explicitly, with the excluded categories named. Making it
properly, because 2164 is more than five times the limit and "it is all one
feature" is not an argument:

| Category | Files | Lines | Excluded from the count? |
|---|---|---|---|
| Tests | 5 | 740 | Yes — `rules/git.md` names test-only files as a hard case |
| Integrity checks | 2 (`scripts/checks/*`) | 592 | Yes — codegen-equivalent |
| Prose + change record | 2 | 313 | Yes — this record is 254 of it |
| Registry | 1 | 11 | Yes |
| **Reviewable code** | **7** | **508** | **No — this is the number that counts** |

The residue is 508 lines of behavior across `scripts/exec-journal.sh` (232) and
six hooks (276), which still exceeds 400. The honest reading is that this SHOULD
have been two stacked PRs — (1) the v2 schema on the CLI plus its tests, (2) the
four hook writers plus the integrity checks — and it was not, because the schema
has no observable behavior until a writer exists and the check families were
written alongside the code they police. The 108-line overage is accepted rather
than justified: splitting it after the fact would mean rewriting `0bcf267..HEAD`,
which the fix round was explicitly told not to do.

The generalisable lesson, worth carrying to the remaining tasks of this epic: a
task that adds a schema AND its first writers AND its integrity family is three
PRs wearing one task number. Split at the task level, before implementation,
where splitting is free.

One commit for the base work (`feat(telemetry): add span fields to the exec
journal and write agent spans from hooks`) and one for this round. This record is
part of the latter; the task brief and report under `.superpowers/` are not, per
the note above.

## Notes

### C28 and C29 skip on this branch and go live at the merge

They assert artifacts Tasks 6 and 7 land on other branches of the same epic —
`skills/eval-harness/references/retrieval-metrics.md`, the `## RAG` section's
metric names, `scripts/init-project.sh`, `commands/init.md`,
`hooks/scaffold-layout.sh` and `docs/ADOPTION.md`'s `/engineos:init`. None of
those paths exists at `0bcf267`.

The first attempt let both families run and report every missing input as its own
finding, which left the branch tip permanently red and made all six of their
negative cases vacuous: `run_case` needs the validator to exit non-zero AND to
print an expected substring, and a check that is red for a reason unrelated to
the planted mutation satisfies the first half for free. Fix round 1 replaced that
with `have_retrieval_metrics_inputs` / `have_adoption_inputs`, following the
file's existing `have_<family>_inputs` convention, and registered the negative
cases behind the same two predicates so a skipped family has no cases at all
rather than six that pass for the wrong reason.

The guards are deliberately narrow. C28 gates on the reference DIRECTORY, not on
`retrieval-metrics.md`, so its `rm`-the-file case stays refutable and no finding
the check itself reports can satisfy its own guard. C29 gates on
`scripts/init-project.sh` existing, which folds exactly one of its findings
(`scripts/init-project.sh-missing`) into the guard message and leaves the rest
live; the body still fails on a non-executable file, which is what its remaining
cases plant. A guard satisfiable by the thing under test is how a negative case
becomes vacuous, and that trade is written into `skip_pending`'s own comment.

### Fix round 1 — the two-reviewer round, item by item

Both reviewers returned FAIL. Nine findings, each addressed and each probed:

1. **BLOCKING — `hook_slug`'s class was `'A-Za-z0-9@_./:-\n'`.** Two defects in
   one string. The `\n` was a prompt-text channel through the then-unguarded
   `--agent`; and `:-\n` is a malformed reverse range, so GNU `tr` rejected the
   whole class and NOT ONE span was written on any glibc host. Confirmed in a
   container rather than argued: GNU coreutils 9.1 returns
   `rc=1 tr: range-endpoints of ':-\012' are in reverse collating sequence
   order` on the old class and `rc=0 out=[borisenko-x]` on the new one. The
   class is now `'A-Za-z0-9@_./:-'` with the `-` trailing, where it is literal on
   BSD and GNU both, and `--agent` goes through `check_slug_flag`.
2. **SERIOUS — the shipped containment claim was false.** `run_id`,
   `capability_id` and `agent` now take the slug guard on append and join
   `validate`'s `all(...)` list; `note` stays the one free-text field. All three
   prose homes say it in the same words, and C27e asserts that the set the prose
   claims is the set `validate` actually guards, by extracting both from the
   script: `agent,capability_id,model,parent_span_id,provider,route,run_id,
   span_id,tool,trace_id`, with `note` in neither.
3. **SERIOUS — no length bound.** `telemetry.exec_journal.max_value_length`
   (256) is the one home; `exec-journal.sh` carries `MAX_VALUE_LEN_FALLBACK` so
   the CLI stays standalone, and C27a fails if the two disagree. Enforced in
   `cmd_append`'s argument loop, so it covers every flag including `--note`.
   Over-long is a reject: probed at the bound (accept), one over (reject), and
   with the file checked for 0 bytes afterwards to prove nothing truncated was
   written.
4. **LOW — content reached disk as a marker FILENAME.** `hook_path_slug`
   narrows to `'A-Za-z0-9@_:-'`, the same class the journal filename uses, and
   returns non-zero on an empty result. `/` and `.` are both outside it, so
   traversal is impossible by construction rather than by a `case` guard —
   `../../etc/passwd` becomes `------etc-passwd`. The old `*/*|*..*` guards were
   dropped as now-dead code.
5. **SERIOUS — agent-span `status` was `OK` for the shapes the harness emits.**
   `is_error` stays authoritative; extraction extended ONLY to a top-level
   `.status` on an object payload, filtered through `| strings` so a non-string
   cannot reach the shell, then through the same four-value allowlist so a
   free-text `.status` normalises to `OK` instead of being written. Verified
   across 13 payload shapes. Floor caveat added to the `status` bullet and
   asserted in C27d the way the tokens caveat is.
6. **SERIOUS — `duration_ms` was whole seconds on macOS.** perl/`Time::HiRes`
   rung added between rungs 2 and 3, whole seconds kept as last resort, plus
   `hook_plausible_ms` so a `date` that drops `%3N` cannot return seconds
   labelled ms. Resolution and fallback stated in `rules/observability.md`.
7. **SERIOUS — the validator was RED and four negative cases were vacuous.**
   See the C28/C29 note above. `scripts/test-validate-engineos.sh:889` mutated
   twice, so the case proved nothing about either mutation; the second was
   removed and the other C28/C29 cases were checked for the same shape. No
   uncommitted overlay sandbox is offered as evidence anywhere in this record.
8. **SERIOUS — `verify` and `dispatch` resolved to nothing.** Now `validate` and
   `implement`. No registry surface added; C27f asserts every hook-written
   literal resolves, and the residual imprecision is a named limitation above.
9. **MINORS.** C27d's span-kind mirror was substring-satisfiable, so it now
   greps the registry-derived alternation line as a fixed string
   (`` `router | agent | tool | verification | model` ``) rather than the
   individual kinds. `hooks/lib-common.sh`'s "The four helpers below" said four
   where five followed; the count is gone rather than corrected, so it cannot
   drift again. The Consumers line now separates live from planned. The PR-size
   argument is made above with the numbers.

### Where the brief itself was wrong

Reported rather than worked around, per the round's own instruction:

- Item 7's "follow the existing `have_<family>_inputs` pattern exactly" does not
  produce a green validator. `skip_once` calls `bad()`, so a guard built on it
  leaves the branch red — contradicting the same round's acceptance criterion.
  The intent was fixed by adding `skip_pending` to `scripts/checks/lib.sh`: the
  non-counting sibling that prints a visible `skip` line and touches neither
  counter, so `failed 0` keeps meaning what it says while an absent input is
  still visible. A silent `return` was rejected as hiding a check that did not
  run. Second-order consequence the brief did not anticipate: once a family
  skips, `--only C28` exits 0 and its negative cases fail on "validator exited
  0, expected non-zero", so the case REGISTRATION had to be gated on the same
  predicates too.
- Item 2's rationale ("no-whitespace is the invariant that stops prompt text
  reaching disk") overstates what a sanitizer can do. Slugging maps whitespace
  to `-`; it does not remove content. The guard is structural, and the prose now
  says so — see the containment paragraph in Known limitations.

### One existing test was genuinely invalidated

`scripts/test-exec-journal.sh` asserted that `--agent 'foo"bar'` is ACCEPTED and
round-trips. Item 2's ruling makes `agent` a slug field, so that cannot hold. Per
the standing constraint the test was neither deleted nor weakened: it was
retargeted at `--note`, the field that still admits such a value, which preserves
the property it actually tested (jq's escaping of an embedded quote), with a
comment saying why. A separate new test asserts the guard `--agent` gained.
Precedent for the retargeting: commit `305ffa9`.

### Deviations from the brief, each deliberate

- `is_slug` is a shell `case` pattern, not `grep -Eq "$SLUG_RE"`. `grep` matches
  line by line, so a value of `"clean\nthen arbitrary prompt text"` passes on the
  strength of its first line — a prompt-text channel straight to disk through the
  one field designed to make that impossible. `SLUG_RE` stays as the documented
  constant and is quoted in the error message.
- The `validate` predicate uses `all(...)` and `\z`, not a bare generator and
  `$`. `X and (generator)` emits one result per output and `jq -e` reports only
  the LAST, so a malformed `trace_id` followed by a well-formed `route` would
  have validated; and Oniguruma's `$` also matches before a trailing newline,
  which is whitespace.
- The two numeric v2 fields go through `--arg` + `tonumber`, not `--argjson`
  (defect class A5.8): `is_nonneg_int` accepts `03`, which is not valid JSON.
- `have_exec_journal_inputs` mirrors `have_telemetry_inputs` instead of
  delegating to `have_kernel_inputs` as A1 suggested. This family reads
  `exec-journal.sh`; gating it on `kernel.sh` would be a guard that passes while
  the real input is missing.
- Five helpers in `lib-common.sh`, where A3 asked for one. One is the append
  (`hook_span`, as asked); the others are a sanitizer, a clock, and the
  open/close marker pair the PreToolUse/PostToolUse split requires. Each has one
  responsibility and its own header comment.
- The brief's test snippet calls `pass "msg"` / `fail "msg"`; those are integer
  counters in the real suite, not functions. The cases are verbatim in substance
  and run through the suite's own `check` helper.

### Known limitations, named rather than left to be discovered

[[agent-span-status-is-a-floor]] — an agent span's `status` comes from three
STRUCTURAL sources and no fourth: the harness's own error flag (authoritative), a
top-level `.status` on an object `tool_response`, and the envelope vocabulary as
the FIRST token of a string payload. The first version had only sources 1 and 3,
and since `tostring` on the shapes the Task tool actually returns — an array of
content blocks, or an object with `content`/`totalDurationMs` — starts with `[`
or `{`, the anchored capture never fired: only `is_error` ever produced `FAILED`,
so the breaker's input would have counted essentially zero envelope-level
failures. Fix round 1 added source 2, which closes the common case.

What remains is still a FLOOR, deliberately. An envelope reported inside a text
block reads `OK`, and nothing scans free text on purpose — an extractor reading
prose would turn a report saying "the previous attempt FAILED" into a verdict,
and would hand a subagent a channel for choosing what lands in telemetry. So the
count UNDERCOUNTS and is never a ceiling. Stated in `rules/observability.md` and
asserted by C27d, and `hooks/test-agent-announce.sh` now pins both directions:
an object `.status: "FAILED"` is recorded, and an unstructured failure reads
`OK`.

`duration_ms` resolution: `hook_now_ms` walks four rungs — `EPOCHREALTIME`
(bash 5), `date +%s%3N` (GNU), `perl -MTime::HiRes` (BSD hosts), then whole
seconds scaled by 1000 as the last resort. The first version had no perl rung, so
on the primary development platform (macOS `/bin/bash` 3.2.57, BSD `date`) every
span was measured in whole seconds: a 1.2s dispatch recorded 1000, a fast one 0.
Fix round 1 added the perl rung plus `hook_plausible_ms`, a magnitude guard — a
`date` that silently drops `%3N` returns a 10-digit seconds value, which the
guard rejects rather than labelling seconds as milliseconds. Asserted through the
real hook pair under `/bin/bash`, not by reading the function.

`capability_id` on the new spans is `implement` / `validate` / `route`, all three
of which resolve against `registries/capabilities.json`. The first version used
`dispatch` and `verify`, which resolved against nothing — and `verify` also
shadowed the real id. C27f now extracts the literal each declared writer passes
and fails if it does not resolve.

The remaining imprecision is named rather than papered over: there is no
`dispatch` capability and there should not be, because C13 would require it to
carry an agent binding and a model tier, and dispatching is what the
ORCHESTRATOR does, so there is no agent to bind. A consumer grouping agent spans
by `capability_id` therefore sees them all as `implement` — a security-review
dispatch included — and must disambiguate on `agent`.

Consumers today: none. The first version's prose named `scripts/usage-report.sh`
and the retro as consumers, and neither reads `.exec.jsonl` at all — a forward
reference written in the present tense. The line now distinguishes live from
planned explicitly: the breaker's consecutive-failure count is next and is
blocked on the status floor above; `usage-report.sh` and the retro read the
kernel-decision events and do not sum span cost.

Containment is structural, not semantic. The slug guard bounds the SHAPE and the
SIZE of what reaches disk; it does not classify content. The CLI rejects a
non-slug value, but the hooks sanitize first (`hook_slug` maps every other
character to `-`) so that a span is recorded rather than lost — so a
harness-supplied `subagent_type` of `backend-coordinator\nSECRET=hunter2` lands
as `backend-coordinator-SECRET-hunter2`. What is bought is that no field but
`note` can carry whitespace, a newline, a quote or a control character, so
nothing written through one can break the line format, smuggle a second JSON
object or span two lines. Fix round 1's first prose attempt said a PII value
"cannot be written through those" fields, which one two-line `subagent_type`
probe refuted; the honest form is now in all three homes and C27d greps for
`does not classify the content` so it cannot quietly go back.

### Dangling forward references

The C27 header and the commit body cite
`docs/adr/2026-09-03-spans-extend-exec-journal.md`, and this record's `spec:`
field cites `docs/specs/2026-09-03-engineos-default-methodology-plan.md`. Neither
exists at `0bcf267` — `docs/adr/` does not exist at all. Tasks 3 and 4 shipped
the identical shape and recorded the same gap. Nothing validates these paths for
an active record; C21c would once this record is archived, so the spec and the
ADR must land before then.
