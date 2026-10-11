# Compatibility and Deprecation Policy

EngineOS ships as a plugin that other repositories consume. Their `CLAUDE.md`
files reference rule paths, agent names, aliases and slash commands from this
repo. Renaming any of those silently breaks every consumer.

This file is the contract. Version lives in `.claude-plugin/plugin.json`.

Load only the relevant surface/policy section. Release additions and platform
evidence retain their dated contracts; consult the matching version section
(not an older prerequisites table) when upgrading. Current development workflow
is owned by `rules/`; search historical tables on demand, never import this whole
file into every task.

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
| Per-call entry point `dist/engineos-hot.cjs` (`hook <name>` for `route-before-change`, `announce-agent-dispatch`, `git-write-guard`, `mark-unrecorded`, `announce-agent-return`; `--version`) and its stdout/exit contract | Registered in `hooks/hooks.json` for the five per-call hooks; `settings-merge` recognises it as an EngineOS command |
| The `## Return format` envelope fields | Parsed by orchestrators |

The kernel subcommands covered by that row are `resolve`, `route-path`, `route-intent`,
`model`, `risk`, `gates`, `repair`, `admit`, `breaker`, `hitl`, `waves`,
`decision-rules`, `scale`, `route-escalate`, `resolve-task`, `skill-state` and `resolve-stack`. Adding a subcommand or a field to an answer
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

The entries below narrow existing behaviour, move an existing answer from bash
to TypeScript, or add new surface; some add checks that a consumer's `validate`
run can now fail on. Nothing in the public surface is removed. Two deprecation
windows are opened (`rules/production-backend-standards.md` and the
`registries/intents.json` `signals` field, below), and the 1.7.0 shim window
moves from Deprecate to Warn. The routing-replacement rows (ADR
`docs/adr/2026-10-10-three-tier-router-and-jev-judge.md`, contracts
`docs/specs/2026-10-10-routing-replacement-contracts.md` rev 3 §14) are all
MINOR; every numeric threshold they name is a placeholder until calibrated from
the golden set at the approved final stage.

| Surface | change | Kind |
|---|---|---|
| `hooks/stop-verify.sh` / `src/hooks/stop-verify.ts` | the verification gate runs only in projects carrying `.engineos/`; it previously ran in any git repo | tightened |
| `templates/permissions.template.json` | five prefix entries removed (`find`, `rg`, `npm run typecheck`, `npm run lint`, `npx tsc --noEmit`); re-running the installer does not remove entries already merged into `~/.claude/settings.json`, so consumers prune those by hand | tightened |
| `scripts/kernel.sh skill-state` and the `skills_suppressed` field | now answered by the TypeScript kernel (`src/kernel/skill-state.ts`) instead of the bash one; the answers, their key order and the `skill-state: unknown argument <arg>` refusal are unchanged, and the bash cases moved to `node:test` under `src/kernel/` | ported |
| `scripts/validate-engineos.sh` / `validate --list` | C32 (adapter-mirror parity), C33 (CRLF guard), C34 (`skills`/`skills_suppressed` pair on every kernel answer) and C35 (no routing domain emptied by skill disablement) run again, as `src/checks/portability.ts` and `src/checks/skill-enablement.ts`; they had been bash-only since 1.7.0 and ran nowhere. A tree with CRLF text files or drifted `.trae`/`.windsurf` mirrors now fails `validate` (MINOR: new failing check). `scripts/checks/*.sh` is deleted; it was never public surface | ported |
| `validate` execute-bit checks (C18f, C27, C29, C30) | on Windows the execute bit is reported as not representable and the checks emit no finding in either direction; they previously failed by construction on NTFS. POSIX behaviour is unchanged; the modes are still asserted from the commit by `scripts/package-release.sh` | tightened |
| console write routes (`POST /api/publish`, `POST /api/rollback/:id`, `PUT /api/skills/:id`) | a Next middleware on `/api/:path*` answers `403 { ok: false, reason }` when `Host` is not a loopback name (`127.0.0.1`, `localhost`, `[::1]`, any port — closes DNS rebinding, every method) and, on write verbs, when `Sec-Fetch-Site` is anything but `same-origin` (`none` included) or, absent that header, when `Origin`'s host differs from `Host`; a non-browser client sending neither header still passes (accepted residual, see the change record); `npm run dev` / `start` bind `127.0.0.1`; the `PUT` body is parsed by an allowlist (`description: string`, `enabled: boolean`, nothing else; at most five unknown fields named) and answers `400 { errors }` on malformed JSON or shape and `413` above 16 KB instead of storing the cast. Same-origin browser callers and the console's own client see no change | tightened |
| `scripts/validate-engineos.sh` / `validate --list` | C36 (router-table reference resolution) and C37 (check-count claims) added as `src/checks/prose-truth.ts`. A `/command` or `patterns/` reference in the `CLAUDE.md` or `AGENTS.md` router table that resolves to no file, or a check-count literal in `CLAUDE.md`, `AGENTS.md`, `README.md` or `docs/CODEBASE_MAP.md` that differs from the registered count, now fails `validate` (MINOR: new failing check) | added |
| `scripts/kernel.sh route-path` / `route-intent` / every kernel answer read from `registries/routing.json` or `registries/intents.json` | the two loaders fail closed like the other five: a malformed, empty or `{}` registry now exits 1 with `{"error": "registries/<file>: <path> must ..."}` where it used to coerce and answer defaults — `routing.json = {}` answered `{"domain": null, "excluded": false}` with exit 0, so security routing disappeared silently. An empty `precedence`, an empty `domains`/`intents` list, a row without an id, an intent with no signal, a `risk_floor` outside `low|medium|high` and a non-boolean `suppressible`/`requires_dispatch_plan` are all refusals now. The shipped registries load unchanged and the three answers stay byte-identical | changed |
| `scripts/validate-engineos.sh` / `validate --only C14` | C14 gains three results: agent `capability_ids` resolve to `registries/capabilities.json` (`dangling-capability-id`), capability `agent`s exist in `registries/agents.json` (`unknown-capability-agent`), and every decision rule `source` path token names a file that exists (`source-file-missing`, prose sources naming no path report nothing). A tree with a dangling capability id or a rule citing a deleted file now fails `validate` (MINOR: new failing check) | added |
| `scripts/kernel.sh skill-state`, `skill-state --id`, and `skills_suppressed` on every routing answer | a SKILL.md whose frontmatter block opens on line 1 and is still open at the 64 KiB read bound is now `unreadable` and withheld, instead of read as enabled: `skills_suppressed[].reason` gains the value `unreadable` (beside `disabled`), the `skill-state` section lists the skill under `disabled` and under a new `unreadable` array, and the lookup form adds `unreadable: true`. Both new keys appear only when non-empty, so every tree without such a file answers byte-identically. The console reads the whole file and still shows such a skill as enabled; the divergence exists only past 64 KiB of frontmatter | changed |
| `ENGINEOS_REQUIRE_PARITY` (environment variable, test suite) | new: with `ENGINEOS_REQUIRE_PARITY=1` the bash-parity suite in `src/kernel/parity.test.ts` fails instead of skipping when bash is missing or cannot parse the pinned kernel (macOS bash 3.2). CI's `verify` job sets it, so parity evidence cannot disappear silently; local runs on macOS keep skipping | added |
| `/analisy-architecture` -> `/analyze-architecture`, `patterns/1-Analisys` -> `patterns/1-Analysis.md` | the router-table spelling of the comprehension row; the files were renamed in d39a498 (1.7.0) and this entry is recorded late. `install.sh` prunes the dangling `~/.claude/commands` symlink the old name left behind | renamed |
| `skills/strategy` | `enabled: true` again — it was set to `false` by the console's first "publish config changes" demo, not by decision, while `CLAUDE.md`, `README.md` and `registries/intents.json` advertised it live. Kernel answers that cite it stop listing it under `skills_suppressed` | restored |
| `scripts/exec-journal.sh append` / `journal append`, and every span an EngineOS hook writes | `tokens_in` and `tokens_out` move from `required` to always-present: `--tokens-in` and `--tokens-out` become OPTIONAL on `append` (the usage block brackets them), an omitted count emits JSON `null` instead of failing the call, and the two announce hooks stop writing `0`. A hook cannot see a subagent's usage, so the old `0` said "free" where the truth was "unknown", and any consumer summing the column understated real spend. A caller that does observe usage (the headless runner) still passes its own integers through, and a supplied count is validated exactly as before. Consumers reading either field must handle `null`. Two divergences follow: `validate` now accepts a line whose token counts are `null`, which the pinned v1 bash CLI in `test/fixtures/legacy-journal/` still rejects, and an `append` call that omits the flags succeeds here and fails there — the differential parity suite passes both flags in every case, so neither is covered by it | changed |
| `engineos bench lifecycle` | new subcommand arm of `engineos bench`. Runs the six lifecycle scenarios and prints `== EngineOS task lifecycle ==` followed by one `<scenario> p50=<n>ms p95=<n>ms` line per scenario. The scenario names (`prompt-routing`, `direct-edit-cold`, `direct-edit-warm`, `agent-dispatch`, `agent-return`, `final-gate`) are public surface | added |
| `engineos bench baseline [--write] [--strict]` | new subcommand arm of `engineos bench`. With `--write`, records this host's baseline at `docs/perf/baselines/<host-id>.json` and prints its path; `<host-id>` is derived from platform, cpu model and cpu count only, never the EngineOS version, so a version bump does not orphan a recorded baseline. Without it, compares the current run against that file and names every scenario whose p50 exceeds the recorded one by both 10% and 25ms. **The comparison is ADVISORY: it prints the drift and exits 0.** Every scenario is a process spawn on a 60-95ms floor and a developer machine's run-to-run spread is 30-50ms, so a gating exit would fail on an unchanged tree; `--strict` restores the failing exit for a host quiet enough to earn it. A missing baseline is still exit 1 under either mode, because absent evidence is not a measured regression. Consumers must not treat a 0 exit as a performance guarantee | added |
| `engineos bench <unknown>` | an argument that is not `lifecycle` or `baseline` now exits 1 with `unknown bench subcommand: <arg>` on stderr. Before this change every argument was ignored and the five budgets ran; a bare `engineos bench` is unchanged, byte for byte | changed |
| Python stack and agent-system design gate (`docs/specs/2026-09-28-python-stack-and-agent-design-design.md`), registry and prose half | additive surface, all MINOR: routing domain `backend-python` (precedence `security, test, backend, dba, backend-python, ios-release, android-release, devops, mobile, frontend, llm` — `dba` now precedes it so `*/alembic/versions/*` and `*.sql` never land there; `test`, `dba`, `llm` and `security` gain Python globs; `uv.lock`/`poetry.lock` excluded); intents `backend-python` (hook-mirrored, suppresses `backend` when both match) and `agent-system` (command `design-agents`, skill `agent-system-design`, agent `llm-coordinator`); rule file `rules/backend-python.md`, skills `python-patterns` and `agent-system-design`, command `/engineos:design-agents` (stubs then; filled by the waves in the next row); decision rule `rule-multi-agent-design`; hitl reason `topology-approval` appended last to `policy.json` `hitl.reasons` — every existing reason keeps its emission position — with a `topology` fact on the `hitl` section (`resolve --facts`; `resolve-task` sets it from the matched rule; the legacy `kernel.sh hitl` flag arm does not expose it yet); capability `design-agent-topology`; non-negotiable #12 and the per-developer `ENGINEOS_GIT_WRITES` setting (`ask` default, `auto`; the PreToolUse guard itself is in the next row); C16 additionally resolves every `intents.json` command to `commands/<name>.md` (MINOR: new failing finding). ADR: `docs/adr/2026-09-28-topology-approval-hitl-reason.md` | added |
| Python stack and agent-system design gate, runtime and prose half (same design, waves 1–3) | all MINOR, additive unless marked. **Kernel**: new verb `scripts/kernel.sh resolve-stack [dir]` (`engineos kernel resolve-stack`) answering `{ packages: [{ dir, language, framework, compose_service, python_env }], source: "config" \| "detected" }` — `.engineos/config.json` when present (`src/registry/project-config.ts`, strict: unknown key or wrong type exits 1 with the JSON path; an absent file means detect), else `pyproject.toml`/`requirements.txt`/`package.json` per package dir; a flag or a second argument is refused. **Init**: `engineos init --stack auto\|<framework>[@dir],...` (`init-project.sh`, `/engineos:init`) writes `.engineos/config.json` once (never overwritten; not written when nothing is detected — stdout says `not written — no package detected; declare one with --stack <framework>[@dir]`), prints a `stack (config\|detected):` table, and seeds `CLAUDE.md` from `templates/project-claude-python.md` when every package is Python — the new stdout line is `CLAUDE.md: created from templates/project-claude-python.md — fill in the Stack and Commands sections`; `templates/project-claude.md` now carries a Node and a Python block. **Hooks**: `hooks/hooks.json` gains a `PreToolUse` entry with matcher `Bash` running `hook git-write-guard` (`hooks/git-write-guard.sh` shim), which answers `hookSpecificOutput.permissionDecision: "ask"` with reason `[engineos] git write: <subcommand> — ENGINEOS_GIT_WRITES=ask` on any git/forge write segment unless `ENGINEOS_GIT_WRITES=auto`; it never denies, and it ignores bypass — a consumer merging `hooks.json` gets prompted on writes from then on (**tightened** for consumers who relied on unprompted writes; set `auto`). `src/hooks/output.ts` gains the `ask` decision kind. `SessionStart` (`ensure-project-layout`) prints one `[engineos] stack: …` context line. **Stop gate**: `stop-verify` now verifies Python packages too — `ruff` and `pyright` (`pytest` under `ENGINEOS_VERIFY_TESTS=1`) through `.venv` → `uv run` → `docker compose exec -T <compose_service>`, never installing; a package with no environment is announced as `[engineos] stop-verify skipped for <pkg>: no Python environment found (venv, uv or compose)`; an unpinned tool gets an advisory line. A Python package that previously passed the gate untouched can now **block** on a genuine red (**tightened**). New environment variable `ENGINEOS_VERIFY_BUDGET_S=<positive integer>` raises every target's timeout (defaults stay 90s / 180s; a non-positive or non-integer value is ignored). **Prose surface**: rule `rules/backend-python.md` (loaded by the FastAPI router row; routing domain `backend-python` sits after `dba` in the precedence chain, so `security → test → backend → dba → backend-python → ios-release → android-release → devops → mobile → frontend → llm`); skills `python-patterns`, `langgraph-patterns` and `agent-system-design` (with `references/form.md`, `references/patterns/*.md`, `references/context-enriched-tools.md`, `references/tenant-profiles.md`) filled; command `commands/design-agents.md` (`/engineos:design-agents [resume]`); pattern `patterns/3-Agent-topology-interview.md`; templates `templates/agent-topology.md` and `templates/project-claude-python.md`; `rules/llm-apps.md` states that any system with more than one agent starts at `/engineos:design-agents`; `rules/git.md` gains "Who may write"; `rules/verification.md` gains the Python runner cascade; `rules/risk-autonomy.md` names `topology-approval`. Test fixture `test/fixtures/py-fastapi/` is not public surface | added |
| `rules/production-backend-standards.md` | deprecated 2026-09-28 (D5 of the same design). A company-specific NestJS/TypeORM overlay (`@coresoft-sas/*`, `DefaultTypeOrmRepository`, "no snake_case" — which conflicts with PEP 8 for Python packages) that the `CLAUDE.md`/`AGENTS.md` backend row loaded while `registries/routing.json` and `registries/intents.json` never did. The file stays on disk with a deprecation header, is loaded by no router row, and its replacement is the consuming project's own `CLAUDE.md` / `docs/rules/` (project conventions already win, non-negotiable #4). Removed in the next MAJOR, not before; `docs/release-notes/` names the removal version when the release is cut | deprecated |
| Stack-first greenfield question and from-scratch feature artifacts (`docs/specs/2026-10-06-stack-first-and-feature-artifacts-design.md`, C1–C12) | all MINOR, additive unless marked. **Kernel**: `src/kernel/stack.ts` exports `STACK_MANIFESTS` (`package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `Gemfile`, `composer.json`, `pubspec.yaml`, `mix.exs`, `deno.json`), `STACK_MANIFEST_SUFFIXES` (`.csproj`, `.sln`), `STACK_SIGNAL_MAX_DEPTH = 3` (root = depth 0) and `hasStackSignal(root, deps?)` — true when `.engineos/config.json` exists at the root or any manifest exists within depth 3, dot-directories and `SKIPPED_DIRS` excluded, never throwing; no new `kernel.sh` verb. **Hooks**: new module `src/hooks/stack-question.ts` (`STACK_QUESTION_NOTE`, `STACK_DEPENDENT_INTENTS` = `new-feature`, `backend`, `backend-python`, `frontend`, `mobile`, `llm`, `agent-system`). `SessionStart` (`ensure-project-layout`) adds the note to its context in a greenfield repo — after the opt-in hint when the project is not opted in, as one more line when it is; outside a git repo the check runs against the session cwd with no scaffolding and returns the note alone; never when the cwd is the home directory; `ENGINEOS_SCAFFOLD=0` stays silent. `UserPromptSubmit` (`prompt-advisor`) appends the same note after the guidance notes when a stack-dependent intent matches in a greenfield repo; bypass still short-circuits first. Both are advisory — nothing blocks. The note, verbatim: `` [engineos] no stack declared — this repo has no .engineos/config.json and no package manifest. Before writing any code, your FIRST reply must ask the developer which stack to use for each tier the work touches (backend, frontend, mobile, LLM/agent runtime) — never pick one yourself (rules/base.md "New projects — stack first"). Persist the answer with `engineos init --stack <framework>[@dir],...` and record it as the project's first ADR. ``. **Prose surface**: `rules/base.md` gains the section `## New projects — stack first`; `CLAUDE.md`/`AGENTS.md` non-negotiable #1 adds "A from-scratch feature carries four artifacts before code — PRD, ADR, SPEC, TASKS — produced by `/engineos:new-feature`" and new non-negotiable #13 "Stack first on a greenfield repo"; the new-feature router row loads `/engineos:new-feature` (Matt Pocock `grill-with-docs` → `to-spec` → skill `tlc-spec-lean` plan and checks → `to-tickets` → build → the `tlc-spec-lean` Verifier) instead of `superpowers:brainstorming` → `superpowers:writing-plans`, — Matt's skills appear there without a leading slash, because C36 resolves a backticked `/name` in a router row to `commands/<name>.md` and they are not EngineOS commands — and `registries/intents.json` intent `new-feature` becomes `skills: ["tlc-spec-lean"]`, `commands: ["new-feature"]`, with an `EXTERNAL` note (every other superpowers row is unchanged); `rules/verification.md` "Tests are ON" gains a bullet — work that runs `/engineos:new-feature` writes the proofs in `.specs/features/<feature>/checks.md` as its tests (**tightened**: tests are no longer opt-in for that flow). **Command**: `commands/new-feature.md` (`/engineos:new-feature <feature-slug> [resume]`), in-session, stages Stack → Preconditions → ADR (`docs/adr/`, glossary `CONTEXT.md`) → PRD (`docs/prds/`) → SPEC (`.specs/features/<feature>/plan.md` and `checks.md`, index `docs/specs/<date>-<feature>.md`) → TASKS (`docs/specs/<feature>/tickets/NN-<slug>.md`) → Build + verify (`.specs/features/<feature>/verification.md`), each ending at a developer review gate; in stage 6 `tlc-spec-lean`'s `## Handoff` arithmetic (one builder, or sequential batches only on green) overrides `rules/parallelism.md`'s fan-out default for that stage only, builders are routed coordinators, and the Verifier is a fresh general-purpose `opus` agent. **Init**: `engineos init` copies `templates/agent-skills/issue-tracker.md` and `templates/agent-skills/domain.md` to `docs/agents/` when absent, never overwriting, printing `docs/agents/<name>: created from templates/agent-skills/<name>` per file; `templates/project-claude.md` and `templates/project-claude-python.md` gain `## Agent skills` and `## tlc-spec-lean` (`profile: light`, `budget: 150k`) blocks. **Installer**: `install.sh` step `4a2` links every `skills-lock.json` entry whose `source` is `mattpocock/skills` or `tech-leads-club/agent-skills` from `.agents/skills/<name>` to `~/.claude/skills/<name>`, warning and skipping when the target exists and is not a symlink or the source directory is missing; `install.ps1` carries the same step with junctions (same allowlist, name check and EngineOS-name guard). **Release zip** (`scripts/package-release.sh`): the default artifact now ships `skills-lock.json` and the `.agents/skills/<name>` directories of those two sources (previously `.agents/` shipped only with `WITH_IDE_MIRRORS=1`), and packaging **fails** when a pinned skill is not vendored at the commit (**tightened**). **Agents**: `backend-coordinator`, `frontend-coordinator`, `mobile-coordinator` and `llm-coordinator` return `status: BLOCKED` with `missing: stack undeclared — …` when `resolve-stack` finds no package and there is no `.engineos/config.json`, instead of picking a stack (**tightened** for a caller that relied on `backend-coordinator` falling back to the files in scope). ADR: `docs/adr/2026-10-06-from-scratch-artifacts-matt-pocock-and-tlc-spec-lean.md` | added |
| `registries/intents.json` | `version` `"1.5.0"` -> `"2.0.0"` (informational: the loader reads v2 fields on any row whatever the version, so a v1 file loads unchanged). Per-row additive fields, appended after the existing keys: `phrases` (`{ text, weight }[]`), `verb_object` (`{ verbs, objects, weight }`), `negative` (weights subtracted), `exemplars` (strings; 3 to 10 per active row, enforced by C38b), `threshold` (the judge cut for `intent.<id>`, in `(0, 1]`) and `router_row` (`{ intent, load }`, the generated router-table cells). The loader now refuses a row `threshold` of `0` (an absent id reads as `0` and would qualify) and an `enabled` value that is present but not a boolean; an absent `enabled` still means active. Row order changes once: `route-planning` now precedes `verify-done`, matching the router table. **Deprecation window opened**: `signals` stays a non-empty string array on every active row of the shipped registry and is still read; it becomes optional on a row that declares non-empty `phrases` and is removed in 2.0 | added, one window opened |
| `kernel route-intent` / `resolve --facts {prompt}` | trailing keys `ranked` (`{ id, score, confidence, features }[]`, score descending, at most `router.scoring.top_k`) and `margin` (`number \| null`); `matches` keeps its eleven-field shape and registry order, capped at `router.scoring.max_intents`. `ambiguous` may now be true on weak confidence or margin, not only on zero matches (inert under the shipped placeholders `threshold: 0`, `margin: 0`) | changed (tightening) |
| `kernel route-escalate` / `resolve-task` route section | trailing keys `ranked`, `margin` and `judge` (`{ source, reason, model }`; `{ "source": "fallback", "reason": "no-judge-fact", "model": null }` without a judge fact). Reason `low-confidence` is appended last to `policy.router.reasons` (the three existing ids keep their emission order) and fires only with at least one candidate, so a pure question still routes nowhere. `route.*` is always the deterministic answer, in every judge mode | added |
| `kernel resolve-task` task contract | `task_contract` keeps its twenty keys and order and appends key 21 `judge`, key 22 `risk_proposal` (`RiskTier \| null`, reported in every mode, folded only in `authoritative`) and key 23 `tiebreak` (the intent id the embedding tie-break kept, else `null`). `decision_rules` gains a trailing `judge_added` array only in answers composed with a `taskContract` fact; the standalone `decision-rules` arm and the five-key `DecisionMatch` are unchanged. In `authoritative` mode a folded answer may add, never remove, `multi-agent-dispatch` and `requires-dispatch-plan` to `escalation_reasons` (re-evaluated over the folded intents), and an authoritative `jev` fact turns a `null` risk floor into at least `low` | added |
| `kernel resolve --facts` fact keys | `judge` and `tiebreak` join the vocabulary. Both are refused without `taskContract: true` (`a judge fact cannot be declared without a task-contract fact`, `a tiebreak fact cannot be declared without a task-contract fact`). `judge` is the discriminated union `source: "jev" \| "fallback"`; unknown keys at any level, an unknown intent id and a `rules` name that no decision rule declares as `judge_fact` are refused. `tiebreak` is an object of active intent id -> similarity in `[0, 1]`; each id must be in the deterministic `route.ranked` for the same prompt; `{}` is accepted and selects nothing. The kernel reads no clock, network or environment for either fact, so `prompt` plus a journaled fact replays offline | added |
| `registries/policy.json` | `version` `"1.7.0"` -> `"1.8.0"`. `router.scoring` (`min_score`, `threshold`, `margin`, `top_k`, `max_intents`, `bm25_weight`, `path_weight`), `router.combination` (exact literals `deterministic-wins`, `add-only`, `noul-then-primary`, `escalate_on_doubt: true`; any other value is refused), `router.source_markers` (`notification`, `tool_result`, `hook_echo` literal prefixes, never regular expressions) and `router.tiebreak` (`min_similarity`, `margin`, each in `(0, 1]`). New top-level `judge` block (`enabled_env`, `enabled_value`, `provider`, `endpoint`, `model`, `timeout_ms`, `retries` — only `0` is accepted in 1.8 — `key_env`, `mode` `shadow \| advisory \| authoritative` (ships `shadow`), `max_state_bytes`, `thresholds` — `intent_default` and `rule_default` in `(0, 1]`, `primary_confidence` and `margin` in `[0, 1]` — `redaction.patterns` and `breaker`). Decision tables and state machines read by the kernel (`src/kernel/{table,transitions}.ts`): `parallelism.backpressure.rows`, `repair.by_situation[].action`/`reason`, `repair.never_repair_answer`, `repair.ladder`, `repair.infra_patterns`, `breaker.transitions`, `hitl.reason_table`; the `admit`, `repair`, `breaker` and `hitl` answers are unchanged. Telemetry: the `route` event's keys gain `skipped` (appended last) and a new `judge` event (`source`, `model`, `mode`, `skipped_reason`, `latency_bucket`) is written by `src/hooks/prompt-advisor.ts`; no key carries prompt text. Every new block is read by the strict loader, so a missing or malformed field exits 1 naming its JSON path | added |
| `registries/decision-rules.json` | `version` `"1.1.0"` -> `"1.2.0"`; every rule gains `judge_fact` (`string \| null`) and `judge_threshold` (`number \| null`, in `(0, 1]`; non-null only with a non-null `judge_fact`) after `then`. The `judge_fact` names are the judge's `fact.<name>` question vocabulary | added |
| `engineos validate` / `validate --list` | C38 (intents.json v2 scoring fields well-formed), C38b (every active intent carries 3 to 10 exemplars), C38c (`policy.json` router scoring, combination, source_markers and judge blocks well-formed, plus the judge isolation boundaries: no `fetch(` under `src/judge/**`, `src/kernel/**` never imports `src/judge/**`) and C38d (the `CLAUDE.md` and `AGENTS.md` router-table regions equal the generated table) added as `src/checks/router-v2.ts`; the registry now holds 72 checks. A tree that drifts on any of them fails `validate` (MINOR: new failing checks). C38b checks the exemplar count only; asserting that exemplars also appear in the golden set is deferred to the approved final test stage | added |
| `engineos gen router-table` | new `gen` arm: rewrites only the lines between `<!-- engineos:router-table:begin -->` and `<!-- engineos:router-table:end -->` in `CLAUDE.md` and `AGENTS.md` from `registries/intents.json` (one row per intent in registry order, `android-release` folded into the `ios-release` row; `router_row` cells when present, derived cells otherwise). Idempotent; a file without both markers is left untouched and reported, and no file carrying the markers exits 1. The table in `AGENTS.md` is now the generated table, identical to `CLAUDE.md`: its former FastAPI, LangGraph and "Codex environment" wording, which contradicted `rules/base.md`, is replaced; the prose outside the markers keeps its Codex wording | added |
| `hooks/hooks.json` command form | the five per-call hooks (`route-before-change`, `announce-agent-dispatch`, `git-write-guard` on PreToolUse; `mark-unrecorded`, `announce-agent-return` on PostToolUse) run `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hot.cjs" hook <name>`; `ensure-project-layout`, `prompt-advisor`, `stop-verify` and `record-verify` stay on `dist/engineos.cjs`. Event names, matchers and decisions are unchanged, and `dist/engineos.cjs hook <name>` still answers all five | value change, backward compatible |
| `dist/` layout and `dist/engineos-hot.cjs` | `scripts/build.mjs` builds two entries: `src/cli.ts` -> `dist/engineos.cjs` (every subcommand, unchanged surface) and `src/hot-cli.ts` -> `dist/engineos-hot.cjs` (answers `hook <name>` for the five per-call hooks and `--version` only; any other hook name points at `dist/engineos.cjs`). Each committed file is now a small loader in front of its bundle under `dist/runtime/` (`engineos.cjs`, `engineos-hot.cjs`); on node 22.8+ the loader enables V8's compile cache under the OS temp dir (`NODE_DISABLE_COMPILE_CACHE=1` turns it off). Both entries share the hook adapter `src/hooks/adapter.ts`. A consumer that copied only `dist/engineos.cjs` must also ship `dist/runtime/` | added |
| `engineos settings-merge` | recognises a third EngineOS command form, `node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hot.cjs" hook <name>`, beside `"${CLAUDE_PLUGIN_ROOT}"/hooks/<name>.sh` and the `dist/engineos.cjs` form; a prior entry referencing either bundle is scrubbed before the current list is appended, so no hook is registered twice. The `ABORT: unrecognized hook command` message lists all three forms | changed |
| Hook adapter and dispatch types (`src/hooks/adapter.ts`, `src/dispatch.ts`) | `HookRun` may return `HookDecision \| Promise<HookDecision>`; synchronous hooks still render in the same tick, a rejected promise renders a silent decision after one stderr line. `MaybeAsyncCommand` and `exitWith` carry an async command to its exit code; `Command` and `SyncCommandTable` stay synchronous. Not public surface; recorded because `prompt-advisor` is now asynchronous (it awaits the judge within its 600 ms budget) | internal, recorded |
| `prompt-advisor` hook | split into `src/hooks/prompt-advisor.ts` (routing, guidance, every telemetry write) and `src/hooks/prompt-judge.ts` (the judge consultation and the facts it yields). Text whose leading characters match a `router.source_markers` prefix (a task notification, a tool result, an `[engineos]` echo) is not routed: no kernel call, no judge call, one `route` event `{ "skipped": "not-user-input" }` and a silent decision. With the judge enabled the advisor passes its fact to the kernel and, in `advisory` and `authoritative` modes only, prints one `[engineos] judge (<source>, <model>): ranked=... flags=... risk_proposal=<tier> — model judgment, not a gate` line. The judge breaker state lives at `<git dir>/engineos-telemetry/engineos-judge-breaker.json` | changed |
| `git-write-guard` hook | a fast path skips the tokenizer when the command, with quotes and backslashes removed, contains neither `git` nor `gh`; decisions are unchanged | internal, recorded |
| `engineos bench` | a sixth budget line, `per-call hook bundle` (bytes of `dist/runtime/engineos-hot.cjs`, budget 320000), is appended after the five, which keep their names and order. `engineos bench lifecycle` appends three scenarios after the six: `bash-noop`, `hot-bundle-load`, `full-bundle-load` (public surface, like the six). Spawned hooks run with `ENGINEOS_QUIET_SHIMS=1`, so a shim warning is never measured | added |
| `hooks/<name>.sh`, `hooks/bypass.sh`, `scripts/{kernel,exec-journal,telemetry,init-project,gen-agent-commands,gen-agent-registry,run-evals,bench-runtime,usage-report,validate-engineos}.sh` | Warn step of the 1.7.0 window: each shim prints one stderr line before `exec`, `[engineos] <path> is deprecated since 1.7.0 and will be removed in 2.0 — use: node dist/engineos.cjs <sub> ...`; stdout and exit codes are unchanged, and `ENGINEOS_QUIET_SHIMS=1` silences the line. `scripts/usage-report.sh` now exports `ENGINEOS_ROOT` to the bundle. The sourced `hooks/layout-manifest.sh` and `hooks/scaffold-layout.sh` stay frozen and silent. Warn since 1.8.0, removed in 2.0 | deprecated -> warn |
| `src/kernel/parity.test.ts` intent arms | the `route-intent`, `route-escalate` and `resolve-task` byte-parity arms against the retired bash kernel are retired by the ADR (decision D6): a scored router changes those answers on purpose. Path parity (`route-path`) and every policy arm stay. The skip itself lands with the approved final test stage | test surface, recorded |
| `evals/intent-routing-cases.jsonl` case schema | v2 fields, all optional: `expect_primary`, `expect_not_intents`, `exemplar`, `source` (`user` \| `notification`) and `judge` (`primary`, `intent_above`, `intent_below`, `fact_above`, `fact_below`, `design_work_above`; graded by the shadow tier only). Existing fields and the grader's unknown-field tolerance are unchanged | added |
| `[router]` announcement, `engineos usage-report`, `router` agent, `/engineos:route` | the `[router]` line may end with ` corrected_from=<id>[,<id>...]`, the kernel-ranked intents the supervisor overrode; `usage-report` mines it into a `## Misroutes` section printed after the router-intent section (`<kernel intent> -> <corrected intent>  <count>`), and `retro` turns recurring pairs into `intents.json` deltas. The `router` agent's reply gains a Candidates table (`route.ranked`) and cites a candidate in each `intent_overrides[].reason` (the dispatch plan shape is unchanged); `/engineos:route` prints one `[route] escalate=... reasons=... intents=... ranked=... margin=... judge=...` summary line | added |
| Environment | new, all opt-in and unset by default: `ENGINEOS_JUDGE` (`jev` enables the judge), `TYPESAFE_API_KEY` (the judge's key, read from the environment only and never written to a file, log or span; prompts leave the machine only when both are set, after redaction), `ENGINEOS_QUIET_SHIMS` (`1` silences the shim warning), `ENGINEOS_INPROCESS` (`1` enables the in-process adapter), `ENGINEOS_ROOT` (the EngineOS checkout the adapter host loads; also exported by `scripts/usage-report.sh`), `ENGINEOS_NODE` (the node binary the adapter spawns), `ENGINEOS_EMBED_DAEMON` (`1` lets the tie-break daemon start and the client consult it), `ENGINEOS_EMBED_CACHE` (model cache directory), `ENGINEOS_EMBED_OFFLINE` (`1` never contacts the Hugging Face hub), `ENGINEOS_EMBED_IDLE_MINUTES` (daemon idle exit, default 120). `ENGINEOS_TELEMETRY=0` keeps its single meaning | added |
| `adapters/claude-code-mod/` (plugin `engineos-inprocess`), `dist/engineos-inprocess.cjs`, `tools/embedding-daemon/` | opt-in tiers, documented in `docs/OPT-IN-TIERS.md`; `dist/engineos.cjs` loads no file from either directory and the root `package.json` gains no dependency. The adapter serves hook decisions from one warm host per session (`dist/engineos-inprocess.cjs`, built from `adapters/claude-code-mod/host/server.ts`); with `ENGINEOS_INPROCESS=1` and a live, private, same-session presence record the shell hook exits immediately, and every failed condition runs the hook normally. The daemon (`@engineos/embedding-daemon`, its own install, node >= 22.6, `@huggingface/transformers` 4.3.0, model `Xenova/all-MiniLM-L6-v2` pinned by revision) answers the tie-break over a private unix socket and downloads the model on first run unless `ENGINEOS_EMBED_OFFLINE=1`. **Documented limit (accepted deviation, DEGRADED):** with the adapter on, the host still spawns every command hook registered in the root `hooks/hooks.json`, so each call costs one immediate-exit spawn per registered route instead of zero, until the host can disable one plugin's command hooks | added (opt-in) |
