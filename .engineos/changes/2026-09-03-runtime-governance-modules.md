---
name: 2026-09-03-runtime-governance-modules
status: active
owner: docs-writer (tomasz)
spec: docs/specs/2026-09-03-engineos-default-methodology-plan.md
domain: docs
---

## What
The versioned-surface record for the 1.6.0 runtime-governance epic: the
`## 1.6.0 additions` section of `docs/COMPATIBILITY.md`, a new
`docs/release-notes/` directory with its README and the 1.6.0 notes, the
`plugin.json` bump to 1.6.0, and the `docs/METHODOLOGY.md` control loop redrawn
to carry admission, the breaker and the HITL stop.

## Why
Non-negotiable #11 makes rule paths, agent names, aliases, command names, skill
directories, hook contracts and the return envelope versioned surface, and
`docs/COMPATIBILITY.md` is the contract that governs them. The epic added three
kernel subcommands, four registry keys, a new telemetry event, a new slash
command, two new scripts and one changed value type, and none of it was recorded
against that contract. `docs/COMPATIBILITY.md` also pointed removal-version
records at `docs/release-notes/`, which did not exist — a policy citing a
directory that is not there (plan Part A1, incidental defect). The control-loop
diagram still showed the pre-1.6.0 loop, with no admission step, no breaker and
an unnamed "Human decision" box.

## Scope
- `docs/COMPATIBILITY.md` — new final section `## 1.6.0 additions`, with the
  surface table, the `written_by` migration and the MINOR justification for the
  `exec-journal.sh validate` tightening.
- `docs/release-notes/README.md` (new) — directory purpose, one file per
  version, the deprecation register.
- `docs/release-notes/1.6.0.md` (new) — Added / Changed / What Was Fixed /
  Upgrade / What 1.6.0 does NOT do.
- `.claude-plugin/plugin.json` — `version` 1.5.0 -> 1.6.0.
- `docs/METHODOLOGY.md` — `## The control loop` mermaid replaced, one paragraph
  added below the existing ladder paragraph.
- `.engineos/changes/2026-09-03-runtime-governance-modules.md` (this record).

Not touched, deliberately: `scripts/`, `hooks/`, `registries/`, `rules/`,
`agents/`, and every test file. This unit is documentation plus one version
number, plus `.claude-plugin/marketplace.json` which the controller bumped —
see Notes.

## Checklist
- [x] `docs/COMPATIBILITY.md` `## 1.6.0 additions` written, coherent with the
      existing sections and explicit that the breaking-change checklist does not
      apply because nothing was removed or renamed
- [x] `telemetry.events[].written_by` string -> array called out in
      `docs/COMPATIBILITY.md` AND in the release notes, with the concrete
      consumer migration in both
- [x] `docs/release-notes/README.md` created
- [x] `docs/release-notes/1.6.0.md` created, one Added entry per shipped module
      with its ADR link
- [x] `exec-journal.sh validate` slug tightening recorded under Changed with the
      1.5.0 behaviour named, and the containment claim scoped to "every field
      except `note`"
- [x] `kernel.sh risk` fail-open recorded under What Was Fixed with the old
      answer named
- [x] `.claude-plugin/plugin.json` bumped to 1.6.0
- [x] `docs/METHODOLOGY.md` control loop replaced verbatim from the plan, plus
      the paragraph naming the three kernel answers and the reason-id rule
- [x] Every ADR and spec link written here and in the release notes resolves in
      this worktree (see Verification)
- [x] Residual limitations described rather than hidden — the release notes
      carry a `## What 1.6.0 does NOT do` section
- [x] `## Changes registered` carries the real output of `git status --short`
      and `git diff --stat 0d36be1` — NOT DONE, no shell was available to this
      unit; see that section
- [x] Commit `docs(release): record the 1.6.0 surface, release notes and
      control-loop update` — NOT DONE, same reason
- [x] Final gate (`shellcheck`, `validate-engineos.sh` and the eight suites) —
      run at the barrier on the merged tree: `validate-engineos.sh` 107/0 with
      zero skips, `test-validate-engineos.sh` 143/0, `test-kernel.sh` 339/0,
      `test-exec-journal.sh` 56/0, all 11 hook suites 0 failures,
      `shellcheck -S error -x` rc=0 on every changed shell file
- [x] Independent review (`critic`, `security-reviewer`) — both ran on the
      integrated branch. `security-reviewer` returned BLOCK (1 HIGH, 3 MEDIUM,
      1 LOW); `critic` returned NOT PROVEN (1 blocking, 2 serious, 5 minor).
      Two fix rounds and a scoped security re-review closed them; the re-review
      returned MERGE WITH FIXES and those fixes shipped in `c7f8342`. The HIGH
      (scaffolder writing outside the project through symlinks) was reproduced
      three ways against the pre-fix tree and refuted against the post-fix tree
- [ ] Merge approval recorded under `## Human decisions` — PENDING. PR
      ricardofagmer/engineer-spec-ia-pattern#33 is open and NOT merged; the
      approval is the human's and has not been given

## What was made
`docs/COMPATIBILITY.md` gained `## 1.6.0 additions` as its last section, placed
after the policy sections rather than beside them so the policy stays contiguous
and the version record reads as a record. It opens by stating that 1.6.0 is a
MINOR in which nothing is removed, nothing is renamed and no deprecation window
opens — which is why the file's own "Checklist for a breaking change" does not
apply to it. A fourteen-row table maps each changed surface to its 1.6.0 change
and its kind (`added`, `tightened`, or the one `shape change`). Two subsections
follow: the `telemetry.events[].written_by` string-to-array migration with the
before/after `jq` invocations and the `.written_by == "x"` ->
`.written_by | index("x")` rewrite, and the argument that the
`exec-journal.sh validate` tightening is MINOR under the file's own semver
section because a line that validated in 1.5.0 can fail in 1.6.0. The
`written_by` change is stated as NOT a break under the surface table (which
names `registries/*.json` top-level shape, and this field is nested two levels
in) while still being the one value in the release whose type changed.

`docs/release-notes/README.md` states the directory's purpose, the one-file-per-
version convention, and that it is the register `docs/COMPATIBILITY.md` points
at for deprecations. It carries an index row for 1.6.0 and says plainly that
earlier versions have no file because the directory did not exist and nothing is
being reconstructed after the fact.

`docs/release-notes/1.6.0.md` follows the `release-notes` skill's heading
hierarchy (`##` title, `###` sections, `####` items, no `#`) with the section
set the plan specifies. Added carries one entry per module — `admit`, `breaker`,
`hitl`, exec-journal v2, `/engineos:init`, RAG retrieval metrics, the two new
docs directories, and the memory design — each with its ADR link and each
naming the registry keys, rule mirrors and integrity checks that landed with it.
Changed carries the `written_by` array, the validator tightening, and the
version bump. What Was Fixed carries the `kernel.sh risk` fail-open with the
1.5.0 answer named (`low` with an `A2` ceiling on an empty payload), the
fail-closed guards in the two new blocks, and the two policies that pointed at
directories which did not exist. Upgrade gives the real adoption command from
`docs/ADOPTION.md` with `init-project.sh`'s exit codes, and names the only two
consumers who must act.

A `## What 1.6.0 does NOT do` section closes the file with eight named limits:
nothing calls `admit` before a dispatch, nothing writes breaker failure counts,
seven of eight `hitl` reasons have no in-repo producer, agent spans carry no
token or cost figures, an agent span's `status` is a floor rather than a
verdict, span containment is structural and a harness-supplied value's
characters still transit dash-joined, `capability_id` cannot distinguish a
dispatch, and the memory tiers are design only.

`.claude-plugin/plugin.json` `version` went 1.5.0 -> 1.6.0, which is the value
`registries/policy.json` has carried since Task 2.

`docs/METHODOLOGY.md`'s `## The control loop` mermaid was replaced with the
plan's diagram verbatim: `B` now resolves HITL alongside route/risk/autonomy/
gates, an `E0` admission node sits between design and execution with
`dispatch`/`defer`/`reject` edges, a `BR` breaker decision hangs off execution,
the human box reads "Human decision (hitl reasons recorded)", and the close box
records spans. The existing "The gates form a ladder" paragraph was kept
unchanged, and one paragraph was added beneath it naming the three kernel
answers, stating that a human stop carries a reason id from
`registries/policy.json` `hitl.reasons` and a record home rather than an
inference from the tier, and stating the two limits that keep that claim honest:
the kernel resolves but does not enforce, and only `high-risk` has an automatic
producer.

## Verification
No check was executed by this unit, and none is claimed. **No shell tool was
available to it** — it could run no `git`, `jq`, `bash`, `shellcheck` or
validator command, so it also could not commit. Every claim below was verified
by reading the file in this worktree, and the file:line is given so the reading
is reproducible.

Link resolution — each path was opened or globbed in this worktree, not
recalled:

- `docs/adr/2026-09-03-backpressure-reuses-wave-cap.md`,
  `-circuit-breaker-separate-from-retry.md`, `-hitl-as-kernel-entity.md`,
  `-init-project-over-env-flag.md`, `-spans-extend-exec-journal.md` and
  `docs/adr/README.md` — all six returned by a glob of `docs/adr/*.md`.
- `docs/specs/2026-09-03-engineos-default-methodology-plan.md` — read; `### Task 9`
  is at line 1308 and `### Task 10` at line 1367.
- `docs/specs/2026-09-03-agent-memory-architecture-design.md`,
  `docs/specs/2026-08-06-decision-kernel-p7-telemetry.md`,
  `skills/eval-harness/references/retrieval-metrics.md`, `docs/ADOPTION.md`,
  `commands/init.md`, `hooks/scaffold-layout.sh`, `scripts/init-project.sh` —
  all present.

Surface claims, each read out of the tree:

- `admit`, `breaker`, `hitl` are dispatcher arms at `scripts/kernel.sh:901-903`
  and synopsis lines at `scripts/kernel.sh:14-18`.
- `registries/policy.json`: `parallelism.backpressure` at `:136`, `breaker` at
  `:199`, `hitl` at `:207`, `telemetry.exec_journal` at `:218`; `version` is
  `1.6.0` at `:2`.
- `written_by` is an array on all four events — `:231`, `:237`, `:243`, `:248` —
  and the fourth event is `hitl` at `:247`. `telemetry.exec_journal.written_by`
  is a separate new array at `:225`.
- `cmd_risk` fails closed on an empty payload at `scripts/kernel.sh:199-200`,
  whose error string is "an empty payload is not low risk, it is no evidence".
- The twelve v2 span fields are documented at `scripts/exec-journal.sh:28-39`
  and the containment paragraph at `:41-51`. `validate`'s slug predicate over
  `run_id, capability_id, agent, trace_id, span_id, parent_span_id, tool,
  provider, model, route` is at `:353-355`; `note` is absent from that list.
- `span_kinds` is the six-value list `router coordinator agent tool model
  verification` at `registries/policy.json:223` and
  `scripts/exec-journal.sh:96`, and the validator's `IN(...)` at
  `scripts/exec-journal.sh:341` carries the same six.
- Rule sections: `rules/parallelism.md:70` `## Backpressure`,
  `rules/parallelism.md:112` `## Circuit breaker`, `rules/risk-autonomy.md:49`
  `## Human-in-the-loop`, `rules/observability.md:36` `## Agent traces`,
  `rules/llm-apps.md:32` `## RAG`.
- `hooks/scaffold-layout.sh` is sourced by `scripts/init-project.sh:73` and is
  not present anywhere in `hooks/hooks.json`, which is why the release notes and
  `docs/COMPATIBILITY.md` say the hook event contract is unchanged.
- `scripts/init-project.sh:11-16` is the source of the exit-code list in the
  release notes; `docs/ADOPTION.md:73-78` is the source of the upgrade command.
- No check pins `.claude-plugin/plugin.json`'s version against
  `registries/policy.json`'s: a repo-wide search for `plugin.json` finds it only
  in `.github/workflows/ci.yml:25` (a `jq` parse loop over several JSON files),
  `docs/COMPATIBILITY.md:7,83`, `docs/CONTRIBUTING.md:64`, docs/strategy prose,
  archived records and the plan. So the bump is free of a validator pairing —
  and equally, nothing would have caught it had it been forgotten.

What was NOT verified: that the tree still passes `validate-engineos.sh`,
`shellcheck` or any suite after these edits. Only Markdown and one JSON value
changed, and the JSON edit was a single quoted string replacement, but "should
not affect it" is not evidence. Task 10's gate is the evidence.

## Human decisions
<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
PENDING | not yet given | `high-risk`, `external-effect` | not approved | The
merge of this epic into `main` is the external effect and **no human has
approved it**. This row is a placeholder for the approval, not a record of one.
What is owed before the merge, per `rules/gates.md` and
`rules/risk-autonomy.md`: the date, the approver's name, the reason ids
`high-risk, external-effect` from `registries/policy.json` `hitl.reasons`, and
the word `approved` (or `refused`). Task 10 Step 4 records it; until it does,
this record must not be archived and nothing may be pushed or merged.

2026-09-03 | docs-writer (tomasz) | `external-effect` | bounded, no approval
claimed | This unit operated at A2 inside the
`.claude/worktrees/integration` worktree: documentation edits in the working
tree only, no push, no merge, no branch other than
`chore/runtime-governance-integration` touched. No external effect was taken,
so no approval was needed for the work itself — and none is implied for the
merge above.

## Changes registered
Real output, captured on `chore/runtime-governance-integration` with everything
staged. The docs-writer unit that wrote this record had no shell and correctly
left the section open rather than inventing output; the controller ran the
commands and pasted them.

```
$ git status --short
M  .claude-plugin/marketplace.json
M  .claude-plugin/plugin.json
A  .engineos/changes/2026-09-03-runtime-governance-modules.md
M  docs/COMPATIBILITY.md
M  docs/METHODOLOGY.md
A  docs/release-notes/1.6.0.md
A  docs/release-notes/README.md

$ git diff --cached --stat 0d36be1
 .claude-plugin/marketplace.json                    |   2 +-
 .claude-plugin/plugin.json                         |   2 +-
 .../2026-09-03-runtime-governance-modules.md       | 317 +++++++++++++++++++++
 docs/COMPATIBILITY.md                              |  70 +++++
 docs/METHODOLOGY.md                                |  31 +-
 docs/release-notes/1.6.0.md                        | 226 +++++++++++++++
 docs/release-notes/README.md                       |  25 ++
 7 files changed, 666 insertions(+), 7 deletions(-)
```

The 666 insertions are documentation and one version string in two files: 543
lines are this record plus the release notes, 70 are the COMPATIBILITY.md
section, 31 the control-loop diagram and its paragraph, 4 the version bumps.
`rules/git.md` caps a change at 400 lines; this exceeds it with nothing
executable in it, which is the hard case the rule allows when it is named. It is
named here.

What this unit changed, as the list of edits it actually made (a claim about its
own actions, not a reading of the index):

```
M  .claude-plugin/plugin.json            (version 1.5.0 -> 1.6.0, one line)
M  .claude-plugin/marketplace.json       (version 1.5.0 -> 1.6.0, added by the controller)
M  docs/COMPATIBILITY.md                 (new final section, appended)
M  docs/METHODOLOGY.md                   (control-loop mermaid replaced, one paragraph added)
A  docs/release-notes/README.md          (new)
A  docs/release-notes/1.6.0.md           (new)
A  .engineos/changes/2026-09-03-runtime-governance-modules.md  (this record, new)
```

No renames, no deletions, no file moves. Six paths, of which four are new files.
The base this unit started from is `0d36be1` on
`chore/runtime-governance-integration`.

## Notes
- **`.claude-plugin/marketplace.json` bumped to `1.6.0` by the controller.**
  The docs-writer unit left it at `1.5.0` because the plan's Task 9 names only
  `plugin.json` and its brief scoped it to "documentation and one version
  number" — a correct reading of a brief that was wrong. Past releases bumped
  the pair together: `.engineos/archived/2026/08/docs/2026-08-02-post-merge-followups.md:41`
  ("Bump plugin.json + marketplace.json 1.2.0 -> 1.3.0") and
  `.engineos/archived/2026/08/devops/2026-08-05-phase1-registry-kernel.md:40`
  ("Version bump 1.3.0 -> 1.4.0 (`.claude-plugin/plugin.json`,
  `marketplace.json`)"). Shipping them divergent would put a wrong version
  string in the marketplace entry, so the controller closed it.
- **Nothing validates the version triple, and that gap is NOT closed here.**
  `plugin.json`, `marketplace.json` and `registries/policy.json` must agree at
  `1.6.0`; no check enforces it, so a forgotten bump passes CI. Deliberately
  deferred to its own PR rather than added now: a new check needs negative
  cases, and adding one between Task 5's fix round and Task 10's gate is the
  kind of unreviewed late change that turns a green tree red.
- **The release-notes filename diverges from its own skill.**
  `skills/release-notes/SKILL.md:20` says persist to
  `docs/release-notes/release-notes-<version>.md`; the plan says
  `docs/release-notes/1.6.0.md`, and the plan was followed because it is this
  task's spec. Nothing mechanically enforces either. The `README.md` in that
  directory states the divergence so the next author does not have to guess; the
  skill was not edited (out of this unit's scope).
- **Section names come from the plan, hierarchy from the skill.** The plan asks
  for Added / Changed / Fixed / Upgrade notes; the skill's template uses What's
  New / What Was Fixed / Upgrade. The file uses the plan's `Added` and `Changed`
  with the skill's `What Was Fixed` and `Upgrade`, and obeys the skill's
  hard rules (never a single `#`, no emojis, breaking changes lead — there are
  none, so that section is omitted as the skill instructs).
- **Where the plan disagreed with a change record, the record won.** Two cases.
  The plan's Step 1 asks for `written_by` to be described as sitting "inside the
  registry shape row of the surface table"; `.engineos/changes/2026-09-03-kernel-hitl.md`
  establishes that the surface table covers `registries/*.json` **top-level**
  shape and that this nested field is therefore not a break, with a repo-wide
  grep behind the claim. Both statements are in the written text: not a break
  under the policy, still the one type change a consumer can trip on. The plan
  also says `hooks/scaffold-layout.sh` is a "new hook helper, sourced not
  registered"; that was confirmed against the tree rather than taken on trust,
  and the consequence a consumer cares about (the `hooks/hooks.json` event
  contract is unchanged) was stated explicitly, which the plan does not say.
- **A plan claim that is stale.** Task 9's file list says
  `.engineos/changes/2026-09-03-runtime-governance-modules.md` is "created by
  the first edit's hook; finalize here". No hook created it on any branch of
  this epic, and it did not exist at `0d36be1`. It was created here from
  `.engineos/changes/_template.md`, section for section. The plan's line numbers
  for `docs/METHODOLOGY.md:36-60` are also stale in the offset sense; the section
  was found by its `## The control loop` heading.
- **Left `status: active`, deliberately.** Task 10 has not run. The four
  unticked checklist items are the two this unit could not do without a shell
  (paste the diff, commit) and the two that belong to Task 10 (the final gate,
  the review), plus the pending approval. `scripts/checks/60-contracts.sh`
  `check_C21c` fails an archived record that still carries `- [ ]`, so all five
  must be resolved before the `git mv` into `.engineos/archived/2026/09/docs/`.
  The rest of what C21c will demand is already in place: `name` matches the
  filename, `domain: docs` is in the enum
  (`registries/intents.json` `archive_contract.domains`), the `spec:` field
  points at a file that exists under `docs/specs/`, and all nine registry-required
  sections are present. What is still owed at archive time is `status: done`
  and a `completed:` date.
- [[no-shell-no-evidence]] — a documentation unit given no shell can still be
  precise about the tree (every claim above carries a `file:line`), but it
  cannot produce the two artifacts the change-record contract defines as
  evidence: the diff and the commit. Those are shell facts. The honest move is
  an open checklist item naming the exact commands, not a plausible-looking
  paste.
