---
name: 2026-08-12-retire-ledger-debt
status: done
completed: 2026-08-12
owner: Ricardo Fagmer
spec: docs/specs/2026-08-12-retire-ledger-debt-design.md
domain: docs
---

## What
Walked all five debts `hooks/docs-ledger.sh` shipped with: split `rules/testing.md`
into an always-on policy half (`rules/verification.md`) plus a disclosed craft half,
and extracted the six coordinators' duplicated dispatch block into
`rules/subagents.md`. Both closure exceptions deleted; all three owner-less marker
budgets now have an owner or sit at the ratchet floor.

## Why
The probe suite made the debt visible but the ledger is not a place to keep debt —
it is a place to declare it while it is being paid. Two of the entries were closure
gaps (`parallelism.md` and `models.md`, both always-on, citing non-always-on
`rules/testing.md`), which means every router row silently inherited a load
obligation it never declared. The other three were the coordinators' copy-pasted
`## Parallel discipline` block: one meaning in six files, so changing dispatch
policy was a six-file edit.

## Scope
- `rules/verification.md` (new) — the always-on policy half
- `rules/testing.md` — reduced to craft, with a back-pointer
- `rules/subagents.md` — new `## If you are the dispatched agent` section
- `CLAUDE.md` — one always-on import, policy citations repointed
- 6 coordinators — `## Parallel discipline` + `## Mode` -> one `## Dispatch contract`
- `hooks/docs-ledger.sh` — exceptions emptied, budgets ratcheted, 0-floor documented
- policy-citation repoints: `rules/parallelism.md`, `rules/models.md`,
  `agents/{ios-builder,android-builder,test-writer}.md`,
  `commands/{bypass,implement}.md`, `templates/cursor/commands/implement.md`,
  `hooks/{stop-verify,test-verify,post-edit-check}.sh`, `install.sh`,
  `README.md`, `docs/{ADOPTION,PRD,START}.md`
- `docs/specs/2026-08-12-retire-ledger-debt-design.md` (new) — the spec

## Checklist
- [x] `rules/verification.md` created, added to the always-on imports, owns the
      sole `lint + typecheck` definition
- [x] `rules/verification.md` names no non-always-on file — the craft pointer lives
      in the router's test-writing row instead
- [x] `rules/testing.md` keeps craft only, states it is not a trigger to write tests
- [x] Every policy citation repointed; craft citations (`test-writer`,
      `hooks/routing-map.sh`) deliberately left on `rules/testing.md`
- [x] `ENGINEOS_CLOSURE_EXCEPTIONS` empty, with a comment saying why
- [x] Six coordinators reduced to one `## Dispatch contract` each, domain
      guardrails preserved inline
- [x] `MODE: AUDIT` budget 8 -> 3, owner `rules/subagents.md`
- [x] `Do not spawn subagents` and `Project CLAUDE.md overrides EngineOS` at
      budget 0, with the floor convention documented in the ledger
- [x] Negative test proves the retired phrasings cannot come back
- [x] Always-on byte delta measured and reported in the spec
- [x] Final gate: full `hooks/test-*.sh` suite green

## What was made

**`rules/verification.md`** (56 lines, 2,710 bytes) — the policy half, compressed
on the way over. Two sections: `## Tests are opt-in — the default is NO tests`
(the four ON triggers, the `[tests] skipped — not requested` line, the
don't-weaken-existing-tests rule, regression tests as an offer) and
`## The final gate` (the single definition: lint + typecheck, run ONCE, after the
last unit of work is integrated, output shown). It closes the opt-in section by
naming the craft half *without* a path — "a separate file, loaded by the
test-writing router row" — because a path there would re-open the closure gap from
the other side: every router row loading `verification.md` would inherit a
pointer to a non-always-on file.

**`rules/testing.md`** (2,355 bytes, from 4,918) — craft only, with a header that
says what it is not: "Nothing in this file is a trigger to write tests."

**`rules/subagents.md`** gains `## If you are the dispatched agent` (+1,141) — the
receiving half of the protocol it already owned for the dispatcher: the mode token
spelling and inference, stay-in-scope, honor frozen contracts, verify with scoped
lint/typecheck only, project `CLAUDE.md` outranks EngineOS.

**Six coordinators lose 6,820 bytes** (backend −1,250, frontend −1,134, dba
−1,055, devops −1,087, llm −1,130, mobile −1,164). `## Mode` + `## Rules to apply`
+ `## Parallel discipline` collapse into a ~6-line `## Dispatch contract` that
keeps inline only what is destructive to get wrong. The domain-specific guardrails
survive: no DDL/DML in AUDIT (dba), never touch live infra and `apply`/`deploy`
only on confirmed instruction (devops), AUDIT is a parity report (mobile), evals
alongside scoped lint/typecheck (llm).

**Two recon findings changed the plan.** "Do not spawn subagents" was a no-op in
a coordinator: their frontmatter grants no Task tool, so the tooling already
enforces the flat graph — deleted rather than relocated, with
`rules/parallelism.md` keeping the orchestrator-side statement. "Do not run
repo-wide formatters, codemods or `git` writes" is *not* a no-op — `Bash` is
granted — so it stays inline, compressed.

**`MODE: AUDIT` was a bad marker, not a duplication.** It counts a leading word,
and a leading word is supposed to repeat. Budget 8 -> 3 measures the token after
it was confined to the sites that actually emit it: the two audit commands that
pass it in a brief, plus the owner.

**One budget went UP for an honest reason.** `Tests are opt-in` measured 6 files,
not the declared 5, because `rules/subagents.md` had the citation wrapped across
two lines and the counts are `grep -F` line-literal — compressing the paragraph
put it on one line and the site became visible. Fixed by setting the budget to the
true count and documenting the fragility in the ledger, not by re-wrapping to hide
a site.

## Changes registered

```
$ git status --short
 M CLAUDE.md              M docs/PRD.md
 M README.md              M docs/START.md
 M agents/android-builder.md      M hooks/docs-ledger.sh
 M agents/backend-coordinator.md  M hooks/post-edit-check.sh
 M agents/dba-coordinator.md      M hooks/stop-verify.sh
 M agents/devops-coordinator.md   M hooks/test-verify.sh
 M agents/frontend-coordinator.md M install.sh
 M agents/ios-builder.md          M rules/models.md
 M agents/llm-coordinator.md      M rules/parallelism.md
 M agents/mobile-coordinator.md   M rules/subagents.md
 M agents/test-writer.md          M rules/testing.md
 M commands/bypass.md             M templates/cursor/commands/implement.md
 M commands/implement.md
?? docs/specs/2026-08-12-retire-ledger-debt-design.md
?? rules/verification.md

$ git diff --stat HEAD
 26 files changed, 117 insertions(+), 262 deletions(-)
```

Plus two untracked files: `rules/verification.md` (56 lines) and
`docs/specs/2026-08-12-retire-ledger-debt-design.md` (140). No renames — the
"split" is a new file plus a truncation, so git sees no `git mv`. Net −145 lines
in tracked files before counting the new rule file.

Branch base for this record: `77afed8` (the two prior records of this session are
already archived and committed).

## Verification

```
$ for f in hooks/*.sh install.sh; do bash -n "$f"; done
bash -n: 24 files checked, 0 failed

$ for t in hooks/test-*.sh; do bash "$t"; done
test-agent-announce.sh             pass=5 fail=0
test-bypass.sh                     pass=18 fail=0
test-docs.sh                       pass=182 fail=0
test-governance.sh                 pass=6 fail=0
test-layout.sh                     pass=10 fail=0 skip=1
test-route.sh                      pass=21 fail=0
test-task-scale.sh                 8 passed, 0 failed
test-verify.sh                     pass=9 fail=0
```

259 assertions, 0 failures. `test-docs.sh` drops from 184 to 182 because two
closure-exception assertions no longer have an exception to assert. The one skip is
pre-existing and environmental (`test-layout.sh` cannot build a jq-free PATH here).

**Always-on context** (LF-normalized): 26,443 -> 30,347, delta **+3,904** — over
the spec's +3,000 budget by 904, accepted rather than compressing the gate policy
past readability, and offset by 6,820 bytes off the per-dispatch coordinator
prompts. Per-file breakdown is in the spec.

**Negative test — seven deliberate breaks in throwaway copies:**

```
ok: 'Do not spawn subagents' reintroduced -> red, matched 'marker 'Do not spawn subagents' is in 1 files, budget 0'
ok: 'Project CLAUDE.md overrides EngineOS' reintroduced -> red, matched 'budget 0'
ok: always-on pointer back to rules/testing.md -> red, matched 'always-on rules/parallelism.md points at non-always-on rules/testing.md'
ok: MODE: AUDIT budget exceeded -> red, matched 'marker 'MODE: AUDIT' is in 4 files, budget 3'
ok: gate definition absent from owner -> red, matched 'is missing from its declared owner rules/verification.md'
ok: verification.md removed from ENGINEOS_ALWAYS_ON -> red, matched 'points at non-always-on rules/verification.md'
ok: dangling dispatch-contract pointer -> red, matched 'rules/dispatch.md is referenced but not on disk'
---
negative tests: pass=7 fail=0
```

The last three are the new invariants this change creates: the gate definition
cannot leave its owner, `verification.md` cannot quietly drop out of the always-on
set, and the pointer the coordinators now depend on cannot dangle.

`[tests] skipped — not requested` — the probe suite is itself the test layer.

## Notes

The ledger is now empty of closure exceptions and has an owner for every budget.
What it does not defend, and could:

- **Subagent inheritance of `CLAUDE.md` is unverified.** If dispatched agents do
  not receive the project constitution, the material moved to `rules/subagents.md`
  is one Read away rather than in context. The destructive-risk guardrails stayed
  inline in the coordinators precisely because of this. Confirming it needs a live
  dispatch, which this session's no-subagent constraint forbids.
- **`docs/START.md` still uses "Project `CLAUDE.md` overrides EngineOS"** in
  human-facing prose. `docs/` is outside the probe corpus, so the 0-budget does not
  catch it. Either widen the corpus or accept that the floor guards the agent-facing
  layer only.

Still open from the load-diet audit, untouched: router rows prescribing conflicting
fan-out mechanisms, `rules/base.md` caching lint-enforceable rules, the unconverted
DO/DON'T pairs.

Pre-existing defects deliberately left, to keep this record single-purpose: five
`100644` shell scripts (two of them live hooks — `announce-agent-dispatch.sh` and
`announce-agent-return.sh` — latent POSIX failures), the stray `</content>` at
`agents/mobile-coordinator.md:99`, and seven `.engineos/changes/*.md` still
`status: active` from earlier work.
