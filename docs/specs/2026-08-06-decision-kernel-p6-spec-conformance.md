# Decision Kernel — Phase 6: Spec Conformance

- **Date:** 2026-08-06
- **Status:** Approved (P6 slice of the user-approved "EngineOS Decision Kernel" plan)
- **Risk:** medium — additive versioned surface (`registries/intents.json` gains
  one optional field and populates two P4 fields on a second intent, MINOR per
  `docs/COMPATIBILITY.md`; no renames, no deprecation window). One edit lands
  inside `.engineos/archived/` — normally read-only — under the archive README's
  own factual-error carve-out (Frozen contract 3). Reversible by revert.
  Autonomy A2.
- **Depends on:** P1 (`registries/intents.json`, commit `9d718f9`), P4
  (`required_sections`/`required_fields` semantics,
  `docs/specs/2026-08-06-decision-kernel-p4-handoff-frontmatter.md`), P5
  (validator letters through C20 — confirmed the last check block during
  authoring: `grep -n 'C20\|C21' scripts/validate-engineos.sh` finds C20 at
  line 698 and no C21).
- **Parent plan:** "EngineOS Decision Kernel" (8 phases). This spec covers
  Phase 6 only. The parent plan's surviving wording for this phase is one line:
  *"spec-conformance: checking delivered work against its spec."* This spec
  keeps the name and **narrows the scope on evidence**: "did the code implement
  what the spec's acceptance criteria describe" is a judgment call with two
  existing owners (`critic`, the external `code-review` skill's Spec axis) and
  no mechanical form; what IS mechanically checkable — and checked by nothing
  today — is the artifact where delivered work makes its conformance claim:
  the **change record**, whose `spec:` link, frontmatter, and evidence sections
  are currently self-reported prose that no script has ever read. P6 turns the
  change-record contract into data and makes the archive a validated surface.
  Same move as P3's rejection of the literal `escalate = ambiguous` trigger,
  P4's rejection of frontmatter, and P5's narrowing to the check-level loop.

## Problem

EngineOS already has a complete *story* about conformance, told across five
surfaces. None of it is checked:

| Surface | What it promises | What actually checks it |
|---|---|---|
| `skills/record-change/SKILL.md` step 2 | "read the record's `spec:` front-matter field and verify that file exists under `docs/specs/`" | The model, manually, at archive time. Nothing after that, ever. |
| CLAUDE.md non-negotiable #5 | "Every change gets a change record; the record links its spec when #1 required one, and carries a checklist + a 'what was made' account before it is archived" | Nothing. `mark-unrecorded.sh`/`record-verify.sh` gate on the *flag*, never on record content. |
| `rules/gates.md` Design exit criteria | "Every requirement in `registries/decision-rules.json` that matched has a named artifact. An unmet `require` is an open gate, not a nit" | `kernel.sh decision-rules` (`cmd_decision_rules`, kernel.sh:356) answers *what is required*; nothing anywhere answers *was it delivered*. |
| `.engineos/changes/_template.md` + `.engineos/changes/README.md` + `.engineos/archived/README.md` | The record schema (frontmatter fields, sections, domain enum, archive layout) | Nothing — and the copies have already drifted (below). |
| `scripts/validate-engineos.sh` | 72 checks over rules/registries/hooks/agents | Zero over `.engineos/`. The only `.engineos` mention in the file is C17c's *exclusion* fixture (line 512) — the archive is literally routed around. |

The census, gathered during authoring (34 archived records total; 14 predate
the 2026-07-02 month/domain layout and are grandfathered by
`.engineos/archived/README.md`'s own "not migrated" clause; 20 are
checked-era):

1. **The `spec:` link is honored today by discipline alone.** All 16 distinct
   `docs/specs/` targets named by archived records exist (verified by
   resolving every `spec:` value against the filesystem). But nothing keeps it
   so: a spec renamed, a record archived with the template placeholder intact,
   or an empty field would all pass CI silently.
2. **The escape form is undocumented.** Three records set
   `spec: n/a — <reason>` (one archived, two active). The form appears in ZERO
   docs — not the template, not the skill, not either README. It is exactly
   the right convention (a deliberate exemption distinguishable from a
   forgotten link) living as oral tradition.
3. **One archived record already violates the contract.**
   `.engineos/archived/2026/07/general/2026-07-30-full-config-audit-fixes.md`
   has `status: done` with an **empty `completed:` field**, a
   `## Scope (by layer)` heading where the template says `## Scope`, and no
   `## Checklist` / `## What was made` sections. It sat there for a week; no
   check noticed.
4. **The schema's four prose homes have drifted from each other.**
   `.engineos/changes/README.md` carries a full inline copy of the template —
   and that copy has **no `spec:` frontmatter line and no
   `## Checklist`/`## What was made` sections**. A record scaffolded from the
   README instead of `_template.md` fails the skill's own archive gate.
   Meanwhile the skill's step 4 demands a `## Changes registered` section that
   `_template.md` does not scaffold — and 7 of the 20 checked-era records lack
   it (every record completed before 2026-08-06; every P1–P5 kernel record has
   it).
5. **The domain enum lives in three prose homes** (`_template.md`'s
   placeholder, SKILL.md step 1, `.engineos/archived/README.md`) with no data
   home and no drift alarm.

This is the P4 defect class — a contract stated in prose that no consumer can
apply and no check can falsify — with one aggravating difference: unlike a
handoff, the change record **is** a persistent, machine-read artifact
(`rules/memory.md` gives it a durable home; the `retro` skill mines the
archive; `record-verify.sh` gates its lifecycle). The archive is the repo's
record of every conformance claim ever made, and it is the one durable surface
the kernel epic has not touched.

**P6 in one sentence:** the change-record contract gets the P4 treatment —
schema as data on the `record-change` intent, `_template.md` as the checked
surface, the archive as checked *instances* (the asymmetry with P4 is argued
in Decision 3), prose duplicates killed or demoted to checked mirrors, and the
drifts found above actually fixed.

## Scope

**In:** three fields on the `record-change` intent
(`registries/intents.json` 1.2.1 → 1.3.0), one new section + one placeholder
edit in `.engineos/changes/_template.md`, the inline schema copy in
`.engineos/changes/README.md` deleted and replaced by a pointer, two sentences
in `skills/record-change/SKILL.md`, one two-line factual fix to a single
archived record, validator C21 (five sub-checks), and ten planted-breakage
cases. Eight files (this spec is the ninth).

**Out (one line each, per the parent plan's remaining phases):**

- **P7 — telemetry:** measuring kernel/router/repair usage; not touched — and
  it owns the *capture* half of decision-rule conformance (recording which
  rules matched a unit of work), without which most `require` artifacts are
  post-hoc uncheckable (Decision 1, rejected alternative 8).
- **P8 — contradiction cleanup:** the audited prose contradictions; only the
  change-record schema drifts are fixed here, because they are this phase's
  subject.
- **ai-se-os runner adoption:** the external runner consuming the kernel; a
  follow-on in that repo, not this one.

Also explicitly out, with reasons:

- **`scripts/kernel.sh`** — no change, stated as Decision 2 so nobody
  "completes" it later.
- **`hooks/mark-unrecorded.sh` / `hooks/record-verify.sh`** — untouched. Their
  contract is the session-scoped debt flag, which is orthogonal to record
  *content*; they already do their half correctly.
- **CLAUDE.md** — untouched, for the first time in the epic. Verified during
  authoring: the `record-change` router row carries no schema list, and
  non-negotiable #5 names "a checklist + a 'what was made' account" by their
  plain-English role rather than as an enumerable mirror — both named
  artifacts are covered by C21b/C21c against the template and instances, which
  are the load-bearing surfaces. C16's intent-count drift alarm is therefore
  trivially unaffected: no intent added, no row added.
- **Semantic conformance** (spec acceptance criteria vs the diff) — Decision 1
  and rejected alternative 1.
- **The two stale `status: active` records** in `.engineos/changes/` (both
  dated 2026-07-30, both still open) — observed, not P6's to close: archiving
  them is a `record-change` skill run owned by their author, and a
  CI staleness check is rejected alternative 9.

### Deliverables

| Unit | Files owned | Content |
|---|---|---|
| U1 | `registries/intents.json`, `.engineos/changes/_template.md`, `.engineos/changes/README.md`, `skills/record-change/SKILL.md`, `.engineos/archived/2026/07/general/2026-07-30-full-config-audit-fixes.md` | The schema as data, the template brought into agreement with the skill, the duplicate killed, the escape form documented, the one defective record's factual fix. One unit because C21's mirror and instance checks make these a single atomic change — landing any one alone fails CI |
| U2 | `scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh` | C21 checks + ten planted-breakage cases (barrier unit, consumes U1) |

---

## Decision 1 — conformance means the record, not the diff

**Decision: P6's "checking delivered work against its spec" is scoped to the
change record's integrity — the artifact where the work names its spec, its
verification evidence, and its delivered file list. It is NOT semantic
comparison of spec text against code.**

Three findings force this scope:

1. **Semantic conformance has owners already.** "Does the code match what the
   originating spec asked for" is literally the Spec axis of the external
   `code-review` skill (its own description: "does the code match what the
   originating issue/PRD asked for?"), and the adversarial version is the
   `critic` agent, which `rules/gates.md` already requires at risk=high.
   Building machinery that re-answers their question violates one home per
   fact (`rules/memory.md`) and would be a grep pretending to be a judgment —
   the green record `rules/gates.md` calls worse than no gate.
2. **The decision-rules half is capture-limited, not check-limited.**
   `kernel.sh decision-rules --prompt` answers "what does this prompt require"
   deterministically — that problem is solved (P1/P2). But checking that a
   *delivered* change produced, say, the `adr` that `rule-large-change`
   demanded requires knowing which rules matched the work at the time, and
   nothing records that: the change record has no requirements field, and
   inventing one now would be capture machinery with no reader — P7
   telemetry's subject, built ahead of its consumer (rejected alternative 8).
   What IS checkable post-hoc is exactly the subset of `require` artifacts the
   record already structurally carries: `design-doc` → the `spec:` field
   (rule-spec-threshold), `output-shown` → the `## Verification` section
   (rule-verification), `change-record` → the record itself
   (rule-change-record). C21 checks precisely those three, by checking the
   record.
3. **The record is where the claim lives, so the record is what a linter can
   falsify.** A record with a resolvable spec link, a real completion date, a
   fully-resolved checklist, a "what was made" account, verification evidence,
   and the registered diff is a *checkable claim* of conformance. A record
   missing any of those is not evidence of anything — and today the archive
   contains one such record and nothing noticed (Problem item 3).

## Decision 2 — no kernel change

**`scripts/kernel.sh` gains nothing in P6.** The P4 Decision-1 reasoning
applies verbatim, re-verified against this phase's shape:

- The kernel answers runtime questions. The change-record contract has none:
  the model writing a record reads `_template.md` (the template is the
  answer), and the archive check runs in CI, not in a session.
- The only consumer of the new data is `validate-engineos.sh` C21, which reads
  `intents.json` directly with `jq` exactly as C16, C18d and C19 already do.
  A `kernel.sh conformance` verb would be versioned public surface
  (`docs/COMPATIBILITY.md`) for one caller — `rules/base.md`'s one-caller
  rule, applied to shell, again.
- There is also no clean input for such a verb: it would have to parse
  markdown frontmatter and prose sections, which is grep/sed work the
  validator already does in-house (C19's own machinery is the precedent).

If a headless consumer ever needs "is this record archivable" as a runtime
answer (the ai-se-os runner closing records mechanically), the phase that
brings that caller brings the verb — P4 rejected alternative 3's rule.

## Decision 3 — instances ARE checked here, unlike P4's handoffs

P4 rejected validating handoff *instances* because handoffs are
session-ephemeral by rule (`rules/memory.md`: session-only context dies with
the session) and have zero mechanical readers. Every clause of that argument
inverts for change records, and the inversion is evidenced, not asserted:

- **Persistence is the design, not a proposal.** `rules/memory.md`'s table
  gives change records a durable home (`.engineos/changes/` →
  `.engineos/archived/`); non-negotiable #5 mandates one per change; the
  archive README calls it "the historical trail".
- **Mechanical readers exist.** The `retro` skill mines
  `.engineos/archived/*/*/*/*.md` (its SKILL.md line 29 globs the layout
  directly); `record-verify.sh` gates the lifecycle; the `record-change` skill
  transitions `status` and derives the archive path from `completed` +
  `domain` — a record with an empty `completed` (Problem item 3) breaks that
  derivation's inputs.
- **The instances are the point.** The template is one file; the claims live
  in the 34 (and growing) instances. A template-only check would have caught
  none of the five Problem findings.

So C21 checks instances — with the grandfather clause the archive README
already declares (Decision 4), so the check is green on day one against the
real archive plus exactly the fixes this spec ships.

## Decision 4 — grandfathering is data, not migration

Two cutoff dates exist in the archive's real history and both become registry
data rather than magic numbers in the validator:

- **`grandfathered_before: "2026-07-02"`** — the layout cutoff the archive
  README already states in prose ("Records archived before 2026-07-02 predate
  the domain segment and stay flat under `<YYYY>/<MM>/<DD>/` — not
  migrated."). Records completed before it are skipped entirely by C21c/C21d:
  they predate the `spec:`/`domain:` fields (all 14 verified to carry
  neither), and rewriting them would be history fabrication.
- **`instance_sections_since: 2026-08-06`** — the section-completeness cutoff
  for `## Checklist`, `## What was made` and `## Changes registered`. Seven
  checked-era records completed 2026-07-02..2026-08-05 lack one or more of
  these (verified per-file during authoring); the archive is read-only except
  for factual errors, and reconstructing a diff table or a checklist after the
  fact is not a factual fix — it is inventing the evidence the section exists
  to carry. Every record completed on or after 2026-08-06 (the P1–P5 records)
  already passes. The date is P6's own date: the requirement starts when the
  contract does.

A backdated `completed:` could dodge the checks; a linter cannot defend
against deliberately falsified history, and does not try — the same trust
boundary every C-check has with the files it reads.

---

## Frozen contract 1 — `registries/intents.json` (1.2.1 → 1.3.0, additive)

The `record-change` intent gains P4's two generic fields (their semantics are
unchanged from P4 Frozen contract 1 — this is their second population, which
is why P4 defined them generically) plus one new optional field,
`archive_contract`, defined generically but populated only here.

| Field | Type | Semantics |
|---|---|---|
| `archive_contract` | object | Instance-level policy for the persistent artifacts an intent's template scaffolds. Only meaningful where instances outlive the session and have a filed home; C21a requires it on `record-change` and nothing else carries it in P6. |

The `record-change` entry, literal (replacing the current entry in place;
every field not shown is unchanged from the shipped 1.2.1 entry):

```json
{
  "id": "record-change",
  "title": "Work complete / close the change record",
  "signals": ["record the change", "log this change", "Stop gate reports unrecorded changes"],
  "rules": [],
  "skills": ["record-change"],
  "agents": [],
  "commands": [],
  "mcp": [],
  "model_tier": "cheap",
  "risk_floor": null,
  "hook_mirrored": false,
  "required_sections": [
    "What",
    "Why",
    "Scope",
    "Checklist",
    "What was made",
    "Verification",
    "Changes registered",
    "Notes"
  ],
  "required_fields": ["name", "status", "owner", "spec", "domain"],
  "archive_contract": {
    "domains": ["backend", "frontend", "mobile", "dba", "llm", "devops", "security", "test", "docs", "general"],
    "layout": ".engineos/archived/<YYYY>/<MM>/<domain>/<name>.md",
    "grandfathered_before": "2026-07-02",
    "done_requires_fields": ["completed"],
    "instance_sections": ["What", "Why", "Scope", "Verification"],
    "instance_sections_since": { "date": "2026-08-06", "sections": ["Checklist", "What was made", "Changes registered"] },
    "spec_exempt_pattern": "^n/a — .+",
    "spec_path_prefix": "docs/specs/",
    "note": "The change record is where delivered work claims conformance: spec: names the design-doc that rule-spec-threshold required, ## Verification carries the output-shown that rule-verification required, and the record itself is rule-change-record's artifact. Template checked by C21b, archived instances by C21c/C21d, prose mirrors by C21e. domains is deliberately NOT an FK to routing.json.domains — that enum routes file paths to hook domains (and has ios-release/android-release, no docs/general); this one files completed work. Records completed before grandfathered_before predate the schema and are never checked (archived/README.md: not migrated). instance_sections_since carries the P6 cutoff: the three evidence sections became scaffolded and required on 2026-08-06; earlier archived records legitimately lack them and the archive is read-only except for factual errors."
  },
  "note": "Marks the record done, describes what was made, registers files changed and movements, and moves the record from .engineos/changes/ to .engineos/archived/. Clears the unrecorded-changes flag the Stop hook record-verify.sh enforces. The record schema is data in required_sections/required_fields/archive_contract, validated by scripts/validate-engineos.sh C21 — never restate it here, in .engineos/changes/README.md, or anywhere else in prose; _template.md is the one scaffold."
}
```

Deliberate choices frozen here:

1. **`required_sections` mirrors the template *after* U1's template fix** —
   eight headings including `Changes registered`, which the skill has demanded
   since 2026-07-30 but the template never scaffolded (Problem item 4). Data
   follows the reconciled artifact; the drift pair (skill says one thing,
   template another) is the thing being killed.
2. **`required_fields` are the five frontmatter labels** of `_template.md`.
   P4's field semantics ("a line starting `<Label>:`") match YAML frontmatter
   lines without modification — that is why no new field type is needed.
   `completed` is deliberately NOT in the template list: the README specifies
   it is added at archive time, so it lives in `done_requires_fields` and is
   checked on instances with `status: done` (C21c), not on the template.
3. **`instance_sections` is the evidence-bearing subset, exact-matched.**
   Instances are checked with `grep -qx "## <s>"`, same rigor as C19b gives
   the handoff template. The split between the always-required four and the
   since-dated three is Decision 4's evidence, not taste.
4. **`spec_exempt_pattern` requires the reason.** Bare `n/a` fails; the three
   shipped uses all carry `n/a — <reason>` and the reason is what makes the
   exemption auditable. The em dash is the literal the records use.

## Frozen contract 2 — the prose surfaces reconciled

### `.engineos/changes/_template.md`

Two edits, literal:

1. The `spec:` placeholder line

   ```
   spec: docs/specs/<YYYY-MM-DD>-<slug>-design.md
   ```

   becomes

   ```
   spec: docs/specs/<YYYY-MM-DD>-<slug>-design.md   # below non-negotiable #1's threshold, use: n/a — <reason>
   ```

2. A new section inserted between `## Verification` and `## Notes` (matching
   the position every P1–P5 record already uses):

   ```markdown
   ## Changes registered
   <filled on completion: the real diff — paste `git status --short` / `git diff --stat HEAD`, renames, and `git log --oneline <base>..HEAD` when the work spanned commits>
   ```

No contract blockquote is added, deliberately diverging from P4's template:
`_template.md` is *copied into every record*, so commentary here would
propagate into every future instance as noise. The contract pointer lives in
`.engineos/changes/README.md` (below), which is read in place.

### `.engineos/changes/README.md`

The fenced inline copy of the record schema (the drifted duplicate — no
`spec:` line, no `## Checklist`, no `## What was made`) is **deleted** and
replaced by:

```markdown
The record shape is `_template.md` — copy it; never restate the schema here.
The schema is data on the `record-change` intent (`registries/intents.json`:
`required_sections` / `required_fields` / `archive_contract`), and
`scripts/validate-engineos.sh` (C21) validates the template, every archived
record, and this file's silence against it.
```

C21e enforces the deletion stays deleted (the-prose-stays-dead discipline of
P4's C19a and P5's C20c): this README must never again contain a
`status: active` line, which only the inline copy carried.

### `skills/record-change/SKILL.md`

Two sentences, minimal:

1. Step 2's below-threshold bullet — "Below it: no spec link is required —
   skip to step 3." becomes: "Below it: set `spec:` to the literal escape form
   `n/a — <reason>` (e.g. `n/a — single-file rule edit, below the >2-file spec
   threshold`) so the archive check (`validate-engineos.sh` C21) can tell a
   deliberate exemption from a forgotten link, then continue to step 3."
2. Step 4 gains one parenthetical: "(the section is scaffolded by
   `_template.md`; records completed from 2026-08-06 on must carry it — C21
   checks the archive)".

The skill's step 1 domain list is untouched and becomes a checked mirror
(C21e), same discipline as C19c on the CLAUDE.md handoff row.

## Frozen contract 3 — the one archive fix

`.engineos/archived/2026/07/general/2026-07-30-full-config-audit-fixes.md`
gets exactly two edits, both inside the archive README's "fix a factual
error" carve-out:

```diff
 status: done
 owner: Ricardo Fagmer
 spec: n/a — audit-driven corrective changes; the audit findings (5 parallel auditors over rules/, agents/, skills/, hooks/, router+packaging) serve as the spec
 domain: general
+completed: 2026-07-30
```

```diff
-## Scope (by layer)
+## Scope
+By layer:
```

The `completed` date is factual (it is the record's own name and path); the
heading normalization moves the annotation into the body, changing no content.
The record's missing `## Checklist`/`## What was made`/`## Changes
registered` are NOT fabricated — its completion date (2026-07-30) predates
`instance_sections_since`, so C21c does not demand them (Decision 4). Its
`spec: n/a — <reason>` value passes `spec_exempt_pattern` as-is.

---

## Validator additions — C21

Appended after the C20 block, inside the same jq-present guard (`$IJ` bound in
C16 is in scope; C20 confirmed the last existing letter). Sub-checks, in house
style, near-literal:

```bash
# ------------- C21: change-record contract — template, archive, mirrors (P6)
# The change record is where delivered work claims conformance with its spec
# (spec: link, verification evidence, registered diff). Schema is data on the
# record-change intent; _template.md is the checked scaffold; archived
# instances are the checked claims; the prose homes are checked mirrors.
# Spec: docs/specs/2026-08-06-decision-kernel-p6-spec-conformance.md
CT=.engineos/changes/_template.md
if [ -f "$IJ" ] && [ -f "$CT" ]; then
  RC='.intents[] | select(.id=="record-change")'

  # C21a: the contract is data and well-formed
  a_bad=""
  nsec=$(jq -r "[$RC | .required_sections[]? | select(type==\"string\")] | length" "$IJ")
  nfld=$(jq -r "[$RC | .required_fields[]?   | select(type==\"string\")] | length" "$IJ")
  [ "${nsec:-0}" -ge 1 ] || a_bad="$a_bad required_sections-missing-or-empty"
  [ "${nfld:-0}" -ge 1 ] || a_bad="$a_bad required_fields-missing-or-empty"
  ndom=$(jq -r "[$RC | .archive_contract.domains[]? | select(type==\"string\")] | length" "$IJ")
  [ "${ndom:-0}" -ge 1 ] || a_bad="$a_bad archive_contract.domains-missing-or-empty"
  dupdom=$(jq -r "($RC | .archive_contract.domains // [] | length) - ($RC | .archive_contract.domains // [] | unique | length)" "$IJ")
  [ "${dupdom:-0}" -eq 0 ] || a_bad="$a_bad domains-has-duplicates"
  for dkey in grandfathered_before "instance_sections_since.date"; do
    dval=$(jq -r "$RC | .archive_contract.$dkey // empty" "$IJ")
    case "$dval" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) a_bad="$a_bad $dkey-not-a-date" ;; esac
  done
  sxp=$(jq -r "$RC | .archive_contract.spec_exempt_pattern // empty" "$IJ")
  { [ -n "$sxp" ] && printf x | grep -qE "$sxp" >/dev/null 2>&1; [ $? -le 1 ]; } \
    || a_bad="$a_bad spec_exempt_pattern-missing-or-invalid-ERE"
  # every instance section (both lists) is declared in required_sections
  while IFS= read -r s; do
    jq -e --arg s "$s" "$RC | .required_sections | index(\$s)" "$IJ" >/dev/null 2>&1 \
      || a_bad="$a_bad instance-section-not-in-required_sections:[$s]"
  done < <(jq -r "$RC | (.archive_contract.instance_sections[]?, .archive_contract.instance_sections_since.sections[]?)" "$IJ")
  [ -z "$a_bad" ] && ok "record-change intent carries the change-record contract as data" \
                   || bad "record-change contract problems:$a_bad"

  # C21b: template <-> registry, both directions (P4 C19b pattern)
  miss=""
  while IFS= read -r s; do grep -qx "## $s" "$CT" || miss="$miss [$s]"; done \
    < <(jq -r "$RC | .required_sections[]?" "$IJ")
  [ -z "$miss" ] && ok "change template carries every registry-required section" \
                 || bad "change template missing required sections:$miss"
  fmiss=""
  while IFS= read -r f; do grep -q "^${f}:" "$CT" || fmiss="$fmiss [$f]"; done \
    < <(jq -r "$RC | .required_fields[]?" "$IJ")
  [ -z "$fmiss" ] && ok "change template carries every registry-required field line" \
                  || bad "change template missing required fields:$fmiss"
  undecl=""
  while IFS= read -r h; do
    jq -e --arg h "$h" "$RC | .required_sections | index(\$h)" "$IJ" >/dev/null 2>&1 \
      || undecl="$undecl [$h]"
  done < <(sed -n 's/^## //p' "$CT")
  [ -z "$undecl" ] && ok "every change template section is declared in the registry" \
                   || bad "change template sections not declared in the registry:$undecl"

  # C21c + C21d: every checked-era archived record is a well-formed claim
  # with a resolvable spec link (or the explicit n/a escape)
  GF=$(jq -r "$RC | .archive_contract.grandfathered_before" "$IJ")
  SINCE=$(jq -r "$RC | .archive_contract.instance_sections_since.date" "$IJ")
  PFX=$(jq -r "$RC | .archive_contract.spec_path_prefix" "$IJ")
  i_bad=""; s_bad=""
  while IFS= read -r rec; do
    comp=$(sed -n 's/^completed: //p' "$rec" | head -1)
    nm=$(sed -n 's/^name: //p' "$rec" | head -1)
    gate="${comp:-${nm:0:10}}"
    [ "$gate" \< "$GF" ] && continue                      # grandfathered (Decision 4)
    base=$(basename "$rec" .md)
    st=$(sed -n 's/^status: //p' "$rec" | head -1)
    dom=$(sed -n 's/^domain: //p' "$rec" | head -1)
    [ "$st" = "done" ]                          || i_bad="$i_bad [$base:status=$st]"
    case "$comp" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) i_bad="$i_bad [$base:completed-missing-or-malformed]" ;; esac
    [ "$nm" = "$base" ]                         || i_bad="$i_bad [$base:name-drifts-from-filename]"
    jq -e --arg d "$dom" "$RC | .archive_contract.domains | index(\$d)" "$IJ" >/dev/null 2>&1 \
                                                || i_bad="$i_bad [$base:domain-not-in-enum:$dom]"
    want=".engineos/archived/${comp:0:4}/${comp:5:2}/${dom}/${base}.md"
    [ "$rec" = "$want" ]                        || i_bad="$i_bad [$base:filed-at-wrong-path]"
    grep -q '^- \[ \]' "$rec"                   && i_bad="$i_bad [$base:unresolved-checklist-item]"
    while IFS= read -r s; do grep -qx "## $s" "$rec" || i_bad="$i_bad [$base:missing-section:$s]"; done \
      < <(jq -r "$RC | .archive_contract.instance_sections[]?" "$IJ")
    if [ ! "$comp" \< "$SINCE" ]; then
      while IFS= read -r s; do grep -qx "## $s" "$rec" || i_bad="$i_bad [$base:missing-section:$s]"; done \
        < <(jq -r "$RC | .archive_contract.instance_sections_since.sections[]?" "$IJ")
    fi
    spec=$(sed -n 's/^spec: //p' "$rec" | head -1)
    if [ -z "$spec" ]; then s_bad="$s_bad [$base:spec-field-missing-or-empty]"
    elif printf '%s' "$spec" | grep -qE "$sxp"; then :   # explicit, reasoned exemption
    else
      case "$spec" in "$PFX"*) [ -s "$spec" ] || s_bad="$s_bad [$base:spec-file-missing-or-empty:$spec]" ;;
                      *) s_bad="$s_bad [$base:spec-not-under-$PFX:$spec]" ;; esac
    fi
  done < <(find .engineos/archived -name '*.md' ! -name README.md | sort)
  [ -z "$i_bad" ] && ok "every checked-era archived change record is a well-formed done claim" \
                  || bad "archived change-record problems:$i_bad"
  [ -z "$s_bad" ] && ok "every checked-era archived record's spec link resolves (or is an explicit n/a exemption)" \
                  || bad "archived spec-link problems:$s_bad"

  # C21e: prose mirrors agree and the killed duplicate stays dead
  m_bad=""
  for home in skills/record-change/SKILL.md .engineos/archived/README.md .engineos/changes/_template.md; do
    while IFS= read -r d; do
      grep -q "$d" "$home" || m_bad="$m_bad [$home-missing-domain:$d]"
    done < <(jq -r "$RC | .archive_contract.domains[]?" "$IJ")
  done
  grep -qx 'status: active' .engineos/changes/README.md 2>/dev/null \
    && m_bad="$m_bad [changes/README.md-regrew-the-inline-schema-copy]"
  [ -z "$m_bad" ] && ok "change-record prose mirrors agree with the registry" \
                   || bad "change-record mirror problems:$m_bad"
else
  bad "intents.json or .engineos/changes/_template.md missing — change-record checks skipped"
fi
```

Design notes, frozen:

- **The grandfather gate is a string compare on ISO dates** (`[ "$gate" \< "$GF" ]`),
  which is correct for `YYYY-MM-DD` and needs no `date` binary — portable
  across the BSD/GNU split the hooks already fight.
- **C21c/C21d loop the real archive**, not fixtures — the same
  check-the-live-thing spirit as C17b's sample paths and C20b's canary, but
  over instances that already exist. Green on day one requires U1's fixes to
  actually land; that coupling is the same proof-by-green P4 used for its
  three prose drifts.
- **Section matching is exact on instances** (`grep -qx "## $s"`), which is
  what the Frozen-contract-3 heading normalization exists to satisfy. Lenient
  prefix matching was considered and dropped: `^## What` would match
  `## What was made`, making the check unable to tell the two sections apart.
- **C21e is containment, not equality** — C19c's house leniency: it catches a
  domain dropped from a prose home, not a rewording.

### Planted breakage (`scripts/test-validate-engineos.sh`)

Ten cases appended after the C20 block, each breaking exactly one invariant,
in the shipped `case_ "desc" "expected-bad-substring" "mutation"` pattern:

| # | Mutation | Expected failure substring (check) |
|---|---|---|
| 1 | `sed -i.bak '/^## Verification$/d' .engineos/changes/_template.md` | `change template missing required sections` (C21b) |
| 2 | `printf '\n## Scratch\n\n<x>\n' >> .engineos/changes/_template.md` | `change template sections not declared` (C21b) |
| 3 | python: append `"Ghost section"` to the intent's `required_sections` | `change template missing required sections` (C21b) |
| 4 | python: set `spec_exempt_pattern` to `(` (invalid ERE) | `record-change contract problems` (C21a) |
| 5 | `sed` the P5 record's `spec:` to `docs/specs/nonexistent.md` | `archived spec-link problems` (C21d) |
| 6 | `sed` the full-config record's `spec:` to bare `n/a` (reason stripped) | `archived spec-link problems` (C21d) |
| 7 | `sed` the P4 record's `completed: 2026-08-06` line out | `archived change-record problems` (C21c) |
| 8 | `printf -- '- [ ] leftover\n' >>` the P3 record | `archived change-record problems` (C21c) |
| 9 | `sed` the P2 record's `domain: general` to `domain: platform` | `archived change-record problems` (C21c — enum AND path both fire) |
| 10 | `sed` `dba` out of SKILL.md step 1's domain list; also `printf 'status: active\n' >> .engineos/changes/README.md` as a separate case if the harness prefers one mutation per case — implementer's choice, both invariants get a case | `change-record mirror problems` (C21e) |

The `sed` targets were verified unique during authoring (`^## Verification$`
appears once in the template; each named record carries its line exactly
once). Mutating *archived* records inside the planted-breakage harness is safe
by the harness's own design — it works on a copy and restores from `.bak`, the
same mechanism cases against `CLAUDE.md` and `templates/handoff.md` already
rely on.

---

## Test surface — the boundary, stated

C21 proves: the schema is data, the template matches it both directions, every
checked-era archived record is a structurally complete done-claim whose spec
link resolves (or is an explicit reasoned exemption), and no prose home can
silently drift or regrow a duplicate.

It proves **nothing about whether the claim is true**: whether the pasted
verification output is real, whether the diff table matches the actual
commits, whether the code implements the spec's acceptance criteria. Those are
either judgment (the `critic` agent, the `code-review` skill's Spec axis — the
mechanisms P3 and P5 named for exactly this class) or require capture that
does not exist yet (P7). What P6 guarantees is narrower and real: a
conformance claim can no longer be silently *absent, dangling, or malformed* —
the failure modes the census actually found in the shipped archive.

---

## Rejected alternatives

1. **Semantic conformance — compare spec text against the diff (an LLM-judge
   pass, or a new agent).** Rejected: not mechanically checkable, and both
   halves already have owners — the external `code-review` skill's Spec axis
   ("does the code match what the originating issue/PRD asked for?") and the
   `critic` agent, which `rules/gates.md` already requires at risk=high.
   New machinery would duplicate them (one home per fact, `rules/memory.md`)
   and a grep that *pretends* to answer it would produce the green record
   `rules/gates.md` calls worse than no gate.

2. **Mechanically diff the spec's "Scope" file list against the record's
   "Changes registered" list.** Rejected for lack of an extraction point,
   verified against the shipped corpus: spec scope formats are heterogeneous
   by design — P1/P3/P5 use per-unit "Files owned" tables with globs, the
   2026-06/07 design docs state scope in prose, and
   `full-config-audit-fixes` scopes "by layer" across 72 files — while
   `## Changes registered` is a pasted `git diff --stat`. A parser bridging
   those would be prose-semantics regex soup whose false alarms teach people
   to ignore the gate (`rules/gates.md`: theatre is how teams learn to skip
   gates that matter). The honest version of this comparison is judgment —
   alternative 1's owners.

3. **A `kernel.sh conformance` (or `record`) subcommand.** Rejected — P4
   Decision 1, one-to-one: no runtime question exists (the template is the
   answer at write time; CI is the reader at check time), the single consumer
   is `validate-engineos.sh` reading `intents.json` with `jq` as C16/C18d/C19
   already do, and a subcommand is versioned public surface
   (`docs/COMPATIBILITY.md`) bought for one caller. The phase that brings a
   mechanical record-closing consumer (ai-se-os runner) brings the verb.

4. **Verify the record's git claims — recorded commit hashes resolve, spec
   committed before code.** Rejected on two pieces of repo evidence. (a)
   `rules/git.md` makes squash-merge the default, which discards
   feature-branch hashes — every hash a record honestly wrote (`e4bca47`,
   `6e477d5`) becomes unresolvable after its branch merges and is deleted, so
   the check rots through *correct* workflow. (b) "Spec before code" as a
   commit-ordering invariant fails the epic's own history: P4's commit
   `e4bca47` contains the spec file AND the code in one commit (its record's
   diff table shows both), which is the normal shape of spec-gated work here.
   The enforceable invariant is spec-*exists-and-resolves* at archive time —
   which is exactly C21d.

5. **Mandate a stricter spec template with auto-verified acceptance
   checkboxes.** Rejected: the 20 shipped specs are deliberately heterogeneous
   (design notes vs frozen-contract phase specs), so retrofitting means
   rewriting history or forking formats; and a checkbox the author ticks is
   self-reported either way — the same trust level as today with added
   ceremony. The record's `## Checklist` already carries the self-report, and
   C21c checks the one mechanical fact about it (fully resolved, no `- [ ]`
   in an archived record — the skill's own step-3 rule, previously
   unenforced).

6. **Retro-fill the seven records missing `## Changes registered` (and
   migrate the fourteen pre-2026-07-02 records).** Rejected: the archive
   README forbids editing archived records except to fix factual errors, and
   reconstructing a diff table or checklist months later is not a fix — it is
   manufacturing the evidence the section exists to carry ("a record saying
   the bar was met", `rules/gates.md`). The README's own "not migrated"
   clause is the precedent; both cutoffs ship as registry data (Decision 4)
   instead. The single edit P6 does make (Frozen contract 3) fills a field
   whose value the record's own filename already states — factual by any
   reading.

7. **A standalone `registries/change-records.json`.** Rejected — P4 rejection
   8, one-to-one: the contract is one intent's payload (the intent whose
   skill produces the artifact), `intents.json` already carries intent-scoped
   policy (`suppressed_by` in P3, `required_sections` in P4), and a new
   registry costs an envelope, validator plumbing, a COMPATIBILITY entry, and
   one more file every consumer must know about.

8. **A `requirements:` frontmatter field capturing which decision rules
   matched the work, so C21 could verify ALL `require` artifacts (adr,
   threat-model, compatibility-plan, …).** Rejected for this phase: nothing
   writes that data today, so P6 would be building capture machinery with no
   reader — the capture of what-fired-when is P7 telemetry's subject, and
   `rules/base.md`'s one-caller rule applies at zero callers just as it did
   for P4's frontmatter rejection. P6 checks the three requirements the
   record already structurally carries (design-doc → `spec:`, output-shown →
   `## Verification`, change-record → the record itself); the rest wait for
   the phase that brings the data.

9. **A staleness check on `.engineos/changes/` (active records older than N
   days fail CI).** Rejected: a check that turns red by the passage of time
   with no commit makes CI non-deterministic per commit — the same run passes
   Monday and fails Friday on an identical tree. The two currently-stale
   active records (both 2026-07-30) are real debt, but their mechanism is the
   session-scoped Stop-gate flag and their closure is a `record-change` run
   by their owner, not a linter's business.

---

## Verification

Definition of done, every command run with output shown in the change record:

- `jq empty registries/intents.json` — clean; `jq -r '.version'` prints
  `1.3.0`.
- `bash -n scripts/validate-engineos.sh scripts/test-validate-engineos.sh` —
  clean.
- `scripts/validate-engineos.sh` — green, and the run visibly includes the
  seven new `ok` lines (`record-change intent carries…`, `change template carries
  every registry-required section`, `…field line`, `every change template
  section is declared…`, `every checked-era archived change record is a
  well-formed done claim`, `…spec link resolves…`, `change-record prose
  mirrors agree…`). Green here also proves the census drifts were actually
  fixed: C21c fails against the unfixed `full-config-audit-fixes` record,
  C21b fails against the template without `## Changes registered`, and C21e
  fails while `.engineos/changes/README.md` still carries its inline copy.
- `scripts/test-validate-engineos.sh` — green with the ten new cases, each
  printing `ok`; total case count grows by exactly ten (56 → 66).
- `scripts/test-kernel.sh` — 153/0, green **unchanged**: proof P6 touched no
  kernel behavior (there is no kernel diff to have touched it).
- `hooks/test-route.sh`, `hooks/test-route-advisor.sh`,
  `hooks/test-gate-advisor.sh`, `hooks/test-task-scale.sh`,
  `hooks/test-verify.sh` — green **unchanged**: P6 touched no hook.
- `scripts/run-evals.sh` unaffected (no eval cases change in P6).
- Manual smoke, output shown:
  `grep -c '^## ' .engineos/changes/_template.md` prints `8`, and
  `jq -r '.intents[] | select(.id=="record-change") | .required_sections | length' registries/intents.json`
  prints `8` — the two surfaces agree by count as well as by C21b's
  name-by-name check. And one deliberate scratch break:
  `sed -i.bak 's|^spec: docs/specs/2026-08-06-decision-kernel-p5-repair-loop.md|spec: docs/specs/ghost.md|' <the archived P5 record>`
  makes `validate-engineos.sh` fail with `archived spec-link problems`, then
  the `.bak` restore returns it to green.

## Rollback

`git revert` of the P6 commits. `intents.json` returns to 1.2.1 (the
`record-change` intent loses the three contract fields), the template loses
`## Changes registered` and the escape-form comment, `changes/README.md`
regains its (drifted) inline copy, the skill loses its two sentences, the
archived record regains its empty `completed:` and annotated heading, and C21
plus its ten cases disappear together. Nothing else consumes the new fields —
no kernel verb, no hook reads them — so revert is complete and the pre-P6
(unchecked-archive) behavior is what remains. The surface is purely additive;
no deprecation window is owed under `docs/COMPATIBILITY.md`.
