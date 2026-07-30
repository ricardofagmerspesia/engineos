---
name: 2026-07-30-parallel-fanout-model-tiers
status: done
completed: 2026-07-30
owner: Ricardo Fagmer
spec: docs/specs/2026-07-30-parallel-fanout-model-tiers-design.md
domain: general
---

## What
Make parallel agent fan-out and model-tier assignment first-class in the EngineOS
core: two always-on rule files, a UserPromptSubmit advisor hook, model frontmatter
on every agent, sibling-awareness rules on the coordinators, and a wave-based
`/engineos:implement` flow.

## Why
Big tasks were being executed serially by one agent because nothing in the core
said when or how to split them, and fan-out that did happen had no contract freeze
or file-scope ownership (collision risk). Model selection was a one-line cost note
with no tier mapping — specs, design, and code all ran on whatever the session
model was.

## Scope
- New: `rules/parallelism.md`, `rules/models.md`, `hooks/task-scale-advisor.sh`,
  `hooks/test-task-scale.sh`, `docs/specs/2026-07-30-parallel-fanout-model-tiers-design.md`
- Changed: `CLAUDE.md`, `hooks/hooks.json`, `commands/implement.md`, `README.md`,
  all 18 `agents/*.md`

## Checklist
- [x] Write `rules/parallelism.md` (trigger, procedure, hard rules, mechanism table)
- [x] Write `rules/models.md` (tier table, precedence, escalation)
- [x] Wire both into CLAUDE.md always-on includes
- [x] Add big-task router row + parallelism clause on new-feature row
- [x] Rewrite non-negotiable #6 (models) and add #7 (parallel by default)
- [x] Add `hooks/task-scale-advisor.sh` + register on UserPromptSubmit
- [x] Add `hooks/test-task-scale.sh` smoke test
- [x] Add `model:` frontmatter to all 18 agents
- [x] Add "Parallel discipline" to the 6 dual-mode coordinators
- [x] Rewrite `/engineos:implement` as contract-freeze → waves → one-message dispatch
- [x] Update README (rule rows, hook row, orchestrator row)
- [x] Run all hook smoke tests + shell syntax check

## What was made
Added `rules/parallelism.md` — fan-out triggers (>3 files, >1 domain, ≥3 unblocked
tasks, sweeps), a six-step procedure whose core is *freeze shared contracts before
fanning out* and *dispatch a whole wave in one message over disjoint file scopes*,
hard rules (no two writers per file, flat agent graph, ~6 agents/wave, worktree
isolation, `[fanout]` announcement, honest partial-failure reporting), and a
situation→mechanism table.

Added `rules/models.md` — four tiers bound to today's models: most capable
(`fable`) for spec/PRD/requirements, design (`opus`) for architecture, ADR,
decomposition, hard debugging and security review, build (`sonnet`) for code and
tests, cheap (`haiku`) for mechanical work. Precedence is dispatch-time override >
agent frontmatter > session model, with explicit escalation triggers and a
"never trade correctness for cost" floor. The tier is the contract; model names are
rebindable when a stronger model ships.

Wired both files into the CLAUDE.md always-on block, added a "Big / multi-domain /
sweep work" router row, extended the new-feature row to hand tasks to the fan-out
rule, rewrote non-negotiable #6 as the tier policy and added #7 (parallel by
default; serial execution of independent units is a defect).

Added `hooks/task-scale-advisor.sh` (UserPromptSubmit, non-blocking) which injects
the fan-out reminder on ACTION+SCALE keyword co-occurrence, the most-capable-tier
reminder on spec/PRD wording, and the design-tier reminder on architecture wording;
registered it in `hooks/hooks.json` (plugin mode) and in `install.sh`'s jq merge
(symlink mode, `UserPromptSubmit`), and covered it with `hooks/test-task-scale.sh`
(6 cases including two silence cases). Ran `./install.sh` — hook now live in
`~/.claude/settings.json`.

Gave all 18 agents a `model:` line — `opus` for architecture-analyst,
audit-consolidator and security-reviewer; `sonnet` for the six coordinators, five
MCP leaf specialists, test-writer, qa-tester, ios-builder and android-builder.
Appended a "Parallel discipline" section to the six dual-mode coordinators (stay in
scope and report `### Out of scope`, honor frozen contracts, no subagents, no
repo-wide formatters/codemods/git writes).

Rewrote `commands/implement.md` from 6 to 8 steps: spec gate on the most-capable
tier, change record, coordinator selection, contract freeze on `opus`, wave plan
with `[fanout]` announcement, one-message wave dispatch carrying per-unit scope and
model, verify with named per-unit failures, record.

Updated README with rows for both rule files, the new hook, and the reworked
orchestrator description.

## Verification
```
$ for t in hooks/test-*.sh; do bash "$t"; done
test-governance:  pass=6  fail=0
test-layout:      pass=11 fail=0
test-route:       pass=13 fail=0
test-task-scale:  6 passed, 0 failed
test-verify:      pass=8  fail=0

$ for h in hooks/*.sh scripts/*.sh; do bash -n "$h"; done   # syntax-ok
$ jq . hooks/hooks.json >/dev/null                          # hooks.json valid
$ ./scripts/gen-agent-commands.sh
Done — generated: 30, preserved: 4, removed stale: 0, kept orphaned customized: 0
```
No project typecheck/lint applies — this repo is Markdown + shell.

## Changes registered
```
$ git status --short   (this change only)
 M CLAUDE.md
 M README.md
 M commands/implement.md
 M hooks/hooks.json
 M install.sh
 M agents/{android-builder,architecture-analyst,audit-consolidator,backend-coordinator,
     cicd-specialist,dba-coordinator,devops-coordinator,frontend-coordinator,
     gcp-specialist,ios-builder,kubernetes-specialist,llm-coordinator,
     mobile-coordinator,oracle-specialist,postgres-specialist,qa-tester,
     security-reviewer,test-writer}.md
?? rules/parallelism.md
?? rules/models.md
?? hooks/task-scale-advisor.sh
?? hooks/test-task-scale.sh
?? docs/specs/2026-07-30-parallel-fanout-model-tiers-design.md
```
No renames or file movements. Other modified paths in the working tree
(`commands/agents/*`, `hooks/layout-manifest.sh`, `hooks/test-layout.sh`,
`scripts/gen-agent-commands.sh`, `patterns/`) predate this change and belong to the
`feat/cursor-adapter` branch work.

## Notes
`hooks/routing-map.sh` deliberately untouched: fan-out and model choice are
prompt-driven intents, not file-pattern domains. No agent carries `model: fable` —
frontmatter support for that binding is unverified and no spec-authoring agent
exists; the rule routes spec work via a dispatch-time override instead.

`agents/architecture-analyst.md` and `agents/qa-tester.md` also received their
`model:` line but were left out of this commit — they are still-untracked files
belonging to the in-flight `feat/cursor-adapter` work and will land with it.
