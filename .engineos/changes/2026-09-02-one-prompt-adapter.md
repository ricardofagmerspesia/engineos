---
name: 2026-09-02-one-prompt-adapter
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-09-02-deepen-runtime-modules-design.md
domain: devops
---

## What
Deleted `hooks/task-scale-advisor.sh`, `hooks/gate-advisor.sh` and
`hooks/route-advisor.sh` with their three suites, and made `install.sh` /
`install.ps1` derive the hook list from `hooks/hooks.json` instead of a
hand-typed variable list. PR2 of the runtime-deepening spec.

## Why
The three advisors were shallow adapters onto kernel subcommands that
`resolve-task` already composes, with the same guidance text copied into a
second quoting dialect. `hooks/hooks.json` registered only the deep adapter,
`prompt-advisor.sh`; both installers registered only the three shallow ones and
never the deep one, so every symlink install paid three kernel spawns per
prompt and received no task contract at all. The parity the installer comment
asserted was enforced nowhere — deriving the list removes the second copy that
could drift.

## Scope
- Deleted: `hooks/{task-scale-advisor,gate-advisor,route-advisor}.sh` and
  `hooks/{test-task-scale,test-gate-advisor,test-route-advisor}.sh`
- `install.sh`, `install.ps1` — hook list derived from `hooks/hooks.json`
- `hooks/test-prompt-advisor.sh` — assertions folded in from the three suites
- `hooks/test-install-hooks.sh` — new, covers the derivation
- `.github/workflows/ci.yml` — three dead suite steps out, the new one in
- `hooks/test-bypass.sh`, `registries/{decision-rules,intents,policy}.json`,
  `scripts/{validate-engineos,test-validate-engineos}.sh`,
  `templates/adapters/{README,claude-code}.md` — stale references

## Checklist
- [x] Fold every uncovered assertion of the three suites into `test-prompt-advisor.sh`
- [x] Delete the three advisors and their suites
- [x] `install.sh` derives events/matchers/commands from `hooks/hooks.json`
- [x] `install.ps1` mirrors it, preserving the Windows `bash.exe` wrapping
- [x] Retired hooks dropped from existing installs
- [x] New `hooks/test-install-hooks.sh` + CI step
- [x] Every live reference to the deleted hooks fixed
- [x] Final gate: shellcheck + the touched suites + the validator, run once

## What was made
`prompt-advisor.sh` is now the only UserPromptSubmit adapter in both install
modes. The three deleted advisors contributed 588 lines of pure deletion; the
assertions their suites carried that `test-prompt-advisor.sh` did not already
check were folded into it first (47 cases, up from 7): the plural-only
countable-noun rule, the bare "design"/"architecture" silence cases, the
ten-rule decision matrix, the field-slot assertions on the per-rule line, the
escalation-reason names, the one-line deterministic contract, the exit codes,
the no-jq silent exit and the two telemetry-off paths.

Both installers read `hooks/hooks.json` and rewrite the leading
`"${CLAUDE_PLUGIN_ROOT}"` to the checkout path. `install.sh` builds a TSV of
event/matcher/command (splitting fields by parameter expansion, because tab is
IFS whitespace and `read a b c` would collapse an empty matcher's two tabs and
shift every field), then a single `jq` pass scrubs every previously installed
EngineOS entry under every event and re-adds the derived list. A command form
that is not `"${CLAUDE_PLUGIN_ROOT}"/hooks/<script>.sh` aborts the install
rather than registering a path that never fires. `install.ps1` does the same
through `ConvertFrom-Json`, keeping the `New-HookCommand` bash.exe wrapping
added upstream. No hand-typed retire list was needed: the generic scrub already
removes any EngineOS hook not in `hooks.json`, which covers `post-edit-check.sh`
and the three advisors, and a hand-typed `drop()` after it would be dead code.

## Verification
Final gate, run once at the end (`rules/verification.md`):

```
shellcheck -S error install.sh hooks/*.sh scripts/*.sh   rc=0
bash hooks/test-prompt-advisor.sh      prompt-advisor: 47 passed, 0 failed
bash hooks/test-install-hooks.sh       install-hooks: 7 passed, 0 failed
bash hooks/test-governance.sh          pass=15 fail=0
bash hooks/test-bypass.sh              pass=27 fail=0
bash hooks/test-docs.sh                pass=190 fail=0
bash scripts/validate-engineos.sh      passed 86, failed 3
bash scripts/test-validate-engineos.sh passed 78, failed 1
bash scripts/bench-runtime.sh          all 5 budgets ok
```

The validator's 3 failures and the negative suite's 1 failure are identical on
the base commit (0f3e1e4, checked in a clean extract): an archived record
missing "Changes registered", its spec link outside `docs/specs/`, the
intent-drift row count, and the deferred-rule negative case. Pre-existing, not
touched by this change.

`install.ps1` is unverified: no PowerShell on this machine. Changed with the
same shape as `install.sh` and reviewed by reading only.

## Changes registered
```
 .github/workflows/ci.yml          |  12 +--
 hooks/gate-advisor.sh             |  87 ---------------------
 hooks/route-advisor.sh            |  81 --------------------
 hooks/task-scale-advisor.sh       |  62 ---------------
 hooks/test-bypass.sh              |  14 ++--
 hooks/test-gate-advisor.sh        | 145 -----------------------------------
 hooks/test-install-hooks.sh       |  96 +++++++++++++++++++++++
 hooks/test-prompt-advisor.sh      | 127 +++++++++++++++++++++++++++++++
 hooks/test-route-advisor.sh       | 156 --------------------------------------
 hooks/test-task-scale.sh          |  57 --------------
 install.ps1                       |  72 ++++++++++--------
 install.sh                        | 102 ++++++++++++++-----------
 registries/decision-rules.json    |   2 +-
 registries/intents.json           |   2 +-
 registries/policy.json            |   2 +-
 scripts/test-validate-engineos.sh |   2 +-
 scripts/validate-engineos.sh      |   2 +-
 templates/adapters/README.md      |   2 +-
 templates/adapters/claude-code.md |   3 +-
 19 files changed, 339 insertions(+), 687 deletions(-)
```

Branch `refactor/one-prompt-adapter`, one commit, stacked on
`chore/ci-run-all-suites` (PR0) as the spec's PR table requires.

## Notes
- **PR size.** 588 lines are pure deletion of dead files (called out as the
  exception in `rules/git.md`). The non-deletion diff is 438 lines, 38 over the
  400 cap: 223 of those are the two test files, i.e. coverage rescued from the
  358 deleted test lines. Cutting to fit would mean dropping assertions the
  deleted suites carried, so the overage is reported rather than hidden.
- **No hand-typed retire list**, unlike the spec's PR2 row: this installer
  revision scrubs by hooks-dir prefix across every event before re-adding, so
  retirement is automatic and a second list would be provably dead. Retired
  names are asserted gone by `hooks/test-install-hooks.sh`.
- `scripts/kernel.sh` still names the deleted hooks in two historical comments
  (`:376`, `:401`); that file was out of scope for this change.
- `hooks/test-install-hooks.sh` runs the real `install.sh` against a throwaway
  `HOME`, so the jq program under test is the one that ships — no extracted
  copy to drift.
