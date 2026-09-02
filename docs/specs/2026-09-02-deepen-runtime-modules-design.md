# Deepen the runtime modules — design

Source: architecture review of 2026-09-02 (hot spots from `git log`, explorer
sub-agent walk, grilling rounds). Vocabulary: `codebase-design` skill (module,
interface, depth, seam, adapter, leverage, locality) and `CONTEXT.md` (Route,
Decision kernel, Gate, Check, Evidence).

## Problem

The runtime layer — hooks, `scripts/kernel.sh`, registries, the validator and
the two installers — has grown by accretion. Eight kinds of friction, each with
file:line evidence in the review:

1. **Advisor family.** `prompt-advisor.sh` is the deep adapter (one `resolve-task`
   call). `task-scale-advisor.sh`, `gate-advisor.sh`, `route-advisor.sh` are
   shallow adapters onto subcommands `resolve-task` already composes, with the
   guidance text copied into two quoting dialects. `hooks/hooks.json` registers
   only the deep one; `install.sh` / `install.ps1` register only the three
   shallow ones and never `prompt-advisor.sh`. Symlink installs get three kernel
   spawns per prompt and no task contract. The parity the installer comment
   asserts is enforced nowhere.
2. **Validator.** `scripts/validate-engineos.sh` is 1117 lines, 6 functions, 19
   inline `if want CN` blocks. A Check's contract is unstated and includes "emit a
   phrase that `test-validate-engineos.sh:20-40` maps back to a group"; a missed
   phrase falls through to running everything, silently.
3. **Kernel surface.** 13 public subcommands; the runtime calls 2
   (`resolve-task`, `route-path`); the router agent calls 5 more; `retry` and
   `capability` have no caller. Registry loading is repeated at 13 sites.
4. **Validation gate.** `hooks/stop-verify.sh` writes the Nx and npm ladders
   twice; the infra-vs-red judgment already diverged between them.
5. **Hook preamble.** Envelope decode, jq guard, cwd/sid extraction, telemetry
   emit (4 verbatim copies) and `hookSpecificOutput` formatting are repeated in
   every hook; `lib-common.sh` holds filesystem helpers only.
6. **Routing shim.** `hooks/routing-map.sh` has no runtime caller; its only
   consumer is its own test; `test-docs.sh:102-107` greps it for literals that
   the validator forbids, so those loops pass over an empty set. The EngineOS
   self-exclusion lives in three places.
7. **Model tiers.** The tier list lives in five places; the generator's
   `opus -> design` reverse map is lossy because `models.json` binds `design`
   and `build` to the same model.
8. **CI.** 7 of 17 suites never run in CI, including `scripts/test-kernel.sh`.

## Decision

Eight PRs, each ≤400 lines, sequential, opened via `gh`, human-merged (A3).

| PR | Branch | Change |
|---|---|---|
| A | `feat/unified-prompt-advisor` | Pre-existing, previously unpushed: kernel `resolve-task`, the unified `prompt-advisor.sh`, cached routing (3 commits). Every PR below stacks on it. Exceeds the 400-line cap because it is already-committed work, not new. |
| 0 | `chore/ci-run-all-suites` | Wire the 7 skipped suites into `.github/workflows/ci.yml`. This spec lands here. |
| 1 | `refactor/hook-envelope` | `lib-common.sh` gains the hook envelope, hook output and telemetry notions; registered hooks shed their preamble. New `hooks/test-lib-common.sh`. `CONTEXT.md` gains **Hook envelope**. |
| 2 | `refactor/one-prompt-adapter` | Delete `task-scale-advisor.sh`, `gate-advisor.sh`, `route-advisor.sh` and their suites. Installers derive the hook list from `hooks/hooks.json` (rewriting `${CLAUDE_PLUGIN_ROOT}`); only the retire list stays hand-typed and `drop()`s the three. Validator C-check for the installer list is unnecessary once derived. |
| 3 | `refactor/delete-routing-map` | Delete `hooks/routing-map.sh`, C17d, the empty `test-docs.sh` family-2 loops; fix README, CONTRIBUTING and the two adapter templates. Self-exclusion becomes `routing.json .excluded.self_dirs` (root-relative, e.g. `["hooks","docs"]`), resolved by the kernel against its own root and read by `mark-unrecorded.sh`. |
| 4 | `refactor/validator-checks` (may split in two) | Each Check becomes `check_CNN()` declaring its id, living in `scripts/checks/<family>.sh`; an ~80-line harness in `validate-engineos.sh` discovers, runs, reports. `--only CNN` targets a Check. `test-validate-engineos.sh` drops `group_for`. Ids unchanged. |
| 5 | `refactor/kernel-loader` | One registry loader; delete `retry` and `capability`; list kernel subcommands in `docs/COMPATIBILITY.md` as public surface so later demotions get a window. |
| 6 | `refactor/verify-runner-seam` | One verification ladder in `stop-verify.sh`; Nx and npm/pnpm/yarn become adapters behind a runner seam. Tests stay on real npm (decision: no fake adapter). |
| 7 | `feat/agent-tier-frontmatter` | `tier:` in agent frontmatter (additive, MINOR); generator copies it; new Check asserts tier's model in `models.json` equals the agent's `model:`; `exec-journal.sh` and the generator read tiers from `models.json`. Validator keeps its own regex with a comment saying why. Version 1.5.0 -> 1.6.0, first `docs/release-notes/`. |

### Frozen contract for PR1 (consumed by PRs 2, 4, 6)

`hooks/lib-common.sh` provides, after `. lib-common.sh`:

- `hook_read_envelope` — reads stdin once into `HOOK_INPUT`; exits 0 when `jq`
  is absent; one NUL-delimited jq pass sets `HOOK_CWD` (default empty),
  `HOOK_SID` (default `nosession`), `HOOK_PROMPT`, `HOOK_FILE`
  (`.tool_input.file_path`), `HOOK_TOOL` (`.tool_name`), `HOOK_TRANSCRIPT`
  (`.transcript_path`), `HOOK_STOP_ACTIVE` (`.stop_hook_active`, default `false`).
- `hook_context <event> <text>` — prints
  `{hookSpecificOutput:{hookEventName:<event>, additionalContext:<text>}}`.
- `hook_telemetry <event> <data-json>` — appends to
  `<git-dir>/engineos-telemetry/<HOOK_SID>.jsonl` via `scripts/telemetry.sh
  append`; no-op (exit 0) when `ENGINEOS_TELEMETRY=0`, `HOOK_CWD` is empty, the
  repo has no `.engineos/`, or there is no git dir. Never fails the hook.
- Sourcing `lib-common.sh` also sources `bypass.sh`, so hooks source one file.

Existing helpers (`find_up`, `TO`, `runner_detect`, `ensure_modern_node`,
`git_dir`, `repo_root`) are unchanged.

## Rejected alternatives

- **Stub the legacy advisors for one MINOR.** Rejected: hook internals are not
  public surface per `docs/COMPATIBILITY.md`, and stubs keep the three-spawn
  defect alive for the window.
- **Keep hand-typed installer lists plus a validator Check.** Rejected: the
  deletion test says the second copy earns nothing; deriving removes the sync.
- **Demote `route-intent`/`scale`/`decision-rules` now.** Deferred: they lose
  their last callers in PR2, so demotion belongs to a later MINOR with a window.
- **Self-exclusion stays code** (the decision recorded at `kernel.sh:72` and
  `routing.json .excluded.note`). Reversed: the runtime-relative concern is met
  by a root-relative list the kernel resolves; three hand-synced copies were the
  cost of keeping it code.
- **Fake runner adapter for `stop-verify.sh` tests.** Rejected by the owner:
  tests stay on real npm.
- **Keep the reverse tier map.** Rejected: every opus agent is recorded as
  `design`; the agent is the one place that knows what work it does.

## Risk

Medium. Reversible by `git revert`; blast radius is every consumer's installer
and hooks; no data, no secrets. Autonomy A3: every PR is human-merged. Gates:
Design (this file), Implementation (routed rules), Validation (each PR's own
suites + shellcheck, run once per PR), Release (1.6.0 notes in PR7).

## Verification per PR

Scoped bash suites for the touched modules plus `shellcheck` on touched
scripts, run once at the end of the PR's work; `scripts/validate-engineos.sh`
full run before opening each PR. CI runs the full set after PR0.
