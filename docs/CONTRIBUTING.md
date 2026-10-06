# Contributing to EngineOS

EngineOS is a shared engineering environment. Everything here — rules, skills,
agents, hooks — is **code**: changed via PR, reviewed, merged, then pulled by the
team (`git pull && ./install.sh`). No Slack-announcement standards.

## Golden rule: one home per fact

Before adding anything, check `rules/memory.md` for where knowledge belongs. Do
not duplicate a rule across files — state it once, cross-reference it elsewhere.
Duplication drifts.

## Workflow for any change

1. Keep the active branch/PR for related work until user-directed change; follow
   `rules/git.md` for branch creation and git-write approval.
2. Open a `.engineos/changes/` record (`cp .engineos/changes/_template.md .engineos/changes/$(date +%F)-<slug>.md`,
   `status: active`). See `.engineos/changes/README.md`.
3. Freeze contracts, then use one supervisor and scoped parallel workers. The
   ≤400-line PR target is advisory; split only at the user's direction.
4. Verify (see below) and show the output in the PR description.
5. Close the record with the `record-change` skill (marks done, registers files +
   movements, moves `.engineos/changes/` → `.engineos/archived/`). Distil any lasting fact into
   `.engineos/memory/`.
6. PR with what + why + how-verified. Self-review the diff first.

## Adding each artifact type

- **Rule** (`rules/*.md`): keep it actionable and verifiable. Prefer DO/DON'T
  bullets with concrete examples. If it overlaps an existing rule, edit that file
  instead of adding a new one. If it introduces a new file-domain, add a domain
  to `registries/routing.json` (`match` globs, `precedence`, `rules`, `skills`,
  `agent`, the optional `hint`, `sample_path`) AND the mirroring router row to
  `CLAUDE.md`;
  `scripts/validate-engineos.sh` fails when the two disagree.
- **Skill** (`skills/<name>/SKILL.md`): frontmatter `name` + a trigger-rich
  `description` (the description is what makes it fire — be specific about when).
- **Agent** (`agents/*.md`): frontmatter `name`, `description`, and an explicit
  `tools:` allowlist. Read-only agents must not list `Edit`/`Write`.
- **Hook** (`src/hooks/*.ts`): implement the shared `HookDecision` contract and
  register in `src/hooks/cli.ts` and `hooks/hooks.json`; installers consume that
  wiring. Compatibility `hooks/*.sh` shims must run on macOS bash 3.2/BSD and
  Linux: no GNU-only flags or empty regex alternations.
  Prepare regression criteria; tests require final-stage approval.
- **Integrity Check** (`src/checks/<family>.ts`): a `Check` object — id from
  `src/checks/ids.ts` (`C24`, or `C24b` for a sub-check of an existing one), its
  finding codes declared via `declare module './codes'`, a `run(ctx)` returning
  `CheckResult[]` — appended to the family's `<FAMILY>_CHECKS` array, which
  `src/checks/index.ts` already spreads into `CHECKS`. Add a planted-breakage
  case to `src/checks/<family>.test.ts` asserting the finding code at the approved
  final test stage — a Check with no negative case proves nothing — and rebuild
  `dist/engineos.cjs` at final validation.

## Verification (required before "done")

Run final scoped lint/typecheck/build and inspect touched JSON/whitespace; show
actual output. Tests, evals, behavioral integrity and smoke checks are separate
final-stage actions requiring explicit current-task user approval
(`rules/verification.md`). `ENGINEOS_VERIFY_TESTS` is deprecated and grants none.
CI source/console validation runs automatically; the `approve_tests` manual
dispatch runs suites only after validation. Keep the PR green and report pending
tests honestly.

## Security

- No secrets in the repo, ever. The installer's secrets gate (`install.sh`) blocks
  install if it finds any, and fails closed. If a secret ever lands in git or a
  shared file: rotate it immediately — removal is not enough. See `rules/security.md`.
- MCP config uses env-var references only (`templates/mcp.template.json`).

## Versioning

`.claude-plugin/plugin.json` holds the version. Bump it (semver) when behavior
changes; record notable changes in `CHANGELOG.md` (use the `release-notes` skill).
