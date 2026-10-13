---
status: active
domain: general
spec: docs/specs/2026-10-06-supervised-pr-continuity.md
---

# Fast supervised delivery on one PR

Risk: medium. Autonomy: A2. Gate: final non-test validation passed.

## Human decisions

2026-10-06: User requested fast supervised work, no constant tests, same PR until
user-directed change, and declined further artifacts. Testing approval not given.

## Checklist

- [x] Existing testing, CI and flat delegation guidance inspected
- [x] Spec and narrow ownership written
- [x] PR continuity and supervisor policy integrated
- [x] Final non-test checks

## What was made

Changed rules/git.md to preserve the current branch/PR through related follow-ups
until user-directed change. The 400-line guideline now suggests a split rather than
forcing one. Updated rules/parallelism.md to name one top-level supervisor, flat
workers, no repeated routine reviewer/test chains, branch/PR identity in briefs,
and no worker git/forge writes. Removed automatic PR splitting from
commands/implement.md and templates/cursor/commands/implement.md.

## Changes registered

Task files: rules/git.md, rules/parallelism.md, commands/implement.md,
templates/cursor/commands/implement.md, docs/specs/2026-10-06-supervised-pr-continuity.md
(new), and this record (new). No renames; earlier edits preserved.

## Evidence and limits

Focused diff inspection confirmed final-only approved tests already present in
rules/verification.md, worker guidance and the inspected CI workflows. Risk-required
reviews remain. npm run typecheck (also the repository lint implementation) exited 0;
git diff --check exited 0 with no output. Runtime/build inputs were not changed,
so no additional build was needed. Tests/evals and speed benchmarks were not run;
no measured speed claim is made. Testing remains pending explicit user approval.

git branch --show-current returned feat/stack-first-and-feature-artifacts; it was
not changed. This chat has no attached PR artifact, so no PR identity was inferred.
No git/forge writes, new PRs, branches, installations or external effects occurred.
