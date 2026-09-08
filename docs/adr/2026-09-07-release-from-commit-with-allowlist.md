# Package the release from a commit, by explicit allowlist

Date: 2026-09-07
Status: accepted

Source: "EngineOS 2.0 — Production readiness plan" (2026-09-06, rev. 2), epic E02; baseline in `.engineos/changes/2026-09-07-e01-baseline-e02-packaging.md`.

## Context

Until 2026-09-07 the repository had no packaging path: no script in `scripts/`, no target in `package.json`. The distributed artifact was a ZIP of the working tree, and it therefore carried reinstallable dependencies, caches, local console data and development state — including, as the inspection confirmed, two 3.4 MB agent worktrees in `.claude/worktrees/`, which were not even in `.gitignore`.

An artifact derived from the working tree has two bad properties that reinforce each other: it varies with the machine of whoever packages it, and it contains things nobody decided to publish. The second is the more serious one — that is how local state leaves someone's machine.

## Options considered

1. **`git archive` of a commit, with an explicit path allowlist** (chosen).
   - Pros: the artifact is a function of a commit, not of a directory — two packaging runs of the same commit produce the same content; an untracked file is invisible by construction, so caches, `node_modules`, `.env` and worktrees cannot get in even by oversight; the allowlist is readable on one screen and reviewable in a PR — the question "why is this path in the release?" has a versioned answer.
   - Cons: a new path has to be added by hand, and forgetting to do so produces an incomplete package. That is exactly what happened on the first run: four checks read `.engineos/{README,archived/README,changes/README,changes/_template}.md` and the package came out with 108→102 checks. The cost is real, but the failure mode is noisy and caught by the smoke test — unlike the opposite failure mode.

2. **`export-ignore` in `.gitattributes` (denylist)** (rejected).
   - Pros: no new file needs to be declared; `git archive` already honors the attribute.
   - Cons: it inverts the burden of proof. A new directory enters the release by default, and somebody only finds out afterwards. The question that matters in a distribution audit is not "what did I mean to exclude?", it is "why is this here?" — and the denylist does not answer it. `export-ignore` is kept as an additional resource, never as the main mechanism.

3. **ZIP of the working tree with exclusions by name pattern** (rejected — it is the previous state).
   - Pros: no work.
   - Cons: the content depends on the machine; the exclusion list never keeps up with what appears in the directory; it is what produced the artifact with dependencies and worktrees inside.

## Decision

Option 1. `scripts/package-release.sh` packages from a commit (`HEAD` by default, `--commit` for another) via `git archive`, using an explicit allowlist, and refuses to package if `package.json` and `.claude-plugin/plugin.json` declare different versions.

Two consequences follow from that and are part of the decision, not an implementation detail:

- **The test runs over the final bytes.** Extract the ZIP, run `validate-engineos.sh`, `npm ci`, typecheck and tests inside it. Testing the working tree and publishing the ZIP are two different things; only the first gives evidence about the second if they are the same content, and that needs to be demonstrated, not presumed.
- **The packager verifies what it produced itself**: absence of CRLF in the POSIX formats, coherent execute bit, absence of dependencies and local state, secret scan, lockfiles and entrypoints. It emits `MANIFEST.txt` with a sha256 per file and a `.sha256` for the package.

## Consequences

- Every new path the release needs goes into the allowlist of `scripts/package-release.sh`, with the artifact smoke test as the net.
- The authoritative execute bit is the one in the git index, not the one in the filesystem: on Windows with `core.fileMode=false`, a local `chmod +x` never reaches the package. The packager's verification rejected exactly that case in the very commit that introduced it (`d20b43f`), which is the evidence that it works.
- The secret scan over the artifact finding nothing is **not** proof of the absence of a secret, and must not be cited as such in a readiness report.
- The adapter mirrors (`.agents/`, `.trae/`, `.windsurf/`, `.cursor/`) stay out by default and go in with `--with-ide-mirrors`, because they are the surface of another tool and not of the runtime.
