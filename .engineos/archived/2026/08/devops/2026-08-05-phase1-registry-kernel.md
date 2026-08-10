---
name: 2026-08-05-phase1-registry-kernel
status: done
completed: 2026-08-05
owner: Ricardo Fagmer
spec: docs/specs/2026-08-05-phase1-registry-kernel-design.md
domain: devops
---

## What
Add the Phase 1 registry-kernel: `registries/capabilities.json` (workflow-capability
-> agent binding), `registries/agents.json` + its generator (machine-readable mirror
of `agents/*.md` frontmatter), and `scripts/exec-journal.sh` (an append/read CLI over
one JSONL run-record schema). None of this existed despite a downstream spec (the
ai-se-os Phase 2 spec) assuming it had already shipped at version 1.5.0.

## Why
The ai-se-os headless runner (a separate repo) is built to consume EngineOS as a
pinned dependency: it resolves workflow states to agents through "the capability
registry," reads "the generated agent registry," and journals runs in "the Phase 1
exec-journal schema." Discovered mid-session (T8, engineer-spec-ia-pattern#15) that
none of the three existed — the referenced design doc, capability registry, and
version tag were never actually built. This closes that gap before T8 tries to bind
into a registry entry that isn't there.

## Scope
`registries/capabilities.json`, `registries/agents.json`, `scripts/gen-agent-registry.sh`,
`scripts/exec-journal.sh`, `scripts/test-exec-journal.sh`, `scripts/test-gen-agent-registry.sh`,
`scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh`, `.github/workflows/ci.yml`,
`hooks/lib-common.sh`, `hooks/gen-agent-commands.sh`, `.claude-plugin/plugin.json`,
`.claude-plugin/marketplace.json`, `docs/specs/2026-08-05-phase1-registry-kernel-design.md`.

## Checklist
- [x] Design spec written (`docs/specs/2026-08-05-phase1-registry-kernel-design.md`)
- [x] `registries/capabilities.json` — 4 entries (author-spec, implement, validate, document)
- [x] `registries/agents.json` + `scripts/gen-agent-registry.sh`, with a CI drift guard
- [x] `scripts/exec-journal.sh` — append/validate CLI, schema matches the spec exactly
- [x] `scripts/validate-engineos.sh` — agent-exists + valid-tier checks for both new registries
- [x] `scripts/test-validate-engineos.sh` — planted-breakage case per new check
- [x] Version bump 1.3.0 -> 1.4.0 (`.claude-plugin/plugin.json`, `marketplace.json`)
- [x] Parallel Standards + Spec review dispatched; every real finding fixed before archiving
- [x] Fixed a pre-existing shellcheck failure (SC2148 on `hooks/lib-common.sh`) that was
      making this branch's CI fail regardless of this change

## What was made
Two commits. `ffe56af` added the three registries/scripts, the validate-engineos.sh
checks, CI wiring, the version bump, and the lib-common.sh shellcheck fix, verified
against a full local rehearsal of the CI job (shellcheck, drift guards, integrity
check, 20 negative tests, 7 exec-journal tests, plus the untouched hook/eval suites)
before committing.

A parallel Standards-axis review then found five real bugs in that commit, all
reproduced before fixing: `exec-journal.sh` crashed on a flag given with no value
(unbound-variable error instead of usage()); `--agent`/`--note` were hand-quoted into
a JSON literal and passed via `--argjson`, so a value containing a `"` broke the
command and a value containing a backslash escape (`foo\bar`) was silently
reinterpreted as an escape sequence, corrupting the stored data with no error;
`tokens_in`/`tokens_out`/`duration_ms` were documented as non-negative integers but
never actually checked (negative and fractional values were accepted); `validate`
silently dropped the final line of a file with no trailing newline; and
`frontmatter_value` (in the new `gen-agent-registry.sh`, and the same latent bug in
the pre-existing `gen-agent-commands.sh`) died under `set -e` + `pipefail` whenever
`grep` found zero matches for a genuinely absent field, before the caller's own
empty-string guard could ever run — plus two related parsing gaps (no space after
the field's colon; a trailing comma producing a spurious empty tools entry). A Spec
review separately found one real deviation: `capabilities.json` claimed `model_tier`
values were "one of rules/models.md's four tier names," but that file's own table
cell reads "most capable" (two words) while the registry used the hyphenated slug
"most-capable" — fixed by stating the slug relationship precisely rather than
claiming exact string equality (a literal space would have broken the shell
word-split comparison in `exec-journal.sh`'s tier validation).

All six fixes were committed as `0b3b34f`, each proven by a targeted repro before
the fix and a new regression test after (`test-exec-journal.sh` grew from 7 to 14
cases; new `scripts/test-gen-agent-registry.sh` added, 3 cases covering the
frontmatter edge cases no real `agents/*.md` file happens to exercise).

## Verification
- `shellcheck -S error scripts/*.sh hooks/*.sh install.sh` — clean, both before and
  after the fix commit.
- `bash scripts/validate-engineos.sh` — 27 passed, 0 failed (both commits).
- `bash scripts/test-validate-engineos.sh` — 20 passed, 0 failed (up from 16 before
  this change; 4 new planted-breakage cases for the two new registries).
- `bash scripts/test-exec-journal.sh` — 14 passed, 0 failed (grew from 7 after the
  Standards-review fixes).
- `bash scripts/test-gen-agent-registry.sh` — 3 passed, 0 failed (new file).
- Agent-commands and agent-registry drift guards — both clean, re-run against the
  real repo state.
- Full remaining hook/eval suite (`hooks/test-route.sh`, `test-gate-advisor.sh`,
  `test-governance.sh`, `test-task-scale.sh`, `test-layout.sh`, `test-verify.sh`,
  `scripts/run-evals.sh`) — unchanged, all passing, no live model calls made.

## Notes
Discovered via [[rtk-git-stale-output]] mid-investigation: `rtk`'s git wrapper
reported a stale HEAD three commits behind the real one, which is what surfaced
this gap in the first place (checking whether "Phase 1" had already shipped).
Filesystem reads (grep/ls/Read) are unaffected by that wrapper bug and were the
actual source of truth throughout.
