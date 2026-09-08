---
name: 2026-09-05-release-wave6c
status: done
completed: 2026-09-05
owner: Ricardo Fagmer
spec: docs/specs/2026-09-04-typescript-runtime-migration-design.md
domain: general
---

## What
Wave 6(c) of the TypeScript runtime migration (plan Tasks 58-59): CI and installers in their final form (node >= 18 and shellcheck are the only tool prerequisites; `jq` gone), and the 1.7.0 release surface: COMPATIBILITY shim rows, `docs/release-notes/1.7.0.md`, README/ADOPTION prerequisites, `CLAUDE.md` router paragraph, plugin and marketplace version 1.7.0.

## Why
Every runtime path is ported and every bash suite is gone (Waves 1-6b). What remains is declaring it: the prerequisites consumers read, the deprecation window for the shims, and the version that carries it.

## Scope
`.github/workflows/ci.yml`, `install.sh`, `install.ps1`, `README.md`, `docs/ADOPTION.md`, `docs/COMPATIBILITY.md`, `CLAUDE.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `docs/release-notes/1.7.0.md`, mirrors the validator checks (C22c/C23) read.

## Checklist
- [x] Task 58: CI "Tools present" drops `jq`; shellcheck scope = `install.sh` + shims; installers' prerequisite checks and messages say node >= 18
- [x] Task 59: COMPATIBILITY shim rows (deprecated 1.7.0 / removed 2.0) complete; README + ADOPTION prerequisites; CLAUDE.md paragraph; plugin.json + marketplace.json 1.7.0
- [x] `docs/release-notes/1.7.0.md` via the `release-notes` skill
- [x] Human release gate recorded (decision row below; approval of the release itself is asked after this PR opens)
- [x] Final gate run once at the end

## What was made
Task 58: `.github/workflows/ci.yml` "Tools present" checks `shellcheck`, `bash`, `node` (jq dropped); JSON validation runs through `node -e JSON.parse`; the integrity check, evals and bench steps call `node dist/engineos.cjs validate|evals|bench` directly. The two gen drift guards stay on the `.sh` shims deliberately (one CI exercise of the deprecated shims before 2.0). Installers already required node >= 18 from Wave 3/4; `ENGINEOS_HOOK_LIBRARIES` shrank in 6(b); no installer edit was needed here.

Task 59: `docs/COMPATIBILITY.md` gains a public-surface row for the `dist/engineos.cjs` subcommand names, 1.7.0 rows for the remaining shims (`kernel.sh`, `exec-journal.sh`, `telemetry.sh`, `init-project.sh`, `bypass.sh` — deprecated 1.7.0, removed 2.0), the frozen `layout-manifest.sh`/`scaffold-layout.sh`, `python3` removed, the CI change, and the intro/jq/evals paragraphs updated. `README.md` and `docs/ADOPTION.md` prerequisites: jq and python3 not needed at all; working on the repo needs node >= 18 + shellcheck. `docs/release-notes/1.7.0.md` written in the directory's `<version>.md` convention (repo style: Summary / Added / Changed / What Was Fixed / Upgrade / What it does NOT do) and indexed. `.claude-plugin/plugin.json`, `marketplace.json`, `package.json`, `package-lock.json` 1.6.0 -> 1.7.0; `dist/engineos.cjs` rebuilt because the bundle embeds the version. `registries/policy.json` version left at 1.6.0 (no policy shape change). `CLAUDE.md` hooks paragraph already named node (earlier wave); C22c/C23 mirrors green, untouched.

## Verification
Run once at the end, after asking (user picked "Yes, full gate"):

```
$ npm run typecheck          -> rc=0
$ npm run -s build           -> rc=0; dist/engineos.cjs rebuilt (embedded version 1.6.0 -> 1.7.0)
$ node dist/engineos.cjs --version   -> engineos 1.7.0 (= package.json)
$ npm test                   -> tests 1961 pass 1961 fail 0 skipped 0
$ gate driver, 2026-09-05:
rc=0 :: build
rc=0 :: drift                 commands/agents and registries/agents.json clean (via the .sh shims, as CI does)
rc=0 :: evals
rc=0 :: usage-report
rc=0 :: validate              passed 104, failed 0 (62 checks)
rc=0 :: bench
rc=0 :: shellcheck            hooks/*.sh install.sh scripts/*.sh, no output
$ CI steps in their new node-direct form, run locally:
node -e JSON.parse(...)      -> ok for hooks.json, plugin.json, marketplace.json, routing.json
node dist/engineos.cjs evals     -> rc=0, passed 11, failed 0, skipped 33 (live tier off)
node dist/engineos.cjs bench     -> rc=0, five budgets ok
node dist/engineos.cjs validate  -> rc=0, passed 104, failed 0

bench (warm medians):
ok   route-intent: median=44.9ms budget<250.0ms
ok   resolve-task: median=50.6ms budget<500.0ms
ok   prompt-advisor (end to end): median=69.5ms budget<600.0ms
ok   route-before-change (cache hit): median=90.6ms budget<150.0ms
ok   always-on context: 27275 bytes budget<32000 bytes
```

## Human decisions
| 2026-09-05 | Ricardo Fagmer | (none fired) | approved | Risk classified medium (reversible working-tree changes on a stacked branch, no external effect until merge/tag; version bump and docs), autonomy A2. The prompt advisor's `high-risk` announcements were keyword matches on agent-report text; no `hitl.reasons` id fired for this work. User approved running the full gate via AskUserQuestion. |
| 2026-09-05 | Ricardo Fagmer | external-effect | pending | Release gate (`rules/gates.md`): merging the 20-PR stack to `main` and tagging `v1.7.0` are external effects. Owner: Ricardo Fagmer. Rollback path: revert the merge commit of `feat/release-wave6c` (docs + version) or the whole stack in reverse order; consumers re-run `install.sh`, which rewrites hook entries either direction. Residual risks: shims are deprecated, not removed, so nothing breaks for callers; Windows `kernel.sh` still needs bash. Watch after release: hook fires under old node (`[engineos] <hook> skipped` messages), CI "Tools present" on runners without shellcheck. Approval is asked in-session after PR #66 opens and recorded in `docs/release-notes/1.7.0.md`'s PR when given. |

## Changes registered
```
$ git status --short   (before commits)
 M .claude-plugin/marketplace.json
 M .claude-plugin/plugin.json
 M .github/workflows/ci.yml
 M README.md
 M dist/engineos.cjs
 M docs/ADOPTION.md
 M docs/COMPATIBILITY.md
 A docs/release-notes/1.7.0.md
 M docs/release-notes/README.md
 M package-lock.json
 M package.json
?? .engineos/changes/2026-09-05-release-wave6c.md

$ git diff --stat HEAD   (tail)
 package-lock.json               |   4 +-
 package.json                    |   2 +-
 11 files changed, 203 insertions(+), 29 deletions(-)

$ git log --oneline 844dfed..HEAD
1262ab6 chore(release): bump to 1.7.0 and rebuild dist
b4a8990 docs: 1.7.0 — node runtime, shims deprecated
a7dc031 ci: run the node runtime only
```

## Notes
- Base: `feat/suites-wave6b` head 844dfed (PR #65). Deviation from plan Task 58: `layout-manifest.sh` kept (see 6(b) record).
- Plan Task 59 named `CLAUDE.md`'s "hooks need jq" paragraph: it already reads node >= 18 since the hook shim wave; no edit.
- Open: `skills/release-notes/SKILL.md` step 5 still says `release-notes-<version>.md` while this directory uses `<version>.md` (pre-existing, noted in the directory README).
- Next after merge: tag `v1.7.0` on `main` (human), then Wave 7 / 2.0 planning (shim removal, TypeScript scaffold).
