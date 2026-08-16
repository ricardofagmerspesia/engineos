---
name: 2026-08-02-post-merge-followups
status: done
completed: 2026-08-02
owner: Ricardo Fagmer
spec: docs/specs/2026-08-02-ai-methodology-integration-analysis.md
domain: docs
---

## What

Follow-ups to the Wave 1 / Waves 2-4 methodology work: bring plugin metadata
and onboarding docs current with what those PRs actually shipped, and add a
scheduled CI job for the live eval tier that the deterministic tier can't
substitute for.

## Why

`docs/COMPATIBILITY.md` (shipped in Waves 2-4) requires a MINOR version bump for
additive public-surface changes — the plugin manifest was not bumped when those
PRs were opened, meaning the rule was shipped and immediately unfollowed by its
own author. `README.md` / `docs/START.md` / `docs/ADOPTION.md` still described
the pre-Wave-1 world (6 always-on rules, 18 agents, no registries, a stale
`archived/YYYY/MM/DD` path that was already wrong before this session). And the
live eval tier had never been run — router accuracy against a real model was
completely unmeasured.

## Scope

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — version bump
- `README.md`, `docs/START.md`, `docs/ADOPTION.md` — drift fixes
- `.github/workflows/live-evals.yml` — new, scheduled + manual-dispatch only
- `scripts/run-evals.sh` — fixed the live-tier router-line grep (see Notes)
- `hooks/layout-manifest.sh`, `hooks/lib-common.sh` — mode restored to 644
  (matches their own documented "sourced only, no exec bit" convention; was
  755, dirty since before this session)
- Downloads cleanup and `/tmp` scratch removal — not repo-tracked, no diff

## Checklist

- [x] Bump plugin.json + marketplace.json 1.2.0 -> 1.3.0 (MINOR: additive only)
- [x] Fix README "What's inside" table: new rules, registries, critic agent,
      retro skill, gate-advisor hook, handoff template, adapters
- [x] Fix README archived-path doc (`<DD>` -> `<domain>`)
- [x] Add README note on required pre-merge checks
- [x] Fix docs/START.md: agent count, critic/vera alias, always-on rule list,
      retro skill, gate-advisor hook, lifecycle diagram, cheat sheet
- [x] Fix docs/ADOPTION.md stale archived-path comment (pre-existing drift,
      unrelated to this session's rules but caught while doing this pass)
- [x] Add `.github/workflows/live-evals.yml`: weekly + manual, cost-gated off
      the ANTHROPIC_API_KEY secret, non-blocking (separate from ci.yml)
- [x] Restore hooks/{layout-manifest,lib-common}.sh to mode 644
- [x] Run the live eval tier; found and fixed a harness bug, found and
      documented an environment-mismatch limitation (see Notes) — did not
      complete a full 33-case graded run, for reasons stated in Notes
- [x] Delete 15 redundant knowledge-base zips from ~/Downloads, keep v2.1
- [x] Delete /tmp/kb extraction scratch

## What was made

Bumped both plugin manifest files to 1.3.0 and reworded their descriptions to
mention the risk-tiered gates and the critic agent, per
`docs/COMPATIBILITY.md`'s own MINOR rule (additive: new rules, agent, skill,
registries; nothing renamed or removed).

Updated `README.md`'s "What's inside" table with rows for `risk-autonomy.md`,
`gates.md`, `context.md`, both registries, `agents/critic.md`,
`hooks/gate-advisor.sh`, `skills/retro`, `templates/handoff.md`,
`docs/COMPATIBILITY.md`, and `templates/adapters/`. Fixed the archived-path
snippet, which said `<YYYY>/<MM>/<DD>` but the actual layout (since a July
change) is `<YYYY>/<MM>/<domain>`. Added a "run these before merging"
pointer to `scripts/validate-engineos.sh` / `scripts/run-evals.sh`, and a note
on the new scheduled live-eval workflow.

Updated `docs/START.md`: agent count 18 -> 19, added `critic` to the
reviewers/writers list and its alias `vera` to the alias table, added `retro`
to the skills table, added `gate-advisor` to the hooks table, expanded the
always-on rules bullet to the current 9, added a risk/autonomy line, fixed the
same stale archived-path in the lifecycle diagram, and added `critic` and
`retro` to the cheat-sheet table.

Fixed the same stale `archived/.../DD/` path in `docs/ADOPTION.md`'s
record-change example comment — this one predates this session (from the July
"drop archive day folder" change) and was caught incidentally while doing this
pass, not introduced by Waves 1-4.

Added `.github/workflows/live-evals.yml`: a separate workflow (not a job in
`ci.yml`) triggered by a weekly cron plus `workflow_dispatch`, installing the
`claude` CLI via npm and running `ENGINEOS_EVAL_LIVE=1 scripts/run-evals.sh`
gated on an `ANTHROPIC_API_KEY` repo secret being present (skips cleanly if
not). Deliberately not wired into the PR-blocking `verify` job: it spends real
model tokens, and per `evals/RUBRIC.md` the deterministic tier already proves
the eval set is well-formed on every PR — this workflow is the only place that
measures whether the router still actually matches it.

Restored `hooks/layout-manifest.sh` and `hooks/lib-common.sh` to mode 644,
confirmed both are `source`d only (never executed directly, verified via
`grep -rn "layout-manifest" hooks/*.sh install.sh`) and that `lib-common.sh`'s
own header already documents "no shebang/exec bit" as the intended convention
— the 755 mode was simply wrong, not a deliberate change to preserve.

Deleted 15 of 17 supplied knowledge-base/platform zips from `~/Downloads`
(`ai-development-knowledge-base-v2` through `v8`, `ai-engineering-platform-v2`
through `-final`), keeping only `ai-engineering-platform-v2.1.zip` — confirmed
earlier as the content-superset of all the others. `iTermBrowserPlugin-1.0.zip`
left untouched (unrelated). Removed the `/tmp/kb` extraction directory (41M,
scratch space, not repo-tracked).

## Verification

```
scripts/validate-engineos.sh   passed 23, failed 0
scripts/run-evals.sh           passed 11, failed 0, skipped 33   (grep fix didn't break the deterministic tier)
bash hooks/test-layout.sh      pass=14 fail=0 skip=0   (after the chmod restore)
git diff hooks/layout-manifest.sh hooks/lib-common.sh   (empty — matches HEAD)
jq empty .github/workflows not applicable (YAML, not JSON) — visually reviewed
  against the existing templates/github/*.yml structure
```

Not verified: `live-evals.yml` has not actually run in GitHub Actions yet (no
`ANTHROPIC_API_KEY` secret is known to be configured on this repo) — it will
either run against a real model on the next Monday/manual dispatch, or report
SKIP with a clear message if the secret is absent. Either outcome is
distinguishable in the Actions log; there is no silent failure mode.

## Notes

- Ran the live eval tier (`ENGINEOS_EVAL_LIVE=1 scripts/run-evals.sh`) for the
  first time. It surfaced two real problems, not a clean baseline — exactly
  what running it for real is supposed to do, and neither was catchable by the
  deterministic tier.

  1. **Harness bug, fixed.** The grep that captures the router line was
     anchored to line-start (`^\[router\]`). The model frequently wraps its
     own announcement in a markdown code span
     (`` `[router] intent=backend risk=medium autonomy=A2 ...` ``), so the
     literal first character of the line is a backtick and the anchored grep
     silently missed it — reporting "emitted no [router] line" for cases where
     the router had, in fact, correctly fired. Fixed in `scripts/run-evals.sh`
     by dropping the anchor; confirmed against a manual repro
     (`claude -p "add a POST /orders endpoint with validation" --output-format json`
     showed the line was present, wrapped, all along).

  2. **Environment mismatch, not fixed — needs a decision.** EngineOS's own
     repo has no application code (no `package.json`, no NestJS/React tree, no
     migrations). Domain-specific eval prompts ("add a POST /orders endpoint",
     "build a NestJS orders module...") correctly trigger the model refusing
     to fabricate a fake target (`rules/base.md` bans placeholder paths) and
     asking which repo/path is meant — which is *correct, safe behavior* — but
     it does so **inconsistently**: re-running the identical prompt
     (`this query takes 8 seconds, add the right index`) once showed the
     router line before pivoting to ask for the missing query, and once
     omitted it entirely. The router announcement is not reliably emitted when
     the model is blocked on a missing target rather than proceeding with the
     task.

     The two cases immune to this (`intent-012`, a pure question with no
     routing expected; `intent-019`, a trivial single-file fix) behaved
     correctly and consistently across repeated runs — silence both times, as
     required.

     **This means the full 33-case suite cannot be meaningfully graded by
     running `claude -p` from inside the EngineOS repo itself** — most of the
     domain rows (backend/frontend/dba/mobile) will hit this same "no target
     here" branch and the result will measure the target-repo ambiguity, not
     router accuracy. Did not burn tokens forcing the remaining ~28 cases
     through a run that would not produce a trustworthy signal.

     **Recommendation, not yet actioned:** run `ENGINEOS_EVAL_LIVE=1
     scripts/run-evals.sh` from inside a scratch project that actually
     contains `src/*.controller.ts`, a `components/` tree, a migrations
     folder, etc. — so domain prompts have a real target and the router's
     classify-and-announce behavior is what's being measured, not its (correct)
     refusal to act without one. Alternatively, extend `rules/gates.md` or the
     router contract to require the `[router]` announcement even when the
     model is blocked on a missing target — the constitution says "before any
     substantive task," which arguably should include the moment of
     classifying intent even if execution then pauses for clarification. That
     would be a `skills/retro`-shaped proposal once there is enough signal
     (right now this is n=1 pattern, not yet the 3-occurrence threshold).
- Did not run `skills/retro` despite `.engineos/archived/` holding 24 records
  (well past the 3-occurrence threshold): the new methodology work only just
  landed in this session, so there is no post-adoption signal to mine yet, and
  most of the 22 pre-existing records predate the risk/gate vocabulary this
  work introduced. Forcing a retro now would mean either restating what the
  two just-written change records already say (an explicit anti-pattern in
  `skills/retro/SKILL.md`) or reaching into unrelated older records for a
  pattern that doesn't actually connect. Revisit after a few weeks of real use.
- Did not attempt the "adapter reality check" (exercising the Cursor/Codex
  adapters against a real project) — no such project available in this
  session; genuinely out of scope here, not skipped for convenience.
