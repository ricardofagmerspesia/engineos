---
name: 2026-09-07-e01-baseline-e02-packaging
status: active
owner: Ricardo Fagmer
spec: n/a — direct execution of epics E01/E02 of the plan "EngineOS 2.0 — Production readiness plan" (2026-09-06, revision 2)
domain: devops
---

## What

Establishes the baseline of the canonical snapshot, normalizes the end of line of all tracked text, publishes the capability matrix with evidence and creates the first reproducible packaging path with a manifest, a checksum and verification over the final bytes of the release.

## Why

The production readiness plan pointed at three P0 problems that were confirmed in the inspection of the repository:

1. **End of line (item 3 of the analysis).** `.gitattributes` covered only `*.sh` and `dist/engineos.cjs`. Everything else was left with `eol` unspecified, so a Windows checkout converted 509 files to CRLF. Measured before the fix: `git diff --shortstat` = 512 files / 87,071 insertions; `git diff --ignore-cr-at-eol --shortstat` = 1 file / 222 insertions. In other words, 99.8% of the diff was noise, and no review could distinguish real work from a checkout artifact. The HEAD blobs were already in LF — the problem was exclusively one of checkout, not of committed content.
2. **Distribution artifact (item 2).** There was no packaging path at all: no script in `scripts/`, no target in `package.json`. The distributed ZIP was of the working tree, and so it carried dependencies, caches and local state.
3. **Divergent version and PRD (item 1).** `package.json`, `.claude-plugin/plugin.json` and `marketplace.json` are consistent at 1.6.0 — the real divergence is between the code and the PRD, still at "Draft v1" of 2026-06-11, whose *non-goals* contradict what the repository already does.

## Scope

- `.gitattributes` — end-of-line policy for every text format.
- 509 tracked files — working tree reconverted to LF (with no content change).
- `scripts/package-release.sh` — new.
- `.github/workflows/ci.yml` — new `package` job (ubuntu-latest, windows-latest).
- `.gitignore` — `dist-release/`.
- `docs/CAPABILITIES.md` — new.
- `docs/PRD.md` — out-of-date warning and pointer to the matrix.

## Checklist

- [x] Compare the working tree with HEAD, distinguishing semantic change from end of line
- [x] Set LF in the formats consumed by the parsers, preserving CRLF where the platform requires it
- [x] Generate the package from a commit by explicit allowlist
- [x] Generate the manifest and the checksum
- [x] Verify CRLF, execute bit, dependencies, caches, secrets and lockfiles over the final bytes
- [x] Test extraction → clean installation → validate → typecheck → tests
- [x] Publish the capability matrix with a state and evidence per capability
- [x] Record the divergences from the PRD
- [ ] Rewrite the scope of the PRD (decision of the product owner)
- [x] Compatibility map: supported platforms, prerequisites and the three enforcement points of the end-of-line policy
- [x] Record ADRs for the configuration contract, the approval policy and the service-separation criteria
- [x] Close the portability policy with checks (`C32` mirror parity, `C33` end of line)
- [ ] Consolidate release notes
- [ ] Pin SLO, RPO, RTO, retention and budget per deployment profile

## What was made

`.gitattributes` now declares `* text=auto eol=lf` with explicit exceptions: `*.ps1` in CRLF (Windows host, not consumed by a POSIX parser) and binaries marked as `binary`. The working tree was reconverted to LF in the 509 affected files; no blob changed hash.

`scripts/package-release.sh` packages from a **commit** via `git archive`, never from the working tree, using an explicit path allowlist. It verifies over the final bytes: absence of CRLF in the POSIX formats, coherent execute bit (executable scripts; libraries loaded with `source` without the bit), absence of `node_modules`, `.next`, `build`, databases, `.env`, keys and certificates, secret scan, presence of the lockfiles and of the installer entrypoints. It emits `MANIFEST.txt` with a sha256 per file and a `.zip.sha256` for the package. It refuses to package if `package.json` and `.claude-plugin/plugin.json` declare different versions.

The allowlist exposed a real dependency the plan had not foreseen: four checks of `validate-engineos.sh` read `.engineos/{README,archived/README,changes/README,changes/_template}.md`. Those files are a runtime asset, not development history, and they go into the package; the rest of `.engineos/` stays out.

The CI `package` job runs on ubuntu-latest and windows-latest and fails if the checkout diverges from HEAD — it is the automated CRLF/permission regression the plan demands, and it runs before anything else.

`docs/CAPABILITIES.md` classifies every capability as available, partial or planned, with implementation, evidence and the epic of the gap, plus the gates per deployment profile.

## Verification

Over the final bytes of `dist-release/engineos-1.6.0-99b5eec.zip` (344 files), extracted into a clean directory:

- `scripts/validate-engineos.sh` — **108 passed, 0 failed**
- `npm ci` from the lockfile — success
- `npm run typecheck` — clean
- `npm test` — **24/24**
- `sha256` of the package: `a462fd2bad55b6c29566125cc4d638904a13bc96ee7acd00018d00e11fbc1d57`

Declared limitations, not converted into success:

- `install.sh` was **not** executed: it writes to `~/.claude` and requires an isolated environment. Only the syntax was verified (`bash -n`).
- macOS was not tested and is not declared supported.
- The CI platform matrix has not had a real run recorded yet — the `package` job was added in this change.
- The secret scan found nothing, which is not proof of the absence of a secret.
- No live eval was run; the "Evals" column of the matrix stays **partial** because of that.
- In the working tree on Windows, `validate-engineos.sh` reports 107/1: the four `hooks/lib-*.sh` libraries, `layout-manifest.sh` and `scaffold-layout.sh` show up with the execute bit because the mounted filesystem reports every file as executable. In git they are `100644` and they come out correct in the package — which is why the artifact passes where the working tree fails. It is a platform artifact, not a defect.

## Human decisions

<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
2026-09-07 | Ricardo Fagmer | execution scope | approved | Chose to execute E01-a (EOL normalization), E01-b (baseline and PRD) and E02 (release script) in this session, among the options presented.
2026-09-07 | Ricardo Fagmer | write permission | approved | Authorized deleting files in the project folder so that git could write the index (an orphan `.git/index.lock` from 2026-09-06 was preventing any commit).

## Changes registered

```
git log --oneline fed9a63..HEAD
  99b5eec chore(e01): normalizar fim de linha para todo texto rastreado
  d82245c feat(e02): empacotamento reproduzivel com manifesto, checksum e matriz de CI
```

Pending commit in this change: `docs/CAPABILITIES.md`, `docs/PRD.md`, this record.

Out of scope, left untouched in the working tree: `skills-lock.json` (+222 lines, the only pre-existing semantic change) and ~20 untracked skills in `.agents/skills/`, `.trae/`, `.windsurf/` — scope decision pending.

## Second unit — closing E01 (same session)

`scripts/checks/80-portability.sh` adds two checks. `C32` asserts that `.agents/skills`, `.trae/skills` and `.windsurf/skills` are byte-for-byte identical — they were, but nothing guaranteed it; now a commit that edits one mirror and forgets the others fails. `C33` audits 571 tracked POSIX text files and is the regression that stops the end-of-line policy from coming loose again. Both use the git index as the source when there is a repository and the tree when there is not, so that they also run over the extracted package.

`C33` found, on the first run, `.claude/worktrees/` — two `prunable` agent worktrees, 3.4 MB, inside the repository, untracked and **not ignored**. It is the concrete evidence of item 2 of the analysis ("the ZIP includes a worktree and state"). `git archive` already excluded them because they were untracked, so the artifact was never compromised; `.gitignore` now covers `.claude/worktrees/` and `.claude/settings.local.json` so that they also do not dirty `git status` nor get committed by oversight.

`docs/COMPATIBILITY.md` gained the platform matrix (Linux and Windows/Git Bash supported; macOS not; `install.ps1` partial), the prerequisites with what happens in the absence of each one — in particular: **without `jq`, the hooks are not registered and the installation has rules, not gates** — and the table of the three enforcement points of the end-of-line policy.

Four ADRs. `release-from-commit-with-allowlist` (accepted) records the E02 decision with the `export-ignore` denylist as the rejected alternative. `versioned-config-contract`, `approval-bound-to-effect` and `when-to-split-a-service` stay in **proposed**: they describe E03/E04/E09 contracts that are not implemented yet, and while they stay in that state the corresponding behavior cannot be announced.

One design choice worth recording: `C32` audits what is versioned, not the whole tree. In its first version it audited the filesystem and reported 200 divergences — the ~100 untracked skills in `.agents/skills/`, which exist only there. That is a pending scope decision, not a synchronization defect; a check that stays red because of work in progress teaches people to ignore checks.

Verification of this unit: `validate-engineos.sh` **109 passed, 1 failed** in the working tree — the failure is the platform artifact already described (execute bit of the four libraries on a Windows filesystem).

## Notes

- The order mattered: without the EOL normalization, none of the other verifications would have had signal. A repository that reports 512 modified files does not allow anything to be reviewed.
- The packager refuses divergent versions between `package.json` and `plugin.json` by construction. When 2.0 is published, the two have to go up together — the gate already exists.
- Next unit, as per the plan: close E01 with the ADRs and the compatibility map, then E03 (sound console) and the E04/E10 contracts.
