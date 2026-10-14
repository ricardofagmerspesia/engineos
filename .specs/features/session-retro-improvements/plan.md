# Plan — session-retro-improvements

PRD: `docs/prds/2026-10-11-session-retro-improvements.md`. ADR:
`docs/adr/2026-10-11-session-retro-improvements.md` (proposed). Branch `main`,
PR unknown (none). Risk overall **medium** (units 02 and 03 change installer and
Stop-hook behaviour on every machine; reversible); autonomy ceiling A3, this
design is A1. Complexity medium; `workflow.task_budgets.medium` = 3-6; this plan
uses 5 units (see "Fewer units?").

## Surfaces
| Surface | Versioned? | Unit |
|---|---|---|
| `install.sh`/`install.ps1` step 4d, `~/.claude/rules/` and new `~/.claude/engineos/rules/` contents, one resolution sentence in `CLAUDE.md`/`AGENTS.md` | installer behaviour; MINOR row | 02 |
| `src/hooks/record-verify.ts` output on active branch-linked record | hook event contract; MINOR additive | 03 |
| `.engineos/changes/_template.md` `branch:` key | template; optional key | 03 |
| `.gitattributes` `linguist-generated` | repo config | 04 |
| `package.json` `test:file`, `scripts/test-file.mjs` | npm script; additive | 04 |
| `rules/parallelism.md` ledger + contract drift, `rules/verification.md` review scope, `templates/handoff.md` | rule prose (not surface); validator mirrors C16/C19 must stay green | 05 |
| `test/fixtures/prompt-source/*.json`, test cases | tests (final stage) | 01 |
| `docs/COMPATIBILITY.md`, `README.md`, `docs/CODEBASE_MAP.md`, `dist/engineos.cjs`, `package-lock.json` | shared wiring, supervisor-owned; units return row/line text in the envelope | supervisor |

## Entities
- Always-on rule: a `rules/*.md` whose H1 ends with `— always on` (contract C1).
- Branch-linked record: `.engineos/changes/*.md` with `status: active` and `branch: <name>` (C2).
- Generated path: a path carrying `linguist-generated=true` in `.gitattributes` (C3).
- Payload fixture: raw UserPromptSubmit stdin JSON, `session_id`/`cwd`/`transcript_path` replaced by `<redacted>` (C4).
- Ledger row: `| Task id | Exclusive paths | Prerequisite ids | Contract path@revision | Owner | Worktree | State |` (C5).

## Frozen contracts — revision `sri-v1` (owner: supervisor)
C1 always-on marker string: `— always on` in the H1 line; `rules/gates.md` gains it.
   Always-on rules link into `~/.claude/rules/` (auto-loaded); every other
   `rules/*.md`, deprecated included, links into `~/.claude/engineos/rules/`
   (not auto-loaded). Resolution sentence (byte-identical in `CLAUDE.md` and
   `AGENTS.md`, appended to the "Paths are relative here" bullet): "On an
   installed machine a routed or deprecated rule named `rules/<name>.md` is read
   at `~/.claude/engineos/rules/<name>.md`; always-on rules are already in context."
C2 frontmatter key `branch:` (string, optional); matched byte-for-byte against `git rev-parse --abbrev-ref HEAD`.
C3 attribute `linguist-generated=true` on `dist/engineos.cjs`, `package-lock.json`, `console/package-lock.json`, `docs/context/markdown-inventory.json`.
C4 fixture file names: `task-notification.json`, `agent-message.json`, `system-notification.json`, `system-reminder-notification.json`, `user-with-trailing-frame.json`.
C5 ledger column `Worktree`: `none` or the repository-relative worktree path (`.claude/worktrees/agent-<id>`).
A contract change pauses only its consumers and returns to the supervisor (rules/parallelism.md).

## Acceptance (EARS)
| Id | Claim |
|---|---|
| SRI-01 | When the repository is checked out, the five C4 fixtures shall exist and parse as the hook envelope. |
| SRI-02 | When `prompt-advisor` receives any of the four injected-frame fixtures, it shall emit no `[router]` escalation and no fan-out guidance (silent or notification notice only). |
| SRI-03 | When `prompt-advisor` receives `user-with-trailing-frame.json`, it shall route the prompt as a user prompt (existing behaviour preserved). |
| SRI-04 | When the e2e test spawns `dist/engineos.cjs hook prompt-advisor` with `task-notification.json` on stdin, stdout shall contain no `escalate` guidance. |
| SRI-05 | When the installer runs, `~/.claude/rules/` shall contain symlinks only for always-on rules (C1). |
| SRI-06 | While a rule file is routed or deprecated, the installer shall link it into `~/.claude/engineos/rules/` and never into `~/.claude/rules/`. |
| SRI-07 | When the installer finds a symlink in `~/.claude/rules/` pointing into the EngineOS checkout for a non-always-on rule, it shall remove that symlink and print `rule unlinked: <name>`. |
| SRI-08 | If `~/.claude/rules/<name>` is a regular file, the installer shall skip it with the existing warning and never delete it. |
| SRI-09 | When unit 02 lands, `docs/COMPATIBILITY.md` shall carry a row naming the installer change and the always-on marker, and `README.md` rows for the 11 always-on rules shall say "Every session". |
| SRI-10 | While routed rules are not linked, `route-before-change` hook guidance shall still name the routed rule path (unchanged). |
| SRI-11 | When the unrecorded marker exists and an active record names the current branch, `record-verify` shall return a `message` that names the record path and branch, and shall not block. |
| SRI-12 | When the unrecorded marker exists and no active record names the current branch, `record-verify` shall block with the existing reason text, byte-identical. |
| SRI-13 | When the `.deferred` marker exists, `record-verify` shall stay silent regardless of records. |
| SRI-14 | When `_template.md` is read, it shall document the optional `branch:` key and when to set it. |
| SRI-15 | When unit 03 lands, `docs/COMPATIBILITY.md` shall carry a MINOR row for the new `message` path, and `docs/CODEBASE_MAP.md` line 143 shall describe it. |
| SRI-16 | When `git check-attr linguist-generated -- <path>` runs for each C3 path, it shall answer `true`; for `evals/intent-routing-cases.jsonl` it shall answer `unspecified`. |
| SRI-17 | When `npm run test:file -- src/hooks/record-verify.test.ts` runs, it shall compile and run only `build/hooks/record-verify.test.js`; a path without `.test.ts` or outside `src/` shall exit 1 with a one-line usage message. |
| SRI-18 | When `docs/CODEBASE_MAP.md` "Tests" line is read, it shall state the `src/**` to `build/**` mapping and the `test:file` script. |
| SRI-19 | When the ledger table in `rules/parallelism.md` is read, it shall carry the `Worktree` column (C5) and a sentence stating that a worktree absent from the ledger is not a task's. |
| SRI-20 | When `templates/handoff.md` is read, its `## Files` section shall carry a worktree line and validator C19 shall report no change to required sections/fields. |
| SRI-21 | When the "Task ledger and contract drift" section is read, it shall require the contract owner to enumerate existing tests asserting the superseded behaviour in the return envelope and the final-stage brief to update them before the first run. |
| SRI-22 | When `rules/verification.md` "Final security review and scan consent" is read, it shall state that review scope excludes generated paths (C3) unless the brief names them, reported as a count. |
| SRI-23 | When `node dist/engineos.cjs validate` runs after units 02-05 integrate, every check shall pass (C16/C19/C36 mirrors unchanged). |
| SRI-24 | When `CLAUDE.md` and `AGENTS.md` are read after unit 02, both shall carry the C1 resolution sentence byte-identically, and C36 shall still pass. |
| SRI-25 | When unit 02 returns, its envelope shall re-run the reference inventory below and report zero references that resolve to `~/.claude/rules/` and zero references left without a resolution category. |
| SRI-26 | When a session starts on an installed machine after unit 02, the context shall contain the 11 always-on rules and no routed or deprecated rule (evidence: the session's loaded-rules listing, shown). |

## Reference inventory (read-only grep, 2026-10-11; regex `rules/[a-z-]+\.md`)
| Directory | References | Files |
|---|---|---|
| agents/ | 46 | 15 |
| skills/ | 46 | 19 |
| commands/ | 19 | 7 |
| hooks/ | 0 | 0 |
| src/ | 211 | 60 |
| registries/ | 39 | 7 |
| patterns/ | 0 | 0 |
| templates/ | 42 | 12 |
| **Total** | **403** | **120** |

Of the 403, 17 name rules that do not exist (`no-such`, `nope`, `does-not-exist`,
`a`, `b`, `alpha`, `beta`, `zeta`, `x`, `ok`) and live in validator/kernel test
fixtures (`src/checks/*.test.ts`, `src/lib/deferrals*.ts`, `src/kernel/route.test.ts`,
one comment in `src/checks/registries-coherence.ts`); 2 are `.cursor/rules/*.mdc`
references in `templates/cursor/commands/bypass.md` (cursor adapter, not this
repo's `rules/`). Every reference is repo-relative; none names `~/.claude/rules`,
`$CLAUDE_DIR/rules` or `CLAUDE_PLUGIN_ROOT` (only `install.sh`/`install.ps1`
step 4d name `$CLAUDE_DIR/rules`). Syntax forms: plain 142, backticked 94,
single-quoted TS strings 92, markdown-link 41, `@rules/` imports 14, JSON 11.

Resolution after the move, by category:
1. **Machine readers (src/, registries/)** — validator checks C3/C14/C16 and
   mirrors, `src/lib/deferrals.ts`, kernel `rules` ids, hook `hook_guidance`
   strings resolve against the EngineOS checkout root (`ctx.exists('rules/x.md')`);
   untouched by where `~/.claude` links live.
2. **`@rules/<name>.md` imports (CLAUDE.md, AGENTS.md, templates/project-claude*)**
   — resolved by the host relative to the importing file; untouched.
3. **Model-facing prose (agents/, skills/, commands/, templates/adapters)** —
   today satisfied by the auto-load of everything; after the move, always-on
   rules stay in context and routed/deprecated rules resolve through the C1
   sentence to `~/.claude/engineos/rules/<name>.md`. No text rewrite; no
   dangling reference.
4. **Cursor adapter (`.cursor/rules/*.mdc`)** — separate mechanism; untouched.

Review-boundary judgement: unit 02 touches `install.sh`, `install.ps1`,
`rules/gates.md` (H1) and one identical sentence in `CLAUDE.md`/`AGENTS.md` —
five files, one reviewer pass, one domain (installation + resolution statement).
It stays one unit; a split would separate the sentence from the move it explains.
`CLAUDE.md` and `AGENTS.md` are dirty in the working tree; the worker edits on
top of the working copy and never reverts or stages.

## Risk and rollback per unit
| Unit | Risk | Trigger | Rollback |
|---|---|---|---|
| 01 | low | tests only | delete fixtures and cases |
| 02 | medium | blast radius: every installed machine; `~/.claude` mutation | re-run previous installer revision |
| 03 | medium | Stop-hook contract; blast radius: every consumer | `git revert` + rebuild `dist` |
| 04 | low | repo config | `git revert` |
| 05 | low | prose | `git revert` |

## Fewer units?
4 units are possible by merging 04 into 05 (both small): rejected — different
owners and tiers (cheap mechanical config vs validator-mirrored rule prose) and
different reviewers. 3 are possible by merging 02 and 03 (both runtime): rejected —
independent review boundaries, both medium risk, different languages (bash/ps1 vs TS).
Fewer than 3 would mix tests into implementation units against `rules/verification.md`.

## Sequencing
All five units are independent in the graph and run on `main` after PR #132
merges (developer decision O1, 2026-10-11). Shared docs/dist rows are integrated
by the supervisor after each return.

## Ledger
| Task id | Exclusive paths | Prerequisite ids | Contract path@revision | Owner | Worktree | State |
|---|---|---|---|---|---|---|
| 01-prompt-source-golden-set | `test/fixtures/prompt-source/**`, `src/hooks/prompt-source.test.ts`, `src/hooks/prompt-advisor.test.ts`, `src/hooks/prompt-advisor.e2e.test.ts` | none (after #132 merge) | plan.md@sri-v1 (C4) | test-writer | none | planned |
| 02-rule-loading-scope | `install.sh`, `install.ps1`, `rules/gates.md` (H1 only), `CLAUDE.md`, `AGENTS.md` (one sentence each) | none | plan.md@sri-v1 (C1) | devops-coordinator | none | planned |
| 03-record-gate-in-progress | `src/hooks/record-verify.ts`, `src/hooks/record-verify.test.ts`, `.engineos/changes/_template.md`, `skills/record-change/SKILL.md` | none | plan.md@sri-v1 (C2) | backend-coordinator | none | planned |
| 04-generated-diff-and-test-file | `.gitattributes`, `package.json`, `scripts/test-file.mjs` | none | plan.md@sri-v1 (C3) | devops-coordinator | none | planned |
| 05-ledger-and-contract-drift-rules | `rules/parallelism.md`, `rules/verification.md`, `templates/handoff.md` | none | plan.md@sri-v1 (C3, C5) | docs-writer | none | planned |
