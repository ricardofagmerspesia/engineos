# Hook hardening: consent gate, allowlist, path slugs, CI

**Date:** 2026-09-08
**Status:** approved (owner picked every unit in-session)
**Risk:** medium — reversible with a revert plus `npm run build`; blast radius is
every install because the Stop gate stops firing on non-adopted repos.
**Source:** security-reviewer AUDIT pass over hooks, kernel, installers and CI on
2026-09-08 (two HIGH, four LOW findings).

## Problem

1. `src/hooks/stop-verify.ts` runs `npm run lint|typecheck` from whatever
   `package.json` sits nearest above an edited file. Hooks run outside the
   tool-permission system, so a repository can ship `"typecheck": "<payload>"` and
   have it execute on Stop with no prompt. Reproduced in a sandbox.
2. `templates/permissions.template.json` adds `Bash(find:*)`, `Bash(rg:*)`,
   `Bash(npm run typecheck:*)`, `Bash(npm run lint:*)` and `Bash(npx tsc --noEmit:*)`
   to the user's global allowlist. `find -exec`, `rg --pre` and `npm run` are
   arbitrary execution; the file's own comment forbids exactly that.
3. `mark-unrecorded.ts` and `record-verify.ts` concatenate the raw `session_id`
   into a `.git/` path. Contained only by the constant filename prefix;
   `span-writer.ts` narrows the same field with `hookPathSlug`.
4. `announce-agent-dispatch.ts` re-injects the raw, unbounded `description` into
   PreToolUse context, laundering model output into hook-supplied context.
5. CI: no `permissions:` block, actions pinned by mutable tag, no `npm audit`,
   no Dependabot.
6. The reviewer's hardening checklist has no item that would have caught 1 or 2.

## Decision

Fix all six in one change, one wave, four disjoint units. Rejected alternative:
fix only the template (four deletions) and record the Stop-hook execution as a
known risk. Rejected because the two findings compound — the hook runs repo code
without a prompt, and the allowlist removes the prompt from the same class of
commands — and the hook fix is one guard clause.

## Frozen contracts

### Unit A — Stop gate consent (`src/hooks/stop-verify.ts` + its two test files)

- After `root` resolves and before `changedFiles` is read:
  `if (!isDirectory(join(root, '.engineos'))) return silent;` — `isDirectory` on purpose: a
  plain file named `.engineos` is not adoption (stricter than the telemetry sink's
  `existsSync`, by that one case)
- The marker is `.engineos/` at the WORKING TREE root, the same predicate
  `src/hooks/telemetry.ts` uses for the telemetry sink. No env override: adoption
  is the `.engineos/` directory, as `ensure-project-layout.ts` already defines it.
- Comment must say WHY: hooks bypass the tool-permission prompt, so a repo that
  has not adopted EngineOS must never have its scripts executed by this gate.
- Existing tests: fixtures mostly carry `.engineos/.keep`; the one test that asserted
  a `block` on a non-adopted repo flips to `silent` (that IS the removed behaviour).
  Add one unit test: a fixture repo WITHOUT `.engineos/` and a red `typecheck` script
  returns `silent` and spawns nothing.

### Unit B — path slug + banner bound (`mark-unrecorded.ts`, `record-verify.ts`, `announce-agent-dispatch.ts` + their tests)

- Both marker sites derive the name identically:
  `const sid = hookPathSlug(env.sessionId); if (sid === null) return silent;`
  then `` `${dir}/${UNRECORDED_MARKER_PREFIX}${sid}` ``. Writer and reader MUST
  agree byte for byte or the record gate silently stops firing.
- `dispatchBanner` receives already-bounded strings. New helper in
  `announce-agent-dispatch.ts`:
  `bannerField(value: string, max: number): string` — replaces every character
  matching `/[\u0000-\u001f\u007f`]/g` (control characters and backtick) with a space, collapses runs of
  whitespace to one space, trims, truncates to `max` and appends `...` when cut.
  `subagent_type` bound 64, `description` bound 160. Constants named
  `MAX_TYPE_CHARS`, `MAX_DESCRIPTION_CHARS`.
- `spanIdFrom` in `telemetry.ts` keeps hashing the RAW description. Do not touch
  it: the span id must match what `announce-agent-return.ts` computes.
- Tests: traversal-shaped session id writes nothing; a 2 KB description with a
  newline and a backtick yields a single-line banner of bounded length.

### Unit C — CI hardening (`.github/workflows/ci.yml`, `.github/workflows/live-evals.yml`, new `.github/dependabot.yml`)

- Both workflows: top-level `permissions:\n  contents: read`.
- `actions/checkout` and `actions/setup-node`: pin to the full 40-char commit SHA
  of the current v4 release, with a trailing `# vX.Y.Z` comment. Resolve SHAs
  with `gh api` or `git ls-remote`; if the network is unavailable, return
  `BLOCKED` with the exact commands to run — never guess a SHA.
- `ci.yml`: new step `Dependency audit` right after `npm ci`, running
  `npm audit --audit-level=high`.
- `dependabot.yml`: `npm` at `/` weekly, `github-actions` at `/` weekly.
- Nothing else in either workflow changes.

### Unit D — allowlist, checklist, docs (`templates/permissions.template.json`, `agents/security-reviewer.md`, `README.md`, `docs/COMPATIBILITY.md`, `docs/CODEBASE_MAP.md`)

- Template: delete the five entries named in Problem 2. Keep the rest and the
  `$comment` verbatim. Valid JSON.
- Checklist (`## Hardening checklist`, body only, frontmatter untouched):
  - Reword item 1 to add: "for a locally installed tool the environment is an
    input, not a trust boundary — paths, interpreters and roots read from env
    vars are validated like any other input".
  - Append two items:
    "No code path executes workspace-controlled content (scripts, config, hooks,
    plugins) outside the host's consent or permission gate"
    "The installer does not weaken the host's security settings (permission
    allowlists, trust prompts, sandbox flags) without showing the change and
    asking".
- README row for `hooks/stop-verify.sh`: add "runs only in projects that carry
  `.engineos/`".
- `docs/CODEBASE_MAP.md`: Stop-gate description and Gotchas gain the same
  opt-in sentence; the permissions template mention loses any reference to the
  removed entries if one exists.
- `docs/COMPATIBILITY.md`: new `## Unreleased` section as the LAST section, after
  `## 1.7.0 additions` (sections run ascending), table in the same shape, rows: `hooks/stop-verify.sh` behaviour narrowed to
  adopted projects (tightened); `templates/permissions.template.json` five
  entries removed (tightened, installer re-run does not remove already-merged
  entries — consumers prune by hand).

## Out of scope

`console/`, `ENGINEOS_ROOT` / `NVM_DIR` trust, esbuild major upgrade, removing
already-merged allowlist entries from existing installs (documented, not automated).

## Verification

Final gate once, after the wave: `npm run build` (dist drift), gen-agent scripts
drift check, `node dist/engineos.cjs validate`, `npm test`.
