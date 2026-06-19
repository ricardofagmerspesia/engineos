# EngineOS → Cursor adapter

**Date:** 2026-06-19
**Status:** Approved (design)
**Author:** Ricardo Fagmer

## Problem

EngineOS installs **only** into `~/.claude/` (`install.sh`: router import →
`~/.claude/CLAUDE.md`, skills → `~/.claude/skills`, agents → `~/.claude/agents`,
hooks → `~/.claude/settings.json`). Cursor's agent reads a disjoint tree:
global `~/.cursor/` + project `.cursor/`. Nothing bridges them.

Observed failure: a change made with Cursor's agent did not classify intent,
load rules, run the spec→change workflow, or dispatch the right agents — because
**no EngineOS router, rules, governance skills, or hooks exist in the Cursor
tree.** The `.cursor/` content present in spesia is a separate, hand-authored,
partial setup missing the routing + governance layer.

Root cause: **EngineOS has no Cursor target.** This is a missing integration, not
a runtime bug.

## Goal

Full EngineOS parity in Cursor — router, rules, skills, agents, and the
governance hooks — provisioned by `install.sh` into both the global `~/.cursor/`
and each project's `.cursor/`, staying in sync the way the Claude Code side does.

## Key compatibility findings (evidence)

- Cursor `hooks.json` schema v1: events include `sessionStart`, `preToolUse`,
  `postToolUse`, `afterFileEdit`, `beforeShellExecution`, `stop`, `subagentStop`.
- Command hooks exchange JSON over stdin/stdout. **Exit 0 = ok, exit 2 = block**
  (same as CC). Other non-zero = fail open unless `failClosed: true`.
- **Cursor stdin reuses CC's `tool_input` nesting** — the working `rtk-rewrite.sh`
  reads `.tool_input.command`. So EngineOS extraction of `.tool_input.file_path`
  and `.cwd` is expected to port directly. (Confirm empirically in Phase 0.)
- **Output schema differs:** `preToolUse`/`beforeShellExecution` →
  `{permission, user_message, agent_message, updated_input}`; `postToolUse` →
  `{additional_context}`; `subagentStop` → `{followup_message}`. CC's
  `{decision:"block", reason}` has no direct analog — Cursor blocks via **exit 2**
  and surfaces text via `agent_message`/`additional_context`.
- **Matchers are JavaScript regex**, not POSIX — use `\s`, never `[[:space:]]`,
  in `hooks.json` matchers (scripts may keep POSIX internally).
- Rules: `.cursor/rules/*.mdc` with frontmatter `description`, `globs`,
  `alwaysApply`. `alwaysApply:true` = always in context; `globs` = auto-attach by
  file pattern. Skills: `.cursor/skills/<name>/SKILL.md`. Agents: `.cursor/agents/*.md`.

## Architecture: single-source core + thin adapters

To avoid CC/Cursor drift, refactor each governance hook's logic into a shared
library sourced by **both** the CC hook and a Cursor adapter:

```
hooks/lib/<name>.core.sh      # pure logic: takes file/cwd/etc, returns status + message
hooks/<name>.sh               # CC adapter: parse CC stdin -> core -> CC output ({decision}/exit2)
hooks/cursor/<name>.sh        # Cursor adapter: parse Cursor stdin -> core -> Cursor output (exit2 + agent_message/additional_context)
```

Where a hook's parsing is already `tool_input`/`cwd`-based and identical across
hosts, the Cursor adapter is a one-liner that maps the output schema only. Rules
(`.mdc`) and skills/agents are generated/copied, not logic — no core needed.

## Components

### Phase 0 — empirical schema probe (de-risk first)
A throwaway `afterFileEdit` + `stop` + `sessionStart` echo hook that dumps stdin
to a temp file, run once in Cursor, to confirm the exact field names
(`file_path`, `cwd`, transcript/loop fields) per event. Record findings in this
spec's appendix. Everything below assumes `tool_input.file_path` + `cwd`; Phase 0
either confirms or corrects that before the adapters are written.

### Phase 1 — rules (`templates/cursor/rules/*.mdc`)
Generate EngineOS rules as Cursor rules:
- **`engineos-router.mdc`** — `alwaysApply:true`. Ports the `CLAUDE.md` router:
  classify intent, spec-first, which rules to read + skills/agents to use, the
  `[router]` announce line, and the non-negotiables (incl. standard layout +
  change-record lifecycle).
- **Always-on rules** — `engineos-base.mdc`, `engineos-security.mdc`,
  `engineos-git.mdc`, `engineos-memory.mdc` (`alwaysApply:true`), bodies sourced
  from `rules/*.md`.
- **Glob-scoped stack rules** — `engineos-backend.mdc` (`globs: **/*.ts` under
  service dirs etc.), `engineos-frontend.mdc`, `engineos-architecture.mdc`,
  `engineos-data.mdc` (`globs: **/*.sql`), mirroring the `routing-map.sh`
  path→domain map so Cursor auto-attaches the right rule by file — the
  deterministic equivalent of the PreToolUse router hook.
- Generation keeps `rules/*.md` as the single source; the `.mdc` wrappers add
  frontmatter + an import/inline of the rule body. A small generator
  (`scripts/gen-cursor-rules.mjs` or shell) builds them so they don't drift.

### Phase 2 — skills & agents mirror
- Copy/symlink EngineOS `skills/*` → Cursor skills dir, and `agents/*.md` →
  Cursor agents dir. SKILL.md frontmatter (`name`, `description`) is already the
  shape Cursor uses. Governance skills (`tlc-spec-driven`, `record-change`, `adr`,
  `nestjs-patterns`, `react-patterns`, `release-notes`, `eval-harness`) must be
  present so the router can invoke them.
- Resolve the existing `link-workspace-packages copy` / `monitor-ci copy` cruft
  collision only if it conflicts; otherwise leave project-local skills untouched
  (never overwrite a non-EngineOS skill).

### Phase 3 — hooks port (`templates/cursor/hooks/` + `hooks/cursor/`)
Map each EngineOS hook to a Cursor event via the shared core:
| EngineOS hook (CC) | Cursor event | Block mechanism |
|---|---|---|
| `route-before-change.sh` (PreToolUse Edit\|Write) | `preToolUse` matcher `Write` | `agent_message` (advisory; no block) |
| `post-edit-check.sh` (PostToolUse) lint+typecheck | `afterFileEdit` matcher `Write` | exit 2 + `agent_message` on failure |
| `mark-unrecorded.sh` (PostToolUse) | `afterFileEdit` matcher `Write` | none (sets flag) |
| `stop-verify.sh` (Stop) runs tests | `stop` | exit 2 + message; `loop_limit` guards loop |
| `record-verify.sh` (Stop) | `stop` | exit 2 + message |
| `ensure-project-layout.sh` (SessionStart) | `sessionStart` | none (scaffold + message) |

- The Stop loop guard changes: CC uses `stop_hook_active`; Cursor uses
  `loop_limit` on the hook entry. Core logic stays; the Cursor adapter relies on
  `loop_limit` instead of reading `stop_hook_active`.
- hooks.json matchers in **JS regex** (`Write`, `\.ts$`, etc.).

### Phase 4 — `install.sh` provisioning (both trees)
Add a Cursor section, gated and idempotent like the CC section:
- Detect Cursor (`~/.cursor` exists) — if absent, skip silently (don't force).
- Global: write/merge `~/.cursor/hooks.json` (preserve existing rtk + other
  hooks — merge, never clobber), copy hook scripts to `~/.cursor/hooks/`, mirror
  skills/agents to `~/.cursor/skills` + `~/.cursor/agents`, write the always-on +
  router `.mdc` to a global rules location if Cursor supports user rules; else
  document that rules are project-scoped.
- Project: a helper (run by the SessionStart scaffold hook or an
  `engineos-cursor-init`) drops the generated `.mdc` rules + `mcp`/hooks into a
  repo's `.cursor/` without overwriting hand-authored project rules (write under
  an `engineos-` filename prefix so collisions are impossible).
- The jq merge for `~/.cursor/hooks.json` must preserve `version:1` and append
  EngineOS hooks idempotently (key by command path), exactly like the CC
  settings merge.

### Phase 5 — docs + tests
- `hooks/test-cursor-adapter.sh`: feed each Cursor adapter a Cursor-shaped stdin
  fixture and assert the output schema (`permission`/`additional_context`/exit 2).
  Reuse the core logic so behavior matches the CC tests already passing.
- Update `CLAUDE.md` / `README.md` / `ADOPTION.md` to document Cursor support and
  the `.claude` vs `.cursor` parity, including what is enforced where.

## Error handling / safety

- Cursor detection optional → skip when absent.
- All merges idempotent + non-clobbering (rtk hook and hand-authored project
  rules survive).
- Hooks fail open by default (no `failClosed`) EXCEPT the verification gate, which
  blocks via exit 2 (broken code must not pass) — mirror the CC stance.
- `engineos-` filename prefix on every generated `.mdc`/hook script so we never
  collide with a user's own Cursor files.

## Non-goals (YAGNI)

- No rewrite of the existing CC hooks' behavior — only refactor logic into a
  shared core, output unchanged on the CC side (the passing CC tests must stay
  green).
- No migration of the project's existing hand-authored `.cursor` rules/skills.
- No Cursor Tab-specific hooks (`afterTabFileEdit`) beyond what maps cleanly.

## Rollout

Stacked, atomic PRs off `main` (each ≤400 lines): P0 probe → P1 rules → P2
skills/agents → P3 hooks → P4 install.sh → P5 docs/tests. Branch
`feat/cursor-adapter` carries the series.

## Appendix — Phase 0 findings
_(to be filled after the schema probe runs in Cursor)_
