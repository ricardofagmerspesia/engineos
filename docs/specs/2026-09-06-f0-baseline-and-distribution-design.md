# F0 — Baseline and reproducible distribution — design

Date: 2026-09-06
Status: draft, not reviewed
Risk: medium — every change here is reversible per PR (`git revert`), no sensitive
data is handled, but `.gitattributes`, the packaging allowlist and the installer's
secrets gate decide what every consumer receives. Autonomy ceiling A2: the profile
decision (§ "Deployment profiles") and the version bump are the owner's, not the
implementer's.
Related: `docs/plan/2.0/01-decomposicao-epicos.md` (E01, E02),
`docs/plan/2.0/02-sequenciamento.md` (waves F0.1–F0.7),
`docs/COMPATIBILITY.md`, `docs/adr/2026-09-04-typescript-runtime-over-bash.md`
ADR to write: `docs/adr/<date>-config-version-contract.md` (E01-T10),
`docs/adr/<date>-deployment-profiles.md` (E01-T3)

> Written in English to match `docs/specs/`; the 2.0 plan under `docs/plan/2.0/`
> stays in Portuguese, matching its source document.

## Problem

F0 has to make two things true before anything else in the 2.0 plan can start:
the repository has a canonical snapshot with a known identity, and that snapshot
can be turned into an artifact somebody else installs without help. Neither holds
today, and the gap is measurable rather than suspected.

### What was measured on 2026-09-06 (commit `fed9a63`)

| Measurement | Command | Result |
|---|---|---|
| Raw difference, working tree vs `HEAD` | `git diff --numstat HEAD` | **512 files** |
| Difference ignoring CR and whitespace | `git diff -w --ignore-cr-at-eol --numstat HEAD` | **0 files** |
| Integrity, working tree (Windows checkout) | `bash scripts/validate-engineos.sh` | **90 ok / 18 FAIL** |
| Integrity, copy of `git archive HEAD` | same, in a temp dir | **108 ok / 0 FAIL** |

Read together: there is **no semantic drift**. The whole 512-file delta is line
endings, and 18 integrity checks fail on a Windows checkout for a reason that has
nothing to do with the rules they check.

### Why the 18 fail

`.gitattributes` declares `eol=lf` for exactly two patterns:

```
*.sh text eol=lf
dist/engineos.cjs text eol=lf
```

Verified directly: `hooks/lib-common.sh` and `scripts/kernel.sh` are LF;
`rules/observability.md`, `rules/risk-autonomy.md` and `rules/llm-apps.md` are CRLF.
The prose-mirror checks (C26, C27, C28 and their neighbours) match section headings
in `rules/*.md` with grep. A trailing CR breaks the match, and the check reports
`observability.md-has-no-Agent-traces-section` — a missing section that is not
missing. Three of the four remaining FAIL families are exactly this shape.

The fourth family, `library-carries-the-executable-bit`, was observed through a
mount that presents every file as `-rwx`. That is an artifact of the observation,
not evidence about the checkout. It is **not** treated as a defect here; E02-T4
still has to verify file modes on the target platform.

### Four structural gaps in distribution

1. **There is no packaging step.** No `scripts/package.sh`, no release workflow.
   Whatever was distributed was assembled by hand from a working tree, which is
   how `console/.data/`, `console/.next/` and `node_modules/` travelled. Note that
   `console/.gitignore` already ignores `.data/` and `.next/`, and `git ls-files
   console/.data` is empty — **they were never tracked**. So the fix is not
   "untrack them"; it is "stop packaging from the working tree".

2. **CI never tests an artifact.** `.github/workflows/ci.yml` runs 27 steps against
   the *checkout* on `ubuntu-latest`. It is a strong suite — it already includes a
   `dist/engineos.cjs` drift guard and two secrets-gate tests — but no step
   extracts a package and installs from it, and no step runs on Windows or macOS.

3. **The installer behaves differently outside a git work tree.** `install.sh`
   lines 30-33 scan git-tracked files for secrets when `git rev-parse
   --is-inside-work-tree` succeeds, and fall back to `grep -rIlE` over the whole
   directory when it does not. An extracted ZIP is not a work tree, so **every
   consumer install takes the fallback path** — the one that walks any
   `node_modules/` the operator later creates beside it. Both CI secrets-gate tests
   run inside a git repo, so this path is untested.

4. **`jq` is a silent prerequisite.** `install.sh` registers hooks only when `jq`
   is present (line 231) and warns otherwise. Without it the router, the change-record
   Stop gate and the prompt advisor exit 0 quietly. A first-run check that reports
   "installed successfully" while the governance layer is inert is the installer's
   version of the same defect the 2.0 plan calls enforcement-announced-and-absent.

## Goals

1. A named canonical snapshot with a recorded identity: commit, artifact hash,
   package version, manifest version, and the classification of every difference
   from the working tree.
2. `.gitattributes` covering every format a parser reads, so
   `scripts/validate-engineos.sh` gives the same answer on Linux, macOS and Windows.
3. `scripts/package.sh` producing an artifact from `git archive <commit>` under an
   explicit allowlist, with a manifest and a checksum.
4. An end-to-end test that runs **on the bytes of the release**: extract → install
   in a clean environment → re-run idempotently → smoke task → remove → recover.
5. A platform matrix in CI covering Linux and Windows/Git Bash, plus macOS if it is
   declared supported.
6. Deployment profiles and a capability matrix, so the release says what it is and
   what it is not.
7. Product version and manifests agreeing, with `docs/COMPATIBILITY.md` updated.

## Non-goals

- Publishing 2.0. This design produces a release *candidate* process; the version
  bump happens in E01-T6 and the publication only after marco A.
- Rewriting `install.sh` or `install.ps1`. They stay shell and PowerShell
  (`2026-09-04-typescript-runtime-migration-design.md` non-goals). This design
  changes their preconditions, not their language.
- Removing the `jq` dependency. That is the TypeScript migration's job. Here `jq`
  becomes a **loud** prerequisite instead of a quiet one.
- Console, runner, tools registry, memory, RAG. All F1 and later.
- Hosting the console. The hosted profile stays declared unsupported.

## Decisions the owner has to take

These block the waves that consume them. None can be inferred from the code.

| # | Decision | Options | Blocks |
|---|---|---|---|
| D1 | Supported deployment profiles | local single-user · local team · hosted (declared unsupported) · distributed | E01-T3, everything downstream |
| D2 | Supported platforms | Linux + Windows/Git Bash · plus macOS | E02-T7, CI cost |
| D3 | Do editor adapter directories ship? | `.cursor/`, `.trae/`, `.windsurf/`, `.agents/` in or out of the artifact | E01-T8, allowlist |
| D4 | Does `.github/` ship? | in (transparency) · out (dev-only) | allowlist |
| D5 | Does `console/` ship in this release? | source only · not at all until F1 | allowlist, capability matrix |
| D6 | Version identity of 2.0 | product version vs registry schema versions, which move independently | E01-T6 |
| D7 | Are `jq` and `node >= 18` hard prerequisites? | abort install · warn and degrade | installer behaviour, §"Installer preconditions" |

D7 deserves a recommendation rather than a neutral menu: **abort**. The current
warn-and-continue path produces an install that looks complete and silently
enforces nothing, which is the failure mode this whole plan exists to remove.

## Architecture

### Canonical snapshot and identity

The snapshot is a commit, not a directory. Everything else derives from it.

```
scripts/snapshot-report.sh <commit> →
  {
    "commit":        "<sha>",
    "generated_at":  "<ISO 8601>",
    "package_version": "<from package.json>",
    "plugin_version":  "<from .claude-plugin/plugin.json>",
    "policy_version":  "<from registries/policy.json>",
    "worktree_delta": {
      "raw_files":       512,
      "semantic_files":  0,
      "eol_only_files":  512,
      "mode_only_files": 0
    },
    "integrity": { "checks": 108, "passed": 108, "failed": 0 }
  }
```

`semantic_files` uses `git diff -w --ignore-cr-at-eol`. The report is the evidence
artifact for E01-T1 and is attached to the readiness report.

### `.gitattributes`

The parser-facing formats are: shell (`*.sh`), JSON (`*.json`), JSONL (`*.jsonl`),
ESM scripts (`*.mjs`), and the rule prose the integrity checks grep (`*.md`).

```
# Every format a parser or an integrity check reads is LF, so a Windows checkout
# with core.autocrlf=true produces the same bytes — and the same
# scripts/validate-engineos.sh answer — as a Linux one.
*.sh   text eol=lf
*.md   text eol=lf
*.json text eol=lf
*.jsonl text eol=lf
*.mjs  text eol=lf
*.ts   text eol=lf
*.tsx  text eol=lf
dist/engineos.cjs text eol=lf
```

Applying this renormalises the working tree once (`git add --renormalize .`). That
commit is large and semantically empty; it lands alone, and the commit message says
so, because a reviewer who sees 512 changed files needs to know why in the first
line.

**Acceptance:** `bash scripts/validate-engineos.sh` reports 108/108 on a Windows
checkout with `core.autocrlf=true`, without normalising anything by hand.

### Packaging

```
scripts/package.sh <commit> [--out dist/release] →
  dist/release/engineos-<version>-<shortsha>.zip
  dist/release/engineos-<version>-<shortsha>.manifest.json
  dist/release/engineos-<version>-<shortsha>.sha256
```

Contract:

1. Content comes from `git archive <commit>` — **never** from the working tree.
   This is the single change that fixes the leaked-state class of defect.
2. The allowlist is applied to the archive, and a path in neither the allowlist
   nor the denylist is a **hard error**, not a silent include or exclude. New
   top-level directories must be classified deliberately.
3. The manifest is generated from the resulting bytes, not from the allowlist.
4. The checksum covers the final ZIP.

#### Allowlist

| Path | Ships | Why |
|---|---|---|
| `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`, `README.md`, `LICENSE` | yes | the constitution and entry points |
| `install.sh`, `install.ps1` | yes | the install path |
| `package.json`, `package-lock.json`, `tsconfig.json`, `skills-lock.json` | yes | reproducible dependency resolution |
| `.gitattributes` | yes | consumers who re-clone need the same normalisation |
| `.claude-plugin/` | yes | plugin manifests |
| `agents/`, `commands/`, `skills/`, `rules/`, `patterns/`, `templates/` | yes | the environment itself |
| `registries/` | yes | decision data |
| `hooks/`, `scripts/` | yes | runtime and checks |
| `dist/engineos.cjs` | yes | committed bundle, no build at install |
| `src/` | yes | the bundle's source; the drift guard is meaningless without it |
| `docs/` | yes | compatibility, adoption, release notes |
| `evals/` | yes | consumers run the deterministic tier |
| `console/` | **D5** | source only if it ships at all |
| `.cursor/`, `.trae/`, `.windsurf/`, `.agents/` | **D3** | classified by E01-T8 |
| `.github/` | **D4** | dev-only unless transparency wins |

#### Denylist — hard errors if present

| Path | Why it must never ship |
|---|---|
| `.git/` | history and remotes |
| `node_modules/`, `build/`, `console/node_modules/` | reinstallable, huge, platform-bound |
| `console/.next/`, `**/*.tsbuildinfo` | build cache |
| `console/.data/` | **operator's local draft, snapshot and history SQLite** |
| `.engineos/` | this repo's own change records and observation log |
| `.env`, `.env.*`, `*.local.json`, `*.pem`, `*.key` | secrets, already in `.gitignore` |
| `*.sqlite`, `*.sqlite-shm`, `*.sqlite-wal` | any local state, wherever it appears |

`git archive` already excludes ignored files, so the denylist is defence in depth
rather than the primary mechanism. It exists because the primary mechanism failed
once, and a check that only fires when something else is already broken is exactly
the check worth having.

#### Manifest

```jsonc
{
  "artifact": "engineos-2.0.0-fed9a63.zip",
  "sha256": "<hex>",
  "commit": "fed9a63...",
  "generated_at": "2026-09-06T00:00:00Z",
  "versions": { "package": "2.0.0", "plugin": "2.0.0", "policy": "1.6.0" },
  "profiles_supported": ["local-single-user"],
  "profiles_unsupported": ["hosted", "distributed"],
  "files": [ { "path": "install.sh", "bytes": 16056, "sha256": "<hex>", "mode": "100755" } ]
}
```

`profiles_unsupported` is in the manifest deliberately: the artifact carries its own
statement of what it does not do, so a consumer does not have to find it in a
document.

### File modes

`git archive` preserves the executable bit; ZIP preservation depends on the reader.
The design does not rely on it:

- `scripts/package.sh` records `mode` per file in the manifest.
- `install.sh` and `install.ps1` gain a bootstrap step that restores the executable
  bit for every file the manifest marks `100755`, before doing anything else.
- The bootstrap is idempotent and is exercised by the E2E test, which extracts with
  a reader that drops modes.

This makes E02-T4 verifiable rather than a hope about ZIP semantics.

### Installer preconditions

Two changes, both about making a silent state loud:

1. **Prerequisite gate.** `install.sh` checks `node >= 18`, `git`, and `jq` up
   front. Under D7=abort, a missing one stops the install with the reason and the
   remedy. It never proceeds into a partial install.
2. **Secrets gate outside a work tree.** The fallback branch at line 33 gets the
   same exclusions the tracked-files branch gets by construction: `.git`,
   `node_modules`, `build`, `.next`, `dist/release`. Today the fallback is what
   every real consumer hits, and it is the untested branch.

A third change is a consequence of the first: the installer's final summary states
which capabilities are active, and specifically whether hooks were registered. An
install that could not register hooks says so as a result, not as a warning scrolled
off the top.

### End-to-end artifact test

`scripts/test-package.sh` — runs against the built artifact, never the checkout.

| # | Step | Assertion |
|---|---|---|
| 1 | Verify checksum | `sha256` matches the `.sha256` file |
| 2 | Verify manifest | every file present, byte count and hash match; no path outside the allowlist |
| 3 | Extract to a clean dir with modes dropped | extraction succeeds |
| 4 | Run bootstrap | every `100755` file in the manifest is executable |
| 5 | Install with `HOME=$tmp` | exit 0; hooks registered; summary reports capabilities |
| 6 | Re-run install | exit 0; no duplicated entries in `settings.json`; `CLAUDE.md` import line count unchanged |
| 7 | Integrity | `bash scripts/validate-engineos.sh` → 108/108 |
| 8 | Deterministic evals | `bash scripts/run-evals.sh` → all pass, none skipped |
| 9 | Smoke task | `node dist/engineos.cjs kernel resolve-task ...` returns a well-formed `task_contract` |
| 10 | Prerequisite gate | with `jq` masked from `PATH`, install aborts (D7=abort) with a message naming `jq` |
| 11 | Secrets gate outside a work tree | a planted key in the **extracted** dir aborts the install |
| 12 | Remove | uninstall path leaves no `~/.claude` entry pointing at the extracted dir |
| 13 | Recover | re-install from the same artifact returns to the step-7 state |

Steps 10 and 11 are the ones that do not exist today in any form. Step 11 in
particular covers the branch every consumer takes and no test has ever run.

### CI changes

```yaml
jobs:
  verify:            # unchanged, ubuntu-latest, the existing 27 steps
  package:
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - run: bash scripts/package.sh "$GITHUB_SHA"
      - uses: actions/upload-artifact@v4
  artifact-test:
    needs: package
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]   # + macos-latest under D2
    steps:
      - uses: actions/download-artifact@v4
      - run: bash scripts/test-package.sh <artifact>
```

The separation matters: `verify` tests the source, `artifact-test` tests the
release. Only the second can catch a packaging defect, and only it runs on Windows —
where the CRLF and mode problems live.

### Deployment profiles and capability matrix

`docs/DEPLOYMENT-PROFILES.md` — one section per profile from D1, each carrying
population, expected load, criticality, and the nine operational gates from §8 of
the 2.0 plan with the numeric fields (SLO, RPO, RTO, retention, budget) **explicitly
pending**. A pending field blocks that profile's release, and only that profile's.

`docs/CAPABILITIES.md` — one row per announced capability:

| Capability | State | Implementation | Evidence | Profiles |
|---|---|---|---|---|
| Intent routing | implemented | `scripts/kernel.sh route-intent` | `scripts/test-kernel.sh`, `evals/intent-routing-cases.jsonl` | all |
| Risk/autonomy classification | implemented | `kernel.sh risk`, `registries/policy.json` | `scripts/test-kernel.sh` | all |
| Admission / breaker / HITL decision | **partial** | `kernel.sh admit/breaker/hitl` | decisions answered, **not wired to execution** | none |
| Console — skills vertical | **partial** | `console/src/lib/entities/skills.ts` | typecheck only | local, unreleased |
| Runner | planned | — | — | none |

The third and fourth rows are the point of the document. `state: partial` with
`profiles: none` is how a capability that exists as a decision but not as an
enforcement gets described without either hiding it or overclaiming it.

## Testing

| Layer | What | Where |
|---|---|---|
| Structural | `.gitattributes` coverage: every parser-read extension declared | new check in `scripts/checks/` |
| Structural | allowlist/denylist total: no unclassified path | `scripts/package.sh`, fails hard |
| Integrity | 108/108 on Linux **and** Windows checkout | CI matrix |
| Artifact | the 13 steps above | `scripts/test-package.sh` |
| Regression | planted CRLF in a `rules/*.md` fails the build | extends `scripts/test-validate-engineos.sh` |
| Regression | planted `console/.data/x.sqlite` fails packaging | `scripts/test-package.sh` |
| Regression | planted executable-bit loss fails step 4 | `scripts/test-package.sh` |

The three regression rows are the ones that make this design hold over time. Each
plants the defect deliberately and asserts the build turns red — a control with no
test that fails when the control is removed is not a control.

## Waves

Mapped to `docs/plan/2.0/02-sequenciamento.md`.

| Wave | Tasks | Deliverable | Barrier |
|---|---|---|---|
| F0.1 | E01-T1, E01-T2 | `scripts/snapshot-report.sh` + report | snapshot recorded |
| F0.2 | E01-T3 (D1, D2) | `docs/DEPLOYMENT-PROFILES.md` | **profiles decided** |
| F0.3 | E01-T4, E01-T8 (D3) | `docs/CAPABILITIES.md`, adapter matrix | capability matrix accepted |
| F0.4 | E02-T3, E02-T4 | `.gitattributes` + renormalise + mode bootstrap | **108/108 on Windows** |
| F0.5 | E01-T10, E01-T11, E02-T1, E02-T2 (D3–D5) | ADRs, `scripts/package.sh`, allowlist | **contracts accepted** — releases F1 |
| F0.6 | E01-T5, E01-T6 (D6), E01-T7, E02-T5, E02-T6 | PRD, versions, compatibility, manifest, scans | — |
| F0.7 | E02-T7, E02-T8, E02-T9, E02-T10, E01-T13 | CI matrix, `scripts/test-package.sh`, traceability | **F0 exit condition** |

F0.4 lands before F0.5 on purpose: packaging a tree whose line endings are still
platform-dependent produces an artifact whose hash depends on who built it.

Note on E02-T9 (source↔bundle sync): the `dist` drift guard **already exists** in
`ci.yml`. The remaining work is asserting it over the artifact's bytes in
`test-package.sh` step 2, not building it from scratch.

## Rollback and release

Every wave is a PR that reverts cleanly. Three carry a caveat:

- **F0.4 renormalisation.** Reverting restores CRLF and the 18 FAILs. It is safe
  but pointless; the forward fix is to correct `.gitattributes`, not to revert.
- **F0.6 version bump.** If the version has been published, the retreat is a new
  patch release, not a revert — `docs/COMPATIBILITY.md` forbids silent
  renaming, and a withdrawn version number stays withdrawn.
- **Deprecations in E01-T7.** Nothing is removed in the release that deprecates it,
  so an F0 deprecation has no rollback: the old surface still works.

Release: F0 produces a release **candidate**. Marco A requires F1 as well. The
artifact from F0.7 is what marco A validates; it is not published on its own.

## Open risks

| # | Risk | Why it survives this design |
|---|---|---|
| 1 | D1 (profiles) not decided | Every downstream document has a hole where the profile goes. This is the single decision that blocks the most work, and it is not a technical one |
| 2 | Numeric operational fields stay pending | The design makes them visible and blocking per profile; it cannot supply the values |
| 3 | Windows CI cost | The matrix roughly doubles CI minutes. The alternative is shipping to a platform no test covers |
| 4 | `jq` still required on the hook path | Out of scope here; D7 makes the dependency loud, the TypeScript migration removes it |
| 5 | Mode preservation across ZIP readers | Mitigated by the manifest + bootstrap, not by trusting the format. Step 4 tests the reader that drops modes; a reader that mangles them differently is untested |
| 6 | The capability matrix is only as honest as its author | `partial` rows are the ones that get quietly upgraded. E01-T13's traceability table is the mechanical check: a capability whose policy has no application point cannot be `implemented` |
