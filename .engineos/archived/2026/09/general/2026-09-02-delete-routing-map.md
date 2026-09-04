---
name: 2026-09-02-delete-routing-map
status: done
owner: Ricardo Fagmer
spec: docs/specs/2026-09-02-deepen-runtime-modules-design.md
domain: general
completed: 2026-09-02
---

## What
Deleted `hooks/routing-map.sh` — a compatibility shim with no runtime caller — and
moved the EngineOS self-exclusion (this checkout's own `hooks/` and `docs/` trees
get no routing and no change-record flag) out of three hand-synced code copies into
`registries/routing.json` `.excluded.self_dirs`, resolved by `scripts/kernel.sh
route-path` against its own root.

## Why
Three separate defects converged on one file:

1. **No runtime caller.** `hooks/route-before-change.sh` has called
   `scripts/kernel.sh route-path` directly since P2. The shim's only consumer was
   `hooks/test-route.sh`, which sourced it to unit-test `route_excluded` — a test
   of a wrapper nothing else used.
2. **Vacuous checks.** `hooks/test-docs.sh` family 2 ("hook <-> table parity")
   grepped the shim for `agent:` and `rules/*.md` literals. The shim contains none,
   and validator C17d *asserted* it must contain none, so both loops iterated an
   empty set and passed unconditionally. Two green checks defending nothing.
3. **Three hand-synced copies.** The self-exclusion list lived in
   `scripts/kernel.sh` cmd_route_path, in `hooks/mark-unrecorded.sh` (whose comment
   read "Kept in sync with routing-map.sh"), and as a decision note in
   `registries/routing.json` recording that it should stay code. The owner reversed
   that decision: the runtime-relative concern is met by a root-relative list the
   kernel resolves, and hand-syncing was the price of keeping it code.

Meanwhile the docs still told contributors to add routing patterns to the shim.

## Scope
- Deleted: `hooks/routing-map.sh`
- Registry: `registries/routing.json` (`.excluded.self_dirs` added, `.note` and
  `.description` rewritten)
- Runtime: `scripts/kernel.sh`, `hooks/mark-unrecorded.sh`
- Suites: `hooks/test-route.sh`, `hooks/test-docs.sh`, `scripts/test-kernel.sh`,
  `scripts/validate-engineos.sh`, `scripts/test-validate-engineos.sh`
- Prose: `CLAUDE.md`, `README.md`, `docs/CONTRIBUTING.md`,
  `templates/adapters/cursor.md`, `templates/adapters/claude-code.md`,
  `hooks/docs-ledger.sh`, `console/src/app/api/publish/route.ts`

## Checklist
- [x] Delete `hooks/routing-map.sh`
- [x] Re-point `hooks/test-route.sh` exclusion cases at the kernel's JSON contract
      (`.excluded == true`), covering the shim's old paths plus an EngineOS-self
      `hooks/` path and a consumer-project `hooks/x.ts` that must NOT be excluded
- [x] Delete the `hooks/test-docs.sh` family-2 loops and its family header
- [x] Delete validator C17d and its negative case in `scripts/test-validate-engineos.sh`
- [x] Add `.excluded.self_dirs` to `registries/routing.json`; rewrite `.note`
- [x] `scripts/kernel.sh` cmd_route_path reads `self_dirs`, resolves against `$ROOT`
- [x] `hooks/mark-unrecorded.sh` reads `self_dirs` from the registry
- [x] `scripts/test-kernel.sh` proves the exclusion is data, not code
- [x] Extend validator C17c with the `self_dirs` assertions
- [x] Reword the kernel comments naming the deleted advisor hooks
- [x] Resolve the `engineos_bypass_active_for_payload` keep-or-delete question
- [x] Fix every live reference to `routing-map`
- [x] Verification sweep, once, at the end

## What was made
**Shim deleted.** `hooks/routing-map.sh` (30 lines) is gone.

**Self-exclusion is registry data.** `registries/routing.json` `.excluded` gained
`"self_dirs": ["hooks", "docs"]` — root-relative directories of the EngineOS
checkout itself. The key is additive; no existing key was renamed or removed
(registry top-level shape is public surface per `docs/COMPATIBILITY.md`).
`.excluded.note` now describes the list instead of recording the retired decision
to keep it in code.

`scripts/kernel.sh` cmd_route_path resolves each entry as `"$ROOT/<dir>"/*`, where
`ROOT` is derived from the script's own `BASH_SOURCE` location — so the list is data
and only its resolution is code, which is what keeps a consumer project's own
`src/hooks/` or product `docs/` routable. First-exclusion-wins order is preserved:
`self_dirs`, then `.excluded.paths`, then `.excluded.basenames`.

The three exclusion reads were folded into ONE `jq` pass emitting `type<TAB>pattern`
rows. That is a net reduction from the two `jq` spawns the function had before this
change, not just a break-even for the new list — a naive third spawn had pushed
`prompt-advisor (end to end)` and `route-before-change (cache hit)` over their
`scripts/bench-runtime.sh` budgets, and the single pass put both back under, faster
than the pre-change baseline.

`hooks/mark-unrecorded.sh` reads the same `self_dirs` list against its own checkout
root (`$DIR/..`), replacing two hardcoded directory variables and a `case` arm. The
read sits after the file-type and `.engineos/` filters so the `jq` spawn only happens
for candidate code edits. Behaviour is identical for `hooks/` and `docs/`, and a
consumer project's own `src/hooks/` or `docs/` still gets flagged — the comment that
explains why now points at the registry rather than at the deleted shim.

**Tests re-pointed at the real contract.** `hooks/test-route.sh` asserts
`.excluded == true` in `kernel.sh route-path` output instead of sourcing a wrapper,
so it tests the shipped resolver. Coverage is a superset of the deleted cases: it
adds a consumer-project bare `hooks/x.ts` (must route) alongside the existing
`src/hooks/` case.

`scripts/test-kernel.sh` gained the assertions that prove the list is DATA. No
`REG` env override was needed: the kernel derives `ROOT`/`REG` from its own
location, so a copy of `kernel.sh` beside a modified `registries/` answers against
that data. It runs as a MATCHED PAIR — one relocated copy with `self_dirs` intact
(must exclude its own `hooks/`), one with the key deleted (must not). The `with`
control is load-bearing: alone, the `without` half's `false` could equally mean the
relocated root never matched anything, and the sub-case would pass vacuously. The
first draft did exactly that, because `mktemp -d` hands back a symlinked path on
macOS (`/var` -> `/private/var`) while the kernel's `$ROOT` is the resolved one;
`pwd -P` and the control both went in.

**Vacuous checks removed.** `hooks/test-docs.sh` family 2 and its header are gone;
the header comment records why, and families 3 and 4 keep their numbers. Validator
C17d is deleted along with the now-unused `map=` variable. C17c absorbed the
capability that actually matters: it now asserts the EngineOS-self `hooks/` tree IS
excluded and a foreign `hooks/` tree is NOT, so the exclusion has a real defender
for the first time.

## Verification
Run once, at the end. All green:

```
shellcheck -S error hooks/*.sh scripts/*.sh   rc=0 (also clean at -S warning)
bash hooks/test-route.sh                      pass=41  fail=0
bash hooks/test-docs.sh                       pass=190 fail=0
bash hooks/test-bypass.sh                     pass=27  fail=0
bash hooks/test-governance.sh                 pass=15  fail=0
bash scripts/test-kernel.sh                   passed 202, failed 0
bash scripts/validate-engineos.sh             passed 88,  failed 0
bash scripts/test-validate-engineos.sh        passed 79,  failed 0
bash scripts/bench-runtime.sh                 5 budgets ok
```

The new assertions were mutation-checked, not just run green: deleting
`.excluded.self_dirs` from `registries/routing.json` turns `scripts/test-kernel.sh`
red on 3 assertions, `hooks/test-route.sh` red on 2, and validator C17c red — so
the exclusion now has defenders that actually fail when it breaks. The old
family-2 loops and C17d could not do that; they passed over an empty set.

`bench-runtime.sh` after the single-pass fix, against the pre-change baseline:

| Budget | Baseline | After |
|---|---|---|
| route-intent | 47.6ms | 43.2ms |
| resolve-task | 189.7ms | 168.1ms |
| prompt-advisor (end to end) | 397.2ms | 413.6ms |
| route-before-change (cache hit) | 102.3ms | 110.7ms |

(Medians vary run to run on a loaded machine; every budget cleared on every run
after the single-pass fix, and the naive-third-spawn version cleared none of the
last two.)

## Changes registered

`git diff --stat HEAD~1` on `refactor/delete-routing-map`, for this change's single commit:

```
 .engineos/changes/2026-09-02-delete-routing-map.md | 206 +++++++++++++++++++++
 CLAUDE.md                                          |   6 +-
 README.md                                          |   8 +-
 console/src/app/api/publish/route.ts               |   4 +-
 docs/CONTRIBUTING.md                               |   6 +-
 hooks/docs-ledger.sh                               |   4 +-
 hooks/mark-unrecorded.sh                           |  25 ++-
 hooks/routing-map.sh                               |  30 ---
 hooks/test-docs.sh                                 |  18 +-
 hooks/test-route.sh                                |  31 ++--
 registries/routing.json                            |   8 +-
 scripts/kernel.sh                                  |  55 +++---
 scripts/test-kernel.sh                             |  39 ++++
 scripts/test-validate-engineos.sh                  |  16 +-
 scripts/validate-engineos.sh                       |  47 +++--
 templates/adapters/claude-code.md                  |   3 +-
 templates/adapters/cursor.md                       |   2 +-
 17 files changed, 371 insertions(+), 137 deletions(-)
```

Movements: `hooks/routing-map.sh` deleted (`git rm`); no renames.

**Size against the 400-line PR cap (`rules/git.md`):**

| Count | Added | Deleted | Total |
|---|---|---|---|
| Raw (with this record) | 371 | 137 | 508 |
| Excluding this record | 165 | 137 | 302 |

302 excluding the record — under the cap. The record itself is documentation of
the change, not reviewable surface, which is the split the two rows make explicit.
Even the raw 508 is dominated by deletion and by this file: the spec's PR3 row
names deletion as the called-out exception, and the net additive runtime surface is
one registry key plus its resolution.

The two figures were measured after the commit; the record's own row in the stat
above predates this section being rewritten, so it is a few lines short. The code
rows are exact.

## Notes
Three judgement calls the brief left open:

- **Validator C23c kept.** It greps `CLAUDE.md` for "authoritative for file-pattern
  routing" and fails if the phrase returns. That guard is still meaningful with the
  shim deleted — the registry is the canonical map, and the check stops CLAUDE.md
  prose from crowning anything else (a hook, a future shim) in its place. Its
  message text is unchanged on purpose: `group_for` in
  `scripts/test-validate-engineos.sh` keys on `*"retired routing-map"*` to map the
  failure back to C23, and rewording it would silently fall through to running
  every check. Its negative case was re-pointed, since the sentence it used to
  mutate is the one this change removed; it now injects the forbidden phrase into
  the surviving canonical-map sentence.
- **`engineos_bypass_active_for_payload` kept.** The brief expected it orphaned
  after the advisor hooks were deleted, but `hooks/post-edit-check.sh:22` still
  calls it. Not dead code; untouched.
- **Registry-copy sub-case done, not skipped.** `scripts/kernel.sh` has no `REG`
  env override, but `ROOT`/`REG` derive from `BASH_SOURCE`, so a copy of the script
  beside a modified `registries/` answers against that data. The test uses that
  rather than skipping the proof.

`docs/specs/**`, `docs/strategy/**` and `docs/superpowers/specs/**` keep their
`routing-map` references: dated history, correct as of their dates.

The one-jq-pass lesson is general: `scripts/bench-runtime.sh` is sensitive enough to
catch a single added subprocess in a per-edit hook path. Run it before assuming a
refactor is performance-neutral.
