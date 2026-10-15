# ADR: Session-retro improvements — stop loading, not delete; report, not block

Status: accepted (2026-10-13; proposed 2026-10-11). Decision owner: Ricardo Fagmer.
PRD: `docs/prds/2026-10-11-session-retro-improvements.md`.

## Decisions

**D1 — Two link directories: auto-loaded always-on, path-resolved everything else (developer decision O2, 2026-10-11).**
`install.sh`/`install.ps1` step 4d link the 11 always-on rules into
`~/.claude/rules/` (the host auto-loads that directory into every session) and
link every other `rules/*.md` — routed and deprecated alike — into
`~/.claude/engineos/rules/`, a directory the host does not auto-load. Stale
`~/.claude/rules/<name>.md` symlinks for non-always-on rules that point into
`$REPO_DIR/rules/` are removed; a regular file keeps today's `skip:` warning.
The always-on set is the rule file's H1 marker `— always on` (10 files carry
it; `rules/gates.md` gets it, matching `docs/CODEBASE_MAP.md`). Deprecated files
keep resolving by path through their `docs/COMPATIBILITY.md` window.
Reference resolution: the 403 `rules/<name>.md` references inventoried in the
plan are repo-relative; machine readers resolve against the EngineOS root and
are untouched; model-facing prose resolves through one sentence added to the
`CLAUDE.md` "Paths are relative here" bullet (mirrored in `AGENTS.md`): on an
installed machine a routed rule is read at `~/.claude/engineos/rules/<name>.md`.
Host behaviour verified against code.claude.com/docs/en/memory (2026-10-11):
`.claude/rules/` is discovered recursively, `~/.claude/rules/` applies to every
project, symlinks are followed, rules without `paths:` load unconditionally —
so the second directory must sit outside `~/.claude/rules/`, which
`~/.claude/engineos/rules/` does (no collision with the `~/.claude/engineos.bypass` file).
Rejected: (a) unlink all routed rules and link nothing else — the installer's
stated purpose (lines 199-202) is a stable path for rule references on
installed machines; losing it leaves prose references with no path;
(b) unlink deprecated rules only — frontend/data/testing would still load in
every kernel session, which is retro item 2's second half; (c) `paths:`
frontmatter on routed rules inside `~/.claude/rules/` — path scoping is not
intent routing, and a deprecated rule would need a never-matching glob;
(d) deleting deprecated files — breaks the compatibility window.

**D2 — Record gate: an active record that names the current branch is "recorded, in progress".**
`record-verify` gains one additive path: when a `.engineos/changes/*.md` has
`status: active` and a frontmatter `branch:` equal to `git rev-parse --abbrev-ref HEAD`,
the hook returns a `message` naming the record instead of `block`. Marker,
block text and `.deferred` are unchanged (MINOR under `docs/COMPATIBILITY.md`
"Hook event contract"). The change-record template gains the optional
`branch:` key. Rejected: checking PR state (`gh`) from a hook — network and
auth inside a Stop hook; a session-scoped auto-defer — hides the debt the gate
exists to show.

**D3 — Generated paths have one machine-readable home: `.gitattributes`.**
`linguist-generated=true` on `dist/engineos.cjs`, `package-lock.json`,
`console/package-lock.json`, `docs/context/markdown-inventory.json` (developer
decision O3: patterns `dist/**`, `package-lock.json` — unanchored, so it also
matches `console/package-lock.json` — and `docs/context/markdown-inventory.json`;
no `-diff`). Reviewer scope rule in `rules/verification.md` points at that
attribute instead of repeating the list. `evals/**/*.jsonl` are NOT marked: they
are authored golden sets whose review is the point. Rejected: editing the
external `code-review` skill; a list in `registries/routing.json` (its
`excluded` block is routing policy, not review policy).

**D4 — Process rules get one home each.** Worktree attribution: a `Worktree`
column in the `rules/parallelism.md` ledger plus one line in the handoff
`## Files` section (no new heading or `Gate:`/`Risk:` field, so validator C19
is untouched). Stale tests on a contract change: one paragraph in
`rules/parallelism.md` "Task ledger and contract drift" — the contract owner
enumerates existing tests asserting the superseded behaviour in the return
envelope; the approved final-stage brief updates them before the first run.
Rejected: a brief field in `rules/subagents.md` and a reviewer rule — two homes
for one fact; `templates/api-contract.md` — contracts are not the only drift source.

**D5 — Test navigation is a script, not prose.** `scripts/test-file.mjs` maps
`src/<p>/<n>.test.ts` to `build/<p>/<n>.test.js`, runs `tsc` then `node --test`
on that file; `package.json` exposes it as `test:file`. Rejected: a README
sentence only — the glob error came from a path nobody could look up.

**D6 — Prompt-source fixtures are captured payloads, landed where the check lives.**
Fixtures are the raw UserPromptSubmit stdin JSON with `session_id`, `cwd` and
`transcript_path` replaced by placeholders, consumed by `prompt-source.test.ts`,
`prompt-advisor.test.ts` and one e2e case through `dist/engineos.cjs`. They are
test authoring and run only at the approved final stage. They land on `main`
after PR #132 merges (developer decision O1).

## Decisions resolved by the developer (Ricardo Fagmer, 2026-10-11)
- **O1 — resolved.** Land after PR #132 merges; run the graph on `main`; unit 03
  reuses #132's `src/hooks/change-records.ts`.
- **O2 — resolved.** Keep linking the 11 always-on rules (`gates.md` gains the
  H1 marker) into `~/.claude/rules/`; link every routed and deprecated rule into
  `~/.claude/engineos/rules/` (verified outside the host's auto-load root);
  inventory and resolve every `rules/*.md` reference first (plan "Reference inventory").
- **O3 — resolved.** `linguist-generated` only, no `-diff`, for `dist/**`,
  `package-lock.json`, `docs/context/markdown-inventory.json`; `evals/**/*.jsonl` not marked.
- **O4 — resolved.** No default-branch exception: an active record linked to the
  current branch counts as recorded in progress, `main` included.

Still pending: developer review of PRD scope and plan contracts; prototype
preview choice before implementation.

## Consequences
Every installed machine changes its `~/.claude/rules/` contents and gains
`~/.claude/engineos/rules/` on the next install run (medium risk, reversible by
re-running the previous installer). Routed rules are no longer in context by
default; the router must read them by path when a row loads them.
The Stop gate silences for branch-linked active records; the `record-change`
archive step remains the only thing that clears the debt marker.

## Rollback
D1: re-run the previous installer revision (relinks all rules). D2: `git revert`
the hook commit and rebuild `dist`. D3-D5: `git revert`. D6: delete fixtures and
their test cases; no runtime change.
