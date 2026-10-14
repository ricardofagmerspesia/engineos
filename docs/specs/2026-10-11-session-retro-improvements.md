# Session-retro improvements — design index

Seven frictions from the 2026-10-11 session retro, consolidated into five
delivery units. Branch `main`; PR unknown (none). Risk medium (units 02, 03);
this design is A1 — no source, config or rule edits were made.

| Artifact | Path |
|---|---|
| PRD | `docs/prds/2026-10-11-session-retro-improvements.md` |
| ADR (proposed) | `docs/adr/2026-10-11-session-retro-improvements.md` |
| Plan (contracts `sri-v1`, SRI-01..23, ledger) | `.specs/features/session-retro-improvements/plan.md` |
| Checks (claim → evidence) | `.specs/features/session-retro-improvements/checks.md` |
| Decision flows (C1, C2; Mermaid + Archify HTML) | `.specs/features/session-retro-improvements/flows.md` |
| Graph | `docs/specs/session-retro-improvements/units.json` |
| Tickets | `docs/specs/session-retro-improvements/tickets/01-05` |
| Change record | `.engineos/changes/2026-10-11-session-retro-improvements.md` |

## Graph
| Unit | Retro items | Owner | Tier | Deps | Risk |
|---|---|---|---|---|---|
| 01-prompt-source-golden-set | 1 | test-writer | build | none (graph runs on `main` after PR #132 merges) | low |
| 02-rule-loading-scope | 2 | devops-coordinator | build | none | medium |
| 03-record-gate-in-progress | 6 | backend-coordinator | build | none | medium |
| 04-generated-diff-and-test-file | 4, 7 | devops-coordinator | cheap | none | low |
| 05-ledger-and-contract-drift-rules | 3, 5, 4 (review scope) | docs-writer | build | none | low |

Supervisor-owned shared wiring: `docs/COMPATIBILITY.md`, `README.md`,
`docs/CODEBASE_MAP.md`, `dist/engineos.cjs`, `package-lock.json`.

## Acceptance ownership
SRI-01..04 → 01; SRI-05..08, 10, 24, 25 → 02; SRI-11..14 → 03; SRI-16, 17 → 04;
SRI-19..22 → 05; SRI-09, 15, 18, 23, 26 → supervisor (shared docs, final validate,
developer-shown session evidence). Unit 02 also owns one identical sentence in
`CLAUDE.md`/`AGENTS.md`; the reference inventory (403 refs, 120 files) is in the plan.

## Scheduler validation
`node dist/engineos.cjs scheduler plan --units <units.json> --run-id sri-design --host-capacity 3 --time-ms <epoch>`
was run on 2026-10-11 with host capacity 3 (policy cap; actual host slots
unknown at design time). Result recorded in the change record. Scopes are
disjoint; no cycles; all five units `ready`.

## Gates
Design gate: approach and rejected alternatives recorded (ADR); contracts
frozen at `sri-v1`; no decision rule matched; ADR decisions O1-O4 resolved by
the developer on 2026-10-11. Exit criteria pending developer review of PRD scope
and the plan contracts.
Before implementation: `rules/parallelism.md` Prototype preview choice.
