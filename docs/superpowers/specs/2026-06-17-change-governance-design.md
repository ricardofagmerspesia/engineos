# EngineOS Change-Governance System — Design

Date: 2026-06-17
Status: Implemented (detection mechanism changed from git-status to flag-file — see §3)

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

### 3. Marker-file detection (IMPLEMENTED — supersedes the git-status idea below)

Detection is a **flag file**, not transcript text and not a `git status archived/`
check. This is deterministic and avoids both the transcript-string false-positive
(the skill name appears whenever the workflow is merely discussed) and the
committed-record blind spot of git-status detection.

- **`hooks/mark-unrecorded.sh` (PostToolUse Edit|Write):** on a code-file edit
  (excluding `changes/ archived/ memory/ docs/ hooks/`), write a flag at
  `<git-dir>/ENGINEOS_UNRECORDED.<session_id>`. Ordered BEFORE `post-edit-check.sh`
  so a failing typecheck (exit 2) cannot stop the flag being set.
- **`hooks/record-verify.sh` (Stop):** guard `stop_hook_active==true` → exit 0
  (never loop). If `<git-dir>/ENGINEOS_UNRECORDED.<session_id>` exists → block once.
- **`record-change` skill:** final step `rm -f <git-dir>/ENGINEOS_UNRECORDED*`
  clears the flag.

Both hooks resolve `<git-dir>` from `cwd` (`git rev-parse --absolute-git-dir`) so
they always target the same file, and scope the marker to `session_id` so a flag
left by a crashed/cleared session never blocks a different session, and linked
worktrees (per-worktree git-dir) don't cross-talk.

Independent from `stop-verify.sh`. Two sequential Stop gates accepted (verify,
then record) — each loop-guarded.

## Wiring (IMPLEMENTED)

- All five hooks wired in `hooks/hooks.json` (PreToolUse: route; PostToolUse:
  mark-unrecorded then post-edit-check; Stop: stop-verify then record-verify).
- `install.sh` merges all five idempotently for mode-A users.
- `record-change` skill lives in `skills/`, auto-discovered (invoked as the
  `record-change` skill — NOT a `/engineos:` slash command).

## Verification (IMPLEMENTED)

- `hooks/test-route.sh` (12/12): routing assertions incl. excluded paths.
- `hooks/test-governance.sh` (6/6): marker set, same-session block, cross-session
  isolation, loop guard, glob clear.
- `.github/workflows/ci.yml` runs both suites + shellcheck + JSON validation + an
  end-to-end secrets-gate test on every PR.
- Manual (still recommended once): edit a `.tsx` in a real session, confirm router
  context appears and the permission prompt still fires.

## Open risks (carried)

- `additionalContext` without `permissionDecision` injection — confirm in a live
  session (the only item still needing a real-session check).
- settings.json reverter was resolved during implementation; mode-A merge persists.
