# EngineOS Change-Governance System — Design

Date: 2026-06-17
Status: Approved — building

## Goal

Make the EngineOS workflow self-enforcing around every change:

```
PreToolUse(Edit|Write)  → route-before-change.sh  : inject rules + specialist + project CLAUDE.md (+ soft changes/ reminder)
        ↓ edits happen
work complete           → /engineos:record-change  : mark done, describe, log files+movements, git mv changes/→archived/
        ↑ enforced
Stop                    → record-verify.sh         : hard-block ONCE if code changed but no change was recorded
```

## Components

### 1. `hooks/route-before-change.sh` (PreToolUse, matcher `Edit|Write`)

Before any create/edit, classify the target path and inject a `[router]` guidance
string via `hookSpecificOutput.additionalContext` (exit 0, non-blocking).

- **Single source of truth:** the path→domain mapping lives ONLY in
  `hooks/routing-map.sh` (sourced by this hook). `CLAUDE.md`'s router table is the
  human-readable mirror and carries a comment pointing here as canonical. The
  `/engineos:audit` orchestrator routes by domain *token*, not file pattern, so it
  does not duplicate the mapping.
- **Exclusions (no routing):** `changes/`, `archived/`, `memory/`, `docs/`,
  `hooks/`, `*.md` meta, lockfiles. Prevents recursive/noisy routing on meta-edits.
- **Project patterns:** if a `CLAUDE.md` exists up-tree from the target, append
  "follow project CLAUDE.md (project > EngineOS)".
- **Soft changes/ reminder:** if the target is code and no `changes/*.md` with
  `status: active` exists, append a one-line reminder to open a record. Non-blocking.
- **Permission flow:** do NOT set `permissionDecision` (preserve the user's normal
  edit-permission prompt). Documented fallback: if a CC version requires
  `permissionDecision:"allow"` for injection, that is the only case to set it.
- Pure bash + jq, no network. Cheap: one path classify + at most one `ls changes/`.

Routing map (canonical, in `routing-map.sh`):

| Pattern | rules | skill | specialist agent |
|---|---|---|---|
| `*.tsx *.jsx`, `components/ pages/`, styling | frontend, architecture, testing | react-patterns | frontend-coordinator |
| `*.controller/.service/.module/.resolver/.dto/.entity.ts` | backend, architecture, testing | nestjs-patterns | backend-coordinator |
| `*.sql`, `migrations/`, schema | architecture | — | dba-coordinator |
| `*.tf Dockerfile`, k8s/helm yaml, `.github/workflows/` | architecture | — | devops-coordinator |
| prompt/agent/rag/eval paths | llm-apps | llm-engineering | ia-coordinator |
| `*.spec.* *.test.*` | testing | — | test-writer |
| auth/guard/middleware/secret/env | security | — | security-reviewer |
| else | base, git only | — | — |

### 2. `skills/record-change/SKILL.md` (new skill, `/engineos:record-change`)

Procedure run after work is complete:

1. Locate the active `changes/*.md` (`status: active`). If none, create from
   `changes/_template.md`.
2. Write **What was made** (concrete description).
3. **Register changes + movements:** capture `git status --short` and
   `git diff --stat` (staged + unstaged) into the record; note any `git mv`.
4. Set `status: done`, `completed: <YYYY-MM-DD>`.
5. `git mv changes/<file> archived/<file>`.

Scope: changes→archived only (no memory distill, no external tracker).

### 3. `hooks/record-verify.sh` (Stop) — hard-block once

- Guard: `stop_hook_active == true` → exit 0 (never loop).
- If transcript shows code-file Edit/Write this session AND **no file was added
  under `archived/` in the working tree/index** (evidence the record-change skill
  ran its `git mv`) → block once with `{decision:"block", reason:...}`.
- **Evidence-based detection** (NOT transcript text grep): use
  `git status --porcelain archived/` for a new/renamed entry, or
  `git diff --cached --name-status` showing a rename into `archived/`. The skill
  name string in the transcript is unreliable (it appears whenever the workflow is
  merely discussed).
- Independent from `stop-verify.sh`. Two sequential gates accepted (verify, record).

## Wiring

- Add both hooks to `hooks/hooks.json` under PreToolUse and Stop.
- `install.sh`: extend the hook-merge so mode-A users get both. (Blocked from
  taking effect until the user's reverting `settings.json` process is stopped —
  plugin installs via `hooks.json` are unaffected.)
- Register the skill (lives in `skills/`, auto-discovered).

## Verification

- `hooks/test-route.sh`: feed sample PreToolUse payloads (tsx, controller, sql,
  workflow yaml, prompt file, excluded `changes/` file) → assert the emitted
  `additionalContext` matches the expected routing (and excluded paths emit none).
- Stop-gate dry run: craft a fake transcript + temp git state with and without an
  `archived/` rename → assert block vs allow.
- Manual: edit a `.tsx` in a real session, confirm router context appears and the
  permission prompt still fires.

## PR split (per git.md ≤400 lines)

- **PR1 — routing:** `routing-map.sh`, `route-before-change.sh`, hooks.json wiring,
  `test-route.sh`, CLAUDE.md mirror note.
- **PR2 — record/enforce:** `record-change` skill, `record-verify.sh`, hooks.json
  wiring, install.sh update.

## Open risks (carried)

- `additionalContext` without `permissionDecision` injection behavior — confirm in
  a live session.
- settings.json reverter unresolved → mode-A merge won't persist yet.
