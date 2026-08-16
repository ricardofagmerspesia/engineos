---
name: 2026-08-06-decision-kernel-p4-handoff-frontmatter
status: done
owner: ricardo
spec: docs/specs/2026-08-06-decision-kernel-p4-handoff-frontmatter.md
domain: general
completed: 2026-08-06
---

## What

Decision Kernel Phase 4: the handoff section contract. `templates/handoff.md`'s
required-sections list moves from unenforceable prose to data
(`registries/intents.json`'s `handoff` intent), the template becomes the
checked surface, and CLAUDE.md's handoff row becomes a checked human mirror.

## Why

The section list existed only as prose in two places and had already drifted
from the shipped template: it omitted `## Done`/`## Not done`, listed
"gate, risk" as sections when they are inline field lines inside `## State`,
and called `## Resume` "resume commands". Same defect class P3 fixed for
suppression — a `note` field nobody could apply or falsify. P2's own scope
note named this "the handoff-template work" as P4's whole subject.

## Scope

registries/intents.json (1.2.0: required_sections/required_fields),
templates/handoff.md (one blockquote line, no frontmatter — rejected, see
below), CLAUDE.md (handoff row corrected), scripts/validate-engineos.sh (C19),
scripts/test-validate-engineos.sh (6 cases), the P4 spec.

## Checklist

- [x] Spec with frozen contracts before code (fable, most-capable tier —
      session model was sonnet)
- [x] P4-U1: intents.json fields + template blockquote + CLAUDE.md row
- [x] P4-U2 (barrier): validator C19 + 6 planted-breakage cases
- [x] Full verification green, all prior suites unchanged

## What was made

- `registries/intents.json` 1.2.0: `handoff` intent gains `required_sections`
  (10 exact heading strings, mirroring the shipped template verbatim — `Done`
  and `Not done` included, `Resume` not "resume commands") and
  `required_fields` (`Gate`, `Risk` — modeled as fields because in the
  template they're lines inside `## State`, not headings). The `note` loses
  the list; C19a enforces it stays lost.
- `templates/handoff.md`: one blockquote paragraph appended to the intro,
  declaring the headings and `Gate:`/`Risk:` lines contract-bound. Every
  existing heading and line stays byte-identical — no YAML frontmatter.
- `CLAUDE.md`: the handoff row's Load cell rewritten to mirror the registry
  list exactly (objective, state (gate, risk), done, decisions, files,
  evidence, known failures and open risks, not done, next step, resume).
- `scripts/validate-engineos.sh` C19 (inside the existing jq guard, reusing
  `$IJ` bound in C16): C19a — contract is data, note stays purged; C19b —
  template and registry agree on sections (exact `## ` match) and fields
  (`^Label:` prefix match) in both directions, so a heading added to the
  template without a registry update fails just as loudly as one removed;
  C19c — the CLAUDE.md row substring-contains every required name (lenient,
  same house style as C16's prose grep).
- Rejected YAML frontmatter (the parent plan's literal name for this phase):
  a handoff has zero mechanical readers and is session-ephemeral
  (`rules/memory.md`), unlike change-record frontmatter which
  `mark-unrecorded.sh`/`record-verify.sh`/`retro` actually read. Also
  rejected: a `kernel.sh handoff` subcommand (no runtime question exists,
  one caller — CI reads the registry directly with jq like C16/C18d already
  do) and validating real handoff instances (would mandate persistence that
  `rules/memory.md` explicitly forbids for session state).

## Verification

All output shown at the barrier:
- `scripts/validate-engineos.sh`: passed 68, failed 0 — 5 new `ok` lines,
  which also proves the 3 pre-existing prose/template drifts are actually
  fixed (C19 would have failed against the old note/row/template combination)
- `scripts/test-validate-engineos.sh`: passed 49, failed 0 (6 new
  planted-breakage cases for C19)
- `scripts/test-kernel.sh`: 142/0 UNCHANGED
- `hooks/test-route.sh`: 38/0 UNCHANGED; `hooks/test-route-advisor.sh`: 12/0
  UNCHANGED; `hooks/test-gate-advisor.sh`: 16/0 UNCHANGED;
  `hooks/test-task-scale.sh`: 12/0 UNCHANGED
- `scripts/run-evals.sh`: 11/0, 33 skipped — UNCHANGED
- `bash -n` and `jq empty` clean on every changed file
- Manual smoke: `grep -c '^## ' templates/handoff.md` and
  `jq -r '.intents[]|select(.id=="handoff")|.required_sections|length'
  registries/intents.json` both print `10`

## Changes registered

Commit `e4bca47` on `feat/decision-kernel-p1` (follows P1's `9d718f9`, P2's
`cb04a66`, P3's `5ebce4a`):

```
docs/specs/2026-08-06-decision-kernel-p4-handoff-frontmatter.md | new
registries/intents.json                                         | handoff required_sections/required_fields, 1.2.0
templates/handoff.md                                             | contract blockquote line
CLAUDE.md                                                        | handoff row corrected
scripts/validate-engineos.sh                                     | C19 added
scripts/test-validate-engineos.sh                                | 6 cases added
6 files changed, 588 insertions(+), 3 deletions(-)
```

No renames. `hooks/{layout-manifest,lib-common}.sh` mode-only changes remain
unstaged (pre-existing, unrelated to this branch's work).

## Notes

- This was the smallest phase by design (P2's own scope note bounded it to
  "only the handoff-template work"), and the spec confirmed the bound holds:
  5 files, one dependent barrier, no kernel change.
- Next: P5 (repair loop — what happens when a gate or check fails mid-run),
  P6 (spec-conformance), P7 (telemetry), P8 (28-contradiction cleanup), and
  the ai-se-os runner-adoption follow-on are not started and not yet
  requested for this session.
