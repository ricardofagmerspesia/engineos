# Git Rules — always on

## Who may write
- The developer decides whether Claude may write to git on its own, per machine, with
  `ENGINEOS_GIT_WRITES` = `ask` (**default**) | `auto`. Personal setting: it lives in
  your own `~/.claude/settings.local.json`, never in the repo, and no project overrides it.
- Under `ask`, every git or forge command that writes becomes a permission prompt
  (the PreToolUse hook `git-write-guard`, matcher `Bash`). DO the file work, stop,
  and ask — with the proposed commit message when the write is a commit. The
  prompt shows `[engineos] git write: <command>`; the developer answers it.
- **One approval covers one action, never a session.** A `yes` to `git commit` is
  not a `yes` to the `git push` that follows.
- What counts as a write: everything that is not on the read-only list —
  `status`, `log`, `diff`, `show`, `blame`, `branch` (listing forms only),
  `remote -v`/`remote show`, `rev-parse`, `ls-files`, `check-ignore`, `describe`,
  `shortlog`, `cat-file`, `config --get`/`--list`, `merge-base`, `stash list`, `tag`
  (listing forms only). So `add`, `fetch`, `checkout`, `switch`, `commit`, `push`,
  `pull`, `merge`, `rebase`, `reset`, `restore`, `stash`, `tag <name>`, `branch <name>`,
  `cherry-pick`, `revert`, `worktree`, `submodule`, `clone`, `init`, `config` writes
  and the forge writes (`gh pr create|merge|close|edit|comment|review`, `gh release *`,
  `gh repo *`, `gh issue` writes, `gh secret *`, `gh variable *`, `gh api` with
  `-X POST|PUT|PATCH|DELETE` or request fields) all ask. An unknown subcommand asks:
  the list is closed on the read side, open on the write side. A command the guard
  cannot parse (unbalanced quote, heredoc) that mentions `git`/`gh` also asks.
- The guard survives `/engineos:bypass`. Bypass turns the constitution off; this is
  the developer's own safety net, and turning EngineOS off must not turn it off.
- To restore unprompted writes on your machine:
  ```json
  {"env": {"ENGINEOS_GIT_WRITES": "auto"}}
  ```
  in `~/.claude/settings.local.json`. Only the exact word `auto` switches it off.

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
- No secrets in any commit — if it happens, follow the rotation rule in `rules/security.md`.
- No `git push --force` to main. Ever.
- No merge with failing CI "to fix later".
