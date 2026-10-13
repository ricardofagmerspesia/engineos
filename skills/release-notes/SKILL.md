---
name: release-notes
description: "Generate evidence-backed version release notes in docs/release-notes and Markdown for GitHub. Use for release summaries, version bumps or GitHub release bodies."
---

# Release Notes

Generate consumer-facing Markdown for a GitHub release body and persist it under
docs/release-notes/. Creating notes does not authorize publishing a release.

## Procedure

1. Identify package/service, semver version, date and author. Infer missing facts
   from changed package.json/manifest and latest commit; ask only unavailable facts.
2. Read git log <prev-tag>..HEAD or supplied PR/commit list. Group feat as What's
   New, fix as What Was Fixed, feat!/BREAKING CHANGE as Breaking Changes first.
   Fold relevant perf/refactor/docs/chore into brief internal notes; omit noise.
3. Translate each supported change into consumer behavior/value, not raw subjects.
   Write this template, matching existing notes style:

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
`pnpm add <package>@<version>` / `npm i <package>@<version>`>
```

4. Persist docs/release-notes/release-notes-<version>.md, creating its directory.
   Local-only/yalc previews or explicit user instruction may skip persistence,
   but still emit Markdown.

## Completion rules

Use ## title, ### sections and #### items; never a single #, no emojis. Breaking
changes lead and include affected consumers/migration. Every entry traces to a
commit/PR; state an empty change set rather than inventing content. Use JavaScript
package-manager upgrade commands. Per-unit tracking belongs to record-change;
release notes summarize the version.
