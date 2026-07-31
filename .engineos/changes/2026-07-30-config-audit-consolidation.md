---
name: 2026-07-30-config-audit-consolidation
status: active
owner: Ricardo Fagmer
spec: n/a — audit-driven corrective changes; findings recorded in this record
domain: general
---

## What
Repo-wide audit of routes, roles, rules, skills, permissions and routing logic, plus
the corrective changes that were unambiguous: routing false positives, a missing
mobile route, hook-wiring divergence, domain-token conflicts, false MCP claims,
a contradictory spec threshold, an error-shape conflict, and three test suites that
were never run in CI.

## Why
The configuration had drifted in ways that silently changed behavior: three unanchored
globs mis-routed ordinary files to the LLM coordinator, mobile edits routed to the web
frontend coordinator, `/engineos:audit llm` was unparseable while `ia` was undocumented,
and the plugin hook manifest had lost the SessionStart entry that both installers wire —
so plugin-install users never got the layout scaffold that non-negotiable #5 promises.

## Scope
- `hooks/routing-map.sh` — mobile route added ahead of frontend; LLM globs anchored;
  `*/app/*` frontend arm removed.
- `hooks/hooks.json` — SessionStart -> ensure-project-layout.sh (restores parity with
  install.sh / install.ps1; all three now wire 7 identical entries).
- `hooks/route-before-change.sh` — `prev` convergence guard added to `find_up`.
- `hooks/task-scale-advisor.sh` — countable nouns in SCALE made plural-only.
- `hooks/test-route.sh`, `hooks/test-task-scale.sh`, `hooks/test-layout.sh` — regression
  cases for every routing fix; portable skip for the no-jq sandbox.
- `.github/workflows/ci.yml` — test-task-scale, test-layout, test-verify now run.
- `commands/audit.md`, `commands/implement.md` — domain enum `ia`->`llm` (alias kept),
  `mobile` added, "all five coordinators" corrected to six, unknown-token fallback,
  AUDIT-mode enforcement limits stated.
- `CLAUDE.md` — routing note (mobile, single-match semantics, jq dependency), backend row
  loads observability.md, DBA/DevOps MCP claims corrected, non-negotiable #5 no longer
  contradicts #1.
- `rules/backend.md` — error shape reconciled with the observability taxonomy.
- `agents/audit-consolidator.md` — Grep/Glob added so it can locate reports.

## Checklist
- [x] Audit produced (7 sections)
- [x] Routing false positives fixed + regression-tested
- [x] Hook wiring parity restored across the three sources
- [x] Domain tokens unified
- [x] Rule conflicts resolved (spec threshold, error shape, MCP claims)
- [x] Unrun test suites wired into CI
- [ ] Open decisions resolved with owner (dangling skills, cursor template dedup,
      patterns/ rename, coordinator AUDIT-mode enforcement)

## What was made
<filled on completion: past-tense, concrete account of what actually landed>

## Verification
Local (this machine has no `jq`, so the four jq-dependent suites cannot run here):
- `bash -n` clean on all `hooks/*.sh`, `install.sh`, `scripts/*.sh`.
- `hooks/test-layout.sh`: pass=10 fail=0 skip=1 (skip is the no-jq sandbox, which
  needs working symlinks; previously a false FAIL on Windows).
- Routing verified by sourcing `routing-map.sh` and asserting 14 representative paths.
- Hook-wiring parity across `hooks.json` / `install.sh` / `install.ps1`: 7 = 7 = 7, in sync.
- All five JSON manifests parse.
Not run locally: `test-route.sh`, `test-governance.sh`, `test-verify.sh`,
`test-task-scale.sh` (require jq), and `shellcheck` (not installed). CI is the first
real run for those.

## Notes
The jq absence is itself a finding: `route-before-change.sh`, `mark-unrecorded.sh`,
`record-verify.sh` and `task-scale-advisor.sh` all `command -v jq || exit 0`, so on this
machine routing guidance and the change-record Stop gate have never fired. Documented in
CLAUDE.md rather than fixed, because adding jq-free fallbacks to four hooks is a separate
piece of work.
