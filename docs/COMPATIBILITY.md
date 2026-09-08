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
| The `## Return format` envelope fields | Parsed by orchestrators |

The kernel subcommands covered by that row are `resolve`, `route-path`, `route-intent`,
`model`, `risk`, `gates`, `repair`, `admit`, `breaker`, `hitl`, `waves`,
`decision-rules`, `scale`, `route-escalate` and `resolve-task`. Adding a subcommand or a field to an answer
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
never safe as a filesystem path component without `hooks/lib-common.sh`'s
`hook_path_slug`.
Adding a second free-text field to the journal is a compatibility event, not a
convenience. The guard bounds the shape and the size of what reaches disk; it
does not classify content, and `hooks/lib-common.sh` sanitizes rather than
rejects at the hook boundary, so a harness-supplied value's characters still
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
