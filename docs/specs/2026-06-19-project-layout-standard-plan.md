# Standard Project Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every EngineOS project converge on one canonical folder set via a non-blocking SessionStart scaffold-and-warn check, and tighten the change-record lifecycle (spec-first, checklist, "what was made").

**Architecture:** A sourced manifest (`hooks/layout-manifest.sh`) is the single source of truth for the standard dirs and their seed files. A SessionStart hook (`hooks/ensure-project-layout.sh`) reads it, creates missing dirs in the session's git project, seeds READMEs from `templates/project-layout/`, prints one warn line, and always exits 0. `install.sh` wires the hook. Shell tests in `hooks/test-layout.sh` drive it TDD-style. Docs and the change-record template/skill are updated to document the standard.

**Tech Stack:** Bash (POSIX-ish, must run on macOS bash 3.2 + BSD coreutils), jq (optional, fail-soft), git, Markdown.

**Spec:** `docs/specs/2026-06-19-project-layout-standard-design.md`

**Branch:** `chore/project-layout-standard` (engineos repo, already created).

---

## File Structure

- Create `hooks/layout-manifest.sh` — sourced library; `LAYOUT_MANIFEST` array of `dir|seed-spec` entries. No side effects.
- Create `hooks/ensure-project-layout.sh` — SessionStart hook; scaffold + warn; always exit 0.
- Create `hooks/test-layout.sh` — shell test harness for the hook.
- Create `templates/project-layout/specs-README.md`
- Create `templates/project-layout/prds-README.md`
- Create `templates/project-layout/prd-template.md`
- Create `templates/project-layout/rules-README.md`
- Modify `.engineos/changes/_template.md` — `spec:` field, `## Checklist`, `## What was made`.
- Modify `skills/record-change/SKILL.md` — verify spec exists; require resolved checklist before `status: done`.
- Modify `install.sh` — wire `SessionStart` hook (jq merge + no-jq warn).
- Modify `CLAUDE.md`, `.engineos/README.md`, `rules/memory.md` — document the standard.

---

## Manifest seed convention

Each manifest entry is `relative/dir|seedfile:destname[,seedfile:destname]`.
`seedfile` is a basename under `templates/project-layout/`; `destname` is the file
name written into the target dir. The `.engineos/*` entries point at the existing
in-repo READMEs/templates rather than duplicating them, using an absolute
`$REPO_DIR`-relative source marked with a `@` prefix.

Final manifest (used by Task 1):

```
.engineos/changes|@.engineos/changes/_template.md:_template.md,@.engineos/changes/README.md:README.md
.engineos/archived|@.engineos/archived/README.md:README.md
.engineos/memory|@.engineos/memory/README.md:README.md
docs/specs|specs-README.md:README.md
docs/prds|prds-README.md:README.md,prd-template.md:_template.md
docs/rules|rules-README.md:README.md
```

`@`-prefixed source = path relative to the EngineOS repo root. Plain source =
basename under `templates/project-layout/`.

---

### Task 1: Layout manifest library

**Files:**
- Create: `hooks/layout-manifest.sh`

- [ ] **Step 1: Write the failing test (manifest sourcing)**

Create `hooks/test-layout.sh`:

```bash
#!/usr/bin/env bash
# Tests for the standard-layout scaffold: manifest + ensure-project-layout hook.
# Run: hooks/test-layout.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
pass=0; fail=0
ok(){ pass=$((pass+1)); }
no(){ fail=$((fail+1)); echo "FAIL: $1"; }

# --- manifest sources cleanly and is non-empty ---
( source "$DIR/layout-manifest.sh" && [ "${#LAYOUT_MANIFEST[@]}" -ge 6 ] ) \
  && ok || no "manifest did not load 6+ entries"

echo "---"; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/test-layout.sh`
Expected: FAIL — `layout-manifest.sh` does not exist (`No such file`), fail count ≥1.

- [ ] **Step 3: Write the manifest**

Create `hooks/layout-manifest.sh`:

```bash
#!/usr/bin/env bash
# Single source of truth for the EngineOS standard project layout.
# Sourced only — no side effects. Each entry: relative/dir|seedspec
# seedspec = comma-separated src:dest pairs.
#   src "@path"      -> path relative to the EngineOS repo root (reuse in-repo files)
#   src "basename"   -> basename under templates/project-layout/
#   dest             -> filename written into the target dir
# Mirror of the table in docs/specs/2026-06-19-project-layout-standard-design.md.
# audits/ is intentionally absent (created on first /audit).
LAYOUT_MANIFEST=(
  ".engineos/changes|@.engineos/changes/_template.md:_template.md,@.engineos/changes/README.md:README.md"
  ".engineos/archived|@.engineos/archived/README.md:README.md"
  ".engineos/memory|@.engineos/memory/README.md:README.md"
  "docs/specs|specs-README.md:README.md"
  "docs/prds|prds-README.md:README.md,prd-template.md:_template.md"
  "docs/rules|rules-README.md:README.md"
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash hooks/test-layout.sh`
Expected: PASS — `pass=1 fail=0`.

- [ ] **Step 5: Commit**

```bash
git add hooks/layout-manifest.sh hooks/test-layout.sh
git commit -m "feat(hooks): add standard-layout manifest + test harness"
```

---

### Task 2: Seed templates

**Files:**
- Create: `templates/project-layout/specs-README.md`
- Create: `templates/project-layout/prds-README.md`
- Create: `templates/project-layout/prd-template.md`
- Create: `templates/project-layout/rules-README.md`

- [ ] **Step 1: Write `specs-README.md`**

Create `templates/project-layout/specs-README.md`:

```markdown
# docs/specs/

Feature and design specs. Every change starts here: brainstorm the idea, write
the spec, then the implementation plan. One file per change.

Naming: `<YYYY-MM-DD>-<short-kebab-slug>-design.md` (and `-plan.md` for the plan).

A spec states the problem, the decisions taken, the components, error handling,
testing, and explicit non-goals. The matching change record in
`.engineos/changes/` links back to its spec via the `spec:` front-matter field.
```

- [ ] **Step 2: Write `prds-README.md`**

Create `templates/project-layout/prds-README.md`:

```markdown
# docs/prds/

Product requirement docs — the *what* and *why* of a product surface, upstream of
a technical spec. Use `_template.md` as the starting point. One PRD per feature
area; link the resulting design spec(s) under `docs/specs/`.
```

- [ ] **Step 3: Write `prd-template.md`**

Create `templates/project-layout/prd-template.md`:

```markdown
---
name: <short-kebab-slug>
status: draft
owner: <name>
---

## Problem
<the user/business problem, with evidence>

## Goal & success metrics
<what success looks like, measurable>

## Users & use cases
<who, and the jobs they need done>

## Requirements
<must-have behaviors — numbered, testable>

## Non-goals
<explicitly out of scope>

## Open questions
<unknowns to resolve before/while building>
```

- [ ] **Step 4: Write `rules-README.md`**

Create `templates/project-layout/rules-README.md`:

```markdown
# docs/rules/

Project-specific rule **deltas** only. Team engineering standards live in the
shared `engineos` repo (`rules/`) and are changed via PR — do NOT copy them here.

Use this folder for longer-form rules unique to THIS project that don't fit a
one-line delta in `CLAUDE.md` (which remains the home for short deltas). If a rule
here would benefit every project, promote it to the `engineos` repo instead.
```

- [ ] **Step 5: Commit**

```bash
git add templates/project-layout/
git commit -m "feat(templates): add project-layout seed READMEs + PRD template"
```

---

### Task 3: Scaffold hook — happy path (creates dirs + seeds)

**Files:**
- Create: `hooks/ensure-project-layout.sh`
- Modify: `hooks/test-layout.sh`

- [ ] **Step 1: Add the failing test**

Append to `hooks/test-layout.sh` before the final `echo "---"` block:

```bash
# --- scaffold a fresh git repo: creates all 6 dirs + seeds, prints one warn line ---
T=$(mktemp -d); ( cd "$T" && git init -q )
OUT=$(printf '{"cwd":"%s","session_id":"S1"}' "$T" | bash "$DIR/ensure-project-layout.sh")
miss=0
for d in .engineos/changes .engineos/archived .engineos/memory docs/specs docs/prds docs/rules; do
  [ -d "$T/$d" ] || { miss=1; echo "  missing $d"; }
done
[ "$miss" -eq 0 ] && ok || no "scaffold did not create all dirs"
[ -f "$T/docs/specs/README.md" ] && ok || no "specs README not seeded"
[ -f "$T/docs/prds/_template.md" ] && ok || no "prd template not seeded as _template.md"
[ -f "$T/.engineos/changes/_template.md" ] && ok || no "changes template not seeded"
printf '%s' "$OUT" | grep -q '^\[engineos\] scaffolded' && ok || no "no warn line on scaffold"

# --- idempotent: re-run creates nothing, prints nothing ---
OUT2=$(printf '{"cwd":"%s","session_id":"S1"}' "$T" | bash "$DIR/ensure-project-layout.sh")
[ -z "$OUT2" ] && ok || no "re-run was not silent (not idempotent)"

# --- existing file is never overwritten ---
echo "KEEP" > "$T/docs/rules/README.md"
printf '{"cwd":"%s","session_id":"S1"}' "$T" | bash "$DIR/ensure-project-layout.sh" >/dev/null
[ "$(cat "$T/docs/rules/README.md")" = "KEEP" ] && ok || no "existing file overwritten"
rm -rf "$T"

# --- non-git dir: nothing created, no output, exit 0 ---
N=$(mktemp -d)
OUT3=$(printf '{"cwd":"%s","session_id":"S1"}' "$N" | bash "$DIR/ensure-project-layout.sh"); rc=$?
[ "$rc" -eq 0 ] && [ -z "$OUT3" ] && [ ! -d "$N/docs" ] && ok || no "non-git dir was scaffolded"
rm -rf "$N"

# --- engineos repo itself is skipped ---
OUT4=$(printf '{"cwd":"%s","session_id":"S1"}' "$REPO" | bash "$DIR/ensure-project-layout.sh")
[ -z "$OUT4" ] && ok || no "engineos repo not skipped"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/test-layout.sh`
Expected: FAIL — `ensure-project-layout.sh` missing; multiple FAIL lines.

- [ ] **Step 3: Write the hook**

Create `hooks/ensure-project-layout.sh`:

```bash
#!/usr/bin/env bash
# EngineOS SessionStart: scaffold the standard project layout, non-blocking.
# Creates any missing standard dir in the session's git project and seeds its
# README/_template from templates/project-layout/ (or reuse in-repo files for the
# .engineos/* dirs). Prints ONE warn line listing what it created; silent when the
# layout is already complete. ALWAYS exits 0 — must never break a session start.
#
# Skips: non-git dirs (scratch, $HOME) and the engineos repo itself (its
# .engineos/ is the canonical store, not a consumer).
set -uo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INPUT=$(cat 2>/dev/null || true)

# Parse cwd: prefer jq, fall back to a minimal grep so we never hard-depend on jq.
if command -v jq >/dev/null 2>&1; then
  CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
else
  CWD=$(printf '%s' "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"cwd"[^"]*"\([^"]*\)".*/\1/')
fi
[ -n "$CWD" ] || exit 0

# Resolve project root; bail silently if not a git work tree.
ROOT=$(cd "$CWD" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$ROOT" ] || exit 0

# Skip the engineos repo itself (it ships the manifest at its root).
[ -f "$ROOT/hooks/layout-manifest.sh" ] && [ -f "$ROOT/install.sh" ] && exit 0

# shellcheck source=/dev/null
source "$REPO_DIR/hooks/layout-manifest.sh" 2>/dev/null || exit 0

resolve_src() {  # $1 = src token -> absolute path or empty
  case "$1" in
    @*) printf '%s/%s' "$REPO_DIR" "${1#@}" ;;
    *)  printf '%s/templates/project-layout/%s' "$REPO_DIR" "$1" ;;
  esac
}

created=()
for entry in "${LAYOUT_MANIFEST[@]}"; do
  dir="${entry%%|*}"; seeds="${entry#*|}"
  target="$ROOT/$dir"
  [ -d "$target" ] && continue
  mkdir -p "$target" 2>/dev/null || continue
  created+=("$dir")
  IFS=',' read -ra pairs <<< "$seeds"
  for pair in "${pairs[@]}"; do
    src="${pair%%:*}"; dest="${pair#*:}"
    abs=$(resolve_src "$src")
    [ -n "$abs" ] && [ -f "$abs" ] && [ ! -f "$target/$dest" ] \
      && cp "$abs" "$target/$dest" 2>/dev/null || true
  done
done

if [ "${#created[@]}" -gt 0 ]; then
  IFS=', '; printf '[engineos] scaffolded standard layout: %s (review seeded READMEs)\n' "${created[*]}"
fi
exit 0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash hooks/test-layout.sh`
Expected: PASS — `fail=0`.

- [ ] **Step 5: Commit**

```bash
git add hooks/ensure-project-layout.sh hooks/test-layout.sh
git commit -m "feat(hooks): scaffold-and-warn SessionStart layout check"
```

---

### Task 4: Wire the hook in install.sh

**Files:**
- Modify: `install.sh` (jq merge block ~line 120; no-jq warn block ~line 158)

- [ ] **Step 1: Add the ENSURE var and the SessionStart merge**

In `install.sh`, locate the block that sets `POST`, `STOP`, `ROUTE`, `MARK`,
`RECORD` (just before the `jq --arg post ...` call) and add:

```bash
  ENSURE="$REPO_DIR/hooks/ensure-project-layout.sh"
```

Then in the `jq --arg ...` invocation, add `--arg ensure "$ENSURE"` to the arg
list and add this line to the jq program, after the `add("Stop"; ...; $record)`
line:

```jq
    | add("SessionStart"; ""; $ensure)
```

- [ ] **Step 2: Add the no-jq manual instruction**

In the `else` branch that warns when jq is missing, add after the last `warn`
line:

```bash
  warn "  SessionStart -> $REPO_DIR/hooks/ensure-project-layout.sh"
```

- [ ] **Step 3: Verify install.sh still parses**

Run: `bash -n install.sh`
Expected: no output, exit 0 (syntax OK).

- [ ] **Step 4: Dry-verify the jq program is valid**

Run:
```bash
echo '{}' | jq --arg post p --arg stop s --arg route r --arg mark m --arg record rec --arg ensure e '
  def add($event; $matcher; $cmd):
    .hooks[$event] //= []
    | (if ([.hooks[$event][]? | .hooks[]? | select(.command == $cmd)] | length) == 0
       then .hooks[$event] += [{matcher: $matcher, hooks: [{type: "command", command: $cmd}]}]
       else . end);
  .hooks //= {}
  | add("PreToolUse";  "Edit|Write"; $route)
  | add("PostToolUse"; "Edit|Write"; $mark)
  | add("PostToolUse"; "Edit|Write"; $post)
  | add("Stop";        "";           $stop)
  | add("Stop";        "";           $record)
  | add("SessionStart"; "";          $ensure)
'
```
Expected: JSON with a `SessionStart` entry containing command `e`.

- [ ] **Step 5: Commit**

```bash
git add install.sh
git commit -m "feat(install): wire ensure-project-layout as SessionStart hook"
```

---

### Task 5: Change-record template — spec field, checklist, what-was-made

**Files:**
- Modify: `.engineos/changes/_template.md`

- [ ] **Step 1: Rewrite the template**

Replace the full contents of `.engineos/changes/_template.md` with:

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
<filled on completion: past-tense, concrete account of what actually landed>

## Verification
<how it was checked: typecheck, lint, tests, manual>

## Notes
<decisions, gotchas, links — [[memory-slug]] for durable takeaways>
```

- [ ] **Step 2: Verify front matter parses**

Run:
```bash
awk '/^---$/{c++; next} c==1{print}' .engineos/changes/_template.md | grep -E '^(name|status|owner|spec):'
```
Expected: four lines — `name:`, `status:`, `owner:`, `spec:`.

- [ ] **Step 3: Commit**

```bash
git add .engineos/changes/_template.md
git commit -m "feat(governance): require spec link, checklist, what-was-made in records"
```

---

### Task 6: record-change skill — enforce spec + resolved checklist

**Files:**
- Modify: `skills/record-change/SKILL.md`

- [ ] **Step 1: Add a spec-exists step**

In `skills/record-change/SKILL.md`, after step 1 ("Locate the active record"),
insert a new step (renumber the rest):

```markdown
2. **Confirm the spec exists.** Read the record's `spec:` front-matter field and
   verify that file exists under `docs/specs/`. If it is missing or the field is
   empty, the change is not ready to archive — write the spec first (brainstorm →
   `docs/specs/<YYYY-MM-DD>-<slug>-design.md`), set `spec:`, then continue.
```

- [ ] **Step 2: Strengthen the describe step**

In the "Describe what was made" step, replace its body with:

```markdown
   **Describe what was made.** Fill `## What was made` with a concrete, past-tense
   account of what actually landed (not intentions), and resolve `## Checklist` —
   every item ticked `- [x]`, or struck through with a one-line reason if dropped.
   A record with unticked, unexplained checklist items is not done.
```

- [ ] **Step 3: Add checklist to the done gate**

In the "Mark done" step, prepend a guard sentence:

```markdown
   Only after `## What was made` is written and `## Checklist` is fully resolved:
   set front matter `status: done` and add `completed: <YYYY-MM-DD>`.
```

- [ ] **Step 4: Verify the skill still reads coherently**

Run: `grep -nE '^[0-9]+\.|status: done|Checklist|spec:' skills/record-change/SKILL.md`
Expected: renumbered steps present; checklist + spec guards visible.

- [ ] **Step 5: Commit**

```bash
git add skills/record-change/SKILL.md
git commit -m "feat(record-change): gate archive on spec + resolved checklist"
```

---

### Task 7: Docs sync

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.engineos/README.md`
- Modify: `rules/memory.md`

- [ ] **Step 1: Add the standard layout to CLAUDE.md**

In `CLAUDE.md`, under "Non-negotiables", add an item:

```markdown
5. Standard project layout: every project carries `.engineos/{changes,archived,memory}`
   + `docs/{specs,prds,rules}`. The SessionStart hook scaffolds anything missing
   (non-blocking). Spec-first for every change; the change record links its spec and
   carries a checklist + a "what was made" account before it is archived.
```

- [ ] **Step 2: Note docs/ dirs in .engineos/README.md**

In `.engineos/README.md`, after the subfolder table, add:

```markdown
Beyond this folder, the standard project layout also includes `docs/specs/`
(design specs), `docs/prds/` (product requirements), and `docs/rules/` (project
rule deltas only — team rules live in the engineos repo). The SessionStart
`ensure-project-layout` hook scaffolds any of these that are missing.
```

- [ ] **Step 3: Complete the knowledge-home table in rules/memory.md**

In `rules/memory.md`, in the "Where knowledge lives" table, add two rows after the
"Feature requirements/specs" row:

```markdown
| Product requirements (what/why) | Project `docs/prds/` | PRD template |
| Project rule deltas (longer-form) | Project `docs/rules/` | PR to project |
```

- [ ] **Step 4: Verify all three edits landed**

Run: `git diff --stat CLAUDE.md .engineos/README.md rules/memory.md`
Expected: three files changed, insertions only.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md .engineos/README.md rules/memory.md
git commit -m "docs: document standard project layout + change-record lifecycle"
```

---

### Task 8: Full test run + apply to spesia

**Files:**
- None modified (verification + one-shot scaffold of the spesia repo).

- [ ] **Step 1: Run the layout test harness**

Run: `bash hooks/test-layout.sh`
Expected: `fail=0`.

- [ ] **Step 2: Run the governance test harness (no regression)**

Run: `bash hooks/test-governance.sh`
Expected: `fail=0`.

- [ ] **Step 3: Scaffold the spesia repo (additive, own branch)**

```bash
cd /Users/ricardofagmer/projects/spesia
git checkout -b chore/engineos-standard-layout
printf '{"cwd":"%s","session_id":"manual"}' "$PWD" \
  | bash /Users/ricardofagmer/projects/engineos/hooks/ensure-project-layout.sh
git status --short
```
Expected: warn line listing `.engineos/memory, docs/specs, docs/prds, docs/rules`
(changes/ + archived/ already exist), and `git status` shows the new dirs/files.

- [ ] **Step 4: Verify spesia layout is complete**

Run:
```bash
cd /Users/ricardofagmer/projects/spesia
for d in .engineos/changes .engineos/archived .engineos/memory docs/specs docs/prds docs/rules; do
  [ -d "$d" ] && echo "OK  $d" || echo "MISS $d"
done
```
Expected: six `OK` lines.

- [ ] **Step 5: Commit the spesia scaffold**

```bash
cd /Users/ricardofagmer/projects/spesia
git add .engineos/memory docs/specs docs/prds docs/rules
git commit -m "chore(engineos): scaffold standard project layout"
```

---

## Self-Review

**Spec coverage:**
- Canonical layout → Task 1 (manifest), Task 3 (hook creates them). ✓
- `docs/{specs,prds,rules}` seeds → Task 2. ✓
- `audits/` excluded → manifest omits it (Task 1 comment). ✓
- SessionStart scaffold + warn, non-blocking, exit 0 → Task 3 (hook), Task 4 (wiring). ✓
- Non-git skip + engineos self-skip → Task 3 tests + hook logic. ✓
- Idempotent / never overwrite → Task 3 tests. ✓
- Spec-first + checklist + what-was-made → Task 5 (template), Task 6 (skill). ✓
- Docs sync (CLAUDE.md, .engineos/README, rules/memory) → Task 7. ✓
- Apply to spesia, additive, own branch → Task 8. ✓
- Tests (5 cases from spec) → Task 1 + Task 3 cover: fresh scaffold, idempotent, no-overwrite, non-git, engineos-skip. ✓

**Placeholder scan:** No TBD/TODO; every code/step block is complete. ✓

**Type/name consistency:** `LAYOUT_MANIFEST` array name, `resolve_src`, manifest
`dir|src:dest` format, warn-line prefix `[engineos] scaffolded standard layout:`,
and the `spec:` front-matter field are used identically across Tasks 1, 3, 5, 6. ✓

**Note on bash 3.2:** arrays + `read -ra` + `<<<` herestrings are used (Task 3);
all supported on macOS bash 3.2. No associative arrays (`declare -A`) anywhere.
