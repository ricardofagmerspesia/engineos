# Changelog

All notable changes to EngineOS. Format loosely follows Keep a Changelog; versions
track `.claude-plugin/plugin.json` (semver).

## [1.2.0] - 2026-06-17

### Added
- MCP-bound leaf specialists (read-only): `kubernetes`, `gcp`, `postgres`, `oracle`, `cicd`.
- `audit-consolidator` agent — merges specialist reports into one status report (verdict + root cause + ordered plan); Jira read-only for context.
- Orchestrator commands `/engineos:audit` and `/engineos:implement` (`commands/`) — fan out to coordinators + leaves, consolidate; implement is spec-gated and record-closed.
- Router rows for the audit/implement orchestrators.
- `install.sh` now symlinks `commands/` (mode A): orchestrators available as `/audit`, `/implement`.

### Changed
- Renamed the Atlassian MCP template entry `jira` → `mcp-atlassian` to match the community server and live config.

## [1.1.0] - 2026-06-17

### Added
- Change-tracking lifecycle: `changes/` → `archived/` → `memory/` with READMEs and a record template.
- Pre-change routing hook (`hooks/route-before-change.sh` + canonical `hooks/routing-map.sh`) injecting rules/skill/specialist guidance before each edit.
- `record-change` skill + Stop record gate (`hooks/record-verify.sh`, `hooks/mark-unrecorded.sh`) enforcing that code changes are recorded.
- Five domain coordinator agents: backend, frontend, dba, devops, llm (dual-mode audit/implement).
- `rules/data.md` (migration safety + data lifecycle) and `rules/observability.md` (logging schema, tracing, error taxonomy).
- Repo CI (`.github/workflows/ci.yml`): shellcheck, JSON validation, hook test suites, secrets-gate end-to-end test.
- `hooks/test-governance.sh`, `LICENSE` (MIT), `CONTRIBUTING.md`, this changelog.

### Fixed
- CRITICAL: secrets gate was a silent no-op on macOS (empty regex alternation aborted BSD grep, swallowed by `2>/dev/null`). Now fails closed, broadened patterns.
- Routing map referenced five coordinator agents that did not exist; now built and reconciled with the `CLAUDE.md` router table.
- Change-governance marker now resolved identically by both hooks and scoped to session id (no stale-flag false blocks, no worktree cross-talk).
- `find_up` infinite loop on relative paths in `post-edit-check.sh`.
- install.sh: write-once backup, permissions-template guard, empty-glob guards, hook ordering.

## [1.0.0]

### Added
- Initial EngineOS: constitution + router (`CLAUDE.md`), always-on and per-domain rules, stack skills (NestJS/React/LLM), security-reviewer + test-writer agents, quality-gate hooks, MCP baseline, installer.
