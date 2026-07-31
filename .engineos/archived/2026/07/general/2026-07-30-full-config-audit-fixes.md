---
name: 2026-07-30-full-config-audit-fixes
status: done
owner: Ricardo Fagmer
spec: n/a — audit-driven corrective changes; the audit findings (5 parallel auditors over rules/, agents/, skills/, hooks/, router+packaging) serve as the spec
domain: general
---

## What
Second, deeper repo-wide audit (rules, router table, agents/roles, skills, hooks,
commands, installers, docs) followed by corrective changes across 72 files:
deduplicated rules with one declared owner per fact, closed every router load-list
(table, hook, and agent lists now agree), fixed six real hook bugs, tightened agent
permissions and descriptions, rewrote skill triggers/boundaries, renamed the
misspelled `analisy-architecture` command and `1-Analisys` pattern, and refreshed
stale docs/installers/CI.

## Why
Config had drifted into contradictions: the authoritative routing hook emitted
subsets of the table's load lists (DBA route lost `data.md` entirely), generic
`*/hooks/*`/`*/docs/*` exclusions swallowed React `src/hooks/` edits (no routing,
no change-record gate), the Stop gate's no-jq parser was GNU-sed-only and could
block forever on macOS, `record-change` wiped every session's gate flag, skills
restated rules they claimed not to restate (one with a divergent error envelope),
and docs/commands referenced paths and inventories that no longer existed.

## Scope (by layer)
- `CLAUDE.md` + `rules/*` — router rows fixed/merged/added (record-change row; merged
  verification rows; deleted redundant multi-domain row), Output-artifact recursion and
  pure-question exemption rules, non-negotiables dedup, single-owner rule dedup,
  parallelism trigger clarified, TDD softened, memory table completed.
- `hooks/*` — routing-map synced to canonical load lists + new store-builder arm +
  anchored security patterns; EngineOS-scoped exclusions; BSD-safe stop_hook_active
  parse; jq transcript parsing; portable timeout watchdog; missing-linter no-block;
  NotebookEdit matchers; seed-when-dir-exists; stale-flag reaping; shared
  `lib-common.sh`; test suites extended to 87 assertions incl. new `test-post-edit.sh`.
- `agents/*` + `commands/agents/*` + `scripts/` — stray `</content>` removed;
  read-only tools enumerated (audit-consolidator); Skill/mcp__nestjs grants; leaf
  descriptions de-conflicted; boilerplate dedup; interview commands no longer
  dispatch a subagent; alias grep frontmatter-scoped.
- `skills/*` — adr/strategy and eval-harness/llm-engineering boundaries encoded in
  descriptions; nestjs error envelope aligned to `code` taxonomy; record-change
  spec gate aligned to non-negotiable #1 and session-scoped flag clear; strategy
  template/mode fixes; usage-report tracks all 8 skills.
- `commands/*`, `patterns/`, `install.*`, `.claude-plugin/`, `templates/`, `README`,
  `docs/START|ADOPTION`, `ci.yml` — rename + reference sweep, installer prune +
  rules/patterns install + ps1 jq check, version sync, audit command fixes
  (always dispatch leaves, security in `all`, opus for AUDIT, honest read-only claim),
  docs refreshed to 18-agent reality, CI drift guard for generated commands.

## Verification
All 6 hook test suites green (87 pass, 0 fail), `bash -n` clean on all scripts,
hooks.json/plugin.json/marketplace.json parse, gen-agent-commands.sh idempotent
(28 generated, 6 customized preserved), no stray tags, no residual misspelling
outside one intentional installer comment and historical archives.

## Deferred (decisions flagged to owner)
Tool-enforced read-only for audit mode (auditor agent variants / scoped Bash);
mobile-coordinator mirror-only vs greenfield scope; SessionStart scaffolding
opt-out for third-party repos; record-verify escape hatch/TTL; fate of
`templates/cursor/commands/production-env.md`; stop-verify coverage for py/go/rs.
