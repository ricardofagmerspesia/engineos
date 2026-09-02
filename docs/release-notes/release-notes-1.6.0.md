## EngineOS v1.6.0

_Released 2026-09-02 · Ricardo Fagmer_

### Summary

The runtime-deepening release. Eight units of work replaced duplicated
copy-paste with named seams: one prompt adapter instead of four, one hook
envelope instead of eight copies, one verification ladder instead of two, one
registry loader in the kernel instead of thirteen, and an integrity validator
that discovers its Checks instead of listing them in a 1134-line script. CI ran
for the first time since the workflow was created. Agent model tiers are now
declared, not inferred.

**Reinstall after upgrading.** Two separate defects meant some installs had
fewer hooks than they reported — see Upgrade.

This is MINOR, not MAJOR: nothing on the public-surface table of
`docs/COMPATIBILITY.md` was removed or renamed. The removals listed below were
either internal (files never registered in `hooks/hooks.json`) or covered by an
explicit carve-out in the policy itself.

### Breaking Changes

None on the declared public surface. Four changes can still break tooling built
against undeclared internals, so they are called out here rather than buried.

#### `scripts/kernel.sh retry` and `capability` are gone

Both had no caller anywhere in the repo, in any hook, command, skill, agent,
doc, test or registry. They were removed deliberately as the last removals the
compatibility policy did not yet cover — the same change then added the kernel
CLI to the public-surface table, so this cannot happen again without a
deprecation window.

Migration: `retry` read `registries/policy.json` `.retry`, which is unchanged —
read it directly, or use `kernel.sh repair`. `capability` read
`registries/capabilities.json`, also unchanged — read it directly.

#### `validate-engineos.sh --only` takes exact Check ids

The range groups `C3-4`, `C6-8` and `C9-11` existed only inside the old flat
script and are gone. An unknown `--only` token now exits 2 on stderr; it
previously ran nothing and exited 0, which is how a typo could silently skip
every Check it was meant to run.

Migration: pass real ids (`--only C9,C10,C11`). A bare parent id still selects
its letter-suffixed sub-checks, so `--only C17` runs C17, C17b, C17c and C17e.

#### Routing patterns move to the registry

`hooks/routing-map.sh` is deleted. The EngineOS self-exclusion it carried is now
data: `registries/routing.json` `.excluded.self_dirs`.

Migration: if you had edited the shim to add routing patterns, edit
`registries/routing.json` instead. This is where the docs already pointed for
`match`/`excluded` globs; the shim was the last place that held routing data of
its own.

#### `route-before-change.sh` injects pretty-printed JSON

The injected context went from one compact line to `jq -n` output. Parse it with
`jq`, not line-wise.

### What's New

#### Agent model tiers are declared, not inferred

Every agent in `agents/*.md` carries a `tier:` line (`build`, `design`,
`most-capable` or `cheap`). The tier is the contract and the model name is only
today's binding — and because two tiers can share a binding (`build` and
`design` both bind `opus`), a tier is not recoverable from a model name. Sixteen
agents had drifted after the last model rebind; guessing gave 21 of 22 agents
the wrong tier.

`registries/agents.json` carries the declared tier as `model_tier`, and
`registries/models.json` is the single source of truth for the tier vocabulary —
`scripts/exec-journal.sh` reads it from there rather than carrying its own copy.

Two guards make it stick: `scripts/gen-agent-registry.sh` refuses to emit an
agent whose `tier:` is missing, unknown, or bound to a model other than the one
the agent declares, and a new integrity Check (C24) refuses to let such an agent
sit in the tree even if nobody regenerates the registry.

#### One prompt adapter

`hooks/prompt-advisor.sh` is the only `UserPromptSubmit` adapter, returning one
deterministic task contract: matched intents, policy rules to load, risk floor,
autonomy ceiling, agents, skills and gates. It replaces three shallower
advisors that each spawned the kernel separately.

Symlink installs are the ones that gain most here: they had registered only the
three shallow advisors and never the deep one, so they paid three kernel spawns
per prompt and received no task contract at all.

#### Installers derive the hook list from `hooks/hooks.json`

Both `install.sh` and `install.ps1` read events, matchers and commands from
`hooks/hooks.json` instead of hardcoding them, then scrub every previously
installed EngineOS entry under every event before re-adding the derived list.
A command form that is not `"${CLAUDE_PLUGIN_ROOT}"/hooks/<script>.sh` now
aborts the install rather than registering a path that would never fire.

`install.ps1` mirrors this and preserves the Windows `bash.exe` wrapping, but
was reviewed by reading only — no PowerShell was available on the authoring
machine. Windows consumers should verify their hook list after installing.

#### One hook envelope

`hooks/lib-common.sh` gained `hook_read_envelope`, `hook_context` and
`hook_telemetry`. Eight hooks migrated off their own copies of the same
preamble, which had been duplicated verbatim four times and whose
`hookSpecificOutput` JSON literal appeared at seven sites — a fix to any of it
previously had to be made five to seven times. `prompt-advisor.sh` shrank from
101 to 77 lines; six hooks lost their preamble entirely.

`stop-verify.sh` and `ensure-project-layout.sh` deliberately keep their own
grep/sed decode so their no-jq degradation survives.

#### One verification ladder

`hooks/lib-runner.sh` is a new seam with five documented functions
(`runner_select`, `runner_handle`, `runner_has_target`, `runner_run`,
`runner_infra_skip`). The Stop-gate Validation hook went from two parallel
ladders — one for Nx, one for pnpm/yarn/npm, each with its own timeout table,
failure accumulation and infra-vs-red judgment — to one, and from 223 lines to
186. Six `command -v jq` probes became one.

#### The integrity validator discovers its Checks

`scripts/validate-engineos.sh` is an 82-line harness over
`scripts/checks/<family>.sh`, down from a 1134-line flat script. Adding a Check
is adding a `check_<id>()` function in a family file; nothing in the harness
needs to know about it. `--list` prints the discovered ids.

Check ids and every `ok`/`bad` message string are byte-identical to 1.5.0.
Discovery found 44 Checks where the README had claimed 23 — the count was stale,
not the coverage.

#### One registry loader in the kernel

Every `registries/*.json` read in `scripts/kernel.sh` goes through one internal
seam. Thirteen call sites each used to know where registries live and each could
drift on how a missing one is reported. Observable CLI output is byte-identical
across all 68 invocations except the usage string, and no runtime budget
regressed.

### What Was Fixed

#### CI had never run

`.github/workflows/ci.yml` used YAML flow-mapping syntax for a `run:` key, which
made the file invalid. GitHub rejected it on every push since it was created —
every run failed in 0 seconds, so the badge was red for a reason nobody read as
"the workflow does not parse". Fixed, and the seven existing test suites CI had
never invoked are now wired in: `test-kernel.sh`, `test-bypass.sh`,
`test-docs.sh`, `test-agent-announce.sh`, `test-telemetry.sh`,
`test-post-edit.sh` and the prompt-advisor suite. The first executing run
immediately exposed four pre-existing defects on `main`, all fixed here.

#### `install.sh` reported success while installing zero hooks

The jq hook merge referenced shell variables without `--arg`, so jq aborted with
`"$announce is not defined"` — and `|| true` followed by `&& mv` swallowed the
failure. The installer printed success and installed nothing. `install.ps1` was
never affected. It also now registers the `PostToolUse Agent|Task` return
announcement, which it had never wired.

Anyone who installed via `install.sh` between the regression and this release
has no EngineOS hooks and must reinstall.

#### The Stop gate no longer goes red on a missing script

The infra-skip guard now covers the package-manager arm, not just Nx. A non-zero
run whose output carries the runner's own missing-script wording is treated as
an infra skip rather than a failure; in practice this fires for pnpm and yarn,
since `npm run -s` silences npm's report. A missing binary or a genuinely
failing check matches nothing and still goes red.

This loosens a gate. A project that relied on red-on-missing-script now gets a
skip — add the `lint` or `typecheck` script if you were depending on that
signal.

### Removed

Named explicitly, because consumers may have referenced them.

#### Three prompt-advisor hooks

`hooks/task-scale-advisor.sh`, `hooks/gate-advisor.sh` and
`hooks/route-advisor.sh`, with their suites `hooks/test-task-scale.sh`,
`hooks/test-gate-advisor.sh` and `hooks/test-route-advisor.sh` — 588 lines of
hook plus 358 of test, all pure deletion. Their three CI steps went with them.

These were **not** public surface and get no deprecation window: the public
surface is the hook event contract in `hooks/hooks.json`, and that file has only
ever registered `prompt-advisor.sh` for `UserPromptSubmit`. The three advisors
were left on disk after 1.5.0's prompt-adapter work as unregistered legacy
entrypoints; `prompt-advisor.sh` supersedes all three.

If you wired any of them into your own settings by hand, replace all three with
`prompt-advisor.sh` — you will get more, not less, from one invocation.

#### One routing shim

`hooks/routing-map.sh` (30 lines). Its self-exclusion data became
`registries/routing.json` `.excluded.self_dirs`. See Breaking Changes.

#### Two kernel subcommands

`scripts/kernel.sh retry` and `scripts/kernel.sh capability`. See Breaking
Changes. The registries they read — `policy.json` `.retry` and
`capabilities.json` — are both kept.

#### One router row

`CLAUDE.md`'s "Coordinated multi-domain change" row. It had no registry intent
and duplicated the big/multi-domain row, which is what to use instead.

#### Validator vocabulary

Check `C17d`; the `--only` range groups `C3-4`, `C6-8`, `C9-11`; the `group_for`
mapping table in the negative-test harness; `hooks/test-docs.sh`'s
hook-to-table parity family, which asserted parity with the deleted shim.

### Public Surface

`docs/COMPATIBILITY.md` gained one row and `registries/routing.json` gained one
key. Both are additive, hence MINOR.

#### The kernel CLI is now declared surface

`scripts/kernel.sh` subcommand names and their JSON answer shape are on the
public-surface table. Eleven subcommands are named: `route-path`,
`route-intent`, `model`, `risk`, `gates`, `repair`, `waves`, `decision-rules`,
`scale`, `route-escalate` and `resolve-task`.

Adding a subcommand or a field to an answer is MINOR. Removing or renaming
either is MAJOR and gets the deprecation window. The kernel's internals are
explicitly not surface: the registry seam, the jq programs, and how many
processes an answer costs are free to change as long as the answer does not.

#### `registries/routing.json` `.excluded.self_dirs`

An additive key. No existing key was renamed or removed, so the registry's
top-level shape — which is public surface — is unchanged.

#### Newly tightened checks that can fail a fork's CI

Per the compatibility policy, a tightened rule is MINOR and gets said out loud:

- A capability's `model_tier` must equal its agent's `tier:` (C15, C15b).
- An agent's declared `tier:` must bind, in `registries/models.json`, the model
  it also declares (C24, new in this release).
- `scripts/gen-agent-registry.sh` hard-errors on a missing, unknown or
  model-inconsistent `tier:`. A forked agent file without one breaks generation.
- `agents/router.md`'s `model:` is asserted against `registries/models.json`
  (C18a, retargeted).
- The self-exclusion is now genuinely asserted (C17c) rather than nominally.

Explicitly **not** public surface, and free to change: `validate-engineos.sh`'s
`--only` vocabulary (a script CLI is not on the table, and the policy frees test
files), hook internals including the `lib-common.sh` and `lib-runner.sh` seams,
and rule prose that keeps its path and meaning.

### Upgrade

EngineOS installs as a Claude Code plugin from a checkout:

```
cd ~/projects/engineos && git fetch --tags && git checkout v1.6.0 && ./install.sh
```

On Windows, run `install.ps1` instead.

**Reinstalling is required, not optional.** Two independent defects mean an
existing install may not have the hooks it reported: `install.sh` was installing
zero hooks while printing success, and symlink installs never registered the
deep prompt adapter. Both installers now derive the hook list from
`hooks/hooks.json`.

Note that the install scrubs every previously installed EngineOS hook entry
under every event before re-adding the derived list. If you had hand-edited
EngineOS hook entries in your own settings, save them first — they will be
removed. Your own non-EngineOS hooks are untouched.

Pin the version. Read `docs/COMPATIBILITY.md` before upgrading a MINOR: the
tightened checks above can fail a build that passed yesterday.
