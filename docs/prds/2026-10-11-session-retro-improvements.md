---
name: session-retro-improvements
status: draft
owner: Ricardo Fagmer
---

## Problem
The 2026-10-11 session retro (routing-replacement work, PR #132) recorded seven
recurring frictions. Each one cost a turn, a re-run or an unattributable
artifact; none is fixed on `main` today. Evidence is that session, verified
against the tree on 2026-10-11 (see "Verified facts").

1. The UserPromptSubmit advisor classifies harness-injected text
   (`<task-notification>` blocks, `[SYSTEM NOTIFICATION - NOT USER INPUT]`
   wrappers, subagent reports) as user prompts and emits router-dispatch and
   fan-out instructions. Every notification in one stretch (4+) misrouted;
   "misroute three" is on record in `.engineos/changes/2026-10-10-routing-replacement-plan.md`.
2. Deprecated rule files (`rules/production-backend-standards.md`,
   `rules/backend-python.md`) and routed domain rules (frontend, data, testing)
   sit in agent context every turn, including pure kernel TypeScript work.
3. A contract change (`max_intents`) left two tests asserting the old
   behaviour; they surfaced only at the approved final test run.
4. A 51k-line diff dominated by `dist/engineos.cjs`, lockfiles and
   `evals/**/*.jsonl` degraded both review agents.
5. Agent worktrees accumulated under `.claude/worktrees/agent-*` (32 at the
   time; 14 remain on 2026-10-11); dirty ones could not be attributed to a unit.
6. The `record-verify` Stop hook blocks whenever code changed and the change
   record is not archived, forcing a `.deferred` marker each session during
   multi-turn PR work.
7. Compiled tests live at `build/<dir>/*.test.js` (no `src/` segment); the
   mapping is not discoverable from `package.json`, which produced a glob error.

## Verified facts (2026-10-11, this tree unless noted)
- Rule loading: `install.sh` step 4d (lines 199-216) and `install.ps1` step 4d
  (lines 294-303) symlink EVERY `rules/*.md` into `~/.claude/rules/`, which the
  host loads into every session as global rules. `CLAUDE.md` @-imports only
  `base`, `security`, `git`, `context`. The deprecated files are loaded by no
  router row (correct) but reach every session through the symlink directory.
  Seven other always-on rules reach sessions ONLY through that directory.
- PR #132 (`feat/routing-replacement`, checkout `/Users/ricardofagmer/projects/engineos-routing`)
  adds `src/hooks/prompt-source.ts`, markers in `policy.router.source_markers`
  and 12 unit tests covering the literal prefixes `<task-notification>`,
  `<agent-message from=` and `[SYSTEM NOTIFICATION - NOT USER INPUT]`, plus
  `prompt-advisor.test.ts` cases feeding `<task-notification> ...`. No captured
  real harness payload exists as a fixture on either branch. `main` has no
  `prompt-source.ts`, so sessions running `main`'s `dist` still misroute.
- `src/hooks/record-verify.ts` blocks once when `<gitdir>/ENGINEOS_UNRECORDED.<sid>`
  exists and no `.deferred` sibling exists; the block text and the `.deferred`
  suffix are versioned surface (`docs/CODEBASE_MAP.md` line 143).
- `.gitattributes` exists (EOL policy only); no `linguist-generated` or
  `-diff` attributes. Tracked generated files: `dist/engineos.cjs` (11.8k lines),
  `package-lock.json`, `console/package-lock.json` (7k), `docs/context/markdown-inventory.json` (13k).
  `evals/*.jsonl` are hand-authored golden sets validated by the evals runner.
- `rules/parallelism.md` ledger has no worktree column; `templates/handoff.md`
  has no worktree field. No rule mentions enumerating stale tests on a contract change.
- `package.json` scripts: `test` = `tsc -p tsconfig.json && cd build && node --test`;
  `tsconfig.json` `rootDir: src`, `outDir: build`.

## Goal & success metrics
- Zero router-dispatch/fan-out guidance on harness-injected prompts, proven by
  fixtures captured from real payloads (not only literal-prefix unit tests).
- Session context carries only the always-on rules by default; deprecated
  files are loaded by nothing while they remain on disk for their window.
- A contract change ships with the list of tests asserting the superseded
  behaviour, so the final test run finds none stale.
- Review agents see no generated file content unless the task is about it.
- Every worktree is attributable to a ledger row.
- Multi-turn PR work with an active, branch-linked change record is not
  blocked at Stop; the gate still blocks unrecorded work.
- `npm run test:file -- src/<dir>/<name>.test.ts` runs that one test.

## Users & use cases
EngineOS maintainers and consuming developers running the hooks; supervisors
briefing workers; reviewers (critic, security-reviewer, code-review skill).

## Requirements
Acceptance claims carry stable ids `SRI-01` to `SRI-23` in
`.specs/features/session-retro-improvements/plan.md`; this list names the outcomes.
1. Captured-payload fixtures for the three injected frame kinds; the advisor is
   silent or notification-only on each; a user prompt with a trailing frame still routes.
2. The installer links only always-on rules into the host's auto-loaded rules
   directory, links every other rule (deprecated included, for its
   COMPATIBILITY window) into a directory the host does not auto-load, removes
   stale symlinks it created earlier, never deletes files it did not create,
   derives the always-on set from one source, and leaves no `rules/*.md`
   reference dangling (inventory in the plan).
3. `record-verify` reports instead of blocking when an active change record
   names the current branch; block text, marker and `.deferred` are unchanged.
4. `.gitattributes` marks generated paths; reviewer scope excludes them unless named.
5. `test:file` script resolving `src/**/*.test.ts` to its compiled path.
6. Ledger and handoff carry a worktree per unit; contract changes enumerate
   affected existing tests at implementation time and update them in the
   approved final stage.
7. Every change touching versioned surface gets a `docs/COMPATIBILITY.md` row.

## Non-goals
- Deleting or renaming deprecated rule files (COMPATIBILITY window).
- Changing the router, the judge or `prompt-source.ts` classification logic.
- Checking PR state from a hook (no network in hooks); branch is the evidence.
- Editing the external `code-review` skill; changing `agents/*.md` (generated mirrors).
- Automatic worktree cleanup (git writes stay under `rules/git.md`).

## Open questions
ADR decisions O1-O4 (landing order, rule-link directories, generated-file
attributes, default-branch gate behaviour) were resolved by the developer on
2026-10-11. Remaining: developer review of this PRD's scope and of the plan
contracts; the prototype preview choice before implementation.
