# Prose-layer probe suite — design

Date: 2026-08-12
Status: approved
Domain: docs

## Problem

EngineOS's behaviour is defined in two layers. The **hook layer** — 19 shell
scripts — is covered by `hooks/test-*.sh`: 77 assertions, run on demand, red when
it breaks. The **prose layer** — `CLAUDE.md`'s router table, `rules/*.md`,
`agents/*.md`, `commands/`, `skills/` — has no coverage at all. Nothing checks
that:

1. A rule file, agent, skill or command named in the router actually exists.
2. `hooks/routing-map.sh` and the router table still agree on which agent owns
   which domain, though `CLAUDE.md` calls the table "the human mirror" of the map.
3. A router row's load list is **closed** — the invariant `CLAUDE.md` states in
   prose and nothing enforces. Three row-level gaps exist today.
4. A rule that was moved to a single source of truth stays there. The
   2026-08-12 load-diet change reduced `lint + typecheck` from 12 sites to 1;
   nothing stops the thirteenth from appearing.

Every defect in the load-diet audit was found by reading 40 files by hand. That
does not scale, and it does not run in CI.

## Approach

Two files, bash and `grep` only — no `jq`, no node, no python. `test-layout.sh`
already skips in environments without a jq-free PATH; the probe suite must run
everywhere the repo is cloned.

### `hooks/docs-ledger.sh` — declarations, no logic

Sourced by the suite. Holds four lists:

- `ENGINEOS_ALWAYS_ON` — the rule stems imported by `CLAUDE.md`'s "Always-on
  rules" section.
- `ENGINEOS_CLOSURE_EXCEPTIONS` — accepted closure gaps as `<from>|<to>|<reason>`.
  Pair-scoped, not row-scoped: one always-on outward pointer explains gaps in
  every row at once.
- `ENGINEOS_MARKER_BUDGETS` — `<phrase>|<max-files>|<owner-file-or-dash>`.
- `ENGINEOS_ALIAS_EXEMPT` — agents that legitimately carry no alias.

Split from the assertions for the same reason `routing-map.sh` is split from
`route-before-change.sh`: the accepted-debt list changes on a different clock
than the checker that defends it.

### `hooks/test-docs.sh` — four assertion families

House format throughout: `FAIL: <desc> — <detail>`, `note: <detail>` for
informational output, `pass=N fail=N` after a `---` line, exit 1 on any failure.
Takes an optional repo root argument so the suite can be pointed at a copy — which
is how the negative test works.

1. **Referential integrity.** Every `rules/X.md` and every backticked agent or
   skill name appearing in the corpus resolves on disk. Every agent and skill on
   disk is named somewhere outside its own file (orphan check). Aliases are
   unique. `commands/agents/` is a bijection with agents ∪ aliases — the check
   that catches "added an agent, forgot to run `scripts/gen-agent-commands.sh`".
2. **Hook ↔ table parity.** Every `agent:` and `rules/` in `routing-map.sh`
   exists on disk and is named in `CLAUDE.md`.
3. **Closure.** For every router row: a loaded rule's cross-references must be
   always-on, loaded in the same row, or an accepted exception. Separately, every
   always-on file's outward pointers must be excepted — always-on files are
   loaded in every context, so an unexcepted outward pointer is a gap in every
   row simultaneously. Exceptions are also checked for staleness: an exception
   whose pointer no longer exists fails.
4. **Marker budgets.** Each declared phrase appears in at most `max-files`, and in
   its owner file when one is declared.

### Why a ledger instead of a red suite

Three closure gaps and a six-way duplication of the coordinators' "Parallel
discipline" block are real, known debt with real fixes — splitting `testing.md`
into always-on policy plus disclosed craft, and extracting the shared block. A
suite that is red on the day it lands gets ignored, and a suite that ignores the
debt cannot see it grow. The ledger makes each item an enumerated line with a
reason and a retirement path, and the probe defends the line: today's count is
green, one more instance is red.

Budgets are a **ratchet**. They only move down. When a count comes in under
budget the suite passes and prints a `note:` telling the author to tighten it.

## Non-goals

- **Behavioural probes** (prompt → expected `[router]` line). They cannot run in
  bash, so half the suite would be a fixture file a human is trusted to execute.
  That is how test files rot. Revisit only with a real runner.
- **Converting the DO/DON'T pairs** in `rules/base.md` and elsewhere to positive
  phrasing. Separate change, much larger diff.
- **Fixing the debt this suite enumerates.** Splitting `testing.md` and
  extracting the coordinator boilerplate are follow-on changes; this one only
  makes them visible and stops them growing.
- **Wiring the suite into a hook.** It is a test, run like the other
  `hooks/test-*.sh` scripts, not a hook.

## Verification

- `bash -n` on every script in `hooks/`.
- The full `hooks/test-*.sh` suite, output shown. `test-docs.sh` must be green on
  the repo as it stands.
- **A negative test, shown.** Copy the repo to a temp dir, break one pointer in
  the copy, run the suite against the copy, and show it goes red. A suite that
  has only ever been observed green is not known to assert anything.

## Decisions recorded

- The suite lives in `hooks/` despite testing docs rather than hooks, because
  `hooks/test-*.sh` is the glob everyone already runs. Discoverability beats
  taxonomy; the file header states what it actually probes.
- Agent and skill references are only checked when **backticked**. Plain-prose
  mentions are ambiguous — "per-specialist" matches an agent-shaped pattern and
  is not an agent. Backticks are already the convention; the probe enforces it by
  only trusting it.
- `commands/agents/**` is excluded from the orphan scan. Those files are
  generated from the roster, so counting them as references would make the check
  vacuous.
- Aliases stay checked but not mandatory: `ios-builder` and `android-builder` have
  none by design and are declared exempt.
