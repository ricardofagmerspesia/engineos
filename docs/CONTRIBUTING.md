# Contributing to EngineOS

EngineOS is a shared engineering environment. Everything here — rules, skills,
agents, hooks — is **code**: changed via PR, reviewed, merged, then pulled by the
team (`git pull && ./install.sh`). No Slack-announcement standards.

## Golden rule: one home per fact

Before adding anything, check `rules/memory.md` for where knowledge belongs. Do
not duplicate a rule across files — state it once, cross-reference it elsewhere.
Duplication drifts.

## Workflow for any change

1. Branch from `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
2. Open a `.engineos/changes/` record (`cp .engineos/changes/_template.md .engineos/changes/$(date +%F)-<slug>.md`,
   `status: active`). See `.engineos/changes/README.md`.
3. Make the change. Keep PRs ≤400 lines (see `rules/git.md`); split larger work.
4. Verify (see below) and show the output in the PR description.
5. Close the record with the `record-change` skill (marks done, registers files +
   movements, moves `.engineos/changes/` → `.engineos/archived/`). Distil any lasting fact into
   `.engineos/memory/`.
6. PR with what + why + how-verified. Self-review the diff first.

## Adding each artifact type

- **Rule** (`rules/*.md`): keep it actionable and verifiable. Prefer DO/DON'T
  bullets with concrete examples. If it overlaps an existing rule, edit that file
  instead of adding a new one. If it introduces a new file-domain, add a domain
  to `registries/routing.json` (`match` globs, `precedence`, `hook_guidance`,
  `sample_path`) AND the mirroring router row to `CLAUDE.md`;
  `scripts/validate-engineos.sh` fails when the two disagree.
- **Skill** (`skills/<name>/SKILL.md`): frontmatter `name` + a trigger-rich
  `description` (the description is what makes it fire — be specific about when).
- **Agent** (`agents/*.md`): frontmatter `name`, `description`, and an explicit
  `tools:` allowlist. Read-only agents must not list `Edit`/`Write`.
- **Hook** (`hooks/*.sh`): pure POSIX-ish bash that runs on macOS bash 3.2 + BSD
  userland AND Linux. No GNU-only flags, no empty regex alternations. Wire it in
  BOTH `hooks/hooks.json` (plugin) and `install.sh` (mode A) — they must match.
  Add a test.
- **Integrity Check** (`scripts/checks/<family>.sh`): a `check_<id>()` function —
  `check_C24`, or `check_C24b` for a sub-check of an existing one. The harness
  (`scripts/validate-engineos.sh`) discovers it by name; nothing needs wiring.
  Add a planted-breakage case to `scripts/test-validate-engineos.sh` naming the
  same id — a Check with no negative case proves nothing.

## Verification (required before "done")

- `hooks/test-route.sh` — routing map assertions.
- `hooks/test-governance.sh` — change-governance marker flow.
- `shellcheck -S error hooks/*.sh install.sh scripts/*.sh scripts/checks/*.sh`.
- `jq empty` on every JSON file you touched.
- CI (`.github/workflows/ci.yml`) runs all of the above on every PR; keep it green.

## Security

- No secrets in the repo, ever. The installer's secrets gate (`install.sh`) blocks
  install if it finds any, and fails closed. If a secret ever lands in git or a
  shared file: rotate it immediately — removal is not enough. See `rules/security.md`.
- MCP config uses env-var references only (`templates/mcp.template.json`).

## Versioning

`.claude-plugin/plugin.json` holds the version. Bump it (semver) when behavior
changes; record notable changes in `CHANGELOG.md` (use the `release-notes` skill).
