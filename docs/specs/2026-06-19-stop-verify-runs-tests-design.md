# Stop gate runs scoped verification

**Date:** 2026-06-19
**Status:** Approved (design)
**Author:** Ricardo Fagmer

## Problem

EngineOS has two verification touch points:

- `hooks/post-edit-check.sh` (PostToolUse) — runs **lint + typecheck** on the
  changed package after every Edit/Write and blocks (exit 2) on failure. Good.
- `hooks/stop-verify.sh` (Stop) — only greps the transcript for *evidence* that
  some verification-shaped command ran. It **runs nothing**, and is satisfied if
  any unrelated lint/test/build ran earlier in the session.

Result: **no hook actually runs the test suite.** Broken code can reach the end of
a turn as long as something verification-shaped happened to run once. The team
needs a hard gate: lint + typecheck + tests actually run, broken code blocks.

## Goal

The Stop gate **runs** scoped lint + typecheck + tests for the packages changed
this session and **blocks finishing** if any fail — while staying fast (affected
packages only) and never breaking repos that have no test runner.

## Decisions (locked with user)

1. **When** — at **Stop**, actually run tests (not per-edit; lint+typecheck stay
   per-edit via `post-edit-check.sh`).
2. **Scope** — **affected/changed packages only** (Nx per-project targets, or the
   changed package's scripts). Not the whole repo.
3. **No runner** — **no-op silently**. If no test runner / no script is detected,
   skip that step; if nothing ran at all, exit 0 (don't block). Keeps the engineos
   shell-only repo and non-JS / fresh projects unblocked.

## Component: rewrite `hooks/stop-verify.sh`

Keep the filename and the existing `install.sh` / `hooks.json` Stop wiring.
Replace the body:

1. Read stdin JSON. `command -v jq` optional (degrade to `sed`/`grep` for field
   extraction, same pattern as `post-edit-check.sh`).
2. **Loop guard:** `stop_hook_active == true` → exit 0.
3. `TRANSCRIPT` from `.transcript_path`; not a file → exit 0. `CWD` from `.cwd`;
   resolve `ROOT = git -C "$CWD" rev-parse --show-toplevel` or exit 0.
4. **Collect changed code files** from the transcript: the `file_path` of every
   `Edit`/`Write` tool call, filtered to `*.ts|tsx|js|jsx|py|go|rs`. (SQL excluded
   — not unit-testable.) None → exit 0.
5. **Map to affected package dirs:** `find_up` each file to the nearest
   `package.json`/`project.json`; dedupe into a unique set. Reuse the `find_up`,
   runner-detect (pnpm>yarn>npm by lockfile), Nx-detect (`nx.json` at root), and
   portable `TO()` timeout helpers from `post-edit-check.sh`.
6. **Run scoped verification** per affected package, collecting failures:
   - **Nx root present + jq:** resolve the project name (`project.json .name`,
     else `package.json .name` minus scope), and for each of `lint`, `typecheck`,
     `test` **that exists as a target**, run `$EXEC nx run <proj>:<target>`.
     Detect target existence with `nx show project <proj> --json` (targets keys);
     if `nx show` is unavailable, attempt the run and treat a "target not found"
     style non-zero as skip, not failure (match on nx's missing-target message).
   - **No Nx:** in the package dir, for each of `lint`, `typecheck`, `test` **that
     exists as a script** (`has_script`), run `$RUN -s <script>`.
   - Steps with no corresponding target/script are skipped.
   - Test timeout 180s; lint/typecheck 90s (once-per-turn, generous).
7. **Decide:**
   - Any step failed → emit
     `jq -n '{decision:"block", reason: $r}'` where `$r` names the failed step(s)
     and package(s) and includes the tail of their output (head -80). `exit 0`
     (Stop hooks block via the JSON decision, not exit code).
   - Nothing failed (including the "nothing ran" no-op case) → `exit 0` with no
     output.

## Error handling

- No jq → field extraction via sed; if `cwd`/transcript can't be read → exit 0.
- Not a git repo → exit 0.
- No lockfile → `npm run` / `npx --no-install`.
- No package.json anywhere up-tree for a changed file → that file contributes no
  package; if the set ends empty → exit 0.
- Any runner invocation error that is *not* a real lint/type/test failure (e.g.
  missing target) → skip, never block. Fail-soft toward NOT blocking on infra
  quirks, but DO block on genuine red.
- Loop guard guarantees at most one block per Stop cycle.

## Testing (`hooks/test-verify.sh`)

Driven with real `npm` (present on dev machines); the Nx path mirrors the
reviewed `post-edit-check.sh` logic and is exercised in integration, not unit.

1. **No package.json** (temp git repo, a changed `.ts` recorded in a fake
   transcript) → exit 0, no `decision`.
2. **Failing test** — package with `package.json` `"scripts":{"test":"exit 1"}`,
   a changed file in it recorded in the transcript → output has
   `"decision":"block"`.
3. **Passing test** — same but `"test":"exit 0"` → no block.
4. **Loop guard** — `stop_hook_active=true` → exit 0, no block, even with a failing
   test present.
5. **No test script** — package with scripts but no `test` → no block (no-op).

Each test builds a minimal transcript JSON file containing one
`{"name":"Edit","tool_input":{"file_path":"<pkg>/src/x.ts"}}`-shaped line and
feeds the hook `{"cwd":..,"transcript_path":..,"stop_hook_active":..}`.

## Non-goals (YAGNI)

- No whole-repo runs. No per-edit test runs. No coverage thresholds.
- No new dependency. No change to `post-edit-check.sh` (lint/typecheck per edit
  stays as is). No SQL/test-less language enforcement.

## Notes

Lands on `feat/stop-verify-runs-tests` off `main`, independent of the
`chore/project-layout-standard` work. Atomic PR.
