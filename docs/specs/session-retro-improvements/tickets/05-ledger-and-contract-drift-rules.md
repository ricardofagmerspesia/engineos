# 05 — Worktree column, stale-test enumeration, review scope

**Objective.** Three prose rules with one home each (ADR D3, D4):
1. Worktree attribution — `rules/parallelism.md` ledger gains a `Worktree`
   column (C5) and the sentence "A worktree absent from the ledger is not a
   task's; cleanup is a ledger lookup, under `rules/git.md`." `templates/handoff.md`
   `## Files` gains one line: `<worktree per unit, or none>` (no new heading,
   no new `Gate:`/`Risk:` field — validator C19 reads required sections/fields).
2. Stale tests on contract change — in "Task ledger and contract drift": "The
   contract owner enumerates existing tests asserting the superseded behaviour
   and lists them in the return envelope at implementation time; the approved
   final-stage brief updates those assertions before the first run."
3. Review scope — in `rules/verification.md` "Final security review and scan
   consent": "Review scope excludes paths marked `linguist-generated` in
   `.gitattributes` unless the brief names them; report their presence as a count."

**Owner.** `docs-writer` (dalollio), model tier `build` (rule text, not mechanical).
MODE IMPLEMENT.

**Exclusive paths.** `rules/parallelism.md`, `rules/verification.md`, `templates/handoff.md`.

**Contract.** `plan.md@sri-v1` C3, C5. Prose numbers mirrored by validator C16
(wave cap, fan-out thresholds, backpressure, breaker) must not change; the
`## Backpressure` and `## Circuit breaker` anchors stay.

**dependsOn.** none.

**Acceptance.** SRI-19, SRI-20, SRI-21, SRI-22.

**Required checks (approved later).** `validate`.

**Risk.** low. **Rollback.** `git revert`.

**Return envelope.** diff summary; confirmation that no C16-mirrored number or
C19 heading changed.
