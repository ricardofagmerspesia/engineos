---
name: 2026-08-06-decision-kernel-p8-contradiction-cleanup
status: done
owner: ricardo
spec: docs/specs/2026-08-06-decision-kernel-p8-contradiction-cleanup.md
domain: general
completed: 2026-08-06
---

## What

Decision Kernel Phase 8 (final): contradiction cleanup and epic close. A
fresh, evidence-based sweep of the current tree (post-P7) found six live
prose/reality contradictions on surfaces no earlier check reads — the
CLAUDE.md routing preamble, `docs/COMPATIBILITY.md`'s always-on list, the
validator's own header comments, two registry description strings, and this
repo's own layout conformance. All six fixed; one new validator check (C23)
added where recurrence is structural.

## Why

The parent plan named this phase "cleanup of 28 audited contradictions" —
that number has no source anywhere in this repo or its history. P1-P7 fixed
every contradiction that sat *on* a checked surface as a side effect of
building the machinery; nobody had swept the surfaces *adjacent* to the
checked ones. This phase is that sweep, on evidence rather than a number
that couldn't be sourced.

## Scope

CLAUDE.md (routing preamble), docs/COMPATIBILITY.md (always-on list),
registries/policy.json (1.4.1: description) + intents.json (1.3.1:
description), scripts/validate-engineos.sh (2 stale comments + C23),
scripts/test-validate-engineos.sh (3 cases), docs/prds/{README.md,
_template.md} + docs/rules/README.md (seeded), the P8 spec. Ten files.

## Checklist

- [x] Spec with frozen contracts before code (fable, most-capable tier —
      ran a fresh sweep rather than trusting the parent plan's "28")
- [x] Fix F1-F6: CLAUDE.md, COMPATIBILITY.md, both registry descriptions,
      validator comments, layout seeds
- [x] Validator C23 (3 sub-checks) + 3 planted-breakage cases
- [x] Full verification green, all prior suites unchanged

## What was made

- **F1** — CLAUDE.md no longer calls `hooks/routing-map.sh` "authoritative
  for file-pattern routing" (P2 made it a shim; the sentence never caught
  up). Now names `registries/routing.json` + `scripts/kernel.sh route-path`
  as canonical and the table as the registry's mirror.
- **F2** — CLAUDE.md's precedence sentence and domain list now name all 10
  `registries/routing.json` domains (including `ios-release`/
  `android-release`, live since 2026-07-16) instead of the stale 8.
- **F3** — `scripts/validate-engineos.sh`'s header comment corrected "four"
  jq-silent hooks to "six" (matching CLAUDE.md's own already-correct
  sentence); a stale "routing-map.sh arm order" comment in C14 corrected to
  "the registry's own domain order". No new check — a comment inside the
  validator has no second side to compare against.
- **F4** — `docs/COMPATIBILITY.md`'s always-on enumeration gained
  `rules/gates.md`, which CLAUDE.md has imported as always-on since before
  this epic.
- **F5** — `registries/policy.json` (1.4.0→1.4.1) and `registries/
  intents.json` (1.3.0→1.3.1) description strings rewritten to describe
  their actual current contents (9 policy blocks across P1-P7; the 29-
  entries-for-28-rows store-release split) instead of their P1-era
  contents. Wording-only PATCH bumps, no new check — description accuracy
  is semantic, not extractable, the same boundary P6 drew for spec
  conformance.
- **F6** — this repo was missing `docs/prds/` and `docs/rules/`, which its
  own non-negotiable #5 and `hooks/layout-manifest.sh` mandate for every
  `.engineos/`-adopted project, including itself. Seeded byte-identically
  to what `ensure-project-layout.sh` would write. No new CI check — layout
  conformance is already owned by the SessionStart hook.
- `scripts/validate-engineos.sh` C23: the CLAUDE.md precedence sentence
  equals the registry's precedence chain and every CLAUDE.md always-on
  import is named in COMPATIBILITY.md's enumeration (one shared pass/fail
  line, C23a+b); the retired routing-map.sh authority claim stays dead
  (C23c, separate line).
- Rejected (5 numbered alternatives in the spec): reconstructing a 28-item
  list to match the parent plan's name (would fabricate the exact defect
  class the epic removes); a fresh N-agent audit fan-out (the checked
  surfaces are already machine-verified; the residue was small enough for
  one careful pass); a generic "every sentence matches some registry"
  mega-check (not mechanically extractable); a CI check duplicating the
  layout hook; a MINOR/MAJOR version bump (P8's edits are wording-only).

## Verification

All output shown at the barrier:
- `scripts/validate-engineos.sh`: passed 84, failed 0 — 2 new `ok` lines
  (C23a+b share one; C23c a second), which also proves F1/F2/F4 were
  actually fixed, since C23 fails against the pre-P8 text
- `scripts/test-validate-engineos.sh`: passed 77, failed 0 (3 new
  planted-breakage cases, all passed first run)
- `scripts/test-kernel.sh`: 153/0; `scripts/test-telemetry.sh`: 16/0;
  `scripts/test-exec-journal.sh`: 14/0; `hooks/test-route.sh`: 38/0;
  `hooks/test-route-advisor.sh`: 17/0; `hooks/test-gate-advisor.sh`: 20/0;
  `hooks/test-task-scale.sh`: 12/0; `hooks/test-verify.sh`: 15/0 — all
  UNCHANGED
- `scripts/run-evals.sh`: 11/0, 33 skipped — UNCHANGED
- `bash -n` and `jq empty` clean on every changed file
- Manual smoke: the registry's precedence chain and the corrected
  CLAUDE.md sentence print the identical 10-domain chain; `docs/prds` and
  `docs/rules` list the three seeded files

## Changes registered

Commit `51257df` on `feat/decision-kernel-p1` (follows P1's `9d718f9`,
P2's `cb04a66`, P3's `5ebce4a`, P4's `e4bca47`, P5's `6e477d5`, P6's
`4f5922b`, P7's `243cf52`):

```
docs/specs/2026-08-06-decision-kernel-p8-contradiction-cleanup.md | new
CLAUDE.md                                                          | preamble corrections (F1, F2)
docs/COMPATIBILITY.md                                              | always-on list +gates.md (F4)
registries/policy.json                                            | description rewrite, 1.4.1 (F5)
registries/intents.json                                           | description rewrite, 1.3.1 (F5)
scripts/validate-engineos.sh                                       | 2 comments fixed + C23 (F3)
scripts/test-validate-engineos.sh                                  | 3 cases added
docs/prds/README.md                                                | new, seeded (F6)
docs/prds/_template.md                                             | new, seeded (F6)
docs/rules/README.md                                               | new, seeded (F6)
10 files changed, 446 insertions(+), 19 deletions(-)
```

No renames, no deletions — confirmed via
`git diff --name-status --diff-filter=DR 96f9821..HEAD` during authoring:
the epic changed nothing's identity.

## Notes

- **This closes the named 8-phase Decision Kernel epic.** Every drift class
  it set out to fix is now held by C16-C23: registry/prose numbers and
  enums, routing patterns and precedence behaviorally through the kernel,
  agent/capability wiring, handoff and change-record section contracts,
  telemetry policy and plumbing, and the constitution's own preamble.
- What remains permanently manual/judgment territory is exactly the
  boundary P5 and P6 drew and P8 confirms: whether pasted verification
  output is real, whether code matches a spec's intent, whether the model
  obeys a bound at runtime — `critic`, the `code-review` skill's Spec
  axis, and eval golden cases own those; no C-check ever will.
- The "28" in the parent plan's name is most plausibly a stale
  plan-time estimate made before anyone knew P1-P7 would fix most drift
  classes structurally in passing — or a numeric echo of P1's own 28
  router-table rows. Neither is verifiable; the sweep's own count (6) is
  the only number this record claims as fact.
- **Sole remaining follow-on:** the ai-se-os runner adoption (kernel calls
  replacing its hardcoded `ESCALATION_ORDER`/`MAX_ATTEMPTS`/security-path
  copies, `exec-journal.sh`'s writer, P6's deferred conformance-capture
  reader) — a separate unit of work in that repo, not this one, and not
  started or requested for this session.
