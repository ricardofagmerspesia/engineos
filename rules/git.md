# Git Rules — always on

## Branches
- DO branch from main per unit of work: `feat/<short-slug>`, `fix/<short-slug>`, `chore/<short-slug>`.
- DON'T commit directly to main.
- DO keep branches short-lived (days, not weeks); rebase on main before PR.

## Commits
- DO use Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:` (+ optional scope: `feat(orders):`).
- DO keep commits atomic: one logical change, builds and passes tests on its own.
- DO write subject ≤50 chars, imperative mood; body explains WHY when not obvious.
- DON'T mix refactoring and behavior change in one commit.
- DON'T commit commented-out code, debug logs, or unrelated formatting churn.

## Pull requests
- **Size limit: ≤400 lines changed.** Bigger work splits into stacked/sequential PRs. Hard cases (codegen, lockfiles, migrations) get called out in the description and excluded from the count.
- DO write a description: what + why + how verified (test output, screenshots for UI).
- DO self-review the diff before requesting review — you catch 80% of issues yourself.
- DO keep PRs green: CI passes before review requested.
- DON'T force-push over reviewer comments without noting what changed.

## Merging
- DO squash-merge feature branches (clean main history) unless commits are individually meaningful.
- DO delete branches after merge.

## Never
- No secrets in any commit — if it happens, rotate the secret AND scrub history.
- No `git push --force` to main. Ever.
- No merge with failing CI "to fix later".
