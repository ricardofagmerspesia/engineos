---
name: 2026-08-06-decision-kernel-p6-spec-conformance
status: done
owner: ricardo
spec: docs/specs/2026-08-06-decision-kernel-p6-spec-conformance.md
domain: general
completed: 2026-08-06
---

## What

Decision Kernel Phase 6: the change-record conformance contract. The change
record — the one artifact where delivered work claims conformance with its
spec — becomes checked data: schema on the `record-change` intent,
`_template.md` as the checked scaffold, every checked-era archived record as
a checked instance, and the prose homes as checked mirrors.

## Why

"Spec-conformance: checking delivered work against its spec" splits into a
judgment half (does the code implement the spec's acceptance criteria —
already owned by `critic` and the `code-review` skill's Spec axis, no
mechanical form) and a mechanical half nothing checked: the `spec:` link is
honored by discipline alone, the `n/a — <reason>` escape appears in zero
docs, one archived record sat for a week with an empty `completed:` field and
a renamed heading, and the schema's four prose homes had already drifted
from each other and from the skill's own step 4.

## Scope

registries/intents.json (1.3.0: `record-change` gains
required_sections/required_fields/archive_contract), `.engineos/changes/
_template.md` (Changes-registered section + escape-form comment),
`.engineos/changes/README.md` (drifted inline copy deleted), `skills/
record-change/SKILL.md` (2 sentences), one factual fix to the defective
2026-07-30 archived record, `scripts/validate-engineos.sh` (C21) +
`scripts/test-validate-engineos.sh` (10 cases), the P6 spec. Eight files.

## Checklist

- [x] Spec with frozen contracts before code (fable, most-capable tier —
      investigated the real gap: the record, not semantic diffing)
- [x] P6-U1: intents.json contract + template/README/SKILL reconciliation +
      archive fix
- [x] P6-U2 (barrier): validate-engineos.sh C21 + 10 planted-breakage cases
- [x] Full verification green, all prior suites unchanged

## What was made

- `registries/intents.json` 1.3.0: `record-change` intent gains P4's two
  generic fields (`required_sections`: 8 headings including the missing
  `Changes registered`; `required_fields`: the 5 frontmatter labels) plus a
  new `archive_contract` object — the domain enum (deliberately NOT an FK to
  `routing.json`'s domains, which routes file paths and has
  `ios-release`/`android-release` instead of `docs`/`general`), the archive
  layout, `grandfathered_before: 2026-07-02` (the pre-domain-folder layout
  cutoff the archive README already states), `instance_sections_since:
  2026-08-06` (when the three evidence sections became required — the
  epic's own date), and `spec_exempt_pattern` for the `n/a — <reason>` form.
- `_template.md`: adds `## Changes registered` (scaffolded for the first
  time — the skill demanded it since 2026-07-30, un-scaffolded); documents
  the escape form inline on the `spec:` placeholder line.
- `.engineos/changes/README.md`: the drifted inline schema copy (no `spec:`,
  no `## Checklist`/`## What was made`) deleted, replaced with a pointer to
  `_template.md` and the registry.
- `skills/record-change/SKILL.md`: step 2's below-threshold bullet now
  names the `n/a — <reason>` escape explicitly; step 4 notes the
  2026-08-06 requirement date.
- One factual fix, inside the archive README's own carve-out: `.engineos/
  archived/2026/07/general/2026-07-30-full-config-audit-fixes.md` gains its
  `completed: 2026-07-30` (the record's own filename already states it) and
  its `## Scope (by layer)` heading normalizes to `## Scope` with "By
  layer:" moved into the body — content unchanged, no fabricated evidence.
- `scripts/validate-engineos.sh` C21: the contract is data (C21a); template
  and registry agree on sections and fields, both directions (C21b); every
  checked-era archived record (looped over the real archive — 20 of 34
  total, 14 grandfathered, not fixtures) is a well-formed done claim whose
  `spec:` link resolves or carries an explicit reasoned exemption
  (C21c/C21d); prose mirrors agree and the killed README duplicate stays
  dead (C21e).
- Rejected (9 numbered alternatives in the spec): semantic conformance
  (owned elsewhere, no mechanical form); diffing spec Scope against record
  Changes-registered (no clean extraction point — scope formats are
  heterogeneous by design across the 20 shipped specs); a kernel.sh verb
  (no runtime question, one CI caller); verifying git commit hashes or
  spec-before-code ordering (squash-merge discards hashes; P4's own commit
  ships spec+code together); a `requirements:` capture field (no reader
  yet — P7's subject); retro-filling missing evidence sections
  (fabricating evidence the section exists to carry); a standalone
  registry; a CI staleness check on active records (non-deterministic per
  commit by the passage of time alone).

## Verification

All output shown at the barrier:
- `scripts/validate-engineos.sh`: passed 79, failed 0 — 7 new `ok` lines,
  which also proves the census drifts were actually fixed (C21 fails
  against the unfixed template/record/README)
- `scripts/test-validate-engineos.sh`: passed 66, failed 0 (10 new
  planted-breakage cases, all passed first run)
- `scripts/test-kernel.sh`: 153/0 UNCHANGED
- `hooks/test-route.sh`: 38/0; `hooks/test-route-advisor.sh`: 12/0;
  `hooks/test-gate-advisor.sh`: 16/0; `hooks/test-task-scale.sh`: 12/0;
  `hooks/test-verify.sh`: 11/0 — all UNCHANGED
- `scripts/run-evals.sh`: 11/0, 33 skipped — UNCHANGED
- `bash -n` and `jq empty` clean on every changed file
- Manual smoke: `grep -c '^## ' .engineos/changes/_template.md` and the
  registry's `required_sections` length both print `8`; a deliberate
  `spec:` break on the archived P5 record is caught with `archived
  spec-link problems`, and restoring it returns the validator to green
  (79/0)

## Changes registered

Commit `4f5922b` on `feat/decision-kernel-p1` (follows P1's `9d718f9`, P2's
`cb04a66`, P3's `5ebce4a`, P4's `e4bca47`, P5's `6e477d5`):

```
docs/specs/2026-08-06-decision-kernel-p6-spec-conformance.md | new
registries/intents.json                                       | record-change contract, 1.3.0
.engineos/changes/_template.md                                 | Changes registered section
.engineos/changes/README.md                                    | inline copy deleted
skills/record-change/SKILL.md                                  | 2 sentences
.engineos/archived/2026/07/general/2026-07-30-full-config-audit-fixes.md | factual fix
scripts/validate-engineos.sh                                   | C21 added
scripts/test-validate-engineos.sh                               | 10 cases added
8 files changed, 943 insertions(+), 28 deletions(-)
```

No renames. `hooks/{layout-manifest,lib-common}.sh` mode-only changes
remain unstaged (pre-existing, unrelated to this branch's work).

## Notes

- This is the first phase in the epic that edits a file under
  `.engineos/archived/` — normally read-only. Justified narrowly under the
  archive README's own "fix a factual error" carve-out; the record's
  missing evidence sections were deliberately NOT fabricated, since its
  completion date predates the requirement cutover.
- The spec's own boundary section is explicit: C21 proves the claim is
  structurally complete and its link resolves — it proves nothing about
  whether the pasted verification output is real or the code matches the
  spec's intent. Those stay with `critic` and `code-review`.
- Next: P7 (telemetry — the phase that would let C21 (or a successor)
  check the full `require` set from `decision-rules.json`, since it owns
  the capture of which rules fired), P8 (28-contradiction cleanup), and
  the ai-se-os runner-adoption follow-on are not started and not yet
  requested for this session.
