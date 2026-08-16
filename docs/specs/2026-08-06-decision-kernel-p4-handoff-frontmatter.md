# Decision Kernel — Phase 4: The Handoff Section Contract

- **Date:** 2026-08-06
- **Status:** Approved (P4 slice of the user-approved "EngineOS Decision Kernel" plan)
- **Risk:** medium — additive versioned surface (`registries/intents.json` gains
  two optional fields, MINOR per `docs/COMPATIBILITY.md`; the handoff template's
  section headings become checked contract, which is a promotion of existing
  surface, not a rename). Reversible by revert. No data touched. Autonomy A2.
- **Depends on:** P1 (`registries/intents.json`, commit `9d718f9`), P2
  (`scripts/kernel.sh`), P3 (validator C18,
  `docs/specs/2026-08-06-decision-kernel-p3-router-agent.md`).
- **Parent plan:** "EngineOS Decision Kernel" (8 phases). This spec covers
  Phase 4 only. The parent plan calls this phase "handoff frontmatter"; this
  spec keeps that name in its filename for cross-reference continuity (P2 and
  P3 both point at it by that name) and **rejects frontmatter as the
  mechanism** — see Frozen contract 2 and rejected alternative 2. The phase's
  intent — a machine-checkable handoff structure — is delivered; the parent
  plan's literal mechanism is not, on evidence. Same move as P3's rejection of
  the literal `escalate = ambiguous` trigger.

## Problem

`templates/handoff.md` is the artifact `rules/parallelism.md` step 6 requires at
every wave barrier and CLAUDE.md's handoff row requires at every session
boundary. Its required-sections list exists in exactly two places, both prose:

1. `registries/intents.json`, the `handoff` intent's `note` field: "Required
   sections: objective, state, gate, risk, decisions, files, evidence, known
   failures, next step, resume commands."
2. The CLAUDE.md handoff router row, which carries the identical list.

Nothing validates either against the template (`grep -ci handoff
scripts/validate-engineos.sh` returns 0 — verified during authoring), and the
drift this permits **has already happened**. Comparing the note's list against
the shipped template's actual headings:

| Defect | Note/row prose says | Template actually has |
|---|---|---|
| Missing sections | (nothing) | `## Done` and `## Not done` exist and are load-bearing (evidence of completion; remaining work with blockers) |
| Phantom sections | "gate, risk" listed as peer sections | `Gate:` and `Risk:` are inline field lines *inside* `## State`, not sections |
| Renamed section | "resume commands" | The heading is `## Resume` |

This is the same defect class P3 fixed for suppression: policy written in a
`note` field that no consumer can apply and no check can falsify. A handoff
written from the note's list would omit `Done`/`Not done` and invent a "Gate"
section; a handoff checked against nothing can silently be "continue where you
left off" with headings on top. P4 turns the section list into data, makes the
template the checked surface, and wires the drift alarm.

## Scope

**In:** two additive fields + a note rewrite on the `handoff` intent
(`registries/intents.json` 1.1.0 → 1.2.0), one blockquote line in
`templates/handoff.md`, one corrected CLAUDE.md router row, validator C19
(three sub-checks), and six planted-breakage cases. Five files total.

The fifth file (CLAUDE.md) is justified by investigation, not scope creep: the
handoff row carries a second copy of the exact prose list this phase abolishes,
with the same three defects. Leaving it uncorrected and unchecked would
recreate the problem one file over; C19c makes it a checked human mirror, the
same discipline C16 applies to `rules/models.md`'s ADR row.

**Out (one line each, per the parent plan's remaining phases):**

- **P5 — repair loop:** what happens when a gate or check fails mid-run;
  nothing here retries, repairs, or validates handoff *instances* at runtime.
- **P6 — spec-conformance:** checking delivered work against its spec; not
  touched.
- **P7 — telemetry:** measuring kernel/router usage; not touched.
- **P8 — contradiction cleanup:** the audited prose contradictions; only the
  three handoff-list drifts above are fixed here, because they are this
  phase's subject.

Also explicitly out: any `scripts/kernel.sh` change (decision below), any
`agents/*.md` change (`grep -i handoff agents/router.md` is empty — verified;
no agent restates the section list), any change to `rules/parallelism.md` or
`rules/gates.md` (both reference the template by path only, never by section
list — verified), per-section content-shape validation, and validating real
handoff documents (both are rejected alternatives below).

### Deliverables

| Unit | Files owned | Content |
|---|---|---|
| U1 | `registries/intents.json`, `CLAUDE.md`, `templates/handoff.md` | The section contract as data, the corrected human mirror, the template pointer line. One unit because C19's mirror checks make these three files a single atomic change — landing any one alone fails CI |
| U2 | `scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh` | C19 checks + six planted-breakage cases (barrier unit, consumes U1) |

C16's intent-count drift alarm (`intents == CLAUDE.md rows + 1`) is unaffected:
U1 edits a row, it adds none.

---

## Decision 1 — no kernel change

**`scripts/kernel.sh` gains nothing in P4.** Stated explicitly so nobody
"completes" it later:

- The kernel answers runtime questions — route this prompt, tier this work,
  gate this risk. The handoff section contract has no runtime question: the
  agent or human writing a handoff reads `templates/handoff.md` itself, and
  the template *is* the answer, headings included. There is no lookup to
  resolve and no policy to aggregate.
- The only consumer of `required_sections` as data is CI
  (`validate-engineos.sh` C19), which reads `intents.json` directly with `jq`,
  exactly as C16 and C18d already do. Routing a CI check through the kernel
  would add public surface (a subcommand is versioned per
  `docs/COMPATIBILITY.md`) for one caller — `rules/base.md`'s
  one-caller-abstraction rule, applied to shell.
- P2's own scope note froze this: "P4 keeps only the handoff-template work."

If a headless consumer (the ai-se-os runner, a P5 repair step) ever needs to
scaffold or verify a handoff mechanically, a `kernel.sh` verb can be added
then, by the phase that brings the caller (rejected alternative 3).

---

## Frozen contract 1 — `registries/intents.json` (1.1.0 → 1.2.0, additive)

Two new optional fields, defined generically but populated only on `handoff`
in P4:

| Field | Type | Semantics |
|---|---|---|
| `required_sections` | array of string | Exact `## ` heading texts (without the `## ` prefix) that the intent's load-target template must contain, in template order. Alphanumeric + spaces only. |
| `required_fields` | array of string | Exact labels of inline `<Label>: <value>` lines the template must contain (matched as a line starting `<Label>:`). Alphanumeric only. |

The `handoff` entry, literal (replacing the current entry in place; every field
not shown here is unchanged):

```json
{
  "id": "handoff",
  "title": "Handoff between agents, waves or sessions",
  "signals": ["hand this off", "wave barrier reached", "session ending mid-task"],
  "rules": [],
  "skills": [],
  "agents": [],
  "commands": [],
  "mcp": [],
  "model_tier": "cheap",
  "risk_floor": null,
  "hook_mirrored": false,
  "required_sections": [
    "Objective",
    "State",
    "Done",
    "Decisions",
    "Files",
    "Evidence",
    "Known failures and open risks",
    "Not done",
    "Next step",
    "Resume"
  ],
  "required_fields": ["Gate", "Risk"],
  "note": "The row's load target is templates/handoff.md — a repo template, which is neither a rule nor a skill and so has no field of its own here. The section contract lives in required_sections/required_fields, validated against the template by scripts/validate-engineos.sh C19 — never restate the list here or anywhere else in prose except the CLAUDE.md row, which C19c checks. Never hand off with 'continue where you left off'. Cheap tier: the template is filled from state that already exists."
}
```

Three deliberate choices frozen here:

1. **The lists mirror the shipped template verbatim** — `Done` and `Not done`
   included, `Resume` not "resume commands", `Gate`/`Risk` demoted to fields.
   The template's headings were designed deliberately (each carries a filled-in
   admonition); the note's list was a paraphrase that rotted. Data follows the
   artifact, not the paraphrase.
2. **`Gate` and `Risk` are `required_fields`, not sections.** In the template
   they are lines inside `## State` (`Gate: <...> — <criteria met> of
   <total>`, `Risk: <...> — <the trigger>`), matching how `rules/gates.md`
   wants gate position stated and `rules/risk-autonomy.md` wants the trigger
   named. Promoting them to headings would change the template's shape for no
   consumer's benefit; modeling them as what they are keeps the template
   byte-stable.
3. **The `note` loses the list and C19a enforces that it stays lost** (grep
   for `required sections:` case-insensitively must find nothing). One home
   per fact (`rules/memory.md`); a list kept in both the field and the note is
   the drift pair this phase exists to kill.

## Frozen contract 2 — `templates/handoff.md`: headings, not frontmatter

**Decision: the existing `## Heading` markdown sections plus the two
`Gate:`/`Risk:` lines remain the sole machine-checkable surface. No YAML
frontmatter is added.** The reasoning, against the closest in-repo precedent:

`.engineos/changes/_template.md` and the archived records (e.g.
`.engineos/archived/2026/08/general/2026-08-06-decision-kernel-p2-resolver-api.md`)
carry frontmatter (`name/status/owner/spec/domain/completed`) because change
records are **persistent, machine-queried artifacts**: `mark-unrecorded.sh`
and `record-verify.sh` gate on them, the `record-change` skill transitions
`status`, and the `retro` skill mines the archive. Every frontmatter field has
a mechanical reader.

A handoff has none of that. It is session state — `rules/memory.md`:
"Session-only context — nowhere; let it die with the session" — and P3's
rejected alternative 8 already ruled that a dispatch plan (the thing a handoff
often carries) is "session state, not a durable artifact". No hook, skill, or
script reads a handoff file today; the reader is the next session's model or
human, for whom prose sections are the right format. Frontmatter here would:

- duplicate `Gate:`/`Risk:` into a second home **within the same file** (the
  `## State` lines carry them with their criteria/trigger context, which a
  bare frontmatter value would drop);
- invent machine fields with zero mechanical readers, violating
  `rules/base.md`'s no-abstractions-for-one-caller rule at zero callers;
- not make the validator's job easier — `grep -qxF "## Objective"` needs no
  YAML parser, and the validator checks the *template*, which has exactly one
  copy in the repo.

The template's **only** change is one paragraph appended to the intro
blockquote, so a human editing it knows the headings are load-bearing:

```markdown
> The `##` headings and the `Gate:`/`Risk:` lines below are contract, not
> suggestion: `registries/intents.json`'s `handoff` intent declares them
> required, and `scripts/validate-engineos.sh` (C19) fails when template and
> registry drift. Rename, add, or remove one only with a registry update in
> the same commit.
```

Every existing heading and line stays byte-identical.

## Frozen contract 3 — the CLAUDE.md handoff row

The row's Load cell currently paraphrases the broken list. It is rewritten to
mirror the registry exactly (lowercased headings, fields shown in their real
position inside state), literal:

```
| Handoff between agents, waves or sessions ("hand this off", wave barrier reached, session ending mid-task) | `templates/handoff.md` — objective, state (gate, risk), done, decisions, files, evidence, known failures and open risks, not done, next step, resume. Never hand off with "continue where you left off" |
```

C19c checks containment: the lowercase of every `required_sections` and
`required_fields` entry must appear in this row. Substring containment is
deliberately lenient (house style — C16 greps prose the same way): it catches
a name dropped from the row entirely, not a partial rewording, and accepts
that `done` is satisfied by `not done` alone. The check's job is the drift
alarm, not prose linting; the exact-match half of the contract lives in C19b
against the template.

---

## Validator additions — C19

C18 is the last existing check block (confirmed against the shipped file; C13
"no empties" sits after it physically but is an older letter). C19 is appended
after the C18 block, **inside the same jq-present guard** as C16–C18, so `$IJ`
(bound in C16 to `registries/intents.json`) is in scope. Near-literal:

```bash
# ------------- C19: handoff template <-> registry section contract (P4)
# The handoff intent's required-sections list is data (required_sections /
# required_fields); templates/handoff.md is the checked surface; the CLAUDE.md
# row is the checked human mirror. Same prose/data discipline as C16-C18.
# Spec: docs/specs/2026-08-06-decision-kernel-p4-handoff-frontmatter.md
TPL=templates/handoff.md
if [ -f "$IJ" ] && [ -f "$TPL" ]; then
  # C19a: the contract is data, not prose — and the prose list stays dead
  h_bad=""
  nsec=$(jq -r '[.intents[] | select(.id=="handoff") | .required_sections[]? | select(type=="string")] | length' "$IJ")
  nfld=$(jq -r '[.intents[] | select(.id=="handoff") | .required_fields[]? | select(type=="string")] | length' "$IJ")
  [ "${nsec:-0}" -ge 1 ] || h_bad="$h_bad required_sections-missing-or-empty"
  [ "${nfld:-0}" -ge 1 ] || h_bad="$h_bad required_fields-missing-or-empty"
  jq -r '.intents[] | select(.id=="handoff") | .note // ""' "$IJ" \
    | grep -qi 'required sections:' && h_bad="$h_bad note-still-carries-the-section-list"
  [ -z "$h_bad" ] && ok "handoff intent carries required_sections/required_fields as data" \
                   || bad "handoff intent required_sections problems:$h_bad"

  # C19b: template <-> registry, both directions, exact-match headings
  miss=""
  while IFS= read -r s; do
    grep -qxF "## $s" "$TPL" || miss="$miss [$s]"
  done < <(jq -r '.intents[] | select(.id=="handoff") | .required_sections[]?' "$IJ")
  [ -z "$miss" ] && ok "handoff template carries every registry-required section" \
                 || bad "handoff template missing required sections:$miss"

  fmiss=""
  while IFS= read -r fld; do
    grep -q "^${fld}:" "$TPL" || fmiss="$fmiss [$fld]"
  done < <(jq -r '.intents[] | select(.id=="handoff") | .required_fields[]?' "$IJ")
  [ -z "$fmiss" ] && ok "handoff template carries every registry-required field line" \
                  || bad "handoff template missing required fields:$fmiss"

  undecl=""
  while IFS= read -r h; do
    jq -e --arg h "$h" '.intents[] | select(.id=="handoff") | .required_sections | index($h)' "$IJ" >/dev/null 2>&1 \
      || undecl="$undecl [$h]"
  done < <(sed -n 's/^## //p' "$TPL")
  [ -z "$undecl" ] && ok "every handoff template section is declared in the registry" \
                   || bad "handoff template sections not declared in the registry:$undecl"

  # C19c: CLAUDE.md handoff row mirrors the list (human mirror, checked)
  hrow=$(grep '^|' CLAUDE.md | grep -F 'templates/handoff.md' | head -1 | tr '[:upper:]' '[:lower:]')
  if [ -z "$hrow" ]; then
    bad "CLAUDE.md has no router row loading templates/handoff.md"
  else
    m_bad=""
    while IFS= read -r name; do
      lc=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')
      case "$hrow" in *"$lc"*) ;; *) m_bad="$m_bad [$name]" ;; esac
    done < <(jq -r '.intents[] | select(.id=="handoff") | (.required_sections[]?, .required_fields[]?)' "$IJ")
    [ -z "$m_bad" ] && ok "CLAUDE.md handoff row mirrors every required section and field" \
                    || bad "CLAUDE.md handoff row does not mirror:$m_bad"
  fi
else
  bad "intents.json or templates/handoff.md missing — handoff checks skipped"
fi
```

Design notes, frozen:

- **C19b is two-directional by construction** — a section the registry
  requires but the template lost fails one side; a heading added to or renamed
  in the template without a registry update fails the other. Same
  either-direction drift alarm as C16's intent count. The `# Handoff — <name>`
  title line uses a single `#` and is intentionally outside the contract.
- **Exact-line matching** (`grep -qxF "## $s"`) for headings, prefix matching
  (`^<Label>:`) for fields. The registry's alphanumeric-only constraint on
  labels keeps the unescaped `grep` safe.
- **Missing handoff intent degrades correctly:** if the `handoff` entry is
  deleted outright, `nsec`/`nfld` are 0 and C19a fires; C19b's loops read
  empty and C19b's undeclared-heading side fires for every template section.
  No new check is needed for that case.

### Planted breakage (`scripts/test-validate-engineos.sh`)

Six cases appended after the C18 block, each breaking exactly one invariant,
in the shipped `case_ "desc" "expected-bad-substring" "mutation"` pattern:

```bash
# ---- C19: handoff template <-> registry section contract (P4) ----

case_ "a required section removed from the handoff template is caught" \
      "handoff template missing required sections" \
      "sed -i.bak '/^## Evidence\$/d' templates/handoff.md"

case_ "a registry-required section absent from the template is caught" \
      "handoff template missing required sections" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='handoff': i['required_sections'].append('Ghost section')
json.dump(d,open(p,'w'),indent=2)\""

case_ "a template section added without a registry update is caught" \
      "handoff template sections not declared in the registry" \
      "printf '\\n## Scratch notes\\n\\n<anything>\\n' >> templates/handoff.md"

case_ "the Gate field dropped from the handoff template is caught" \
      "handoff template missing required fields" \
      "sed -i.bak 's|^Gate:|Gato:|' templates/handoff.md"

case_ "the section list reintroduced into the handoff note is caught" \
      "handoff intent required_sections problems" \
      "python3 -c \"
import json
p='registries/intents.json'; d=json.load(open(p))
for i in d['intents']:
    if i['id']=='handoff': i['note'] += ' Required sections: objective, state, evidence.'
json.dump(d,open(p,'w'),indent=2)\""

case_ "CLAUDE.md handoff row dropping a section name is caught" \
      "CLAUDE.md handoff row does not mirror" \
      "sed -i.bak 's| evidence, known failures| known failures|' CLAUDE.md"
```

The two cases the phase brief demanded are the first two; cases 3–6 cover the
reverse direction, the field lines, the note regression, and the human mirror
— one per C19 sub-check, matching P3's one-case-per-invariant density. The
`sed` targets were verified unique in the shipped files during authoring
(`^Gate:` appears once in the template; ` evidence, known failures` appears
only in the handoff row of CLAUDE.md).

---

## Rejected alternatives

1. **Template as the sole source of truth, no registry field.** Rejected:
   unenforceable — it is exactly today's arrangement with the prose deleted.
   Nothing would check the CLAUDE.md row against the template, a renamed
   heading would silently change the contract for every future handoff, and
   the intent entry would keep describing its load target in words no check
   can reach. The kernel thesis (P1–P3) is prose-to-data precisely so a check
   can exist; stopping one file short of it here would be arbitrary.
2. **YAML frontmatter on the template (the parent plan's literal mechanism).**
   Rejected on evidence, not taste: change-record frontmatter earns its keep
   through mechanical readers (`mark-unrecorded.sh`, `record-verify.sh`,
   `record-change`, `retro`); a handoff has zero mechanical readers and is
   session-ephemeral by rule (`rules/memory.md`; P3 rejection 8). Frontmatter
   would also duplicate `Gate:`/`Risk:` inside one file, minus the
   criteria/trigger context the `## State` lines carry. The headings are
   already a machine-checkable surface — `grep -qxF` needs no YAML parser.
   The phase keeps the parent plan's intent (checkable structure) and drops
   its mechanism, with this paragraph as the record.
3. **A `kernel.sh handoff` subcommand that scaffolds a blank handoff.**
   Deferred, not adopted: it would be new versioned public surface
   (`docs/COMPATIBILITY.md`) wrapping what is functionally
   `cp templates/handoff.md <dest>`, with no consumer — sessions read the
   template directly, and no runner automates handoffs today. The phase that
   brings a mechanical consumer (P5 repair loop or the ai-se-os runner
   adoption) brings the verb, sized to what that consumer actually needs
   (scaffold vs verify-instance are different verbs).
4. **Per-heading content-shape checks beyond presence** (Evidence must contain
   a fenced block, Resume a `bash` fence, State a Gate line with "N of M").
   Rejected for this phase: C19 validates the *template*, and the template's
   placeholder content trivially satisfies any shape check — so the check
   would assert nothing real. Shape matters on *instances*, and instances are
   out (next rejection). The one shape-adjacent fact that is real in the
   template — the Gate/Risk lines exist — is covered by `required_fields`.
5. **Validate real handoff instances** (mandate a `.engineos/handoffs/` home
   and check documents there). Rejected: handoffs are deliberately not
   persisted (`rules/memory.md`: session-only context dies with the session);
   mandating persistence is a memory-policy change with its own retention and
   PII questions (`rules/context.md` forbids carrying secrets into handed-off
   context), far beyond a phase P2 scoped as "only the handoff-template
   work". If P5's repair loop needs durable handoffs, that spec owns the
   decision.
6. **One combined array of `{kind, name}` objects instead of two string
   arrays.** Rejected: two flat arrays are strictly simpler for every consumer
   (`jq -r '.required_sections[]?'` feeds `grep` directly), the two kinds are
   checked by different regex shapes anyway, and no third kind is on any
   horizon — rule of three, not yet met.
7. **Keep the list in the `note` alongside the new field.** Rejected: one home
   per fact (`rules/memory.md` — "duplication drifts", proven by this very
   note). C19a actively enforces the removal so the list cannot creep back in
   a later note edit.
8. **A standalone `registries/handoff.json`.** Rejected: the contract is one
   intent's payload, ten strings and two labels. A new registry means a new
   envelope, new validator plumbing, a COMPATIBILITY entry, and a new file for
   consumers to know about — for data that has exactly one natural owner
   already: the intent whose load target it describes. `intents.json` already
   carries per-intent structure (P3's `suppressed_by` set the precedent for
   intent-scoped policy fields).

---

## Verification

Definition of done, every command run with output shown in the change record:

- `jq empty registries/intents.json` — clean; `jq -r '.version'` prints
  `1.2.0`.
- `bash -n scripts/validate-engineos.sh scripts/test-validate-engineos.sh` —
  clean.
- `scripts/validate-engineos.sh` — green, and the run visibly includes the
  five new `ok` lines: `handoff intent carries required_sections/...`,
  `handoff template carries every registry-required section`, `...field
  line`, `every handoff template section is declared in the registry`,
  `CLAUDE.md handoff row mirrors...`. Green here also proves the three
  pre-existing drifts were actually fixed, since C19 would fail on the old
  note/row/template combination.
- `scripts/test-validate-engineos.sh` — green with the six new cases, each
  printing `ok`; total case count grows by exactly six.
- `scripts/test-kernel.sh`, `hooks/test-route.sh`,
  `hooks/test-route-advisor.sh`, `hooks/test-gate-advisor.sh`,
  `hooks/test-task-scale.sh` — green **unchanged**: proof P4 touched no
  kernel or hook behavior (there is no kernel/hook diff to have touched it).
- `scripts/run-evals.sh` unaffected (no eval cases change in P4).
- Manual smoke, output shown:
  `grep -c '^## ' templates/handoff.md` prints `10`, and
  `jq -r '.intents[] | select(.id=="handoff") | .required_sections | length' registries/intents.json`
  prints `10` — the two surfaces agree by count as well as by C19's
  name-by-name check.

## Rollback

`git revert` of the P4 commits. `intents.json` returns to 1.1.0 (the note
regains the old list), the template loses its blockquote paragraph, the
CLAUDE.md row returns to the old paraphrase, and C19 plus its six cases
disappear together — nothing else consumes `required_sections`, so revert is
complete and the pre-P4 (unvalidated) behavior is what remains. The surface is
purely additive; no deprecation window is owed under `docs/COMPATIBILITY.md`.
