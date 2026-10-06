# Markdown context reduction

Risk: medium — reversible team-wide instruction edits. Autonomy: A2.

## Goal and scope

Review all 777 repository Markdown files inventoried at task start, shorten active
agent guidance, and preserve each activity's purpose, obligations and completion
conditions. Inventory includes hidden Markdown but excludes dependencies, build
output and .git. Source snapshot and per-file bytes/word counts live at
/private/tmp/engineos-markdown-baseline-20261006 for comparison and rollback.

## Frozen preservation contract

- Keep routing-before-writes, one supervisor, useful host-bounded parallelism,
  exclusive ownership, same branch/PR, NestJS/Mastra/JS stack, risk gates and final
  approval-only tests. Compress explanations and duplicates, not obligations.
- Preserve public paths/names, frontmatter fields, router row count/loads, numeric
  policy mirrors, command contracts, agent return envelopes and template headings.
- Keep existing evidence, historical specs/ADRs/archives, test fixtures and vendor
  sources intact. Summarize retained records in a searchable inventory with their
  purpose and loading condition; do not overwrite original evidence with a digest.
- AGENTS.md and .agents are protected. IDE/vendor mirrors are reviewed/indexed;
  edit their canonical source and use existing regeneration only where supported.
- Use focused entrypoints and conditional references. Small self-contained docs
  may be retained unchanged when extra compression would lose their purpose.
- All prior working-tree changes are the baseline and must remain intact. No
  installations, git writes, branch/PR changes, tests/evals/benchmarks or publishing.

## Task ledger and exclusive ownership

| Id | Scope | Dependencies | State |
|---|---|---|---|
| core | rules/**/*.md, CLAUDE.md, README.md, CONTEXT.md, evals/RUBRIC.md | this contract | integrated |
| skills | skills/**/*.md, patterns/**/*.md | this contract | integrated |
| roles | agents/**/*.md, commands/**/*.md, templates/**/*.md | this contract | integrated |
| records | docs/**/*.md except this spec/new context overview, .engineos/**/*.md except current record, hidden vendor/IDE Markdown and test Markdown read-only | this contract | integrated |
| integration | context overview/inventory, this spec/change record, supported generator outputs, final static review/checks | all returns | integrated; non-test validation complete |

Each worker reads every file in its assigned inventory, shortens meaningful active
guidance where safe, and writes a temporary review report containing each path,
purpose, loading condition, action and preservation notes. Canonical generated
agent commands are retained until supervisor regeneration. Workers run no gates
and spawn no agents. Independent read-only final semantic review after integration.

## Acceptance criteria and final verification

1. Every baseline path has a reviewed/indexed disposition and concise purpose;
   protected, generated, vendored and historical files have explicit retention reasons.
2. Active guidance is measurably shorter in aggregate, with before/after byte/word
   counts reported honestly (word counts are not measured model tokens).
3. Only routed activity guidance and applicable reference sections load by default;
   inventory/history are searched on demand, not imported wholesale.
4. Independent reviewer checks goals, gates, permissions, roles and contracts against
   the snapshot; restore or repair any lost obligation before claiming completion.
5. Final non-test typecheck/build, generator drift handling, Markdown/frontmatter,
   preserved structural contracts, links and whitespace reviewed. Behavioral
   validator, tests and evals remain pending explicit user approval.

Rollback: restore only task-changed files from the snapshot, retaining earlier work.
Any new reference path must be justified and discoverable from its entrypoint;
no silent public renames. No extra output-artifact offer, as the user declined.
