# Fast supervised delivery on one PR

Risk: medium — reversible shared workflow guidance. Autonomy: A2.

User wants fast parallel development, supervisor coordination, tests only at the
approved final stage, and continued work on the same PR until they request a change.
Inspection found final-only test approval already present in verification rules,
workers and CI; git rules still required branches per unit and automatic PR splits.

## Acceptance criteria and ownership

- Keep one top-level supervisor integrating independent parallel workers, with no
  nested supervisor chain or repeated routine reviewer/test loops.
- Keep the current branch/PR for related follow-ups until the user requests another;
  record branch/PR identity and carry it into worker briefs and handoffs.
- Existing large-PR guidance is advisory to split with user direction, not a
  requirement to silently create another PR. PR count is not task count.
- If there is no current PR, continue the existing branch; a merged/closed/unusable
  PR is reported as requiring a user decision rather than silently replaced.
- Preserve git-write approval policy and risk-required reviews. No git/forge writes,
  tests, performance benchmarks or publishing in this task.

Workflow-policy worker owns rules/git.md, rules/parallelism.md, commands/implement.md
and templates/cursor/commands/implement.md (the latter two remove stale automatic
split instructions). Root owns this
spec, change record, integration and final non-test checks. Public names/paths and
runtime are unchanged; one coherent policy edit avoids additional supervisor layers.

Rollback: restore this task's narrow prose edits and new records, preserving all
earlier uncommitted changes. Verification: focused diff inspection, final existing
typecheck/lint implementation and whitespace check. Actual speed is not benchmarked.
