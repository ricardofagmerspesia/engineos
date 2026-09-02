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
| The `## Return format` envelope fields | Parsed by orchestrators |

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
