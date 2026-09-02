---
name: 2026-09-02-validator-checks
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-09-02-deepen-runtime-modules-design.md
domain: general
---

## What
Turned `scripts/validate-engineos.sh` from a 1134-line flat script into an 82-line
harness that discovers and runs `check_<id>()` functions living in
`scripts/checks/<family>.sh`. `--only` now targets an exact Check id (a parent id
also selects its letter-suffixed sub-checks), `--list` prints the discovered ids,
and `scripts/test-validate-engineos.sh` names the Check each planted breakage
belongs to instead of mapping a message phrase back to a group.

Check ids are unchanged and every `ok`/`bad` message string is byte-identical.

## Why
The validator was hot spot 2 of the runtime review: 1134 lines, 6 functions, 19
inline `if want CN` blocks. Three specific defects:

1. **A Check's contract was unstated, and included a phrase.** A Check had to emit
   a message that `test-validate-engineos.sh`'s `group_for` table could map back to
   a group. A missed phrase fell through to `echo all` — the case then ran every
   check, still went green for the wrong reason, and nobody could tell. The id is
   data on the case now, so a moved message fails loudly.
2. **The `--only` vocabulary was invented by the test suite.** `C3-4`, `C6-8`,
   `C9-11` existed nowhere else; `--only C4` or `--only C7` silently ran nothing.
   Those groups are gone, resolved to real ids.
3. **Sub-checks were unaddressable.** The comments labelled C17a..C17e, C18a..C18g,
   C21a..C21e, but a single `if want C17` gated all of them, so a failing sub-check
   could only be re-run by re-running its whole parent. The labels are ids now.

One latent defect fell out of the move: the capability/agent tier comparison
(old lines 339-346) sat inside the registry block but outside every `if want`
gate, so it ran whenever *any* of C14..C23 was selected and belonged to no id at
all. It is `C15b` now.

## Scope
- Harness: `scripts/validate-engineos.sh` (1134 -> 82 lines)
- New: `scripts/checks/lib.sh` + seven family files
- Suite: `scripts/test-validate-engineos.sh`
- CI: `.github/workflows/ci.yml` (shellcheck glob)
- Prose: `README.md`, `docs/CONTRIBUTING.md`
- Comments/globs pointing at the old layout: `hooks/test-docs.sh`,
  `scripts/run-evals.sh`

## Checklist
- [x] Harness: source `lib.sh`, then every other `scripts/checks/*.sh`; enumerate
      `check_*` via `declare -F`; sort by natural id order (C5 before C5b before C6,
      C17 before C17b)
- [x] `--list` prints the discovered ids one per line, exit 0
- [x] `--only` takes exact ids; a parent id also selects its letter-suffixed
      sub-checks; an unknown id goes to stderr and exits 2
- [x] Delete the `C3-4` / `C6-8` / `C9-11` range groups and the `REGISTRY_SELECTED`
      per-id `want` loop
- [x] Every Check body moved verbatim into a `check_<id>()` function
- [x] Assign the unowned capability/agent tier block an id (`C15b`)
- [x] Every family file under ~300 lines
- [x] `test-validate-engineos.sh`: delete `group_for`, add the leading Check-id
      argument to `case_`/`run_case`, tag all 79 cases with an exact id
- [x] Keep the parallel batch machinery and `ENGINEOS_TEST_JOBS`
- [x] Add harness cases: unknown `--only` id exits 2; `--list` matches the declared
      `check_*` functions; parent-selects-sub-checks; a planted Check function turns
      the unfiltered run red
- [x] Add `scripts/checks/*.sh` to the shellcheck line in `ci.yml`
- [x] Fix every reference that described the old internal layout
- [x] Prove verbatim movement, not just green output
- [x] Verification sweep, once, at the end

## What was made

**The harness (82 lines).** Keeps the shebang, `set -uo pipefail`, `ROOT`, arg
parsing, the `ok`/`bad` counters, the `== EngineOS integrity ==` banner, and the
summary line and exit code exactly as before. What is new is 20 lines: source the
families, enumerate `declare -F | sed -n 's/^declare -f check_//p'`, sort by
natural id order, validate `--only`, run the selection.

Natural id order is `sed -E 's/^(C[0-9]+)/\1:/' | sort -t: -k1.2,1n -k2,2`: the
numeric part numerically, the letter suffix lexically. That is what puts C5 before
C5b before C6, and C17 before C17b before C17e, so the run order (and therefore
the output order) is stable and readable.

Selection is `case ",$ONLY," in *",$1,"*` on the id, then the same on
`${1%%[a-z]*}` — the id with its letter suffix stripped. `--only C17` therefore
runs C17, C17b, C17c and C17e; `--only C17c` runs one Check. An `--only` token that
matches neither an id nor a parent is now `exit 2` on stderr; the flat script's
`want` returned false for it and ran nothing at all, which is how the test suite's
`group_for` fallthrough stayed invisible.

**`scripts/checks/lib.sh` (67 lines).** The registry and contract-surface paths,
`ALWAYS_ON` / `TASK_CONTRACT_RULES` / `RULE_NAMES` and their predicates,
`deferrals_of`, and `skip_once`.

`skip_once` is the one behavioural notion the split needed. In the flat script,
C14..C23 shared a single `if ! command -v jq` and each family shared one
`if [ -f "$X" ]`, so a missing precondition produced ONE `FAIL … skipped` line. Nine
independent functions would each report it. `skip_once <token> <message>` emits a
given message at most once per run, and the eight `have_*` predicates in the family
files (`have_jq`, `have_kernel_routing`, `have_router_inputs`, `have_router_agent`,
`have_handoff_inputs`, `have_change_record_inputs`, `have_repair_inputs`,
`have_telemetry_inputs`, `have_constitution_inputs`) wrap it. Same messages, same
count.

**Seven family files.** Grouped by what a Check reads, not by id range:

| File | Lines | Checks |
|---|---|---|
| `10-rules.sh` | 89 | C1, C2, C3, C5, C5b |
| `20-registries.sh` | 172 | C6, C7, C8, C14, C15, C15b |
| `30-agents-skills.sh` | 64 | C9, C10, C11, C12, C13 |
| `40-decision-registries.sh` | 238 | C16 |
| `50-kernel.sh` | 222 | C17, C17b, C17c, C17e, C18, C18b..C18g |
| `60-contracts.sh` | 205 | C19, C19b, C19c, C21, C21b, C21c, C21e |
| `70-runtime.sh` | 244 | C20, C20b, C20c, C20d, C22, C22b, C22c, C23, C23c |

Two deviations from the split the brief suggested, both forced by the ~300-line
ceiling and by what the code turned out to be:

- **C16 gets its own file.** It is 223 lines on its own — models.json, intents.json
  and policy.json plus the cross-registry and prose-mirror assertions between them.
  Putting it in `20-registries.sh` would have made that file ~400 lines. It also
  does not decompose further without inventing ids: an intent's `rules[]` is checked
  against its routing domain, and a prose number against its registry field, so the
  assertions cross file lines by design.
- **C20/C22/C23 share `70-runtime.sh` rather than a `40-kernel.sh` / `50-contracts.sh`
  pair.** C20 (repair loop), C22 (telemetry) and C23 (constitution mirrors) check
  the runtime's own policy plumbing; C19 and C21 are both template-vs-registry
  section contracts and read naturally together. Numeric prefixes only fix glob
  order — the harness sorts by id regardless.

Every function body is the old section's code, re-indented to a 2-space base and
nothing else. Where the flat script's sub-blocks shared a local, the value is
re-derived rather than the logic rewritten:

- C6/C7/C8 and C9/C10/C11 each emitted one `ok` line off a shared scan. The scan is
  now `scan_guidance_targets` / `scan_agent_contracts` in the family file and each
  Check emits its own verdict line, unchanged.
- C20b and C20c used `maxfix`/`esc`, which C20a computed. `repair_bound <field>`
  prints the value only when it is a non-negative integer — exactly how C20a blanks
  it — so the two Checks read the registry instead of a sibling's variable. C20a
  keeps its own validation and messages.
- C21c used `sxp`, which C21a computed; C21c re-reads the pattern in one line.

Three groupings stayed joined because splitting them would have changed the output:
C3 is one verdict over both halves of the old `C3/C4` comment; C19b emits three ok
lines from one labelled block; C23a and C23b accumulate into a single `c_bad` and
one verdict.

**The suite.** `group_for` is deleted. `case_` and `run_case` take the Check id as
their first argument and `run_case` calls `--only "$id"`, so every case now
exercises exactly the Check it plants breakage for. The parallel batch machinery,
`ENGINEOS_TEST_JOBS` and all 79 cases are intact; the ids were derived from the
Check that emits each expected message, with the old ranges resolved (`C3-4` -> C3,
`C6-8` -> C6, `C9-11` -> C9/C10/C11) and sub-checks addressed directly (C17b, C17c,
C17e, C18b..C18f, C19b, C19c, C20b..C20d, C21b, C21c, C21e, C22b, C22c, C23c).

Two cases moved id, correctly: "route capability repointed at a nonexistent agent"
expects `capabilities.json names missing agents`, which C15 owns, not C18; "a
routing domain deleted out from under its intent FK" expects
`intent/routing mismatches`, which C16 owns.

Four harness assertions were added ahead of the negative cases, because discovery
is the harness's whole job and a Check nobody runs is worse than no Check:

1. `--list` equals the set of `^check_C*` functions declared under `scripts/checks/`.
2. `--only` with an id no Check answers to exits 2 with `unknown check id`.
3. `--only C17` emits more ok lines than `--only C17c`, `--only C17c` emits exactly
   one, and the parent's output contains the child's line.
4. A `check_C99()` planted into a family file in a throwaway copy is discovered and
   turns the unfiltered run red.

## Verification
Run once, at the end. All green:

```
shellcheck -S error hooks/*.sh install.sh scripts/*.sh scripts/checks/*.sh   rc=0
bash scripts/validate-engineos.sh          passed 88, failed 0
bash scripts/validate-engineos.sh --list   44 ids, C1..C23c
bash scripts/validate-engineos.sh --only C17    passed 4, failed 0
bash scripts/validate-engineos.sh --only C17c   passed 1, failed 0
bash scripts/validate-engineos.sh --only C99    rc=2, "unknown check id: C99"
bash scripts/test-validate-engineos.sh     passed 83, failed 0  (79 cases + 4 harness)
bash hooks/test-docs.sh                    pass=190 fail=0
bash hooks/test-governance.sh              pass=15  fail=0
bash scripts/bench-runtime.sh              5 of 5 budgets ok
```

`bench-runtime.sh` medians, for the record — the validator is not in a hook path,
and nothing regressed:

```
route-intent                     39.8ms  budget<250ms
resolve-task                    177.8ms  budget<500ms
prompt-advisor (end to end)     372.0ms  budget<600ms
route-before-change (cache hit)  78.0ms  budget<150ms
always-on context                26457 bytes  budget<32000
```

**Whole-output equivalence.** The strongest single check: the old script and the
new harness produce the same 88 lines. Run order differs (C13 moved from last to
its numeric position), so the comparison is sorted:

```
git show 4e67fdc:scripts/validate-engineos.sh > scripts/zz-old.sh
bash scripts/zz-old.sh > /tmp/old.txt; bash scripts/validate-engineos.sh > /tmp/new.txt
rm scripts/zz-old.sh
sort /tmp/old.txt > /tmp/old.s; sort /tmp/new.txt > /tmp/new.s; diff /tmp/old.s /tmp/new.s
```

Result: no differences.

(`zz-old.sh` has to sit inside `scripts/` because the old script derives `ROOT`
from `dirname $0/..`.)

## Verbatim-move proof
Two parts, both rerunnable from the repo root.

**1. Every `ok`/`bad` message literal is unchanged.** These are the strings CI and
the negative suite match on, so drift here is the failure mode that matters. A
family's shared-precondition message goes through `skip_once` now, so it is
normalised back to `bad "…"`:

```bash
lits() { { grep -hoE '\b(ok|bad) +"[^"]*"' "$@"
           grep -hoE 'skip_once +[a-z-]+ +"[^"]*"' "$@" | sed -E 's/^skip_once +[a-z-]+ +/bad /'
         } | grep -vxF 'bad "$message"' | sort; }
git show 4e67fdc:scripts/validate-engineos.sh > /tmp/old.sh
diff <(lits /tmp/old.sh) <(lits scripts/validate-engineos.sh scripts/checks/*.sh)
```

Result: identical, 196 literals.

**2. Every Check body matches the exact line range it moved from.** For each id,
extract the new function body, drop the `<skip>` prologue lines the move added at
the top (the `have_*` guards, and `repair_bound`/`sxp` where a sibling's local was
re-derived), strip leading whitespace from both sides, and diff:

```bash
check_body() {  # check_body <id> <skip>
  awk -v f="check_$1() {" '$0==f{i=1;next} i&&$0=="}"{exit} i{print}' scripts/checks/*.sh \
    | sed 's/^[[:space:]]*//' | tail -n "+$(( $2 + 1 ))"
}
old_body() {    # old_body <from> <to>   ("if want CN; then" was the old per-Check gate)
  sed -n "$1,$2p" /tmp/old.sh | sed 's/^[[:space:]]*//' | grep -Ev '^if want '
}
# id:from:to:skip
for e in C1:48:52:0 C2:57:64:0 C3:69:77:0 C5:94:122:0 C5b:129:138:0 \
         C6:160:160:1 C7:161:161:1 C8:162:162:1 C9:187:187:1 C10:188:188:1 \
         C11:189:189:1 C12:194:203:0 C13:1125:1129:0 C14:226:300:1 C15:308:333:1 \
         C15b:340:345:2 C16:356:578:1 C17:589:598:2 C17b:600:608:2 C17c:610:619:2 \
         C17e:621:631:2 C18:646:660:2 C18b:665:670:3 C18c:672:679:3 C18d:684:707:2 \
         C18e:709:729:2 C18f:731:738:2 C18g:740:751:2 C19:765:774:2 C19b:776:797:2 \
         C19c:799:811:2 C20:826:846:2 C20b:848:861:4 C20c:863:877:3 C20d:879:886:2 \
         C21:903:926:2 C21b:928:945:2 C21c:947:986:4 C21e:988:998:2 C22:1011:1029:2 \
         C22b:1031:1047:2 C22c:1049:1077:2 C23:1091:1108:2 C23c:1110:1115:2; do
  IFS=: read -r id f t s <<<"$e"
  diff <(old_body "$f" "$t") <(check_body "$id" "$s") >/dev/null \
    && echo "verbatim $id" || { echo "DRIFT $id"; diff <(old_body "$f" "$t") <(check_body "$id" "$s"); }
done
```

Result: all 44 bodies verbatim. Line ranges are against
`4e67fdc:scripts/validate-engineos.sh`; the `<skip>` column is the honest count of
lines the move added, and it is 0 for every Check in `10-rules.sh` and for C12/C13.

## Changes registered

`git diff --stat` for this change's single commit:

```
 .engineos/changes/2026-09-02-validator-checks.md |  343 +++++++
 .github/workflows/ci.yml                         |    2 +-
 README.md                                        |   11 +-
 docs/CONTRIBUTING.md                             |    7 +-
 hooks/test-docs.sh                               |    6 +-
 scripts/checks/10-rules.sh                       |   89 ++
 scripts/checks/20-registries.sh                  |  172 ++++
 scripts/checks/30-agents-skills.sh               |   64 ++
 scripts/checks/40-decision-registries.sh         |  238 +++++
 scripts/checks/50-kernel.sh                      |  222 +++++
 scripts/checks/60-contracts.sh                   |  205 ++++
 scripts/checks/70-runtime.sh                     |  244 +++++
 scripts/checks/lib.sh                            |   67 ++
 scripts/run-evals.sh                             |    2 +-
 scripts/test-validate-engineos.sh                |  256 ++---
 scripts/validate-engineos.sh                     | 1152 +---------------------
 16 files changed, 1858 insertions(+), 1222 deletions(-)
```

Movements: no `git mv`. `scripts/checks/*.sh` are new files whose content is moved
code (git records them as additions, not renames, because the source file survives
as the harness).

**Size against the 400-line PR cap (`rules/git.md`):**

| Count | Added | Deleted | Total |
|---|---|---|---|
| Raw | 1858 | 1222 | 3080 |
| Excluding this change record | 1515 | 1222 | 2737 |
| Net new surface (harness + lib.sh + family headers) | ~230 | — | ~230 |

Over the cap, and the spec's PR4 row names it: this is a mechanical move, so the
raw number is ~1100 lines of code appearing in a new place and disappearing from
the old one. The reviewable surface is the 82-line harness, the 67-line `lib.sh`,
the family headers, and the ~90 added prologue/guard lines — the rest is proven
byte-identical by the two commands above, which is what makes the raw figure
reviewable at all.

## Notes
Judgement calls the brief left open:

- **`C3-4` resolved to `C3`, not split.** The block is one loop emitting one
  verdict (`all rules/*.md cross-references resolve`); there is no seam between a
  "C3" and a "C4" concern in the code. Splitting it would have invented a second
  message. `C4` is simply not an id; the section comment records that C3 covers
  both halves of the old pair.
- **`C17d` stays deleted** (PR3 removed it). There is no `check_C17d`; `--only C17`
  runs C17, C17b, C17c, C17e.
- **`docs/COMPATIBILITY.md` untouched.** Its public-surface table lists rule paths,
  agent names, aliases, command names, skill directories, the `hooks.json` event
  contract, registry top-level shape and the return envelope. A script's CLI is not
  on it, and it explicitly frees "test files" and "hook internals" — so the `--only`
  vocabulary change needs no deprecation note. Consumers do not invoke
  `validate-engineos.sh --only`; CI invokes it unfiltered.
- **`CLAUDE.md` untouched.** Its two mentions ("`scripts/validate-engineos.sh`
  checks both halves of this rule", "fails CI if the table and the registry
  disagree") describe what the validator checks, not how it is laid out, and both
  are still true. Editing `CLAUDE.md` would also have meant re-baselining C16's
  prose-row count and C23's mirror checks for no gain.
- **`hooks/test-docs.sh` gained `scripts/checks/*.sh` in `REFSCAN`.** The
  orphan checks treat `hooks/*.sh` and `scripts/*.sh` as the executable layer that
  can make an agent or skill "reachable". Moving ~1100 lines out of `scripts/*.sh`
  would silently shrink that corpus, so the new directory joins it. Adding files to
  `REFSCAN` can only make an orphan check pass, never fail — it is not hiding
  anything. Its family-2 comment also stopped saying `C6-8`, an id that no longer
  exists.
- **`README.md` now says 44 Checks, not 23.** 23 was the count of `if want CN`
  blocks; `--list` says 44. The stale "16 planted-breakage cases" line (there were
  79) was replaced with a description rather than a number that rots again.
- **No Check logic was touched.** C15b is a new id over code that already ran; it
  changes nothing about what is asserted. Anything a Check ought to check better is
  a separate change.
