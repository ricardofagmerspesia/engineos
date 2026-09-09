# Compatibility and Deprecation Policy

EngineOS ships as a plugin that other repositories consume. Their `CLAUDE.md`
files reference rule paths, agent names, aliases and slash commands from this
repo. Renaming any of those silently breaks every consumer.

This file is the contract. Version lives in `.claude-plugin/plugin.json`.

## What is public surface

Changing any of these is a **breaking change**:

| Surface | Why consumers depend on it |
|---|---|
| `rules/*.md` paths | Referenced by path in project `CLAUDE.md` and in router rows |
| Agent `name:` values | Used in Task dispatch and `/engineos:*` commands |
| Agent aliases | Typed directly as slash commands |
| Slash command names under `commands/` | Typed directly |
| Skill directory names | Invoked by name via the Skill tool |
| Hook event contract in `hooks/hooks.json` | Consumers wire these into their settings |
| `registries/*.json` top-level shape | Read by hooks and by tooling |
| `scripts/kernel.sh` subcommand names and their JSON answer shape | Called by hooks, by the router agent, and by consumers' own tooling |
| Runtime entry point `dist/engineos.cjs` subcommand names (`kernel`, `journal`, `telemetry`, `hook`, `init`, `bypass`, `gen`, `evals`, `bench`, `usage-report`, `validate`, `settings-merge`) and their stdout/exit contracts | Registered in `hooks/hooks.json`, called by the installers, CI and every `.sh` shim; the shims' deprecation window assumes these names hold |
| The `## Return format` envelope fields | Parsed by orchestrators |

The kernel subcommands covered by that row are `resolve`, `route-path`, `route-intent`,
`model`, `risk`, `gates`, `repair`, `admit`, `breaker`, `hitl`, `waves`,
`decision-rules`, `scale`, `route-escalate`, `resolve-task` and `skill-state`. Adding a subcommand or a field to an answer
is MINOR; removing or renaming either is MAJOR and gets the deprecation window
below.

`resolve` is the one arm the TypeScript runtime migration adds, and adding it is
MINOR: `engineos kernel resolve --facts '<json>'` takes the declared facts the
other fourteen arms each parse out of their own flags, and answers the sparse
object those arms are projections of — a section is present exactly when the
facts it needs were declared. Nothing is removed or renamed by it: every
fourteen-arm answer stays byte-identical, which is what the differential parity
suite asserts. It is versioned surface from the day it lands, so renaming it
later is a deprecation with a window, not an edit. The fact key vocabulary
(`path`, `prompt`, `escalate`, `taskContract`, `workType`, `signals`,
`riskTier`, `scale`, `decisions`, `repair`, `admit`, `breaker`, `hitl`,
`waves`) is part of that surface; an unknown key is refused rather than
ignored, so adding one is MINOR and removing one is MAJOR. Two arms that had no caller anywhere — `retry` and `capability` — were
removed *before* this row was written, deliberately: they were the last
removals this policy did not yet cover. The kernel's internals are not surface:
`reg`, the jq programs, and how many processes an answer costs are free to change
as long as the answer does not.

Not public surface — change freely: rule *prose* (as long as the file keeps its
path and meaning), agent method sections, hook internals, test files, `docs/`.

## Semantic versioning

- **MAJOR** — a public surface above is removed or renamed; a rule's meaning
  reverses; a hook changes from advisory to blocking.
- **MINOR** — a rule, agent, skill, command, registry entry or router row is
  added; an existing rule is tightened in a way that flags more, not less.
- **PATCH** — wording, typos, test coverage, internal refactors, bug fixes in
  hooks that restore intended behaviour.

Tightening a rule is MINOR, not PATCH: a consumer's CI can start failing on it.
Say so in the release notes.

## Deprecation window

Nothing in the public surface is removed in the release that deprecates it.

1. **Deprecate** (release N, MINOR) — the replacement ships alongside. The old
   path or name keeps working. `docs/release-notes/` names the replacement and
   the removal version.
2. **Warn** (releases N+1 onward) — using the deprecated surface emits a warning.
   For a renamed rule, leave a stub file whose content points at the replacement.
   For a renamed agent or alias, leave the old command in place forwarding to the
   new one.
3. **Remove** (the next MAJOR, and not before) — earliest removal is one minor
   release after deprecation.

A rename is a deprecation, not an edit. `git mv rules/foo.md rules/bar.md` in one
commit is a breaking change dressed as housekeeping.

## Ownership

Every rule file, agent and skill has an owner responsible for reviewing changes
to it and for deciding its deprecations. Where there is no explicit owner, the
repo maintainers own it collectively — which in practice means any change needs a
review from someone who did not write it.

Changes to the always-on set (`rules/base.md`, `security.md`, `git.md`,
`context.md`) load into every session in every
consuming project. They get the highest review bar and are never batched with
unrelated work.

## Consumer guidance

- Pin the plugin version. Do not track a moving branch.
- Read `docs/release-notes/` before upgrading a MINOR — tightened rules can fail
  a build that passed yesterday.
- Project `CLAUDE.md` holds **deltas only** (`rules/memory.md`). A project that
  copies EngineOS rules instead of referencing them has opted out of this policy
  and will not get the fixes.

## Checklist for a breaking change

- [ ] The replacement exists and is documented.
- [ ] The deprecated surface still works, with a warning.
- [ ] `docs/release-notes/` names the removal version.
- [ ] `scripts/validate-engineos.sh` passes with both old and new surfaces present.
- [ ] MAJOR version bumped in `.claude-plugin/plugin.json`.
- [ ] Consumers who need to act are told what to change, not just what broke.

## What `enabled: false` does and does not do

`enabled: false` in the frontmatter of `skills/<id>/SKILL.md` is the switch the
console shows. Until 2026-09-07 **nothing outside the console read that field**:
disabling a skill changed a file and nothing else, and the interface presented as a
control something that controlled nothing. This section is the contract of what it
came to be worth — and of what it still is not worth, which is the part that cannot
be omitted.

**What becomes true.** The kernel stops recommending the skill, in the three places
where it answers about skills:

| Answer | Behavior with the skill disabled |
|---|---|
| `kernel.sh route-path <file>` | Leaves `skills`; enters `skills_suppressed` with `reason: "disabled"` |
| `kernel.sh route-intent <text>` | Same, per matched intent |
| `kernel.sh resolve-task --prompt` | Same, in `task_contract` |
| `kernel.sh skill-state [--id <s>]` | Answers the resolution directly, so console, check and hook read the same thing |

The suppression is **visible**, never silent. A short list and a filtered list are
indistinguishable to the operator if the reason does not come with them, and a
control whose effect cannot be observed becomes decorative again by another route.

**What is still not true, and cannot be announced.** EngineOS does **not** prevent
anyone from invoking a disabled skill by name: the Skill tool reads the directory
and there is no hook between the two things. What exists is recommendation and
routing; effective removal requires taking the directory out of the installation.
This is what the adapter matrix calls degrading to convention, said in the right
place: **whoever wants real blocking needs to uninstall the skill, not disable it.**

**Absence of the field means enabled.** It is the console's contract
(`console/src/lib/entities/skills.ts`) and the only reading that keeps every skill
written before the field existed working. Only the **first** frontmatter is read,
and only when the file starts with it: an `enabled:` line in the body is
documentation, not configuration, and never turns a skill off.

**Where this is tested.** `src/kernel/kernel-skill-state.e2e.test.ts` plants a
disabled skill in a fixture tree and asserts that routing drops it, that it says
why, that absence of the field means enabled and that a mention in the body turns
nothing off; `src/kernel/skill-state.test.ts` covers the spellings the frontmatter
reader accepts, and `src/kernel/parity.test.ts` compares the arm against the pinned
bash kernel. The checks `C34` (every answer that emits `skills` emits
`skills_suppressed`) and `C35` (no routing domain is left without an enabled skill)
guard the boundary.

Adding `skills_suppressed` to the answers and `skill-state` to the subcommand list
is **MINOR** — new field and new subcommand, nothing removed or renamed.

## Supported platforms and prerequisites

Local distribution is production use too: it demands declared support, safe update
and recovery. This is the matrix the release covers. A platform that is not here is
not supported — it is not "probably works".

| Platform | State | How it is verified |
|---|---|---|
| Linux (x86-64) | **Supported** | `verify` job + `package` job on `ubuntu-latest`: builds the artifact, extracts it and runs `validate-engineos.sh`, `npm ci`, typecheck and tests over the final bytes |
| Windows + Git Bash | **Supported** | `package` job on `windows-latest`, same sequence, plus the guard that the checkout does not diverge from HEAD |
| macOS | **Not supported** | Never run in CI nor manually. Do not declare support before the matrix covers it |
| PowerShell (`install.ps1`) | **Partial** | Syntax and presence verified in the artifact; the installer's execution does not run in CI |

### Prerequisites

| Requirement | Version | Where it is declared | What happens without it |
|---|---|---|---|
| Node.js | `>= 18` | `package.json.engines`, `src/node-guard.ts` (`MIN_NODE_MAJOR`) | The guard refuses or skips the hook with an explicit message — it does not fail silently |
| `bash` | POSIX bash | `.gitattributes` forces LF on `*.sh` so line continuations do not break | Hooks and kernel do not run |
| `jq` | any | `install.sh` (§5) | **Hooks are not registered.** The installer warns and continues; every hook that parses input with `jq` goes silent. An installation without `jq` has rules, not gates |

### End of line and execute mode

`.gitattributes` declares LF for all text, with `*.ps1` in CRLF as the only exception
(Windows host, outside any POSIX parser). This is not a style preference: without
that policy, a Windows checkout rewrites ~509 files and the repository diff stops
being readable — that was the state measured on 2026-09-07, with 512 files changed
and no semantic change.

Three enforcement points hold the promise up, and changing one without the others is
a regression:

| Promise | Where it is enforced | Where it is tested |
|---|---|---|
| All text in LF | `.gitattributes` | Check `C33`; the `package` job fails if the checkout diverges from HEAD |
| An executable script has the bit; a `source` library does not | modes in the git index | Hook mode check; `scripts/package-release.sh` verification over the final bytes |
| Adapter mirrors do not diverge | `.agents/`, `.trae/`, `.windsurf/` | Check `C32` |

The execute bit does **not** survive a Windows checkout with `core.fileMode=false`:
the authoritative value is the one in the git index, not the one in the filesystem. A
local `chmod +x` that does not become `git update-index --chmod=+x` never reaches the
package — and the packager refuses the release when that happens.

### Adapters for other tools

The per-tool enforcement matrix — what is blocking, what runs in CI and what degrades
to convention — lives in [`templates/adapters/README.md`](../templates/adapters/README.md)
and is the source for this excerpt. A rule nothing verifies is a convention; calling
it a gate in a tool that cannot enforce it is how a team stops trusting the whole
system.

The `.agents/`, `.trae/` and `.windsurf/` mirrors stay **out** of the package by
default; they go in with `scripts/package-release.sh --with-ide-mirrors`.

## 1.6.0 additions

`1.6.0` is a MINOR release. Everything below is added or tightened: **nothing in
the public surface is removed, nothing is renamed, and no deprecation window is
opened**, so the breaking-change checklist above does not apply to it. The
per-release account lives in `docs/release-notes/1.6.0.md`.

| Surface | 1.6.0 change | Kind |
|---|---|---|
| `scripts/kernel.sh` subcommands | `admit`, `breaker`, `hitl` | added |
| `registries/policy.json` | new keys `parallelism.backpressure`, `breaker`, `hitl`, `telemetry.exec_journal` | added |
| `registries/policy.json` | `telemetry.events[].written_by` string -> array | shape change, see below |
| `registries/policy.json` | new telemetry event `hitl` | added |
| `scripts/exec-journal.sh` | twelve optional v2 span fields on `append`, validated by `validate` | added |
| `scripts/exec-journal.sh` | `validate` rejects a non-slug `run_id`, `capability_id` or `agent` | tightened |
| `commands/init.md` | new slash command `/engineos:init` | added |
| `scripts/init-project.sh` | project-scoped adoption bootstrap | added |
| `hooks/scaffold-layout.sh` | shared scaffold function, sourced by `hooks/ensure-project-layout.sh` and `scripts/init-project.sh`. It is NOT registered in `hooks/hooks.json`, so the hook event contract is unchanged | added |
| `rules/parallelism.md` | `## Backpressure`, `## Circuit breaker` | added |
| `rules/risk-autonomy.md` | `## Human-in-the-loop` | added |
| `rules/observability.md` | `## Agent traces` | added |
| `rules/llm-apps.md` | `## RAG` rewritten to name required metrics and artifacts | tightened |
| `.engineos/changes/_template.md` | `## Human decisions` section, declared in `registries/intents.json` `record-change.required_sections` | added |

The three kernel subcommands, the `/engineos:init` command,
`scripts/init-project.sh` and `hooks/scaffold-layout.sh` are versioned surface
from the day they land. Renaming any of them later is a deprecation with a
window, not an edit.

### The one shape change consumers can break on

`telemetry.events[].written_by` was a string and is now an array of strings, on
all four events (`route`, `decision-rules`, `verify`, `hitl`).

This is not a breaking change under the surface table above, which names the
`registries/*.json` **top-level shape** — `written_by` is nested two levels
inside `telemetry`. It is still the only value in 1.6.0 whose type changed, so a
reader outside this repo that assumed a string gets an array and no warning.
What to change:

```bash
# 1.5.0 printed one path; 1.6.0 prints a JSON array
jq -r '.telemetry.events[] | select(.id == "route") | .written_by' registries/policy.json

# 1.6.0 equivalent of the old output
jq -r '.telemetry.events[] | select(.id == "route") | .written_by[]' registries/policy.json
```

A comparison of the form `.written_by == "hooks/prompt-advisor.sh"` becomes
`.written_by | index("hooks/prompt-advisor.sh")`. In-repo the only readers are
the C22 integrity checks, which were updated in the same release.

`telemetry.exec_journal.written_by` is a new key and is an array from the
outset — there is no migration for it.

### Why the `exec-journal.sh validate` tightening is MINOR, not PATCH

In 1.5.0, `scripts/exec-journal.sh validate` accepted any string in `run_id`,
`capability_id`, `agent` and `timestamp`, and checked `status` and `model_tier`
for type only. In 1.6.0 the four slug fields must match the slug class
`^[A-Za-z0-9@_./:-]+$` and the two enumerated fields must be members of their
declared vocabularies, so a line that validated yesterday can fail today. Per
**Semantic versioning** above, a rule tightened to flag more is MINOR and must
be named in the release notes; it is named there.

One narrow break deserves its own sentence, because it is the only case where a
*well-formed* value is now rejected: `+` is not in the slug class, so a
`timestamp` carrying a numeric UTC offset — `2026-09-03T12:00:00+00:00` — fails
validation where `2026-09-03T12:00:00Z` passes. Nothing in this repo writes the
offset form (`exec-journal.sh` defaults to `date -u +%Y-%m-%dT%H:%M:%SZ`), so
no EngineOS-written journal is affected; a third-party writer using offsets is.
Widening the class for `+` is a compatibility event of its own and was not
taken here.

`note` is deliberately still free text and is the only field that admits it —
which is not the same as being the only field a consumer must distrust. Every
other field is shape-bounded, not classified: harness-supplied characters still
reach disk dash-joined, and the class admits `.` and `/`, so a journal field is
never safe as a filesystem path component without `src/lib/slug.ts`'s
`hookPathSlug`.
Adding a second free-text field to the journal is a compatibility event, not a
convenience. The guard bounds the shape and the size of what reaches disk; it
does not classify content, and the hook boundary (`src/lib/slug.ts`'s `hookSlug`,
applied by `src/hooks/telemetry.ts`) sanitizes rather than rejects, so a harness-supplied value's characters still
transit dash-joined.

### `scripts/kernel.sh` becomes a shim, and `routing.json` drops two derived fields

Two more MINOR entries in the same release train, both from the TypeScript
runtime migration.

| Surface | Change | Kind |
|---|---|---|
| `scripts/kernel.sh` | now a shim that `exec`s `node dist/engineos.cjs kernel "$@"` with `ENGINEOS_ROOT` set to its own root | implementation, surface unchanged |
| `registries/routing.json` domain rows | `hook_guidance` and `risk_floor` removed; readers use `agent`, `skills[]`, `rules[]` and the optional `hint` | nested-field removal, see below |

The kernel's surface is unchanged by the shim: the same fifteen subcommands
answer the same JSON, in the same key order, with the same exit codes — which
is what `src/kernel/parity.test.ts` asserts against a pinned copy of the bash
kernel. What changed is the runtime requirement. The kernel needed `bash` and
`jq`; it now needs `bash` and **node >= 18**, and no longer calls `jq` itself.
A consumer whose environment has `jq` but no node must install node before
upgrading; hooks and checks that call `jq` on the kernel's *output* are
unaffected. The bundle is committed at `dist/engineos.cjs`, and a relocated copy
of `kernel.sh` answers from its own `registries/` exactly as before, because the
shim exports `ENGINEOS_ROOT`.

The `routing.json` removal is MINOR for the same reason the `written_by` shape
change was: the surface table names the `registries/*.json` **top-level shape**,
and both fields are nested inside `domains[]`. Neither was ever the only form of
its fact — `hook_guidance` is rendered from a row's `rules`, `skills`, `agent`
and `hint`, and a domain's risk floor is the floor of the intent that claims it
in `registries/intents.json` — so the registry now stores each fact once and the
kernel derives the rest. **The `route-path` answer is unchanged**: it still
carries `hook_guidance` and `risk_floor`, now computed rather than copied, so
`hooks/route-before-change.sh` and any consumer reading the kernel's output
needs no change. Only a consumer parsing `registries/routing.json` directly for
those two keys must switch to the structured fields. `risk_floor` on
`registries/intents.json` intent rows is a different field and is untouched.

### `scripts/exec-journal.sh` becomes a shim

One more MINOR entry in the same release train, from the same TypeScript runtime
migration.

| Surface | Change | Kind |
|---|---|---|
| `scripts/exec-journal.sh` | now a shim that `exec`s `node dist/engineos.cjs journal "$@"` with `ENGINEOS_ROOT` set to its own root | implementation, surface unchanged |
| `dist/engineos.cjs` | new `journal` subcommand, with `append` and `validate` under it | added |

The journal's surface is unchanged by the shim: the same two subcommands take
the same flags, write the same JSONL **line bytes** — same key order, same
number rendering, same string escaping, `\u007f` included — and exit with the
same codes. That is what `src/journal/parity.test.ts` asserts, byte for byte,
against a pinned copy of the bash CLI kept at
`test/fixtures/legacy-journal/exec-journal.sh`.

What changed is the runtime requirement, in exactly the shape
`scripts/kernel.sh` changed it: the CLI needed `bash` and `jq`, and now needs
`bash` and **node >= 18**, and no longer calls `jq` itself. A consumer whose
environment has `jq` but no node must install node before upgrading; tooling
that runs `jq` over a journal *file* is unaffected, because the file is
unchanged. A relocated copy of `exec-journal.sh` answers from its own
`registries/` exactly as before, because the shim exports `ENGINEOS_ROOT` — the
bash CLI derived that root from its own path, which is why the parity fixture is
staged rather than run in place.

`registries/policy.json` `telemetry.exec_journal.schema` still names
`scripts/exec-journal.sh`, and C27a still requires that file to be executable.
The shim is the entry point a consumer calls; the schema declaration points at
the entry point, not at the implementation behind it.

Two things that were *inside* the bash file are not public surface and moved:
the `VALID_STATUSES` / `VALID_SPAN_KINDS` constants are gone entirely — the port
resolves both vocabularies from `registries/policy.json` rather than restating
them, so the values are unchanged and there is no longer a second copy to drift
— and `MAX_VALUE_LEN_FALLBACK` became `MAX_VALUE_LENGTH_FALLBACK` in
`src/registry/policy-exec-journal.ts`, same value, same purpose (the bound the
CLI enforces when `policy.json` cannot be read). A consumer grepping the bash
file for either is reading an implementation detail that the shim removed, which
is the same trade `scripts/kernel.sh` made one section up.

The usage text is the one *observable* difference, and it is not versioned
surface: it is now rendered from the field table (`--<flag> <TYPE>`) instead of
being restated as a literal, so its wording differs while every flag it names,
and the exit code of every path that prints it, do not.

**MINOR: `scripts/telemetry.sh` is a shim.** The file is now a two-line wrapper
over `node dist/engineos.cjs telemetry "$@"` (implementation
`src/journal/telemetry.ts`). Unchanged public surface: the `append` / `validate`
subcommands, the `--session` / `--event` / `--data` / `--ts` flags, the four-field
line shape (`ts`, `session_id`, `event`, `data`) byte for byte, the
`{"error": ...}`-on-stdout-with-exit-1 convention, the `usage`-on-stderr
convention, and `validate`'s `<file>: N line(s), all valid` /
`line N: does not match the telemetry schema` / `N invalid line(s) in <file>`
texts. Changed: the runtime dependency is node >= 18 instead of jq, and
`ENGINEOS_ROOT` now relocates the registry lookup. `usage` names
`scripts/telemetry.sh` rather than interpolating `$0`.

### The hooks become shims, and the telemetry writer rosters follow

Same release train, same trade. Every `hooks/*.sh` registered in
`hooks/hooks.json` is now a shim that `exec`s `node dist/engineos.cjs hook
<name>`; the implementations live in `src/hooks/<name>.ts`.

| Surface | Change | Kind |
|---|---|---|
| `hooks/hooks.json` registrations | unchanged — the same nine paths, the same events and matchers | unchanged |
| `hooks/<name>.sh` | now a shim over `dist/engineos.cjs hook <name>` | implementation, surface unchanged |
| `registries/policy.json` `telemetry.events[].written_by` | values move from `hooks/<name>.sh` to `src/hooks/<name>.ts` | value change, see below |
| `registries/policy.json` `telemetry.exec_journal.written_by` | same move | value change, see below |
| `registries/policy.json` `telemetry.exec_journal.written_by_helper` | `hooks/lib-common.sh` -> `src/hooks/telemetry.ts` | value change, see below |

The hook event contract does not change: same events, same matchers, same
registered paths, same stdout shapes and exit codes. What changes for a consumer
is the runtime requirement — the hooks needed `bash` and `jq`, and now need
`bash` and **node >= 18** — and the three roster fields above.

Those rosters are data whose *values* are file paths, and the files that write
the events moved. A consumer reading `written_by` to know where an event comes
from now gets a TypeScript module path instead of a shell script path. Nothing
about the key, its array shape, or the event ids changes; only the paths do, and
they point at the file that actually writes the line, which is what the field has
always meant. `written_by_helper` names the shared append site, which is now the
sink in `src/hooks/telemetry.ts` rather than the sourced bash library.

Two implementation details that were *inside* the bash hooks and are not public
surface: `hook_slug` / `hook_path_slug` are `hookSlug` / `hookPathSlug` in
`src/lib/slug.ts`, and the `hook_span` / `hook_telemetry` emitters are the span
lifecycle (`withSpan`, `openSpan`, `closeSpan`) and `event` in
`src/hooks/telemetry.ts`. A consumer grepping a hook file for either is reading
a detail the shim removed.

## 1.7.0 additions

### 1.7.0: hooks.json registers node directly; installers drop jq and bash.exe

`1.7.0` is a **MINOR** release. Nothing in the public surface is removed and
nothing is renamed; deprecation windows open on every bash shim — the hook
shims, `scripts/kernel.sh`, `scripts/exec-journal.sh`, `scripts/telemetry.sh`,
`scripts/init-project.sh`, `hooks/bypass.sh`, the two `scripts/gen-agent-*.sh`
entry points, `scripts/run-evals.sh`, `scripts/bench-runtime.sh`,
`scripts/usage-report.sh` and `scripts/validate-engineos.sh` — and one runtime
requirement becomes explicit: `node >= 18`, with `jq` and `python3` gone.

| Surface | 1.7.0 change | Kind |
|---|---|---|
| `hooks/hooks.json` command form | `"${CLAUDE_PLUGIN_ROOT}"/hooks/<name>.sh` -> `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name>` | value change, backward compatible |
| `hooks/<name>.sh` shims | deprecated in 1.7.0, removed in 2.0 | deprecated |
| `scripts/kernel.sh`, `scripts/exec-journal.sh`, `scripts/telemetry.sh`, `scripts/init-project.sh`, `hooks/bypass.sh` | shims over `engineos kernel` / `journal` / `telemetry` / `init` / `bypass` since 1.6.x; deprecated in 1.7.0, removed in 2.0. `scripts/kernel.sh` still needs a bash on Windows until then | deprecated |
| `hooks/layout-manifest.sh`, `hooks/scaffold-layout.sh` | frozen bash until 2.0 — sourced functions cannot be shimmed; `engineos init` requires them as siblings. Not deprecated: they go when `init` stops shelling out, in 2.0 | frozen |
| `python3` | no longer used by anything shipped (`scripts/bench-runtime.sh` was the last caller) | requirement removed |
| CI (`.github/workflows/ci.yml`) | "Tools present" checks `shellcheck`, `bash`, `node` only; JSON validation, the validator, the evals and the bench call `node dist/engineos.cjs` directly. The two gen drift guards stay on the `.sh` shims so the deprecated shims get one CI exercise before 2.0 | changed |
| `engineos settings-merge` | new subcommand of the runtime entry point | added |
| `engineos bypass` | new subcommand of the runtime entry point | added |
| `engineos gen` | new subcommand of the runtime entry point | added |
| `engineos evals` | new subcommand of the runtime entry point | added |
| `engineos bench` | new subcommand of the runtime entry point | added |
| `engineos usage-report` | new subcommand of the runtime entry point | added |
| `engineos validate` | new subcommand of the runtime entry point; all 62 checks registered in `src/checks/index.ts` — `scripts/validate-engineos.sh` is now a shim over it | added |
| `scripts/validate-engineos.sh` | shim over `engineos validate`; `scripts/checks/*.sh` deleted, `scripts/test-validate-engineos.sh` deleted (harness cases in `src/validate/validate.e2e.test.ts`, planted-breakage cases in `src/checks/*.test.ts`) | deprecated, removed in 2.0 |
| Bash test suites `hooks/test-*.sh`, `scripts/test-*.sh` | ported one by one to `*.e2e.test.ts` files beside the module they exercise and run by `npm test`; each port deletes the `.sh` suite and its CI step. All fifteen are ported and deleted: `test-validate-engineos`, `test-kernel`, `test-route`, `test-prompt-advisor`, `test-bypass`, `test-verify`, `test-exec-journal`, `test-agent-announce`, `test-layout`, `test-docs`, `test-gen-agent-registry`, `test-install-hooks`, `test-telemetry`, `test-governance`, `test-post-edit`. Shim-only cases (a `.sh` under a jq-free or node-free PATH) stay inside the e2e files as `spawnSync('bash', ...)` | removed |
| `hooks/lib-common.sh`, `hooks/lib-runner.sh`, `hooks/docs-ledger.sh` | deleted — sourced-only bash libraries whose last consumers were the ported suites; their logic lives in `src/hooks/*.ts`, `src/lib/*.ts` and `registries/docs-ledger.json`. `hooks/layout-manifest.sh` and `hooks/scaffold-layout.sh` stay: `engineos init` requires them as frozen bash siblings until 2.0 | removed |
| `install.sh` `ENGINEOS_HOOK_LIBRARIES` | `"lib-common.sh lib-runner.sh layout-manifest.sh scaffold-layout.sh"` -> `"layout-manifest.sh scaffold-layout.sh"`; check C30 reads the list, so the validator and `install.sh` shrink together | value change |
| Check C1 | reads `node >= 18 present`, not `jq present` — `jq` is no longer a validator dependency; same id, same exit semantics | changed message |
| `scripts/gen-agent-commands.sh`, `scripts/gen-agent-registry.sh` | bash implementation -> shim over `engineos gen agent-commands` / `engineos gen agent-registry`; both shims deprecated in 1.7.0, removed in 2.0 | deprecated |
| `scripts/run-evals.sh`, `scripts/bench-runtime.sh`, `scripts/usage-report.sh` | bash implementation -> shim over `engineos evals` / `engineos bench` / `engineos usage-report`; all three shims deprecated in 1.7.0, removed in 2.0 | deprecated |
| `install.sh` / `install.ps1` dependency | `jq` -> `node >= 18` | requirement change |
| Windows hook path | `bash.exe` no longer resolved or registered | requirement removed |

**Why the command-form change is MINOR.** A consumer who copied the old `.sh`
entries into their own `settings.json` keeps a working install: the
`hooks/*.sh` shims stay on disk and still `exec` the same implementation. On the
next `install.sh` / `install.ps1` run those entries are scrubbed and replaced by
the node form — `settings-merge` recognises a prior EngineOS entry by its
command referencing `<plugin-root>/hooks/` **or** containing
`dist/engineos.cjs`, so both forms are removed before the current list is
appended and no hook ends up registered twice. Removing the shims is MAJOR and
lands in 2.0.

**`node >= 18` is now required to install, not only to run hooks.** `install.sh`
and `install.ps1` check for it and, when it is missing, register nothing and
print the by-hand fallback pointing at `hooks/hooks.json`. This replaces the old
`jq` gate.

**`jq` is no longer needed by the installers or the hooks.** The settings.json
merge — scrub, append, `permissions.allow` set union — moved into
`engineos settings-merge`, and the hooks have parsed tool input natively since
the 1.6.x port. The two agent generators dropped it with the shim swap below,
and so did the eval runner and the usage report.
`jq` is no longer a dependency of the validator either: the check families now
run in-process under `engineos validate`, and check C1 asks for `node >= 18` in
its place. No shipped file calls `jq` any more: the bash test suites that did
are ported to `*.e2e.test.ts` and deleted, and CI validates JSON with node.

**The two agent generators are shims now.** `scripts/gen-agent-commands.sh` and
`scripts/gen-agent-registry.sh` `exec` `engineos gen agent-commands` and
`engineos gen agent-registry`; the implementations live in `src/gen/` and ship in
`dist/engineos.cjs`. What a caller sees is unchanged and is what the shims exist
to preserve — same stdout and stderr messages, byte-identical `commands/agents/`
and `registries/agents.json`, same exit codes — so CI's two drift guards keep
running against the `.sh` paths. The generators now need `node >= 18` where
they used to need `jq`, which is the same trade the hooks made in 1.6.x. Like
the `hooks/<name>.sh` shims, both are deprecated in 1.7.0 and removed in 2.0;
call `engineos gen <target>` directly to get ahead of that.

**The eval runner, the perf bench and the usage report are shims now.**
`scripts/run-evals.sh`, `scripts/bench-runtime.sh` and `scripts/usage-report.sh`
`exec` `engineos evals`, `engineos bench` and `engineos usage-report`; the
implementations live in `src/evals/`, `src/bench/` and `src/report/` and ship in
`dist/engineos.cjs`. What a caller sees is what the shims exist to preserve —
CI's "Evals (deterministic tier)" and "Runtime performance budgets" steps now
call `engineos evals` and `engineos bench` directly, while
`.github/workflows/live-evals.yml` still runs `scripts/run-evals.sh`:
`run-evals.sh` keeps its `ok` / `FAIL` / `SKIP` lines, its summary line and its
exit codes, and `ENGINEOS_EVAL_LIVE=1` still adds the live tier;
`bench-runtime.sh` keeps the five budget names and the `ok` / `FAIL` line format,
and `ENGINEOS_PERF_MULTIPLIER` still scales them; `usage-report.sh` keeps every
section header and line format the `retro` skill reads. Dependencies dropped with
the swap: `jq` for the eval runner and the usage report, `python3` for the bench.
All three need `node >= 18` in their place — the same trade the hooks made in
1.6.x — and like the other shims they are deprecated in 1.7.0 and removed in 2.0.

**The validator is `engineos validate`.** It carries the `--only` / `--list`
surface, the `== EngineOS integrity ==` header, the `ok   ` / `FAIL ` / `skip `
prefixes, `passed N, failed N` and the 0/1/2 exit codes of
`scripts/validate-engineos.sh`, over an explicit check registry
(`src/checks/index.ts`) holding all 62 checks, one module per family under
`src/checks/`. `scripts/validate-engineos.sh` is a shim that execs it (deprecated
in 1.7.0, removed in 2.0); `scripts/checks/*.sh` are gone, and
`scripts/test-validate-engineos.sh` is gone: its harness cases run as
`src/validate/validate.e2e.test.ts` under `npm test`, and the planted-breakage
cases live beside each family as `src/checks/<family>.test.ts`, asserting on
finding codes. Check ids and the ok/FAIL/skip verdicts are
unchanged; C1's title now reads `node >= 18 present` instead of `jq present`,
because `jq` is no longer a dependency of anything the validator runs. What
changes for good is the tail of a `FAIL` line: it is rendered from the check's
findings as `[<code>]` / `[<code>:<subject>]`, and that prose is not versioned
surface (design deviation 8).

**`usage-report` says more than the bash did, in three places.**
`./scripts/usage-report.sh abc` now prints `usage: engineos usage-report [days]`
on stderr and exits 1; bash handed the value to `find -mtime`, which failed
quietly and printed `No transcripts in window.` — an empty report that read as a
finding rather than as a typo. Any window that is not a positive integer (`0`,
`-5`, `1.5`) is rejected the same way. And the router section's
`(none found — router not announcing?)` line is reachable at last: it hung off a
`||` after a `grep | sed | sort | uniq` pipeline that exits 0 on no matches, so
that section used to be silently empty instead. The telemetry section's
`(none — telemetry not adopted here)` line lost its `, or jq missing` clause,
which is now a cause it cannot have. Every other line of the report is byte for
byte what the bash printed.

**Git Bash is off the hook path on Windows.** Hook commands are `node ...`, so
Windows spawns node directly instead of resolving a `.sh` path through the file
association that Git for Windows points at `git-bash.exe`. `install.ps1` no
longer locates `bash.exe` and no longer wraps hook commands with it. Git Bash is
still required on Windows for `scripts/kernel.sh`, which stays bash until 2.0.

## Unreleased

The entries below narrow existing behaviour or move an existing answer from
bash to TypeScript; one adds checks that a consumer's `validate` run can now
fail on. Nothing in the public surface is renamed or removed, and no
deprecation window is opened.

| Surface | change | Kind |
|---|---|---|
| `hooks/stop-verify.sh` / `src/hooks/stop-verify.ts` | the verification gate runs only in projects carrying `.engineos/`; it previously ran in any git repo | tightened |
| `templates/permissions.template.json` | five prefix entries removed (`find`, `rg`, `npm run typecheck`, `npm run lint`, `npx tsc --noEmit`); re-running the installer does not remove entries already merged into `~/.claude/settings.json`, so consumers prune those by hand | tightened |
| `scripts/kernel.sh skill-state` and the `skills_suppressed` field | now answered by the TypeScript kernel (`src/kernel/skill-state.ts`) instead of the bash one; the answers, their key order and the `skill-state: unknown argument <arg>` refusal are unchanged, and the bash cases moved to `node:test` under `src/kernel/` | ported |
| `scripts/validate-engineos.sh` / `validate --list` | C32 (adapter-mirror parity), C33 (CRLF guard), C34 (`skills`/`skills_suppressed` pair on every kernel answer) and C35 (no routing domain emptied by skill disablement) run again, as `src/checks/portability.ts` and `src/checks/skill-enablement.ts`; they had been bash-only since 1.7.0 and ran nowhere. A tree with CRLF text files or drifted `.trae`/`.windsurf` mirrors now fails `validate` (MINOR: new failing check). `scripts/checks/*.sh` is deleted; it was never public surface | ported |
| `validate` execute-bit checks (C18f, C27, C29, C30) | on Windows the execute bit is reported as not representable and the checks emit no finding in either direction; they previously failed by construction on NTFS. POSIX behaviour is unchanged; the modes are still asserted from the commit by `scripts/package-release.sh` | tightened |
| console write routes (`POST /api/publish`, `POST /api/rollback/:id`, `PUT /api/skills/:id`) | a Next middleware on `/api/:path*` answers `403 { ok: false, reason }` when `Host` is not a loopback name (`127.0.0.1`, `localhost`, `[::1]`, any port — closes DNS rebinding, every method) and, on write verbs, when `Sec-Fetch-Site` is anything but `same-origin` (`none` included) or, absent that header, when `Origin`'s host differs from `Host`; a non-browser client sending neither header still passes (accepted residual, see the change record); `npm run dev` / `start` bind `127.0.0.1`; the `PUT` body is parsed by an allowlist (`description: string`, `enabled: boolean`, nothing else; at most five unknown fields named) and answers `400 { errors }` on malformed JSON or shape and `413` above 16 KB instead of storing the cast. Same-origin browser callers and the console's own client see no change | tightened |
| `scripts/validate-engineos.sh` / `validate --list` | C36 (router-table reference resolution) and C37 (check-count claims) added as `src/checks/prose-truth.ts`. A `/command` or `patterns/` reference in the `CLAUDE.md` or `AGENTS.md` router table that resolves to no file, or a check-count literal in `CLAUDE.md`, `AGENTS.md`, `README.md` or `docs/CODEBASE_MAP.md` that differs from the registered count, now fails `validate` (MINOR: new failing check) | added |
| `/analisy-architecture` -> `/analyze-architecture`, `patterns/1-Analisys` -> `patterns/1-Analysis.md` | the router-table spelling of the comprehension row; the files were renamed in d39a498 (1.7.0) and this entry is recorded late. `install.sh` prunes the dangling `~/.claude/commands` symlink the old name left behind | renamed |
| `skills/strategy` | `enabled: true` again — it was set to `false` by the console's first "publish config changes" demo, not by decision, while `CLAUDE.md`, `README.md` and `registries/intents.json` advertised it live. Kernel answers that cite it stop listing it under `skills_suppressed` | restored |
| `install.ps1` | gains an optional `-ClaudeDir <path>` parameter; the default is the previous `Join-Path $HOME '.claude'`, so a call with no arguments behaves as before. The parameter exists so CI can run the installer against a scratch directory (PowerShell's `$HOME` is read-only) | added |
| `scripts/package-release.sh` manifest (`*.MANIFEST.txt`) header | header keys are English: `# generated:`, `# files:`, `# sha256  path` replace `# gerado:`, `# arquivos:`, `# sha256  caminho`; alignment widened by two columns. Console output and comments of the script are English too. A consumer parsing the header by the old keys must switch; the body (`<sha256>  <path>` lines) is unchanged | changed |
| `.github/workflows/release.yml` | new: on a pushed `v*` tag, asserts the tag equals `v<package.json version>`, runs `scripts/package-release.sh`, verifies the checksum and creates a GitHub Release carrying the zip, its `.sha256` and the manifest via the runner's `gh`. The only workflow with `contents: write`; no `workflow_dispatch`, no registry publish | added |
| `.github/workflows/dependency-audit.yml`; `ci.yml` `Dependency audit` step | `npm audit --audit-level=high` no longer blocks a pull request (`continue-on-error` on that event; still blocking on push to `main`); a weekly scheduled workflow with manual dispatch audits `/` and `console/` and fails hard. `ci.yml` also gains a per-ref `concurrency` group that cancels superseded PR runs only, `timeout-minutes` on `verify` and `console`, PSScriptAnalyzer plus a real `install.ps1` run on the Windows package leg, and a 30-day artifact retention | changed |
| `hooks/post-edit-check.sh` / `src/hooks/post-edit-check.ts` (opt-in per-edit gate) | the package, workspace and linter-config walks are bounded to the session cwd and each owner must resolve, by realpath, inside it; a `package.json` above the project or in a sibling checkout is never run, and an envelope without a `cwd` verifies nothing. Previously the walk reached the filesystem root, the defect the Stop gate lost in 1.7.0's wave 1 | tightened |
| `hooks/stop-verify.sh` / `src/hooks/stop-verify.ts` and the opt-in per-edit gate | a package owner reached through a `node_modules` segment is refused: a dependency's `package.json` sits inside the consented tree but its `lint`/`typecheck` scripts were never the project's, and `npm ci --ignore-scripts` does not cover them. Edits under `node_modules` are no longer verified by either hook | tightened |
| `findUpAny` (internal to the two verification hooks) and the Stop gate on Windows | the walk, its `stop` containment and `containedIn` use `node:path` (`resolve`, `relative`, `dirname`, `sep`) instead of `/`-only string surgery, and every comparison against the ceiling goes through `relative`, which is case-insensitive on win32. Under the old code the realpath'd root (`C:\...`) never matched the `/` prefix, so `stop-verify` verified nothing on Windows while reporting nothing. The fix is exercised by unit tests over `node:path` semantics on Linux and macOS; no Windows runner executes the test suite, so Windows behaviour is expected, not measured. A relative `start` resolves against the process cwd instead of converging to `.`, and an unbounded walk (no `stop`, no production caller) now probes the filesystem root too | changed |
