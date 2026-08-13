---
name: 2026-08-12-prose-layer-probes
status: done
completed: 2026-08-12
owner: Ricardo Fagmer
spec: docs/specs/2026-08-12-prose-layer-probes-design.md
domain: docs
---

## What
Added a deterministic probe suite for EngineOS's prose layer — the `CLAUDE.md`
router table, `rules/`, `agents/`, `commands/` and `skills/` — plus a ledger of
declared, reasoned exceptions that the suite defends.

## Why
The hook layer had 77 assertions; the prose layer had none. Every defect in the
2026-08-12 load-diet audit was found by reading 40 files by hand: dangling
pointers, router/hook drift, unclosed router rows, and rules restated in a dozen
places. That does not scale and does not run in CI. The suite turns those
hand-checks into 184 assertions.

## Scope
- `hooks/docs-ledger.sh` (new) — always-on set, closure exceptions, marker
  budgets, alias exemptions, external-skill allowlist
- `hooks/test-docs.sh` (new) — the four assertion families
- `README.md` — one row in the "What's inside" table
- `docs/specs/2026-08-12-prose-layer-probes-design.md` (new) — the spec

## Checklist
- [x] Ledger holds every accepted exception with a reason and a retirement path
- [x] Family 1: referential integrity, orphans, alias uniqueness, `commands/agents/` bijection
- [x] Family 2: `routing-map.sh` <-> router table parity
- [x] Family 3: router-row closure, always-on outward pointers, stale-exception detection
- [x] Family 4: marker budgets as a downward ratchet
- [x] Runs without `jq`/node/python
- [x] Negative test proves every family actually asserts
- [x] README documents it
- [x] Final gate: full `hooks/test-*.sh` suite green

## What was made

**`hooks/test-docs.sh`** (174 lines) — 184 assertions in four families, in the
house format (`FAIL: <desc> — <detail>`, `pass=N fail=N`, exit 1 on failure).
Takes an optional repo-root argument, which is what makes the negative test
possible: the suite can be pointed at a deliberately broken copy.

1. *Referential integrity* — every `rules/X.md` and every backticked agent or
   skill name in the corpus resolves on disk; every agent and skill is named
   somewhere outside its own file; aliases are unique; `commands/agents/` is a
   bijection with agents plus aliases (34 files = 18 agents + 16 aliases), which
   catches "added an agent, never re-ran `scripts/gen-agent-commands.sh`".
2. *Hook <-> table parity* — the 8 agents and all rule files in
   `routing-map.sh` exist and are named in `CLAUDE.md`.
3. *Closure* — always-on files' outward pointers are checked first and
   separately, because an always-on file is loaded in every context, so an
   unexcepted pointer is a gap in every router row at once. Row-scoped gaps are
   deduped to unique `from|to` pairs. Exceptions are themselves checked for
   staleness: a ledger line whose pointer no longer exists fails.
4. *Marker budgets* — declared phrases capped by file count and pinned to an
   owner file. Under budget passes and prints `note: tighten the budget`.

**`hooks/docs-ledger.sh`** (42 lines) — declarations only, sourced by the suite,
split from it for the same reason `routing-map.sh` is split from
`route-before-change.sh`. Contents: the always-on set; two closure exceptions
(`parallelism -> testing`, `models -> testing`), each with the retirement path
of splitting `testing.md` into an always-on policy half and a disclosed craft
half; five marker budgets; two alias-exempt builders; one external skill
(`claude-api`, a host skill named in `skills/llm-engineering`).

**Two probe bugs found and fixed on the first run.** `rules/[a-z-]+\.md` matched
`.mdc`, so the Cursor mirror's `rules/subagent-dispatch.mdc` and
`rules/testing-opt-in.mdc` read as missing EngineOS rules; the pattern now
matches `.mdc` and drops it. The third first-run failure was not a bug: the
probe cannot distinguish an external skill from a typo, so `claude-api` became
the first `ENGINEOS_EXTERNAL_SKILLS` entry rather than a silenced pattern.

**Design decisions worth keeping.** Agent and skill references are checked only
when backticked — plain prose is ambiguous ("per-specialist" matches an
agent-shaped pattern and is not an agent), and only trusting backticks is what
enforces the convention. `commands/agents/**` is excluded from the orphan scan
because those files are generated from the roster and would make the check
vacuous. The suite lives in `hooks/` despite testing docs, because
`hooks/test-*.sh` is the glob people already run; its header says what it
actually probes.

Not built, per the spec's non-goals: behavioural probes (prompt -> expected
`[router]` line) can't run in bash, and a half-manual suite rots.

## Changes registered

```
$ git status --short
 M CLAUDE.md
 M README.md
 M agents/android-builder.md
 ... (18 agents/*.md, from the load-diet change already archived)
 M commands/implement.md
 M rules/parallelism.md
 M rules/subagents.md
 M rules/testing.md
 M skills/eval-harness/SKILL.md
 M templates/cursor/commands/implement.md
?? .engineos/archived/2026/08/docs/
?? docs/specs/2026-08-12-agent-doc-load-diet-design.md
?? docs/specs/2026-08-12-prose-layer-probes-design.md
?? hooks/docs-ledger.sh
?? hooks/test-docs.sh

$ git diff --stat HEAD
 26 files changed, 97 insertions(+), 106 deletions(-)
```

This change's own contribution: `README.md` +1 line, plus three new files —
`hooks/test-docs.sh` (174), `hooks/docs-ledger.sh` (42),
`docs/specs/2026-08-12-prose-layer-probes-design.md` (120). Everything else in
the diff belongs to the already-archived
`2026-08-12-agent-doc-load-diet` record. No renames.

Combined with that record, the branch stands at 539 lines changed — over the
400-line PR limit in `rules/git.md`, so the two records ship as **two commits**:
the load diet first, the probe suite second, each independently green.

## Verification

```
$ for f in hooks/*.sh; do bash -n "$f"; done
bash -n: 21 hooks checked, 0 failed

$ for t in hooks/test-*.sh; do bash "$t"; done
test-agent-announce.sh             pass=5 fail=0
test-bypass.sh                     pass=18 fail=0
test-docs.sh                       pass=184 fail=0
test-governance.sh                 pass=6 fail=0
test-layout.sh                     pass=10 fail=0 skip=1
test-route.sh                      pass=21 fail=0
test-task-scale.sh                 8 passed, 0 failed
test-verify.sh                     pass=9 fail=0
```

261 assertions, 0 failures. The one skip is pre-existing and environmental
(`test-layout.sh` cannot build a jq-free PATH here).

**Negative test — eight deliberate breaks in a throwaway copy, each expected to
turn the suite red with a specific message:**

```
ok: dangling rules/ pointer -> red, matched 'rules/does-not-exist.md is referenced but not on disk'
ok: missing commands/agents entry -> red, matched 'no commands/agents/borisenko.md'
ok: orphaned agent -> red, matched 'agent ghost-tester exists but is named nowhere'
ok: hook/table drift -> red, matched 'routing-map.sh routes to unknown agent phantom-coordinator'
ok: unexcepted closure gap -> red, matched 'always-on rules/parallelism.md points at non-always-on rules/testing.md'
ok: stale closure exception -> red, matched 'stale closure exception git|data'
ok: marker budget exceeded -> red, matched 'marker 'lint + typecheck' is in 2 files, budget 1'
ok: marker absent from owner -> red, matched 'is missing from its declared owner rules/testing.md'
---
negative tests: pass=8 fail=0
```

The driver is a scratchpad script, not shipped — the spec called for a negative
test as evidence, not as a second suite to maintain.

`[tests] skipped — not requested`; there is no unit-test layer here, the suite is
itself the test.

## Notes

Debt the suite now makes visible, with the fix each one wants:

- Two closure exceptions, both `-> rules/testing.md`. Retire by splitting
  `testing.md` into an always-on policy half and a disclosed craft half. See
  [[always-on-context-diet]].
- Three marker budgets sit at `-` for owner: `MODE: AUDIT` (8 files),
  `Do not spawn subagents` (6), `Project CLAUDE.md overrides EngineOS` (6). The
  latter two are the coordinators' copy-pasted "Parallel discipline" block —
  extracting it to one file and pointing at it retires all three.
- `commands/agents/` bijection currently passes at 34 files. It is generated;
  the probe is the thing that will notice when it stops being regenerated.

Still open from the load-diet audit, untouched here: router rows prescribing
conflicting fan-out mechanisms, `rules/base.md` caching lint-enforceable rules,
and the unconverted DO/DON'T pairs. The first two are now cheaper to attempt —
the suite will catch collateral damage.

Unrelated pre-existing defect, still not fixed to keep commits single-purpose: a
stray `</content>` tag at `agents/mobile-coordinator.md:99`.
