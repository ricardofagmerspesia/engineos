---
name: release-notes
description: Generate structured release notes / a GitHub release page for a package or service version. Use when asked to write release notes, document version X.Y.Z, summarize "what changed in this release", prepare a GitHub release body, or when a package version bumps. Stack-agnostic.
---

# Release Notes

Produce a clean, structured release page from commits/PRs. Emit markdown to paste into the GitHub release body, and persist a file under `docs/release-notes/`.

## Procedure

1. **Gather facts:** package/service name, version (semver), date, author. If not given, infer version from the changed `package.json`/manifest and date from the latest commit; ask only what you cannot infer.
2. **Collect changes:** read `git log <prev-tag>..HEAD` (or the PR list / commit list the user pasted). Group by Conventional Commit type:
   - `feat:` → What's New
   - `fix:` → What Was Fixed
   - `feat!:` / `BREAKING CHANGE:` → Breaking Changes (always surface these first if present)
   - `perf:`, `refactor:`, `docs:`, `chore:` → fold into a brief Other/Internal line, omit if noise.
3. **Translate to user value:** each entry says what changed and why it matters to a consumer, not the raw commit subject. Drop internal churn.
4. **Write the page** using the template below.
5. **Persist:** create the directory if absent (`mkdir -p docs/release-notes`) and write to `docs/release-notes/release-notes-<version>.md`. Skip the file only for local-only/yalc previews or when the user says not to persist — still emit the markdown.

## Template

```markdown
## <package> v<version>

_Released <YYYY-MM-DD> · <author>_

### Summary
One or two sentences: the headline of this release.

### Breaking Changes
#### <title>
What breaks, who is affected, and the migration step. (Omit this whole section if none.)

### What's New
#### <feature name>
What it does and why it's useful.

### What Was Fixed
#### <fix description>
What was broken and what now works.

### Upgrade
<package-manager install/update command for this ecosystem, e.g.
`pnpm add <package>@<version>` / `npm i <package>@<version>` / `dotnet add package ...`>
```

## Rules

- Heading hierarchy: never a single `#`. Title = `##`, main sections = `###`, individual items = `####`. Body stays prose/lists.
- Breaking changes lead and always include a migration step — a breaking change without a migration note is incomplete.
- No emojis. Match the repo's existing release-notes style if `docs/release-notes/` already has entries.
- Don't invent changes — every entry traces to a commit/PR. If the change set is empty, say so rather than padding.
- Per-unit-of-work change records (`.engineos/changes/` → `.engineos/archived/`) are the `record-change` skill's job, not this one — release notes summarize a version, not a single change.
