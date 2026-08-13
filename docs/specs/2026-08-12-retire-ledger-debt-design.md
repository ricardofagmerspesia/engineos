# Retire the ledger debt — design

Date: 2026-08-12
Status: approved
Domain: docs

## Problem

`hooks/docs-ledger.sh` landed with five declared debts. Two are closure
exceptions, three are marker budgets with no owner:

```
parallelism|testing   always-on file points at a non-always-on file
models|testing        same
MODE: AUDIT|8|-       no single owner
Do not spawn subagents|6|-
Project `CLAUDE.md` overrides EngineOS|6|-
```

Every line carries a retirement path. This change walks all five.

## Fix 1 — split `rules/testing.md`

`rules/testing.md` is two documents separated by a `---` on line 56. Above it:
**policy** — when tests are on at all, and the definition of **the final gate**.
Below it: **craft** — what to cover, the pyramid, mocking, how to write a test.

The always-on files `rules/parallelism.md` and `rules/models.md` depend on the
policy half and cite it across the closure boundary. That is the whole of both
exceptions.

- **New `rules/verification.md`** — the policy half, compressed on the way over,
  added to the always-on imports in `CLAUDE.md`.
- **`rules/testing.md` keeps the craft half** and gains a back-pointer to
  `rules/verification.md`. Non-always-on pointing at always-on is legal closure;
  the reverse is not.
- Policy citations across the corpus repoint to `rules/verification.md`. Craft
  citations (`test-writer` reading its rules, the test-file route in
  `hooks/routing-map.sh`) stay on `rules/testing.md`.

`rules/verification.md` names no non-always-on file. The disclosure pointer to
the craft half lives in the router's test-writing row, which is where a context
pointer belongs — not inside an always-on rule that every row would then be
required to load.

**Cost: always-on context grows.** It is 26,443 bytes today (LF-normalized, as
git stores it — the same normalization for every figure here). The moved half is
2,690 bytes before compression; the budget for this change was a net always-on
delta under +3,000 bytes including Fix 2, and it landed at **+3,904** (30,347):

```
rules/verification.md   new     +2710   the policy half, after a compression pass
rules/subagents.md     +1141   the "If you are the dispatched agent" section
CLAUDE.md                +33   one always-on import, two repointed citations
rules/parallelism.md     +15   citation repointed to the longer filename
rules/models.md           +5   same
```

Nothing was recovered from `parallelism.md` or `models.md` — repointing to a
longer filename costs a few bytes each. Overrunning the budget by 904 bytes was
accepted rather than compressing the gate policy past the point of being
readable, and it buys back 6,820 bytes across the six coordinator prompts, which
are loaded per dispatch rather than per turn. The alternative — dropping the file
path from the citations in `parallelism.md` and `models.md` — hides the
dependency instead of resolving it, and would make the probe green by making the
corpus less honest.

## Fix 2 — consolidate the coordinator dispatch contract

Six coordinators (backend, frontend, mobile, dba, devops, llm) carry a
byte-identical `## Parallel discipline` block and a near-identical `## Mode`
section: ~25 lines each, ~150 lines total, one meaning.

- **`rules/subagents.md` gains `## If you are the dispatched agent`** — the
  receiving half of the protocol it already owns for the dispatcher: the mode
  token spelling, mode inference, why the scope and contract limits exist, what a
  dispatched agent may run, and that project `CLAUDE.md` outranks EngineOS.
- **Each coordinator gets one `## Dispatch contract` section** of roughly six
  lines, keeping inline only what every dispatch needs and what is destructive to
  get wrong: AUDIT is read-only, stay in your file scope, honor frozen contracts
  verbatim, verify with scoped lint/typecheck only. The explanation moves out; the
  guardrail stays.

Two findings from recon shape this:

- **"Do not spawn subagents" is a no-op.** Coordinator frontmatter grants
  `Read, Grep, Glob, Bash, Edit, Write` — no Task tool. The tooling already
  enforces the flat graph, so the sentence buys nothing and is deleted rather
  than relocated. `rules/parallelism.md` keeps the orchestrator-side statement.
- **"Do not run repo-wide formatters, codemods, or `git` write commands" is
  not.** `Bash` is granted. That one stays inline, compressed.

## Risks accepted

- **Subagent inheritance of `CLAUDE.md` is unverified.** If dispatched agents do
  not receive the project constitution, the material moved to
  `rules/subagents.md` is one Read away rather than in context. Coordinators
  already open `rules/architecture.md` and their domain rules on the same trust,
  and the destructive-risk guardrails stay inline precisely because this is
  unverified. Confirming it needs a live dispatch, which this session's
  no-subagent constraint forbids.
- **`Project \`CLAUDE.md\` overrides EngineOS` leaves the six agent files.** It
  restates non-negotiable #4 verbatim. Rewording it to dodge the marker while
  keeping the duplication would be gaming the probe, so it moves out entirely.

## Ledger end state

- Both closure exceptions **deleted** — `parallelism.md` and `models.md` will
  point at always-on `rules/verification.md`.
- `lint + typecheck` and `Tests are opt-in` — owner moves to
  `rules/verification.md`, counts remeasured after the edits and ratcheted down.
- `MODE: AUDIT` — the token leaves the six coordinators (the mode *definition*
  is what was duplicated, not the token), leaving the two audit commands that
  pass it in a brief plus `rules/subagents.md` as owner. Budget 8 → 3.
- `Do not spawn subagents` and `Project \`CLAUDE.md\` overrides EngineOS` —
  budget **0**, the floor of the ratchet: retired phrasings that must not come
  back. The ledger gains a comment explaining the 0 convention.

A marker that counts a protocol token rather than a duplicated meaning is a bad
marker: a leading word is *supposed* to repeat. That is why `MODE: AUDIT` is
measured after the token is confined to the sites that actually emit it.

## Non-goals

- Rewriting the craft half of `rules/testing.md`. It moves as-is.
- Touching the other 12 agents beyond repointing policy citations.
- The 5 remaining `100644` shell scripts, the stray `</content>` in
  `agents/mobile-coordinator.md`, and the 7 stale `status: active` change
  records. Separate changes.

## Verification

- `bash -n` on every script in `hooks/`.
- The full `hooks/test-*.sh` suite, output shown, `test-docs.sh` green with the
  new ledger.
- **A negative test, shown**: reintroduce each retired phrasing in a throwaway
  copy and confirm the suite goes red on the 0-budget lines, and restore an
  always-on pointer to `rules/testing.md` and confirm the closure family fails
  with no exception left to cover it.
- Always-on byte count before and after, reported.
