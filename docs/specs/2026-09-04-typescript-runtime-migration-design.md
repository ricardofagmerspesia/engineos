# TypeScript runtime over bash — migration design

Date: 2026-09-04
Status: approved in review (two design sections approved by the owner on 2026-09-04;
`critic` architecture review folded in the same day, see "Review findings")
Risk: medium — reversible per PR (`git revert`), no sensitive data, but the kernel
CLI, `hooks/hooks.json` wiring and the installers are contract surface that plugin
consumers depend on (`docs/COMPATIBILITY.md`). Autonomy ceiling A3: nothing is
released without a human approving the release gate.
ADR: `docs/adr/2026-09-04-typescript-runtime-over-bash.md`
Related: `docs/adr/2026-09-04-keep-mermaid-reject-langgraph.md` (out of scope here)

## Problem

EngineOS's runtime is 49 bash scripts, about 11,300 lines, plus 7 check families.
The shape costs us in four measurable ways:

| Pain | Evidence |
|---|---|
| `jq` is a hard dependency | 27 `command -v jq` probes in 21 files; without it 4 hooks exit 0 silently (`CLAUDE.md` router section, check C1) |
| Windows needs Git Bash's `bash.exe` | `install.ps1` lines 263-279 resolve `bash.exe` by hand because a bare `.sh` spawns a terminal per hook fire |
| macOS bash 3.2 and BSD userland are the baseline | 4-rung millisecond clock ladder in `hooks/lib-common.sh`, GNU/BSD `stat` and `sed` divergences, no arrays, no `[[ =~ ]]` |
| Every hook fire pays for subprocesses | one `hook_span` spawns `exec-journal.sh` plus `jq`; per-edit hooks cost about 4 s on the owner's machine |

The logic itself is JSON in, JSON out: 14 kernel subcommands over seven registries,
two JSONL schemas, a route cache, a scaffold. Bash is the wrong tool for that
shape; the workarounds above are the tax.

## Goals

1. One TypeScript codebase under `src/`, compiled to a single committed bundle
   `dist/engineos.cjs`, with no runtime dependencies.
2. Every public contract in `docs/COMPATIBILITY.md` preserved byte for byte:
   kernel subcommand names and JSON answer shapes, hook event contract, registry
   shapes, return envelope.
3. `jq`, Git Bash and `python3` stop being requirements on the hook path and in
   the installers. `node >= 18` and `git` remain. (`scripts/kernel.sh` is a bash
   shim until 2.0, so a Windows consumer calling that public entry point directly
   still needs a bash; `node dist/engineos.cjs kernel ...` is the bash-free form.)
4. Existing black-box bash test suites stay green against the new runtime for the
   whole migration, then get ported.
5. Runtime budgets in `scripts/bench-runtime.sh` hold or improve.

## Non-goals

- Changing any behaviour the hooks, kernel or checks have today, except the
  deviations listed under "Deliberate deviations".
- Rewriting `install.sh` / `install.ps1` in TypeScript. Installers bootstrap the
  machine before node is verified; they stay shell and PowerShell. Their JSON
  work (parse `hooks.json`, scrub and add entries, merge permissions) moves into
  the `engineos settings-merge` subcommand, which is how `jq` leaves the installers.
- Replacing Mermaid diagrams or adopting an orchestration framework (ADR 1).
- Building the headless runner `rules/observability.md` plans.

## Decisions already taken (owner, 2026-09-04)

| Decision | Choice | Rejected |
|---|---|---|
| Runtime | Node, `dist/engineos.cjs` committed | Bun `--compile` (50-90 MB per platform), build-at-install (fails offline), Go, Python |
| Scope | Full migration: kernel, hooks, scripts, checks, tests | Kernel only; kernel + hooks |
| Branching | Trunk-based; each PR lands on `main` behind a shim | Long-lived integration branch |
| hooks.json | Calls `node ... hook <name>` directly | Keep `.sh` shims registered (keeps Git Bash on Windows) |
| Old node on PATH | Guard re-execs a newer node when found | Warn-and-exit only |
| Test framework | `node:test`, no framework | vitest/jest |
| PR size | `rules/git.md` limit of 400 lines holds; 30-36 PRs | Fewer, larger PRs |
| Kernel shape (2026-09-04, architecture review) | One `resolve(facts, ctx)` module; legacy arms are projections; new `resolve` arm (MINOR); parity suite until 2.0 | One module per subcommand (ports the shallow surface one to one); two modules `resolve`/`govern`; deprecating the shallow arms in this migration |

## Architecture

### Layout

```
src/
  cli.ts              entry: node-version guard, subcommand dispatch, exit-code policy
  lib/
    fs.ts             lstat-first helpers, atomic write (tmp + rename), find-up
    git.ts            spawnSync('git', ...) wrappers: toplevel, absolute-git-dir, prefix
    time.ts           Date.now() based; ISO-8601 UTC formatter
    slug.ts           SLUG_RE, PATH_SLUG_RE and the two sanitizers
    json.ts           readJson with typed narrowing; error helpers per CLI convention
  registry/           one typed loader per registries/*.json; lazy, path-bound
  kernel/             one deep module: resolve(facts, ctx); concept modules private;
                      cli.ts holds the projections (see "Kernel shape" below)
  journal/            exec-journal and telemetry: schema.ts is the one field table; append, validate, usage and the hook writers derive from it
  hooks/
    envelope.ts       stdin decode into HookEnvelope (cwd, session_id, prompt, file, tool, transcript, stop_hook_active)
    bypass.ts         three-tier bypass: env > machine flag > per-repo marker
    telemetry.ts      in-process writers for <sid>.jsonl, <sid>.exec.jsonl, spans/
    scaffold.ts       symlink-safe directory + seed creation, manifest as data
    runner.ts         nx / npm-family detection, target probe, run with timeout, infra-skip regexes
    cache.ts          route cache keyed by sid + routing.json signature + buster
    output.ts         HookDecision (silent | context | block | message | fail) + render(): the one writer of hook stdout and exit codes
    <hook-name>.ts    one per registered hook (8)
  gen/                agent-commands, agent-registry
  init/               project adoption
  evals/              deterministic + live tiers
  checks/             one module per family + index.ts (explicit registry) + lib
  bench/              runtime budgets
  report/             usage report
  testing/            test-only fixture harness (temp roots, fixture repos, relocated registries, envelopes, transcripts, two drives); never bundled
dist/engineos.cjs     esbuild bundle, target node18, committed
package.json          devDependencies only: typescript, esbuild, @types/node
tsconfig.json         strict, ES2022 lib, CommonJS output for tests
```

`hooks/docs-ledger.sh` and `hooks/layout-manifest.sh` become data files
(`registries/docs-ledger.json`, `registries/layout-manifest.json`); the two test
assertions that source them read the JSON instead.

### Kernel shape (amended 2026-09-04, architecture review)

`src/kernel/` is one deep module. Its interface is a single function over
**declared facts**; the fourteen legacy arms are **projections** of its answer
(`CONTEXT.md` for both terms). This is the frozen contract Wave 1's parallel
PRs consume.

```ts
// src/kernel/index.ts -- the module's only exports
export function resolve(facts: DeclaredFacts, ctx: KernelContext): Answer
export type { DeclaredFacts, Answer, KernelContext, Registries }

export interface KernelContext { root: string; registries: Registries }
export interface Registries {            // lazy: each getter parses on first access, then caches
  readonly routing: Routing; readonly intents: Intents; readonly models: Models;
  readonly policy: Policy; readonly decisionRules: DecisionRules;
  readonly capabilities: Capabilities; readonly agents: Agents;
}

export interface DeclaredFacts {
  prompt?: string;                        // -> route (intent form), scale, decision_rules, hitl, task_contract
  path?: string;                          // -> route (path form)
  signals?: Record<string, RiskTier>;     // -> risk (classified from inputs)
  riskTier?: RiskTier;                    // -> risk.gates for an already-classified tier (the `gates` projection)
  workType?: string;                      // -> model
  autonomy?: Autonomy; evidence?: 'thin'; externalEffect?: boolean;
  conflict?: boolean; situation?: string; // -> hitl (with riskTier)
  inflight?: number; queued?: number;     // -> admit
  breaker?: { state: BreakerState; failures: number; cooldownElapsed?: number; probeResult?: string }; // -> breaker
  units?: Unit[];                         // -> waves
  repair?: { check: string; attempt: number; situation?: string };   // -> repair
}

export interface Answer {                // sparse: a section is present iff the facts it needs were declared
  route?: RouteSection; risk?: RiskSection; model?: ModelSection; scale?: ScaleSection;
  decision_rules?: DecisionRulesSection; hitl?: HitlSection; admit?: AdmitSection;
  breaker?: BreakerSection; waves?: WavesSection; repair?: RepairSection;
  task_contract?: TaskContract;          // the resolve-task composition; needs prompt
}
```

Rules of the shape:

- Sections are optional, never null-filled. Absence means "those facts were not
  declared", and a caller that needs a section declares its facts.
- Every legacy arm is one projection in `src/kernel/cli.ts`: parse its flags into
  `DeclaredFacts`, call `resolve`, emit its section (or the legacy composite, for
  `resolve-task` and `route-escalate`) with the legacy key order. Answers stay
  byte-compatible; the parity suite below is the proof.
- One new public arm, `engineos kernel resolve --facts '<json>'`, emits the whole
  sparse `Answer`. Adding it is MINOR under `docs/COMPATIBILITY.md`. No arm is
  removed by this migration; demoting `gates`, `route-intent`, `scale` and
  `decision-rules` (no caller outside `kernel.sh` or the router agent) is a later
  MAJOR with the deprecation window.
- Concept modules `src/kernel/{route,risk,model,scale,decisions,hitl,admit,breaker,waves,repair}.ts`
  are internal seams: not exported from `index.ts`, tested through `resolve`.
  Only pure helpers (glob match, tier max) carry their own unit tests.
- Vocabularies come from the typed policy loader and are never restated in code:
  `autonomy.levels`, `hitl.reasons` and their order, `breaker.states`,
  `risk.aggregation`. Today's literals at `kernel.sh:545`, `:523-531`, `:399` and
  `:232` are the debt this removes.
- Differential parity: `src/kernel/parity.test.ts` runs every arm's fixture args
  through a pinned copy of the bash kernel (`test/fixtures/legacy-kernel/`:
  `kernel.sh` plus a `registries/` snapshot) and through the projection, and
  asserts deep-equal JSON and the same exit code. It lives until 2.0 and is
  deleted with the shim.

Why this shape, by the deletion test: `gates` is a subset of `risk`'s own answer
(`kernel.sh:238` vs `:254`); `route-intent`, `scale` and `decision-rules` have no
caller outside the file; the router agent hand-composes 4+N processes over the
same registries `resolve-task` already composes (`agents/router.md:52-85`).
Fourteen modules with fourteen test files would port that shallowness one to one.
Rejected: two modules (`resolve` for task facts, `govern` for admit/breaker/waves/
repair) — the router calls both, and `hitl` and `repair` share the `never_retry`
vocabulary across the seam.

### CLI surface

One binary. Subcommands mirror today's files so every shim is a one-line mapping;
`kernel` adds one arm, `resolve`, on top of the fourteen it mirrors.

```
engineos kernel <resolve|route-path|route-intent|model|risk|gates|repair|admit|breaker|hitl|waves|decision-rules|scale|route-escalate|resolve-task> [args]
engineos hook <ensure-project-layout|prompt-advisor|route-before-change|announce-agent-dispatch|mark-unrecorded|announce-agent-return|stop-verify|record-verify>
engineos journal append <file> [flags] | validate <file>
engineos telemetry append <file> [flags] | validate <file>
engineos gen agent-commands | agent-registry
engineos init [--dir PATH] [--dry-run]
engineos settings-merge --settings <path> --plugin-root <path> [--dry-run]
engineos bypass on|off|status [cwd]
engineos validate [--only C1,C17] [--list]
engineos evals
engineos bench
engineos usage-report [days]
engineos --version
```

`post-edit-check.sh` is not registered today; it ports as `engineos hook post-edit-check`
so a team can re-wire it, keeping its `exit 2` blocking semantics. No CI suite
exercises it beyond `hooks/test-post-edit.sh`; that suite is its acceptance test.

`settings-merge` does what `install.sh` lines 287-333 do with three `jq`
programs: read `hooks/hooks.json`, remove prior EngineOS entries from the
consumer's `settings.json`, add the current ones, merge `permissions.allow`.
It writes atomically (tmp + rename) and the write-once
`settings.json.engineos.bak` stays the installer's job. A prior entry is
"EngineOS" when its command contains `<plugin-root>/hooks/` OR
`dist/engineos.cjs`; keying on the hooks dir alone would leave the node form
in place and duplicate every hook on the second install.

### Node-version guard

Two separate concerns, which today's `ensure_modern_node` (`hooks/lib-common.sh`
lines 84-100) blurs because bash has no version floor of its own.

**Our own floor (18).** `cli.ts` is written so its first statements parse on
node 16. It reads `process.versions.node`; below 18 it looks for a newer node in
this order: the highest `$NVM_DIR/versions/node/v*/bin/node` with major >= 18,
then `/opt/homebrew/bin/node`, `/usr/local/bin/node`. If one is found it
re-executes itself with `spawnSync(newer, [__filename, ...argv], { stdio:
'inherit', env: { ...env, ENGINEOS_REEXEC: '1' } })` and exits with that status
(the env flag stops a second re-exec). If none is found:

- the four hooks that already go silent without `jq` today (`route-before-change`,
  `mark-unrecorded`, `record-verify`, `prompt-advisor`) exit 0 with no output;
- the hooks that today keep running through a grep/sed fallback
  (`stop-verify`, `ensure-project-layout`, `post-edit-check`) and the two announce
  hooks print `{"systemMessage": "[engineos] <hook> skipped: node >= 18 required
  (found v16.x)"}` and exit 0, so the user sees the Validation gate did not run
  instead of a green silence. This is deviation 2 below. The guard builds that as
  a `message` hook decision and hands it to `hooks/output.ts` `render`, the same
  writer every hook uses, so `output.ts` imports nothing and runs on any node;
- every other subcommand prints `{"error": "node >= 18 required, found vX"}` and
  exits 1.

**The project runner's floor (20).** `ensure_modern_node`'s real job is not our
floor: it prepends the nvm-default `bin/` to `PATH` when PATH's node is below 20,
because ESLint 9 and vitest need node-20 APIs, and its only caller is
`stop-verify` right before it spawns the project's `npm`/`nx`. A self re-exec
does not do this: the child inherits `PATH` unchanged and `spawnSync('npm')`
still resolves the old node. So `hooks/runner.ts` ports the PATH mutation as is,
threshold 20, applied to the `env` handed to the runner spawn in `stop-verify`
and `post-edit-check`. The re-exec above is the lesser half and only serves us.

### Process model

No internal subprocesses except `git` and the project's own runners
(`npm`/`pnpm`/`yarn`/`nx`) in `stop-verify` and `post-edit-check`. Telemetry,
spans and journal lines are written in-process through `journal/` and
`hooks/telemetry.ts`. Timeouts on runners use `spawnSync`'s `timeout` option.

### Journal schema (amended 2026-09-04, architecture review)

The span schema is spelled seven times in `scripts/exec-journal.sh` (usage
comment, `usage()`, `EJ_SCHEMA_FIELDS`, flag ladder, guard block, jq emit, jq
validate), its enums twice more inside the file and once in `policy.json`, and
a check family sed-parses the copies back into agreement. The port declares it
once.

```ts
// src/journal/schema.ts — the only file in src/ that names a journal field
export type Guard = 'slug' | 'enum' | 'int' | 'bool' | 'free'
export type JsonType = 'string' | 'number' | 'boolean'
export type Presence = 'required' | 'optional' | 'always'   // always = emitted as null when unset (agent, note: v1 shape)
export interface FieldSpec {
  name: FieldName; flag: string; guard: Guard; json: JsonType; presence: Presence
  values?: (regs: Registries) => readonly string[]           // enum members, read from a registry, never a literal here
}
export const EXEC_JOURNAL_FIELDS: readonly FieldSpec[]          // 22 rows; row order is emit order, so a v1 line is byte-identical
export type FieldName = 'timestamp' | 'run_id' | … | 'risk'
export type SpanFields = Partial<Record<FieldName, string | number | boolean>>
export const SLUG_RE = /^[A-Za-z0-9@_./:-]+$/
```

- Enum members come from registry loaders: `span_kind` and `status` from
  `policy.json` `telemetry.exec_journal`, `model_tier` from `models.json`, `risk`
  from the policy vocabulary the kernel uses (see "Kernel shape"). `schema.ts`
  carries no vocabulary literal; C27's "constants match the registry" assertion
  has nothing left to compare and is retired.
- `exec-journal.ts` derives from the table: the flag parser accepts exactly the
  rows' flags, the guard runs each row's class, the emitter writes rows in order
  with the row's JSON type, `validate` checks the same rows with the same
  classes, and `usage()` renders `--<flag> <TYPE>` per row. The header comment
  points at `schema.ts` instead of listing flags.
- `hooks/telemetry.ts` `span(dir, sid, kind, fields: SpanFields)` is typed from
  the table; an unknown field is a compile error. Its sanitizer walks the rows:
  `slug` → `hookSlug`, `enum` → member or drop, `int` → non-negative integer or
  drop, then the same append guards run in-process. The two boundaries keep
  their documented difference: the CLI rejects, the hooks sanitize first.
- Tests: `schema.test.ts` asserts the table (22 rows, order, one `free` row
  named `note`, `always` only on `agent` and `note`); `exec-journal.test.ts`
  drives append and validate per class through the table, not per field.
- Deletion test: remove `schema.ts` and the field list reappears in the parser,
  the guards, the emitter, the validator, the usage text, the hook writer and
  the checks. Rejected: seven TS copies with `satisfies` on one (the drift the
  checks exist to catch, moved to a new language); enum literals in `schema.ts`
  pinned to `policy.json` by a `journal schema` JSON arm (a new public arm to
  keep a copy honest); keeping C27e as a behavioural check (overlaps C27b).

### Shims and compatibility

Every bash entry point becomes a shim:

```bash
#!/usr/bin/env bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/dist/engineos.cjs" kernel "$@"
```

- `scripts/kernel.sh` is public surface. Its shim stays until the next MAJOR.
  Subcommand names and answer shapes are byte-compatible; `scripts/test-kernel.sh`
  (273 assertions against the shipped registries) is the acceptance test. The
  shim exports `ENGINEOS_ROOT` so a relocated copy answers from its own
  `registries/` (the suite's `relocated_kernel` fixture depends on that).
- `scripts/init-project.sh` is versioned surface (`docs/COMPATIBILITY.md` 1.6.0).
  It becomes a shim over `engineos init`, MINOR, same exit codes 0/1/2/3/64.
- `hooks/scaffold-layout.sh` is versioned surface too, and it is a **sourced
  library** exporting a shell function. A sourced function cannot be shimmed to
  `exec node`. The file therefore stays bash, frozen, through 1.x, and is removed
  in 2.0 with the other shims. `src/hooks/scaffold.ts` is the runtime's
  implementation; `hooks/test-layout.sh` runs its symlink cases against the hook
  (node) and `scripts/init-project.sh` (node), and a unit test asserts both
  implementations create the same directory list from the same manifest.
- The four hook libraries `install.sh` names in `ENGINEOS_HOOK_LIBRARIES`
  (`lib-common.sh`, `lib-runner.sh`, `layout-manifest.sh`, `scaffold-layout.sh`)
  stay on disk until wave 6, when the last bash consumer (`test-docs.sh`,
  `test-layout.sh`) is ported; that PR updates the list and check C30 together.
  `scaffold-layout.sh` stays past that per the previous bullet.
- `hooks/hooks.json` changes each command to
  `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>`. This is MINOR: the
  `.sh` shims keep working for consumers who copied the old entries into their
  `settings.json`. Removing the shims is MAJOR (2.0) and gets the deprecation
  window in `docs/COMPATIBILITY.md`.
- `install.sh` and `install.ps1` check `node >= 18` instead of `jq`, call
  `engineos settings-merge` for the JSON work (accepting both command forms when
  deriving the hook list, scrubbing by hooks dir OR `dist/engineos.cjs`), and on
  Windows stop resolving `bash.exe` for hooks. Whether a bare `node ...`
  `type: command` hook runs on Windows without a shell is asserted, not proven,
  from this repo: a real Windows run is a wave 3 exit criterion.
- Error conventions are preserved per CLI, not unified: kernel and telemetry
  print `{"error": ...}` on stdout and exit 1; exec-journal prints text on stderr.

### Invariants that port byte for byte

- Slug class `^[A-Za-z0-9@_./:-]+$` for every journal field but `note`; path slug
  drops `.` and `/`. Over-length values are rejected, never truncated
  (`policy.json` `telemetry.exec_journal.max_value_length`).
- The exec-journal schema is declared once as data (`journal/schema.ts`) and
  drives `append`, `validate`, `usage` and the hook span writer; no other file in
  `src/` names a journal field. Check C27e's set-equality holds by construction
  and is retired with its parsers (deviation 4).
- Kernel registry access is lazy: one injected `Registries` object whose getters
  parse on first access and cache for the process; no eager parse of all seven
  registries on every call. A projection that needs one registry pays for one.
- The fourteen legacy arms are projections of `resolve`'s answer ("Kernel shape");
  their names, flags, JSON key order and exit codes are unchanged.
- `risk` is max over inputs, never averaged; an empty payload is an error.
- `hitl` derives from a classified tier only, never from a risk floor.
- Intent suppression in `route-escalate` is a single non-transitive pass.
- Scaffold: `lstat` every path component, `mkdir` one level at a time, never
  `mkdir -p`; refuse symlinked or non-directory components; test both existence
  and link-ness before seeding; every refusal is a silent skip returning success.
- Stop hooks: bypass check, then `stop_hook_active` loop guard, then work.
- `stop-verify` and `ensure-project-layout` tolerate malformed or partial stdin:
  they decode what they can and continue, they do not exit on decode failure.
- Prompt-advisor guidance strings are literal content, copied verbatim.
- File-extension allowlists stay in sync between `mark-unrecorded` and
  `route-before-change` (`ts tsx js jsx py go rs sql`) and between `stop-verify`
  and `post-edit-check` (`ts tsx js jsx`), as one shared constant each.
- Marker files and their names are unchanged: `ENGINEOS_BYPASS`,
  `ENGINEOS_UNRECORDED.<sid>[.deferred]`, `engineos-telemetry/`, `engineos-route-cache/`.

### Deliberate deviations

1. Check discovery moves from `declare -F` over sourced files to an explicit
   registry in `src/checks/index.ts`. A duplicate check id becomes a compile-time
   error instead of "last sourced wins" (the C31 renumbering history). The
   `--only` semantics, id ordering and exit codes (0/1/2) are unchanged.
2. Under an unusable node (below 18, no newer one found), the hooks that today
   survive a missing `jq` through grep/sed fallbacks cannot run at all. They emit
   a visible `systemMessage` instead of running degraded. The Validation gate
   is skipped loudly, never silently.
3. Six checks read bash source text rather than behaviour (C18f, C20d, C22c,
   C27c, C29, C30). Each is re-pointed at the TypeScript module in the same PR
   that shims the file it grepped, before wave 5 ports the check family. The
   assertion is the same; the file it reads changes.
4. Check C27e and the ten `ej_*` sed parsers in `scripts/checks/70-runtime.sh`
   (`ej_constant` … `ej_emitted_fields`) are deleted in the PR that ports
   `exec-journal`. They exist to prove seven bash restatements of the span
   schema agree; with one table there is nothing to compare. C27 shrinks to
   `policy.json` well-formedness and writer existence; C27b (behavioural
   round-trip), C27c, C27d and C27f stay. Check ids are not versioned surface
   in `docs/COMPATIBILITY.md`; the removal is recorded in the change record.

## Testing

- The 15 black-box bash suites (16 total; `hooks/test-lib-common.sh` is the one
  white-box suite) remain in CI unchanged until wave 6. Each PR that swaps a shim
  keeps its suite green; that is the PR's acceptance criterion.
- New unit tests are `node:test` files under `src/**/*.test.ts`, compiled by
  `tsc` to `build/` and run with `node --test build/`. Kernel concept modules are
  the exception to "one test file per module": they are tested through
  `resolve` (`src/kernel/resolve.test.ts`) and the projections through
  `src/kernel/cli.test.ts`; the interface is the test surface.
- `src/kernel/parity.test.ts` is differential: for every arm, fixture args run
  through the pinned bash kernel under `test/fixtures/legacy-kernel/` and through
  the projection; JSON deep-equal and exit code equal. It needs `bash` and `jq`
  in CI until 2.0, when it is deleted with the shim.
- `hooks/test-lib-common.sh` (white-box) is replaced by unit tests for
  `hooks/envelope.ts`, `hooks/bypass.ts`, `hooks/output.ts` and
  `hooks/telemetry.ts` in the PR that ports the hook library.
- Hook tests assert on the `HookDecision` a hook returns, never on stdout text;
  `hooks/output.test.ts` is the one place the harness JSON and exit code per
  kind are asserted ("Hook decision" above).
- Wave 6 ports each bash suite to a `node:test` file in the same black-box style
  (spawn the CLI, feed stdin, assert stdout and state files), deletes the `.sh`
  suite, and removes `shellcheck` and `jq` from CI when the last one lands.
- CI gains a `dist/` drift guard: `npm ci && npm run build && git diff --quiet dist/`,
  the same pattern as the agent-commands and agent-registry guards.
- `bench` keeps the published budgets: route-intent 250 ms, resolve-task 500 ms,
  prompt-advisor 600 ms, route-before-change cache hit 150 ms, always-on context
  32,000 bytes. `ENGINEOS_PERF_MULTIPLIER` keeps its meaning.
- One fixture harness, `src/testing/harness.ts` (plan Task 6b, Wave 1(a)), owns
  the idiom every suite repeats: a per-test temp root bound to `t.after`, a
  git-initialised fixture repo, a relocated registry copy that is mutated instead
  of the checkout, the hook envelope, the transcript in both the real (`input`)
  and legacy (`tool_input`) shapes, and two drives with one result type —
  `runCli` (spawn the bundle) and `runInProcess` (a `Command` over `memoryIo`).
  It throws on any path under the checkout. Seven exports; it is the test surface
  for every kernel and hook module and is never bundled.

## Waves

Each PR stays under 400 changed lines; `dist/engineos.cjs` is called out in the PR
description and excluded from the count as generated output (`rules/git.md`).

| Wave | Units | Parallelism | Acceptance |
|---|---|---|---|
| 0 | `package.json`, `tsconfig.json`, esbuild script, `src/cli.ts` with node guard, `dist/` + drift guard, `--version` | one PR | CI green; `node dist/engineos.cjs --version` |
| 1 | kernel: (a) `Registries` loaders, `resolve` skeleton, route section (path + intent forms), projections `route-path`/`route-intent`, parity harness; (b) risk (with gates), model, repair sections + projections; (c) admit, breaker, hitl, waves sections + projections; (d) scale, decision_rules, route-escalate composite, task_contract + `resolve` arm + swap `kernel.sh` shim; (e) `agents/router.md` steps 2-4, 6b, 7 become one `resolve` call | (a) first; (b), (c) parallel; (d) then (e) | `test-kernel.sh`; `parity.test.ts`; checks C17*, C18*, C20b, C24b, C25b, C26*; `bench` |
| 2 | `journal` and `telemetry` CLIs + shims | parallel with wave 1 | `test-exec-journal.sh`, `test-telemetry.sh`; C22b, C27* |
| 3 | hook library in 2 PRs (envelope/bypass/telemetry; scaffold/runner/cache); then 8 hooks, one PR each, each re-pointing the source-text check that grepped it (deviation 3); then `init` (it needs `scaffold.ts`); then `hooks.json` + `settings-merge` + installers | library serial; hooks in two batches of four | the 10 black-box hook suites + `test-install-hooks.sh`; `validate-engineos.sh` green at the barrier; one Windows run of the node hook form |
| 4 | `gen agent-commands`, `gen agent-registry`, `evals`, `bench`, `usage-report`, `bypass` CLI | one PR each, all parallel after wave 0 | drift guards, `test-gen-agent-registry.sh`, `run-evals` step |
| 5 | `validate` harness with explicit registry; then the 7 check families (`70-runtime` in two PRs) | harness first; families parallel | `test-validate-engineos.sh` (152 cases) |
| 6 | port 16 suites to `node:test`; delete `.sh` tests; CI drops `shellcheck` and `jq`; installers require node only; `COMPATIBILITY.md`, release notes 1.7.0, README | one PR per suite | CI green with node and git only |

Barrier at the end of each wave: integrate, run `validate-engineos.sh`, `bench`
and the wave's suites, write a handoff (`templates/handoff.md`). Waves 1, 2 and 4
may run concurrently; 3 needs 1 and 2 (hooks call kernel and write journals); 5
needs 1 and 2 (checks run the kernel and CLIs as canaries); 6 needs everything.

## Rollback and release

- Every PR reverts with `git revert`; a reverted shim is bash again and no
  consumer notices.
- Release 1.7.0 (MINOR) ships the `node` hook form alongside the `.sh` shims and
  names 2.0 as the shim removal. Release notes list the new `node >= 18`
  requirement and the dropped `jq` and Git Bash requirements.
- The Release gate (`rules/gates.md`) is human: owner approves 1.7.0 after wave 6
  with the validation evidence attached.

## Decision-rule requirements (`registries/decision-rules.json`, rule-large-change)

| Requirement | Met by |
|---|---|
| design-doc | this file |
| adr | `docs/adr/2026-09-04-typescript-runtime-over-bash.md` |
| architecture-review | `critic` (vera) read-only pass over this spec and the ADR, findings folded in before the plan is finalized |

## Review findings (critic, 2026-09-04)

Ten findings, verdict REFUTED on the first draft; every item folded in above.
Blockers: source-text checks would go red at the wave 3 barrier with no owner
(deviation 3, wave 3 row); the guard silenced the Stop gate (deviation 2);
`ensure_modern_node` was mis-ported as a re-exec (guard section, runner floor).
Major: installer scrub duplicated hooks on reinstall (`settings-merge`); `jq`
survived in the installers (`settings-merge`); `init` depended on wave 3 (moved);
`init-project.sh` and `scaffold-layout.sh` were missing from the compatibility
list (shims section); the Windows claim was over-scoped (goal 3). Minor: five
counts and one file in the Mermaid ADR's maintained list.

## Open risks

- Node startup (about 40 ms) is paid on every hook fire. Budgets have headroom;
  wave 0 measures it and records the number in the change record.
- Consumers who hand-edited `settings.json` with absolute `.sh` paths keep working
  through shims, but get no upgrade until they re-run the installer. Release notes
  say so.
- A repo whose hook PATH has no node at all (rare: Claude Code itself needs node
  or ships one) cannot even print the `systemMessage` above: `hooks.json` calls
  `node` and the shell fails to find it. Claude Code surfaces a hook spawn error
  in that case, which is louder than today's `jq` silence. The installer's node
  check is the mitigation.
