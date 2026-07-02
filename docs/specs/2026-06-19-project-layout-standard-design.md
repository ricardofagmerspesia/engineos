# Standard project layout — scaffold & check

**Date:** 2026-06-19
**Status:** Approved (design)
**Author:** Ricardo Fagmer

## Problem

Projects that adopt EngineOS get a partial governance layout. The `.engineos/`
store is created ad hoc, and human-facing docs (`specs`, `prds`, project rule
deltas) have no agreed home — so they land inconsistently or not at all. The
spesia repo today has only `.engineos/changes/` + `.engineos/archived/`; it is
missing `.engineos/memory/` and has no `docs/specs`, `docs/prds`, or
`docs/rules`. EngineOS checks for unrecorded changes and routes by file pattern,
but does **not** check that a consuming project even has the standard folders.

## Goal

Every EngineOS project converges on one **standard folder set**, and EngineOS
**checks and self-heals** it automatically — beyond the existing route/record/stop
gates — without ever blocking work.

## Decisions (locked with user)

1. **Layout** — human docs under `docs/`; governance state under `.engineos/`.
2. **Rules scope** — project `docs/rules/` holds **deltas only**. Team rules stay
   single-sourced in the `engineos` repo (PR-gated). No full local copy.
3. **Enforcement** — **scaffold + warn, non-blocking**. Create what's missing,
   print one warn line, never block an edit or a Stop.
4. **Spec-first for every change** — each change has a spec in `docs/specs/`, and
   its change record carries a checklist + a "what was made" account, resolved
   before archiving. See "Change-record lifecycle requirements" below.

## Canonical layout

| Path | Holds | Seed on scaffold |
|---|---|---|
| `.engineos/changes/` | Active change records (one per in-progress unit) | `_template.md` + `README.md` |
| `.engineos/archived/` | Completed records, `archived/<YYYY>/<MM>/<DD>/<domain>/` (domain segment added 2026-07-02, see [archive-domain-folder-design](2026-07-02-archive-domain-folder-design.md)) | `README.md` |
| `.engineos/memory/` | Durable repo-specific takeaways | `README.md` |
| `docs/specs/` | Feature/design specs (brainstorm → spec) | `README.md` |
| `docs/prds/` | Product requirement docs | `README.md` + `_template.md` |
| `docs/rules/` | Project-specific rule **deltas** only | `README.md` |

`.engineos/audits/` is intentionally **excluded** from scaffolding — it is created
on the first `/audit` run (existing behavior). Pre-seeding it would imply audits
have happened.

Single source of truth for this table: `hooks/layout-manifest.sh` (path → seed
file). The check script and any future tooling read from it; the table above is
the human mirror, kept in sync — same discipline as `routing-map.sh` vs. the
router table in `CLAUDE.md`.

## Components

### 1. `hooks/layout-manifest.sh`
Sourced library, no side effects. Defines an ordered `LAYOUT_MANIFEST` list of
`relative/dir|seed-template-basename[,second-basename]` entries. Other scripts
source it; it never runs standalone.

### 2. `hooks/ensure-project-layout.sh` (SessionStart)
- Reads stdin JSON, extracts `cwd`.
- Resolves the project root from `cwd` via `git rev-parse --show-toplevel`. If not
  a git work tree, **exit 0 silently** (don't scaffold scratch dirs, `$HOME`, etc.).
- Skips the `engineos` repo itself (its `.engineos/` is the canonical store, not a
  consumer) — detect by presence of `hooks/layout-manifest.sh` at root.
- For each manifest entry: if the dir is missing, `mkdir -p` it and copy each seed
  template from `templates/project-layout/` into it (renaming `*-README.md` →
  `README.md`, `*-template.md` → `_template.md` as the manifest dictates). Never
  overwrite an existing file.
- Collects the list of dirs it created. If non-empty, print exactly one line to
  stdout: `[engineos] scaffolded standard layout: <dir>, <dir> (review seeded READMEs)`.
  If nothing was created, print nothing.
- Always `exit 0`. Fail-soft: any error (no jq, no write permission) → exit 0
  silently. Scaffolding must never break a session start.

### 3. `templates/project-layout/`
New seed files, tone mirroring the existing `.engineos/*/README.md`:
- `specs-README.md` — what specs are, the brainstorm→spec flow, naming.
- `prds-README.md` + `prd-template.md` — PRD purpose + a fill-in template.
- `rules-README.md` — **deltas only**; states team rules live in the `engineos`
  repo and are PR-gated; CLAUDE.md still holds one-line deltas, this folder holds
  longer-form project rules that don't fit a line.

Reuse the existing `.engineos/` READMEs/templates as the seeds for the
`.engineos/*` dirs (already present in this repo) — the manifest points the
`.engineos/*` entries at the existing files so we don't duplicate them.

### 4. `install.sh`
Wire `ensure-project-layout.sh` as a `SessionStart` hook in the jq merge block
(idempotent `add("SessionStart"; ""; $ensure)`), and add the matching no-jq
manual-instruction warn line. Keep `chmod +x hooks/*.sh` (already present).

### 5. Docs sync
- `CLAUDE.md` — add a short "Standard project layout" note + a router/non-negotiable
  reference so the standard is discoverable.
- `.engineos/README.md` — note that `docs/{specs,prds,rules}` are part of the
  standard project layout (this repo is the source, not a typical consumer).
- `rules/memory.md` — the knowledge-home table already maps specs to `docs/specs/`;
  add `docs/prds/` and `docs/rules/` rows so the table is complete.

## Change-record lifecycle requirements

The standard layout is only half the governance; the **change record itself** has
required content. Every unit of work follows:

1. **Spec first, always.** Each change has a spec in `docs/specs/`
   (`<YYYY-MM-DD>-<slug>-design.md`). This tightens the existing non-negotiable
   (spec for >2 files / new features) to **every** change — even a one-file fix
   gets a short spec. The change record links it.
2. **Active record** in `.engineos/changes/` while work is in progress.
3. **On completion → archived as done.** Move to
   `.engineos/archived/<YYYY>/<MM>/<DD>/`, set `status: done` + `completed: <date>`
   (existing `record-change` behavior).
4. **The archived record must contain a checklist and an explanation of what was
   made.** Not intentions — a concrete, past-tense account plus a checked-off task
   list of what actually landed.

### Template change (`.engineos/changes/_template.md`)
Add two things to the existing What / Why / Scope / Verification / Notes template:
- `spec:` field in front matter → relative path to the `docs/specs/` design doc.
- A `## Checklist` section — `- [ ]` items representing the planned steps, checked
  off (`- [x]`) as they land. By archive time, every box is ticked or explicitly
  struck with a reason.

```markdown
---
name: <YYYY-MM-DD>-<short-kebab-slug>
status: active
owner: <name>
spec: docs/specs/<YYYY-MM-DD>-<slug>-design.md
---

## What
<the change in one or two sentences>

## Why
<motivation / problem being solved>

## Scope
<files, modules, or surfaces touched>

## Checklist
- [ ] <planned step>
- [ ] <planned step>

## What was made
<past-tense, concrete account of what actually landed — filled on completion>

## Verification
<how it was checked: typecheck, lint, tests, manual>

## Notes
<decisions, gotchas, links — [[memory-slug]] for durable takeaways>
```

### Skill change (`skills/record-change/SKILL.md`)
- Add a step: **confirm the linked `spec:` exists** in `docs/specs/`; if missing,
  the change is not ready to archive — write the spec first.
- Strengthen the "describe what was made" step to require both the `## What was
  made` prose **and** a fully resolved `## Checklist` (every box ticked or struck
  with a reason) before setting `status: done`.

## Apply to spesia (separate, additive change)

Run the scaffold against spesia so it immediately gains `.engineos/memory/`,
`docs/specs/`, `docs/prds/`, `docs/rules/` with seeded READMEs. Additive only —
no existing file touched. Lands on its own `chore/` branch in the spesia repo,
**not** mixed into the current `fix/patient-data-authz` work.

## Error handling

- Not a git repo / no toplevel → silent exit 0.
- EngineOS repo itself → silent exit 0 (skip).
- Missing template / unwritable dir → skip that entry, continue, exit 0.
- No jq → the hook doesn't need jq for dir logic; parse `cwd` with a minimal
  `sed`/`grep` fallback, or exit 0 if `cwd` can't be read. Never hard-depend on jq.

## Testing

Add to `hooks/test-governance.sh` (or a sibling `test-layout.sh`) cases:
1. Fresh temp git repo → hook creates all 6 dirs + seeds, prints one warn line.
2. Re-run on same repo → creates nothing, prints nothing (idempotent).
3. Existing file in a target dir → not overwritten.
4. Non-git temp dir → no dirs created, exit 0, no output.
5. EngineOS repo root → skipped, exit 0.

## Non-goals (YAGNI)

- No blocking gate. No migration of existing docs into the new folders.
- No `audits/` pre-seed.
- No enforcement of folder *contents* — only existence + seed READMEs.
